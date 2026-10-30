const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');
const { configuration, guardRequest, attachGuard, preserveAPIURI } = require('./guard.cjs');

const env = {
  NODE_ENV: 'production', PORT: '3000', WANGMAI_INGRESS_MODE: 'provider-proxy-next', WANGMAI_PROVIDER_PROXY_NEXT_CONFIG: 'selected',
  WANGMAI_DOMAIN: 'wangmai.snowballwy.com', WANGMAI_ORIGIN_BIND_IP: '10.60.2.22', WANGMAI_GATEWAY_CIDRS: '192.0.2.10/32',
  WANGMAI_GATEWAY_HEADERS_VERIFIED: 'verified', WANGMAI_ORIGIN_SOURCE_RESTRICTION_VERIFIED: 'verified',
  WANGMAI_ORIGIN_CONFIDENTIALITY_VERIFIED: 'verified', WANGMAI_ORIGIN_INTEGRITY_VERIFIED: 'verified',
  WANGMAI_ORIGIN_LINK_PROTECTION: 'ipsec', WANGMAI_GATEWAY_CONTRACT_REFERENCE: 'review/GW-123',
};
const headers = { host: env.WANGMAI_DOMAIN, 'x-forwarded-host': env.WANGMAI_DOMAIN,
  'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.8', cookie: 'session=synthetic',
  forwarded: 'for=evil;proto=http;host=evil.invalid', 'x-real-ip': '203.0.113.66', 'x-wangmai-client-ip': '203.0.113.66',
  'x-forwarded-port': '1234', 'cf-connecting-ip': '203.0.113.66', 'true-client-ip': '203.0.113.66' };
function check(overrides = {}, peer = '::ffff:192.0.2.10', extraRaw = []) {
  const values = { ...headers, ...overrides };
  const req = { socket: { remoteAddress: peer }, method: 'POST', url: '/api/auth/callback/google?state=a%2Bb&state=second',
    headers: values, rawHeaders: [...Object.entries(values).flat(), ...extraRaw] };
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, writeHead(status) { this.status = status; }, end() {} };
  return { allowed: guardRequest(req, res, configuration(env)), req, res };
}
test('startup fails closed on every unverified condition, wrong mode, public bind and broad CIDR', () => {
  for (const key of Object.keys(env)) assert.throws(() => configuration({ ...env, [key]: '' }), key);
  for (const cidr of ['0.0.0.0/0', '10.0.0.0/8', '192.168.0.0/16', '192.0.2.1/24', '127.0.0.1/32', '::/0', '192.0.2.10', '192.0.2.10/32\n']) {
    assert.throws(() => configuration({ ...env, WANGMAI_GATEWAY_CIDRS: cidr }), cidr);
  }
  for (const ip of ['0.0.0.0', '127.0.0.1', '203.0.113.1', '::']) assert.throws(() => configuration({ ...env, WANGMAI_ORIGIN_BIND_IP: ip }));
});
test('untrusted socket peers cannot forge trusted headers', () => {
  for (const peer of ['192.0.2.11', '127.0.0.1', '::1', '::ffff:203.0.113.66']) assert.equal(check({}, peer).res.status, 403);
});
test('reject ambiguous, missing and spoofed forwarded headers and Host', () => {
  for (const domain of ['wangmai.public.cloud.ce-nacl.com', 'wangmai.ce-nacl.com']) {
    assert.equal(check({ host: domain }).res.status, 421);
    assert.equal(check({ 'x-forwarded-host': domain }).res.status, 400);
  }
  for (const [key, value, status] of [['host', 'evil.invalid', 421], ['host', env.WANGMAI_DOMAIN + ':3000', 421],
    ['x-forwarded-host', 'evil.invalid', 400], ['x-forwarded-proto', 'http', 400], ['x-forwarded-proto', 'https, http', 400],
    ['x-forwarded-for', '203.0.113.66, 198.51.100.8', 400], ['x-forwarded-for', 'unknown', 400], ['x-forwarded-for', 'fe80::1%eth0', 400],
    ['x-forwarded-for', '', 400], ['connection', 'x-wangmai-client-ip', 400]]) assert.equal(check({ [key]: value }).res.status, status);
  for (const name of ['host', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-for']) assert.equal(check({}, undefined, [name, headers[name]]).allowed, false);
});
test('sanitation retains URI, method, cookies and only the verified single client address', () => {
  for (const client of ['198.51.100.8', '2001:db8::8']) {
    const result = check({ 'x-forwarded-for': client });
    assert.equal(result.allowed, true);
    assert.equal(result.req.headers['x-wangmai-client-ip'], client);
    assert.equal(result.req.headers['x-forwarded-for'], client);
    assert.equal(result.req.headers.cookie, 'session=synthetic');
    assert.equal(result.req.method, 'POST');
    assert.equal(result.req.url, '/api/auth/callback/google?state=a%2Bb&state=second');
    for (const key of ['forwarded', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip']) assert.equal(result.req.headers[key], undefined);
    assert.equal(result.req.headers['x-forwarded-port'], '443');
  }
});
test('real socket requests are rejected before application listeners and Expect continue', async () => {
  let calls = 0;
  const server = attachGuard(http.createServer((_req, res) => { calls++; res.end('unsafe'); }), configuration(env));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const expect of [undefined, '100-continue']) {
      const status = await new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api', method: 'POST',
          headers: { ...headers, ...(expect ? { expect } : {}) } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
        req.on('error', reject); req.end('private body');
      });
      assert.equal(status, 403);
    }
    assert.equal(calls, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('original API URI restoration is bounded to the fixed internal rewrite destination', () => {
  const path = '/api/echo/?state=a%2bb&key=1&state=2&empty=';
  const options = { hostname: 'backend', port: 4000, path: '/api/echo?normalized=1', headers: { 'x-wangmai-original-uri': path, cookie: 'fixture=1' } };
  const outgoing = preserveAPIURI(options);
  assert.equal(outgoing.path, path);
  assert.equal(outgoing.headers['x-wangmai-original-uri'], undefined);
  assert.equal(outgoing.headers.cookie, 'fixture=1');
  for (const override of [{ hostname: 'evil.invalid' }, { port: 80 }, { headers: { 'x-wangmai-original-uri': '//evil.invalid/' } },
    { headers: { 'x-wangmai-original-uri': '/api/\r\ninjected' } }]) {
    const other = { ...options, ...override }; assert.equal(preserveAPIURI(other), other);
  }
});
