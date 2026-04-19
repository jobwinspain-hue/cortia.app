export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'Falta el slug del salón' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/salones?slug=eq.${slug}&select=id,slug,nombre,logo_url,color_primario,color_acento,plan,generaciones_mes,generaciones_limite,mes_actual,activo,stripe_subscription_id,pin_gestion`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data = await r.json();
    if (!data || data.length === 0) return res.status(404).json({ error: 'Salón no encontrado' });

    const salon = data[0];

    // Resetear contador si es un mes nuevo
    const mesActual = new Date().toISOString().slice(0, 7);
    if (salon.mes_actual !== mesActual) {
      await fetch(`${SUPABASE_URL}/rest/v1/salones?id=eq.${salon.id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ generaciones_mes: 0, mes_actual: mesActual })
      });
      salon.generaciones_mes = 0;
      salon.mes_actual = mesActual;
    }

    return res.status(200).json(salon);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
