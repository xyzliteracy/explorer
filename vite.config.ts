import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export default defineConfig({
  plugins: [react(), {
    name: 'local-model-test-fixture',
    // Opt-in, dev server only. Never copy private test models into a build.
    configureServer(server) {
      const directory = process.env.XYZ_LOCAL_MODELS_DIR;
      if (!directory) return;
      server.middlewares.use('/__local-models/lepapayer/', async (req, res) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '');
        if (!/^[a-zA-Z0-9_-]+(?:\.(?:preview|standard|detail))?\.glb$/.test(name)) { res.statusCode = 404; res.end(); return; }
        try {
          const root = await realpath(directory);
          const file = await realpath(resolve(root, name));
          if (!file.startsWith(root + sep)) throw Error('Outside fixture directory');
          const info = await stat(file);
          res.setHeader('Content-Type', 'model/gltf-binary');
          res.setHeader('Content-Length', info.size);
          const stream = createReadStream(file);
          stream.on('error', () => res.destroy());
          res.on('close', () => stream.destroy());
          stream.pipe(res);
        } catch { res.statusCode = 404; res.end(); }
      });
    },
  }],
  resolve: { dedupe: ['react', 'react-dom', 'three'] },
});
