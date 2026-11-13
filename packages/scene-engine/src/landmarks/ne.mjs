// Nebraska: Chimney Rock trên đồng bằng (gò đất sét vàng nhạt loe rộng, chỏm đá cát mảnh có dải sẫm — Claude sửa dáng
// theo góp ý rà) và đàn sếu bay. Chim dùng chung một vật liệu và được gộp theo màu nên không
// làm tăng draw call theo số lượng; ruộng tưới vòng tròn chỉ nằm trong dải gần tường.
import * as THREE from 'three';
import { frame } from './common.mjs';

const addCranes = (batch, at, scale, material, count = 12) => {
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / 4);
    const column = index % 4;
    const px = (column - 1.5) * 6.5 * scale + row * 3 * scale;
    const py = (26 + row * 4 + (column % 2) * 2) * scale;
    const pz = -row * 3 * scale;
    batch.add(new THREE.ConeGeometry(0.28 * scale, 3.5 * scale, 4), material, { position: at(px, py, pz), rotation: [0, 0, Math.PI / 2] });
    for (const wing of [-1, 1]) {
      batch.add(new THREE.BoxGeometry(3.8 * scale, 0.16 * scale, 0.7 * scale), material, {
        position: at(px + wing * 1.8 * scale, py + Math.abs(wing) * 0.2 * scale, pz), rotation: [0, 0, wing * 0.28],
      });
    }
  }
};

const landmarks = {
  'chimney-rock'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const clay = env.far('#c9a77a', { haze, roughness: 1, flatShading: true });
    const clayDark = env.far('#b08b62', { haze, roughness: 1, flatShading: true });
    const spireLight = env.far('#dcc49c', { haze, roughness: 1, flatShading: true });
    const band = env.far('#8f6e4e', { haze, roughness: 1, flatShading: true });
    const bird = env.far('#3d4549', { haze, roughness: 0.95 });
    // Gò chân: nón loe sườn lõm, mép lởm chởm (bán kính méo theo góc), hai tầng màu.
    const lathe = (profile, material, wobble) => {
      const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * scale, y * scale)), 14);
      const position = geometry.attributes.position;
      for (let index = 0; index < position.count; index += 1) {
        const px = position.getX(index);
        const pz = position.getZ(index);
        const angle = Math.atan2(pz, px);
        const k = 1 + wobble * (Math.sin(angle * 5 + 1.3) * 0.6 + Math.sin(angle * 11) * 0.4);
        position.setX(index, px * k);
        position.setZ(index, pz * k);
      }
      geometry.computeVertexNormals();
      batch.add(geometry, material, { position: at(0, 0, -2 * scale) });
    };
    lathe([[24, 0], [17, 3], [12, 7], [9, 11]], clayDark, 0.12);
    lathe([[9, 11], [6.5, 15], [4.6, 19], [3.6, 22]], clay, 0.1);
    // Chỏm: cột đá cát mảnh hơi nghiêng, vài dải sẫm, mũ sẫm trên đỉnh.
    const pieces = [[3.2, 2.9, 22, 30, spireLight], [2.95, 3, 30, 30.8, band], [2.9, 2.6, 30.8, 39, spireLight], [2.65, 2.7, 39, 39.7, band], [2.55, 2.1, 39.7, 45, spireLight], [2.3, 1.6, 45, 46.5, band]];
    for (const [r0, r1, y0, y1, material] of pieces) {
      const lean = (y0 - 22) * 0.02;
      batch.add(new THREE.CylinderGeometry(r1 * scale, r0 * scale, (y1 - y0) * scale, 7), material, {
        position: at(lean * scale, ((y0 + y1) / 2) * scale, -2 * scale), scale: [1, 1, 0.8],
      });
    }
    addCranes(batch, at, scale, bird, 10);
    env.nightPoints([at(-10 * scale, 30 * scale, 0), at(0, 35 * scale, 0), at(10 * scale, 31 * scale, 0)], { color: '#dce9f2', size: 0.68 * scale });
  },

  'platte-cranes'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const bird = env.far('#3d4549', { haze, roughness: 0.95 });
    addCranes(batch, at, scale, bird, 16);
    env.nightPoints([at(-12 * scale, 29 * scale, 0), at(0, 35 * scale, 0), at(12 * scale, 31 * scale, 0)], { color: '#dce9f2', size: 0.72 * scale });
  },
};

const scatter = {
  irrigation(batch, x, z, size, rand, env) {
    const crop = env.material('#6f8b46', { roughness: 1 });
    const metal = env.material('#8b9491', { roughness: 0.55, metalness: 0.25 });
    batch.add(new THREE.CylinderGeometry(2.2 * size, 2.2 * size, 0.08 * size, 18), crop, { position: [x, 0.05 * size, z] });
    batch.add(new THREE.BoxGeometry(4.3 * size, 0.08 * size, 0.08 * size), metal, { position: [x, 0.45 * size, z], rotation: [0, rand() * Math.PI, 0] });
  },
};

export const kit = { landmarks, scatter };
