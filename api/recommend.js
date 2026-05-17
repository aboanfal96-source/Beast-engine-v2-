// Weekly Options Recommendation Engine — same pattern as TADAWUL US PRO
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbol = 'AAPL' } = req.query;
  const sym = String(symbol).toUpperCase();
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json,text/plain,*/*',
    'Referer': 'https://finance.yahoo.com/',
  };

  // Fetch options chain
  let optData = null;
  for (const host of ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']) {
    try {
      const r = await fetch(`${host}/v7/finance/options/${sym}`, { headers });
      if (!r.ok) continue;
      const d = await r.json();
      if (d?.optionChain?.result?.[0]) { optData = d.optionChain.result[0]; break; }
    } catch(e) { continue; }
  }

  if (!optData) return res.json({ ok: false, error: 'Options unavailable', contracts: [] });

  const quote = optData.quote || {};
  const spot = quote.regularMarketPrice || 0;
  const opts = optData.options?.[0] || {};
  const exps = optData.expirationDates || [];

  // Find nearest weekly expiry (< 8 days)
  const now = Math.floor(Date.now() / 1000);
  const weeklyExp = exps.find(e => e > now && (e - now) < 8 * 86400) || exps[0];
  const daysToExp = weeklyExp ? Math.max(1, Math.round((weeklyExp - now) / 86400)) : 7;

  // Score each contract
  const scored = [];

  const scoreContract = (opt, type) => {
    const strike = opt.strike;
    const last = opt.lastPrice || 0;
    const bid = opt.bid || 0;
    const ask = opt.ask || 0;
    const vol = opt.volume || 0;
    const oi = opt.openInterest || 0;
    const iv = opt.impliedVolatility || 0.3;
    const mid = (bid + ask) / 2 || last;
    const spread = ask > 0 ? ((ask - bid) / ask * 100) : 50;

    if (mid < 0.05 || mid > spot * 0.2) return; // filter junk
    if (vol < 50 && oi < 100) return; // minimum liquidity

    // Delta approximation
    const moneyness = (spot - strike) / spot;
    let approxDelta;
    if (type === 'call') approxDelta = moneyness > 0.05 ? 0.7 : moneyness > -0.05 ? 0.5 : moneyness > -0.1 ? 0.3 : 0.15;
    else approxDelta = moneyness < -0.05 ? -0.7 : moneyness < 0.05 ? -0.5 : moneyness < 0.1 ? -0.3 : -0.15;

    // Scoring (similar to TADAWUL US PRO)
    let score = 0;

    // 1. Sweet spot delta (0.3-0.5 is ideal for weekly)
    const absDelta = Math.abs(approxDelta);
    if (absDelta >= 0.3 && absDelta <= 0.5) score += 25;
    else if (absDelta >= 0.2 && absDelta <= 0.6) score += 15;
    else score += 5;

    // 2. Liquidity (volume + OI)
    if (vol > 1000) score += 20;
    else if (vol > 500) score += 15;
    else if (vol > 100) score += 10;
    else score += 3;

    if (oi > 5000) score += 10;
    else if (oi > 1000) score += 7;
    else score += 3;

    // 3. Spread (tight = good)
    if (spread < 5) score += 15;
    else if (spread < 10) score += 10;
    else if (spread < 20) score += 5;

    // 4. IV consideration
    if (iv < 0.4) score += 10;
    else if (iv < 0.6) score += 5;

    // 5. Volume/OI ratio (unusual activity)
    const ratio = oi > 0 ? vol / oi : 0;
    if (ratio > 2) score += 15; // very unusual
    else if (ratio > 1) score += 10;
    else if (ratio > 0.5) score += 5;

    // Calculate targets
    const entry = ask || mid;
    const stop = Math.max(0.01, entry * 0.5);
    const target1 = entry * 1.5;
    const target2 = entry * 2.5;

    scored.push({
      type, strike, last, bid, ask, mid: +mid.toFixed(2),
      vol, oi, iv: +(iv * 100).toFixed(0),
      delta: +approxDelta.toFixed(2),
      spread: +spread.toFixed(1),
      ratio: +ratio.toFixed(1),
      score: Math.min(100, score),
      entry: +entry.toFixed(2),
      stop: +stop.toFixed(2),
      target1: +target1.toFixed(2),
      target2: +target2.toFixed(2),
      daysToExp,
      expDate: weeklyExp ? new Date(weeklyExp * 1000).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '—',
    });
  };

  (opts.calls || []).forEach(o => scoreContract(o, 'CALL'));
  (opts.puts || []).forEach(o => scoreContract(o, 'PUT'));

  scored.sort((a, b) => b.score - a.score);

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.json({
    ok: true,
    symbol: sym,
    spot,
    daysToExp,
    expDate: scored[0]?.expDate || '—',
    totalCalls: (opts.calls || []).length,
    totalPuts: (opts.puts || []).length,
    contracts: scored.slice(0, 15),
  });
}
