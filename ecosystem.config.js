module.exports = {
  apps: [
    {
      name: 'reward-server',
      script: 'server.js',
      cwd: '/Users/lujinhui/Desktop/reward-todo',
      restart_delay: 3000,
      max_restarts: 100,
      env: { NODE_ENV: 'production', PORT: 3456 },
    },
    {
      name: 'reward-tunnel',
      script: 'keepalive.js',
      cwd: '/Users/lujinhui/Desktop/reward-todo',
      restart_delay: 5000,
      max_restarts: 200,
    }
  ]
};
