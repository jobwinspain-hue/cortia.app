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

  // Mapa de estilos con valor fal UNICO -> usar endpoint v2 con target_hairstyle
  const FAL_UNIQUE = ['short_hair','medium_long_hair','long_hair','curly_hair','wavy_hair',
    'high_ponytail','bun','bob_cut','pixie_cut','braids','straight_hair','afro',
    'dreadlocks','buzz_cut','mohawk','bangs','side_part','middle_part'];

  // Mapa de prompts descriptivos para estilos que necesitan prompt libre
  const STYLE_PROMPTS = {
    // HOMBRE
    'undercut': 'undercut hairstyle, shaved sides, long hair on top styled upward',
    'fade': 'fade haircut, gradual taper from skin to longer hair on top',
    'pompadour': 'pompadour hairstyle, voluminous hair swept upward and back',
    'buzz': 'buzz cut, very short uniform hair all over head',
    'quiff': 'quiff hairstyle, hair brushed upward and backward from forehead with volume',
    'slickback': 'slick back hairstyle, hair combed straight back with gel, very clean',
    'curtains': 'curtains hairstyle 90s style, middle part with hair falling to sides',
    'textured': 'textured crop hairstyle, short messy natural texture on top',
    'mullet': 'mullet hairstyle, short on top and sides, long in the back',
    'mohawk': 'mohawk hairstyle, shaved sides with strip of hair in the middle',
    'sidepart': 'side part hairstyle, clean deep side part combed to one side',
    'fringe': 'fringe hairstyle, straight fringe bangs covering forehead',
    'long': 'long flowing hair past shoulders, natural and loose',
    'dreadlocks': 'dreadlocks hairstyle, thick rope-like hair strands',
    'bun_m': 'man bun hairstyle, hair pulled back into a bun at top of head',
    'french_crop': 'french crop haircut, short textured top with skin fade sides and fringe',
    'caesar': 'caesar cut, short horizontal fringe with uniform length all over',
    'ivy_league': 'ivy league haircut, clean side part with slight pompadour, preppy style',
    'taper': 'taper haircut, gradually shorter hair from top to neck, clean lines',
    'waves': '360 waves hairstyle, rippling wave pattern close to scalp on black hair',
    'afro_m': 'afro hairstyle, large rounded natural curly hair',
    'cornrows': 'cornrows hairstyle, tightly braided rows close to scalp',
    'bowl': 'bowl cut hairstyle, straight fringe all around head like a bowl shape',
    'edgar': 'edgar cut hairstyle, straight blunt fringe with skin fade sides, sharp line',
    'rapado': 'completely shaved head, bald or near-bald look',
    'rapado_dis': 'buzz cut with shaved design pattern on the side',
    'calvo': 'completely bald shaved head',
    // MUJER
    'bob': 'bob haircut, chin length blunt cut all around',
    'lob': 'lob hairstyle, long bob just below shoulders',
    'pixie': 'pixie cut, very short feminine haircut with soft layers',
    'layers': 'layered haircut with movement and volume, multiple lengths',
    'bangs': 'straight blunt bangs with longer hair',
    'wolf': 'wolf cut hairstyle, shaggy layers with curtain bangs, lots of volume and texture',
    'curtainbangs': 'curtain bangs, middle part bangs that frame the face',
    'bun': 'high bun hairstyle, hair pulled up into neat bun on top',
    'straight': 'straight sleek hair, perfectly smooth and glossy',
    'curly': 'natural curly hair, defined spiral curls',
    'ponytail': 'high ponytail, hair pulled back tightly into high ponytail',
    'braids': 'two braids hairstyle, loose bohemian braids',
    'shag': 'shag haircut, 70s style with lots of layers and flicks',
    'long_w': 'long flowing hair well past shoulders, classic and elegant',
    'afro_w': 'natural afro hairstyle, large rounded voluminous curls',
    'french_bob': 'french bob, short blunt bob with straight fringe, parisian style',
    'bixie': 'bixie cut, between bob and pixie, textured and modern',
    'octopus': 'octopus haircut, long layers with shorter choppy layers on top',
    'butterfly': 'butterfly cut, face-framing layers with wispy lightweight ends',
    'blowout': 'blowout hairstyle, voluminous bouncy hair blown out with round brush',
    'melena_flequillo': 'long hair with straight blunt fringe bangs',
    'recogido_bajo': 'low bun hairstyle, elegant low chignon at nape of neck',
    'halfup': 'half up half down hairstyle, top section pulled back rest left loose',
    'trenza_fr': 'french braid, classic french braid starting from crown',
    'beach_waves': 'beach waves hairstyle, loose natural tousled waves',
    'rapada_w': 'buzzed pixie cut, very short buzz cut feminine style',
    'cornrows_w': 'cornrows with long hair, braided rows with flowing ends',
    'space_buns': 'space buns hairstyle, two buns on top sides of head',
    // NEUTRO
    'buzz_n': 'buzz cut very short uniform hair',
    'textured_n': 'textured natural hair with definition',
    'pixie_n': 'pixie cut short and textured',
    'mohawk_n': 'mohawk shaved sides strip of hair in middle',
    'wolf_n': 'wolf cut shaggy layers with volume',
    'braids_n': 'braided hairstyle with defined braids',
    'bob_n': 'geometric bob haircut clean lines',
    'afro_n': 'large natural afro hairstyle',
    'dread_n': 'dreadlocks thick rope strands',
    'shag_n': 'shag haircut with lots of layers',
    'long_n': 'long natural flowing hair',
    'ponytail_n': 'sleek high ponytail',
  };

  try {
    const { imageBase64, hairstyle, hairColor, styleLabel, genero, salonId } = req.body;
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
          return res.status(402).json({ error: 'LIMITE_ALCANZADO', plan: salon.plan });
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
      const stylePrompt = STYLE_PROMPTS[hairstyle];
      const isUniqueVal = FAL_UNIQUE.includes(hairstyle);

      let falBody, endpoint;

      if (isUniqueVal && !stylePrompt) {
        // Usar endpoint v2 con target_hairstyle (valores únicos sin prompt)
        endpoint = 'https://fal.run/fal-ai/image-apps-v2/hair-change';
        falBody = { image_url: file_url, target_hairstyle: hairstyle, hair_color: falColor };
      } else if (stylePrompt) {
        // Usar endpoint con prompt libre para resultados únicos
        const colorText = falColor !== 'natural' ? `, ${falColor} hair color` : '';
        endpoint = 'https://fal.run/fal-ai/image-editing/hair-change';
        falBody = {
          image_url: file_url,
          prompt: stylePrompt + colorText,
          guidance_scale: 4.0,
          num_inference_steps: 30,
          safety_tolerance: '3'
        };
      } else {
        // Fallback
        endpoint = 'https://fal.run/fal-ai/image-apps-v2/hair-change';
        falBody = { image_url: file_url, target_hairstyle: 'short_hair', hair_color: falColor };
      }

      const falRes = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': 'Key ' + FAL_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(falBody)
      });
      const falText = await falRes.text();
      if (!falText || falText.trim() === '') throw new Error('fal.ai respuesta vacía');
      let falData;
      try { falData = JSON.parse(falText); } catch(e) { throw new Error('fal.ai no es JSON: ' + falText.substring(0, 200)); }
      if (!falRes.ok) throw new Error('fal.ai ' + falRes.status + ': ' + (falData.detail || falData.message || JSON.stringify(falData).substring(0,200)));
      resultUrl = falData.image?.url || falData.images?.[0]?.url || falData.image_url;
      if (!resultUrl) throw new Error('fal.ai sin URL. Respuesta: ' + JSON.stringify(falData).substring(0, 200));
    } catch(e) { return res.status(500).json({ error: 'Error generando imagen: ' + e.message }); }

    // 3. Registrar generación y actualizar contador
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

    // 4. Análisis Claude
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
