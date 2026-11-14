# Solstice — Meadow Study

A standalone Three.js WebGPU grass-field demo, inspired by the procedural meadow and garden layout in [SamG-Coder/solstice-garden](https://github.com/SamG-Coder/solstice-garden). This is a clean-room Three.js recreation, not a port of Solstice's Rust renderer.

## Run locally

Requires Node.js 20+ and a recent browser with WebGPU support (desktop Chrome or Edge recommended).

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Drag to orbit and scroll to zoom. Use the Breeze slider to change the grass movement.

## Grass approach

- Dense, deterministic, jittered tuft placement (about 25 clumps per square metre in the meadow region), with short filler shoots between clumps.
- Each blade is curved geometry with a tapered point and folded cross-section; no grass-card textures.
- Separate height and color variation for meadow blades, plus a GPU TSL wind deformation and interactive wind-strength control.
- A single merged grass mesh/draw call; the current demo favors close-up appearance over very large-world scalability.

The original garden's custom virtual-geometry renderer, global illumination, streaming system, exact garden plan, and tree/plant models are not included. An exact visual match requires porting much more than the grass generator, including the original renderer and scene assets. This demo is an independently implemented Three.js approximation and does not include Solstice scene assets.

## License and attribution

This demo's source is MIT licensed. Solstice Garden is also MIT licensed; see the linked upstream repository for its original license and authorship. No Solstice scene assets are included.
