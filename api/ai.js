export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { message, context } = req.body;
  if (!message) return res.status(400).json({ error: 'No msg' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.json({ reply: '⚠️ أضف ANTHROPIC_API_KEY في Vercel → Settings → Environment Variables' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 2500,
        system: 'أنت BEAST ENGINE — محرك تحليل خيارات أمريكية. متخصص في Weekly Options، Smart Money Flow، Gamma Exposure، Delta Hedging. قدم أرقاماً محددة (دخول، وقف، أهداف)، مخاطرة 1-10. ⚠️ تحليل فني وليس نصيحة. رموز: 🟢شراء 🔴بيع ⚡فرصة 🎯هدف ⚠️تحذير. عربي مع مصطلحات إنجليزية فنية. 5-8 أسطر كحد أقصى.',
        messages: [{ role:'user', content: context ? '📊 بيانات:\n'+context+'\n\n❓ '+message : message }]
      })
    });
    if (!r.ok) return res.json({ reply: '⚠️ خطأ API: ' + r.status });
    const d = await r.json();
    res.json({ reply: d.content?.map(c=>c.text||'').join('') || 'خطأ' });
  } catch(e) { res.json({ reply: '⚠️ ' + e.message }); }
}
