import * as THREE from 'three/webgpu';
import { attribute, cos, positionLocal, sin, time, vec3, positionView, faceDirection } from 'three/tsl';

const PI2 = Math.PI * 2;
// More lengthwise sections keep the curved blade silhouette from collapsing into
// a few visibly straight segments when viewed close up or from above.
const ROWS = [0, 0.2, 0.4, 0.6, 0.8];
const INSTANCE_STRIDE = 14;

const PALETTES = {
  lawn: [new THREE.Color('#35552e'), new THREE.Color('#496c37'), new THREE.Color('#5b783d'), new THREE.Color('#8a8750')],
  meadow: [new THREE.Color('#2d4f35'), new THREE.Color('#456f42'), new THREE.Color('#5e8054'), new THREE.Color('#83986c'), new THREE.Color('#a29d74')],
  rough: [new THREE.Color('#364c2d'), new THREE.Color('#4d6037'), new THREE.Color('#6d763a'), new THREE.Color('#a1915a')],
};

const BREEDS = {
  lawn: { tufts: [6, 12], height: [0.035, 0.08], width: [0.0034, 0.0054], lean: [0.05, 0.42], fill: 200 },
  meadow: { tufts: [10, 22], height: [0.16, 0.46], width: [0.0048, 0.0094], lean: [0.12, 0.78], fill: 480 },
  rough: { tufts: [12, 24], height: [0.38, 0.9], width: [0.007, 0.012], lean: [0.18, 0.82], fill: 240 },
};

class BladeRecords {
  constructor() {
    this.capacity = 16384;
    this.count = 0;
    this.data = new Float32Array(this.capacity * INSTANCE_STRIDE);
  }

  grow() {
    this.capacity *= 2;
    const larger = new Float32Array(this.capacity * INSTANCE_STRIDE);
    larger.set(this.data);
    this.data = larger;
  }

  add(rootX, rootY, rootZ, width, height, lean, angle, bendAngle, phase, fold, color) {
    if (this.count === this.capacity) this.grow();
    const offset = this.count * INSTANCE_STRIDE;
    this.data.set([
      rootX, rootY, rootZ, width, height, lean, angle,
      bendAngle, phase, fold, ...color.toArray(),
    ], offset);
    this.count++;
  }

  attach(geometry) {
    const data = this.data.subarray(0, this.count * INSTANCE_STRIDE);
    const buffer = new THREE.InstancedInterleavedBuffer(data, INSTANCE_STRIDE, 1);
    const attributes = [
      ['iRoot', 3, 0], ['iWidth', 1, 3], ['iHeight', 1, 4], ['iLean', 1, 5],
      ['iAngle', 1, 6], ['iBendAngle', 1, 7], ['iPhase', 1, 8], ['iFold', 1, 9], ['iColor', 3, 10],
    ];
    for (const [name, size, offset] of attributes) {
      geometry.setAttribute(name, new THREE.InterleavedBufferAttribute(buffer, size, offset, false));
    }
    geometry.instanceCount = this.count;
  }
}

function makeBladeGeometry() {
  const geometry = new THREE.InstancedBufferGeometry();
  const positions = [];
  const indices = [];
  for (const t of ROWS) positions.push(-0.5, t, 0, 0, t, -0.18, 0.5, t, 0);
  positions.push(0, 1, 0);
  for (let row = 0; row < ROWS.length - 1; row++) {
    const a = row * 3;
    const b = a + 3;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
    indices.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
  }
  const last = (ROWS.length - 1) * 3;
  const tip = ROWS.length * 3;
  indices.push(last, last + 1, tip, last + 1, last + 2, tip);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeMaterial(wind) {
  const material = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide });
  const root = attribute('iRoot', 'vec3');
  const width = attribute('iWidth', 'float');
  const height = attribute('iHeight', 'float');
  const lean = attribute('iLean', 'float');
  const angle = attribute('iAngle', 'float');
  const bendAngle = attribute('iBendAngle', 'float');
  const phase = attribute('iPhase', 'float');
  const fold = attribute('iFold', 'float');
  material.colorNode = attribute('iColor', 'vec3');

  const across = positionLocal.x;
  const t = positionLocal.y;
  const folded = positionLocal.z;
  const sideX = sin(angle).negate();
  const sideZ = cos(angle);
  const bendX = cos(bendAngle);
  const bendZ = sin(bendAngle);
  const curve = t.mul(t).mul(lean).mul(height);
  const foldDistance = folded.mul(fold).mul(width);
  const gust = sin(root.x.mul(0.075).add(root.z.mul(0.06)).sub(time.mul(0.6)).add(phase));
  const roll = sin(root.x.mul(0.19).sub(root.z.mul(0.14)).sub(time.mul(1.0)).add(phase.mul(0.34)));
  const shimmer = cos(time.mul(1.5).add(phase.mul(1.7))).mul(0.12);
  const windAmount = gust.mul(0.6).add(roll.mul(0.25)).add(shimmer).mul(wind);
  const windReach = windAmount.mul(t.mul(t)).mul(height).mul(0.14);
  const localX = root.x.add(sideX.mul(across).mul(width)).add(bendX.mul(foldDistance)).add(bendX.mul(curve)).add(windReach.mul(0.9));
  const localZ = root.z.add(sideZ.mul(across).mul(width)).add(bendZ.mul(foldDistance)).add(bendZ.mul(curve)).add(windReach.mul(0.32));
  const localY = root.y.add(t.mul(height)).sub(windReach.mul(0.04));
  material.positionNode = vec3(localX, localY, localZ);

  // Derive the shading normal from the rasterized, deformed surface. This keeps
  // wind and blade curvature in sync with lighting, including when orbiting
  // above the grass. faceDirection preserves correct two-sided lighting.
  material.normalNode = positionView.dFdx().cross(positionView.dFdy()).normalize().mul(faceDirection);
  return material;
}

function range(rng, min, max) {
  return min + (max - min) * rng();
}

function distanceToPath(x, z) {
  let nearest = Infinity;
  let lastX = -28;
  let lastZ = 7.4 + Math.sin(lastX * 0.19) * 0.9;
  for (let i = 1; i <= 24; i++) {
    const nextX = -28 + i * (56 / 24);
    const nextZ = 7.4 + Math.sin(nextX * 0.19) * 0.9;
    const vx = nextX - lastX;
    const vz = nextZ - lastZ;
    const t = THREE.MathUtils.clamp(((x - lastX) * vx + (z - lastZ) * vz) / (vx * vx + vz * vz), 0, 1);
    nearest = Math.min(nearest, Math.hypot(x - lastX - vx * t, z - lastZ - vz * t));
    lastX = nextX;
    lastZ = nextZ;
  }
  return nearest;
}

function chooseBreed(x, z, pondDistance) {
  const shore = pondDistance(x, z);
  const path = distanceToPath(x, z);
  const woodEdge = Math.hypot(x, z);
  if (shore > 0 && shore < 2.8 && Math.sin(x * 0.13 + z * 0.08) > -0.18) return 'rough';
  if (woodEdge > 28 || path < 2.5) return 'lawn';
  return 'meadow';
}

function densityFor(breed, radius) {
  const tier = radius < 17 ? 0 : radius < 30 ? 1 : 2;
  const densities = { meadow: [62, 30, 10], lawn: [86, 38, 14], rough: [26, 12, 6] };
  return densities[breed][tier];
}

function makeCellRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  };
}

function growTuft(writer, rng, breedName, x, z, groundY) {
  const breed = BREEDS[breedName];
  const palette = PALETTES[breedName];
  const colorRoll = rng();
  const colorIndex = colorRoll < 0.48 ? 0 : colorRoll < 0.78 ? 1 : colorRoll < 0.94 ? 2 : palette.length - 1;
  const baseColor = palette[colorIndex];
  const count = Math.floor(range(rng, breed.tufts[0], breed.tufts[1] + 1));
  const centerAngle = rng() * PI2;
  const tuftRadius = breedName === 'lawn' ? 0.023 : 0.042;
  const tuftHeight = range(rng, breed.height[0], breed.height[1]);
  const fold = breedName === 'lawn' ? 0.12 : 0.18;

  for (let blade = 0; blade < count; blade++) {
    const angle = centerAngle + range(rng, -1.2, 1.2) + (blade / count) * 0.45;
    const reach = Math.sqrt(rng()) * tuftRadius;
    const rootX = x + Math.cos(angle) * reach;
    const rootZ = z + Math.sin(angle) * reach;
    const outer = reach / tuftRadius;
    const h = tuftHeight * range(rng, 0.66, 1.15);
    const lean = Math.min(0.9, range(rng, breed.lean[0], breed.lean[1]) * (0.65 + outer * 0.55));
    const width = range(rng, breed.width[0], breed.width[1]);
    const bendAngle = angle + range(rng, -0.55, 0.55);
    const dryChance = breedName === 'meadow' ? 0.08 : breedName === 'rough' ? 0.1 : 0.025;
    const color = rng() < dryChance ? PALETTES.rough[3] : baseColor;
    writer.add(rootX, groundY, rootZ, width, h, lean, angle, bendAngle, rng() * PI2, fold, color);
  }
}

function growUndergrowth(writer, rng, breedName, x, z, groundY, densityScale) {
  // `fill` is blades per square metre in the source breed descriptions, not
  // hundreds of filler blades per tuft. Divide by the local tuft density to get
  // a sane count for this tuft and scale it down with distance LOD.
  const tuftDensity = densityFor(breedName, Math.hypot(x, z));
  const count = Math.max(0, Math.round((BREEDS[breedName].fill / tuftDensity) * densityScale));
  const palette = PALETTES[breedName];
  for (let i = 0; i < count; i++) {
    const angle = rng() * PI2;
    const radius = Math.sqrt(rng()) * 0.16;
    const rootX = x + Math.cos(angle) * radius;
    const rootZ = z + Math.sin(angle) * radius;
    const color = palette[rng() < 0.68 ? 0 : 1];
    const height = breedName === 'lawn' ? range(rng, 0.025, 0.055)
      : breedName === 'rough' ? range(rng, 0.1, 0.32)
      : range(rng, 0.05, 0.18);
    writer.add(rootX, groundY, rootZ,
      range(rng, 0.003, 0.006), height, range(rng, 0.08, 0.5), angle,
      angle + range(rng, -0.9, 0.9), rng() * PI2, 0.12, color);
  }
}

function createGrass(scene, options) {
  const { rng, wind, terrainY, pondDistance } = options;
  const writers = { lawn: new BladeRecords(), meadow: new BladeRecords(), rough: new BladeRecords() };
  const step = 0.12;
  let cellIndex = 0;
  for (let z = -23; z < 22; z += step) {
    for (let x = -26; x < 26; x += step) {
      const px = x + (rng() - 0.5) * step * 0.92;
      const pz = z + (rng() - 0.5) * step * 0.92;
      const radius = Math.hypot(px, pz);
      if ((px / 26) ** 2 + (pz / 23) ** 2 > 0.94) continue;
      const shore = pondDistance(px, pz);
      if (shore < 0.38) continue;
      const breedName = chooseBreed(px, pz, pondDistance);
      const targetDensity = densityFor(breedName, radius);
      const probability = Math.min(1, targetDensity * step * step * (breedName === 'meadow' ? 1.2 : 1));
      const localRng = makeCellRng((cellIndex++ * 747796405 + 2891336453) >>> 0);
      if (localRng() > probability) continue;
      const groundY = terrainY(px, pz);
      const writer = writers[breedName];
      growTuft(writer, rng, breedName, px, pz, groundY);
      const densityScale = radius < 17 ? 1 : radius < 30 ? 0.45 : 0.18;
      if (rng() < (radius < 17 ? 1 : radius < 30 ? 0.42 : 0.16)) {
        growUndergrowth(writer, rng, breedName, px, pz, groundY, densityScale);
      }
    }
  }

  const bladeGeometry = makeBladeGeometry();
  const material = makeMaterial(wind);
  for (const [breed, writer] of Object.entries(writers)) {
    if (!writer.count) continue;
    const geometry = bladeGeometry.clone();
    writer.attach(geometry);
    const grass = new THREE.Mesh(geometry, material);
    grass.name = `${breed}-grass-${writer.count}-blades`;
    grass.castShadow = true;
    grass.receiveShadow = true;
    scene.add(grass);
    console.info(`[grass] ${breed}: ${writer.count.toLocaleString()} instanced blades`);
  }
}

export { createGrass };
