const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const URL_FILE = path.join(__dirname, 'public', 'tunnel-url.txt');

let currentPID = null;

function killOld() {
  try { execSync('pkill -f "ssh.*serveo"', { timeout: 3000 }); } catch {}
  try { execSync('pkill -f "ssh.*pinggy"', { timeout: 3000 }); } catch {}
  if (currentPID) { try { process.kill(currentPID, 'SIGKILL'); } catch {} }
}

function start() {
  killOld();

  const child = spawn('ssh', [
    '-o','StrictHostKeyChecking=no','-o','ServerAliveInterval=30','-o','ConnectTimeout=10',
    '-R','0:localhost:3456','-p','443','a.pinggy.io'
  ], { stdio: ['pipe','pipe','pipe'] });

  currentPID = child.pid;
  fs.writeFileSync(URL_FILE, '连接中...');

  child.stdout.on('data', (data) => {
    const m = data.toString().match(/https?:\/\/[a-z0-9-]+\.run\.pinggy-free\.link/);
    if (m) { fs.writeFileSync(URL_FILE, m[0]); console.log('🌐 ' + m[0]); }
  });

  child.stderr.on('data', (data) => {
    const m = data.toString().match(/https?:\/\/[a-z0-9-]+\.run\.pinggy-free\.link/);
    if (m) { fs.writeFileSync(URL_FILE, m[0]); console.log('🌐 ' + m[0]); }
  });

  child.on('close', (code) => {
    console.log('断开('+code+'), 5秒后重连');
    fs.writeFileSync(URL_FILE, '等待重连...');
    setTimeout(start, 5000);
  });

  child.on('error', (e) => {
    console.log('错误:', e.message);
    setTimeout(start, 5000);
  });

  // 50min refresh
  setTimeout(() => { killOld(); start(); }, 50 * 60 * 1000);
}

console.log('🚀 隧道启动');
start();
