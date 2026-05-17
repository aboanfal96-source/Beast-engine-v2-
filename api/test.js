// Test endpoint — verify all connections
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = { ts: new Date().toISOString() };
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/',
  };

  // Test stock
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=5m', { headers });
    const d = await r.json();
    results.stock = { ok: !!d?.chart?.result?.[0], price: d?.chart?.result?.[0]?.meta?.regularMarketPrice, status: r.status };
  } catch(e) { results.stock = { ok: false, error: e.message }; }

  // Test options
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v7/finance/options/AAPL', { headers });
    const d = await r.json();
    results.options = { ok: !!d?.optionChain?.result?.[0], calls: d?.optionChain?.result?.[0]?.options?.[0]?.calls?.length || 0, status: r.status };
  } catch(e) { results.options = { ok: false, error: e.message }; }

  // Test AI key
  results.ai = { configured: !!process.env.ANTHROPIC_API_KEY };

  results.verdict = results.stock.ok ? '✅ All systems go!' : '❌ Yahoo blocked — try deploying to different region';
  res.json(results);
}
