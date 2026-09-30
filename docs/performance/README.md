# Web model runtime

Explorer uses `ModelPrimitive`, `ModelRuntime`, and `ModelAssetStore` for model rendering, resource disposal, and screen-size LOD selection. Web URLs load directly.

## Prepare assets before publishing

Run from the explorer directory:

```sh
npm ci
npm run assets:prepare -- /path/to/original-glbs public/performance-models
npm run dev
```

The input directory is read-only. Output includes three independent GLBs per model, a `report.json`, `performance.xyz`, and `performance-web.xyz`. Filenames are `<stem>.preview.glb`, `<stem>.standard.glb`, and `<stem>.detail.glb`. Both scenes declare only `model`, exercising automatic sibling resolution. Existing `.preview`, `.standard`, or `.detail` suffixes are removed from input stems; duplicate stems are rejected before processing. The web renderer resolves relative filenames against the default runtime model store (`https://pub-70e24999b560412a8cf712bd468e82c2.r2.dev/`). For locally generated assets, use the acceptance page below or the generated absolute localhost URLs in `performance-web.xyz`.

```text
"Chair/+0+1/+0+1/+0+1":"model: chair.standard.glb; model-align: floor"
```

- **Preview:** target 8,000 triangles, no textures, recalculated flat normals.
- **Standard:** target 20,000 triangles, 512 px KTX2/Basis UASTC textures with mipmaps.
- **Detail:** target 60,000 triangles, 1024 px KTX2/Basis UASTC textures with mipmaps.
- Meshopt compresses geometry. Textured simplification considers UVs and normals; previews may use vertex clustering if disconnected scan topology prevents simplification. UV seam constraints take precedence over textured triangle targets. Preparation rejects empty outputs, previews above 16,000 triangles, and textured levels above 500,000 triangles; dense assets need authored LODs to reduce further without damaging UVs.
- Original scene bounds travel in `extras.xyzFitBounds`, keeping fitting/alignment consistent across levels.
- Preparation currently supports static indexed triangle models. Animated/skinned/morph assets fail with an explicit message and need authored LODs. Visually inspect automatic simplification before publishing.

### Pasting the test scene into the web editor

`public/performance-models/performance.xyz` uses relative asset paths. For a Vite web app running at `http://localhost:5173`, paste the contents of `public/performance-models/performance-web.xyz` instead. The preprocessor generates this companion scene on every run. Pass an optional third argument such as `http://127.0.0.1:5174/performance-models/` to set its asset base URL. By default it uses absolute HTTP URLs under `/performance-models/`; change the origin if your server runs on another port or host. It is a local test fixture, not a portable deployment URL.

Do not insert Markdown escapes into DSL filenames: use `bed_lamp.preview.glb`, not `bed\_lamp.preview\.glb`. Assets must be served by the web server; a pasted filename does not grant the browser access to local disk.

`model-preview` and `model-detail` are optional, inherit with a model declaration, and are cleared when its source is overridden. Unqualified `model: name.glb` declarations resolve to `name.standard.glb`; explicitly named variants keep their filenames. Oversized legacy assets show an actionable placeholder rather than being retained at full quality. A missing or failed upgrade keeps the loaded preview.

## Runtime policy

Defaults live in `src/performance/ModelAssetStore.ts`, `modelVisibility.ts`, and `ModelRuntime.tsx`:

- One active asset load/decode; previews have priority over upgrades.
- Camera frustum and projected bounding-sphere diameter determine loading. Offscreen assets are released. Hysteresis prevents rapid switching near size thresholds.
- Preview below ~170 CSS pixels; standard above ~170; detail above ~550. Downgrade thresholds are 110 and 400 pixels. Tiny objects below 6–12 pixels retain only a box placeholder.
- Keep the preview resident during upgrades. Admission counts both preview and detail claims conservatively, even though only one is drawn.
- 128 MiB estimated retained geometry/texture storage and 600,000 admitted model triangles across instances. Shared URLs share storage, but every instance consumes triangle allowance. Non-model scene geometry is outside this model budget.
- Unreferenced assets expire after five seconds, or immediately when a new load needs space. Dispose geometry, materials, textures, image bitmaps, and skeleton resources. Capacity-deferred assets retry when space frees. Explicit retry retries failed requests without reloading healthy models.
- Demand rendering, pixel ratio capped at 1.5, no antialiasing or dynamic shadows. Orbit, focus/reset, POV input, and asset completions request frames. Hidden documents stop rendering. Held POV movement continues requesting frames, including while collision-blocked.

The memory estimate is **not a browser/process RAM cap**. It excludes decoder WASM heaps, JS objects, CPU image copies, framebuffers, and other browser memory. Admission happens after decode, so one oversized legacy GLB can temporarily exceed the budget. In-flight decode is allowed to finish and its stale result is disposed; queued work is canceled. Prepared assets are essential to keep those transient costs small. Browser capability determines the final KTX2 transcode format and its storage.

There is no occlusion culling or streaming within a single GLB. Switching levels fetches separate assets. Instancing/batching and a shared editor/browser UI remain future work; the renderer performance layer is unified now.

## Verification

```sh
npm test
npm run build
npm run test:performance
```

Prepare the supplied corpus first. The acceptance suite uses installed Google Chrome and starts a local Vite server on 127.0.0.1:5174. Results and screenshots are written to `test-results/`.

For manual testing open `/tests/performance/index.html`. This dev-only harness is not a production entry point. Predev/prebuild hooks regenerate decoder assets. Keep test models out of the production public directory when publishing.

Automated checks and mobile viewport emulation cannot establish phone thermals, battery life, or device memory limits. Run a sustained interaction soak on representative iOS Safari and Android Chrome devices before release.

## Decoder CSP compatibility

The Three.js r181 Basis transcoder generates JavaScript with `Function()`, which strict Content Security Policies block. `scripts/basis-csp.mjs` replaces its two generated embind dispatchers with plain closures when copying decoder assets. The matching WASM binary and the CSP are unchanged. The adapter is pinned to the exact upstream JS SHA-256 and fails the build if it changes. When upgrading Three.js, review/remove the adapter in favor of an upstream `DYNAMIC_EXECUTION=0` build. Tracking: https://github.com/mrdoob/three.js/issues/34389.

`npm run test:decoders` runs the adapted wrapper with string code generation forbidden and checks byte-identical RGBA output against the original wrapper at every mip of the synthetic KTX2 fixture.

## Supplied corpus results (2026-09-23)

All ten input GLBs already used Draco. The original combined file size was **224.72 MiB**, with **21,809,990 triangles** and approximately **768 MiB** of uncompressed RGBA texture storage including mipmaps (before geometry/CPU overhead).

| Prepared set | Combined file size | Triangles |
| --- | ---: | ---: |
| Untextured previews | 1.85 MiB | 80,373 |
| Standard | 20.89 MiB | 815,842 |
| Detail | 44.89 MiB | 1,068,848 |

The standard set is about 90.7% smaller on disk and contains 96.3% fewer triangles. Combined standard/detail triangle totals exceed the scene admission budget: higher-priority detail displaces standard rendering, with previews retained for other objects. These totals describe the asset corpus, not simultaneous rendering. A close-up original/prepared comparison caught UV damage from aggressive simplification; the pipeline now preserves seam constraints, accepting extra geometry. Automatic LODs still reduce detail and require visual review. See `original-vs-detail.png`, `corpus-report.json`.

Historical corpus measurements predate the project separation; rerun the web acceptance suite to validate the current build.

An optional visual comparison test reads `public/performance-originals/bed_lamp.glb` and compares it with the generated detail asset. Copy that one original there to reproduce it; run `npm run test:performance -- --grep 'visual comparison'`. It is skipped when that optional fixture is absent. The original bypasses mobile admission only in this dev-only comparison harness.

## Explorer quality and selection

Explorer's Quality selector persists Low/Balanced/High locally. Low caps DPR at 1 and requests previews; Balanced caps DPR at 1.5 and standard assets; High caps DPR at 2 and allows detail. Coarse-pointer devices and reported memory/CPU counts of four or less default to Low; other devices default to Balanced. Missing LOD files fall back to the existing `model` source, so preparing assets remains essential. All modes retain demand rendering, disabled dynamic shadows/antialiasing, and the same memory budget.

Selected Explorer objects stay resident outside the view. Their prepared fallback receives queue/render priority within the usual budgets; selection additionally loads the original `<stem>.glb` in a separate, exclusive slot regardless of the quality setting. This one original bypasses the prepared memory/triangle limits, appears above prepared variants when ready, and is immediately released on deselection. Original loads are serialized: stale in-flight decodes finish and are disposed before the next original loads. Missing originals keep the prepared fallback visible. Upload originals beside the generated variants; preprocessing still emits only the three prepared levels. Runtime residency statistics include the selected original, so totals can exceed the prepared budget. Other objects leaving the view retain their lease for 750 ms before the five-second cache grace period starts. Development builds display model residency and estimated bytes beside the quality control.

## Asset inspection and per-model budgets

Run `npm run assets:inspect -- INPUT_DIRECTORY REPORT.json` before uploading assets. Add `--strict` to fail CI for budget warnings. The report includes decoded geometry bytes, conservative texture memory, dimensions, triangle/draw-call counts across nodes, animation bytes, cameras and lights. Recommended ceilings per model are 60,000 triangles, 32 draw calls, 1024 px textures and 32 MiB geometry/texture memory; scene admission remains 128 MiB and 600,000 triangles. Texture estimates use RGBA plus mipmaps conservatively; actual KTX2 GPU memory depends on the device. This report is offline metadata, not a guarantee about peak decode memory. Preparation strips authored cameras/lights before writing LODs.

### Automatic model variants

A declaration such as `model: chair.glb` automatically attempts
`chair.preview.glb` and `chair.detail.glb` at the corresponding visibility tiers.
`model: chair.standard.glb` uses those same siblings, matching `assets:prepare`.
An unqualified base `model` URL resolves to its `.standard.glb` sibling; explicitly named variants are preserved. Query strings and fragments are
preserved. Explicit `model-preview` or `model-detail` values override inference
for that tier, including inherited values. Inference happens after inheritance
and URL resolution, before asset transport. Failed inferred variants fall back
to the resolved base model; a loaded preview remains visible while it loads. Assets
continue to obey the shared loading and memory budgets.
