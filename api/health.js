export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = { ts: new Date().toISOString(), checks: {} };
  
  // Test Yahoo Finance connectivity
  const tests = [
    { name: 'yahoo_fc', url: 'https://fc.yahoo.com' },
    { name: 'yahoo_crumb', url: 'https://query2.finance.yahoo.com/v1/test/getcrumb' },
    { name: 'yahoo_chart', url: 'https://query2.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=5m' },
    { name: 'yahoo_quote', url: 'https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL' },
    { name: 'yahoo_opts', url: 'https://query2.finance.yahoo.com/v7/finance/options/AAPL' },
  ];

  for (const test of tests) {
    try {
      const start = Date.now();
      const r = await fetch(test.url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });
      results.checks[test.name] = {
        status: r.status,
        ok: r.status < 400,
        ms: Date.now() - start,
        headers: Object.fromEntries([...r.headers.entries()].filter(([k]) => ['content-type', 'set-cookie', 'location'].includes(k)))
      };
      if (test.name === 'yahoo_crumb') {
        const txt = await r.text();
        results.checks[test.name].crumb = txt.substring(0, 50);
      }
      if (test.name === 'yahoo_chart' && r.ok) {
        const d = await r.json();
        results.checks[test.name].hasData = !!d.chart?.result?.[0];
        results.checks[test.name].price = d.chart?.result?.[0]?.meta?.regularMarketPrice;
      }
    } catch(e) {
      results.checks[test.name] = { error: e.message, ok: false };
    }
  }
  
  res.json(results);
}
