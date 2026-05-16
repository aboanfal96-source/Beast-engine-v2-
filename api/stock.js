// Yahoo Finance requires cookie+crumb auth from server IPs
// This endpoint handles that properly with fallbacks

let cachedCrumb = null;
let cachedCookie = null;
let crumbTime = 0;

async function getCrumb() {
  // Cache crumb for 10 minutes
  if (cachedCrumb && Date.now() - crumbTime < 600000) return { crumb: cachedCrumb, cookie: cachedCookie };
  
  try {
    // Step 1: Get consent cookie
    const consentRes = await fetch('https://fc.yahoo.com', {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const setCookies = consentRes.headers.get('set-cookie') || '';
    
    // Step 2: Get crumb
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': setCookies.split(';')[0] || ''
      }
    });
    const crumb = await crumbRes.text();
    
    if (crumb && !crumb.includes('<')) {
      cachedCrumb = crumb;
      cachedCookie = setCookies.split(';')[0] || '';
      crumbTime = Date.now();
      return { crumb: cachedCrumb, cookie: cachedCookie };
    }
  } catch(e) {
    console.error('Crumb fetch failed:', e.message);
  }
  return { crumb: '', cookie: '' };
}

async function fetchYahooChart(sym, range, interval, cookie, crumb) {
  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=${interval}&crumb=${encodeURIComponent(crumb)}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=${range}&interval=${interval}`,
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
      if (r.ok) {
        const d = await r.json();
        if (d.chart?.result?.[0]) return d.chart.result[0];
      }
    } catch(e) { continue; }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  
  const { s, range = '5d', interval = '15m' } = req.query;
  if (!s) return res.status(400).json({ error: 'Missing symbol', ok: false });
  
  try {
    const { crumb, cookie } = await getCrumb();
    const result = await fetchYahooChart(s, range, interval, cookie, crumb);
    
    if (!result) {
      return res.status(404).json({ error: 'No data for ' + s, ok: false });
    }
    
    const M = result.meta;
    const ts = result.timestamp || [];
    const q = result.indicators.quote[0];
    const candles = [];
    for (let i = 0; i < ts.length; i++) {
      if (q.open[i] != null && q.close[i] != null) {
        candles.push({
          t: ts[i] * 1000,
          o: +q.open[i].toFixed(4),
          h: +(q.high[i] || q.open[i]).toFixed(4),
          l: +(q.low[i] || q.open[i]).toFixed(4),
          c: +q.close[i].toFixed(4),
          v: q.volume[i] || 0
        });
      }
    }
    
    const price = M.regularMarketPrice;
    const prev = M.previousClose || M.chartPreviousClose || price;
    
    res.json({
      ok: true,
      sym: M.symbol,
      name: M.shortName || M.longName || M.symbol,
      price,
      prev,
      chg: +(price - prev).toFixed(4),
      pct: +(((price - prev) / prev) * 100).toFixed(2),
      hi: M.regularMarketDayHigh || price,
      lo: M.regularMarketDayLow || price,
      vol: M.regularMarketVolume || 0,
      candles
    });
  } catch(e) {
    console.error('Stock API Error:', s, e.message);
    res.status(500).json({ error: e.message, ok: false });
  }
}
