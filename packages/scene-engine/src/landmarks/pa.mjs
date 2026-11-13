// Pennsylvania (vùng autumn): cầu cạn đá Starrucca — hàng vòm đá xám nâu cao vắt ngang thung lũng ngoài cổng, trên cầu
// thỉnh thoảng có đoàn tàu chạy qua (ban đêm cửa sổ tàu sáng); hai bên là đồi trại rừng thu (đồi chung `hills`). Phía
// đông là cầu gỗ có mái đỏ (`covered-bridge` chung). Đồi của vùng ẩn đi (states/pa.json). Gần tường: hàng rào zíc zắc.
import * as THREE from 'three';
import { outward, paintMerge, sweep } from './common.mjs';

const landmarks = {
  // Cầu cạn: các trụ đá, vòm bán nguyệt giữa hai trụ, tường trên vòm, mặt cầu có lan can; đoàn tàu chạy qua lại.
  // params: { arches, bay (m), height (m, mặt cầu) }.
  'stone-viaduct'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const P = (u, y, d) => [x + ax * u + ox * d, y, z + az * u + oz * d];
    const arches = params.arches || 15;
    const bay = (params.bay || 14) * scale;
    const top = (params.height || 26) * scale;
    const thick = 7 * scale;
    const pierW = 3.2 * scale;
    const span = bay - pierW;
    const r = span / 2;
    const spring = top - 4 * scale - r;
    const stone = env.far('#8f877a', { haze, flatShading: true, roughness: 1 });
    const dark = env.far('#756d62', { haze, flatShading: true, roughness: 1 });
    const length = arches * bay;
    const box = (u, y, w, h, material) => batch.add(new THREE.BoxGeometry(ax ? w : thick, h, ax ? thick : w), material, { position: P(u, y, 0) });
    for (let index = 0; index <= arches; index += 1) {
      const u = -length / 2 + index * bay;
      box(u, spring / 2, pierW * (1 + (1 - spring / top) * 0.3), spring, stone);
    }
    for (let index = 0; index < arches; index += 1) {
      const u = -length / 2 + (index + 0.5) * bay;
      // Vòm: nửa vòng đá dày, hai góc trên lấp tường.
      const points = [];
      for (let step = 0; step <= 12; step += 1) {
        const angle = Math.PI - (step / 12) * Math.PI;
        points.push(P(u + Math.cos(angle) * (r + 0.6 * scale), spring + Math.sin(angle) * (r + 0.6 * scale), 0));
      }
      batch.add(sweep(points, { axis: [ox, 0, oz], radius: () => [0.8 * scale, thick / 2], steps: 16, radial: 4 }), dark);
      for (const s of [-1, 1]) box(u + s * (r * 0.78), spring + r * 0.78, r * 0.5, r * 0.45, stone);
    }
    box(0, top - 2 * scale, length + pierW, 4 * scale, stone);
    box(0, top + 0.5 * scale, length + pierW, 1 * scale, dark);
    // Đoàn tàu: đầu máy + 6 toa, chạy hết chiều dài cầu rồi quay lại sau một quãng nghỉ.
    const parts = [];
    const windows = [];
    for (let car = 0; car < 7; car += 1) {
      const u = -car * 13 * scale;
      parts.push([new THREE.BoxGeometry(12 * scale, 3.6 * scale, 3.2 * scale), car ? '#7a2e24' : '#2b2b2e', { position: [u, 1.8 * scale, 0] }]);
      parts.push([new THREE.BoxGeometry(12.2 * scale, 0.5 * scale, 3.4 * scale), '#3b3b3e', { position: [u, 3.85 * scale, 0] }]);
      if (car) for (let w = -4; w <= 4; w += 2) windows.push([new THREE.BoxGeometry(1.2 * scale, 1 * scale, 3.3 * scale), '#ffffff', { position: [u + w * scale, 2.3 * scale, 0] }]);
    }
    parts.push([new THREE.CylinderGeometry(0.6 * scale, 0.7 * scale, 2 * scale, 6), '#2b2b2e', { position: [4 * scale, 4.6 * scale, 0] }]);
    const train = new THREE.Mesh(paintMerge(parts), env.far('#ffffff', { haze, vertexColors: true, roughness: 0.8 }));
    train.rotation.y = Math.atan2(-az, ax);
    env.add(train);
    train.add(env.nightMesh(paintMerge(windows), '#ffd58a', 0.9));
    // Hai đầu cầu vùi vào sườn đồi (đồi chung có khe, states/pa.json): tàu chạy ra khỏi đồi, qua cầu rồi khuất vào đồi
    // bên kia, nghỉ một lúc rồi lại chạy.
    const run = length + 200 * scale;
    const place = (seconds) => {
      const phase = (seconds * 9 * scale) % (run * 1.6);
      const u = Math.min(run, phase) - run / 2;
      const [px, , pz] = P(u, 0, 0);
      train.position.set(px, top + 1 * scale, pz);
      train.visible = phase < run;
    };
    place(0);
    env.animate(place);
  },
};

export const kit = { landmarks, scatter: {} };
