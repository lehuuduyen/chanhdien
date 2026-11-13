// New Jersey (vùng autumn): bãi biển Atlantic City ngoài cổng — cầu tàu gỗ dài chìa ra biển, cuối cầu là vòng đu quay
// lớn quay chậm (cabin nhiều màu), ban đêm vòng đèn nhiều màu chạy theo vòng quay; đụn cát cỏ biển dọc bờ, biển cả phía
// cổng và phía đông (đụn cát, mặt biển ở landmarks/common.mjs). Không dựng tòa sòng bạc có thật. Đồi của vùng ẩn đi
// (states/nj.json). Gần tường: cỏ biển, ô che nắng.
import * as THREE from 'three';
import { beam, outward, paintMerge } from './common.mjs';

const RAINBOW = ['#ff4d4d', '#ffb02e', '#ffe14d', '#4dd96b', '#4db8ff', '#b06bff'];

const landmarks = {
  // Cầu tàu chìa ra biển (dài `pier` m từ (x, z) ra xa), vòng đu quay ở cuối. params: { pier, radius }.
  'pier-wheel'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const P = (u, y, d) => [x + ax * u + ox * d, y, z + az * u + oz * d];
    const pier = (params.pier || 60) * scale;
    const radius = (params.radius || 17) * scale;
    const wood = env.far('#8a7258', { haze, flatShading: true, roughness: 1 });
    const steel = env.far('#e9e9ec', { haze, flatShading: true, roughness: 0.6 });
    const deckY = 4 * scale;
    batch.add(new THREE.BoxGeometry(ax ? 14 * scale : pier, 0.8 * scale, ax ? pier : 14 * scale), wood, { position: P(0, deckY, pier / 2) });
    for (let d = 4 * scale; d < pier; d += 8 * scale) {
      for (const u of [-6 * scale, 6 * scale]) batch.add(new THREE.CylinderGeometry(0.35 * scale, 0.35 * scale, deckY, 5), wood, { position: P(u, deckY / 2, d) });
    }
    // Vài quầy hàng nhiều màu dọc cầu tàu.
    for (let index = 0; index < 4; index += 1) {
      const d = (8 + index * 10) * scale;
      batch.add(new THREE.BoxGeometry(4 * scale, 3 * scale, 4 * scale), env.far(RAINBOW[index % RAINBOW.length], { haze, flatShading: true }), { position: P(index % 2 ? 4 * scale : -4 * scale, deckY + 1.9 * scale, d) });
    }
    // Chân đỡ chữ A hai bên trục.
    const center = P(0, deckY + radius + 3 * scale, pier - radius * 0.6);
    for (const w of [-2.2 * scale, 2.2 * scale]) {
      for (const u of [-radius * 0.55, radius * 0.55]) beam(batch, P(u, deckY, pier - radius * 0.6 + w), [center[0] + ox * w, center[1], center[2] + oz * w], 0.7 * scale, steel);
    }
    // Vòng quay: vành, nan hoa, cabin — một mesh quay quanh trục (hướng ra xa sân); đèn vành nhiều màu quay theo.
    const parts = [];
    const lights = [];
    const ring = new THREE.TorusGeometry(radius, 0.35 * scale, 5, 48);
    parts.push([ring, '#f2f2f4', {}]);
    parts.push([new THREE.TorusGeometry(radius * 0.96, 0.2 * scale, 4, 48), '#f2f2f4', { position: [0, 0, 1.6 * scale] }]);
    for (let index = 0; index < 16; index += 1) {
      const angle = (index / 16) * Math.PI * 2;
      const spoke = new THREE.BoxGeometry(radius, 0.18 * scale, 0.18 * scale);
      spoke.translate(radius / 2, 0, 0);
      parts.push([spoke, '#dcdce0', { rotation: [0, 0, angle] }]);
      const cx = Math.cos(angle) * radius;
      const cy = Math.sin(angle) * radius;
      parts.push([new THREE.BoxGeometry(1.6 * scale, 1.6 * scale, 1.6 * scale), RAINBOW[index % RAINBOW.length], { position: [cx, cy - 1.2 * scale, 0.8 * scale] }]);
    }
    for (let index = 0; index < 48; index += 1) {
      const angle = (index / 48) * Math.PI * 2;
      lights.push([new THREE.BoxGeometry(0.6 * scale, 0.6 * scale, 0.6 * scale), RAINBOW[Math.floor(index / 2) % RAINBOW.length], { position: [Math.cos(angle) * radius, Math.sin(angle) * radius, -0.4 * scale] }]);
    }
    const wheel = new THREE.Mesh(paintMerge(parts), env.far('#ffffff', { haze, vertexColors: true, roughness: 0.7 }));
    wheel.position.set(...center);
    // Mặt vòng quay về sân: trục quay là hướng ra xa (outward).
    wheel.rotation.y = Math.atan2(ox, oz);
    env.add(wheel);
    wheel.add(env.nightMesh(paintMerge(lights), '#ffffff', 0.95, { vertexColors: true }));
    env.animate((seconds) => { wheel.rotation.z = seconds * 0.08; });
  },
};

const scatter = {
  // Ô che nắng sọc trên bãi cát.
  umbrella(batch, x, z, size, rand, env) {
    batch.add(new THREE.CylinderGeometry(0.04 * size, 0.04 * size, 2.2 * size, 4), env.material('#e9e4da'), { position: [x, 1.1 * size, z] });
    batch.add(new THREE.ConeGeometry(1.2 * size, 0.5 * size, 8), env.material(RAINBOW[Math.floor(rand() * RAINBOW.length)], { flatShading: true }), { position: [x, 2.25 * size, z] });
  },
};

export const kit = { landmarks, scatter };
