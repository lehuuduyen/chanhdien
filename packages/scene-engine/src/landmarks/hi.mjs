// Hawaii (vùng tropical): núi Diamond Head nhô lên từ biển ngoài cổng — nón tro núi lửa có vành sắc, đỉnh Lēʻahi nhọn ở
// một đầu, sườn nhiều rãnh xói, chân phủ xanh; phía đông là núi lửa hình khiên Kīlauea giữa biển đang phun: vòi dung nham
// trên khe nứt, các dòng dung nham đỏ cam chảy xuống sườn, cột khói xám trắng; ban đêm dung nham rực đỏ. Giữ biển của vùng
// (states/hi.json không ẩn núi vùng). Gần tường: ruộng khoai môn ngập nước.
import * as THREE from 'three';
import { outward, paintMerge, ridge } from './common.mjs';

const landmarks = {
  // Diamond Head: sống nón tro dài, đỉnh nhọn lệch một đầu, rãnh xói dọc sườn. params: { span, height }.
  'diamond-head'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const span = (params.span || 220) * scale;
    const height = (params.height || 34) * scale;
    const phase = rand() * 6;
    // Vành nón: lên dần từ trái, đỉnh nhọn ở bên phải (nhìn từ sân +x bên trái), dốc gắt xuống biển.
    const crest = (t) => {
      const k = t / (span / 2);
      const rim = 0.55 + 0.25 * Math.sin((k + 1) * 1.4);
      const peak = Math.max(0, 1 - Math.abs(k + 0.45) / 0.22) ** 1.4;
      const ends = Math.min(1, (1 - Math.abs(k)) / 0.25);
      return height * Math.max(0, Math.min(1, rim + 0.45 * peak)) * ends ** 0.6;
    };
    ridge(batch, x, z, {
      side, span, depth: 70 * scale, crest, rise: (v) => Math.sin(v * Math.PI * 0.62) ** 0.9 / Math.sin(Math.PI * 0.62) ** 0.9, ribs: 5, jag: 2, columns: 90, rows: 12, phase,
      bands: [
        [0, 0.12, env.far('#6f8a4a', { haze, flatShading: true, roughness: 1 })],
        [0.12, 0.35, env.far('#8f8a5a', { haze, flatShading: true, roughness: 1 })],
        [0.35, 1, env.far('#a08c62', { haze, flatShading: true, roughness: 1 })],
      ],
    });
  },

  // Kīlauea: khiên núi lửa rộng thấp màu đá đen, miệng hố trên đỉnh, vòi dung nham + dòng dung nham, cột khói. params:
  // { radius, height }.
  kilauea(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const radius = (params.radius || 70) * scale;
    const height = (params.height || 30) * scale;
    const rock = env.far('#4a4440', { haze, flatShading: true, roughness: 1 });
    const rockDark = env.far('#38332f', { haze, flatShading: true, roughness: 1 });
    batch.add(new THREE.CylinderGeometry(radius * 0.16, radius, height, 18, 3), rock, { position: [x, height / 2 - 0.5, z] });
    batch.add(new THREE.CylinderGeometry(radius * 0.12, radius * 0.15, 1.2 * scale, 14), rockDark, { position: [x, height - 0.2, z] });
    // Dòng dung nham: dải đỏ cam uốn lượn từ khe nứt gần đỉnh xuống chân về phía sân.
    const lava = env.far('#ff5a1a', { haze, emissive: '#ff3b0a', emissiveIntensity: 0.9, flatShading: true, roughness: 1 });
    const glow = [];
    const slope = (r) => height * (1 - (r - radius * 0.16) / (radius * 0.84));
    for (const offset of [-0.35, 0, 0.3]) {
      let previous = null;
      for (let step = 0; step <= 10; step += 1) {
        const r = radius * (0.18 + step * 0.075);
        const angle = Math.atan2(-oz, -ox) + offset + Math.sin(step * 0.9 + offset * 7) * 0.08;
        const point = [x + Math.cos(angle) * r, slope(r) + 0.15 * scale, z + Math.sin(angle) * r];
        if (previous) {
          const dx = point[0] - previous[0];
          const dy = point[1] - previous[1];
          const dz = point[2] - previous[2];
          const length = Math.hypot(dx, dy, dz);
          const geometry = new THREE.BoxGeometry(2.2 * scale + step * 0.25 * scale, 0.5 * scale, length);
          const dir = new THREE.Vector3(dx, dy, dz).normalize();
          geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
          geometry.translate((point[0] + previous[0]) / 2, (point[1] + previous[1]) / 2, (point[2] + previous[2]) / 2);
          glow.push(geometry.clone());
          batch.add(geometry, lava);
        }
        previous = point;
      }
    }
    // Vòi dung nham trên khe nứt (phập phồng) và cột khói.
    const vent = [x - ox * radius * 0.2, slope(radius * 0.2), z - oz * radius * 0.2];
    const fountainParts = [];
    for (let index = 0; index < 5; index += 1) {
      fountainParts.push([new THREE.ConeGeometry(1.2 * scale, 1, 6), '#ffffff', { position: [(index - 2) * 2.2 * scale, 0.5, (rand() - 0.5) * 2 * scale], scale: [1, 0.7 + rand() * 0.6, 1] }]);
    }
    const fountainGeometry = paintMerge(fountainParts);
    const fountain = new THREE.Mesh(fountainGeometry, env.far('#ffb04a', { haze, emissive: '#ff6a10', emissiveIntensity: 1, roughness: 1 }));
    fountain.position.set(...vent);
    fountain.rotation.y = Math.atan2(ox, oz);
    env.add(fountain);
    fountain.add(env.nightMesh(fountainGeometry.clone(), '#ff7a2a', 0.9));
    const smokeParts = [];
    // Cột khói: nhiều cụm tơi so le, loe và lệch theo gió, gốc xám ngả nâu, ngọn trắng (tự sáng nhẹ để không thành
    // các quả cầu có bóng khối).
    for (let index = 0; index < 22; index += 1) {
      const y = index / 22;
      const spread = (3 + y * 12) * scale;
      smokeParts.push([new THREE.IcosahedronGeometry(1, 1), y < 0.25 ? '#a39a90' : '#e6e3de', {
        position: [y * 22 * scale + (rand() - 0.5) * spread, 8 * scale + y * 50 * scale, y * 8 * scale + (rand() - 0.5) * spread],
        scale: [(5 + y * 9 + rand() * 4) * scale, (2.5 + y * 3 + rand() * 2) * scale, (5 + y * 9 + rand() * 4) * scale],
      }]);
    }
    const smoke = new THREE.Mesh(paintMerge(smokeParts), env.far('#ffffff', { haze, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, roughness: 1, emissive: '#bdb8b0', emissiveIntensity: 0.45 }));
    smoke.position.set(vent[0], vent[1], vent[2]);
    env.add(smoke);
    env.nightMesh(mergePositions(glow), '#ff4a14', 0.75);
    env.nightGlow(vent[0], vent[1] + 4 * scale, vent[2], 22 * scale, '#ff6a2a');
    env.animate((seconds) => {
      const k = 1 + Math.sin(seconds * 2.3) * 0.25 + Math.sin(seconds * 5.1) * 0.12;
      fountain.scale.set(1, (8 + 3 * Math.sin(seconds * 1.7)) * scale * k, 1);
      smoke.rotation.y = Math.sin(seconds * 0.05) * 0.2;
    });
  },
};

// Gộp vị trí các hình (đã đặt chỗ) thành một cho lớp sáng đêm.
function mergePositions(list) {
  const positions = [];
  for (const geometry of list) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    positions.push(...flat.attributes.position.array);
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}

const scatter = {
  // Ruộng khoai môn: ô nước nông có bờ đất, khóm lá hình tim xanh đậm thành hàng.
  taro(batch, x, z, size, rand, env) {
    const yaw = rand() * Math.PI;
    const w = (5 + rand() * 3) * size;
    const d = (3.5 + rand() * 2) * size;
    batch.add(new THREE.BoxGeometry(w + 0.6 * size, 0.25 * size, d + 0.6 * size), env.material('#6b5238', { flatShading: true }), { position: [x, 0.1 * size, z], rotation: [0, yaw, 0] });
    batch.add(new THREE.BoxGeometry(w, 0.05, d), env.material('#6e9a95', { flatShading: true, roughness: 0.3 }), { position: [x, 0.25 * size, z], rotation: [0, yaw, 0] });
    const leaf = env.material('#2f7a3a', { flatShading: true });
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const lx = (col / 4 - 0.5) * (w - 1 * size);
        const lz = (row / 2 - 0.5) * (d - 1 * size);
        batch.add(new THREE.ConeGeometry(0.35 * size, 0.7 * size, 5), leaf, {
          position: [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, 0.6 * size, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz], rotation: [Math.PI, rand() * 3, 0],
        });
      }
    }
  },
};

export const kit = { landmarks, scatter };
