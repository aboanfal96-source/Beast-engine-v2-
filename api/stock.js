import { yahooFetch } from './_yahoo.js';

// FINNHUB FREE KEY FALLBACK - user can add their own at finnhub.io/register
const FINNHUB_KEY = process.env.FINNHUB_KEY || '';

async function fromYahoo(sym, range, interval) {
  const d = await yahooFetch(`/v8/finance/chart/${sym}?range=${range}&interval=${interval}&includePrePost=false&region=US&lang=en-US`);
  if (!d?.chart?.result?.[0]) return null;
  const R = d.chart.result[0], M = R.meta, ts = R.timestamp || [], q = R.indicators.quote[0];
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.open[i] != null && q.close[i] != null)
      candles.push({ t: ts[i]*1000, o: +q.open[i].toFixed(4), h: +(q.high[i]||q.open[i]).toFixed(4), l: +(q.low[i]||q.open[i]).toFixed(4), c: +q.close[i].toFixed(4), v: q.volume[i]||0 });
  }
  const price = M.regularMarketPrice, prev = M.previousClose||M.chartPreviousClose||price;
  return { ok:true, src:'yahoo', sym:M.symbol, name:M.shortName||M.longName||M.symbol, price, prev, chg:+(price-prev).toFixed(4), pct:+(((price-prev)/prev)*100).toFixed(2), hi:M.regularMarketDayHigh||price, lo:M.regularMarketDayLow||price, vol:M.regularMarketVolume||0, candles };
}

async function fromFinnhub(sym) {
  if (!FINNHUB_KEY) return null;
  try {
    // Quote
    const qr = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_KEY}`);
    const q = await qr.json();
    if (!q || !q.c) return null;
    // Candles (last 5 days, 15 min)
    const to = Math.floor(Date.now()/1000);
    const from = to - 5*24*3600;
    const cr = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=15&from=${from}&to=${to}&token=${FINNHUB_KEY}`);
    const c = await cr.json();
    const candles = (c.t||[]).map((t,i) => ({ t:t*1000, o:c.o[i], h:c.h[i], l:c.l[i], c:c.c[i], v:c.v[i]||0 }));
    return { ok:true, src:'finnhub', sym, name:sym, price:q.c, prev:q.pc, chg:+(q.c-q.pc).toFixed(4), pct:+(q.dp||0).toFixed(2), hi:q.h, lo:q.l, vol:0, candles };
  } catch(e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  const { s, range='5d', interval='15m' } = req.query;
  if (!s) return res.status(400).json({ ok:false, error:'Missing symbol' });

  // Try Yahoo first
  let data = await fromYahoo(s, range, interval);
  if (data) return res.json(data);

  // Try Finnhub
  data = await fromFinnhub(s);
  if (data) return res.json(data);

  // Both failed
  res.status(502).json({ ok:false, error:'Yahoo blocked + no FINNHUB_KEY. Add FINNHUB_KEY in Vercel env (free at finnhub.io/register)', sym:s });
}
