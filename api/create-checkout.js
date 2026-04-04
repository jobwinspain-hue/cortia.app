export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

  const PLANES = {
    basico: { precio: 2499, nombre: 'CortIA Básico', descripcion: '200 generaciones de peinados al mes' },
    pro:    { precio: 4999, nombre: 'CortIA Pro',    descripcion: '500 generaciones de peinados al mes' },
    premium:{ precio: 9999, nombre: 'CortIA Premium',descripcion: '1.500 generaciones de peinados al mes' },
  };

  try {
    const { salonId, salonSlug, salonNombre, plan } = req.body;
    if (!salonId || !plan) return res.status(400).json({ error: 'Faltan parámetros: salonId y plan son obligatorios' });

    const planData = PLANES[plan];
    if (!planData) return res.status(400).json({ error: 'Plan no válido. Usa: basico, pro o premium' });

    const baseUrl = `https://cortia-app.vercel.app`;

    const params = new URLSearchParams({
      'mode': 'subscription',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][product_data][name]': planData.nombre,
      'line_items[0][price_data][product_data][description]': planData.descripcion,
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][unit_amount]': String(planData.precio),
      'line_items[0][quantity]': '1',
      'success_url': `${baseUrl}/salon/${salonSlug}?pago=ok`,
      'cancel_url': `${baseUrl}/salon/${salonSlug}`,
      'metadata[salon_id]': salonId,
      'metadata[salon_slug]': salonSlug,
      'metadata[plan]': plan,
      'locale': 'es',
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const stripeText = await stripeRes.text();
    let stripeData;
    try { stripeData = JSON.parse(stripeText); }
    catch(e) { throw new Error('Stripe respuesta inválida: ' + stripeText.substring(0, 200)); }

    if (!stripeRes.ok) throw new Error(stripeData.error?.message || 'Error Stripe ' + stripeRes.status);

    return res.status(200).json({ url: stripeData.url });

  } catch(err) {
    console.error('create-checkout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
