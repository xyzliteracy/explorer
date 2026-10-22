import { canonicalNamespacePath } from './pathParser';
import type { ResolvedSpatialObject } from './resolveDocument';
import type { AxisName, ParseDiagnostic } from './types';

const AXES = ['x', 'y', 'z'] as const;
const SIZES = ['width', 'height', 'depth'] as const;
export const MAX_LAYOUT_INSTANCES = 10000;

/** Resolve parent-relative boxes and expand subtrees before transforms, bounds and CSG. */
export function resolveLayout(
  objects: ResolvedSpatialObject[], diagnostics: ParseDiagnostic[], templates: Set<string>,
): ResolvedSpatialObject[] {
  const byNamespace = new Map<string, ResolvedSpatialObject>();
  for (const object of objects) if (object.namespacePath && !byNamespace.has(object.namespacePath)) byNamespace.set(object.namespacePath, object);
  const children = new Map<ResolvedSpatialObject | undefined, ResolvedSpatialObject[]>();
  for (const object of objects) {
    let parent: ResolvedSpatialObject | undefined;
    for (let length = object.namespace.length - 1; length > 0; length--) {
      parent = byNamespace.get(canonicalNamespacePath(object.namespace.slice(0, length)));
      if (parent) break;
    }
    children.set(parent, [...(children.get(parent) ?? []), object]);
  }
  const result: ResolvedSpatialObject[] = [];
  let generated = 0;
  const budgetExceeded = new Error('layout-budget');
  const report = (object: ResolvedSpatialObject, message: string) => diagnostics.push({ line: object.lineNumber, source: object.source, message });

  function visit(object: ResolvedSpatialObject, parent?: ResolvedSpatialObject, originalParent?: ResolvedSpatialObject): void {
    const box = { ...object.box };
    const fill = box.fillAxes ?? [];
    const end = box.endAxes ?? [];
    const repeat = object.repeat;
    const dynamic = fill.length > 0 || end.length > 0 || repeat !== undefined;
    if (object.boxSurface?.invalid) return;
    if (repeat?.invalid) return; // The property parser already diagnosed this declaration.
    if (dynamic && !parent) {
      // Unanchored template definitions are resolved in the context of each reference.
      if (![...templates].some(path => object.namespacePath.startsWith(path))) report(object, 'Parent fill, far-edge alignment and repetition require a concrete parent anchor.');
      return;
    }
    if (repeat?.axes.some(axis => fill.includes(axis))) {
      report(object, 'An axis cannot both fill its parent and repeat.');
      return;
    }
    const extents = SIZES.map((size, index) => parent ? parent.box[size] / (parent.anchorScale?.[index] ?? 1) : 0);
    for (const axis of end) {
      const index = AXES.indexOf(axis);
      const extent = extents[index];
      const size = box[SIZES[index]];
      const tolerance = 8 * Number.EPSILON * Math.max(Math.abs(extent), Math.abs(size));
      if (!Number.isFinite(extent) || extent <= 0 || size - extent > tolerance) {
        report(object, 'Far-edge alignment requires a finite positive parent extent and a size no larger than that extent.');
        return;
      }
      box[axis] = Math.max(0, extent - size);
    }
    delete box.endAxes;
    for (const axis of fill) {
      const index = AXES.indexOf(axis);
      box[SIZES[index]] = extents[index] - box[axis];
    }
    delete box.fillAxes;
    if (SIZES.some(size => !Number.isFinite(box[size]) || box[size] <= 0) || AXES.some(axis => !Number.isFinite(box[axis]))) {
      report(object, 'Layout requires finite positive dimensions; a filled axis must start before the parent edge.');
      return;
    }
    let anchorScale = object.anchorScale;
    if (object.referenceDimensions) {
      if (object.referenceDimensions.some(size => !Number.isFinite(size) || size <= 0)) {
        report(object, 'ref-scale requires definite positive template dimensions; declare a fixed template anchor when its children use parent fill.');
        return;
      }
      anchorScale = SIZES.map((size, index) => box[size] / object.referenceDimensions![index]) as [number, number, number];
    }
    const surface = object.boxSurface;
    const localSizes = SIZES.map((size, index) => box[size] / (anchorScale?.[index] ?? 1));
    if (surface && (object.geometry.kind !== 'box' || object.geometry.operation || object.geometry['box-radius'] || object.geometry.puff || object.model.source || object.content.kind || object.light || object.viewPoint)) {
      report(object, 'box-surface supports plain boxes only; model, content, light, view-point, CSG and deformed geometry combinations are unsupported.');
      return;
    }
    if (surface && localSizes.some(size => !Number.isFinite(size) || 2 * surface.thickness >= size)) {
      report(object, 'box-surface requires twice its thickness to be smaller than every resolved local box dimension.');
      return;
    }
    const counts = AXES.map((axis, index) => {
      if (!repeat?.axes.includes(axis)) return 1;
      const pitch = box[SIZES[index]] + repeat.gap;
      if (repeat.edge === 'clip') {
        // Emit only copies whose starting edge is strictly inside the parent.
        const ratio = (extents[index] - box[axis]) / pitch;
        return Math.max(0, Math.ceil(ratio - 8 * Number.EPSILON * Math.max(1, Math.abs(ratio))));
      }
      const ratio = (extents[index] - box[axis] + repeat.gap) / pitch;
      // Compensate only for floating point round-off at an exact-fit boundary.
      return Math.max(0, Math.floor(ratio + 8 * Number.EPSILON * Math.max(1, Math.abs(ratio))));
    });
    const count = counts.reduce((a, b) => a * b, 1);
    if (!Number.isFinite(count) || count > MAX_LAYOUT_INSTANCES) {
      report(object, `Repetition exceeds the ${MAX_LAYOUT_INSTANCES} instance limit.`);
      return;
    }
    const namespace = parent && originalParent
      ? [...parent.namespace, ...object.namespace.slice(originalParent.namespace.length)]
      : object.namespace;
    for (let x = 0; x < counts[0]; x++) for (let y = 0; y < counts[1]; y++) for (let z = 0; z < counts[2]; z++) {
      const indices: [number, number, number] = [x, y, z];
      const repeated = repeat !== undefined || parent?.repeatSourceId !== undefined;
      if (repeated && ++generated > MAX_LAYOUT_INSTANCES) {
        throw budgetExceeded;
      }
      // Internal-only suffix cannot collide with a source namespace (which excludes #).
      const instanceNamespace = [...namespace];
      if (repeat) instanceNamespace[instanceNamespace.length - 1] += `#repeat${indices.join(',')}`;
      const instanceBox = { ...box };
      AXES.forEach((axis: AxisName, index) => {
        if (repeat?.axes.includes(axis)) instanceBox[axis] += indices[index] * (box[SIZES[index]] + repeat.gap);
      });
      const instance: ResolvedSpatialObject = {
        ...object, box: instanceBox, anchorScale,
        ...(repeat?.edge === 'clip' ? {
          repeatClip: repeat.axes.map(axis => ({ axis, extent: extents[AXES.indexOf(axis)] })),
        } : {}),
        namespace: instanceNamespace,
        namespacePath: canonicalNamespacePath(instanceNamespace),
        parentNamespacePath: parent?.namespacePath ?? object.parentNamespacePath,
        id: repeated ? `${object.id}@${canonicalNamespacePath(instanceNamespace)}` : object.id,
        ...(repeated ? { repeatSourceId: object.id, repeatIndices: repeat ? indices : parent?.repeatIndices } : {}),
      };
      if (surface) instance.renderable = false;
      result.push(instance);
      if (surface && object.layoutEligible) {
        const [width, height, depth] = localSizes;
        const t = surface.thickness;
        const panels = [
          ['ceiling', 0, height - t, 0, width, t, depth],
          ['floor', 0, 0, 0, width, t, depth],
          ['front', 0, 0, 0, width, height, t],
          ['back', 0, 0, depth - t, width, height, t],
          ['left', 0, 0, 0, t, height, depth],
          ['right', width - t, 0, 0, t, height, depth],
        ] as const;
        // Anonymous surfaces need an internal anchor namespace for parenting.
        if (!instance.namespace.length) {
          instance.namespace = [`#surface${instance.id}`];
          instance.namespacePath = canonicalNamespacePath(instance.namespace);
        }
        for (const [face, px, py, pz, pw, ph, pd] of panels) {
          if (++generated > MAX_LAYOUT_INSTANCES) throw budgetExceeded;
          const panelNamespace = [...instance.namespace, `#surface-${face}`];
          result.push({
            ...instance,
            id: `${instance.id}#surface-${face}`,
            namespace: panelNamespace,
            namespacePath: canonicalNamespacePath(panelNamespace),
            parentNamespacePath: instance.namespacePath,
            box: { source: object.box.source, x: px, y: py, z: pz, width: pw, height: ph, depth: pd },
            material: { ...instance.material, color: surface.color },
            geometry: { kind: 'box', diagnostics: [] },
            transform: { rotation: [0, 0, 0], diagnostics: [] },
            reference: { diagnostics: [] },
            boxSurface: undefined, repeat: undefined, repeatClip: undefined,
            anchorScale: undefined, referenceDimensions: undefined,
            surfaceSourceId: instance.id, surfaceFace: face,
            renderable: true,
          });
        }
      }
      for (const child of children.get(object) ?? []) visit(child, instance, object);
    }
  }
  for (const root of children.get(undefined) ?? []) {
    const checkpoint = result.length;
    try { visit(root); }
    catch (error) {
      if (error !== budgetExceeded) throw error;
      result.splice(checkpoint);
      report(root, `Layout generation exceeds the ${MAX_LAYOUT_INSTANCES} generated-instance budget; this root subtree was omitted.`);
    }
  }
  return result;
}
