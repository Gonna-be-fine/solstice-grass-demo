import * as THREE from 'three/webgpu';

// A seamless multi-scale turf texture inspired by Solstice Garden's baked lawn:
// broad healthy/dull patches, finer mottling, and restrained blade-like grain.
function createTurfTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const pixels = image.data;

  function hash(x, y, seed) {
    let value = Math.imul(x ^ seed, 0x45d9f3b) ^ Math.imul(y + seed, 0x27d4eb2d);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  // Periodic value noise so the texture tiles without visible seams.
  function noise(x, y, cells, seed) {
    const px = x * cells;
    const py = y * cells;
    const ix = Math.floor(px);
    const iy = Math.floor(py);
    const fx = px - ix;
    const fy = py - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (dx, dy) => hash((ix + dx) % cells, (iy + dy) % cells, seed);
    const top = THREE.MathUtils.lerp(at(0, 0), at(1, 0), sx);
    const bottom = THREE.MathUtils.lerp(at(0, 1), at(1, 1), sx);
    return THREE.MathUtils.lerp(top, bottom, sy) * 2 - 1;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const broad = noise(u, v, 5, 17) * 0.5 + noise(u, v, 13, 31) * 0.28;
      const mottling = noise(u, v, 47, 53) * 0.14;
      const fine = noise(u, v, 173, 71) * 0.055;
      const grain = (hash(x, y, 97) * 2 - 1) * 0.018;
      const value = broad + mottling + fine + grain;
      const i = (y * size + x) * 4;

      // Lift the green channel and keep the soil shadow subtle so the ground
      // reads as healthy turf instead of a dark olive sheet.
      pixels[i] = Math.round(61 + value * 24);
      pixels[i + 1] = Math.round(94 + value * 34);
      pixels[i + 2] = Math.round(40 + value * 16);
      pixels[i + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export { createTurfTexture };
