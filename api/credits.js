export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const FAL_KEY = process.env.FAL_KEY;

  try {
    const r = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', {
      headers: { 'Authorization': `Key ${FAL_KEY}` }
    });
    const data = await r.json();
    return res.status(200).json({
      fal_balance: data.credits?.current_balance ?? null,
      fal_currency: data.credits?.currency ?? 'USD'
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
