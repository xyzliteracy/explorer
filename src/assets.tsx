import { createContext, useContext } from 'react';
import { resolveModelUrl } from './model/resolveModelUrl';
export const AssetResolver = createContext<(source: string) => string>(source => resolveModelUrl(source, new URL('.', location.href).href));
export const useAssetResolver = () => useContext(AssetResolver);
