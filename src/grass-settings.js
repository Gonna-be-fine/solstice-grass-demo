import { uniform } from 'three/tsl';

// Shared live controls: update these uniforms to tune the generated grass
// without rebuilding its instance buffers.
const bladeScale = uniform(1);
const bendScale = uniform(1);

export { bladeScale, bendScale };
