// New York (vùng autumn): tượng Nữ thần Tự do trên đảo giữa cảng ngoài cổng (bệ đá trên nền pháo đài hình sao, tượng đồng
// xanh giơ cao ngọn đuốc), sau lưng là đường chân trời Manhattan (skyline chung, tháp chính kiểu art deco nhiều nấc có
// chóp — giản lược, không chữ; lưu ý thương hiệu ở KE_HOACH_BANG.md mục 2); phía đông là cầu Brooklyn (cầu treo chung kiểu
// tháp đá hai cửa vòm nhọn) qua sông. Ban đêm đuốc sáng vàng, tượng rọi sáng, thành phố rực đèn. Đồi của vùng ẩn đi
// (states/ny.json). Gần tường: vườn táo.
import * as THREE from 'three';
import { frame } from './common.mjs';

const landmarks = {
  // params: { height (m, tới đỉnh đuốc) }.
  liberty(batch, x, z, scale, rand, env, { face, haze, params }) {
    const s = ((params.height || 34) / 34) * scale;
    const at = frame(x, z, face);
    const fort = env.far('#b7ab93', { haze, flatShading: true, roughness: 1 });
    const granite = env.far('#c6baa3', { haze, flatShading: true, roughness: 1 });
    const copper = env.far('#6fa592', { haze, flatShading: true, roughness: 0.8 });
    const flame = env.far('#e8b23a', { haze, flatShading: true, roughness: 0.6 });
    // Đảo cỏ + nền pháo đài hình sao 11 cánh.
    batch.add(new THREE.CylinderGeometry(24 * s, 26 * s, 1.2 * s, 16), env.far('#6f8f55', { haze, flatShading: true }), { position: at(0, 0.6 * s, 0) });
    const star = new THREE.Shape();
    for (let index = 0; index < 22; index += 1) {
      const angle = (index / 22) * Math.PI * 2;
      const r = (index % 2 ? 9.5 : 14) * s;
      if (index) star.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      else star.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    const fortGeometry = new THREE.ExtrudeGeometry(star, { depth: 3.2 * s, bevelEnabled: false });
    fortGeometry.rotateX(-Math.PI / 2);
    batch.add(fortGeometry, fort, { position: at(0, 1.2 * s, 0) });
    // Bệ đá thu dần lên, gờ đỉnh.
    const pedestal = new THREE.CylinderGeometry(4.2 * s, 6 * s, 12 * s, 4);
    pedestal.rotateY(Math.PI / 4);
    batch.add(pedestal, granite, { position: at(0, 4.4 * s + 6 * s, 0), rotation: [0, face, 0] });
    const cap = new THREE.CylinderGeometry(4.6 * s, 4.6 * s, 1 * s, 4);
    cap.rotateY(Math.PI / 4);
    batch.add(cap, granite, { position: at(0, 16.9 * s, 0), rotation: [0, face, 0] });
    // Tượng: áo choàng loe, vai, đầu, vương miện bảy tia, tay phải giơ đuốc, tay trái ôm phiến đá.
    const base = 17.4 * s;
    const parts = [];
    const add = (geometry, material, place) => {
      parts.push(geometry.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...place.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(place.rotation || [0, 0, 0]), place.order || 'XYZ')), new THREE.Vector3(1, 1, 1))));
      batch.add(geometry, material, place);
    };
    add(new THREE.CylinderGeometry(1.5 * s, 2.5 * s, 9 * s, 10), copper, { position: at(0, base + 4.5 * s, 0) });
    add(new THREE.SphereGeometry(1.7 * s, 10, 8), copper, { position: at(0, base + 9.4 * s, 0) });
    add(new THREE.SphereGeometry(1 * s, 10, 8), copper, { position: at(0, base + 11.4 * s, 0.15 * s) });
    for (let ray = 0; ray < 7; ray += 1) {
      const angle = ((ray - 3) / 3) * 1.1;
      const tip = at(Math.sin(angle) * 1.4 * s, base + 12 * s + Math.cos(angle) * 0.4 * s, 0.6 * s);
      const geometry = new THREE.ConeGeometry(0.18 * s, 1.2 * s, 4);
      geometry.rotateZ(-angle * 0.9);
      add(geometry, copper, { position: tip, rotation: [0.25, face, 0], order: 'YXZ' });
    }
    // Tay phải (bên phải tượng nhìn từ sân là -x cục bộ) giơ cao, hơi nghiêng ra ngoài.
    const shoulder = at(-1.4 * s, base + 10 * s, 0);
    const hand = at(-2.1 * s, base + 15 * s, -0.2 * s);
    const arm = new THREE.CylinderGeometry(0.42 * s, 0.5 * s, 5.1 * s, 8);
    const dir = new THREE.Vector3(hand[0] - shoulder[0], hand[1] - shoulder[1], hand[2] - shoulder[2]).normalize();
    const tilt = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    add(arm, copper, { position: [(hand[0] + shoulder[0]) / 2, (hand[1] + shoulder[1]) / 2, (hand[2] + shoulder[2]) / 2], rotation: [tilt.x, tilt.y, tilt.z] });
    add(new THREE.CylinderGeometry(0.5 * s, 0.3 * s, 1.2 * s, 8), copper, { position: [hand[0], hand[1] + 0.6 * s, hand[2]] });
    batch.add(new THREE.ConeGeometry(0.55 * s, 1.5 * s, 7), flame, { position: [hand[0], hand[1] + 1.9 * s, hand[2]] });
    add(new THREE.BoxGeometry(1.6 * s, 2.4 * s, 0.4 * s), copper, { position: at(1.7 * s, base + 7.4 * s, 0.6 * s), rotation: [0.15, face, 0.25], order: 'YXZ' });
    // Đêm: đuốc sáng vàng, tượng rọi sáng.
    env.nightGlow(hand[0], hand[1] + 2 * s, hand[2], 6 * s, '#ffd36a');
    const glow = mergeGeometries(parts);
    if (glow) env.nightMesh(glow, '#e9fff4', 0.25);
  },
};

// Gộp các hình (đã đặt chỗ) thành một cho lớp sáng đêm.
function mergeGeometries(list) {
  const positions = [];
  for (const geometry of list) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    positions.push(...flat.attributes.position.array);
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }
  if (!positions.length) return null;
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}

const scatter = {
  // Cây táo: thân thấp chẻ nhánh, tán tròn xanh lấm tấm quả đỏ.
  'apple-tree'(batch, x, z, size, rand, env) {
    const h = (1.4 + rand() * 0.5) * size;
    batch.add(new THREE.CylinderGeometry(0.14 * size, 0.2 * size, h, 6), env.material('#5e4a38', { flatShading: true }), { position: [x, h / 2, z] });
    batch.add(new THREE.IcosahedronGeometry(1.5 * size, 1), env.material(rand() < 0.5 ? '#5f8a3a' : '#6e9440', { flatShading: true }), { position: [x, h + 0.9 * size, z], scale: [1.15, 0.85, 1.15] });
    const fruit = env.material('#c8302a', { flatShading: true });
    for (let index = 0; index < 9; index += 1) {
      const angle = rand() * Math.PI * 2;
      const up = rand() * 1.2 - 0.3;
      batch.add(new THREE.IcosahedronGeometry(0.13 * size, 0), fruit, {
        position: [x + Math.cos(angle) * 1.55 * size, h + 0.9 * size + up * size, z + Math.sin(angle) * 1.55 * size],
      });
    }
  },
};

export const kit = { landmarks, scatter };
