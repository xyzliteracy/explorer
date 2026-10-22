import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { Matrix4, Float32BufferAttribute, type BufferGeometry, type Mesh, type Object3D } from 'three';
import { matrixFromTransform } from '../model/transform';
import type { SpatialNode } from '../model/SpatialNode';
import type { ModelFitTransform } from './modelFit';
import { brushFor } from './csgGeometry';

/** Instance-owned static mesh CSG, after asset orientation and fitting. Shared GLB buffers stay untouched. */
export function cutModelInstance(scene: Object3D, node: SpatialNode, fitted: ModelFitTransform) {
  const result = scene.clone(true);
  const owned = new Set<BufferGeometry>();
  const operations = node.modelCsgOperations ?? [];
  const meshes: Mesh[] = [];
  result.traverse(object => { if ('isMesh' in object) meshes.push(object as Mesh); });
  const work = meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position?.count ?? 0) / 3, 0) * operations.length;
  if (work > 2000000) throw new Error('Model CSG exceeds the 2,000,000 triangle-operation budget per instance.');
  result.updateMatrixWorld(true);
  const fitMatrix = new Matrix4().makeScale(...fitted.scale).multiply(new Matrix4().makeTranslation(...fitted.position));
  const placement = matrixFromTransform(node.transform).multiply(fitMatrix);
  try {
    meshes.forEach((mesh, meshIndex) => {
      if ('isSkinnedMesh' in mesh || 'isInstancedMesh' in mesh || Object.keys(mesh.geometry.morphAttributes).length) throw new Error('Model CSG requires static meshes without skinning, instancing or morph targets.');
      const matrix = placement.clone().multiply(mesh.matrixWorld);
      const inverse = matrix.clone().invert();
      const geometry = mesh.geometry.clone(); owned.add(geometry);
      // Quantized GLBs store normalized integers (often interleaved). World
      // coordinates overflow those buffers, and CSG interpolates raw arrays.
      // Decode on this instance-owned copy before transforming or evaluating.
      for (const name of ['position', 'normal', 'uv', 'uv1', 'color', 'tangent']) {
        const attribute = geometry.getAttribute(name);
        if (!attribute || (attribute.array instanceof Float32Array && !attribute.normalized && !('isInterleavedBufferAttribute' in attribute))) continue;
        const values = new Float32Array(attribute.count * attribute.itemSize);
        for (let i = 0; i < attribute.count; i++) {
          for (let component = 0; component < attribute.itemSize; component++) {
            values[i * attribute.itemSize + component] = attribute.getComponent(i, component);
          }
        }
        geometry.setAttribute(name, new Float32BufferAttribute(values, attribute.itemSize));
      }
      geometry.applyMatrix4(matrix);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      // Untextured GLB primitives may legitimately omit UVs; supply neutral cutter attributes.
      if (!geometry.attributes.uv) geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
      let current = new Brush(geometry, mesh.material); current.updateMatrixWorld(true);
      for (const operation of operations) {
        if (operation.op === 'union' && meshIndex !== 0) continue;
        const tool = brushFor(operation.tool);
        tool.material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        tool.geometry.clearGroups();
        tool.geometry.addGroup(0, tool.geometry.index?.count ?? tool.geometry.attributes.position.count, 0);
        const attributes = ['position', 'normal', 'uv', ...['uv1', 'color', 'tangent'].filter(name => current.geometry.hasAttribute(name))];
        for (const name of attributes) {
          if (tool.geometry.hasAttribute(name)) continue;
          const itemSize = current.geometry.getAttribute(name).itemSize;
          const values = new Float32Array(tool.geometry.attributes.position.count * itemSize);
          if (name === 'color') values.fill(1);
          if (name === 'tangent') for (let i = 0; i < values.length; i += itemSize) { values[i] = 1; values[i + 3] = 1; }
          tool.geometry.setAttribute(name, new Float32BufferAttribute(values, itemSize));
        }
        const evaluator = new Evaluator(); evaluator.attributes = attributes;
        try {
          const next = evaluator.evaluate(current, tool, operation.op === 'union' ? ADDITION : operation.op === 'intersection' ? INTERSECTION : SUBTRACTION);
          owned.add(next.geometry);
          current = next;
        } finally { tool.geometry.dispose(); }
      }
      current.geometry.applyMatrix4(inverse);
      current.geometry.computeBoundingBox(); current.geometry.computeBoundingSphere();
      mesh.geometry = current.geometry; mesh.material = current.material;
    });
    // Only result buffers need to survive the memo lifetime.
    const retained = new Set(meshes.map(mesh => mesh.geometry));
    for (const geometry of owned) if (!retained.has(geometry)) { geometry.dispose(); owned.delete(geometry); }
    return { scene: result, dispose: () => owned.forEach(geometry => geometry.dispose()) };
  } catch (error) { owned.forEach(geometry => geometry.dispose()); throw error; }
}
