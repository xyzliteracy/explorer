import { mkdir, readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { cloneDocument, compactPrimitive, dedup, dequantize, normals, getBounds, getTextureColorSpace, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3d';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';

const [input, output] = process.argv.slice(2);
if (!input || !output || path.resolve(input) === path.resolve(output)) throw Error('Usage: npm run assets:prepare -- INPUT_DIRECTORY OUTPUT_DIRECTORY (must differ)');
await mkdir(output, { recursive: true });
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const triangleCount = document => document.getRoot().listMeshes().reduce((total, mesh) => total + mesh.listPrimitives().reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 3, 0), 0);
const report = [];
const declarations = [];
for (const name of (await readdir(input)).filter(name => /\.glb$/i.test(name)).sort()) {
  console.log(`Preparing ${name}`);
  const source = await io.read(path.join(input, name));
  if (source.getRoot().listSkins().length || source.getRoot().listAnimations().length || source.getRoot().listMeshes().some(mesh => mesh.listPrimitives().some(primitive => primitive.listTargets().length))) throw Error(`${name}: animated, skinned, or morphing models require an authored LOD pipeline.`);
  for (const camera of source.getRoot().listCameras()) camera.dispose();
  source.getRoot().listExtensionsUsed().find(extension => extension.extensionName === 'KHR_lights_punctual')?.dispose();
  const originalTriangles = triangleCount(source);
  const bounds = getBounds(source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0]);
  const originalTextures = source.getRoot().listTextures().map(texture => ({ size: texture.getSize(), bytes: texture.getImage()?.byteLength ?? 0 }));
  for (const extension of source.getRoot().listExtensionsUsed()) if (['KHR_draco_mesh_compression', 'EXT_meshopt_compression'].includes(extension.extensionName)) extension.dispose();
  const stem = name.replace(/\.glb$/i, '');
  const record = { name, originalBytes: (await stat(path.join(input, name))).size, originalTriangles, originalTextures, levels: {} };
  for (const [level, target, resolution] of [['preview', 8000, 0], ['standard', 20000, 512], ['detail', 60000, 1024]]) {
    const doc = cloneDocument(source);
    for (const scene of doc.getRoot().listScenes()) scene.setExtras({ ...scene.getExtras(), xyzFitBounds: bounds });
    if (!resolution) {
      for (const texture of doc.getRoot().listTextures()) texture.dispose();
      // Texture seams and tangents are unnecessary in an untextured preview.
      for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
        primitive.setAttribute('TEXCOORD_0', null).setAttribute('TEXCOORD_1', null).setAttribute('TANGENT', null).setAttribute('NORMAL', null);
      }
    }
    await doc.transform(dedup(), dequantize(), weld());
    if (resolution) {
      for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
        const indices = primitive.getIndices(), positions = primitive.getAttribute('POSITION');
        if (!indices || !positions || primitive.getMode() !== 4) throw Error('Preparation currently requires indexed triangle meshes.');
        const attributes = ['NORMAL', 'TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0'].map(name => primitive.getAttribute(name)).filter(Boolean);
        const stride = attributes.reduce((sum, attribute) => sum + attribute.getElementSize(), 0);
        const data = new Float32Array(positions.getCount() * stride);
        const weights = attributes.flatMap(attribute => Array(attribute.getElementSize()).fill(attribute.getType() === 'VEC2' ? .25 : .5));
        for (let vertex = 0; vertex < positions.getCount(); vertex++) {
          let offset = vertex * stride;
          for (const attribute of attributes) { const element = attribute.getElement(vertex, []); data.set(element, offset); offset += element.length; }
        }
        const targetCount = Math.max(3, Math.floor(indices.getCount() * Math.min(1, target / originalTriangles) / 3) * 3);
        const [simplified] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(indices.getArray()), new Float32Array(positions.getArray()), 3, data, stride, weights, null, targetCount, .02, ['Prune']);
        primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(simplified).setBuffer(indices.getBuffer()));
        compactPrimitive(primitive);
      }
    } else {
      await doc.transform(simplify({ simplifier: { ...MeshoptSimplifier, simplify: (indices, positions, stride, count, error) => MeshoptSimplifier.simplify(indices, positions, stride, count, error, ['Prune', 'Permissive']) }, ratio: Math.min(1, target / originalTriangles), error: .1 }));
    }
    await doc.transform(prune());
    let triangles = triangleCount(doc);
    // Scan topology can prevent edge-collapse simplification from reaching a tiny preview.
    // Vertex clustering is reserved for untextured previews; standard/detail preserve UVs.
    if (!resolution && triangles > target * 2) {
      for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
        const indices = primitive.getIndices();
        const positions = primitive.getAttribute('POSITION');
        if (!indices || !positions) continue;
        const count = Math.max(3, Math.floor(target * 3 * (indices.getCount() / 3) / triangles / 3) * 3);
        const [simplified] = MeshoptSimplifier.simplifySloppy(new Uint32Array(indices.getArray()), new Float32Array(positions.getArray()), 3, null, count, 1);
        primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(simplified).setBuffer(indices.getBuffer()));
        compactPrimitive(primitive);
      }
      await doc.transform(prune());
      triangles = triangleCount(doc);
    }
    if (triangles < 1 || triangles > (resolution ? 500000 : target * 2)) throw Error(`${name} ${level}: simplifier retained ${triangles} triangles; author a manual LOD.`);
    if (triangles > target * 2) console.warn(`${name} ${level}: preserving UV seams requires ${triangles} triangles (target ${target}). Runtime admission will retain a preview when needed.`);
    if (!resolution) await doc.transform(normals({ overwrite: true }));
    if (resolution && doc.getRoot().listTextures().length) {
      doc.createExtension(KHRTextureBasisu).setRequired(true);
      for (const texture of doc.getRoot().listTextures()) {
        const srgb = getTextureColorSpace(texture) === 'srgb';
        const png = await sharp(texture.getImage()).resize({ width: resolution, height: resolution, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
        texture.setImage(await encodeToKTX2(new Uint8Array(png), { isUASTC: true, enableDebug: false, generateMipmap: true, isPerceptual: srgb, isSetKTX2SRGBTransferFunc: srgb, isYFlip: false, imageDecoder: async buffer => { const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8Array(data), width: info.width, height: info.height }; } })).setMimeType('image/ktx2');
      }
    }
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const file = `${stem}.${level}.glb`;
    await io.write(path.join(output, file), doc);
    record.levels[level] = { file, triangles, bytes: (await stat(path.join(output, file))).size, textures: doc.getRoot().listTextures().map(texture => texture.getSize()) };
    console.log(`  ${level}: ${triangles.toLocaleString()} triangles; ${(record.levels[level].bytes / 1024).toFixed(0)} KiB`);
  }
  const index = report.length, x = (index % 5) * 2, z = Math.floor(index / 5) * 2;
  declarations.push(`"Model${index}/+${x}+1/+0+1/+${z}+1":"model: ${stem}.standard.glb; model-preview: ${stem}.preview.glb; model-detail: ${stem}.detail.glb; model-align: floor"`);
  report.push(record);
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(output, 'performance.xyz'), declarations.join('\n') + '\n');
}
