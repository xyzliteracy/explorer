import { SURFACE_FACES } from './boxSurfaceParser';
import type { SurfaceFace } from './types';
import type { XyzDslPropertyDeclaration } from './propertyParser';
export interface SurfaceAttachment { faces: SurfaceFace[]; explicit: boolean; invalid?: boolean }
export function parseSurfaceAttachment(declarations: XyzDslPropertyDeclaration[], diagnostics: string[]): SurfaceAttachment | undefined {
  const raw = declarations.filter(d => d.property === 'surface').at(-1)?.value;
  if (raw === undefined) return undefined;
  const faces = raw === 'all' ? SURFACE_FACES : raw === 'walls' ? ['left','front','right','back'] as SurfaceFace[] : raw.split(',').map(s => s.trim()) as SurfaceFace[];
  const invalid = !faces.length || faces.some(f => !SURFACE_FACES.includes(f)) || new Set(faces).size !== faces.length;
  if (invalid) diagnostics.push('surface requires all, walls, or distinct comma-separated face names.');
  return { faces, explicit: raw !== 'all' && raw !== 'walls', invalid };
}
export function surfaceFrame(face: SurfaceFace, size: number[], inset: number[]) {
  const [w,h,d] = size, [x,y,z] = inset;
  const frames = {
    front: { position: [x,y,z], rotation: [0,0,0], size: [w,h,d] },
    back: { position: [x+w,y,z+d], rotation: [0,Math.PI,0], size: [w,h,d] },
    left: { position: [x,y,z+d], rotation: [0,Math.PI/2,0], size: [d,h,w] },
    right: { position: [x+w,y,z], rotation: [0,-Math.PI/2,0], size: [d,h,w] },
    top: { position: [x,y+h,z], rotation: [Math.PI/2,0,0], size: [w,d,h] },
    bottom: { position: [x,y,z+d], rotation: [-Math.PI/2,0,0], size: [w,d,h] },
  };
  return frames[face];
}
