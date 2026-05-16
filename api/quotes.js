let cachedCrumb = null;
let cachedCookie = null;
let crumbTime = 0;

async function getCrumb() {
  if (cachedCrumb && Date.now() - crumbTime < 600000) return { crumb: cachedCrumb, cookie: cachedCookie };
  try {
    const r1 = await fetch('https://fc.yahoo.com', { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    const sc = r1.headers.get('set-cookie') || '';
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Cookie': sc.split(';')[0] || '' }
    });
    const crumb = await r2.text();
    if (crumb && !crumb.includes('<')) { cachedCrumb = crumb; cachedCookie = sc.split(';')[0]; crumbTime = Date.now(); }
  } catch(e) {}
  return { crumb: cachedCrumb || '', cookie: cachedCookie || '' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  const { syms } = req.query;
  if (!syms) return res.status(400).json({ error: 'Missing syms', ok: false });

  try {
    const { crumb, cookie } = await getCrumb();
    const symbolList = syms.split(',').slice(0, 50).join(',');
    
    // Try quote endpoint (fetches many at once)
    const urls = [
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolList)}&crumb=${encodeURIComponent(crumb)}`,
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolList)}`,
      `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(symbolList)}&crumb=${encodeURIComponent(crumb)}`,
    ];
    
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Cookie': cookie || '',
          }
        });
        if (!r.ok) continue;
        const d = await r.json();
        const quotes = d.quoteResponse?.result || d.finance?.result?.[0]?.quotes || [];
        if (quotes.length > 0) {
          const data = {};
          quotes.forEach(q => {
            data[q.symbol] = {
              price: q.regularMarketPrice,
              chg: q.regularMarketChange ? +q.regularMarketChange.toFixed(2) : 0,
              pct: q.regularMarketChangePercent ? +q.regularMarketChangePercent.toFixed(2) : 0,
              hi: q.regularMarketDayHigh,
              lo: q.regularMarketDayLow,
              vol: q.regularMarketVolume,
              name: q.shortName || q.longName || q.symbol,
              cap: q.marketCap,
            };
          });
          return res.json({ ok: true, data });
        }
      } catch(e) { continue; }
    }
    
    // Fallback: use spark endpoint
    try {
      const sparkUrl = `https://query2.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbolList)}&range=1d&interval=5m&crumb=${encodeURIComponent(crumb)}`;
      const r = await fetch(sparkUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': cookie || '',
        }
      });
      if (r.ok) {
        const d = await r.json();
        const data = {};
        if (d.spark?.result) {
          d.spark.result.forEach(item => {
            const m = item.response?.[0]?.meta;
            if (m) {
              const prev = m.previousClose || m.chartPreviousClose || m.regularMarketPrice;
              data[m.symbol] = {
                price: m.regularMarketPrice,
                chg: +(m.regularMarketPrice - prev).toFixed(2),
                pct: +(((m.regularMarketPrice - prev) / prev) * 100).toFixed(2),
                hi: m.regularMarketDayHigh || m.regularMarketPrice,
                lo: m.regularMarketDayLow || m.regularMarketPrice,
                vol: m.regularMarketVolume || 0,
                name: m.shortName || m.symbol,
              };
            }
          });
        }
        if (Object.keys(data).length > 0) return res.json({ ok: true, data });
      }
    } catch(e) {}
    
    res.json({ ok: false, error: 'All quote methods failed', data: {} });
  } catch(e) {
    res.status(500).json({ error: e.message, ok: false, data: {} });
  }
}
