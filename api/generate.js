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
    const initRes = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
      method: 'POST',
      headers: { 'Authorization': 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: 'image/jpeg', file_name: 'photo.jpg' })
    });
    const initText = await initRes.text();
    if (!initRes.ok) throw new Error('Error iniciando upload: ' + initText);
    const { upload_url, file_url } = JSON.parse(initText);

    const imgBuffer = Buffer.from(imageBase64, 'base64');
    const putRes = await fetch(upload_url, {
      method: 'PUT',
      body: imgBuffer,
      headers: { 'Content-Type': 'image/jpeg' }
    });
    if (!putRes.ok) throw new Error('Error subiendo imagen al storage');

    // 2. Construir payload — si hay color específico hacemos DOS llamadas:
    //    primero el corte, luego el color. Si solo hay color, solo una llamada de color.
    const falColor = hairColor && hairColor !== 'natural' ? hairColor : null;

    // Primera llamada: cambio de corte
    const falPayload = {
      image_url: file_url,
      target_hairstyle: hairstyle,
      hair_color: hairColor || 'natural'
    };

    const falRes = await fetch('https://fal.run/fal-ai/image-apps-v2/hair-change', {
      method: 'POST',
      headers: { 'Authorization': 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(falPayload)
    });
    const falText = await falRes.text();
    if (!falText || falText.trim() === '') throw new Error('fal.ai no devolvió respuesta');
    const falData = JSON.parse(falText);
    if (!falRes.ok) throw new Error(falData.detail || falData.message || 'Error fal.ai: ' + falRes.status);
    let resultUrl = falData.image?.url || falData.images?.[0]?.url || falData.image_url;
    if (!resultUrl) throw new Error('fal.ai no devolvió URL de imagen');

    // Si hay color especial, hacer segunda llamada solo de color sobre el resultado anterior
    if (falColor) {
      try {
        const falRes2 = await fetch('https://fal.run/fal-ai/image-apps-v2/hair-change', {
          method: 'POST',
          headers: { 'Authorization': 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: resultUrl,
            target_hairstyle: hairstyle,
            hair_color: falColor
          })
        });
        const falText2 = await falRes2.text();
        if (falRes2.ok && falText2) {
          const falData2 = JSON.parse(falText2);
          const url2 = falData2.image?.url || falData2.images?.[0]?.url || falData2.image_url;
          if (url2) resultUrl = url2;
        }
      } catch(e) { /* si falla el color usamos el resultado del corte */ }
    }

    // 3. Análisis con Claude (opcional)
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
              { type: 'text', text: `Eres estilista profesional. Analiza esta foto y da consejos sobre el estilo "${styleLabel}"${falColor ? ` con color de pelo ${falColor}` : ''}. Responde SOLO JSON sin texto extra:\n{"instrucciones":"frase exacta para decirle al peluquero","tips":["tip1","tip2","tip3"],"compatibilidad":8}` }
            ]}]
          })
        });
        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const claudeText = claudeData.content?.find(c => c.type === 'text')?.text || '';
          analysis = JSON.parse(claudeText.replace(/```json|```/g, '').trim());
        }
      } catch (e) { /* Claude es opcional */ }
    }

    return res.status(200).json({ success: true, resultUrl, analysis });
  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}      method: 'POST',
      headers: { 'Authorization': 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: file_url, target_hairstyle: hairstyle, hair_color: 'natural' })
    });
    const falText = await falRes.text();
    if (!falText || falText.trim() === '') throw new Error('fal.ai no devolvió respuesta');
    const falData = JSON.parse(falText);
    if (!falRes.ok) throw new Error(falData.detail || falData.message || 'Error fal.ai: ' + falRes.status);
    const resultUrl = falData.image?.url || falData.images?.[0]?.url || falData.image_url;
    if (!resultUrl) throw new Error('fal.ai no devolvió URL de imagen');

    // 3. Análisis con Claude (opcional)
    let analysis = { instrucciones: 'Muestra esta imagen a tu peluquero como referencia exacta.', tips: ['Lleva esta foto al peluquero', 'Pregunta por el mantenimiento', 'Pide una prueba antes del corte definitivo'] };
    if (ANTHROPIC_KEY && styleLabel) {
      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514', max_tokens: 500,
            messages: [{ role: 'user', content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: `Eres estilista profesional. Mira esta foto y da consejos sobre el estilo ${styleLabel}. Responde SOLO JSON sin texto extra:\n{"instrucciones":"frase exacta para decirle al peluquero","tips":["tip1","tip2","tip3"],"compatibilidad":8}` }
            ]}]
          })
        });
        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const claudeText = claudeData.content?.find(c => c.type === 'text')?.text || '';
          analysis = JSON.parse(claudeText.replace(/```json|```/g, '').trim());
        }
      } catch (e) { /* Claude es opcional */ }
    }

    return res.status(200).json({ success: true, resultUrl, analysis });
  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
