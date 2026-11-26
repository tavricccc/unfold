// Static server for the built film. Usage: import { serve } from './serve.mjs'
import http from 'http';
import fs from 'fs';
import path from 'path';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
export function serve(root, port = 0) {
  return new Promise((res) => {
    const s = http.createServer((req, rsp) => {
      const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      fs.readFile(p, (err, data) => {
        if (err) { rsp.writeHead(404); rsp.end(); return; }
        rsp.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
        rsp.end(data);
      });
    }).listen(port, '127.0.0.1', () => res({ url: `http://127.0.0.1:${s.address().port}`, close: () => s.close() }));
  });
}
