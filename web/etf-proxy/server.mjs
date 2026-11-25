// Skeleton backend for the ETF page's "Live proxy" mode. No dependencies. See README.md for the contract.
import http from 'node:http';

/** TODO: fetch from your broker / NSE here. Must resolve to [{ symbol, ltp, prevClose, inav, volume, turnover? }]. */
async function getQuotes(symbols) {
  void symbols;
  throw Object.assign(new Error('getQuotes() is not implemented'), { status: 501 });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/api/etf/quotes') return void res.writeHead(404).end();
    try {
      const symbols = (url.searchParams.get('symbols') ?? '').split(',').filter(Boolean);
      const quotes = await getQuotes(symbols);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ts: Date.now(), quotes }));
    } catch (e) {
      res.writeHead(e.status ?? 502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(e.message) }));
    }
  })
  .listen(8787, '127.0.0.1', () => console.log('ETF proxy on http://127.0.0.1:8787'));
