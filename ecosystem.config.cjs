module.exports = {
  apps: [
    {
      name: "meridian-bridge",
      script: "node_modules\\tsx\\dist\\cli.cjs",
      args: "scripts/ibkr-bridge.ts",
      interpreter: "node",
      cwd: "C:\\Users\\User\\meridian",
      restart_delay: 3000,
      max_restarts: 20,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
