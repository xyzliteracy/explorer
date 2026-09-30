/** Infer siblings before transport converts model URLs to blob/cache URLs. */
export function modelVariantSource(source: string, tier: 'preview' | 'standard' | 'detail'): string {
  return source.trim().replace(/(?:\.(?:standard|preview|detail))?\.glb(?=[?#]|$)/i, `.${tier}.glb`);
}

export function resolveModelVariants<T extends { source?: string; previewSource?: string; detailSource?: string }>(model: T): T {
  if (!model.source) return model;
  return {
    ...model,
    source: /\.(?:standard|preview|detail)\.glb$/i.test(model.source.trim().split(/[?#]/, 1)[0])
      ? model.source
      : modelVariantSource(model.source, 'standard'),
    previewSource: model.previewSource ?? modelVariantSource(model.source, 'preview'),
    detailSource: model.detailSource ?? modelVariantSource(model.source, 'detail'),
  };
}

/** Original source convention, independent of explicit prepared-tier overrides. */
export function originalModelSource(source: string): string {
  return source.trim().replace(/\.(?:standard|preview|detail)(?=\.glb(?:[?#]|$))/i, '');
}
