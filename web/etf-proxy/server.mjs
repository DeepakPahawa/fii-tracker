// Standalone proxy (for hosting the built site): `node etf-proxy/server.mjs`, then route /api/etf/ to it.
// During `npm run dev` the same handler is mounted by vite.config.ts, so you do not need this.
import http from 'node:http';
import { etfHandler } from './nseEtf.mjs';
import { historyHandler } from './history.mjs';

http
  .createServer((req, res) => {
    if ((req.url ?? '').startsWith('/api/etf/quotes')) return void etfHandler(req, res);
    if ((req.url ?? '').startsWith('/api/etf/history')) return void historyHandler(req, res);
    res.writeHead(404).end();
  })
  .listen(8787, '127.0.0.1', () => console.log('ETF proxy on http://127.0.0.1:8787'));
