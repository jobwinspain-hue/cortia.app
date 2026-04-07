export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;

  const estilosDisponibles = {
    hombre: ['undercut','fade','pompadour','buzz','quiff','slickback','curtains','textured','mullet','mohawk','sidepart','fringe','long','dreadlocks','bun_m','french_crop','caesar','ivy_league','taper','waves','afro_m','cornrows','bowl','edgar','rapado'],
    mujer: ['bob','lob','pixie','layers','bangs','wolf','curtainbangs','bun','straight','curly','ponytail','braids','shag','long_w','afro_w','french_bob','bixie','octopus','butterfly','blowout','melena_flequillo','recogido_bajo','trenza_fr','beach_waves','rapada_w'],
    neutro: ['buzz_n','textured_n','pixie_n','mohawk_n','wolf_n','braids_n','bob_n','afro_n','dread_n','shag_n','long_n','ponytail_n']
  };

  const emojis = {
    undercut:'💈',fade:'✂️',pompadour:'🎸',buzz:'⚡',quiff:'🌊',slickback:'🎩',curtains:'🪄',textured:'🍃',mullet:'🔥',mohawk:'🤘',sidepart:'🕴️',fringe:'🫧',long:'🦁',dreadlocks:'🌿',bun_m:'🧢',french_crop:'🗼',caesar:'🏛️',ivy_league:'📚',taper:'💇',waves:'🌀',afro_m:'🌟',cornrows:'🌾',bowl:'🥣',edgar:'🔲',rapado:'⚡',
    bob:'💎',lob:'🌸',pixie:'⭐',layers:'🌊',bangs:'✨',wolf:'🐺',curtainbangs:'🌺',bun:'👑',straight:'💫',curly:'🌀',ponytail:'🎀',braids:'🧶',shag:'🎸',long_w:'🦋',afro_w:'🌟',french_bob:'🗼',bixie:'⚡',octopus:'🐙',butterfly:'🦋',blowout:'💨',melena_flequillo:'🌺',recogido_bajo:'👑',trenza_fr:'🧶',beach_waves:'🌊',rapada_w:'⭐',
    buzz_n:'⚡',textured_n:'🍃',pixie_n:'⭐',mohawk_n:'🤘',wolf_n:'🐺',braids_n:'🧶',bob_n:'💎',afro_n:'🌟',dread_n:'🦁',shag_n:'🎸',long_n:'🌿',ponytail_n:'🎀'
  };

  const nombres = {
    undercut:'Undercut',fade:'Fade',pompadour:'Pompadour',buzz:'Buzz Cut',quiff:'Quiff',slickback:'Slick Back',curtains:'Cortinillas',textured:'Texturizado',mullet:'Mullet',mohawk:'Mohawk',sidepart:'Raya lateral',fringe:'Flequillo',long:'Melena larga',dreadlocks:'Dreadlocks',bun_m:'Mono man',french_crop:'French Crop',caesar:'Caesar',ivy_league:'Ivy League',taper:'Taper',waves:'Waves',afro_m:'Afro',cornrows:'Cornrows',bowl:'Bowl Cut',edgar:'Edgar Cut',rapado:'Rapado',
    bob:'Bob',lob:'Lob',pixie:'Pixie',layers:'Capas',bangs:'Flequillo recto',wolf:'Ondas y capas',curtainbangs:'Flequillo cortina',bun:'Mono alto',straight:'Liso',curly:'Rizado',ponytail:'Cola alta',braids:'Trenzas',shag:'Shag',long_w:'Melena larga',afro_w:'Afro',french_bob:'French Bob',bixie:'Bixie',octopus:'Octopus',butterfly:'Butterfly Cut',blowout:'Blowout',melena_flequillo:'Melena flequillo',recogido_bajo:'Recogido bajo',trenza_fr:'Trenza francesa',beach_waves:'Beach Waves',rapada_w:'Rapada',
    buzz_n:'Buzz Cut',textured_n:'Texturizado',pixie_n:'Pixie',mohawk_n:'Mohawk',wolf_n:'Ondas y capas',braids_n:'Trenzas',bob_n:'Bob',afro_n:'Afro',dread_n:'Dreadlocks',shag_n:'Shag',long_n:'Pelo largo',ponytail_n:'Cola de caballo'
  };

  try {
    const { imageBase64, gender } = req.body;
    if (!imageBase64) return res.status(400).json({ ok: false, error: 'Falta imagen' });

    const generoTexto = gender === 'mujer' ? 'mujer' : gender === 'neutro' ? 'persona' : 'hombre';
    const validIds = estilosDisponibles[gender] || estilosDisponibles.hombre;
    const estilosList = validIds.join(', ');

    const prompt = `Eres un estilista experto. Analiza esta foto de una persona ${generoTexto}: forma del rostro, textura del pelo y rasgos faciales. Elige 3 estilos de esta lista que mejor le favorecerían: ${estilosList}. Responde SOLO con JSON valido sin texto adicional: {"sugerencias":[{"id":"id_de_lista","razon":"razon en max 10 palabras"},{"id":"id_de_lista","razon":"razon"},{"id":"id_de_lista","razon":"razon"}]}`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: prompt }
            ]
          },
          {
            role: 'assistant',
            content: '{"sugerencias":['
          }
        ]
      })
    });

    const cd = await r.json();
    const partial = cd.content?.find(c => c.type === 'text')?.text || '';

    // Reconstruct full JSON from prefill + completion
    let fullJson = '{"sugerencias":[' + partial;

    // Ensure it's properly closed
    if (!fullJson.includes(']}')) {
      fullJson = fullJson.replace(/,?\s*$/, ']}');
    }

    let rawSugerencias = [];
    try {
      const parsed = JSON.parse(fullJson);
      rawSugerencias = parsed.sugerencias || [];
    } catch(e) {
      // Try to extract individual objects
      const matches = fullJson.match(/\{"id":"([^"]+)","razon":"([^"]+)"\}/g) ||
                      fullJson.match(/\{"id":"([^"]+)"[^}]*"razon":"([^"]+)"[^}]*\}/g) || [];
      rawSugerencias = matches.map(m => {
        const id = m.match(/"id":"([^"]+)"/)?.[1];
        const razon = m.match(/"razon":"([^"]+)"/)?.[1];
        return { id, razon };
      });
    }

    // Validar IDs
    const sugerencias = rawSugerencias
      .filter(s => s.id && validIds.includes(s.id))
      .slice(0, 3)
      .map(s => ({
        id: s.id,
        razon: s.razon || 'Favorece tus rasgos',
        emoji: emojis[s.id] || '✂️',
        nombre: nombres[s.id] || s.id
      }));

    // Fallback si faltan
    if (sugerencias.length < 3) {
      const usados = sugerencias.map(s => s.id);
      validIds.filter(id => !usados.includes(id)).slice(0, 3 - sugerencias.length).forEach(id => {
        sugerencias.push({ id, razon: 'Estilo muy favorecedor', emoji: emojis[id] || '✂️', nombre: nombres[id] || id });
      });
    }

    return res.status(200).json({ ok: true, sugerencias });

  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
