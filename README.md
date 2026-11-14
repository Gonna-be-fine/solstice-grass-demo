# Solstice — Meadow Study

A standalone Three.js WebGPU grass-field demo, inspired by the procedural meadow and garden layout in [SamG-Coder/solstice-garden](https://github.com/SamG-Coder/solstice-garden). This is a clean-room Three.js recreation, not a port of Solstice's Rust renderer.

## Run locally

Requires Node.js 20+ and a recent browser with WebGPU support (desktop Chrome or Edge recommended).

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Drag to orbit and scroll to zoom. Use the Breeze slider to change the grass movement.

## What is implemented

- Real curved, tapering blade geometry grouped into deterministic tufts (not grass cards).
- Separate meadow colors/heights, a procedural pond and footpath, scattered simple flowers and a procedural tree line.
- TSL vertex deformation for a layered, traveling wind motion on the GPU.
- A single grass draw call, ACES tone mapping, warm directional lighting and soft atmospheric fog.

The original garden's custom virtual-geometry renderer, global illumination, streaming system, tree assets, and exact plant models are not included. The goal is a small, editable Three.js demo that captures the grassy feel rather than an engine-feature-equivalent port.

## License and attribution

This demo's source is MIT licensed. Its procedural grass approach is independently implemented and informed by the public-domain techniques and source structure of Solstice Garden. Solstice Garden is MIT licensed; see the linked upstream repository for its original license and authorship. No Solstice scene assets are included.
