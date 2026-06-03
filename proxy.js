const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const TARGET = 'api.deepseek.com';
const HTTP_PORT = 7443;
const HTTPS_PORT = 4443;

function handleRequest(clientReq, clientRes) {
  const options = {
    hostname: TARGET,
    port: 443,
    path: clientReq.url,
    method: clientReq.method,
    headers: { ...clientReq.headers }
  };
  delete options.headers.host;

  const proxyReq = https.request(options, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });
  proxyReq.on('error', (e) => clientRes.end('Proxy error: ' + e.message));
  clientReq.pipe(proxyReq);
}

// Self-signed cert for HTTPS
const certDir = __dirname;
const certPath = path.join(certDir, 'proxy-cert.pem');
const keyPath = path.join(certDir, 'proxy-key.pem');

// HTTP proxy (for direct use)
http.createServer(handleRequest).listen(HTTP_PORT, () => {
  console.log(`HTTP 代理: http://localhost:${HTTP_PORT}`);
});

// HTTPS proxy (for hosts-based redirect)
try {
  const cert = fs.readFileSync(certPath);
  const key = fs.readFileSync(keyPath);
  https.createServer({ cert, key }, handleRequest).listen(HTTPS_PORT, () => {
    console.log(`HTTPS 代理: https://localhost:${HTTPS_PORT}`);
  });
} catch(e) {
  console.log('HTTPS 证书未就绪，仅 HTTP 模式');
}
