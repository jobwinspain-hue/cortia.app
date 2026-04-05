export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    const { salon, nombre, email, tel, ciudad, plan, mensaje } = req.body;
    if (!salon || !nombre || !email || !tel) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const r = await fetch(`${SUPABASE_URL}/rest/v1/solicitudes`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ salon, nombre, email, tel, ciudad, plan, mensaje, estado: 'pendiente' })
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error('Supabase error: ' + err);
    }

    return res.status(200).json({ ok: true });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
