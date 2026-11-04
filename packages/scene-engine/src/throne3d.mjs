// Bộ tượng chính kiểu đồng: bệ bát giác viền vàng, đài sen phát sáng, vầng lửa chạm đồng sau thân và vòng lửa sau đầu.
// Dựng bằng hình khối + texture canvas (không dùng ảnh ngoài). Kích thước theo `height` (chiều cao cả bộ, mét); gốc ở
// giữa đáy bệ, mặt trước +z. Trả { group, seatY, statueHeight, headY } để đặt bản quét tượng lên đài sen.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Vầng lửa sau thân: giữa đồng sẫm, ra mép đỏ cam rực (như lửa hắt sáng).
function mandorlaTexture() {
  return canvasTexture(512, (ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size * 0.55, size * 0.08, size / 2, size * 0.5, size * 0.55);
    gradient.addColorStop(0, '#3a2010');
    gradient.addColorStop(0.55, '#5a3016');
    gradient.addColorStop(0.82, '#a5531c');
    gradient.addColorStop(1, '#ffb347');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    // Đường chạm lửa: các nét cong toả từ tâm.
    ctx.strokeStyle = 'rgba(255, 190, 110, 0.35)';
    ctx.lineWidth = 3;
    for (let index = 0; index < 40; index += 1) {
      const angle = (index / 40) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(size / 2 + Math.cos(angle) * size * 0.2, size * 0.55 + Math.sin(angle) * size * 0.24);
      ctx.quadraticCurveTo(
        size / 2 + Math.cos(angle + 0.25) * size * 0.36, size * 0.55 + Math.sin(angle + 0.25) * size * 0.38,
        size / 2 + Math.cos(angle + 0.05) * size * 0.5, size * 0.55 + Math.sin(angle + 0.05) * size * 0.5,
      );
      ctx.stroke();
    }
  });
}

// Vòng lửa sau đầu: vành tròn vàng có hoa sen nhỏ, lưỡi lửa cam đỏ toả ra ngoài, giữa trong suốt.
function flameRingTexture() {
  return canvasTexture(512, (ctx, size) => {
    const c = size / 2;
    for (let layer = 0; layer < 3; layer += 1) {
      const tongues = 22 + layer * 6;
      ctx.fillStyle = ['rgba(200, 50, 20, 0.85)', 'rgba(255, 120, 30, 0.9)', 'rgba(255, 210, 90, 0.95)'][layer];
      ctx.beginPath();
      for (let index = 0; index <= tongues * 2; index += 1) {
        const angle = (index / (tongues * 2)) * Math.PI * 2 + layer * 0.12;
        const radius = index % 2 ? c * (0.98 - layer * 0.1) : c * (0.7 - layer * 0.04);
        // Lưỡi lửa cong nhẹ theo chiều kim đồng hồ.
        const x = c + Math.cos(angle + (index % 2 ? 0.06 : 0)) * radius;
        const y = c + Math.sin(angle + (index % 2 ? 0.06 : 0)) * radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(c, c, c * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#8a4a1c';
    ctx.lineWidth = size * 0.06;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#f3c25a';
    ctx.lineWidth = size * 0.012;
    for (const radius of [0.57, 0.63]) {
      ctx.beginPath();
      ctx.arc(c, c, c * radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffcf6a';
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(c + Math.cos(angle) * c * 0.6, c + Math.sin(angle) * c * 0.6, size * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// Đường viền vầng lửa: hai cạnh thẳng ôm thân, phía trên là cung elip vuốt nhọn ở đỉnh, mép có các lưỡi lửa uốn lên.
function mandorlaShape(width, height) {
  const rx = width / 2;
  const cy = height * 0.45;
  const ry = height * 0.4;
  const tongues = 24;
  const edge = (theta, out) => {
    const peak = 1 + 0.32 * Math.pow(Math.sin(theta), 10);
    const grow = out ? 1.13 : 1;
    return [Math.cos(theta) * rx * grow, cy + Math.sin(theta) * ry * peak * grow + (out ? height * 0.03 : 0)];
  };
  const shape = new THREE.Shape();
  shape.moveTo(-rx, 0);
  shape.lineTo(-rx, cy);
  for (let index = 0; index < tongues; index += 1) {
    const from = Math.PI - (index / tongues) * Math.PI;
    const to = Math.PI - ((index + 1) / tongues) * Math.PI;
    const [tipX, tipY] = edge((from + to) / 2, true);
    const [endX, endY] = edge(to, false);
    shape.quadraticCurveTo(tipX, tipY, endX, endY);
  }
  shape.lineTo(rx, 0);
  shape.lineTo(-rx, 0);
  return shape;
}

// lotus: false → bỏ đài sen (bản quét đã có đài sen riêng), tượng đứng ngay trên mặt bệ.
export function buildThrone(height, { lotus = true } = {}) {
  const group = new THREE.Group();
  const bronze = new THREE.MeshStandardMaterial({ color: '#5a3418', metalness: 0.3, roughness: 0.45, envMapIntensity: 0.9, emissive: '#2a1406', emissiveIntensity: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: '#e0a947', metalness: 0.35, roughness: 0.35, emissive: '#5a3608', emissiveIntensity: 0.5 });
  const glow = new THREE.MeshStandardMaterial({ color: '#e9a743', emissive: '#ff8a1f', emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.35 });
  const h = height;
  const parts = { bronze: [], gold: [], glow: [] };
  const add = (geometry, kind, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) => {
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    const copy = geometry.clone().applyMatrix4(matrix);
    const plain = copy.index ? copy.toNonIndexed() : copy;
    for (const name of Object.keys(plain.attributes)) if (!['position', 'normal', 'uv'].includes(name)) plain.deleteAttribute(name);
    if (!plain.attributes.uv) plain.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(plain.attributes.position.count * 2), 2));
    parts[kind].push(plain);
  };

  // Bệ bát giác hai tầng, viền vàng.
  const baseRadius = h * 0.34;
  add(new THREE.CylinderGeometry(baseRadius, baseRadius * 1.04, h * 0.07, 8), 'bronze', { position: [0, h * 0.035, 0], rotation: [0, Math.PI / 8, 0] });
  add(new THREE.CylinderGeometry(baseRadius * 0.9, baseRadius * 0.92, h * 0.05, 8), 'bronze', { position: [0, h * 0.095, 0], rotation: [0, Math.PI / 8, 0] });
  for (const [y, radius] of [[h * 0.07, baseRadius * 1.0], [h * 0.12, baseRadius * 0.9]]) {
    add(new THREE.TorusGeometry(radius, h * 0.006, 4, 8), 'gold', { position: [0, y, 0], rotation: [Math.PI / 2, 0, Math.PI / 8] });
  }
  let seatY = h * 0.12;
  if (lotus) {
    // Đài sen phát sáng: trống đỡ, hai tầng cánh (ngoài xoè, trong ôm lên), mặt ngồi.
    add(new THREE.CylinderGeometry(baseRadius * 0.62, baseRadius * 0.7, h * 0.04, 24), 'gold', { position: [0, h * 0.14, 0] });
    const petal = new THREE.SphereGeometry(1, 12, 10);
    // Cánh sen: khối cầu dẹt, vuốt nhọn đầu (kéo dài theo z rồi dựng nghiêng ra ngoài).
    const petalPosition = petal.attributes.position;
    for (let index = 0; index < petalPosition.count; index += 1) {
      const narrow = 1 - Math.max(0, petalPosition.getZ(index)) * 0.75;
      petalPosition.setX(index, petalPosition.getX(index) * narrow);
    }
    petal.computeVertexNormals();
    for (const [count, radius, y, tilt, size] of [[20, baseRadius * 0.8, h * 0.175, 1.05, [h * 0.055, h * 0.016, h * 0.085]], [16, baseRadius * 0.64, h * 0.2, 0.7, [h * 0.05, h * 0.015, h * 0.08]]]) {
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2 + (count === 12 ? Math.PI / 12 : 0);
        add(petal, 'glow', { position: [Math.sin(angle) * radius, y, Math.cos(angle) * radius], rotation: [tilt, angle, 0], scale: size });
      }
    }
    seatY = h * 0.235;
    add(new THREE.CylinderGeometry(baseRadius * 0.7, baseRadius * 0.66, h * 0.03, 32), 'gold', { position: [0, seatY - h * 0.015, 0] });
  }

  for (const [kind, geometries] of Object.entries(parts)) {
    if (!geometries.length) continue;
    const mesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geometries), { bronze, gold, glow }[kind]);
    group.add(mesh);
  }

  // Vầng lửa chạm đồng sau thân (mảng dày, mép đỏ cam).
  const statueHeight = h - seatY;
  const mandorlaWidth = h * 0.78;
  const mandorlaHeight = statueHeight * 1.05;
  const shape = mandorlaShape(mandorlaWidth, mandorlaHeight);
  const mandorlaGeometry = new THREE.ExtrudeGeometry(shape, { depth: h * 0.025, bevelEnabled: true, bevelThickness: h * 0.008, bevelSize: h * 0.008, bevelSegments: 2, curveSegments: 6 });
  const uv = mandorlaGeometry.attributes.uv;
  const position = mandorlaGeometry.attributes.position;
  for (let index = 0; index < uv.count; index += 1) uv.setXY(index, position.getX(index) / mandorlaWidth / 1.2 + 0.5, position.getY(index) / (mandorlaHeight * 1.25));
  const mandorla = new THREE.Mesh(mandorlaGeometry, new THREE.MeshStandardMaterial({
    map: mandorlaTexture(), metalness: 0.25, roughness: 0.5, emissive: '#ff7a1a', emissiveMap: mandorlaTexture(), emissiveIntensity: 0.35,
  }));
  // Không lùi quá 0,75 m: phông đỏ sau bàn thờ ở ngay sau tượng.
  mandorla.position.set(0, seatY - h * 0.02, -Math.min(baseRadius * 0.75, 0.75));
  group.add(mandorla);

  // Vòng lửa sau đầu (cộng sáng, không ghi chiều sâu).
  const headY = seatY + statueHeight * 0.86;
  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(statueHeight * 0.42, statueHeight * 0.42),
    new THREE.MeshBasicMaterial({ map: flameRingTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  ring.position.set(0, headY, -Math.min(baseRadius * 0.75, 0.75) + h * 0.05);
  group.add(ring);
  return { group, seatY, statueHeight, headY, ring, glow };
}
