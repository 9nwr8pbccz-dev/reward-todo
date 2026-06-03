const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = '/Users/lujinhui/Desktop/reward-todo/server';

function handle(req, res) {
  const opts = { hostname: 'api.deepseek.com', port: 443, path: req.url, method: req.method, headers: {...req.headers} };
  delete opts.headers.host;
  const pr = https.request(opts, (pres) => { res.writeHead(pres.statusCode, pres.headers); pres.pipe(res); });
  pr.on('error', e => { try { res.statusCode=502; res.end(e.message) } catch {} });
  req.pipe(pr);
}

try {
  const cert = fs.readFileSync(path.join(DIR, 'proxy-cert.pem'));
  const key = fs.readFileSync(path.join(DIR, 'proxy-key.pem'));
  https.createServer({ cert, key }, handle).listen(443, () => console.log('HTTPS 443 → DeepSeek ✅'));
  console.log('代理启动成功！打开 Codex 试试');
} catch(e) {
  console.log('HTTPS 启动失败:', e.message);
}
