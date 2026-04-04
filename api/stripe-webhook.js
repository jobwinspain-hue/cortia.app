export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Mapeo de Payment Links a planes y límites
const PLANES = {
  'https://buy.stripe.com/test_cNi8wQ0kN8X49nHcCx6Vq00': { plan: 'basico', limite: 200 },
  'https://buy.stripe.com/test_fZu4gAaZrc9g6bv9ql6Vq01': { plan: 'pro', limite: 500 },
  'https://buy.stripe.com/test_7sYdRac3v4GO0Rb31X6Vq02': { plan: 'premium', limite: 1500 },
};

// También por precio en céntimos
const PLANES_POR_PRECIO = {
  2499: { plan: 'basico', limite: 200 },
  4999: { plan: 'pro', limite: 500 },
  9999: { plan: 'premium', limite: 1500 },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  const rawBody = await getRawBody(req);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch(err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const salonId = session.metadata?.salon_id;
    const subscriptionId = session.subscription;
    const customerId = session.customer;
    const amountTotal = session.amount_total;

    // Determinar plan por precio
    let planInfo = PLANES_POR_PRECIO[amountTotal] || { plan: 'basico', limite: 200 };

    if (salonId) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/salones?id=eq.${salonId}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            plan: planInfo.plan,
            generaciones_limite: planInfo.limite,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId
          })
        });
        console.log(`Salón ${salonId} actualizado a plan ${planInfo.plan} con ${planInfo.limite} generaciones`);
      } catch(e) {
        console.error('Error actualizando salón:', e.message);
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/salones?stripe_subscription_id=eq.${sub.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ plan: 'trial', generaciones_limite: 5 })
      });
    } catch(e) {}
  }

  return res.status(200).json({ received: true });
}
