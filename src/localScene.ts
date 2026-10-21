import { validateModelSource } from './model/resolveModelUrl';
import { originalModelSource } from './model/modelVariants';
export async function openLocalScene(files: File[]) {
 const scenes = files.filter(f => f.name === 'scene.xyz');
 if (scenes.length !== 1) throw Error('Choose a folder containing exactly one scene.xyz.');
 const scene = scenes[0], path = (f: File) => f.webkitRelativePath || f.name;
 const directory = path(scene).slice(0, -scene.name.length), urls = new Map<string,string>();
 try {
  for (const f of files) if (path(f).startsWith(directory) && /\.glb$/i.test(f.name)) urls.set(path(f).slice(directory.length), URL.createObjectURL(f));
  return { source: await scene.text(), resolve: (source: string) => {
   const value = validateModelSource(source);
   if (/^[a-z][a-z\d+.-]*:/i.test(value)) throw Error('Local scenes require local models.');
   const key = decodeURIComponent(value.split(/[?#]/, 1)[0]), url = urls.get(key) ?? urls.get(originalModelSource(key));
   if (!url) throw Error(`Missing local model: ${key}`);
   return url;
  }, close: () => urls.forEach(url => URL.revokeObjectURL(url)) };
 } catch(error) { urls.forEach(url => URL.revokeObjectURL(url)); throw error; }
}
