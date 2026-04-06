export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const FAL_KEY = process.env.FAL_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    const { imageBase64, hairstyle, hairColor, styleLabel, genero, salonId, beard } = req.body;
    if (!imageBase64 || !hairstyle) return res.status(400).json({ error: 'Faltan parámetros' });

    // Verificar límite del salón
    if (salonId) {
      const sr = await fetch(`${SUPABASE_URL}/rest/v1/salones?id=eq.${salonId}&select=generaciones_mes,generaciones_limite,plan,mes_actual`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      const sdata = await sr.json();
      if (sdata && sdata.length > 0) {
        const salon = sdata[0];
        const mesActual = new Date().toISOString().slice(0, 7);
        const genMes = salon.mes_actual !== mesActual ? 0 : salon.generaciones_mes;
        if (genMes >= salon.generaciones_limite) {
          return res.status(402).json({ error: 'LIMITE_ALCANZADO', plan: salon.plan, mensaje: salon.plan === 'trial' ? `Has usado las ${salon.generaciones_limite} generaciones gratuitas.` : `Has agotado tus ${salon.generaciones_limite} generaciones de este mes. Se renuevan el día 1.` });
        }
      }
    }

    // 1. Subir imagen a fal.ai
    let file_url;
    try {
      const initRes = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
        method: 'POST',
        headers: { 'Authorization': 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: 'image/jpeg', file_name: 'photo.jpg' })
      });
      const initText = await initRes.text();
      if (!initRes.ok) throw new Error('Upload error ' + initRes.status + ': ' + initText.substring(0, 200));
      const initData = JSON.parse(initText);
      file_url = initData.file_url;
      const imgBuffer = Buffer.from(imageBase64, 'base64');
      const putRes = await fetch(initData.upload_url, { method: 'PUT', body: imgBuffer, headers: { 'Content-Type': 'image/jpeg' } });
      if (!putRes.ok) throw new Error('PUT error ' + putRes.status);
    } catch(e) { return res.status(500).json({ error: 'Error subiendo imagen: ' + e.message }); }

    // 2. Generar con fal.ai
    const falColor = (hairColor && hairColor !== 'natural') ? hairColor : 'natural';
    let resultUrl;
    try {
      const falRes = await fetch('https://fal.run/fal-ai/image-apps-v2/hair-change', {
        method: 'POST',
        headers: { 'Authorization': 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: file_url, target_hairstyle: hairstyle, hair_color: falColor })
      });
      const falText = await falRes.text();
      if (!falText || falText.trim() === '') throw new Error('fal.ai respuesta vacía');
      let falData;
      try { falData = JSON.parse(falText); } catch(e) { throw new Error('fal.ai no es JSON: ' + falText.substring(0, 200)); }
      if (!falRes.ok) throw new Error('fal.ai ' + falRes.status + ': ' + (falData.detail || falData.message || ''));
      resultUrl = falData.image?.url || falData.images?.[0]?.url || falData.image_url;
      if (!resultUrl) throw new Error('fal.ai sin URL. Respuesta: ' + JSON.stringify(falData).substring(0, 200));
    } catch(e) { return res.status(500).json({ error: 'Error generando imagen: ' + e.message }); }

    // 3. Segunda pasada de color si es especial
    if (falColor !== 'natural') {
      try {
        const r2 = await fetch('https://fal.run/fal-ai/image-apps-v2/hair-change', {
          method: 'POST',
          headers: { 'Authorization': 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: resultUrl, target_hairstyle: hairstyle, hair_color: falColor })
        });
        if (r2.ok) { const d2 = await r2.json(); const u2 = d2.image?.url || d2.images?.[0]?.url; if (u2) resultUrl = u2; }
      } catch(e) {}
    }

    // 4. Registrar generación y actualizar contador
    if (salonId) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/generaciones`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ salon_id: salonId, estilo: styleLabel || hairstyle, genero: genero || 'desconocido', color_pelo: hairColor || 'natural' })
        });
        await fetch(`${SUPABASE_URL}/rest/v1/salones?id=eq.${salonId}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ generaciones_mes: { raw: 'generaciones_mes + 1' } })
        });
        // Incrementar con RPC
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/incrementar_generaciones`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ salon_id_param: salonId })
        });
      } catch(e) {}
    }

    // 5. Análisis Claude (opcional)
    let analysis = { instrucciones: 'Muestra esta imagen a tu peluquero como referencia exacta.', tips: ['Lleva esta foto al peluquero', 'Pregunta por el mantenimiento', 'Pide una prueba antes del corte definitivo'] };
    if (ANTHROPIC_KEY && styleLabel) {
      try {
        const cr = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', max_tokens: 200,
            messages: [{ role: 'user', content: [
              { type: 'text', text: `Eres estilista. Estilo: "${styleLabel}"${falColor !== 'natural' ? `, color: ${falColor}` : ''}. Responde SOLO JSON sin explicaciones: {"instrucciones":"frase corta para el peluquero max 15 palabras","tips":["tip1","tip2","tip3"]}` }
            ]}]
          })
        });
        if (cr.ok) { const cd = await cr.json(); const ct = cd.content?.find(c => c.type === 'text')?.text || ''; analysis = JSON.parse(ct.replace(/```json|```/g, '').trim()); }
      } catch(e) {}
    }

    return res.status(200).json({ success: true, resultUrl, analysis });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
