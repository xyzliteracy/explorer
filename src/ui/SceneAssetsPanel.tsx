export function SceneAssetsPanel({ isLocal, error, onOpenFolder, onUseRemote }: {
  isLocal: boolean;
  error: string;
  onOpenFolder: (files: File[]) => Promise<void>;
  onUseRemote: () => void;
}) {
  return <>
    <p>Models: {isLocal ? 'local folder' : 'remote store'}</p>
    {isLocal && <button type="button" onClick={onUseRemote}>Use remote model store</button>}
    <label className="scene-folder-input">Open scene folder
      <input type="file" multiple {...{ webkitdirectory: '' }} onChange={event => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        void onOpenFolder(files);
      }} />
    </label>
    <p>Choose a folder containing scene.xyz and its GLB models. Files stay in your browser.</p>
    {error && <p role="alert">{error}</p>}
  </>;
}
