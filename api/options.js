// Yahoo Finance options chain — same pattern as TADAWUL US PRO
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol = 'AAPL', date } = req.query;
  const sym = String(symbol).toUpperCase();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json,text/plain,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
  };
  const qs = date ? `?date=${date}` : '';

  for (const host of ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']) {
    try {
      const r = await fetch(`${host}/v7/finance/options/${sym}${qs}`, { headers });
      if (!r.ok) continue;
      const d = await r.json();
      if (!d?.optionChain?.result?.[0]) continue;
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
      return res.status(200).json(d);
    } catch (e) { continue; }
  }
  return res.status(503).json({ error: 'options unavailable', symbol: sym });
}
