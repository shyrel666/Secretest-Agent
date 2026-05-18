import { createServer } from 'http';
import path from 'path';
import { parse } from 'url';
import next from 'next';

const projectDir = path.resolve(__dirname, '..');
const isCompiledServer = __filename.includes(`${path.sep}dist${path.sep}`);
const dev = !isCompiledServer && process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '10929', 10);

if (!process.env.NODE_ENV) {
  (process.env as Record<string, string | undefined>)['NODE_ENV'] = dev
    ? 'development'
    : 'production';
}

// Next 16 defaults custom dev servers to Turbopack. In this Windows + pnpm
// workspace it intermittently panics while writing app endpoints, so dev uses
// webpack explicitly while production keeps the default server behavior.
const app = next({
  dev,
  dir: projectDir,
  hostname,
  port,
  ...(dev ? { webpack: true } : {}),
});
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${process.env.NODE_ENV}`,
    );
  });
});
