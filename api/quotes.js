import { yahooFetch, getSession } from './_yahoo.js';

const FINNHUB_KEY = process.env.FINNHUB_KEY || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  const { syms } = req.query;
  if (!syms) return res.status(400).json({ ok:false, error:'Missing syms' });

  const symbolList = syms.split(',').slice(0, 50);
  const data = {};

  // METHOD 1: Yahoo quote API (batch)
  try {
    const d = await yahooFetch(`/v7/finance/quote?symbols=${encodeURIComponent(symbolList.join(','))}`);
    const quotes = d?.quoteResponse?.result || [];
    quotes.forEach(q => {
      if (q.symbol && q.regularMarketPrice) {
        data[q.symbol] = {
          price: q.regularMarketPrice,
          chg: q.regularMarketChange ? +q.regularMarketChange.toFixed(2) : 0,
          pct: q.regularMarketChangePercent ? +q.regularMarketChangePercent.toFixed(2) : 0,
          hi: q.regularMarketDayHigh, lo: q.regularMarketDayLow,
          vol: q.regularMarketVolume, name: q.shortName || q.symbol,
        };
      }
    });
    if (Object.keys(data).length > 0) return res.json({ ok:true, src:'yahoo', data });
  } catch(e) {}

  // METHOD 2: Yahoo spark API (batch)
  try {
    const d = await yahooFetch(`/v8/finance/spark?symbols=${encodeURIComponent(symbolList.join(','))}&range=1d&interval=5m`);
    if (d?.spark?.result) {
      d.spark.result.forEach(item => {
        const m = item.response?.[0]?.meta;
        if (m?.symbol && m.regularMarketPrice) {
          const prev = m.previousClose || m.chartPreviousClose || m.regularMarketPrice;
          data[m.symbol] = {
            price: m.regularMarketPrice,
            chg: +(m.regularMarketPrice - prev).toFixed(2),
            pct: +(((m.regularMarketPrice - prev) / prev) * 100).toFixed(2),
            hi: m.regularMarketDayHigh || m.regularMarketPrice,
            lo: m.regularMarketDayLow || m.regularMarketPrice,
            vol: m.regularMarketVolume || 0,
            name: m.shortName || m.symbol,
          };
        }
      });
      if (Object.keys(data).length > 0) return res.json({ ok:true, src:'yahoo-spark', data });
    }
  } catch(e) {}

  // METHOD 3: Finnhub (one by one, up to 15 to stay in rate limits)
  if (FINNHUB_KEY) {
    const batch = symbolList.slice(0, 15);
    const promises = batch.map(async sym => {
      try {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`);
        const q = await r.json();
        if (q && q.c > 0) {
          data[sym] = { price:q.c, chg:+(q.d||0).toFixed(2), pct:+(q.dp||0).toFixed(2), hi:q.h, lo:q.l, vol:0, name:sym };
        }
      } catch(e) {}
    });
    await Promise.all(promises);
    if (Object.keys(data).length > 0) return res.json({ ok:true, src:'finnhub', data });
  }

  // All failed
  res.json({ ok:false, error:'All sources failed. Add FINNHUB_KEY (free: finnhub.io/register)', data:{} });
}
