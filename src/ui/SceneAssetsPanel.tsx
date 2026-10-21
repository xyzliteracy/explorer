export function SceneAssetsPanel({ isLocal, error, onOpenFolder, onOpenBundle, onUseRemote }: {
  isLocal: boolean;
  error: string;
  onOpenFolder: (files: File[]) => Promise<void>;
  onOpenBundle: (file: File) => Promise<void>;
  onUseRemote: () => void;
}) {
  return <>
    <p>Models: {isLocal ? 'local scene' : 'remote store'}</p>
    {isLocal && <button type="button" onClick={onUseRemote}>Use remote model store</button>}
    <label className="scene-folder-input">Open XYZ bundle
      <input type="file" accept=".xyz" onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void onOpenBundle(file);
      }} />
    </label>
    <label className="scene-folder-input">Open scene folder
      <input type="file" multiple {...{ webkitdirectory: '' }} onChange={event => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        void onOpenFolder(files);
      }} />
    </label>
    <p>Open a self-contained .xyz bundle, or choose a folder containing scene.xyz and its GLB models. Files stay in your browser.</p>
    {error && <p role="alert">{error}</p>}
  </>;
}
