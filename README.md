# Solstice — Meadow Study

A standalone Three.js WebGPU grass-field demo, inspired by the procedural meadow and garden layout in [SamG-Coder/solstice-garden](https://github.com/SamG-Coder/solstice-garden). This is an independent Three.js recreation, not a port of Solstice's Rust renderer.

## Run locally

Requires Node.js 20+ and a recent browser with WebGPU support (desktop Chrome or Edge recommended).

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Drag to orbit and scroll to zoom. Use the Breeze slider to change the grass movement.

## Grass and pond

- Dense, deterministic, jittered tuft placement with short filler shoots between clumps.
- Each blade is curved geometry with a tapered point and folded cross-section; no grass-card textures.
- A multi-lobed pond outline inspired by the source garden's distance-field layout, with an irregular gravel/silt margin.
- The pond surface uses a procedural equirectangular sky environment, physically based clearcoat, and five animated ripple scales in a repeating bump map.
- TSL vertex deformation animates the grass wind; the pond ripples animate independently.

The original renderer's screen-space scene reflections, refraction, depth-aware shoreline fade, global illumination, and exact garden scene are not reproduced here. The pond is a Three.js approximation: it reflects a procedural sky environment, not the live trees and shoreline. An exact visual match requires porting much more than the water shader and scene layout.

## License and attribution

This demo's source is MIT licensed. Solstice Garden is also MIT licensed; see the linked upstream repository for its original license and authorship. No Solstice scene assets are included.
