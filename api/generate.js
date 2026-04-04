export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const FAL_KEY = process.env.FAL_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

  if (!FAL_KEY) return res.status(500).json({ error: 'FAL_KEY no configurada en Vercel' });

  try {
    const { imageBase64, hairstyle, hairColor, styleLabel } = req.body;
    if (!imageBase64 || !hairstyle) return res.status(400).json({ error: 'Faltan parámetros' });

    // 1. Subir imagen a fal.ai storage
    let file_url;
    try {
      const initRes = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
        method: 'POST',
        headers: { 'Authorization': 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: 'image/jpeg', file_name: 'photo.jpg' })
      });
      const initText = await initRes.text();
      if (!initRes.ok) throw new Error('Upload initiate error ' + initRes.status + ': ' + initText.substring(0, 200));
      const initData = JSON.parse(initText);
      file_url = initData.file_url;
      const upload_url = initData.upload_url;

      const imgBuffer = Buffer.from(imageBase64, 'base64');
      const putRes = await fetch(upload_url, {
        method: 'PUT',
        body: imgBuffer,
        headers: { 'Content-Type': 'image/jpeg' }
      });
      if (!putRes.ok) throw new Error('PUT upload error ' + putRes.status);
    } catch(uploadErr) {
      return res.status(500).json({ error: 'Error subiendo imagen: ' + uploadErr.message });
    }

    // 2. Primera llamada fal.ai — corte + color juntos
    const falColor = (hairColor && hairColor !== 'natural') ? hairColor : 'natural';

    let resultUrl;
    try {
      const falRes = await fetch('https://fal.run/fal-ai/image-apps-v2/hair-change', {
        method: 'POST',
        headers: { 'Authorization': 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: file_url,
          target_hairstyle: hairstyle,
          hair_color: falColor
        })
      });
      const falText = await falRes.text();
      if (!falText || falText.trim() === '') throw new Error('fal.ai devolvió respuesta vacía');
      let falData;
      try { falData = JSON.parse(falText); }
      catch(e) { throw new Error('fal.ai respuesta no es JSON: ' + falText.substring(0, 300)); }
      if (!falRes.ok) throw new Error('fal.ai error ' + falRes.status + ': ' + (falData.detail || falData.message || falText.substring(0,200)));
      resultUrl = falData.image?.url || falData.images?.[0]?.url || falData.image_url;
      if (!resultUrl) throw new Error('fal.ai no devolvió URL. Respuesta: ' + JSON.stringify(falData).substring(0,300));
    } catch(falErr) {
      return res.status(500).json({ error: 'Error generando imagen: ' + falErr.message });
    }

    // 3. Segunda llamada opcional — aplicar color encima si es especial
    if (falColor !== 'natural') {
      try {
        const falRes2 = await fetch('https://fal.run/fal-ai/image-apps-v2/hair-change', {
          method: 'POST',
          headers: { 'Authorization': 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_url: resultUrl, target_hairstyle: hairstyle, hair_color: falColor })
        });
        if (falRes2.ok) {
          const t2 = await falRes2.text();
          if (t2) {
            const d2 = JSON.parse(t2);
            const u2 = d2.image?.url || d2.images?.[0]?.url || d2.image_url;
            if (u2) resultUrl = u2;
          }
        }
      } catch(e) { /* segunda pasada opcional, ignorar error */ }
    }

    // 4. Análisis con Claude (opcional)
    let analysis = {
      instrucciones: 'Muestra esta imagen a tu peluquero como referencia exacta.',
      tips: ['Lleva esta foto al peluquero', 'Pregunta por el mantenimiento', 'Pide una prueba antes del corte definitivo']
    };
    if (ANTHROPIC_KEY && styleLabel) {
      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514', max_tokens: 500,
            messages: [{ role: 'user', content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: `Eres estilista profesional. Analiza esta foto y da consejos sobre el estilo "${styleLabel}"${falColor !== 'natural' ? ` con color ${falColor}` : ''}. Responde SOLO JSON:\n{"instrucciones":"frase para el peluquero","tips":["tip1","tip2","tip3"],"compatibilidad":8}` }
            ]}]
          })
        });
        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const claudeText = claudeData.content?.find(c => c.type === 'text')?.text || '';
          analysis = JSON.parse(claudeText.replace(/```json|```/g, '').trim());
        }
      } catch (e) { /* Claude opcional */ }
    }

    return res.status(200).json({ success: true, resultUrl, analysis });

  } catch (err) {
    console.error('Error general:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
