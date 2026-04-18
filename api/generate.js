export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const OPENAI_KEY = process.env.OPENAI_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    const { imageBase64, hairstyle, hairColor, styleLabel, genero, salonId } = req.body;
    if (!imageBase64 || !hairstyle) return res.status(400).json({ error: 'Faltan parámetros' });

    // 1. Verificar límite del salón
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

    // 2. Convertir imagen a PNG usando canvas-like approach
    // La imagen viene en base64, puede ser JPEG o PNG
    // Necesitamos enviarla como PNG para gpt-image-1
    const imgBuffer = Buffer.from(imageBase64, 'base64');

    // 3. Construir prompt
    const colorDesc = (hairColor && hairColor !== 'natural') ? `, hair color: ${hairColor}` : '';
    const prompt = `Change only the hairstyle of the person in this photo to: ${styleLabel || hairstyle}${colorDesc}. Keep the face, skin tone, eyes, facial features, background and everything else exactly identical. Only the hair should change. Make it look photorealistic and natural.`;

    // 4. Generar con GPT Image 1 edits endpoint
    let resultUrl;
    try {
      const boundary = 'CortIABoundary' + Date.now();
      const CRLF = '\r\n';

      // Detectar si es PNG o JPEG por los magic bytes
      const isPNG = imgBuffer[0] === 0x89 && imgBuffer[1] === 0x50;
      const mimeType = isPNG ? 'image/png' : 'image/jpeg';
      const fileName = isPNG ? 'photo.png' : 'photo.jpeg';

      const parts = [];
      parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="model"${CRLF}${CRLF}gpt-image-1.5${CRLF}`));
      parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="prompt"${CRLF}${CRLF}${prompt}${CRLF}`));
      parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="size"${CRLF}${CRLF}1024x1024${CRLF}`));
      parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="input_fidelity"${CRLF}${CRLF}high${CRLF}`));
      parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="image"; filename="${fileName}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`));
      parts.push(imgBuffer);
      parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

      const body = Buffer.concat(parts);

      const openaiRes = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + OPENAI_KEY,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
      });

      const openaiData = await openaiRes.json();
      if (!openaiRes.ok) throw new Error('OpenAI: ' + (openaiData.error?.message || JSON.stringify(openaiData).substring(0, 400)));

      if (openaiData.data?.[0]?.b64_json) {
        resultUrl = 'data:image/png;base64,' + openaiData.data[0].b64_json;
      } else if (openaiData.data?.[0]?.url) {
        resultUrl = openaiData.data[0].url;
      } else {
        throw new Error('Sin imagen en respuesta: ' + JSON.stringify(openaiData).substring(0, 200));
      }
    } catch(e) { return res.status(500).json({ error: 'Error generando imagen: ' + e.message }); }

    // 5. Registrar generación
    if (salonId) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/generaciones`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ salon_id: salonId, estilo: styleLabel || hairstyle, genero: genero || 'desconocido', color_pelo: hairColor || 'natural' })
        });
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/incrementar_generaciones`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ salon_id_param: salonId })
        });
      } catch(e) {}
    }

    // 6. Análisis Claude (opcional)
    let analysis = { instrucciones: 'Muestra esta imagen a tu peluquero como referencia exacta.', tips: ['Lleva esta foto al peluquero', 'Pregunta por el mantenimiento', 'Pide una prueba antes del corte definitivo'] };
    if (ANTHROPIC_KEY && styleLabel) {
      try {
        const cr = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001', max_tokens: 200,
            messages: [{ role: 'user', content: [{ type: 'text', text: `Eres estilista. Estilo: "${styleLabel}"${hairColor && hairColor !== 'natural' ? `, color: ${hairColor}` : ''}. Responde SOLO JSON sin explicaciones: {"instrucciones":"frase corta para el peluquero max 15 palabras","tips":["tip1","tip2","tip3"]}` }]}]
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
