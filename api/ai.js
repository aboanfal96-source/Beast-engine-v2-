export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { message, context } = req.body || {};
  if (!message) return res.status(400).json({ error: 'No message' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.json({ reply: '⚠️ أضف ANTHROPIC_API_KEY في Vercel ثم أعد النشر (Redeploy)' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 2000,
        system: 'أنت BEAST ENGINE — محرك تحليل خيارات أمريكية. Weekly Options، Gamma Exposure، Delta Hedging. أرقام محددة. ⚠️ تحليل فني وليس نصيحة. عربي+إنجليزي فني. 5-8 أسطر.',
        messages: [{ role: 'user', content: context ? '📊 ' + context + '\n❓ ' + message : message }]
      })
    });
    const d = await r.json();
    res.json({ reply: d.content?.map(c => c.text || '').join('') || 'خطأ' });
  } catch(e) { res.json({ reply: '⚠️ ' + e.message }); }
}
