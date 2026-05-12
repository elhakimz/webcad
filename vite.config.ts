
import { defineConfig, Plugin } from 'vite'
import topLevelAwait from "vite-plugin-top-level-await";
import fs from 'fs';
import path from 'path';

const fileStoragePlugin = (): Plugin => ({
  name: 'file-storage-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.startsWith('/api/files')) {
        const filesDir = path.resolve(__dirname, 'files');
        if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir);

        // GET /api/files - List files
        if (req.method === 'GET' && req.url === '/api/files') {
          const files = fs.readdirSync(filesDir).filter(f => f.endsWith('.dxf'));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(files));
          return;
        }

        // GET /api/files/:name - Read file
        if (req.method === 'GET' && req.url.startsWith('/api/files/')) {
          const fileName = req.url.split('/').pop();
          const filePath = path.join(filesDir, fileName || '');
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'text/plain');
            res.end(fs.readFileSync(filePath, 'utf-8'));
          } else {
            res.statusCode = 404;
            res.end('File not found');
          }
          return;
        }

        // POST /api/files/:name - Write file
        if (req.method === 'POST' && req.url.startsWith('/api/files/')) {
          const fileName = req.url.split('/').pop();
          const filePath = path.join(filesDir, fileName || '');
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            fs.writeFileSync(filePath, body);
            res.end('File saved');
          });
          return;
        }
      }
      next();
    });
  }
});

export default defineConfig({
  plugins: [
    topLevelAwait(),
    fileStoragePlugin()
  ],
  assetsInclude: ["**/*.wasm"],
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
})
