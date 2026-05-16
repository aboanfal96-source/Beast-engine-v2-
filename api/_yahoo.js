// Yahoo Finance Session Manager
// Handles cookie/crumb authentication with multiple fallback strategies
// Yahoo blocks many cloud IPs - this tries every known workaround

let session = { cookie: '', crumb: '', ts: 0 };

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://finance.yahoo.com/',
  'Origin': 'https://finance.yahoo.com',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-site',
};

export async function getSession() {
  // Return cached session if fresh (5 min)
  if (session.crumb && Date.now() - session.ts < 300000) return session;

  // METHOD 1: Get session from finance.yahoo.com page
  try {
    const pageRes = await fetch('https://finance.yahoo.com/quote/AAPL/', {
      headers: { ...HEADERS, Accept: 'text/html' },
      redirect: 'follow',
    });

    // Collect cookies
    let cookies = '';
    const sc = pageRes.headers.getSetCookie?.() || [];
    if (sc.length) {
      cookies = sc.map(c => c.split(';')[0]).join('; ');
    } else {
      const raw = pageRes.headers.get('set-cookie') || '';
      cookies = raw.split(',').map(c => c.trim().split(';')[0]).filter(Boolean).join('; ');
    }

    // Extract crumb from HTML
    const html = await pageRes.text();
    let crumb = '';
    const m1 = html.match(/"crumb"\s*:\s*"([^"]+)"/);
    const m2 = html.match(/"CrsrfToken"\s*:\s*"([^"]+)"/);
    const m3 = html.match(/crumb=([A-Za-z0-9_.~-]+)/);
    crumb = m1?.[1] || m2?.[1] || m3?.[1] || '';

    // Unescape unicode
    if (crumb) crumb = crumb.replace(/\\u002F/g, '/').replace(/\\u005C/g, '\\');

    if (cookies && crumb) {
      session = { cookie: cookies, crumb, ts: Date.now() };
      console.log('[YF] Session OK via page scrape');
      return session;
    }
  } catch(e) {
    console.warn('[YF] Page scrape failed:', e.message);
  }

  // METHOD 2: fc.yahoo.com + crumb API
  try {
    const r1 = await fetch('https://fc.yahoo.com', {
      redirect: 'follow',
      headers: { 'User-Agent': UA }
    });
    let cookies = '';
    const sc = r1.headers.getSetCookie?.() || [];
    if (sc.length) cookies = sc.map(c => c.split(';')[0]).join('; ');
    else cookies = (r1.headers.get('set-cookie') || '').split(';')[0];

    if (cookies) {
      const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': UA, 'Cookie': cookies, 'Accept': 'text/plain' }
      });
      const crumb = await r2.text();
      if (crumb && crumb.length < 50 && !crumb.includes('<') && !crumb.includes('{')) {
        session = { cookie: cookies, crumb, ts: Date.now() };
        console.log('[YF] Session OK via fc.yahoo.com');
        return session;
      }
    }
  } catch(e) {
    console.warn('[YF] fc.yahoo.com failed:', e.message);
  }

  // METHOD 3: Direct crumb without cookie
  try {
    const r = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA }
    });
    const crumb = await r.text();
    if (crumb && crumb.length < 50 && !crumb.includes('<')) {
      session = { cookie: '', crumb, ts: Date.now() };
      console.log('[YF] Session OK via direct crumb');
      return session;
    }
  } catch(e) {}

  console.warn('[YF] All session methods failed');
  return session;
}

export async function yahooFetch(path) {
  const s = await getSession();

  // Build URL variations to try
  const bases = [
    `https://query2.finance.yahoo.com${path}${path.includes('?') ? '&' : '?'}crumb=${encodeURIComponent(s.crumb)}`,
    `https://query1.finance.yahoo.com${path}${path.includes('?') ? '&' : '?'}crumb=${encodeURIComponent(s.crumb)}`,
    `https://query2.finance.yahoo.com${path}`,
    `https://query1.finance.yahoo.com${path}`,
  ];

  // Add special params that sometimes bypass blocks
  const extras = path.includes('chart') ?
    '&corsDomain=finance.yahoo.com&.tsrc=finance' : '';

  for (const url of bases) {
    try {
      const r = await fetch(url + extras, {
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json',
          'Cookie': s.cookie || '',
          'Referer': 'https://finance.yahoo.com/',
        }
      });
      if (r.ok) {
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('json')) {
          return await r.json();
        }
      }
    } catch(e) { continue; }
  }
  return null;
}
