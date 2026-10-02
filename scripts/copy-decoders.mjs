import { cspSafeBasis } from './basis-csp.mjs';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
for (const [directory, files] of Object.entries({ draco: ['draco_wasm_wrapper.js', 'draco_decoder.wasm', 'draco_decoder.js'], basis: ['basis_transcoder.js', 'basis_transcoder.wasm'] })) {
  await mkdir(`public/decoders/${directory}`, { recursive: true });
  for (const file of files) await copyFile(`node_modules/three/examples/jsm/libs/${directory === 'draco' ? 'draco/gltf' : directory}/${file}`, `public/decoders/${directory}/${file}`);
}

const basisPath = 'public/decoders/basis/basis_transcoder.js';
await writeFile(basisPath, cspSafeBasis(await readFile(basisPath, 'utf8')));

await mkdir('public/fonts', { recursive: true });
await copyFile('node_modules/three/examples/fonts/ttf/kenpixel.ttf', 'public/fonts/kenpixel.ttf');
