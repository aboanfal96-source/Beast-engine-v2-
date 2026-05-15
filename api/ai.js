export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { message, context, memory } = req.body;
  if (!message) return res.status(400).json({ error: 'No message' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'Add ANTHROPIC_API_KEY in Vercel env vars' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 2500,
        system: `أنت "BEAST ENGINE" — محرك تحليل خيارات متقدم يعمل داخل منصة TADAWUL BEAST.
أنت لست مساعداً عادياً. أنت محلل كمي (Quant) متخصص في:
1. عقود الخيارات الأسبوعية (Weekly Options / 0DTE)
2. قراءة تدفق السيولة الذكية (Smart Money Flow / Dark Pool)
3. تحليل Gamma Exposure و Delta Hedging لصُناع السوق
4. كشف الـ Sweep Orders والـ Block Trades
5. حساب نقاط الدخول والخروج بدقة

عند الإجابة:
- استخدم البيانات المقدمة في السياق بدقة
- قدم أرقاماً محددة: "ادخل عند $XXX، عقد CALL $XXX Strike، الهدف $XXX"
- احسب قيمة العقد عند الدخول وعند الهدف
- حدد وقف الخسارة بدقة
- قيّم المخاطرة من 1-10
- اشرح لماذا هذه الفرصة موجودة (GEX، Flow، Greek)

قواعد أساسية:
- ⚠️ هذا تحليل فني وليس نصيحة استثمارية — القرار للمتداول
- Weekly Options خطيرة — وضّح المخاطر دائماً
- كن مختصراً: 5-8 أسطر كحد أقصى
- استخدم: 🟢 شراء | 🔴 بيع | ⚡ فرصة | 🎯 هدف | ⚠️ تحذير | 🧱 جدار | 💰 ربح
- إذا لم تكن متأكداً، قل ذلك بوضوح

${memory ? 'ذاكرة التعلم الذاتي (أنماط سابقة):\n' + memory : ''}`,
        messages: [{ role:'user', content: context ? `📊 بيانات لحظية:\n${context}\n\n❓ ${message}` : message }]
      })
    });
    if (!r.ok) return res.status(r.status).json({ error: 'API error ' + r.status });
    const d = await r.json();
    res.json({ reply: d.content?.map(c=>c.text||'').join('') || 'خطأ في المعالجة' });
  } catch(e) { res.status(500).json({ error: e.message }); }
}
