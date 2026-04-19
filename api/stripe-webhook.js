export const config = { api: { bodyParser: false } };
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
const LIMITES_POR_PLAN = {
  basico:  200,
  pro:     500,
  premium: 1500,
};
const LIMITES_POR_PRECIO = {
  2499:  { plan: 'basico',  limite: 200  },
  4999:  { plan: 'pro',     limite: 500  },
  9999:  { plan: 'premium', limite: 1500 },
  3490:  { plan: 'basico',  limite: 200  },
  6490:  { plan: 'pro',     limite: 500  },
  15990: { plan: 'premium', limite: 1500 },
};
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const rawBody = await getRawBody(req);
  let event;
  try { event = JSON.parse(rawBody); }
  catch(err) { return res.status(400).json({ error: 'Invalid JSON' }); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const salonId = session.metadata?.salon_id;
    const planMeta = session.metadata?.plan;
    const subscriptionId = session.subscription;
    const customerId = session.customer;
    const amountTotal = session.amount_total;
    let planInfo;
    if (planMeta && LIMITES_POR_PLAN[planMeta]) {
      planInfo = { plan: planMeta, limite: LIMITES_POR_PLAN[planMeta] };
    } else {
      planInfo = LIMITES_POR_PRECIO[amountTotal] || { plan: 'basico', limite: 200 };
    }
    if (salonId) {
      try {
        const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/salones?id=eq.${salonId}`, {
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
            generaciones_mes: 0,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId
          })
        });
        if (updateRes.ok) {
          console.log(`✅ Salón ${salonId} actualizado: plan=${planInfo.plan}, limite=${planInfo.limite}`);
        } else {
          console.error('Error actualizando Supabase:', await updateRes.text());
        }
      } catch(e) {
        console.error('Error:', e.message);
      }
    }
  }

  // Suscripción cancelada — solo bajar a trial cuando realmente expira
  // cancel_at_period_end=true significa que canceló pero aún tiene acceso hasta fin de periodo
  // deleted significa que ya expiró realmente
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    // Solo bajar a trial si la suscripción ha expirado de verdad (no cancelación programada)
    if (!sub.cancel_at_period_end) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/salones?stripe_subscription_id=eq.${sub.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ plan: 'trial', generaciones_limite: 5, generaciones_mes: 0, stripe_subscription_id: null })
        });
        console.log(`Suscripción ${sub.id} expirada — salón vuelto a trial`);
      } catch(e) {}
    }
  }

  // Cuando se activa cancel_at_period_end — marcar como cancelación pendiente pero mantener acceso
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object;
    if (sub.cancel_at_period_end === true) {
      console.log(`Suscripción ${sub.id} marcada para cancelar al final del periodo — manteniendo acceso`);
      // No hacemos nada — el cliente sigue con su plan hasta que expire
    }
    // Si reactivó la suscripción (cancel_at_period_end volvió a false)
    if (sub.cancel_at_period_end === false && sub.status === 'active') {
      console.log(`Suscripción ${sub.id} reactivada`);
    }
  }

  return res.status(200).json({ received: true });
}
