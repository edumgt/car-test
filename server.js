// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
function getCliArg(name) {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === `--${name}` && i + 1 < args.length) {
      return args[i + 1];
    }
    if (arg.startsWith(`--${name}=`)) {
      return arg.slice(name.length + 3);
    }
  }
  return void 0;
}
function resolvePort() {
  const cliPort = Number(getCliArg("port"));
  if (Number.isInteger(cliPort) && cliPort > 0) {
    return cliPort;
  }
  const defaultAppPort = Number(process.env.DEFAULT_APP_PORT) || 3e3;
  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT);
  if (Number.isInteger(envPort) && envPort > 0) {
    if (Number.isInteger(nginxPort) && envPort === nginxPort) {
      return defaultAppPort;
    }
    return envPort;
  }
  return defaultAppPort;
}
async function startServer() {
  const app = express();
  const PORT = resolvePort();
  const HOST = getCliArg("host") || process.env.HOST || "0.0.0.0";
  const isProd = process.env.NODE_ENV === "production" || path.extname(__filename) === ".js";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }
  const server = app.listen(PORT, HOST, () => {
    console.log(`\uD55C\uAD6D \uC6B4\uC804\uBA74\uD5C8 \uAE30\uB2A5\uC2DC\uD5D8 \uC5F0\uC2B5\uC7A5 \uC11C\uBC84 \uC2E4\uD589 \uC911: http://${HOST}:${PORT}`);
  });
  server.on("error", (err) => {
    console.error(`Failed to start server on ${HOST}:${PORT}:`, err);
    process.exit(1);
  });
  function shutdown() {
    server.close(() => process.exit(0));
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    setTimeout(() => process.exit(0), 1e3).unref();
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
startServer();
