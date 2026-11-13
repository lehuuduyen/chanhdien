// Florida (vùng tropical): mũi Canaveral ngoài cổng — doi cát giữa biển (biển của vùng), bệ phóng bê tông, tháp phóng
// dàn thép có cần nối, ba cột thu sét nối dây, tên lửa nhiều tầng dáng chung (thân cam, hai tầng đẩy phụ trắng, khoang
// và tháp thoát hiểm; không logo, không chữ). Cứ PERIOD giây phóng một lần: lửa + vệt khói, tên lửa bay lên nhanh dần rồi
// khuất, vệt khói tan, một lúc sau tên lửa mới lại đứng trên bệ. Phía đông là nhà lắp ráp khổng lồ trên đảo Merritt.
// Không dựng lâu đài Disney (KE_HOACH_BANG.md mục 2). Gần tường: vườn cam, hồng hạc.
import * as THREE from 'three';
import { beam, frame, paintMerge } from './common.mjs';

const PERIOD = 150;
const LIFTOFF = 110;
const CLIMB = 26;

const landmarks = {
  // params: { rocket (m, cao tên lửa), tower (m) }.
  'launch-pad'(batch, x, z, scale, rand, env, { face, haze, params }) {
    const at = frame(x, z, face);
    const sand = env.far('#e8dcb8', { haze, flatShading: true, roughness: 1 });
    const concrete = env.far('#b9b6ae', { haze, flatShading: true, roughness: 1 });
    const steel = env.far('#8e9196', { haze, flatShading: true, roughness: 0.7 });
    const red = env.far('#a8452f', { haze, flatShading: true, roughness: 0.8 });
    const height = (params.rocket || 42) * scale;
    const towerH = (params.tower || 50) * scale;
    // Doi cát + bệ phóng.
    batch.add(new THREE.CircleGeometry(40 * scale, 20), sand, { position: [x, 0.09, z], rotation: [-Math.PI / 2, 0, 0], scale: [1.5, 1, 1] });
    batch.add(new THREE.BoxGeometry(30 * scale, 3 * scale, 30 * scale), concrete, { position: at(0, 1.5 * scale, 0), rotation: [0, face, 0] });
    // Tháp phóng dàn thép (4 cột góc, đai ngang, giằng chéo) cạnh tên lửa, cần nối ở trên.
    const tx = 8 * scale;
    const half = 3 * scale;
    for (const dx of [-half, half]) for (const dz of [-half, half]) beam(batch, at(tx + dx, 3 * scale, dz), at(tx + dx, towerH, dz), 0.6 * scale, red);
    for (let y = 6 * scale; y < towerH; y += 5 * scale) {
      for (const dz of [-half, half]) beam(batch, at(tx - half, y, dz), at(tx + half, y, dz), 0.35 * scale, red);
      for (const dx of [-half, half]) beam(batch, at(tx + dx, y, -half), at(tx + dx, y, half), 0.35 * scale, red);
      beam(batch, at(tx - half, y, half), at(tx + half, y + 5 * scale, half), 0.25 * scale, red);
    }
    batch.add(new THREE.BoxGeometry(6 * scale, 1.2 * scale, 1.5 * scale), red, { position: at(4 * scale, height * 0.86, 0), rotation: [0, face, 0] });
    // Ba cột thu sét nối dây quanh bệ.
    const masts = [at(-18 * scale, 0, -14 * scale), at(18 * scale, 0, -14 * scale), at(0, 0, 18 * scale)];
    for (const [mx, , mz] of masts) {
      batch.add(new THREE.CylinderGeometry(0.4 * scale, 0.9 * scale, 56 * scale, 6), steel, { position: [mx, 28 * scale, mz] });
    }
    for (let index = 0; index < 3; index += 1) {
      const [ax, , az] = masts[index];
      const [bx, , bz] = masts[(index + 1) % 3];
      beam(batch, [ax, 55 * scale, az], [(ax + bx) / 2, 38 * scale, (az + bz) / 2], 0.08 * scale, steel);
      beam(batch, [(ax + bx) / 2, 38 * scale, (az + bz) / 2], [bx, 55 * scale, bz], 0.08 * scale, steel);
    }
    // Tháp nước tròn trên chân.
    const [wx, , wz] = at(30 * scale, 0, -22 * scale);
    batch.add(new THREE.SphereGeometry(4 * scale, 12, 8), steel, { position: [wx, 22 * scale, wz] });
    for (const a of [0, 2.1, 4.2]) beam(batch, [wx + Math.cos(a) * 3 * scale, 0, wz + Math.sin(a) * 3 * scale], [wx, 20 * scale, wz], 0.4 * scale, steel);
    // Tên lửa: thân cam, tầng trên trắng, khoang + tháp thoát hiểm, hai tầng đẩy phụ trắng có chóp.
    const core = 2.4 * scale;
    const parts = [
      [new THREE.CylinderGeometry(core, core, height * 0.62, 14), '#d9822b', { position: [0, height * 0.31, 0] }],
      [new THREE.CylinderGeometry(core * 0.8, core, height * 0.06, 14), '#e9e7e2', { position: [0, height * 0.65, 0] }],
      [new THREE.CylinderGeometry(core * 0.8, core * 0.8, height * 0.13, 14), '#f2f1ec', { position: [0, height * 0.745, 0] }],
      [new THREE.ConeGeometry(core * 0.8, height * 0.1, 14), '#f2f1ec', { position: [0, height * 0.86, 0] }],
      [new THREE.CylinderGeometry(0.15 * scale, 0.3 * scale, height * 0.09, 6), '#d8d6d0', { position: [0, height * 0.955, 0] }],
    ];
    for (const s of [-1, 1]) {
      parts.push([new THREE.CylinderGeometry(core * 0.6, core * 0.6, height * 0.6, 12), '#f4f3ee', { position: [s * core * 1.6, height * 0.3, 0] }]);
      parts.push([new THREE.ConeGeometry(core * 0.6, height * 0.07, 12), '#f4f3ee', { position: [s * core * 1.6, height * 0.635, 0] }]);
      parts.push([new THREE.CylinderGeometry(core * 0.45, core * 0.65, 1.4 * scale, 10), '#3b3b3e', { position: [s * core * 1.6, -0.7 * scale, 0] }]);
    }
    const rocket = new THREE.Mesh(paintMerge(parts), env.far('#ffffff', { haze, vertexColors: true, roughness: 0.6 }));
    rocket.rotation.y = face;
    env.add(rocket);
    // Lửa đuôi (ban ngày tự sáng; ban đêm thêm lớp sáng) và vệt khói (cột phồng dần từ bệ lên tới tên lửa).
    const flameParts = [];
    for (const dx of [-core * 1.6, 0, core * 1.6]) {
      flameParts.push([new THREE.ConeGeometry(core * (dx ? 0.55 : 0.8), 1, 10), '#ffffff', { position: [dx, -0.5, 0], rotation: [Math.PI, 0, 0] }]);
    }
    const flameGeometry = paintMerge(flameParts);
    const flame = new THREE.Mesh(flameGeometry, env.far('#ffb347', { haze, emissive: '#ff8a1a', emissiveIntensity: 1, roughness: 1 }));
    rocket.add(flame);
    flame.add(env.nightMesh(flameGeometry.clone(), '#ffb050', 0.9));
    const smokeParts = [];
    for (let index = 0; index < 12; index += 1) {
      const y = index / 12;
      smokeParts.push([new THREE.IcosahedronGeometry(1, 1), '#ffffff', { position: [(rand() - 0.5) * 0.6, y, (rand() - 0.5) * 0.6], scale: [3 + (1 - y) * 6, 0.12, 3 + (1 - y) * 6] }]);
    }
    const smoke = new THREE.Mesh(paintMerge(smokeParts), env.far('#ffffff', { haze, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, roughness: 1, emissive: '#c9c9c9', emissiveIntensity: 0.3 }));
    const base = at(0, 3 * scale, 0);
    smoke.position.set(base[0], base[1], base[2]);
    env.add(smoke);
    const set = (seconds) => {
      const phase = ((seconds % PERIOD) + PERIOD) % PERIOD;
      const flying = phase - LIFTOFF;
      if (flying < 0) {
        rocket.visible = true;
        rocket.position.set(base[0], base[1], base[2]);
        flame.visible = false;
        smoke.visible = false;
        return;
      }
      const rise = 0.5 * 2.2 * flying * flying * scale;
      rocket.visible = flying < CLIMB;
      rocket.position.set(base[0], base[1] + rise, base[2]);
      flame.visible = rocket.visible;
      flame.scale.set(scale, (8 + Math.sin(seconds * 30) * 1.2 + Math.min(10, flying)) * scale, scale);
      // Khói: cao theo tên lửa, tan dần sau khi tên lửa khuất.
      const fade = Math.max(0, 1 - Math.max(0, flying - CLIMB) / (PERIOD - LIFTOFF - CLIMB));
      smoke.visible = fade > 0.02;
      smoke.position.set(base[0], base[1], base[2]);
      smoke.scale.set(scale * (1 + flying * 0.05), Math.max(1, Math.min(rise, 160 * scale)), scale * (1 + flying * 0.05));
      smoke.material.opacity = 0.7 * fade;
    };
    set(0);
    env.animate(set);
    env.nightPoints([at(-14 * scale, 4 * scale, 14 * scale), at(14 * scale, 4 * scale, 14 * scale), at(tx, towerH + 1, 0)], { color: '#fff1c8', size: 1.6 * scale });
  },

  // Nhà lắp ráp khổng lồ: khối hộp trắng xám rất cao, hai cửa trượt dọc sẫm, nhà phụ thấp; đứng trên đảo cát. params: { height }.
  'assembly-building'(batch, x, z, scale, rand, env, { face, haze, params }) {
    const at = frame(x, z, face);
    const height = (params.height || 46) * scale;
    const wall = env.far('#dcdad3', { haze, flatShading: true, roughness: 0.9 });
    const dark = env.far('#5b5e63', { haze, flatShading: true, roughness: 0.9 });
    batch.add(new THREE.CircleGeometry(36 * scale, 18), env.far('#e8dcb8', { haze, flatShading: true }), { position: [x, 0.09, z], rotation: [-Math.PI / 2, 0, 0], scale: [1.3, 1, 1] });
    batch.add(new THREE.BoxGeometry(40 * scale, height, 34 * scale), wall, { position: at(0, height / 2, 0), rotation: [0, face, 0] });
    for (const dx of [-9, 9]) batch.add(new THREE.BoxGeometry(7 * scale, height * 0.86, 0.3 * scale), dark, { position: at(dx * scale, height * 0.43, 17.1 * scale), rotation: [0, face, 0] });
    for (let y = 8; y < height / scale; y += 8) batch.add(new THREE.BoxGeometry(40.4 * scale, 0.35 * scale, 34.4 * scale), dark, { position: at(0, y * scale, 0), rotation: [0, face, 0] });
    batch.add(new THREE.BoxGeometry(26 * scale, 10 * scale, 24 * scale), wall, { position: at(-30 * scale, 5 * scale, 0), rotation: [0, face, 0] });
    env.nightPoints([at(-9 * scale, height * 0.2, 17.6 * scale), at(9 * scale, height * 0.2, 17.6 * scale), at(0, height + 1, 0)], { color: '#fff1c8', size: 1.6 * scale });
  },
};

const scatter = {
  // Cây cam: tán tròn xanh thẫm lấm tấm quả cam.
  'orange-tree'(batch, x, z, size, rand, env) {
    const h = (1.2 + rand() * 0.4) * size;
    batch.add(new THREE.CylinderGeometry(0.12 * size, 0.18 * size, h, 6), env.material('#5e4a36', { flatShading: true }), { position: [x, h / 2, z] });
    batch.add(new THREE.IcosahedronGeometry(1.4 * size, 1), env.material('#2f6b34', { flatShading: true }), { position: [x, h + 0.9 * size, z], scale: [1.1, 0.9, 1.1] });
    const fruit = env.material('#f28c1e', { flatShading: true });
    for (let index = 0; index < 12; index += 1) {
      const angle = rand() * Math.PI * 2;
      batch.add(new THREE.IcosahedronGeometry(0.14 * size, 0), fruit, { position: [x + Math.cos(angle) * 1.45 * size, h + 0.9 * size + (rand() - 0.4) * 1.1 * size, z + Math.sin(angle) * 1.45 * size] });
    }
  },
  // Hồng hạc: thân hồng, cổ cong chữ S, đứng một chân.
  flamingo(batch, x, z, size, rand, env) {
    const pink = env.material('#f08aa0', { flatShading: true });
    const leg = env.material('#d9707f', { flatShading: true });
    const yaw = rand() * Math.PI * 2;
    const at = frame(x, z, yaw);
    const s = size * 0.8;
    batch.add(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 1 * s, 4), leg, { position: at(0, 0.5 * s, 0) });
    batch.add(new THREE.SphereGeometry(0.28 * s, 8, 6), pink, { position: at(0, 1.1 * s, 0), rotation: [0, yaw, 0], scale: [0.8, 0.7, 1.4] });
    beam(batch, at(0, 1.2 * s, 0.3 * s), at(0, 1.75 * s, 0.25 * s), 0.07 * s, pink);
    beam(batch, at(0, 1.75 * s, 0.25 * s), at(0, 1.95 * s, 0.45 * s), 0.07 * s, pink);
    batch.add(new THREE.SphereGeometry(0.09 * s, 6, 5), pink, { position: at(0, 1.97 * s, 0.5 * s) });
    batch.add(new THREE.ConeGeometry(0.04 * s, 0.16 * s, 4), env.material('#2a2a2a', { flatShading: true }), { position: at(0, 1.92 * s, 0.6 * s), rotation: [Math.PI / 2 + 0.6, yaw, 0], order: 'YXZ' });
  },
};

export const kit = { landmarks, scatter };
