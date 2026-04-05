export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    const { salonId } = req.body;
    if (!salonId) return res.status(400).json({ error: 'Falta salonId' });

    // Get subscription ID from Supabase
    const r = await fetch(`${SUPABASE_URL}/rest/v1/salones?id=eq.${salonId}&select=stripe_subscription_id,nombre`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    const data = await r.json();
    if (!data || !data.length) return res.status(404).json({ error: 'Salón no encontrado' });
    
    const subscriptionId = data[0].stripe_subscription_id;
    if (!subscriptionId) return res.status(400).json({ error: 'Este salón no tiene suscripción activa' });

    // Cancel at period end in Stripe
    const stripeRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'cancel_at_period_end=true'
    });

    const stripeData = await stripeRes.json();
    if (!stripeRes.ok) throw new Error(stripeData.error?.message || 'Error Stripe');

    // Update Supabase to mark as canceling
    await fetch(`${SUPABASE_URL}/rest/v1/salones?id=eq.${salonId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ plan: salon?.plan + '_cancelando' })
    });

    const fechaFin = new Date(stripeData.current_period_end * 1000).toLocaleDateString('es-ES');
    return res.status(200).json({ ok: true, fechaFin });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
