// Stock chart data — same pattern as TADAWUL US PRO (working)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol = 'AAPL', range = '5d', interval = '15m' } = req.query;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json,text/plain,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/',
  };

  for (const base of ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']) {
    try {
      const url = `${base}/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`;
      const r = await fetch(url, { headers });
      if (!r.ok) continue;
      const data = await r.json();
      if (!data?.chart?.result?.[0]) continue;
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      return res.status(200).json(data);
    } catch (e) { continue; }
  }
  return res.status(503).json({ error: 'stock data unavailable' });
}
