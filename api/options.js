let cachedCrumb = null;
let cachedCookie = null;
let crumbTime = 0;

async function getCrumb() {
  if (cachedCrumb && Date.now() - crumbTime < 600000) return { crumb: cachedCrumb, cookie: cachedCookie };
  try {
    const consentRes = await fetch('https://fc.yahoo.com', {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    const setCookies = consentRes.headers.get('set-cookie') || '';
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
    }
  } catch(e) {}
  return { crumb: cachedCrumb || '', cookie: cachedCookie || '' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  const { s, date } = req.query;
  if (!s) return res.status(400).json({ error: 'Missing symbol', ok: false });
  
  try {
    const { crumb, cookie } = await getCrumb();
    
    let url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(s)}`;
    const params = [];
    if (date) params.push('date=' + date);
    if (crumb) params.push('crumb=' + encodeURIComponent(crumb));
    if (params.length) url += '?' + params.join('&');
    
    let result = null;
    
    // Try with crumb first, then without
    for (const tryUrl of [url, `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(s)}${date ? '?date=' + date : ''}`]) {
      try {
        const r = await fetch(tryUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Cookie': cookie || '',
          }
        });
        if (r.ok) {
          const d = await r.json();
          if (d.optionChain?.result?.[0]) { result = d.optionChain.result[0]; break; }
        }
      } catch(e) { continue; }
    }
    
    if (!result) return res.status(404).json({ error: 'No options data for ' + s, ok: false });
    
    const Q = result.quote || {};
    const O = result.options?.[0] || {};
    const map = arr => (arr || []).map(o => ({
      k: o.strike, last: o.lastPrice, bid: o.bid, ask: o.ask,
      chg: o.change, pct: o.percentChange,
      vol: o.volume || 0, oi: o.openInterest || 0,
      iv: o.impliedVolatility, itm: o.inTheMoney,
      exp: o.expiration, con: o.contractSymbol
    }));
    
    res.json({
      ok: true,
      sym: Q.symbol || s,
      price: Q.regularMarketPrice,
      name: Q.shortName || s,
      exps: result.expirationDates || [],
      strikes: result.strikes || [],
      exp: O.expirationDate,
      calls: map(O.calls),
      puts: map(O.puts)
    });
  } catch(e) {
    console.error('Options API Error:', s, e.message);
    res.status(500).json({ error: e.message, ok: false });
  }
}
