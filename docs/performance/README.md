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

- Keep textured detail as the document baseline. Previews require critical capability evidence (RAM ≤1 GiB, or RAM ≤2 GiB together with ≤2 logical cores). An iPhone, mobile viewport, or missing memory hint does **not** permit previews.
- Render the scene and navigation immediately. GLBs load independently in the background and appear as their own textures/shaders become ready; initially unloaded model slots are temporarily empty. There is no scene-wide loading cover or preview-first loading. Missing details fall back to the original, subject to constrained-device admission checks.
- Decode required baselines before requesting optional originals. Up to two baseline downloads can progress independently within a shared compressed-byte allowance; GLB prefixes supply decoded file sizes even when cross-origin transfer headers describe compressed bytes; responses without a verifiable size reserve the full allowance. Decoding and GPU preparation share one serial queue. A slow first response does not block a healthy later model. Their decoded results retain scenes/animations, not the GLTF parser's temporary caches.
- Original upgrades have bounded residency. iOS, reported memory ≤4 GiB, and unavailable memory hints use a **160 MiB original allowance and 256 MiB combined model estimate**. Other devices allow 1,024 MiB of originals / 1,536 MiB combined. These are model estimates, **not actual process RAM caps**. Required allocations on constrained devices are checked before decode and before GPU upload; oversized models report a nonblocking error notice with retry while the rest of the scene stays usable.
- Inspect embedded GLB geometry and JPEG/PNG/KTX2 image metadata before decoding. Downloads stream with a 96 MiB limit on constrained devices (256 MiB otherwise). A denied original retains textured detail, never a preview or blank. Capacity-limited originals retry when leases release; permanently oversized/unknown external resources do not repeatedly allocate. Meshopt's virtual fallback buffer is allowed only with the required decoder extension.
- Account for CPU/GPU duplication and additional transfer/decoder storage when interpreting estimates. The constrained policy's planning envelope uses two resident copies, two download copies and 128 MiB of additional transient allowance; GLTFLoader can create further copies, and native decoder/driver/process overhead remains outside this estimate. Physical-device testing is required.
- Nearby objects covering at least 400 CSS pixels can request originals. Constrained devices request only objects actually in view; other devices also prefetch within a 1.75× guard frustum. Visible requests outrank guard-only requests. Priority changes reorder pending work without releasing the asset lease.
- A displayed original stays protected while visible, including when another baseline is loading. Under pressure, release only after eight seconds outside the view/guard region or completely concealed by a verified solid wall. Shared URLs within each store remain alive until the last instance releases them. Inferred simplification over 32× retains an original **once granted**; this protects the supplied bed and plant after promotion but cannot force admission over the safe allowance.
- Conservative wall occlusion requires all eight declared-box corners behind the same eligible opaque DSL box face. Cutouts, transparent/invisible/clipped materials, camera layer mismatches, and near-clipped walls cannot qualify. This controls original residency, not streaming within a GLB.
- Initialize textures and compile shaders before publication. Yield between large texture uploads. Shader polling is cancellable, unlike Three r181's `compileAsync`. Each model appears independently after warmup. Model retries preserve healthy instances and original leases. Refresh/unmount abort streams and loaders; late decoded results are disposed before GPU upload. Context loss and persisted page departure pause loading; recovery retries interrupted work and prepares the scene again.
- Demand rendering stops at rest; hidden documents stop rendering. Antialiasing remains enabled, dynamic shadows remain disabled, and balanced DPR is capped at 1.5 (critical devices: 1). Pixel settings do not change model fidelity.

A scene which exceeds the constrained allowance needs smaller **visually reviewed textured assets**, rather than preview substitution. Errors are reported without covering the scene. The supplied bed detail has UV damage: preserving a promoted original protects it, but denying an upgrade leaves that defect in the authored detail variant. The memory fix does not repair preprocessed geometry. Instancing/batching and hardware battery/thermal measurements remain separate work.

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

The standard set is about 90.7% smaller on disk and contains 96.3% fewer triangles. Loaded detail baselines remain resident and no longer applies the former 600,000-triangle admission limit. In the current browser acceptance fixture this set occupies approximately 75.7 MiB of estimated model resources. A close-up original/prepared comparison caught UV damage from aggressive simplification; the pipeline now preserves seam constraints, accepting extra geometry. Automatic LODs still reduce detail and require visual review. See `original-vs-detail.png`, `corpus-report.json`.

Historical corpus measurements predate the project separation; rerun the web acceptance suite to validate the current build.

An optional visual comparison test reads `public/performance-originals/bed_lamp.glb` and compares it with the generated detail asset. Copy that one original there to reproduce it; run `npm run test:performance -- --grep 'visual comparison'`. It is skipped when that optional fixture is absent. This dev-only harness allows direct visual comparison of fidelity.

## Explorer quality and selection

Device hints choose conservative pixel settings independently of model fidelity. Ordinary devices use high-detail prepared models even at mobile viewport sizes. Selection prefetches its original. Tours use the same visibility and prefetch policy as ordinary panning, rather than one exclusive original selected by gaze. Original release affects only cold offscreen models under pressure. Development builds show residency and estimated resource bytes.

## Asset inspection and per-model budgets

Run `npm run assets:inspect -- INPUT_DIRECTORY REPORT.json` before uploading assets. Add `--strict` to fail CI for budget warnings. The report includes decoded geometry bytes, conservative texture memory, dimensions, triangle/draw-call counts across nodes, animation bytes, cameras and lights. Recommended ceilings per model are 60,000 triangles, 32 draw calls, 1024 px textures and 32 MiB geometry/texture memory; keep the complete room within the intended devices’ practical memory and draw-call capacity. Runtime residency targets are soft; asset inspection is the place to identify oversized scenes before publishing. Texture estimates use RGBA plus mipmaps conservatively; actual KTX2 GPU memory depends on the device. This report is offline metadata, not a guarantee about peak decode memory. Preparation strips authored cameras/lights before writing LODs.

### Automatic model variants

`model: chair.glb` or `model: chair.standard.glb` requests `chair.detail.glb` on an ordinary device and `chair.preview.glb` on a critically underpowered device. Explicit `model-detail`/`model-preview` values override those inferred filenames. A failed high-detail request falls back to `chair.glb`; a failed critical preview falls back to the declared source. The rest of the scene stays visible during either path; the model appears when ready. Camera-driven reductions affect only cold offscreen originals; visible promoted originals never downgrade. Fast jumps can still show the textured detail baseline while an uncached original loads. The guard is a prediction, not a guarantee about arbitrary navigation or network latency. Prepared assets must be visually reviewed; the supplied bed detail has UV damage, so its original is retained after promotion.

## Pap room validation (2026-10-11)

`LEPAPAYER_MODELS=/path/to/lepapayer-models npx playwright test tests/performance/lepapayer.spec.ts` uses the supplied preprocessed variants directly, with the complete Pap DSL (26 instances, 23 unique models). It validates all four viewpoints, two full rapid pans, eight-second cold reclamation, return-to-bed retention when its original was admitted, no previews on ordinary hardware, no disappearing slots, no downgrade of a visible promoted original, and stopped rendering at rest. The same suite runs at desktop and 390×844 mobile viewports. The latter emulates browser capability hints, not a physical phone.

Before iPhone containment, this scene used about 375 MiB initially / 1,274 MiB after navigation on desktop and 741 MiB / 1,000 MiB in mobile emulation. The bounded follow-up measured 104 MiB of baseline resources plus 141 MiB of originals (about 245 MiB combined) at rest in the mobile run; desktop with an 8 GiB memory hint retained about 1,101 MiB. These are soft-target overruns, not process RAM measurements. The supplied detail bed visibly damages bedding UVs; its original is retained after promotion. Uncached first visits can initially show textured detail until the original finishes loading; the guard reduces that window but cannot eliminate network latency or repair preprocessed geometry.

## iPhone refresh regression (2026-10-11)

A supplied recording from iPhone 17 / iPhone 11 (reported iOS 26.6.2) ends with Safari's “A problem repeatedly occurred” page. That confirms browser failure, but does not identify its cause. The previous unbounded original upgrades and GPU upload before admission were concrete allocation hazards.

Run `npx playwright test tests/performance/safari-refresh.spec.ts` with the local Pap folder to exercise three refreshes, traversal, bounded residency, no preview requests and WebGL context loss/restoration. This test runs Chrome with iPhone/Safari capability hints; it does **not** execute iOS WebKit or prove the physical crash is fixed. Retest the same refresh/navigation sequence on both affected phones before claiming resolution.

The follow-up passed 321 viewer unit tests, 89 explorer unit tests, both production builds, eight model/Pap browser regressions at that revision, and the repeated-refresh/context-recovery regression. These results establish the configured estimated-resource bounds in the fixtures, not iOS process stability.

## Progressive initial loading (2026-10-22)

Initial scene-wide preparation covers have been removed. Primitive geometry and navigation render immediately, models appear independently as they finish, and failed assets produce a compact nonblocking retry notice. Graphics-context loss still shows recovery controls. Downloads can overlap within an aggregate compressed-byte budget; decode/upload remains serialized and existing iPhone model-memory checks remain enforced. A deliberately stalled first GLB regression verifies that a later healthy GLB becomes visible before the stalled request is released.
