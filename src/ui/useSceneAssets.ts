import { useEffect, useRef, useState } from 'react';
import { openSceneBundle } from '../sceneBundle';
import { openLocalScene } from '../localScene';
import { resolveModelUrl } from '../scene/remoteModelUrl';

export function useSceneAssets(onSource: (source: string) => void) {
  const [local, setLocal] = useState<Awaited<ReturnType<typeof openLocalScene>>>();
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => () => local?.close(), [local]);

  const open = async (load: () => ReturnType<typeof openLocalScene>) => {
    const current = ++generation.current;
    try {
      const next = await load();
      if (current !== generation.current) { next.close(); return; }
      setLocal(next);
      onSource(next.source);
      setError('');
    } catch (error) {
      if (current === generation.current) setError(error instanceof Error ? error.message : String(error));
    }
  };
  const openFolder = async (files: File[]) => { if (files.length) await open(() => openLocalScene(files)); };
  const openBundle = (file: File) => open(() => openSceneBundle(file));
  const useRemote = () => {
    generation.current++;
    setLocal(undefined);
    setError('');
  };
  return { isLocal: !!local, resolve: local?.resolve ?? resolveModelUrl, error, openFolder, openBundle, useRemote };
}
