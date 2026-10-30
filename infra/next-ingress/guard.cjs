const { BlockList, isIP } = require('node:net');

const flags = ['WANGMAI_GATEWAY_HEADERS_VERIFIED', 'WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED',
  'WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED', 'WANGMAI_ORIGIN_INTEGRITY_VERIFIED'];
const protections = ['ipsec', 'wireguard', 'macsec', 'provider-encrypted-private-network'];
const normalize = ip => ip?.startsWith('::ffff:') ? ip.slice(7) : ip;
const privateIPv4 = ip => isIP(ip) === 4 && (ip.startsWith('10.') || ip.startsWith('192.168.') ||
  (ip.startsWith('172.') && Number(ip.split('.')[1]) >= 16 && Number(ip.split('.')[1]) <= 31));

function configuration(env) {
  const invalid = () => { throw new Error('Provider ingress configuration is missing, invalid or unverified; startup blocked.'); };
  if (env.NODE_ENV !== 'production' || env.WANGMAI_INGRESS_MODE !== 'provider-proxy-next' ||
    env.WANGMAI_PROVIDER_PROXY_NEXT_CONFIG !== 'selected' || env.PORT !== '3000' ||
    !privateIPv4(env.WANGMAI_ORIGIN_BIND_IP) || flags.some(flag => env[flag] !== 'verified') ||
    !protections.includes(env.WANGMAI_ORIGIN_LINK_PROTECTION)) invalid();
  const domain = env.WANGMAI_DOMAIN;
  if (!domain || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ||
    /(?:change_me|example|localhost)/i.test(domain)) invalid();
  const reference = env.WANGMAI_GATEWAY_CONTRACT_REFERENCE;
  if (!reference || reference.trim() !== reference || /unverified|pending|unknown|change_me|replace-with|example|fixture|smoke/i.test(reference)) invalid();
  const peers = new BlockList();
  // The listener binds IPv4. Require canonical narrow IPv4 peer CIDRs; client
  // addresses in the sanitized XFF may be IPv4 OR IPv6.
  for (const cidr of (env.WANGMAI_GATEWAY_CIDRS ?? '').split(' ')) {
    const [ip, rawPrefix, extra] = cidr.split('/');
    const prefix = Number(rawPrefix);
    if (extra !== undefined || isIP(ip) !== 4 || !/^(?:1[6-9]|2\d|3[0-2])$/.test(rawPrefix ?? '') ||
      ['192.168.0.0/16'].includes(cidr) || ip.startsWith('127.') || Number(ip.split('.')[0]) === 0 || Number(ip.split('.')[0]) >= 224) invalid();
    const numeric = ip.split('.').reduce((value, part) => value * 256 + Number(part), 0);
    if (numeric % (2 ** (32 - prefix)) !== 0) invalid();
    peers.addSubnet(ip, prefix, 'ipv4');
  }
  return { domain, peers };
}

function guardRequest(req, res, config) {
  const deny = status => {
    res.writeHead(status, { 'content-type': 'text/plain', 'cache-control': 'no-store', connection: 'close' });
    res.end('Request rejected');
    return false;
  };
  const peer = normalize(req.socket.remoteAddress);
  // Only the exact dependency-readiness probe is available on container loopback.
  // This path never reads sessions and never forwards user supplied headers.
  if ((peer === '127.0.0.1' || peer === '::1') && req.method === 'GET' && req.url === '/health/ready' &&
    req.headers.host === '127.0.0.1:3000' && !Object.keys(req.headers).some(key => key.startsWith('x-') || key === 'forwarded' || key === 'cookie')) return true;
  if (!peer || isIP(peer) !== 4 || !config.peers.check(peer, 'ipv4')) return deny(403);
  const count = name => req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === name).length;
  if (count('host') !== 1 || req.headers.host !== config.domain) return deny(421);
  if (!req.url.startsWith('/') || req.url.startsWith('//')) return deny(400);
  for (const [name, value] of [['x-forwarded-host', config.domain], ['x-forwarded-proto', 'https']]) {
    if (count(name) !== 1 || req.headers[name] !== value) return deny(400);
  }
  const clientIP = req.headers['x-forwarded-for'];
  if (count('x-forwarded-for') !== 1 || typeof clientIP !== 'string' || !isIP(clientIP) || clientIP.includes('%')) return deny(400);
  if (req.headers.connection && !/^(?:close|keep-alive)$/i.test(req.headers.connection)) return deny(400);
  // Never let aliases, internal headers, or a forged chain become authoritative.
  for (const name of Object.keys(req.headers)) {
    if (name.startsWith('x-forwarded-') || name.startsWith('x-wangmai-') || name.startsWith('x-middleware-') ||
      ['forwarded', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'fastly-client-ip', 'client-ip'].includes(name)) delete req.headers[name];
  }
  Object.assign(req.headers, { 'x-forwarded-host': config.domain, 'x-forwarded-proto': 'https',
    'x-forwarded-port': '443', 'x-forwarded-for': clientIP, 'x-wangmai-client-ip': clientIP });
  if (/^\/api(?:\/|\?|$)/.test(req.url)) req.headers['x-wangmai-original-uri'] = req.url;
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  return true;
}

function attachGuard(server, config) {
  const emit = server.emit;
  // Run before ALL Next listeners, including Expect: 100-continue. Rejected
  // requests never reach Next. No body stream or response cookie is reserialized.
  server.emit = function(event, ...args) {
    if (event === 'upgrade') { args[1].destroy(); return true; }
    if (['request', 'checkContinue', 'checkExpectation'].includes(event) && !guardRequest(args[0], args[1], config)) return true;
    return emit.call(this, event, ...args);
  };
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}

function preserveAPIURI(options) {
  // Next's external rewrite serializes a parsed URL, which removes trailing
  // slashes and can reorder/re-encode query fields. At the final Node HTTP send,
  // restore only the URI stamped by the socket guard for the fixed Hono target.
  // The native rewrite still owns streaming, method, body, cookies and response.
  const uri = options?.headers?.['x-wangmai-original-uri'];
  if ((options?.hostname ?? options?.host) !== 'backend' || String(options.port) !== '4000' ||
    typeof uri !== 'string' || !/^\/api(?:\/|\?|$)/.test(uri) || /[\r\n]/.test(uri)) return options;
  const headers = { ...options.headers };
  delete headers['x-wangmai-original-uri'];
  return { ...options, path: uri, headers };
}

module.exports = { configuration, guardRequest, attachGuard, preserveAPIURI };
