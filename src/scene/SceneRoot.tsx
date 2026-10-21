import { SceneRoot as CoreSceneRoot } from './CoreSceneRoot';
import { AssetResolver } from '../assets';
import { resolveModelUrl } from './remoteModelUrl';
import type { ComponentProps } from 'react';
export function SceneRoot({ resolveAsset = resolveModelUrl, ...props }: ComponentProps<typeof CoreSceneRoot> & { resolveAsset?: (source: string) => string }) {
  return <AssetResolver.Provider value={resolveAsset}><CoreSceneRoot {...props} /></AssetResolver.Provider>;
}
