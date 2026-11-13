// Delaware (vùng blossom): cầu treo đôi Delaware Memorial — hai cầu song song tháp sơn xanh lục — vắt qua sông Delaware
// rộng như biển ngoài cổng (cầu treo, mặt nước, đụn cát ở landmarks/common.mjs, tham số trong states/de.json); bờ gần là
// đụn cát Cape Henlopen. Phía đông: tháp quan sát bê tông thời Thế chiến II đứng trên đụn cát (dọc bờ biển Delaware còn
// nhiều tháp như vậy). Ban đêm đèn dọc cầu và cáp. Các lớp núi của vùng ẩn đi. Gần tường: cỏ biển (vật rải chung).
import * as THREE from 'three';

const landmarks = {
  // Tháp quan sát: trụ bê tông tròn, hai dải khe nhìn tối gần đỉnh, mái bằng có gờ; đứng trên gò cát. params: { height }.
  'fire-tower'(batch, x, z, scale, rand, env, { haze, params }) {
    const height = (params.height || 22) * scale;
    const concrete = env.far('#b9b5aa', { haze, flatShading: true, roughness: 1 });
    const slit = env.far('#2f2f30', { haze, flatShading: true, roughness: 1 });
    const sand = env.far('#e1cd9c', { haze, flatShading: true, roughness: 1 });
    batch.add(new THREE.SphereGeometry(10 * scale, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), sand, { position: [x, 0, z], scale: [1, 0.35, 1] });
    batch.add(new THREE.CylinderGeometry(2.6 * scale, 2.9 * scale, height, 14), concrete, { position: [x, height / 2, z] });
    for (const y of [height * 0.78, height * 0.9]) {
      batch.add(new THREE.CylinderGeometry(2.66 * scale, 2.66 * scale, 0.7 * scale, 14), slit, { position: [x, y, z] });
    }
    batch.add(new THREE.CylinderGeometry(3 * scale, 3 * scale, 0.5 * scale, 14), concrete, { position: [x, height + 0.25 * scale, z] });
  },
};

export const kit = { landmarks, scatter: {} };
