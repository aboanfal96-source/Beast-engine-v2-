// Server-side Yahoo Options - self-contained (no imports)
// This is the ONLY thing that needs server-side Yahoo access

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let _crumb = '', _cookie = '', _ts = 0;

async function auth() {
  if (_crumb && Date.now() - _ts < 300000) return;
  try {
    // Method 1: scrape finance page for crumb
    const pg = await fetch('https://finance.yahoo.com/quote/AAPL/', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' }, redirect: 'follow'
    });
    const sc = pg.headers.getSetCookie?.() || [];
    _cookie = sc.length ? sc.map(c => c.split(';')[0]).join('; ') : (pg.headers.get('set-cookie') || '').split(',').map(c => c.trim().split(';')[0]).filter(Boolean).join('; ');
    const html = await pg.text();
    const m = html.match(/"crumb"\s*:\s*"([^"]+)"/) || html.match(/crumb=([A-Za-z0-9_.~%-]+)/);
    if (m) { _crumb = m[1].replace(/\\u002F/g, '/'); _ts = Date.now(); return; }
  } catch(e) {}
  try {
    // Method 2: fc.yahoo.com
    const r1 = await fetch('https://fc.yahoo.com', { redirect: 'follow', headers: { 'User-Agent': UA } });
    const sc = r1.headers.getSetCookie?.() || [];
    _cookie = sc.length ? sc.map(c => c.split(';')[0]).join('; ') : (r1.headers.get('set-cookie') || '').split(';')[0];
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Cookie': _cookie }
    });
    const crumb = await r2.text();
    if (crumb && crumb.length < 50 && !crumb.includes('<')) { _crumb = crumb; _ts = Date.now(); }
  } catch(e) {}
}

async function fetchOpts(sym, date) {
  await auth();
  const urls = [];
  let base = `/v7/finance/options/${sym}`;
  if (date) base += `?date=${date}`;
  if (_crumb) {
    urls.push(`https://query2.finance.yahoo.com${base}${date ? '&' : '?'}crumb=${encodeURIComponent(_crumb)}`);
    urls.push(`https://query1.finance.yahoo.com${base}${date ? '&' : '?'}crumb=${encodeURIComponent(_crumb)}`);
  }
  urls.push(`https://query2.finance.yahoo.com${base}`);
  urls.push(`https://query1.finance.yahoo.com${base}`);

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Cookie': _cookie || '', 'Referer': 'https://finance.yahoo.com/' }
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.optionChain?.result?.[0]) return d.optionChain.result[0];
    } catch(e) { continue; }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  const { s, date } = req.query;
  if (!s) return res.status(400).json({ ok: false, error: 'Missing symbol' });

  const result = await fetchOpts(s, date);
  if (!result) return res.json({ ok: false, error: 'Yahoo options unavailable for ' + s });

  const Q = result.quote || {};
  const O = result.options?.[0] || {};
  const map = arr => (arr || []).map(o => ({
    k: o.strike, last: o.lastPrice, bid: o.bid, ask: o.ask,
    vol: o.volume || 0, oi: o.openInterest || 0,
    iv: o.impliedVolatility, itm: o.inTheMoney,
    exp: o.expiration
  }));

  res.json({
    ok: true,
    sym: Q.symbol || s,
    price: Q.regularMarketPrice,
    exps: result.expirationDates || [],
    exp: O.expirationDate,
    calls: map(O.calls),
    puts: map(O.puts)
  });
}
