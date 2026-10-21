import { ModelAssetStore } from './ModelAssetStore';

/** One uncapped original at a time, with no idle retention after deselection.
 * The single loader slot lets an obsolete decode finish and dispose before
 * starting the next original; GLTF decoding itself cannot be cancelled.
 */
export class SelectedModelAssetStore extends ModelAssetStore {
  private releaseSelection?: () => void;
  override acquire(url: string, priority = 0, claim = Symbol(url), renderPriority = priority) {
    this.releaseSelection?.();
    const release = super.acquire(url, priority, claim, renderPriority);
    this.releaseSelection = release;
    return () => {
      release();
      if (this.releaseSelection === release) this.releaseSelection = undefined;
    };
  }
}
export const SELECTED_MODEL_BUDGET = { bytes: Infinity, triangles: Infinity, concurrent: 1, idleMs: 0 };
