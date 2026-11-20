import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCliArg(name: string): string | undefined {
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
  return undefined;
}

function resolvePort(): number {
  const cliPort = Number(getCliArg('port'));
  if (Number.isInteger(cliPort) && cliPort > 0) {
    return cliPort;
  }
  const defaultAppPort = Number(process.env.DEFAULT_APP_PORT) || 3000;
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
  const HOST = getCliArg('host') || process.env.HOST || '0.0.0.0';
  const isProd = process.env.NODE_ENV === 'production' || path.extname(__filename) === '.js';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`한국 운전면허 기능시험 연습장 서버 실행 중: http://${HOST}:${PORT}`);
  });

  server.on('error', (err) => {
    console.error(`Failed to start server on ${HOST}:${PORT}:`, err);
    process.exit(1);
  });

  function shutdown() {
    server.close(() => process.exit(0));
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    setTimeout(() => process.exit(0), 1000).unref();
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer();
