// TEST ONLY: synthetic TLS gateway, no external services or production credentials.
import https from 'node:https';
import http from 'node:http';
import { readFileSync } from 'node:fs';
https.createServer({ key: readFileSync('/fixtures/gateway-tls/private.key'), cert: readFileSync('/fixtures/gateway-tls/fullchain.pem') }, (req, res) => {
  const headers = { ...req.headers };
  for (const name of Object.keys(headers)) {
    if (name.startsWith('x-forwarded-') || name.startsWith('x-wangmai-') || name.startsWith('x-middleware-') ||
      ['forwarded', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'fastly-client-ip', 'client-ip', 'connection'].includes(name)) delete headers[name];
  }
  Object.assign(headers, { host: 'wangmai.invalid', 'x-forwarded-host': 'wangmai.invalid', 'x-forwarded-proto': 'https',
    'x-forwarded-for': req.socket.remoteAddress.replace(/^::ffff:/, '') });
  const upstream = http.request({ hostname: 'frontend', port: 3000, path: req.url, method: req.method, headers }, response => {
    res.writeHead(response.statusCode, response.headers); response.pipe(res);
  });
  upstream.on('error', () => { res.writeHead(502); res.end(); });
  req.pipe(upstream);
}).listen(443, '0.0.0.0');
