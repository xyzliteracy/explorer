# Pap mobile rendering validation — 2026-10-17

The user-supplied Pap fixture matches `src/defaultDraft.xyzdsl`: four point
lights, six viewpoints, 27 distinct model sources, and repeated/clipped floor
tiles. Models were served from a local folder through the opt-in development
route documented in README. No models were uploaded or bundled.

## Final rendering policy

- Mobile: up to four 512-face point shadows, about 64 MiB for RGBA + depth.
  The previous four-2048 configuration estimated about 1024 MiB before driver
  overhead or hardware clamping. This is an allocation estimate, not measured
  process memory.
- Desktop: four Pap lights use 1024 faces, about 256 MiB. Smaller light counts
  can retain 2048 faces within the budget. Shadowed lights are capped at four
  mobile/eight desktop; excess lights still illuminate in declaration order.
- Shadows at 512 faces or below use PCF radius 2 with the existing nine taps.
- Balanced rendering uses DPR <= 1.5 and antialiasing. Original-model promotion
  uses rendered pixel size, while existing model-memory admission limits remain.
- Context loss disables shadows and lowers DPR to 1 for the tab session.
  A recovery restart also disables MSAA. Loading/error/restart UI is outside
  Canvas so it remains available when WebGL cannot render.

## Verification

- Viewer suite: 56 files / 401 tests passed.
- Viewer and Explorer production builds passed; the existing large-bundle
  warning remains.
- Clean desktop local-model run loaded all six tour positions and wrapped to
  one without console warnings/errors. Diagnostic shadow estimate: 268435456
  bytes, four lights, 1024 faces.
- Forced `WEBGL_lose_context` enabled safe rendering and zero shadow allocation;
  the scene rendered again and navigation reached viewpoint two.
- iOS 27.1 Simulator Safari (iPhone Duo) visibly rendered the textured Pap scene
  and rendered again after reload. A remote-asset failure showed the external
  error message and retry control.
- Physical iPhone 11: the user confirmed everything loaded and rendered.
  After restoring balanced DPR/MSAA and rendered-pixel model promotion, the
  user reported visibly improved models. After widening shadow filtering, the
  user reported greatly improved shadows, with patterned striping still visible
  in some shadows. That remaining artifact is deferred at the user's request.
- Temporary Wi-Fi fixture sharing was stopped at the end of testing.

## Limits and remaining work

The original crash has not been conclusively attributed to shadow allocation.
No physical memory profiling or OS process-kill recovery test was performed.
Simulated context loss validates recovery logic only. The shadow policy bounds
one major cost; it does not guarantee total process memory.

Simulator coordinate automation could not target the device window, so simulator
navigation taps and orientation changes were not verified. Desktop navigation
was verified; physical results above are user observations.

The remaining shadow striping has not been isolated to filtering versus depth
self-shadowing. A future fix should reproduce the affected viewpoint and inspect
the artifact before changing bias or filtering. Prepared model variants may
still differ from originals when original admission exceeds the model budget.

Screenshots remain ignored local artifacts in `test-results/mobile-rendering/`.
HMR produced closed-store errors during development; clean-page validation after
editing had no console errors.
