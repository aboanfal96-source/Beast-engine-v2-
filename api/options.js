import { yahooFetch } from './_yahoo.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  const { s, date } = req.query;
  if (!s) return res.status(400).json({ ok:false, error:'Missing symbol' });

  try {
    const path = `/v7/finance/options/${s}${date ? '?date='+date : ''}`;
    const d = await yahooFetch(path);

    if (d?.optionChain?.result?.[0]) {
      const R = d.optionChain.result[0], Q = R.quote||{}, O = R.options?.[0]||{};
      const map = arr => (arr||[]).map(o => ({
        k:o.strike, last:o.lastPrice, bid:o.bid, ask:o.ask,
        vol:o.volume||0, oi:o.openInterest||0,
        iv:o.impliedVolatility, itm:o.inTheMoney,
        exp:o.expiration, con:o.contractSymbol
      }));
      return res.json({
        ok:true, sym:Q.symbol||s, price:Q.regularMarketPrice, name:Q.shortName||s,
        exps:R.expirationDates||[], exp:O.expirationDate,
        calls:map(O.calls), puts:map(O.puts)
      });
    }

    res.status(502).json({ ok:false, error:'Options data unavailable for '+s });
  } catch(e) {
    res.status(500).json({ ok:false, error:e.message });
  }
}
