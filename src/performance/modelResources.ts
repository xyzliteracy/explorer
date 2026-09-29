import { Texture, type Material, type Mesh } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export function modelResources(model: Pick<GLTF, 'scenes'>) {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const skeletons = new Set<import('three').Skeleton>();
  let triangles = 0;
  for (const scene of new Set(model.scenes)) scene.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    triangles += (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3;
    geometries.add(geometry);
    if ('skeleton' in mesh) skeletons.add(mesh.skeleton as import('three').Skeleton);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  return { geometries, materials, textures, skeletons, triangles };
}

export function estimateModel(model: Pick<GLTF, 'scenes'>) {
  const resources = modelResources(model);
  const buffers = new Set<ArrayBufferLike>();
  for (const geometry of resources.geometries) {
    for (const attribute of [...Object.values(geometry.attributes), ...Object.values(geometry.morphAttributes).flat(), geometry.index]) {
      if (!attribute) continue;
      const array = 'data' in attribute ? attribute.data.array : attribute.array;
      buffers.add(array.buffer);
    }
  }
  let bytes = [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
  for (const texture of resources.textures) {
    if ('isCompressedTexture' in texture && texture.isCompressedTexture) {
      bytes += texture.mipmaps.reduce((sum, mip) => sum + ((mip as { data?: Uint8Array }).data?.byteLength ?? 0), 0);
    } else {
      const image = texture.image as { width?: number; height?: number } | undefined;
      bytes += (image?.width ?? 0) * (image?.height ?? 0) * 4 * (texture.generateMipmaps ? 4 / 3 : 1);
    }
  }
  return { bytes, triangles: resources.triangles };
}

export function disposeModel(model: Pick<GLTF, 'scenes'>) {
  const { geometries, materials, textures, skeletons } = modelResources(model);
  geometries.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  skeletons.forEach(value => value.dispose());
  const images = new Set<unknown>();
  textures.forEach(texture => { texture.dispose(); images.add(texture.image); });
  images.forEach(image => { if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close(); });
}
