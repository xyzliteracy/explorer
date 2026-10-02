import { resolveModelUrl as resolve } from '@xyz/viewer/model/resolveModelUrl';
export const DEFAULT_MODEL_ASSET_BASE = 'https://pub-70e24999b560412a8cf712bd468e82c2.r2.dev/';
export const resolveModelUrl = (source: string, base = DEFAULT_MODEL_ASSET_BASE) => resolve(source, base);
