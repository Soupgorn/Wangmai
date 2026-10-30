// Runs inside the disposable client against real production Next rewrites.
import assert from 'node:assert/strict';
import http from 'node:http';

function request(path, { method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'frontend', port: 3000, path, method, headers: {
      host: 'wangmai.invalid', 'x-forwarded-host': 'wangmai.invalid', 'x-forwarded-proto': 'https',
      'x-forwarded-for': '198.51.100.8', 'content-length': Buffer.byteLength(body), cookie: 'session=synthetic-cookie', ...headers,
    } }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject); req.end(body);
  });
}
if (process.argv[2] === 'failure') {
  assert.ok((await request('/api/auth/callback/google?code=private-proxy-failure-marker&state=private-failure-state')).status >= 500);
} else if (process.argv[2] === 'untrusted') {
  assert.equal((await request('/api/health')).status, 403, 'Actual non-gateway socket peer cannot spoof trusted headers');
} else {
  const callback = '/api/auth/callback/google?code=synthetic-oauth-marker&state=a%2Bb&state=second&scope=openid%20email';
  for (const path of ['/api', '/api/', '/api/echo/?key=a%2bb&other=1&key=second&empty=', callback]) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? '{"marker":"synthetic-body"}' : '';
      const response = await request(path, { method, body, headers: { 'content-type': 'application/json',
        forwarded: 'for=evil;proto=http;host=evil.invalid', 'x-real-ip': '203.0.113.66', 'x-wangmai-client-ip': '203.0.113.66' } });
      assert.equal(response.status, 200, `${method} ${path}`);
      assert.equal(response.headers['set-cookie'].length, 2, 'Every Set-Cookie survives independently');
      assert.match(response.headers['set-cookie'][0], /Secure; HttpOnly; SameSite=Lax/);
      if (method === 'HEAD') { assert.equal(response.text, ''); continue; }
      const echo = JSON.parse(response.text);
      assert.equal(echo.method, method);
      assert.equal(echo.url, path, "Original path and query bytes survive the production rewrite");
      assert.equal(new URL(echo.url, 'http://backend').pathname, new URL(path, 'http://backend').pathname);
      assert.deepEqual([...new URL(echo.url, 'http://backend').searchParams], [...new URL(path, 'http://backend').searchParams]);
      assert.equal(echo.body, body);
      assert.equal(echo.headers.cookie, 'session=synthetic-cookie');
      assert.equal(echo.headers['x-forwarded-host'], 'wangmai.invalid');
      assert.equal(echo.headers['x-forwarded-proto'], 'https');
      assert.equal(echo.headers['x-wangmai-client-ip'], '198.51.100.8');
      assert.equal(echo.headers['x-wangmai-original-uri'], undefined);
      assert.equal(echo.headers.forwarded, undefined);
      assert.equal(echo.headers['x-real-ip'], undefined);
    }
  }
  for (const [key, value, status] of [['host', 'evil.invalid', 421], ['x-forwarded-host', 'evil.invalid', 400],
    ['x-forwarded-proto', 'http', 400], ['x-forwarded-for', '203.0.113.66, 198.51.100.8', 400]]) {
    assert.equal((await request('/api', { headers: { [key]: value } })).status, status);
  }
  for (const path of ['/', '/login', '/apiary']) {
    const response = await request(path);
    assert.equal(response.status, path === '/apiary' ? 404 : 200);
    assert.ok(!response.text.includes('synthetic-upstream'), 'Page routes never rewrite to Hono');
  }
}
console.log(`PASS: provider Next routing ${process.argv[2]}`);
