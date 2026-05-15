export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');
  const { s, range = '1mo', interval = '15m' } = req.query;
  if (!s) return res.status(400).json({ error: 'Missing symbol' });
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${range}&interval=${interval}&includePrePost=true`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    if (!r.ok) return res.status(r.status).json({ error: 'Yahoo ' + r.status });
    const d = await r.json();
    if (!d.chart?.result?.[0]) return res.status(404).json({ error: 'Not found' });
    const R = d.chart.result[0], M = R.meta, ts = R.timestamp || [], q = R.indicators.quote[0];
    const candles = [];
    for (let i = 0; i < ts.length; i++) {
      if (q.open[i] != null && q.close[i] != null)
        candles.push({ t: ts[i]*1000, o:+q.open[i].toFixed(4), h:+q.high[i].toFixed(4), l:+q.low[i].toFixed(4), c:+q.close[i].toFixed(4), v:q.volume[i]||0 });
    }
    const price = M.regularMarketPrice, prev = M.previousClose || M.chartPreviousClose;
    res.json({
      sym: M.symbol, name: M.shortName||M.longName||M.symbol,
      price, prev, chg: +(price-prev).toFixed(4), pct: +(((price-prev)/prev)*100).toFixed(2),
      hi: M.regularMarketDayHigh, lo: M.regularMarketDayLow,
      vol: M.regularMarketVolume, cap: M.marketCap, candles
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
}
