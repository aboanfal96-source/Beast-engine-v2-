export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  const { s, date } = req.query;
  if (!s) return res.status(400).json({ error: 'Missing symbol' });
  try {
    let url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(s)}`;
    if (date) url += `?date=${date}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    if (!r.ok) return res.status(r.status).json({ error: 'Yahoo ' + r.status });
    const d = await r.json();
    if (!d.optionChain?.result?.[0]) return res.status(404).json({ error: 'No data' });
    const R = d.optionChain.result[0], Q = R.quote||{}, O = R.options?.[0]||{};
    const map = arr => (arr||[]).map(o => ({
      k:o.strike, last:o.lastPrice, bid:o.bid, ask:o.ask,
      chg:o.change, pct:o.percentChange,
      vol:o.volume||0, oi:o.openInterest||0,
      iv:o.impliedVolatility, itm:o.inTheMoney,
      exp:o.expiration, con:o.contractSymbol
    }));
    res.json({
      sym:Q.symbol||s, price:Q.regularMarketPrice, name:Q.shortName||s,
      exps:R.expirationDates||[], strikes:R.strikes||[],
      exp:O.expirationDate, calls:map(O.calls), puts:map(O.puts)
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
}
