const localtunnel = require('localtunnel');
const fs = require('fs');
const path = require('path');
const URL_FILE = path.join(__dirname, 'public', 'tunnel-url.txt');

async function connect() {
  try {
    const t = await localtunnel({ port: 3456 });
    fs.writeFileSync(URL_FILE, t.url);
    console.log('🌐 ' + t.url);
    t.on('close', () => setTimeout(connect, 5000));
    t.on('error', () => setTimeout(connect, 5000));
  } catch(e) {
    console.log('重试:', e.message);
    setTimeout(connect, 5000);
  }
}
connect();
