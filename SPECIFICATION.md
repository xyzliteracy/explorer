# XYZDSL specification and runtime

Explorer is the primary application and owns this executable specification.
The parser and regression tests define supported syntax; the historical
`xyz-dsl-spec` playground is not a second production implementation.

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
`+offset+size`, with either value optional. An omitted offset with a fixed size means **align to the parent’s far edge**;
an omitted size means **fill the remaining parent extent from that offset**.
The shorthand uses only existing Base64 path characters.

| Segment | Meaning |
| --- | --- |
| `+2d+1` | Start at 20 cm; size 1 metre |
| `++1` | Size 1 metre; start at parent size minus 1 metre |
| `+2d+` | Start at 20 cm; extend to the parent's far edge |
| `+0+` or `++` | Fill the entire parent axis |

```text
"Wall/+0+5/+0+3/+0+2d" : ""
"Wall/Rail/++/+1+1d/+0+2d" : "color: brown"
"Wall/Slat/+0+1d/++/+0+2d" : "repeat: x; repeat-gap: 1d"
```

The rail is 5 metres wide. There are 25 slats, each 10 cm wide and
3 metres tall, with 10 cm gaps. The final 10 cm of wall width remains empty.
`++size` resolves its offset as `parentSize - size`, in the parent's local
axis before rotation. It requires a concrete parent with a finite positive
extent and rejects sizes larger than that extent. `++` remains the special
case of zero offset and full parent size; `+0+size` explicitly starts at zero.
Repetition proceeds forward from the resolved offset, so far-edge alignment
produces one copy on that axis; backward repetition is not implied.

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
Primitive CSG operands are clipped before boolean evaluation. Static imported
models can be CSG targets as described under surface attachments below. Content cards, including HTML overlays, are not supported
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

Position nudges preserve far-edge alignment; enter an explicit offset in the
source to move freely. Size nudges change the fixed size while retaining alignment.

For compiler consumers, `parseAxisSpec` returns `offset: 'end'` for `++size`
and `size: 'fill'` for omitted sizes. Parsed boxes carry `endAxes` with unresolved
(`NaN`) offsets; layout resolves these and removes `endAxes`.
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
See `docs/performance/README.md` for validation procedures and limitations.

`xyz-explorer` exports the parser, spatial model, renderer, asset resolver,
and editor components for TypeScript-aware consumers. The native prototype
uses `SpatialScene` with its own asset transport. Explorer configures its remote
store in `src/scene/remoteModelUrl.ts`, including `VITE_MODEL_ASSET_BASE` overrides.

## Explorer workspace

Explorer retains its object tree, selected-object inspector, source editor,
transaction panels, and responsive workspace. Transform buttons support holding
Enter or Space and pointer presses for continuous modification. Step choices,
direct numeric editing, and scene keyboard controls remain available.

The initial scene is `src/defaultDraft.xyzdsl`. Rendering preferences and camera
settings live in `src/scene/CoreSceneRoot.tsx` and retain their persistence keys.
The reusable `VisualEditor` and `openLocalScene` APIs remain available to hosts;
Explorer uses its own transaction-aware `App` and `XyzDslDrawer`.

## Primary specification implementation

Explorer owns the executable parser, resolution rules, spatial model, renderer,
settings, defaults, and regression tests. Implement language changes in `src/xyzdsl`
and `src/model`, rendering changes in `src/scene`, and run `npm test` and `npm run build`.
The native prototype consumes these sources through the `xyz-explorer` package.


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

## Box surfaces

`box-surface` creates six ordinary solid box panels inside a concrete box:

```xyzdsl
"Room/+10d+366c/+10d+330c/+10d+391c":"box-surface: 1d white;"
```

The simplest syntax is `box-surface: <thickness> <color>`, or `box-surface: none`.
Face shorthands and overrides are specified below.
Thickness uses the existing path-length grammar: unpadded integer digits with
an optional `d`, `c`, or `m` suffix, or metres without a suffix. It must be
finite and strictly positive. The remaining value uses the existing `color`
syntax. Repeated properties use the final value. `none` disables a copied
surface rule and restores ordinary box/container behavior.

The declared dimensions describe the outside of the enclosure. For local
width W, height H, depth D, and thickness t, panels have these local boxes:

| Panel | Offset (X, Y, Z) | Size (X, Y, Z) |
| --- | --- | --- |
| Ceiling | (0, H−t, 0) | (W, t, D) |
| Floor | (0, 0, 0) | (W, t, D) |
| Front | (0, 0, 0) | (W, H, t) |
| Back | (0, 0, D−t) | (W, H, t) |
| Left | (0, 0, 0) | (t, H, D) |
| Right | (W−t, 0, 0) | (t, H, D) |

Panels overlap at corners, matching six explicit filled-axis box declarations.
The room above has a 3.46 × 3.10 × 3.71 metre clear interior. Layout requires
that the sum of opposing panel thicknesses is smaller than the corresponding
local dimension (`2t < min(W, H, D)` for uniform panels). Missing panels have
zero thickness; zero-width interiors are rejected. The parent is a
non-rendering container, so no solid box fills the interior. Authored children use the enclosure's interior coordinate system, described
below; generated panels remain anchored to the outside dimensions.

This is a local structural property, not an inherited namespace style. Ordinary
children do not acquire it. References retain the target's surface rule,
including rules on copied descendants; a local value overrides the copied rule.
Namespace-only declarations cannot enable it. The shorthand color overrides
panel color only; it does not change authored children's material defaults.
Other material settings come from the container's resolved material. Enclosure
observability is local to its panels, as specified below.

Panels are generated after parent-relative sizing, in the container's local
coordinates, before world transforms. Rotations apply once through the parent.
With `ref-scale: true`, panels and thickness scale with the template axes exactly
once; nonuniform scaling can produce different world thicknesses on each axis.
Without reference scaling, thickness remains the declared length. Repetition
copies the enclosure and its children; `repeat-edge: clip` clips panels through
the existing ancestor clipping rules.

Generated faces use deterministic internal identities that cannot collide with
source namespace names such as `Room/Floor`. Their metadata exposes
`surfaceSourceId` and `surfaceFace`; source text and line number identify the
authored enclosure. Selecting a face targets its enclosure, and edits change the
single source declaration. Each generated panel counts against the
shared 10,000 generated-node document budget, including repeated enclosures.
Exceeding that budget omits the containing root subtree atomically.

Malformed thickness, invalid resolved dimensions, and unsupported combinations
produce diagnostics and omit the affected concrete subtree. Version one supports
plain boxes, ordinary children, materials, transforms, references, and repetition.
A surface declaration cannot also be an imported model, content card, light,
viewpoint, non-box/deformed primitive, or CSG operation. Primitive CSG tools can cut generated panels as described below. Existing
explicit panel declarations retain their behavior.

Panels use the existing primitive rendering, shadow, observability, picking,
and collision paths. No renderer-specific shell primitive or new asset is needed.

### Per-face surface and observability properties

Face names and six-value order are **top, right, bottom, left, front, back**.
Top is +Y (ceiling), right +X, bottom −Y (floor), left −X, front −Z,
and back +Z, in the enclosure's local axes.

Both `box-surface` and enclosure `observable` accept comma-separated values:

| Count | Expansion |
| --- | --- |
| 1 | All six faces |
| 2 | Top/bottom; right/left/front/back |
| 3 | Top/bottom; right/left; front/back |
| 6 | Top, right, bottom, left, front, back |

Other counts and empty values are invalid. Commas inside color functions such
as `rgb(255, 0, 0)` are not separators. Every surface value is a positive path
length followed by a color, or `none`. Use `box-surface-top`,
`box-surface-right`, `box-surface-bottom`, `box-surface-left`,
`box-surface-front`, or `box-surface-back` to override one panel. Each longhand
accepts exactly one value. `none` on a face omits that panel; a single
`box-surface: none` disables the enclosure. An enabled enclosure with all faces
omitted remains a non-rendering container.

```xyzdsl
"Sal/+10d+366c/+10d+330c/+10d+391c":"box-surface: 1d white; box-surface-top: none; box-surface-bottom: 2d gray;"
```

Observability has matching `observable-top`, `observable-right`,
`observable-bottom`, `observable-left`, `observable-front`, and
`observable-back` longhands. Each value is `true`, `false`, or an explicit signed
axis. On an enclosure panel, `true` means see-through from that panel's **outside**:
+Y for top, +X for right, −Y for bottom, −X for left, −Z for front, +Z for back.
The panel remains visible from inside. `false` keeps it visible on both sides.
Visibility still uses each panel's center plane, follows transforms, suppresses
shadows and selection rays while hidden, and leaves physical collision active.

```xyzdsl
"Sal/+10d+366c/+10d+330c/+10d+391c":"box-surface: 1d white; observable-top: true;"
"Other/+6+4/+1+4/+1+4":"box-surface: 1d white; observable: true; observable-bottom: false;"
```

The first example hides only the ceiling when viewed from above. The second
allows exterior views through every panel except its floor. Explicit directions
retain their meaning: `observable: +y` assigns +Y to every panel and can hide the
floor and walls at different camera heights. Use `observable-top: true` for a
ceiling cutaway. Ordinary boxes retain the existing `observable: true` alias
for +Z.

Shorthands and longhands apply in source declaration order: a later shorthand
replaces all earlier face values of that property; a later longhand replaces
only its face. Reference settings are copied before local declarations are
applied. Surface and enclosure observability settings do not propagate to ordinary
children, but copied descendants retain their own settings. Face-specific
properties and multi-value observability require an enabled enclosure, including
one obtained through a reference. Unsupported combinations or malformed values
produce diagnostics and omit the affected concrete subtree. Observability on an
omitted face has no rendering effect.

### Interior coordinates for enclosure children

Children of a `box-surface` enclosure start at its interior corner. Local
`+0` on X, Y, and Z lies on the inside of the left, bottom, and front panels,
respectively. Missing panels contribute zero inset. The available child-layout
extent is the outer local size minus the two opposing panel thicknesses.

```xyzdsl
"Sal/+10d+366c/+10d+330c/+10d+391c":"box-surface: 1d white;"
"Sal/Bed/+0+155c/+0+8d/+0+205c":"model: salouis/wooden_bed.glb"
```

Here the bed's target box starts at world (1.1, 1.1, 1.1) metres and retains
its 1.55 × 0.80 × 2.05 metre dimensions. Model fitting and alignment still use
that target box. `++` fills the 3.46 × 3.10 × 3.71 metre interior;
`++size` aligns to the corresponding inside far wall. Explicit offsets are
measured from the interior origin. Fixed dimensions are not automatically
clamped or resized to fit inside the room.

Repetition counts and `repeat-edge: clip` use interior boundaries. The inset
is applied before world rotation and reference scaling, exactly once per concrete
enclosure ancestor, including through namespace-only groups. Nested enclosures
introduce their own interior coordinate frames. Ordinary intermediate containers
keep their usual coordinate rules. Generated panels stay in the exterior frame,
and hiding a panel with `observable` does not remove its inset; only `none`
removes a panel. `box-surface: none` restores ordinary container coordinates.

This changes earlier enclosure child layout: existing authored child offsets
that already included wall thickness should remove that manual allowance.
Resolved child boxes include the inset; source paths retain authored offsets.

### CSG tools overlapping enclosure panels

Declare a primitive tool after the enclosure using the existing `operation`
property. Target selection retains the existing rule: nearest earlier overlapping
primitive, preferring the same namespace scope. If the selected target is an
enclosure panel, subtraction and intersection apply independently to every
panel of that same enclosure instance whose world bounds overlap the tool.
Other enclosures and non-overlapping panels remain unchanged. Intersection is
therefore a per-panel operation, not intersection of the entire shell.

```xyzdsl
"Room/+1+4/+1+4/+1+4":"box-surface: 1d white; observable: true"
"Window/+9d+3d/+2+1/+2+1":"operation: subtraction"
```

The tool spans X=0.9–1.2 metres, cutting through the left panel at X=1–1.1.
This example uses a world-space sibling tool because child coordinates begin
at the room's interior surface. A tool must cross the panel thickness to make
a through-opening; merely touching its inside boundary is insufficient.

Corner cuts can affect multiple panels. Each result retains its panel material,
observability, selection owner, and existing CSG rendering/collision behavior.
Tools are consumed once, and successive operations retain source order.
Union retains a single selected panel as its base so the added solid is emitted
only once. Static imported models can also be CSG targets; imported models
cannot serve as tools. The enclosure declaration itself cannot carry an `operation`. Omitted panels cannot be CSG targets.
Clipped primitives continue to use the existing operand clipping rules.


## Surface-attached components

`surface` attaches a concrete child to the interior faces of its nearest concrete
`box-surface` parent. It accepts `walls` (left, front, right, back), `all` (all six
faces), or distinct comma-separated face names. It is local, not inherited by
ordinary children; references retain it. Namespace-only declarations cannot
attach. An explicit missing face produces a diagnostic and no copy for that
face; `walls` and `all` silently skip omitted panels.

```xyzdsl
"Sal/+10d+366c/+10d+330c/+10d+391c":"box-surface: 1d white; observable: true;"
"Sal/Tiling/+0+85c/+0+86c/+0+2c":"surface: walls; model: salouis/tile_triad.glb; reset-axes: 90,0,0; repeat: x; repeat-gap: 1m; repeat-edge: clip;"
```

Attachment coordinates are face-local: X goes across the face, Y goes up the
face, and positive Z extends from its interior surface into the room. For walls,
Y is always enclosure +Y. The following basis vectors are in enclosure-local
axes, and origins are corners of the clear interior:

| Face | Origin | Local X | Local Y | Local Z |
| --- | --- | --- | --- | --- |
| front | left/bottom/front | +X | +Y | +Z |
| back | right/bottom/back | −X | +Y | −Z |
| left | left/bottom/back | −Z | +Y | +X |
| right | right/bottom/front | +Z | +Y | −X |
| top | left/top/front | +X | +Z | −Y |
| bottom | left/bottom/back | +X | −Z | +Y |

Each copy uses the same source dimensions and offsets. `reset-axes` corrects an
asset once before fitting, then the face frame places it. Ordinary `rotation`
is relative to that frame. Fill, far-edge alignment, and repetition operate in
face axes. Depth fill uses the full clear interior dimension normal to the face.
`repeat: x` repeats independently across each face; `x,y` forms a grid. Clipping
uses the face-local repeat boundaries, not world X/Y/Z. There is no automatic
corner wrapping, pattern centering, corner trimming, or mitering.

An attachment and its descendants follow the owning panel's observability
using that panel's center plane, including imported model meshes. Hidden
attachments do not render, cast shadows, or intercept selection rays; physical
collision remains active. Ordinary furniture is unaffected. CSG results retain
this behavior. Attachments on removed faces are not generated.

Attachment frames and copies count against the shared generated-node budget.
Internal identities are deterministic and source line ownership is retained;
selecting a copy edits its shared authored declaration. Children are copied
with the attachment. Models and primitives are supported; content cards,
lights, and viewpoints cannot be directly attached.

### CSG with repetitions and imported targets

A primitive tool with `operation` can target repeated primitives or static
imported models. Subtraction/intersection fan out to all overlapping instances
of the selected repetition group; union still emits the added solid only once
on the selected base. Each repeated cutter is evaluated in source order. Groups
are scoped to their concrete parent/reference instance, so unrelated copies
are not accidentally modified. Non-overlapping instances remain unchanged.

When the selected target is an enclosure panel **or a surface attachment**, the
same tool applies to overlapping panels and attachments of that enclosure.
This makes one window tool cut both the wall and its tile finish. Ordinary
furniture is not included in that group. Existing source-order and namespace
preferences still determine the initial target. Intersection is per overlapping
piece, not intersection of the entire room or repetition set.

GLB processing happens on instance-owned static meshes after orientation and
fitting, before display. Quantized and interleaved vertex attributes are decoded
to floating-point values on the instance copy before world-space transforms
and boolean evaluation. This prevents compressed asset tiers from losing
tiles outside the cut. Shared source buffers remain unchanged. Existing UVs,
vertex colors, tangents, and material groups are retained; newly cut faces use the affected mesh's first
material and the primitive tool's UVs. Untextured parts without UV attributes
receive neutral coordinates. Cuts preserve the original target box and fitting
rather than shrinking and refitting the remaining geometry. Rendered triangle
picking and collision use the cut geometry; authoring bounds remain conservative.
The active streamed asset tier is cut independently, so geometric detail may
change when a higher-quality asset becomes available.

Imported models remain unsupported as CSG *tools*. Skinned, instanced, or
morph-target meshes are not supported as imported CSG targets. They produce a
model preparation error rather than silently showing an uncut asset. Work is
limited to 2,000,000 input triangles × operations per model instance. Primitive
tools retain their repetition clipping; imported target geometry retains its
rendering/shadow/raycast clipping. Model union adds the tool solid to the first
mesh once; it does not merge the asset's original meshes into one solid. Valid,
closed mesh inputs are recommended; non-manifold or self-intersecting imported
geometry can produce imperfect boolean results.


For example, append this world-space tool after the Sal tiling declaration to
cut the front wall and overlapping tiles together:

```xyzdsl
"WindowCut/+2+1/+13d+5d/+9d+4d":"operation: subtraction;"
```

The tool spans X=2–3, Y=1.3–1.8, Z=0.9–1.3 metres, crossing both the wall and
the inward tile finish. Keep the cutter after the intended targets. Attached
components use face coordinates, while this sibling cutter uses world coordinates.

Regression coverage lives in `src/xyzdsl/surfaceAttachment.test.ts` and
`src/scene/modelCsg.test.ts`, alongside the existing enclosure CSG tests. Checks
cover orientation, clipping, references, missing faces, repeated cutters,
shared-asset preservation, material groups, and picking/collision through cuts.
Run `npm test` and `npm run build` in Explorer, and `npm run build:renderer`
in the native viewer after shared renderer changes.


## Observability in tours

`observable` cutaways apply only outside tour mode. While a viewpoint tour is
active, primitive panels, CSG results, and surface-attached models remain visible
from both sides regardless of their observable settings. This also restores
normal shadow casting, picking, and visual occlusion. Collision remains active
in either mode. Leaving the tour restores camera-dependent cutaway behavior.

No source edits are required. For adjoining rooms, a wall marked observable
from the outside therefore stays visible when a tour viewpoint enters the
neighboring room. CSG openings and explicitly omitted panels remain open;
tour mode does not reconstruct removed geometry.

## Grid partitions

A concrete `box-surface` enclosure can divide its clear interior into an equal
three-dimensional grid. These are local structural properties, not inherited
namespace styles. References retain them and can override them in declaration
order. Ordinary descendants do not acquire a grid or cell selection.

```xyzdsl
"Cabinet/+0+12d/+0+18d/+0+4d":"box-surface: 2c white; box-surface-front: none; box-grid: 3 4 2; box-partition: 1c gray;"
"Cabinet/Item/+0+20c/+0+25c/+0+15c":"cell: 2 3 1; model: item.glb;"
```

| Property | Values | Meaning |
| --- | --- | --- |
| `box-grid` | Three positive integer counts, or `none` | Columns (X), rows (Y), slices (Z); `none` clears the grid and partition style |
| `box-grid-columns` | One positive integer | Equal columns from left to right |
| `box-grid-rows` | One positive integer | Equal rows from bottom to top |
| `box-grid-slices` | One positive integer | Equal slices from front to back |
| `box-partition` | Positive path length followed by color | Uniform internal-divider thickness and color |
| `cell` | Three positive one-based indices, `all`, or `none` | Place in column/row/slice, copy into every cell, or clear a referenced cell selection |

Declaring a grid longhand or partition style initializes unspecified counts to
one. A count of one creates no divider on that axis. A `1 1 1` grid exposes one
cell without internal geometry and needs no partition style. Any larger grid
requires an explicit `box-partition`; it never guesses a thickness or color from
potentially different outer faces. Grid and cell rules require concrete
objects, including when used in templates. A grid requires an active
`box-surface` enclosure; cancelling the shell on a reference also requires
cancelling its grid. Existing plain-box restrictions for `box-surface` apply.

### Clear dimensions and cell layout

Resolve the enclosure and its existing outer-face thicknesses first. On each
axis with clear interior extent `L`, count `n`, and divider thickness `t`:

```text
clear cell size = (L - (n - 1) × t) / n
cell origin = outer near-face thickness + (index - 1) × (clear cell size + t)
```

Lengths use the enclosure's local coordinates before parent/reference transforms.
Rotations and `ref-scale` apply once to the shell, dividers, cell frames, and
children. Each repeated/reference enclosure owns its own grid. Omitted outer
faces contribute no inset; they do not remove internal partitions.

`cell` resolves against the nearest concrete parent, which must have a grid.
Namespace-only grouping does not change that parent. Cell frames are internal
layout anchors with deterministic identities, not authored namespace names.
For `cell: all`, the child and its descendants are copied once per cell, with
independent repetition and unique instance IDs. Selecting a copy retains its
authored source ownership. Children without `cell` retain the existing enclosure
interior coordinates and may span multiple cells. A child can itself declare
another gridded enclosure, allowing nested subdivisions.

Within a selected cell, `+0` starts at its clear interior corner. Fill and
far-edge alignment use the clear cell extent. Repetition and `repeat-edge: clip`
use cell boundaries. Ordinary explicitly sized children are not automatically
clamped or clipped to a cell. Descendants use their usual parent coordinates.

### Cell surfaces and shared solid geometry

```xyzdsl
"Cabinet/Lining/+0+10c/+0+10c/+0+1m":"cell: all; surface: walls; model: tile.glb; repeat: x,y; repeat-edge: clip;"
```

Combining `cell` and `surface` selects the cell before selecting its inward-facing
boundary surfaces. The existing six face-local coordinate frames apply. Adjacent
cells can attach different finishes to opposite sides of one divider. Internal
boundaries exist wherever that axis has a divider; outer boundaries exist only
where the corresponding shell face exists. Explicit missing-face targets produce
a diagnostic; `walls` and `all` skip missing faces. Depth fill on an attachment
uses the selected cell's clear depth normal to that face. Finishes add thickness
inside the cell but do not further inset the logical cell layout.

The divider lattice is rendered as one static solid per enclosure, containing
only the boundary of the union of its slabs. Shared junctions emit no overlapping
solids, duplicate coplanar faces, or internal faces. The generated node has
`surfaceSourceId` pointing to its enclosure and `partitionGrid: true` metadata;
selecting it selects the enclosure. Cell instances expose one-based
`cellIndices` metadata. Individual divider overrides are reserved for a later
extension; they are not part of this syntax.

Outer-shell observability keeps its existing behavior. Internal dividers are
always visible, and their attachments do not inherit outer-panel cutaways.
Attachments on outer cell boundaries follow the corresponding shell panel.
Tour mode continues to disable observable cutaways for all of these surfaces.

Primitive CSG tools participate in the existing enclosure fan-out: a cut targeting
an enclosure panel, its partition grid, or an attachment affects overlapping
panels, the grid solid, and attached finishes of that concrete enclosure.
Ordinary furniture is not included in that fan-out. Source ordering and target
selection remain unchanged; the grid uses a conservative interior bounding box
for candidate selection. Imported finishes use the existing static-model CSG
path, including quantized geometry handling. Rendering, picking, and collision
use the actual grid or cut geometry. CSG does not merge cells, change their
indices, resize their clear extents, or remove their logical attachment frames.

### Validation and bounded generation

Counts and indices must be positive safe integers. Reject malformed values,
out-of-range selections, missing grid parents, missing partition styles for
multi-cell grids, and dimensions that leave no positive clear cell space.
Invalid grids omit their enclosure subtree; invalid cell selections omit that
child subtree. Diagnostics retain the authored line. Version one accepts equal
counts only: fixed-length/fractional tracks, cell spans, and cell ranges are not
implemented.

Before generating each grid instance, reserve `(2×columns−1) × (2×rows−1) ×
(2×slices−1)` units of the shared 10,000 generated-instance budget. This bounds
both empty cells and solid lattice blocks, and therefore the boundary mesh work,
even though the solid renders as one mesh. Generated shell panels, cell placement
frames, attachment frames, and repeated copies also consume the shared budget.
Exceeding it omits the containing root subtree atomically and releases that
subtree's reservation so independent roots can still resolve.

Coverage lives in `src/xyzdsl/boxGrid.test.ts` and
`src/scene/partitionGridGeometry.test.ts`: clear dimensions, references, copies,
attachments, budgets, closed outward geometry without internal faces, CSG,
picking, and collision.
