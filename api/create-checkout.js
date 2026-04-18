export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PAYMENT_LINKS = {
    basico:  'https://buy.stripe.com/aFa9AUgjOfVDgzB1FG5wI05',
    pro:     'https://buy.stripe.com/4gMaEYc3y10Jert5VW5wI04',
    premium: 'https://buy.stripe.com/5kQ6oI9Vq10Jcjldoo5wI03',
  };

  try {
    const { salonId, salonSlug, plan } = req.body;
    if (!salonId || !plan) return res.status(400).json({ error: 'Faltan parámetros' });

    const baseLink = PAYMENT_LINKS[plan];
    if (!baseLink) return res.status(400).json({ error: 'Plan no válido' });

    // Añadir client_reference_id y success/cancel URLs como parámetros
    const url = `${baseLink}?client_reference_id=${salonId}&success_url=${encodeURIComponent(`https://cortialooks.com/salon/${salonSlug}?pago=ok`)}&cancel_url=${encodeURIComponent(`https://cortialooks.com/salon/${salonSlug}`)}`;

    return res.status(200).json({ url });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
