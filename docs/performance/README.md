# Web model runtime

Explorer uses `ModelPrimitive`, `ModelRuntime`, and `ModelAssetStore` for model rendering, resource disposal, and stable model fidelity. Web URLs load directly.

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

`model-preview` and `model-detail` are optional, inherit with a model declaration, and are cleared when its source is overridden. Normal devices keep the explicit `model-detail` asset or inferred `<stem>.detail.glb` as their stable textured baseline. If that request fails, they load the original `<stem>.glb`. Suffixes, query strings and fragments are handled before transport. Even a `.standard` or `.preview` source filename does not force preview fidelity on a normal device.

## Runtime policy

- Fix the baseline for the document: textured detail on normal devices; previews only with critical capability evidence (reported RAM ≤1 GiB, or RAM ≤2 GiB together with ≤2 logical cores). Mobile viewports, coarse pointers, and CPU hints alone never select previews.
- Acquire every textured baseline before exploration. Keep it resident through camera movement and tours, with no preview-first loading or disappearing slots.
- Prefetch originals for nearby models covering at least 400 CSS pixels, using a 1.75× guard frustum. After promotion, the original stays visible even if its screen size shrinks. Under memory pressure, release it only after eight seconds outside the view and guard region, or fully concealed by a verified solid wall. A visible original is never withdrawn by another model's priority.
- Keep recently used originals cached when below the soft target. When over target, cold released originals are disposed immediately. Shared URLs remain alive while any instance owns them. Extremely aggressive inferred simplification (more than 32× reduction) pins its original after the first promotion to protect close-up UV fidelity; this guards the supplied bed and plant assets.
- An opaque preparation screen covers initial preparation until every baseline and the initially requested originals are ready, including fallback requests. Subsequent original requests keep the textured baseline visible. Initialize offscreen textures and compile shaders before revealing a rendered frame. Failures remain covered with a retry action rather than a placeholder-filled scene. Rendering failures also enter this state. WebGL context loss re-enters preparation until recovery.
- One active load/decode limits transient work. URLs share decoded geometry, materials and textures; repeated models clone their object hierarchy, not their buffers or textures. Fitted bounds remain consistent.
- Referenced document assets have residency priority. The normal 512 MiB / critical 128 MiB cache targets are **soft**, not admission limits for required models. No triangle admission rule can replace an already displayed model with a preview or blank space. Removed models expire after five seconds, or earlier under memory pressure/new loading. Geometry, textures, materials, skeletons and image bitmaps are disposed.
- Demand rendering stops drawing at rest; hidden documents stop rendering. Camera movement and asset completions invalidate frames. Antialiasing is enabled, dynamic shadows remain disabled, and balanced DPR is capped at 1.5 (critical devices: 1). Renderer pixel settings do not change model fidelity.

The memory estimate is **not a browser/process RAM cap**. It excludes decoder WASM heaps, JS objects, CPU image copies, framebuffers, and other browser memory. Required scene residency can exceed the soft targets. Prepared high-detail assets are essential for large scenes; loading all original scans can exhaust memory even with serial loading. The runtime deliberately does not mask an oversized scene by degrading visible models. Browser capability determines the final KTX2 transcode format and its storage.

A conservative occlusion proof treats a model as hidden only when all eight declared-box corners lie behind the same opaque DSL box face. Cutouts, transparent/clipped materials, camera layer mismatches, and near-clipped walls cannot qualify. This controls original residency; there is no streaming within a single GLB. Three.js frustum culling avoids offscreen draws while document leases remain resident. Instancing/batching remain future work. Author and visually review optimized detail assets before publishing; automatic simplification cannot guarantee visual equivalence to originals.

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

The standard set is about 90.7% smaller on disk and contains 96.3% fewer triangles. The current runtime keeps the entire detail baseline resident and no longer applies the former 600,000-triangle admission limit. In the current browser acceptance fixture this set occupies approximately 75.7 MiB of estimated model resources. A close-up original/prepared comparison caught UV damage from aggressive simplification; the pipeline now preserves seam constraints, accepting extra geometry. Automatic LODs still reduce detail and require visual review. See `original-vs-detail.png`, `corpus-report.json`.

Historical corpus measurements predate the project separation; rerun the web acceptance suite to validate the current build.

An optional visual comparison test reads `public/performance-originals/bed_lamp.glb` and compares it with the generated detail asset. Copy that one original there to reproduce it; run `npm run test:performance -- --grep 'visual comparison'`. It is skipped when that optional fixture is absent. This dev-only harness allows direct visual comparison of fidelity.

## Explorer quality and selection

Device hints choose conservative pixel settings independently of model fidelity. Ordinary devices use high-detail prepared models even at mobile viewport sizes. Selection prefetches its original. Tours use the same visibility and prefetch policy as ordinary panning, rather than one exclusive original selected by gaze. Original release affects only cold offscreen models under pressure. Development builds show residency and estimated resource bytes.

## Asset inspection and per-model budgets

Run `npm run assets:inspect -- INPUT_DIRECTORY REPORT.json` before uploading assets. Add `--strict` to fail CI for budget warnings. The report includes decoded geometry bytes, conservative texture memory, dimensions, triangle/draw-call counts across nodes, animation bytes, cameras and lights. Recommended ceilings per model are 60,000 triangles, 32 draw calls, 1024 px textures and 32 MiB geometry/texture memory; keep the complete room within the intended devices’ practical memory and draw-call capacity. Runtime residency targets are soft; asset inspection is the place to identify oversized scenes before publishing. Texture estimates use RGBA plus mipmaps conservatively; actual KTX2 GPU memory depends on the device. This report is offline metadata, not a guarantee about peak decode memory. Preparation strips authored cameras/lights before writing LODs.

### Automatic model variants

`model: chair.glb` or `model: chair.standard.glb` requests `chair.detail.glb` on an ordinary device and `chair.preview.glb` on a critically underpowered device. Explicit `model-detail`/`model-preview` values override those inferred filenames. A failed high-detail request falls back to `chair.glb`; a failed critical preview falls back to the declared source. The preparation screen covers either path until the model is ready. Camera-driven reductions affect only cold offscreen originals; visible promoted originals never downgrade. Fast jumps can still show the textured detail baseline while an uncached original loads. The guard is a prediction, not a guarantee about arbitrary navigation or network latency. Prepared assets must be visually reviewed; the supplied bed detail has UV damage, so its original is retained after promotion.

## Pap room validation (2026-10-11)

`LEPAPAYER_MODELS=/path/to/lepapayer-models npx playwright test tests/performance/lepapayer.spec.ts` uses the supplied preprocessed variants directly, with the complete Pap DSL (26 instances, 23 unique models). It validates all four viewpoints, two full rapid pans, eight-second cold reclamation, return-to-bed fidelity, no previews on ordinary hardware, no disappearing slots, no downgrade of a visible promoted original, and stopped rendering at rest. The same suite runs at desktop and 390×844 mobile viewports. The latter emulates browser capability hints, not a physical phone.

This scene remains expensive: observed model resources were about 375 MiB initially / 1,274 MiB after navigation on desktop and 741 MiB / 1,000 MiB in mobile emulation. These are soft-target overruns, not process RAM measurements. The supplied detail bed visibly damages bedding UVs; its original is retained after promotion. Uncached first visits can initially show textured detail until the original finishes loading; the guard reduces that window but cannot eliminate network latency or repair preprocessed geometry.
