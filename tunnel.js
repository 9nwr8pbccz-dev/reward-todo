/**
 * 公网隧道 — 把本地服务暴露到公网
 * 用法: node tunnel.js
 */
const localtunnel = require('localtunnel');

(async () => {
  const tunnel = await localtunnel({ port: 3456 });

  console.log('========================================');
  console.log('  🌐 公网地址（分享给同学）:');
  console.log(`  ${tunnel.url}`);
  console.log('');
  console.log('  服务器地址（在 App 设置里填）:');
  console.log(`  ${tunnel.url}`);
  console.log('========================================');

  tunnel.on('close', () => {
    console.log('隧道已关闭');
  });
})();
