import * as THREE from 'three/webgpu';
import { attribute, cos, positionLocal, sin, time, uniform, vec3 } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const canvas = document.querySelector('#scene');
const loading = document.querySelector('#loading');
const errorBox = document.querySelector('#error');
const windInput = document.querySelector('#wind');
const windValue = document.querySelector('#wind-value');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9b9ae');
scene.fog = new THREE.FogExp2('#a9b9ae', 0.0125);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
camera.position.set(17, 17, 25);

const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.6, -1.5);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 8;
controls.maxDistance = 44;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minPolarAngle = 0.25;

scene.add(new THREE.HemisphereLight('#d9e7dc', '#263529', 1.65));
const sun = new THREE.DirectionalLight('#ffe0ad', 3.2);
sun.position.set(-18, 24, 10);
scene.add(sun);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -34;
sun.shadow.camera.right = 34;
sun.shadow.camera.top = 34;
sun.shadow.camera.bottom = -34;
sun.shadow.bias = -0.00015;

const rng = makeRng(78123);
const wind = uniform(0.62);
let pondNormalTexture;

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function terrainY(x, z) {
  return Math.sin(x * 0.16 + z * 0.08) * 0.32
    + Math.cos(z * 0.19 - x * 0.07) * 0.24
    + Math.sin(x * 0.73) * Math.cos(z * 0.56) * 0.06 - 0.18;
}

// A smooth union of two pond lobes, an inlet and a small bay, based on the
// source garden's signed-distance layout. Positive values are dry land.
function smoothMin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function pondDistance(x, z) {
  const circle = (cx, cz, r) => Math.hypot(x - cx, z - cz) - r;
  let d = smoothMin(circle(-6.6, 0.4, 8.3), circle(9.2, 0.2, 6.1), 2.5);
  d = smoothMin(d, circle(-11.6, 7.2, 4.3), 2.5);
  d = smoothMin(d, circle(13.4, -5.2, 3.1), 2.0);
  const ax = -1.5, az = 0.3, bx = 5.5, bz = 0.3;
  const vx = bx - ax, vz = bz - az;
  const t = THREE.MathUtils.clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
  d = smoothMin(d, Math.hypot(x - (ax + vx * t), z - (az + vz * t)) - 2.1, 1.5);
  const noise = Math.sin(x * 0.51 + z * 0.31) * 0.11 + Math.sin(x * 1.8 - z * 1.3) * 0.035;
  return d + noise;
}

function createGround() {
  const geometry = new THREE.PlaneGeometry(66, 66, 170, 170);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, terrainY(x, z));
  }
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#66764a', roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
}

function createSkyEnvironment() {
  // A small procedural equirectangular sky provides a coherent reflected sky
  // gradient and warm sun glint without external HDR assets.
  const image = document.createElement('canvas');
  image.width = 512;
  image.height = 256;
  const ctx = image.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, image.height);
  gradient.addColorStop(0, '#647b80');
  gradient.addColorStop(0.42, '#a8b8a8');
  gradient.addColorStop(0.7, '#e1cba3');
  gradient.addColorStop(1, '#718078');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, image.width, image.height);
  const glow = ctx.createRadialGradient(346, 155, 2, 346, 155, 78);
  glow.addColorStop(0, 'rgba(255,232,179,0.92)');
  glow.addColorStop(0.12, 'rgba(255,220,157,0.42)');
  glow.addColorStop(1, 'rgba(255,220,157,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(260, 70, 172, 172);
  const environment = new THREE.CanvasTexture(image);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.colorSpace = THREE.SRGBColorSpace;
  scene.environment = environment;
}

function makePondShape(scale = 1) {
  const shape = new THREE.Shape();
  // ShapeGeometry is rotated into the XZ plane, so negate the garden's Z values.
  const move = (x, z) => shape.moveTo(x * scale, -z * scale);
  const curve = (x1, z1, x2, z2, x, z) => shape.bezierCurveTo(x1 * scale, -z1 * scale, x2 * scale, -z2 * scale, x * scale, -z * scale);
  move(-13.8, -1.0);
  curve(-14.7, 3.7, -11.2, 8.6, -7.0, 8.4);
  curve(-3.9, 8.3, -1.5, 5.7, 0.3, 3.0);
  curve(3.0, 7.0, 8.7, 7.6, 11.6, 3.7);
  curve(14.8, 0.5, 14.0, -3.2, 12.0, -5.1);
  curve(10.2, -7.0, 7.6, -7.2, 5.5, -5.9);
  curve(3.8, -4.8, 2.4, -3.0, 0.4, -2.7);
  curve(-2.2, -5.8, -6.5, -7.1, -9.6, -5.7);
  curve(-12.2, -4.5, -14.1, -3.0, -13.8, -1.0);
  shape.closePath();
  return shape;
}

function createWaterBump() {
  const size = 256;
  const image = document.createElement('canvas');
  image.width = image.height = size;
  const ctx = image.getContext('2d');
  const pixels = ctx.createImageData(size, size);
  const directions = [
    [0.966, 0.259, 1.9, 1.0],
    [0.743, -0.669, 1.1, 0.62],
    [0.208, 0.978, 0.63, 0.34],
    [-0.588, 0.809, 0.37, 0.2],
    [0.951, -0.309, 0.21, 0.1],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      for (const [dx, dz, wavelength, amplitude] of directions) {
        const phase = ((x * dx + y * dz) / size) * (Math.PI * 2 / wavelength);
        value += Math.sin(phase) * amplitude;
      }
      const level = Math.max(0, Math.min(255, 128 + value * 11));
      const i = (y * size + x) * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = level;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(image);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 5);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createPond() {
  const shape = makePondShape();
  // The exposed outer lip is a soft gravel/silt margin; the water sheet hides
  // its inner part, leaving an irregular rather than circular shoreline.
  const bank = new THREE.Mesh(
    new THREE.ShapeGeometry(makePondShape(1.085), 3),
    new THREE.MeshStandardMaterial({ color: '#a39671', roughness: 1, side: THREE.DoubleSide }),
  );
  bank.rotation.x = -Math.PI / 2;
  bank.position.set(0, -0.035, -1);
  bank.receiveShadow = true;
  scene.add(bank);

  pondNormalTexture = createWaterBump();
  const water = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 4),
    new THREE.MeshPhysicalMaterial({
      color: '#647e72',
      roughness: 0.12,
      metalness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      bumpMap: pondNormalTexture,
      bumpScale: 0.055,
      envMapIntensity: 1.25,
      side: THREE.DoubleSide,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.025, -1);
  water.receiveShadow = true;
  scene.add(water);
  return water;
}

function createMeadow() {
  const cell = 0.20;
  const tufts = [];
  for (let z = -23; z < 22; z += cell) {
    for (let x = -26; x < 26; x += cell) {
      const px = x + (rng() - 0.5) * cell * 0.9;
      const pz = z + (rng() - 0.5) * cell * 0.9;
      if ((px / 26) ** 2 + (pz / 23) ** 2 > 0.94) continue;
      if (pondDistance(px, pz) < 0.75) continue;
      const path = Math.abs(pz - (7.4 + Math.sin(px * 0.19) * 0.9));
      if (path < 1.0) continue;
      const count = 7 + Math.floor(rng() * 5);
      tufts.push({ x: px, z: pz, count, kind: rng() });
    }
  }

  const rows = [0, 0.42, 0.78];
  const verticesPerBlade = rows.length * 3 + 1;
  const blades = tufts.reduce((sum, tuft) => sum + tuft.count + 3, 0);
  const positions = new Float32Array(blades * verticesPerBlade * 3);
  const colors = new Float32Array(blades * verticesPerBlade * 3);
  const phases = new Float32Array(blades * verticesPerBlade);
  const bends = new Float32Array(blades * verticesPerBlade);
  const rootYs = new Float32Array(blades * verticesPerBlade);
  const indices = new Uint32Array(blades * 30);
  const shades = [
    new THREE.Color('#314b2b'),
    new THREE.Color('#405e33'),
    new THREE.Color('#54703b'),
    new THREE.Color('#6e8043'),
    new THREE.Color('#92904c'),
  ];
  let vertex = 0;
  let index = 0;

  const addBlade = (rootX, rootZ, height, width, lean, angle, phase, baseColor, fold) => {
    const rootY = terrainY(rootX, rootZ);
    const bendAngle = angle + (rng() - 0.5) * 0.62;
    const bendX = Math.cos(bendAngle);
    const bendZ = Math.sin(bendAngle);
    const sideX = -Math.sin(angle);
    const sideZ = Math.cos(angle);
    const first = vertex;
    const colorJitter = 0.82 + rng() * 0.38;

    for (let row = 0; row < rows.length; row++) {
      const t = rows[row];
      const curve = t * t * lean * height;
      const cx = rootX + bendX * curve;
      const cz = rootZ + bendZ * curve;
      const half = width * 0.5 * (1 - t * t * 0.88);
      const foldDepth = fold * half;
      const cross = [[-half, foldDepth * 0.3], [0, -foldDepth], [half, foldDepth * 0.3]];
      for (let k = 0; k < 3; k++) {
        const v = vertex++;
        positions[v * 3] = cx + sideX * cross[k][0] + bendX * cross[k][1];
        positions[v * 3 + 1] = rootY + t * height;
        positions[v * 3 + 2] = cz + sideZ * cross[k][0] + bendZ * cross[k][1];
        const light = colorJitter * (0.78 + t * 0.34 + (k === 1 ? 0.1 : 0));
        colors[v * 3] = baseColor.r * light;
        colors[v * 3 + 1] = baseColor.g * light;
        colors[v * 3 + 2] = baseColor.b * light;
        phases[v] = phase;
        bends[v] = lean;
        rootYs[v] = rootY;
      }
    }
    const tip = vertex++;
    const tipCurve = lean * height;
    positions[tip * 3] = rootX + bendX * tipCurve;
    positions[tip * 3 + 1] = rootY + height;
    positions[tip * 3 + 2] = rootZ + bendZ * tipCurve;
    colors[tip * 3] = baseColor.r * colorJitter * 1.04;
    colors[tip * 3 + 1] = baseColor.g * colorJitter * 1.04;
    colors[tip * 3 + 2] = baseColor.b * colorJitter * 1.04;
    phases[tip] = phase;
    bends[tip] = lean;
    rootYs[tip] = rootY;

    for (let row = 0; row < rows.length - 1; row++) {
      const a = first + row * 3;
      const b = a + 3;
      indices.set([a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1], index);
      index += 12;
    }
    const last = first + (rows.length - 1) * 3;
    indices.set([last, last + 1, tip, last + 1, last + 2, tip], index);
    index += 6;
  };

  for (const tuft of tufts) {
    const tuftAngle = rng() * Math.PI * 2;
    const reachMax = 0.055;
    const colorRoll = rng();
    const baseColor = colorRoll < 0.45 ? shades[0] : colorRoll < 0.76 ? shades[1] : colorRoll < 0.93 ? shades[2] : shades[3];
    const tall = tuft.kind < 0.18;
    const tuftHeight = tall ? 0.62 + rng() * 0.22 : 0.28 + rng() * 0.30;
    const fold = 0.13 + rng() * 0.10;
    for (let b = 0; b < tuft.count; b++) {
      const angle = tuftAngle + rng() * Math.PI * 2;
      const reach = Math.sqrt(rng()) * reachMax;
      const rootX = tuft.x + Math.cos(angle) * reach;
      const rootZ = tuft.z + Math.sin(angle) * reach;
      const outer = reach / reachMax;
      const height = tuftHeight * (0.68 + rng() * 0.48);
      const lean = Math.min(0.82, 0.10 + outer * 0.38 + rng() * 0.22);
      const width = 0.014 + rng() * 0.012;
      addBlade(rootX, rootZ, height, width, lean, angle, rng() * Math.PI * 2, baseColor, fold);
    }
    for (let b = 0; b < 3; b++) {
      const angle = rng() * Math.PI * 2;
      const rootX = tuft.x + Math.cos(angle) * rng() * 0.11;
      const rootZ = tuft.z + Math.sin(angle) * rng() * 0.11;
      const shortColor = shades[rng() < 0.55 ? 0 : 1];
      addBlade(rootX, rootZ, 0.08 + rng() * 0.13, 0.009 + rng() * 0.006, 0.16 + rng() * 0.25, angle, rng() * Math.PI * 2, shortColor, 0.1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aBend', new THREE.BufferAttribute(bends, 1));
  geometry.setAttribute('aRootY', new THREE.BufferAttribute(rootYs, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardNodeMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
  const phase = attribute('aPhase', 'float');
  const bend = attribute('aBend', 'float');
  const rootY = attribute('aRootY', 'float');
  const localHeight = positionLocal.y.sub(rootY).max(0);
  const gust = sin(positionLocal.x.mul(0.18).add(positionLocal.z.mul(0.12)).sub(time.mul(1.15)).add(phase));
  const flutter = cos(time.mul(2.4).add(phase.mul(1.7)));
  const sway = gust.add(flutter.mul(0.18)).mul(bend).mul(wind).mul(localHeight);
  material.positionNode = positionLocal.add(vec3(sway.mul(0.9), sway.mul(-0.10), sway.mul(0.42)));

  const grass = new THREE.Mesh(geometry, material);
  grass.castShadow = true;
  grass.receiveShadow = true;
  scene.add(grass);
}

function createTrees() {
  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.28, 4.2, 7);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#514536', roughness: 1 });
  const canopyGeometry = new THREE.IcosahedronGeometry(1, 1);
  const canopyMaterial = new THREE.MeshStandardMaterial({ color: '#3e5b3e', roughness: 1, flatShading: true });
  const trunk = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, 55);
  const canopy = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, 55);
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < 55; i++) {
    const angle = (i / 55) * Math.PI * 2 + (rng() - 0.5) * 0.24;
    const radius = 20 + rng() * 8;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius - 1;
    if (pondDistance(x, z) < 2.0) continue;
    const scale = 0.75 + rng() * 1.0;
    dummy.position.set(x, terrainY(x, z) + 1.95 * scale, z);
    dummy.scale.set(scale, scale * (1.35 + rng() * 0.45), scale);
    dummy.rotation.y = rng() * Math.PI * 2;
    dummy.updateMatrix();
    trunk.setMatrixAt(n, dummy.matrix);
    dummy.position.y += 2.9 * scale;
    dummy.scale.multiplyScalar(2.2);
    dummy.updateMatrix();
    canopy.setMatrixAt(n, dummy.matrix);
    canopy.setColorAt(n, new THREE.Color().setHSL(0.29 + rng() * 0.045, 0.24 + rng() * 0.15, 0.24 + rng() * 0.12));
    n++;
  }
  trunk.count = n;
  canopy.count = n;
  trunk.castShadow = true;
  canopy.castShadow = true;
  scene.add(trunk, canopy);
}

function createFlowers() {
  const stemGeometry = new THREE.CylinderGeometry(0.012, 0.018, 0.22, 5);
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#547642', roughness: 1 });
  const headGeometry = new THREE.IcosahedronGeometry(0.065, 1);
  const headMaterial = new THREE.MeshStandardMaterial({ color: '#f1dfaa', roughness: 0.8, flatShading: true });
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, 360);
  const heads = new THREE.InstancedMesh(headGeometry, headMaterial, 360);
  const dummy = new THREE.Object3D();
  let placed = 0;
  let attempts = 0;
  while (placed < 360 && attempts++ < 5000) {
    const x = (rng() - 0.5) * 43;
    const z = (rng() - 0.5) * 38;
    if ((x / 26) ** 2 + (z / 23) ** 2 > 0.88 || pondDistance(x, z) < 1.1 || Math.abs(z - (7.4 + Math.sin(x * 0.19) * 0.9)) < 1.3) continue;
    const y = terrainY(x, z);
    const size = 0.55 + rng() * 0.9;
    dummy.position.set(x, y + 0.11 * size, z);
    dummy.scale.setScalar(size);
    dummy.rotation.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.16);
    dummy.updateMatrix();
    stems.setMatrixAt(placed, dummy.matrix);
    dummy.position.y += 0.13 * size;
    dummy.scale.setScalar(size * 0.78);
    dummy.updateMatrix();
    heads.setMatrixAt(placed, dummy.matrix);
    if (rng() > 0.83) heads.setColorAt(placed, new THREE.Color('#d99e61'));
    placed++;
  }
  stems.count = placed;
  heads.count = placed;
  stems.castShadow = true;
  heads.castShadow = true;
  scene.add(stems, heads);
}

function createPath() {
  const points = [];
  for (let i = 0; i <= 80; i++) {
    const x = -27 + (54 * i) / 80;
    const z = 7.4 + Math.sin(x * 0.19) * 0.9;
    points.push(new THREE.Vector3(x, terrainY(x, z) + 0.015, z));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const path = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.62, 7, false), new THREE.MeshStandardMaterial({ color: '#9b8e6e', roughness: 1 }));
  path.scale.y = 0.08;
  path.receiveShadow = true;
  scene.add(path);
}

async function main() {
  try {
    await renderer.init();
    createSkyEnvironment();
    createGround();
    const pond = createPond();
    createPath();
    createMeadow();
    createFlowers();
    createTrees();
    loading.hidden = true;
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const delta = Math.min(clock.getDelta(), 0.05);
      controls.update();
      if (pondNormalTexture) {
        pondNormalTexture.offset.x = (pondNormalTexture.offset.x + delta * 0.012) % 1;
        pondNormalTexture.offset.y = (pondNormalTexture.offset.y - delta * 0.007) % 1;
      }
      renderer.render(scene, camera);
    });
  } catch (error) {
    console.error(error);
    loading.hidden = true;
    errorBox.hidden = false;
    errorBox.textContent = `WebGPU could not start: ${error?.message ?? error}. Try a recent desktop Chrome or Edge with WebGPU enabled.`;
  }
}

windInput.addEventListener('input', () => {
  const amount = Number(windInput.value);
  wind.value = amount;
  windValue.textContent = amount < 0.2 ? 'Still' : amount < 0.7 ? 'Gentle' : amount < 1.15 ? 'Breezy' : 'Strong';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

main();
