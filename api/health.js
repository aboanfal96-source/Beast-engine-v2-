import { getSession, yahooFetch } from './_yahoo.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = { ts: new Date().toISOString(), env: {}, yahoo: {}, finnhub: {}, verdict: '' };

  // Check env vars
  results.env.FINNHUB_KEY = process.env.FINNHUB_KEY ? '✅ Set (' + process.env.FINNHUB_KEY.substring(0,4) + '...)' : '❌ NOT SET';
  results.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ NOT SET';

  // Test Yahoo session
  try {
    const session = await getSession();
    results.yahoo.session = {
      hasCookie: !!session.cookie,
      hasCrumb: !!session.crumb,
      crumbPreview: session.crumb ? session.crumb.substring(0, 10) + '...' : 'NONE',
      cookiePreview: session.cookie ? session.cookie.substring(0, 30) + '...' : 'NONE',
    };
  } catch(e) {
    results.yahoo.session = { error: e.message };
  }

  // Test Yahoo chart
  try {
    const d = await yahooFetch('/v8/finance/chart/AAPL?range=1d&interval=5m');
    results.yahoo.chart = {
      ok: !!d?.chart?.result?.[0],
      price: d?.chart?.result?.[0]?.meta?.regularMarketPrice || null,
      candles: d?.chart?.result?.[0]?.timestamp?.length || 0,
    };
  } catch(e) {
    results.yahoo.chart = { ok: false, error: e.message };
  }

  // Test Yahoo options
  try {
    const d = await yahooFetch('/v7/finance/options/AAPL');
    results.yahoo.options = {
      ok: !!d?.optionChain?.result?.[0],
      calls: d?.optionChain?.result?.[0]?.options?.[0]?.calls?.length || 0,
      puts: d?.optionChain?.result?.[0]?.options?.[0]?.puts?.length || 0,
    };
  } catch(e) {
    results.yahoo.options = { ok: false, error: e.message };
  }

  // Test Yahoo quote
  try {
    const d = await yahooFetch('/v7/finance/quote?symbols=AAPL,TSLA');
    results.yahoo.quote = {
      ok: !!d?.quoteResponse?.result?.length,
      count: d?.quoteResponse?.result?.length || 0,
    };
  } catch(e) {
    results.yahoo.quote = { ok: false, error: e.message };
  }

  // Test Finnhub
  if (process.env.FINNHUB_KEY) {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${process.env.FINNHUB_KEY}`);
      const d = await r.json();
      results.finnhub = { ok: !!d.c, price: d.c, status: r.status };
    } catch(e) {
      results.finnhub = { ok: false, error: e.message };
    }
  } else {
    results.finnhub = { ok: false, reason: 'No FINNHUB_KEY set' };
  }

  // Raw connectivity tests
  results.raw = {};
  for (const [name, url] of [
    ['query1_direct', 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=5m'],
    ['query2_direct', 'https://query2.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=5m'],
    ['finance_page', 'https://finance.yahoo.com/quote/AAPL/'],
  ]) {
    try {
      const start = Date.now();
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        redirect: 'follow',
      });
      const body = await r.text();
      results.raw[name] = {
        status: r.status,
        ms: Date.now() - start,
        isJson: body.startsWith('{') || body.startsWith('['),
        isHtml: body.includes('<html'),
        bodyPreview: body.substring(0, 100),
        hasPrice: body.includes('regularMarketPrice'),
      };
    } catch(e) {
      results.raw[name] = { error: e.message };
    }
  }

  // Verdict
  const yahooWorks = results.yahoo.chart?.ok;
  const finnhubWorks = results.finnhub?.ok;
  if (yahooWorks) results.verdict = '✅ Yahoo Finance works. Platform should load data.';
  else if (finnhubWorks) results.verdict = '⚠️ Yahoo blocked but Finnhub works. Chart data OK, options limited.';
  else results.verdict = '❌ Both sources failed. Add FINNHUB_KEY at finnhub.io/register (free, 2 min). Then add to Vercel env vars.';

  res.json(results);
}
