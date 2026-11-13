// Maine (vùng autumn): hải đăng Portland Head trên mỏm đá bên biển Bắc Đại Tây Dương ngoài cổng (hải đăng + biển ở
// landmarks/common.mjs, tham số trong states/me.json), rừng thông hai bên. Đồi của vùng ẩn đi vì phía cổng là biển.
// Gần tường: cọc phao bẫy tôm hùm nhiều màu.
import * as THREE from 'three';

const BUOYS = ['#e0452f', '#f2c230', '#2f7fc1', '#f4f1e8', '#3c9a5a'];

const scatter = {
  // Cọc gỗ treo một chùm phao sọc màu.
  buoys(batch, x, z, size, rand, env) {
    batch.add(new THREE.CylinderGeometry(0.08 * size, 0.1 * size, 2.2 * size, 5), env.material('#6e5a44'), { position: [x, 1.1 * size, z] });
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2 + rand();
      const y = (0.9 + rand() * 0.9) * size;
      const px = x + Math.cos(angle) * 0.22 * size;
      const pz = z + Math.sin(angle) * 0.22 * size;
      batch.add(new THREE.CylinderGeometry(0.14 * size, 0.14 * size, 0.22 * size, 7), env.material(BUOYS[Math.floor(rand() * BUOYS.length)]), { position: [px, y + 0.11 * size, pz] });
      batch.add(new THREE.CylinderGeometry(0.14 * size, 0.14 * size, 0.22 * size, 7), env.material(BUOYS[Math.floor(rand() * BUOYS.length)]), { position: [px, y - 0.11 * size, pz] });
    }
  },
};

export const kit = { landmarks: {}, scatter };
