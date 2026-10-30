// Node preload for the generated Next standalone server, not a second listener
// or a second proxy. Covered against the pinned Next version by Docker smokes.
const http = require('node:http');
const { configuration, attachGuard, preserveAPIURI } = require('./guard.cjs');
let config;
try { config = configuration(process.env); }
catch { console.error('Provider ingress configuration is invalid or unverified; startup blocked.'); process.exit(1); }
const createServer = http.createServer;
http.createServer = function(...args) { return attachGuard(createServer.apply(this, args), config); };
const request = http.request;
http.request = function(options, ...args) { return request.call(this, preserveAPIURI(options), ...args); };
// Next's default proxy error includes the full OAuth callback URL. Keep the
// operational signal without logging codes, state, query strings or cookies.
const error = console.error;
console.error = function(first, ...args) {
  if (typeof first === 'string' && first.startsWith('Failed to proxy ')) {
    return error.call(this, JSON.stringify({ event: 'api_proxy_failed' }));
  }
  return error.call(this, first, ...args);
};
require('node:module').syncBuiltinESMExports();
