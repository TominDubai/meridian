module.exports = {
  apps: [
    {
      name: "meridian-app",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "node",
      cwd: "/opt/meridian-bot",
      restart_delay: 3000,
      max_restarts: 10,
      autorestart: true,
      watch: false,
      env: { NODE_ENV: "production", PORT: "4000" },
    },
    {
      name: "meridian-bridge",
      script: "node_modules/tsx/dist/cli.cjs",
      args: "scripts/ibkr-bridge.ts",
      interpreter: "node",
      cwd: "/opt/meridian-bot",
      restart_delay: 3000,
      max_restarts: 20,
      autorestart: true,
      watch: false,
      env: { NODE_ENV: "production" },
    },
  ],
};
