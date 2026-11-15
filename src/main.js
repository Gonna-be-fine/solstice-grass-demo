import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import { createGrass } from './grass.js';

const canvas = document.querySelector('#scene');
const loading = document.querySelector('#loading');
const errorBox = document.querySelector('#error');
const windInput = document.querySelector('#wind');
const windValue = document.querySelector('#wind-value');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#b2c0b5');
scene.fog = new THREE.FogExp2('#b2c0b5', 0.0115);
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
camera.position.set(13, 12, 18);

const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.75, -1.8);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 8;
controls.maxDistance = 38;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minPolarAngle = 0.22;

scene.add(new THREE.HemisphereLight('#dfe9e1', '#263529', 1.55));
const sun = new THREE.DirectionalLight('#f7dfaf', 2.9);
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
  return Math.sin(x * 0.16 + z * 0.08) * 0.32 + Math.cos(z * 0.19 - x * 0.07) * 0.24
    + Math.sin(x * 0.73) * Math.cos(z * 0.56) * 0.06 - 0.18;
}
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
  return d + Math.sin(x * 0.51 + z * 0.31) * 0.11 + Math.sin(x * 1.8 - z * 1.3) * 0.035;
}
function createGround() {
  const geometry = new THREE.PlaneGeometry(66, 66, 170, 170);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setY(i, terrainY(positions.getX(i), positions.getZ(i)));
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#687f5d', roughness: 0.98 }));
  ground.receiveShadow = true;
  scene.add(ground);
}
function createSkyEnvironment() {
  const image = document.createElement('canvas');
  image.width = 512; image.height = 256;
  const ctx = image.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, image.height);
  gradient.addColorStop(0, '#768b87'); gradient.addColorStop(0.4, '#a9b9a8');
  gradient.addColorStop(0.7, '#d7d0b8'); gradient.addColorStop(1, '#7b8d7a');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, image.width, image.height);
  const glow = ctx.createRadialGradient(346, 155, 2, 346, 155, 78);
  glow.addColorStop(0, 'rgba(255,234,186,0.9)'); glow.addColorStop(0.12, 'rgba(255,221,164,0.45)');
  glow.addColorStop(1, 'rgba(255,220,157,0)'); ctx.fillStyle = glow; ctx.fillRect(260, 70, 172, 172);
  const environment = new THREE.CanvasTexture(image);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.colorSpace = THREE.SRGBColorSpace;
  scene.environment = environment;
}
function makePondShape(scale = 1) {
  const shape = new THREE.Shape();
  const move = (x, z) => shape.moveTo(x * scale, -z * scale);
  const curve = (x1, z1, x2, z2, x, z) => shape.bezierCurveTo(x1 * scale, -z1 * scale, x2 * scale, -z2 * scale, x * scale, -z * scale);
  move(-13.8, -1.0); curve(-14.7, 3.7, -11.2, 8.6, -7.0, 8.4);
  curve(-3.9, 8.3, -1.5, 5.7, 0.3, 3.0); curve(3.0, 7.0, 8.7, 7.6, 11.6, 3.7);
  curve(14.8, 0.5, 14.0, -3.2, 12.0, -5.1); curve(10.2, -7.0, 7.6, -7.2, 5.5, -5.9);
  curve(3.8, -4.8, 2.4, -3.0, 0.4, -2.7); curve(-2.2, -5.8, -6.5, -7.1, -9.6, -5.7);
  curve(-12.2, -4.5, -14.1, -3.0, -13.8, -1.0); shape.closePath();
  return shape;
}
function createWaterBump() {
  const size = 256;
  const image = document.createElement('canvas'); image.width = image.height = size;
  const ctx = image.getContext('2d'); const pixels = ctx.createImageData(size, size);
  const directions = [[0.966, 0.259, 1.9, 1], [0.743, -0.669, 1.1, 0.62], [0.208, 0.978, 0.63, 0.34], [-0.588, 0.809, 0.37, 0.2], [0.951, -0.309, 0.21, 0.1]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let value = 0;
    for (const [dx, dz, wavelength, amplitude] of directions) value += Math.sin(((x * dx + y * dz) / size) * (Math.PI * 2 / wavelength)) * amplitude;
    const level = Math.max(0, Math.min(255, 128 + value * 11));
    const i = (y * size + x) * 4;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = level; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(image);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(8, 5);
  texture.colorSpace = THREE.NoColorSpace; texture.anisotropy = 4;
  return texture;
}
function createPond() {
  const bank = new THREE.Mesh(new THREE.ShapeGeometry(makePondShape(1.085), 3), new THREE.MeshStandardMaterial({ color: '#a59c7b', roughness: 1, side: THREE.DoubleSide }));
  bank.rotation.x = -Math.PI / 2; bank.position.set(0, -0.035, -1); bank.receiveShadow = true; scene.add(bank);
  pondNormalTexture = createWaterBump();
  const water = new THREE.Mesh(new THREE.ShapeGeometry(makePondShape(), 4), new THREE.MeshPhysicalMaterial({
    color: '#7a9b7d', roughness: 0.12, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.08,
    bumpMap: pondNormalTexture, bumpScale: 0.045, envMapIntensity: 1.15, side: THREE.DoubleSide,
  }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.02, -1); water.receiveShadow = true; scene.add(water);
}
function createPath() {
  const points = [];
  for (let i = 0; i <= 80; i++) { const x = -27 + (54 * i) / 80; const z = 7.4 + Math.sin(x * 0.19) * 0.9; points.push(new THREE.Vector3(x, terrainY(x, z) + 0.015, z)); }
  const path = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 170, 0.62, 7, false), new THREE.MeshStandardMaterial({ color: '#a28d68', roughness: 1 }));
  path.scale.y = 0.08; path.receiveShadow = true; scene.add(path);
}
function createTrees() {
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.28, 4.2, 7), new THREE.MeshStandardMaterial({ color: '#514536', roughness: 1 }), 55);
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#3b5d3a', roughness: 1, flatShading: true }), 55);
  const dummy = new THREE.Object3D(); let n = 0;
  for (let i = 0; i < 55; i++) {
    const angle = (i / 55) * Math.PI * 2 + (rng() - 0.5) * 0.24;
    const radius = 20 + rng() * 8; const x = Math.cos(angle) * radius; const z = Math.sin(angle) * radius - 1;
    if (pondDistance(x, z) < 2) continue;
    const scale = 0.75 + rng();
    dummy.position.set(x, terrainY(x, z) + 1.95 * scale, z); dummy.scale.set(scale, scale * (1.3 + rng() * 0.42), scale); dummy.rotation.y = rng() * Math.PI * 2; dummy.updateMatrix(); trunk.setMatrixAt(n, dummy.matrix);
    dummy.position.y += 2.7 * scale; dummy.scale.multiplyScalar(2.1); dummy.updateMatrix(); canopy.setMatrixAt(n, dummy.matrix);
    canopy.setColorAt(n, new THREE.Color().setHSL(0.28 + rng() * 0.04, 0.22 + rng() * 0.12, 0.22 + rng() * 0.1)); n++;
  }
  trunk.count = n; canopy.count = n; trunk.castShadow = true; canopy.castShadow = true; scene.add(trunk, canopy);
}
function createFlowers() {
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.018, 0.22, 5), new THREE.MeshStandardMaterial({ color: '#547642', roughness: 1 }), 360);
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.065, 1), new THREE.MeshStandardMaterial({ color: '#f1dfaa', roughness: 0.8, flatShading: true }), 360);
  const dummy = new THREE.Object3D(); let placed = 0; let attempts = 0;
  while (placed < 360 && attempts++ < 5000) {
    const x = (rng() - 0.5) * 43; const z = (rng() - 0.5) * 38;
    if ((x / 26) ** 2 + (z / 23) ** 2 > 0.88 || pondDistance(x, z) < 1.1 || Math.abs(z - (7.4 + Math.sin(x * 0.19) * 0.9)) < 1.3) continue;
    const y = terrainY(x, z); const size = 0.55 + rng() * 0.9;
    dummy.position.set(x, y + 0.11 * size, z); dummy.scale.setScalar(size); dummy.rotation.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.16); dummy.updateMatrix(); stems.setMatrixAt(placed, dummy.matrix);
    dummy.position.y += 0.13 * size; dummy.scale.setScalar(size * 0.78); dummy.updateMatrix(); heads.setMatrixAt(placed, dummy.matrix);
    if (rng() > 0.83) heads.setColorAt(placed, new THREE.Color('#d99e61')); placed++;
  }
  stems.count = placed; heads.count = placed; stems.castShadow = true; heads.castShadow = true; scene.add(stems, heads);
}

async function main() {
  try {
    await renderer.init(); createSkyEnvironment(); createGround(); createPond(); createPath();
    createGrass(scene, { rng, wind, terrainY, pondDistance }); createFlowers(); createTrees(); loading.hidden = true;
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const delta = Math.min(clock.getDelta(), 0.05); controls.update();
      if (pondNormalTexture) { pondNormalTexture.offset.x = (pondNormalTexture.offset.x + delta * 0.012) % 1; pondNormalTexture.offset.y = (pondNormalTexture.offset.y - delta * 0.007) % 1; }
      renderer.render(scene, camera);
    });
  } catch (error) {
    console.error(error); loading.hidden = true; errorBox.hidden = false;
    errorBox.textContent = `WebGPU could not start: ${error?.message ?? error}. Try a recent desktop Chrome or Edge with WebGPU enabled.`;
  }
}
windInput.addEventListener('input', () => {
  const amount = Number(windInput.value); wind.value = amount;
  windValue.textContent = amount < 0.2 ? 'Still' : amount < 0.7 ? 'Gentle' : amount < 1.15 ? 'Breezy' : 'Strong';
});
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
main();
