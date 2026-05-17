
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
        
        const scadProjectsDir = path.resolve(filesDir, 'scad', 'projects');
        if (!fs.existsSync(scadProjectsDir)) {
          fs.mkdirSync(scadProjectsDir, { recursive: true });
        }

        // GET /api/files - List files
        if (req.method === 'GET' && req.url === '/api/files') {
          const files = fs.readdirSync(filesDir).filter(f => f.endsWith('.dxf'));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(files));
          return;
        }

        // GET /api/files/:name - Read file or list directory
        if (req.method === 'GET' && req.url.startsWith('/api/files/')) {
          const subPath = decodeURIComponent(req.url.substring('/api/files/'.length));
          const filePath = path.join(filesDir, subPath);
          if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              const items = fs.readdirSync(filePath);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(items));
            } else {
              res.setHeader('Content-Type', 'text/plain');
              res.end(fs.readFileSync(filePath, 'utf-8'));
            }
          } else {
            res.statusCode = 404;
            res.end('File or directory not found');
          }
          return;
        }

        // POST /api/files/:name - Write file
        if (req.method === 'POST' && req.url.startsWith('/api/files/')) {
          const subPath = decodeURIComponent(req.url.substring('/api/files/'.length));
          const filePath = path.join(filesDir, subPath);
          const parentDir = path.dirname(filePath);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          const chunks: any[] = [];
          req.on('data', chunk => chunks.push(chunk));
          req.on('end', () => {
            const buffer = Buffer.concat(chunks);
            fs.writeFileSync(filePath, buffer);
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
