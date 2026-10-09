# XYZ viewer

A standalone static **web** app and shared XYZDSL rendering package. No application server, transaction API, public keys, or account is required.
Direct XYZDSL input uses the configured remote GLB store by default.

## Run

```sh
npm install
npm run dev
```

Paste XYZDSL directly into the input, or use **Open scene folder** to select a
folder containing `scene.xyz` and its GLB files. Model paths are relative to
`scene.xyz`; nested folders are supported. Models remain in browser memory via
blob URLs, and are never uploaded. Local folder mode rejects remote model URLs; use **Use remote model store** to
switch back to remote assets. URL content renders as a text label.
Only one `scene.xyz` may be selected. Self-contained GLBs are supported; external
model dependencies are not resolved by the folder picker. Folder selection
requires a browser supporting directory file inputs (Chromium recommended).

`npm run build` generates `dist/`, including local Draco/Basis decoders. Serve
this directory on any static web host. `npm run preview` serves it locally.

## Shared core

Tour quality uses two observer-centered rings: the nearest model's declared
fitted box intersected by the camera's center ray, and all other visible models.
Offscreen and tiny-object screen-size hysteresis still determines residency.

| Device profile | Center / outer ring | After 2 seconds of center focus |
| --- | --- | --- |
| Normal | detail / standard | original / detail |
| Underpowered (`low`) | standard / preview | detail / standard |

The sustained boost applies to every visible model while center focus is held.
Underpowered tours never request an original. The existing capability detection
selects `low` for devices reporting at most 2 GB memory or at most 2 CPU cores;
DPR limits remain unchanged. Outside tours, the existing quality ceilings and
selection behavior apply.

Tour models keep their prepared quality until a lower tier has been requested
continuously for two seconds, including when leaving the view. Returning before
that delay cancels the downgrade; prepared upgrades remain immediate. When focus
moves, ring downgrade timers start immediately, so the original's away grace does
not add another two seconds to them.

After two seconds of uninterrupted center focus on normal devices, the original
`<stem>.glb` loads through the existing single-original store. Prepared assets
remain loading/error fallbacks. Looking away retains the old original for two
seconds; returning cancels its release. Only one tour original is requested at a
time. Originals retain the existing uncapped selection-store policy. Prepared
memory/triangle budgets, decoder limits, shared caching, eviction, demand
rendering, and non-tour selection behavior remain unchanged. Ring tiers are
requests, subject to budget admission and asset availability.

After the tour's two-second offscreen delay, model references are released;
offscreen objects do not retain a rendered preview. Unreferenced prepared assets
are disposed after the existing five-second cache grace period, or sooner under
memory pressure. Shared assets remain resident while other instances need them.
Originals have no additional cache grace. Non-tour offscreen release still uses
the existing 750 ms delay.

This is a camera-based approximation of visual attention, not eye tracking or
mesh-level occlusion detection. The timing constant is `TOUR_DWELL_MS` in
`src/performance/TourModelFocus.tsx`.

Regression coverage checks nearest-center arbitration, uninterrupted focus,
look-away cancellation, both device profiles and rings, original loading gates,
and timer completion while demand rendering is idle. Validation for this change:
`npm test` passed all 288 tests, and `npm run build` passed TypeScript compilation
and the production Vite build.

`@xyz/viewer` exports `createSpatialDocument`, `SceneRoot`, and `AssetResolver`.
Source subpath exports expose the parser, spatial model, camera/navigation,
selection, and model resource lifecycle. Consumers need a TypeScript-aware
bundler. Wrap `SceneRoot` with `AssetResolver.Provider` to supply asset location
policy; remote storage belongs to the consumer. The standalone web app configures its
default store in `src/remoteAssets.ts`. React and Three must be shared
with the consuming application.

The sibling explorer uses `file:../xyz-viewer` and compatibility exports. Its
remote model base stays in `explorer/src/scene/remoteModelUrl.ts`; transaction
composition and fetching stay in explorer. Rendering tests live here; application
and remote semantics tests stay in explorer.

```sh
npm test
npm run build
```

## Visual editor and mobile workspace

On desktop the app opens in editor mode with Objects, Source, Assets, and Problems
panels. On mobile it opens in viewer mode and automatically starts the viewpoint
tour when the scene declares viewpoints. Tap **Editor mode** to open the workspace.
Select an object in the outline or with Cmd/Ctrl-click in the scene. Edit its
position, dimensions, rotation, geometry, and material in the inspector; scene
keyboard controls also update the source declaration. Use **Save scene.xyz** in
Source to download edits. Local folder originals are never overwritten.

On narrow screens the workspace sits below the scene with a draggable horizontal
separator; touch-friendly property controls remain available. Viewer mode hides
the workspace and retains the mobile viewpoint tour controls. The mode button
reopens the editor on mobile.

`VisualEditor` is a controlled source editor (`source`, `onChange`) with host
slots for asset controls and errors. The explorer shares the inspector, outline,
source editor, layout, workspace shell, mobile detection, and workspace CSS via
package exports. Its transaction panels remain application-owned.

## GitHub Pages

Pushes to `main` run `.github/workflows/pages.yml`: install dependencies with
`npm ci`, run tests, build, and deploy `dist/` to GitHub Pages. The workflow can
also be run manually from Actions. Repository Pages settings must use **GitHub
Actions** as the publishing source. The build uses the base path reported by
GitHub Pages so scripts, fonts, and GLB decoders work under `/xyzdsl/` and with
custom domains. Local development keeps its relative base path.

The default deployment URL is https://xyzspec.github.io/xyzdsl/.


## Primary specification implementation

This repository owns the executable XYZDSL parser, resolution rules, spatial
model, renderer dispatch (`SpatialScene`), model lifecycle, and visual editor.
Implement syntax and rendering changes here and add regression cases here.
Written specification changes must be implemented and tested in this core before
applications acquire the behavior; prose alone does not change the renderer.

Explorer and native-viewer depend directly on `@xyz/viewer`, linked with
`file:../xyz-viewer`. No generated compiler or rendering copies are needed.
Keep checkouts as siblings, using this repository as `xyz-viewer/`. A local edit
is visible to each application's next build (and web development reload).
Run `npm run core:update` in either consumer to fast-forward the core checkout,
install its locked dependencies, and refresh the consumer install. Commit any
consumer lockfile changes with its release. Changes already running in a shipped
native binary or web deployment require rebuilding/redeploying that application.

The native renderer uses `SpatialScene` with its local/IPC model transport and
content adapter. Explorer uses `SceneRoot`, which uses the same dispatcher.
Host adaptations must not fork parser, resolution, primitive, or CSG rules.
React/Three are peers and consumer bundlers deduplicate them, including tests.
The explorer Pages workflow checks out the core's `main` beside explorer for each
build. Native packaging bundles the shared source into its renderer; it has no
runtime dependency on the source checkout.

The explorer Pages workflow runs its tests and production build against the core
checkout before deployment. This check belongs to the consumer repository so its
workflow token can read the application source. Core CI tests shared renderer
dispatch and host adapters without requiring access to consumer repositories.
