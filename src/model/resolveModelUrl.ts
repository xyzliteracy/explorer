/** Default runtime store for relative model and variant declarations. */
export const DEFAULT_MODEL_ASSET_BASE = 'http://localhost/';

/** Validate declarations without assigning a storage location to relative paths. */
export function validateModelSource(source: string): string {
  const value = source.trim();
  if (!value || value.startsWith('/') || value.includes('\\')) throw Error('Model URL is invalid.');
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(value);
  if (!absolute) {
    const path = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    if (path.split('/').includes('..')) throw Error('Relative model paths must remain inside the scene directory.');
    if (!/\.glb$/i.test(path)) throw Error('Model URL must reference a .glb file.');
    return value;
  }
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw Error('Model URLs require http or https.');
  if (!/\.glb$/i.test(url.pathname)) throw Error('Model URL must reference a .glb file.');
  return value;
}

export function resolveModelUrl(source: string, base: string = DEFAULT_MODEL_ASSET_BASE): string {
  const value = validateModelSource(source);
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return new URL(value).href;
  const root = new URL(base);
  const url = new URL(value, root);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname.endsWith('/') ? root.pathname : root.pathname + '/')) throw Error('Relative model paths must remain inside the scene directory.');
  return url.href;
}
