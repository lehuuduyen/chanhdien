// North Carolina (vùng blossom): hải đăng Cape Hatteras sọc xoắn đen trắng trên bệ gạch đỏ giữa đụn cát Outer Banks,
// biển Đại Tây Dương phía sau (hải đăng, đụn cát, biển đều ở landmarks/common.mjs, tham số trong states/nc.json). Ban đêm
// đèn sáng và hai luồng sáng quay. Các lớp núi của vùng ẩn đi. Gần tường: cỏ biển (vật rải chung), hàng rào chắn cát.
import * as THREE from 'three';

const scatter = {
  // Hàng rào chắn cát: cọc gỗ xám bạc thưa, nối bằng dây, hơi nghiêng ngả.
  'sand-fence'(batch, x, z, size, rand, env) {
    const wood = env.material('#a39a88', { flatShading: true });
    const yaw = rand() * Math.PI;
    const count = 10 + Math.floor(rand() * 8);
    for (let index = 0; index < count; index += 1) {
      const t = (index - count / 2) * 0.35 * size;
      const h = (0.9 + rand() * 0.3) * size;
      batch.add(new THREE.BoxGeometry(0.1 * size, h, 0.04 * size), wood, {
        position: [x + Math.cos(yaw) * t, h / 2, z - Math.sin(yaw) * t], rotation: [(rand() - 0.5) * 0.25, yaw, (rand() - 0.5) * 0.15], order: 'YXZ',
      });
    }
  },
};

export const kit = { landmarks: {}, scatter };
