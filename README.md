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

## Default local draft and camera precision

The bundled local draft (`src/defaultDraft.xyzdsl`) opens the Pap room with a
600 mm tile grid, 1 mm joints, and clipped edge tiles. The flooring container
starts at Y = 660 mm; the lounge rug declaration starts at Y = 196 mm.

Selecting a thin model must not reduce depth precision across the room. In the
editor, the camera near plane adapts to the distance from the selected bounds,
allowing close inspection while avoiding surface flicker from farther away.
Tours use the overall scene scale regardless of the editor selection. These
camera settings are automatic and require no additional DSL properties.

## Parent fill and repetition

Paths retain three explicit X/Y/Z axis segments. Each axis is
`+offset+size`, with either value optional. An omitted offset means zero;
an omitted size means **fill the remaining parent extent from that offset**.
The shorthand uses only existing Base64 path characters.

| Segment | Meaning |
| --- | --- |
| `+2d+1` | Start at 20 cm; size 1 metre |
| `++1` | Start at zero; size 1 metre |
| `+2d+` | Start at 20 cm; extend to the parent's far edge |
| `+0+` or `++` | Fill the entire parent axis |

```text
"Wall/+0+5/+0+3/+0+2d" : ""
"Wall/Rail/++/+1+1d/+0+2d" : "color: brown"
"Wall/Slat/+0+1d/++/+0+2d" : "repeat: x; repeat-gap: 1d"
```

The rail is 5 metres wide. There are 25 slats, each 10 cm wide and
3 metres tall, with 10 cm gaps. The final 10 cm of wall width remains empty.
No `expand` property is needed: the omitted axis size expresses expansion.
Coordinate and gap units are metres without a suffix, decimetres (`d`),
centimetres (`c`), or millimetres (`m`).

`repeat` accepts distinct comma-separated axes: `x`, `y`, `z`, or combinations
such as `x,z`. `repeat-gap` is one nonnegative length used on every repeated
axis; it defaults to zero and requires `repeat`. Repetition preserves the
original offset and size. The default `repeat-edge: whole` includes only complete
copies that fit and leaves any remainder at the far edge. If no whole copy fits,
it produces no objects. Multiple axes form a grid.
An axis cannot simultaneously fill and repeat.

### Clipped edge tiles

Use `repeat-edge: clip` to cover the remainder with part of an additional tile:

```text
"Flooring/+2+109d/+66c+1c/+1d+397c":"color: white"
"Flooring/Tiling/+0+6d/+0+6d/+0+6d":"model: lepapayer/floor_tiling.glb; rotation: 90,0,0; repeat: x,z; repeat-gap: 1m; repeat-edge: clip"
```

This 10.9 × 3.97 metre floor generates 19 columns and 7 rows. Tiles retain their
600 mm sizing and 1 mm joints. The final visible column is 82 mm wide and the
final row is 364 mm deep; the corner is clipped on both axes. `repeat-edge`
accepts only `whole` (default) or `clip`, and requires `repeat`.

Clip mode includes every copy whose starting edge is strictly inside the parent:
`max(0, ceil((P - o) / (s + g)))`, with round-off tolerance at exact boundaries.
It preserves gaps: if the remaining space lies entirely in a gap, no sliver is
added. There is no stretching or redistribution. A tile larger than its parent
can still contribute its visible portion.

Clipping uses the parent's local boundaries **only on the repeated axes**, and
follows parent rotations and reference scaling. In the example, the 1 cm parent
height does not clip the tiles in Y. Nested subtrees retain ancestor clipping
boundaries and may introduce additional ones. Tile boxes, transforms, model
fitting, and UVs remain unchanged; the renderer clips visible geometry and
shadows. Imported materials are cloned per instance without modifying the
shared model asset. Shader clipping does not add solid caps across cut faces.

Selection rays and tour collision ignore the cropped portions (including
triangles crossing an edge). Selection/overlap bounds intersect the clipping
region, while retaining the existing conservative world-AABB approximation.
Primitive CSG operands are clipped before boolean evaluation; imported-model CSG
remains unsupported. Content cards, including HTML overlays, are not supported
inside clipped subtrees and are omitted with a diagnostic.

For parent length `P`, offset `o`, size `s`, and gap `g`, fill resolves to
`P - o`. Whole-edge repetition produces `max(0, floor((P - o + g) / (s + g)))` copies,
positioned at `o + i * (s + g)`; exact-fit comparisons allow floating point
round-off. Filling requires strictly positive remaining space.

The parent is the nearest **concrete namespace ancestor**, skipping
namespace-only declarations. Layout runs top-down in the parent's local axes,
before rotations, world transforms, collision bounds, and CSG. Rotated geometry
may extend beyond the parent's box: these rules size unrotated layout boxes,
unless `repeat-edge: clip` explicitly clips the repeated axes. A container's
filled box does not automatically stretch its children; children can declare
their own filled axes.

Repetition copies the entire subtree. Child layout is evaluated within each
copy, and nested repetition is supported. Repeat properties apply locally to
the concrete declaration, not as inherited namespace defaults. Children copied
from a reference template retain their own repeat rules. A reference instance
can itself repeat. Without `ref-scale`, template children fill the instance's
box. With `ref-scale: true`, layout accounts for the template-to-instance scale
so dimensions are scaled exactly once. Scaled templates need definite positive
source dimensions: give the template a fixed concrete anchor if its children
use fill sizing. Inferring a size from children that themselves need that size
is diagnosed rather than treated as a circular constraint.

Missing parents, invalid gaps/axes, incompatible fill/repeat rules, and
nonpositive fill extents produce diagnostics and omit the affected subtree.
Unanchored reference-template children are evaluated when materialized into an
instance. Generation is limited to 10,000 instances per repetition and 10,000
generated nodes per document (including descendants). Exceeding the document
budget omits the containing root subtree and reports a diagnostic.

Generated copies have unique, deterministic internal identities; their source
text and line number still identify the authored declaration. Editing a copy
therefore edits the source shared by all copies. Moving a filled axis preserves
its fill rule. Size nudges on filled axes leave the rule intact; enter an explicit
size in the source to switch that axis back to fixed sizing.

For compiler consumers, `parseAxisSpec` returns `size: 'fill'` for omitted sizes.
Parsed boxes carry `fillAxes`; their corresponding numeric dimensions are
unresolved (`NaN`). Use `resolveXyzDslDocument` or `createSpatialDocument` before
consuming dimensions for geometry. Resolved boxes have finite dimensions and no
`fillAxes`. Generated nodes expose `repeatSourceId` and `repeatIndices` in their
metadata, alongside the original `lineNumber`.

## Shared core

Tours and ordinary navigation share the same model-quality policy. Normal devices
keep an explicit `model-detail` asset or inferred `<stem>.detail.glb` as a stable
textured baseline. Missing details fall back to originals, subject to constrained
device memory checks. The runtime does not select `.standard` variants.
Previews require critical capability evidence: RAM ≤1 GiB, or RAM ≤2 GiB together
with ≤2 logical CPU cores. An iPhone, mobile viewport, or missing memory hint
alone never selects previews.

The former center/outer quality rings and two-second focus/downgrade timers no
longer apply. Nearby visible models covering at least 400 CSS pixels can request
originals after required baselines are decoded. Other devices also prefetch within
a 1.75× guard frustum; constrained devices request only models actually in view.
Visible requests outrank guard-only requests.

A displayed original remains protected while visible, including when another
model loads or its screen size shrinks. Under memory pressure, an original may
be released after eight continuous seconds outside the view and guard region,
or fully concealed by a verified solid wall. Returning before that interval
completes cancels release. The textured baseline stays resident. Inferred
simplification over 32× retains an original once granted; this fidelity guard
does not override admission limits.

Original upgrades have bounded residency. iOS, RAM ≤4 GiB, and unavailable memory
hints use a 160 MiB original allowance and 256 MiB combined model estimate.
Other devices allow 1,024 MiB of originals / 1,536 MiB combined. GLB metadata is
checked before optional decode and GPU upload; constrained required-model
fallbacks receive these checks too. These estimates are not actual process RAM
caps. Denied upgrades keep textured detail; oversized required scenes remain
covered by a preparation/error screen. The supplied bed detail has a known UV
defect that remains when its original cannot safely be admitted.

Refresh/unmount cancels pending work and disposes late results before GPU upload.
Context loss pauses loading; recovery retries interrupted work. Shader preparation
is cancellable. Decode work is serialized, shared instances retain resources
through leases, and demand rendering stops at rest. Removed baselines expire
after five seconds or sooner under pressure/new loading; released originals
have no additional cache grace.

The former `TourModelFocus` implementation is not used by `ModelPrimitive`.
Current policy lives in `src/scene/ModelPrimitive.tsx`,
`src/performance/ModelRuntime.tsx`, and `src/performance/modelUpgradeMemory.ts`.
The sibling explorer's `docs/performance/README.md` provides validation procedures
and limitations. Latest validation passed 321 viewer unit tests and the production
build, plus explorer Pap navigation, refresh, and context-recovery checks.
Physical iPhone testing remains necessary to confirm Safari crash resolution.

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

## Lights and enclosed interiors

Declare an invisible point emitter using the same spatial paths as view points:

```xyz
"lamp/+2+1c/+2+1c/+2+1c" : "light-source: true; light-color: #fff0d0; light-intensity: 10; light-distance: 0"
```

`light-source` accepts `true` or `point`; `false` leaves an ordinary object.
The box center sets the source position, including parent transforms. Its size
is an authoring handle, not a glowing mesh. In orbital editor mode, light
sources show an orange bounding box (yellow when selected), with the same
Cmd/Ctrl-click selection as view points. These helpers are hidden in viewing
and tour modes. Light settings are explicit on the
source declaration (not inherited namespace styles). Intensity defaults to 10
candelas; distance defaults to 0 (no cutoff), in metres. Both must be finite and
non-negative; intensity 0 disables illumination. Color defaults to white and
uses the existing material color syntax. Lights are excluded from solid geometry,
CSG, and collision. Referenced subtree lights retain their transformed positions.

All three viewers share shadow rendering. No directional or point lights are
created by default. A subtle white ambient fill (intensity 0.12) is present
everywhere, including sealed interiors, and casts no shadows. Scenes remain
dimly visible without explicit light sources; point lights add local illumination
and shadows. Point shadows use a scene-fitted distance range and small depth/normal
offsets, capped by declared solid dimensions, to reduce self-shadow striping.
Shadow maps use 2048 pixels per cube face; this costs four times the shadow-map
pixels of the previous 1024 setting. Hardware texture limits can reduce the
actual resolution. Thin imported mesh details and CSG shell thickness are not
fully represented by authoring bounds, so extreme scenes can still require tuning.
Imported models cast and receive shadows. Their camera-independent baseline
stays loaded off camera to preserve occlusion; original-fidelity upgrades follow
the shared memory policy. Shadow passes and retained baselines cost GPU time
and memory; each point source renders six
shadow views. Imported emissive/unlit materials, HTML content, missing assets,
coarse preview geometry and finite shadow-map precision can still affect the
appearance of lighting. Ambient fill is a visibility aid, not simulated indirect
light bounces.

Regression coverage includes `src/scene/Lighting.test.ts` and a GPU enclosure
check in the sibling explorer: run `npm run test:performance -- lighting.spec.ts`
from `explorer` with Chrome installed. The GPU test checks sealed panel and CSG
rooms for dim ambient visibility without an interior light, and brighter
illumination when an interior light is added.

## One-way observability for blocks and surfaces

`observable` names the **local side from which you can see through** a primitive
block. From the opposite side it renders normally. For example:

```xyzdsl
"Surface/+1+2/+1+2/+1+2" : "observable: true; color: gray"
"Wall/+0+4/+0+3/+0+1c" : "observable: +z; color: gray"
```

Accepted values are `+x`, `-x`, `+y`, `-y`, `+z`, `-z`, `true` (alias for `+z`),
and `false` (ordinary rendering, also the default). Invalid values produce a
parser diagnostic. `Surface` is an ordinary namespace, not a special geometry.
Use a thin box for a wall; zero thickness is not required.

The decision uses the camera position relative to the block's center plane.
For `+z`, a camera on the positive local Z side sees through the entire block;
a camera on the negative side or exactly on the plane sees the block. This
works for thick blocks as well as thin walls, and the axis follows the block's
resolved rotation, including parent transforms. This is a camera-dependent
cutaway, not glass or a physically simulated one-way mirror.

The property inherits through namespaces and references like other material
properties; `observable: false` explicitly cancels an inherited setting. It
applies to built-in primitives and CSG results (using the base block's setting
and center plane). Imported models and text/URL content currently do not apply
this property.

Implementation: the parser validates and normalizes the material property,
the resolver merges it, and `scene/observability.ts` updates mesh visibility
before rendering and model occlusion checks. On the see-through side the block
also stops casting shadows and intercepting selection rays. Physical POV
collision remains active on both sides. Existing scenes without the property
retain their normal rendering.

## Mobile rendering and local device testing

Point-light shadows share a bounded budget rather than allocating a 2048-face
atlas for every light. Mobile/touch and known low-memory devices use up to four
512-face shadows (64 MiB estimated RGBA + depth); desktop uses up to eight
shadowed lights within 256 MiB, reducing face resolution to fit. Pap's four
lights therefore use 512 on mobile and 1024 on desktop. Additional lights keep
illuminating but do not cast shadows. Atlas dimensions also respect the GPU's
maximum texture size. Shadows at 512 faces or below use a wider PCF filter
(radius 2) to soften jagged edges without increasing shadow-map allocation.
Mobile uses the balanced DPR cap of 1.5 with MSAA (critical devices and recovery
restarts use DPR 1 without MSAA). Original-model upgrades use rendered pixel
size so high-DPI phone screens do not unfairly remain on prepared detail assets.
Model fidelity and model admission limits remain separate and unchanged; these
estimates are not measurements of total browser memory.

WebGL context loss disables shadows and reduces DPR to 1. This fallback persists
for the tab session (including reloads), and loading/error/restart controls live
outside the WebGL canvas. Closing the tab clears its session fallback. Static
shadow caching is not enabled: model streaming, clipping, edits and visibility
changes continue to update shadows correctly.

To test the bundled Pap scene against local prepared models without depending
on the remote store, run from this directory:

```sh
XYZ_LOCAL_MODELS_DIR=/path/to/lepapayer-models \
VITE_MODEL_ASSET_BASE=http://127.0.0.1:5176/__local-models/ \
npm run dev -- --host 127.0.0.1 --port 5176 --strictPort
```

Open `http://127.0.0.1:5176/` in desktop or iOS Simulator Safari. The opt-in fixture
route serves only named GLB files from the configured directory during dev; it
is absent from production builds. The source scene is `src/defaultDraft.xyzdsl`.
`VITE_MODEL_ASSET_BASE` can also configure a hosted asset base at build time.

For a physical phone on the same Wi-Fi, replace `127.0.0.1` in both the host
and asset-base URL with the computer's LAN address, then open that address and
port in Safari. This temporarily exposes the development app and fixture models
to reachable LAN devices; stop the server with Ctrl-C when testing finishes.

Physical iPhone 11 testing of Pap confirmed loading/rendering and subsequent
improvements to model detail and shadow edges. Patterned striping remains in
some shadows and is deferred for a future fix. See
[mobile rendering validation](docs/mobile-rendering-validation.md) for coverage
and limitations.

For a development-only context-loss test, append `?renderDiagnostics=1` and use
**Test graphics recovery**. It requests context loss through `WEBGL_lose_context`
and requests restoration one second later. Confirm the loading UI clears,
navigation works, and the canvas `data-render-budget` reports `safe: true` and
zero shadow bytes. Simulated context loss does not validate recovery from an
OS process kill or prove the cause of the original phone crash.

## Imported model orientation

Use `reset-axes: X, Y, Z` to correct an imported model's orientation
before bounding-box fitting and alignment. Values are finite angles in degrees,
using XYZ Euler order, and default to `0, 0, 0`. The correction preserves the
asset's authored transforms and applies separately to each instance. It inherits
with model settings; an explicit `0, 0, 0` overrides an inherited correction.

```xyz
"Pap/BedroomRug/+7141m+165c/+0+1d/+2183m+6d" : "model: lepapayer/bedroom_rug.glb; reset-axes: 90, 0, 0; model-align: floor"
```

Y is vertical. `model-align: floor` places the corrected model at the bottom of
its target box. Ordinary `rotation` still rotates the fitted object and its
alignment offset together; use it for scene placement after reorientation.
