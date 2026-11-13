// Oregon: Mount Hood phủ tuyết ngoài cổng, bờ Thái Bình Dương với Haystack Rock phía tây và thác Multnomah hai tầng
// phía đông. Không chữ / logo; gỗ trôi dạt chỉ nằm trong dải ngoài tường.
import * as THREE from 'three';
import { beam, frame, ridge } from './common.mjs';

const bump = (t, at, width) => Math.exp(-(((t - at) / width) ** 2));

function waterfallGeometry(scale) {
  const positions = [];
  const index = [];
  const addStrip = (rows) => {
    const first = positions.length / 3;
    rows.forEach(([center, y, width, depth]) => {
      positions.push((center - width / 2) * scale, y * scale, depth * scale);
      positions.push((center + width / 2) * scale, y * scale, depth * scale);
    });
    for (let row = 0; row < rows.length - 1; row += 1) {
      const a = first + row * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  };
  // Hai tầng đổi bề ngang và lệch nhẹ như dòng nước bám vách; chừa khe cho cầu đá giữa thác.
  addStrip([[0, 31, 3.1, 1.35], [0.15, 26, 2.6, 1.55], [0.35, 21, 3.3, 1.72], [0.7, 16, 4.6, 1.88]]);
  addStrip([[0.75, 13.3, 4.2, 1.42], [1.05, 9.5, 4.8, 1.55], [0.8, 5.2, 5.6, 1.75], [1.2, 0.8, 7.2, 1.95]]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

const landmarks = {
  'mount-hood'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const span = (params.span || 300) * scale;
    const height = (params.height || 62) * scale;
    const forest = env.far('#40594a', { haze, roughness: 1, flatShading: true });
    const rock = env.far('#58645e', { haze, roughness: 1, flatShading: true });
    const snow = env.far('#e8edef', { haze, roughness: 0.88, flatShading: true });
    const crest = (t) => height * Math.max(
      bump(t, 0, span * 0.2),
      bump(t, -span * 0.27, span * 0.22) * 0.48,
      bump(t, span * 0.31, span * 0.25) * 0.42,
    ) + Math.sin(t * 0.11) * 1.5 * scale;
    ridge(batch, x, z, {
      side, span, depth: 78 * scale, crest, rise: (v) => v ** 0.92, ribs: 4 * scale, jag: 1.7 * scale,
      columns: 72, rows: 12, phase: 3.4, bands: [[0, 0.28, forest], [0.28, 0.62, rock], [0.62, 1, snow]],
    });
  },

  'haystack-rock'(batch, x, z, scale, rand, env, { haze }) {
    const rock = env.far('#58645e', { haze, roughness: 1, flatShading: true });
    batch.add(new THREE.DodecahedronGeometry(8.5 * scale, 1), rock, {
      position: [x, 8.4 * scale, z], scale: [0.76, 1.72, 0.9], rotation: [0.08, rand() * 0.35, -0.04],
    });
    for (const side of [-1, 1]) {
      const size = (3 + rand() * 1.4) * scale;
      batch.add(new THREE.DodecahedronGeometry(size, 0), rock, {
        position: [x + side * 8.2 * scale, size * 0.38, z + (rand() - 0.5) * 4 * scale],
        scale: [0.7, 1.35, 0.85], rotation: [rand() * 0.3, rand() * Math.PI, 0],
      });
    }
    const moonWater = new THREE.CircleGeometry(27 * scale, 28);
    moonWater.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0.07, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
      new THREE.Vector3(1.7, 1, 0.72),
    ));
    env.nightMesh(moonWater, '#b9d9de', 0.13);
  },

  'multnomah-falls'(batch, x, z, scale, rand, env, { face, side, haze }) {
    const rock = env.far('#58645e', { haze, roughness: 1, flatShading: true });
    const forest = env.far('#40594a', { haze, roughness: 1, flatShading: true });
    const water = env.far('#dcebf0', {
      haze, roughness: 0.82, flatShading: true, side: THREE.DoubleSide,
      emissive: '#9fc7d6', emissiveIntensity: 0.52,
    });
    ridge(batch, x, z, {
      side, span: 76 * scale, depth: 19 * scale,
      crest: (t) => (31 + Math.sin(t * 0.13) * 3 + Math.cos(t * 0.27) * 1.5) * scale,
      rise: (v) => Math.min(1, v / 0.2) ** 0.7, ribs: 1.2 * scale, jag: 0.8 * scale,
      columns: 36, rows: 8, phase: 1.6, bands: [[0, 0.25, forest], [0.25, 1, rock]],
    });
    const fallsGeometry = waterfallGeometry(scale);
    const at = frame(x, z, face);
    batch.add(fallsGeometry, water, { position: [x, 0, z], rotation: [0, face, 0] });
    batch.add(new THREE.CircleGeometry(8.5 * scale, 24), water, {
      position: at(1.2 * scale, 0.09, 0.25 * scale), rotation: [-Math.PI / 2, 0, 0], scale: [1.2, 0.62, 1],
    });
    beam(batch, at(-8 * scale, 14.2 * scale, 0.35 * scale), at(8 * scale, 14.2 * scale, 0.35 * scale), 0.55 * scale, rock);
    beam(batch, at(-6.8 * scale, 12.8 * scale, 0.35 * scale), at(-6.8 * scale, 14.2 * scale, 0.35 * scale), 0.45 * scale, rock);
    beam(batch, at(6.8 * scale, 12.8 * scale, 0.35 * scale), at(6.8 * scale, 14.2 * scale, 0.35 * scale), 0.45 * scale, rock);
    const glowFalls = fallsGeometry.clone();
    glowFalls.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, face, 0)),
      new THREE.Vector3(1, 1, 1),
    ));
    env.nightMesh(glowFalls, '#d9ecff', 0.34);
  },
};

const scatter = {
  driftwood(batch, x, z, size, rand, env) {
    const yaw = rand() * Math.PI;
    const length = (3 + rand() * 3.5) * size;
    batch.add(new THREE.CylinderGeometry(0.24 * size, 0.38 * size, length, 7), env.material('#78614b', { roughness: 1, flatShading: true }), {
      position: [x, 0.28 * size, z], rotation: [Math.PI / 2, yaw, 0], order: 'YXZ',
    });
  },
};

export const kit = { landmarks, scatter };
