module.exports = {
  apps: [
    {
      name: 'reward-proxy',
      script: 'proxy.js',
      restart_delay: 3000,
      max_restarts: 50,
    },
    {
      name: 'reward-server',
      script: 'server.js',
      restart_delay: 3000,
      max_restarts: 100,
      max_memory_restart: '200M',
      env: { NODE_ENV: 'production', PORT: 3456 },
    },
    {
      name: 'reward-tunnel',
      script: 'keepalive.js',
      restart_delay: 5000,
      max_restarts: 200,
    }
  ]
};
