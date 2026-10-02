import { SceneRoot as CoreSceneRoot } from '@xyz/viewer/scene/SceneRoot';
import { AssetResolver } from '@xyz/viewer/assets';
import { resolveModelUrl } from './remoteModelUrl';
import type { ComponentProps } from 'react';
export function SceneRoot(props: ComponentProps<typeof CoreSceneRoot>) {
  return <AssetResolver.Provider value={resolveModelUrl}><CoreSceneRoot {...props} /></AssetResolver.Provider>;
}
