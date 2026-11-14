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
camera.position.set(13, 8.5, 23);

const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.1, -1.5);
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

function createGround() {
  const geometry = new THREE.PlaneGeometry(66, 66, 170, 170);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const broad = Math.sin(x * 0.16 + z * 0.08) * 0.32 + Math.cos(z * 0.19 - x * 0.07) * 0.24;
    const small = Math.sin(x * 0.73) * Math.cos(z * 0.56) * 0.06;
    positions.setY(i, broad + small - 0.18);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: '#66764a', roughness: 1 });
  const ground = new THREE.Mesh(geometry, material);
  ground.receiveShadow = true;
  scene.add(ground);
}

function terrainY(x, z) {
  return Math.sin(x * 0.16 + z * 0.08) * 0.32 + Math.cos(z * 0.19 - x * 0.07) * 0.24 + Math.sin(x * 0.73) * Math.cos(z * 0.56) * 0.06 - 0.18;
}

function createMeadow() {
  const cell = 0.39;
  const tufts = [];
  for (let z = -23; z < 22; z += cell) {
    for (let x = -26; x < 26; x += cell) {
      const px = x + (rng() - 0.5) * cell * 0.8;
      const pz = z + (rng() - 0.5) * cell * 0.8;
      if ((px / 26) ** 2 + (pz / 23) ** 2 > 0.94) continue;
      // A softly irregular pond opening and a gravel walk around it.
      const pond = (px / 9.0) ** 2 + ((pz + 1.0) / 5.2) ** 2;
      const path = Math.abs(pz - (7.4 + Math.sin(px * 0.19) * 0.9));
      if (pond < 1.28 || path < 1.0) continue;
      const count = 7 + Math.floor(rng() * 6);
      tufts.push({ x: px, z: pz, count, kind: rng() });
    }
  }

  const blades = tufts.reduce((sum, tuft) => sum + tuft.count, 0);
  const rows = 4;
  const verticesPerBlade = rows * 2;
  const positions = new Float32Array(blades * verticesPerBlade * 3);
  const colors = new Float32Array(blades * verticesPerBlade * 3);
  const phases = new Float32Array(blades * verticesPerBlade);
  const bends = new Float32Array(blades * verticesPerBlade);
  const indices = new Uint32Array(blades * (rows - 1) * 6);
  let vertex = 0;
  let index = 0;

  const shades = [new THREE.Color('#41683a'), new THREE.Color('#628344'), new THREE.Color('#76914a'), new THREE.Color('#9c9950')];
  for (const tuft of tufts) {
    const baseY = terrainY(tuft.x, tuft.z);
    const colorPick = rng();
    const baseColor = colorPick < 0.52 ? shades[0] : colorPick < 0.84 ? shades[1] : colorPick < 0.96 ? shades[2] : shades[3];
    const tuftHeight = tuft.kind < 0.2 ? 0.7 : 0.34 + rng() * 0.36;
    for (let b = 0; b < tuft.count; b++) {
      const angle = rng() * Math.PI * 2;
      const reach = Math.sqrt(rng()) * 0.13;
      const rootX = tuft.x + Math.cos(angle) * reach;
      const rootZ = tuft.z + Math.sin(angle) * reach;
      const height = tuftHeight * (0.66 + rng() * 0.55);
      const width = 0.018 + rng() * 0.023;
      const lean = 0.12 + rng() * 0.27;
      const bendAngle = angle + (rng() - 0.5) * 1.3;
      const phase = rng() * Math.PI * 2;
      const bladeColor = baseColor.clone().multiplyScalar(0.82 + rng() * 0.38);
      for (let row = 0; row < rows; row++) {
        const t = row / (rows - 1);
        const curve = t * t * lean * height;
        const centerX = rootX + Math.cos(bendAngle) * curve;
        const centerZ = rootZ + Math.sin(bendAngle) * curve;
        const halfWidth = width * (1 - t) * (1 - t * 0.72);
        const sideX = -Math.sin(angle) * halfWidth;
        const sideZ = Math.cos(angle) * halfWidth;
        for (let side = 0; side < 2; side++) {
          const offset = side === 0 ? -1 : 1;
          const v = vertex++;
          positions[v * 3] = centerX + sideX * offset;
          positions[v * 3 + 1] = baseY + t * height;
          positions[v * 3 + 2] = centerZ + sideZ * offset;
          const light = 0.83 + t * 0.28 + (side ? 0.035 : -0.025);
          colors[v * 3] = bladeColor.r * light;
          colors[v * 3 + 1] = bladeColor.g * light;
          colors[v * 3 + 2] = bladeColor.b * light;
          phases[v] = phase;
          bends[v] = lean;
        }
      }
      const first = vertex - verticesPerBlade;
      for (let row = 0; row < rows - 1; row++) {
        const a = first + row * 2;
        indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], index);
        index += 6;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aBend', new THREE.BufferAttribute(bends, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardNodeMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.82,
    side: THREE.DoubleSide,
  });
  const phase = attribute('aPhase', 'float');
  const bend = attribute('aBend', 'float');
  const gust = sin(positionLocal.x.mul(0.18).add(positionLocal.z.mul(0.12)).sub(time.mul(1.15)).add(phase));
  const flutter = cos(time.mul(2.4).add(phase.mul(1.7)));
  const sway = gust.add(flutter.mul(0.22)).mul(bend).mul(wind).mul(positionLocal.y);
  material.positionNode = positionLocal.add(vec3(sway.mul(0.9), sway.mul(-0.13), sway.mul(0.42)));

  const grass = new THREE.Mesh(geometry, material);
  grass.castShadow = true;
  grass.receiveShadow = true;
  scene.add(grass);
}

function createPond() {
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    new THREE.MeshPhysicalMaterial({ color: '#536f67', roughness: 0.16, metalness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.scale.set(9.2, 5.4, 1);
  water.position.set(0, -0.04, -1);
  water.receiveShadow = true;
  scene.add(water);
  const bank = new THREE.Mesh(new THREE.RingGeometry(8.9, 10.1, 96), new THREE.MeshStandardMaterial({ color: '#8b8061', roughness: 1, side: THREE.DoubleSide }));
  bank.rotation.x = -Math.PI / 2;
  bank.scale.y = 0.59;
  bank.position.set(0, -0.04, -1);
  scene.add(bank);
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
    if ((x / 9) ** 2 + ((z + 1) / 5.2) ** 2 < 2.0) continue;
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
    const tint = new THREE.Color().setHSL(0.29 + rng() * 0.045, 0.24 + rng() * 0.15, 0.24 + rng() * 0.12);
    canopy.setColorAt(n, tint);
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
  for (let i = 0; i < 360; i++) {
    let x, z;
    do {
      x = (rng() - 0.5) * 43;
      z = (rng() - 0.5) * 38;
    } while ((x / 26) ** 2 + (z / 23) ** 2 > 0.88 || (x / 9) ** 2 + ((z + 1) / 5.2) ** 2 < 1.5 || Math.abs(z - (7.4 + Math.sin(x * 0.19) * 0.9)) < 1.3);
    const y = terrainY(x, z);
    const size = 0.55 + rng() * 0.9;
    dummy.position.set(x, y + 0.11 * size, z);
    dummy.scale.setScalar(size);
    dummy.rotation.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.16);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    dummy.position.y += 0.13 * size;
    dummy.scale.setScalar(size * 0.78);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    if (rng() > 0.83) heads.setColorAt(i, new THREE.Color('#d99e61'));
  }
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
  const geometry = new THREE.TubeGeometry(curve, 160, 0.62, 7, false);
  const path = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#9b8e6e', roughness: 1 }));
  path.scale.y = 0.08;
  path.receiveShadow = true;
  scene.add(path);
}

async function main() {
  try {
    await renderer.init();
    createGround();
    createPond();
    createPath();
    createMeadow();
    createFlowers();
    createTrees();
    loading.hidden = true;
    renderer.setAnimationLoop(() => {
      controls.update();
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
