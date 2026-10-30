import http from 'node:http';
http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': [
      'fixture=one; Secure; HttpOnly; SameSite=Lax; Path=/', 'fixture2=two; Secure; HttpOnly; SameSite=Lax; Path=/' ] });
    res.end(JSON.stringify({ service: 'synthetic-upstream', url: req.url, method: req.method, headers: req.headers, body }));
  });
}).listen(4000, '0.0.0.0');
