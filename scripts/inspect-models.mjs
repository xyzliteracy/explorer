import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3d';

const [input, output, flag] = process.argv.slice(2);
if (!input || !output || (flag && flag !== '--strict')) throw Error('Usage: npm run assets:inspect -- INPUT_DIRECTORY REPORT.json [--strict]');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder,
});
const budgets = { triangles: 60000, drawCalls: 32, textureDimension: 1024, estimatedBytes: 32 * 1024 * 1024 };
const assets = [];
for (const name of (await readdir(input)).filter(name => /\.glb$/i.test(name)).sort()) {
  const file = path.join(input, name);
  const doc = await io.read(file), root = doc.getRoot();
  const textures = root.listTextures().map(texture => {
    const [width, height] = texture.getSize() ?? [0, 0];
    return { name: texture.getName(), width, height, mimeType: texture.getMimeType(), encodedBytes: texture.getImage()?.byteLength ?? 0,
      // Conservative RGBA fallback including mipmaps; KTX2's actual device format varies.
      estimatedBytes: Math.ceil(width * height * 4 * 4 / 3) };
  });
  let triangles = 0, drawCalls = 0;
  for (const node of root.listNodes()) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    drawCalls++;
    const count = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0;
    triangles += primitive.getMode() === 4 ? count / 3 : primitive.getMode() === 5 || primitive.getMode() === 6 ? Math.max(0, count - 2) : 0;
  }
  const geometryAccessors = new Set();
  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    for (const accessor of [...primitive.listAttributes(), primitive.getIndices(), ...primitive.listTargets().flatMap(target => target.listAttributes())]) if (accessor) geometryAccessors.add(accessor);
  }
  const geometryBytes = [...geometryAccessors].reduce((sum, accessor) => sum + (accessor.getArray()?.byteLength ?? 0), 0);
  const animationAccessors = new Set(root.listAnimations().flatMap(animation => animation.listSamplers().flatMap(sampler => [sampler.getInput(), sampler.getOutput()])).filter(Boolean));
  const animationBytes = [...animationAccessors].reduce((sum, accessor) => sum + (accessor.getArray()?.byteLength ?? 0), 0);
  const estimatedBytes = geometryBytes + textures.reduce((sum, texture) => sum + texture.estimatedBytes, 0);
  const warnings = [];
  if (triangles > budgets.triangles) warnings.push('Triangle budget exceeded');
  if (drawCalls > budgets.drawCalls) warnings.push('Draw-call budget exceeded');
  if (estimatedBytes > budgets.estimatedBytes) warnings.push('Estimated geometry/texture budget exceeded');
  if (textures.some(texture => Math.max(texture.width, texture.height) > budgets.textureDimension)) warnings.push('Texture dimension budget exceeded');
  assets.push({ file: name, encodedBytes: (await stat(file)).size, triangles, drawCalls, geometryBytes, estimatedBytes, textures,
    animations: root.listAnimations().length, animationBytes, cameras: root.listCameras().length,
    lights: root.listNodes().filter(node => node.getExtension('KHR_lights_punctual')).length, warnings });
}
await writeFile(output, JSON.stringify({ budgets, estimate: 'Conservative RGBA plus mipmaps; excludes transient decode, framebuffers, and JS overhead.', assets }, null, 2) + '\n');
console.log(`Inspected ${assets.length} models; ${assets.filter(asset => asset.warnings.length).length} exceed recommended per-model budgets.`);
if (flag === '--strict' && assets.some(asset => asset.warnings.length)) process.exitCode = 1;
