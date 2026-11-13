// Vermont (vùng autumn): đồi lá đỏ của vùng giữ nguyên, sau xa là dãy Green Mountains rừng thu (đồi chung `hills`); ngoài
// cổng là cây cầu gỗ có mái sơn đỏ bắc qua suối (`covered-bridge` chung), nhà nấu đường phong (sugar house) có tháp
// thông hơi bốc hơi nước trắng cạnh đống củi; phía đông là trại bò sữa (`farmstead` chung). Ban đêm hơi nước sáng bạc,
// đèn nhà. Gần tường: bò sữa đen trắng (`cow` chung).
import * as THREE from 'three';
import { frame, paintMerge } from './common.mjs';

const landmarks = {
  // Nhà nấu đường phong: nhà gỗ xám nâu, tháp thông hơi trên nóc bốc hơi trắng (chuyển động), đống củi. params: {}.
  'sugar-house'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const wood = env.far('#7a6550', { haze, flatShading: true, roughness: 1 });
    const roof = env.far('#4f4c48', { haze, flatShading: true, roughness: 0.9 });
    const w = 10 * scale;
    const d = 7 * scale;
    const h = 4 * scale;
    batch.add(new THREE.BoxGeometry(w, h, d), wood, { position: at(0, h / 2, 0), rotation: [0, face, 0] });
    for (const side of [-1, 1]) {
      const slope = new THREE.BoxGeometry(w + 0.8 * scale, 0.25 * scale, d * 0.66);
      slope.rotateX(side * 0.7);
      batch.add(slope, roof, { position: at(0, h + 1.4 * scale, side * d * 0.24), rotation: [0, face, 0] });
    }
    batch.add(new THREE.BoxGeometry(3 * scale, 2 * scale, 2 * scale), wood, { position: at(0, h + 3.2 * scale, 0), rotation: [0, face, 0] });
    batch.add(new THREE.ConeGeometry(2.4 * scale, 1.2 * scale, 4), roof, { position: at(0, h + 4.8 * scale, 0), rotation: [0, face + Math.PI / 4, 0] });
    for (let row = 0; row < 3; row += 1) {
      const log = new THREE.CylinderGeometry(0.2 * scale, 0.2 * scale, 6 * scale, 5);
      log.rotateZ(Math.PI / 2);
      for (let index = 0; index < 5 - row; index += 1) {
        batch.add(log.clone(), env.far('#8a6a48', { haze, flatShading: true }), { position: at(w / 2 + 4 * scale, 0.2 * scale + row * 0.38 * scale, (index - 2) * 0.42 * scale + row * 0.2 * scale), rotation: [0, face + Math.PI / 2, 0] });
      }
      log.dispose();
    }
    // Hơi nước: chồng khối trắng mờ loe dần, phập phồng.
    const puffs = [];
    for (let index = 0; index < 8; index += 1) {
      const y = index / 8;
      puffs.push([new THREE.IcosahedronGeometry(1, 1), '#ffffff', { position: [y * 1.6, y * 7, 0], scale: [1 + y * 2.2, 0.9 + y, 1 + y * 2.2] }]);
    }
    const steam = new THREE.Mesh(paintMerge(puffs), env.far('#ffffff', { haze, vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, emissive: '#c9d0d6', emissiveIntensity: 0.5 }));
    const [sx, , sz] = at(0, 0, 0);
    steam.position.set(sx, h + 5 * scale, sz);
    steam.scale.setScalar(scale);
    env.add(steam);
    steam.add(env.nightMesh(steam.geometry.clone(), '#cfdcff', 0.14));
    env.animate((seconds) => {
      const k = 1 + Math.sin(seconds * 0.7) * 0.08;
      steam.scale.set(scale * k, scale * (1 + Math.sin(seconds * 0.5) * 0.1), scale * k);
    });
    env.nightPoints([at(-w * 0.25, h * 0.55, d / 2 + 0.2), at(w * 0.25, h * 0.55, d / 2 + 0.2)], { color: '#ffcf80', size: 1.1 * scale });
  },
};

export const kit = { landmarks, scatter: {} };
