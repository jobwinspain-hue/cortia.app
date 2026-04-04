export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  try {
    const { salonId, salonSlug, salonNombre } = req.body;
    if (!salonId) return res.status(400).json({ error: 'Falta salonId' });

    const baseUrl = req.headers.origin || 'https://cortia-app.vercel.app';

    // Crear sesión de pago en Stripe
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'currency': 'eur',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][product_data][name]': 'CortIA Pro — ' + (salonNombre || 'Salón'),
        'line_items[0][price_data][product_data][description]': 'Generaciones ilimitadas de peinados con IA para tu salón',
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][price_data][unit_amount]': '2499',
        'line_items[0][quantity]': '1',
        'success_url': baseUrl + '/salon/' + salonSlug + '?pago=ok',
        'cancel_url': baseUrl + '/salon/' + salonSlug + '?pago=cancelado',
        'metadata[salon_id]': salonId,
        'metadata[salon_slug]': salonSlug,
        'allow_promotion_codes': 'true',
        'locale': 'es'
      })
    });

    const stripeText = await stripeRes.text();
    let stripeData;
    try { stripeData = JSON.parse(stripeText); } catch(e) { throw new Error('Stripe error: ' + stripeText.substring(0,200)); }
    if (!stripeRes.ok) throw new Error(stripeData.error?.message || 'Error Stripe ' + stripeRes.status);

    return res.status(200).json({ url: stripeData.url });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
