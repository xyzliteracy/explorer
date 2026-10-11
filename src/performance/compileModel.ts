import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';

/** Three r181's compileAsync polls indefinitely without cancellation. Own the
 * poll so refresh/context loss stops it before disposed programs are accessed. */
export function compileModel(renderer: WebGLRenderer, scene: Object3D, camera: Camera, signal: AbortSignal, target?: Scene) {
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error) => { clearTimeout(timer); signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(); };
    const abort = () => finish(new DOMException('Shader preparation interrupted', 'AbortError'));
    if (signal.aborted || renderer.getContext().isContextLost()) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    try {
      const materials = renderer.compile(scene, camera, target);
      const poll = () => {
        if (signal.aborted || renderer.getContext().isContextLost()) { abort(); return; }
        try {
          for (const material of materials) {
            const properties = renderer.properties.get(material) as { currentProgram?: { isReady: () => boolean } };
            if (!properties.currentProgram) throw Error('Shader program was disposed during preparation.');
            if (properties.currentProgram.isReady()) materials.delete(material);
          }
          if (!materials.size) finish(); else timer = setTimeout(poll, 10);
        } catch (error) { finish(error instanceof Error ? error : Error(String(error))); }
      };
      timer = setTimeout(poll, 10);
    } catch (error) { finish(error instanceof Error ? error : Error(String(error))); }
  });
}
