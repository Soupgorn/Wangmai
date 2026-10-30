// Synthetic upstreams only: no database, credentials, user data or request logging.
import http from "node:http";
for (const [service, port] of [["frontend", 3000], ["backend", 4000]]) {
  http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.setHeader("set-cookie", ["fixture=one; Secure; HttpOnly; SameSite=Lax; Path=/", "fixture2=two; Secure; Path=/"]);
    res.end(JSON.stringify({ service, url: req.url, method: req.method, headers: req.headers }));
  }).listen(port, "0.0.0.0");
}
