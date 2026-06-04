const localtunnel = require('localtunnel');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const URL_FILE = path.join(__dirname, 'public', 'tunnel-url.txt');
const URL2_FILE = path.join(__dirname, 'public', 'tunnel-url-2.txt');

// Tunnel 1: localtunnel
async function startLT() {
  try {
    const t = await localtunnel({ port: 3456 });
    fs.writeFileSync(URL_FILE, t.url);
    console.log('LT: ' + t.url);
    t.on('close', () => setTimeout(startLT, 3000));
    t.on('error', () => setTimeout(startLT, 3000));
    setTimeout(() => { t.close(); startLT(); }, 25 * 60 * 1000); // 25min refresh
  } catch(e) { console.log('LT err:', e.message); setTimeout(startLT, 5000); }
}

// Tunnel 2: pinggy backup
function startPinggy() {
  const c = spawn('ssh', ['-o','StrictHostKeyChecking=no','-o','ConnectTimeout=10','-R','0:localhost:3456','-p','443','a.pinggy.io']);
  let buf = '';
  c.stdout.on('data', d => { buf += d; checkPinggy(); });
  c.stderr.on('data', d => { buf += d; checkPinggy(); });
  function checkPinggy() {
    const m = buf.match(/https?:\/\/[a-z0-9-]+\.run\.pinggy-free\.link/);
    if (m) { fs.writeFileSync(URL2_FILE, m[0]); console.log('PG: ' + m[0]); }
  }
  c.on('close', () => setTimeout(startPinggy, 5000));
  setTimeout(() => { c.kill(); startPinggy(); }, 50 * 60 * 1000);
}

startLT();
startPinggy();
console.log('🔄 双隧道已启动');
