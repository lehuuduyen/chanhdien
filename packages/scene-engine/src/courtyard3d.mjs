// Sân ngoài chùa (chế độ 3D): nền đá lát ô lớn, mặt tiền chánh điện mở cửa (cột son, mái ngói, hoành phi), lư
// hương đồng lớn trên bệ đá với khói, đèn đá hai bên lối, cây đa, tùng, bụi cây, tường gạch thấp có đèn lồng, cổng
// tam quan, bảng vàng công đức, bầu trời và núi xa có sương. Nắng chỉ bật khi camera ở ngoài sân (trong điện giữ ánh
// sáng ấm trầm), có bóng đổ. Bố cục lấy từ scene JSON (world.courtyard), không chứa toạ độ riêng của phòng nào.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { StaticBatch } from './temple3d-models.mjs';
import { buildAnimals } from './animals3d.mjs';
import { hallLayout } from './temple3d-models.mjs';

const MAX_SMOKE = 12;

function canvasTexture(width, height, draw, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  texture.anisotropy = 4;
  return texture;
}

// Đá lát ô vuông 1,5 m: mỗi ô một sắc xám hơi khác, mạch vữa sẫm, vài vết loang.
function stoneTiles(repeat) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#5d5f63';
    ctx.fillRect(0, 0, w, h);
    const cells = 4;
    const size = w / cells;
    for (let row = 0; row < cells; row += 1) {
      for (let column = 0; column < cells; column += 1) {
        const shade = 112 + ((row * 7 + column * 13) % 9) * 5;
        ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 6})`;
        ctx.fillRect(column * size + 3, row * size + 3, size - 6, size - 6);
        for (let spot = 0; spot < 14; spot += 1) {
          ctx.fillStyle = `rgba(${spot % 2 ? 255 : 0}, ${spot % 2 ? 255 : 0}, ${spot % 2 ? 255 : 0}, 0.035)`;
          ctx.beginPath();
          ctx.arc(column * size + ((spot * 53) % size), row * size + ((spot * 97) % size), 6 + (spot % 5) * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, repeat);
}

// Cỏ: nền xanh lốm đốm sáng tối, nhiều nét lá nhỏ. Lặp theo mét (UV của mặt đất tính bằng mét).
function grassTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5b8a3c';
    ctx.fillRect(0, 0, w, h);
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let spot = 0; spot < 40; spot += 1) {
      ctx.fillStyle = random() > 0.5 ? 'rgba(120, 160, 70, 0.25)' : 'rgba(40, 80, 30, 0.22)';
      ctx.beginPath();
      ctx.arc(random() * w, random() * h, 10 + random() * 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 1.4;
    for (let blade = 0; blade < 1400; blade += 1) {
      const x = random() * w;
      const y = random() * h;
      const tone = 70 + Math.floor(random() * 90);
      ctx.strokeStyle = `rgba(${tone - 30}, ${tone + 50}, ${tone - 40}, 0.55)`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 3, y - 3 - random() * 5);
      ctx.stroke();
    }
  }, [0.25, 0.25]);
}

// Mặt phẳng ngang (hình chữ nhật, có thể khoét lỗ elip cho hồ) với UV tính bằng mét.
function groundShape(rect, holes = [], y = 0) {
  const shape = new THREE.Shape();
  // Toạ độ hình: (x, -z) vì sau khi xoay -90° quanh x, trục y của hình thành -z của thế giới.
  shape.moveTo(rect.x[0], -rect.z[1]);
  shape.lineTo(rect.x[1], -rect.z[1]);
  shape.lineTo(rect.x[1], -rect.z[0]);
  shape.lineTo(rect.x[0], -rect.z[0]);
  shape.lineTo(rect.x[0], -rect.z[1]);
  for (const hole of holes) {
    const path = new THREE.Path();
    path.absellipse(hole.x, -hole.z, hole.rx, hole.rz, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }
  const geometry = new THREE.ShapeGeometry(shape, 48);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

// Hình cá chép (koi) nhỏ: thân thoi, đuôi xoè, hai vây; đầu hướng +z. Một geometry cho InstancedMesh.
function koiGeometry() {
  const body = new THREE.SphereGeometry(1, 12, 8);
  body.scale(0.075, 0.055, 0.24);
  const tail = new THREE.ConeGeometry(0.09, 0.16, 4);
  tail.rotateX(-Math.PI / 2);
  tail.scale(1, 0.25, 1);
  tail.translate(0, 0, -0.3);
  const fins = [-1, 1].map((side) => {
    const fin = new THREE.ConeGeometry(0.04, 0.1, 3);
    fin.rotateZ(side * Math.PI / 2);
    fin.scale(1, 0.2, 1);
    fin.translate(side * 0.1, -0.01, 0.05);
    return fin;
  });
  const merged = BufferGeometryUtils.mergeGeometries([body, tail, ...fins].map((item) => {
    const plain = item.index ? item.toNonIndexed() : item;
    for (const name of Object.keys(plain.attributes)) if (!['position', 'normal'].includes(name)) plain.deleteAttribute(name);
    return plain;
  }));
  return merged;
}

function sunDirection(data) {
  const value = data.sun?.direction;
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) ? value : [10, 18, 16];
}

// Bóng tĩnh nướng vào một texture trong suốt: điện thoại vẫn thấy cột, đèn, cây, lư hương và cổng có bóng mà
// không cần vẽ lại toàn bộ cảnh vào shadow map. Tất cả vị trí lấy từ world.courtyard.
function bakedCourtyardShadows(data) {
  const { ground } = data;
  return canvasTexture(1024, 768, (ctx, width, height) => {
    const unitX = width / (ground.x[1] - ground.x[0]);
    const unitZ = height / (ground.z[1] - ground.z[0]);
    const unit = (unitX + unitZ) / 2;
    const [sunX, sunY, sunZ] = sunDirection(data);
    const point = (x, z) => ({ x: (x - ground.x[0]) * unitX, y: (ground.z[1] - z) * unitZ });
    const offset = (objectHeight) => ({ x: (-sunX / Math.max(1, sunY)) * objectHeight, z: (-sunZ / Math.max(1, sunY)) * objectHeight });
    const color = (opacity) => `rgba(17, 24, 20, ${opacity})`;

    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.filter = 'blur(7px)';
    const pole = (x, z, objectHeight, radius, opacity = 0.36) => {
      const projected = offset(objectHeight);
      const from = point(x, z);
      const to = point(x + projected.x, z + projected.z);
      ctx.strokeStyle = color(opacity);
      ctx.lineWidth = Math.max(5, radius * 2 * unit);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    };
    const segment = (x0, z0, x1, z1, objectHeight, thickness, opacity = 0.26) => {
      const projected = offset(objectHeight);
      const points = [point(x0, z0), point(x1, z1), point(x1 + projected.x, z1 + projected.z), point(x0 + projected.x, z0 + projected.z)];
      ctx.fillStyle = color(opacity);
      ctx.strokeStyle = color(opacity);
      ctx.lineWidth = Math.max(3, thickness * unit);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const item of points.slice(1)) ctx.lineTo(item.x, item.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    const frontZ = ground.z[0];
    const facade = data.facade || { width: 13.6, height: 10.9 };
    segment(-facade.width / 2, frontZ, facade.width / 2, frontZ, facade.height, 0.45, 0.24);
    for (const [x, z] of data.porchPillars || []) pole(x, z, 5.5, 0.3, 0.4);
    pole(data.burner.x, data.burner.z, 2.8, 0.75, 0.46);
    for (const [x, z] of data.lanterns || []) pole(x, z, 1.8, 0.28, 0.42);
    for (const tree of data.trees || []) pole(tree.x, tree.z, 5.5 * (tree.size || 1), 1.45 * (tree.size || 1), 0.42);
    for (const [x, z] of data.pines || []) pole(x, z, 4.2, 0.8, 0.36);
    for (const [x, z] of data.bushes || []) pole(x, z, 0.9, 0.65, 0.16);
    for (const item of data.instruments || []) pole(item.x, item.z, 2.5 * (item.scale || 1), 0.72 * (item.scale || 1), 0.4);
    for (const item of data.arhats || []) pole(item.x, item.z, 1.7 * (item.scale || 1), 0.55 * (item.scale || 1), 0.26);
    for (const item of data.planters || []) pole(item.x, item.z, 1.25, 0.42, 0.22);
    for (const item of data.benches || []) pole(item.x, item.z, 1.25 * (item.scale || 1), 1.05 * (item.scale || 1), 0.2);
    // Cây công trình đổi kích thước theo tiến độ nên dùng bóng thật của mesh, không nướng bóng cây hoàn chỉnh từ đầu.
    if (data.bodhi && !data.bodhi.projectId) pole(data.bodhi.x, data.bodhi.z, 7.5 * (data.bodhi.size || 1), 2.2 * (data.bodhi.size || 1), 0.42);
    if (data.guanyin) pole(data.guanyin.x, data.guanyin.z, 4.1 * (data.guanyin.scale || 1), 1.2 * (data.guanyin.scale || 1), 0.38);
    if (data.fountain) pole(data.fountain.x, data.fountain.z, 2.2, data.fountain.radius || 2.6, 0.18);
    const wallX = ground.x[1] - 0.2;
    for (const side of [-1, 1]) segment(side * wallX, frontZ, side * wallX, ground.z[1], 1.5, 0.4, 0.18);
    if (data.gate) {
      const boundaries = new Set();
      for (const opening of data.gate.openings || [{ x: -2.4, width: 1.6 }, { x: 0, width: 3.2 }, { x: 2.4, width: 1.6 }]) {
        boundaries.add(opening.x - opening.width / 2);
        boundaries.add(opening.x + opening.width / 2);
      }
      for (const x of boundaries) pole(x, data.gate.z, 4.9, 0.32, 0.3);
      segment(-3.8, data.gate.z, 3.8, data.gate.z, 5.1, 0.5, 0.2);
    }
    if (data.board) {
      pole(data.board.x - 0.85, data.board.z, 2.2, 0.09, 0.2);
      pole(data.board.x + 0.85, data.board.z, 2.2, 0.09, 0.2);
    }
    ctx.filter = 'none';
  });
}

function groundPlane(ground, y) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    ground.x[0], y, ground.z[0], ground.x[1], y, ground.z[0],
    ground.x[1], y, ground.z[1], ground.x[0], y, ground.z[1],
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function bricks(repeat) {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#6f2a1c';
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row += 1) {
      for (let column = -1; column < 5; column += 1) {
        const x = column * 64 + (row % 2) * 32;
        ctx.fillStyle = `rgb(${150 + ((row * 3 + column) % 4) * 8}, ${62 + (column % 3) * 4}, 44)`;
        ctx.fillRect(x + 2, row * 16 + 2, 60, 12);
      }
    }
  }, repeat);
}

function textBoard(text, { width = 1024, height = 256, background = '#7a1414', color = '#f3c969', border = '#d9a441' } = {}) {
  return canvasTexture(width, height, (ctx, w, h) => {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = border;
    ctx.lineWidth = 14;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.round(h * 0.42)}px "Noto Serif", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4, w - 60);
  });
}

function softDot(color) {
  return canvasTexture(64, 64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function lathe(points, segments = 28) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

// Mái ngói hai dốc phủ cả chánh điện, đầu đao cong vàng ở bốn góc.
function addRoof(batch, m, { x0, x1, z0, z1, y, rise }) {
  const width = x1 - x0;
  const depth = z1 - z0;
  const slope = Math.hypot(depth / 2, rise);
  const angle = Math.atan2(rise, depth / 2);
  for (const side of [-1, 1]) {
    batch.add(new THREE.BoxGeometry(width + 1.2, 0.18, slope + 0.6), m.roof, {
      position: [(x0 + x1) / 2, y + rise / 2, (z0 + z1) / 2 + side * depth / 4],
      rotation: [side * angle, 0, 0],
    });
  }
  batch.add(new THREE.BoxGeometry(width + 1.6, 0.22, 0.32), m.gold, { position: [(x0 + x1) / 2, y + rise + 0.08, (z0 + z1) / 2] });
  for (const x of [x0 - 0.6, x1 + 0.6]) {
    for (const z of [z0 - 0.3, z1 + 0.3]) {
      batch.add(new THREE.ConeGeometry(0.12, 0.7, 8), m.gold, { position: [x, y + 0.35, z], rotation: [0, 0, x < 0 ? 0.6 : -0.6] });
    }
  }
}

// Đại hồng chung và trống hai bên thềm. Vị trí nằm trong scene JSON; hình khối dùng chung batch để không tăng
// draw call theo từng bộ phận.
function addInstrument(batch, m, item) {
  const size = item.scale || 1;
  const { x, z } = item;
  const woodPost = (postZ) => {
    batch.add(new THREE.BoxGeometry(0.2 * size, 2.2 * size, 0.2 * size), m.wood, {
      position: [x, 1.1 * size, z + postZ * size],
    });
    batch.add(new THREE.BoxGeometry(0.38 * size, 0.12 * size, 0.38 * size), m.darkStone, {
      position: [x, 0.06 * size, z + postZ * size],
    });
  };
  woodPost(-0.68);
  woodPost(0.68);
  batch.add(new THREE.BoxGeometry(0.24 * size, 0.2 * size, 1.7 * size), m.wood, {
    position: [x, 2.18 * size, z],
  });
  for (const postZ of [-0.68, 0.68]) {
    batch.add(new THREE.ConeGeometry(0.2 * size, 0.34 * size, 4), m.gold, {
      position: [x, 2.44 * size, z + postZ * size], rotation: [0, Math.PI / 4, 0],
    });
  }
  if (item.type === 'bell') {
    batch.add(new THREE.CylinderGeometry(0.035 * size, 0.035 * size, 0.48 * size, 8), m.gold, {
      position: [x, 1.92 * size, z],
    });
    batch.add(new THREE.ConeGeometry(0.43 * size, 0.82 * size, 20, 1, true), m.bronze, {
      position: [x, 1.34 * size, z],
    });
    batch.add(new THREE.TorusGeometry(0.43 * size, 0.045 * size, 8, 24), m.gold, {
      position: [x, 0.93 * size, z], rotation: [Math.PI / 2, 0, 0],
    });
    batch.add(new THREE.SphereGeometry(0.1 * size, 10, 8), m.bronze, {
      position: [x, 0.8 * size, z],
    });
    return;
  }
  if (item.type === 'drum') {
    batch.add(new THREE.CylinderGeometry(0.56 * size, 0.56 * size, 0.86 * size, 24), m.pillar, {
      position: [x, 1.28 * size, z], rotation: [0, 0, Math.PI / 2],
    });
    for (const side of [-1, 1]) {
      batch.add(new THREE.TorusGeometry(0.56 * size, 0.045 * size, 8, 24), m.gold, {
        position: [x + side * 0.44 * size, 1.28 * size, z], rotation: [0, Math.PI / 2, 0],
      });
    }
    for (let stud = 0; stud < 12; stud += 1) {
      const angle = (stud / 12) * Math.PI * 2;
      batch.add(new THREE.SphereGeometry(0.035 * size, 6, 5), m.gold, {
        position: [x - 0.45 * size, (1.28 + Math.sin(angle) * 0.47) * size, z + Math.cos(angle) * 0.47 * size],
      });
    }
  }
}

function localTransform(item, local, size = item.scale || 1) {
  const ry = item.ry || 0;
  const [lx, ly, lz] = local;
  return [
    item.x + (lx * Math.cos(ry) + lz * Math.sin(ry)) * size,
    ly * size,
    item.z + (-lx * Math.sin(ry) + lz * Math.cos(ry)) * size,
  ];
}

// Mặt tượng La Hán: mắt khép, chân mày rậm, miệng mỉm (mỗi vị dùng chung, khác nhau ở tư thế và vật cầm).
function arhatFaceTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.strokeStyle = 'rgba(60, 40, 22, 0.85)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    for (const x of [92, 164]) {
      ctx.beginPath();
      ctx.moveTo(x - 26, 98);
      ctx.quadraticCurveTo(x, 84, x + 26, 98);
      ctx.stroke();
    }
    ctx.lineWidth = 6;
    for (const x of [92, 164]) {
      ctx.beginPath();
      ctx.arc(x, 112, 16, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(128, 160, 22, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  });
}

// Tượng La Hán ngồi kiết già trên bệ đá: thân áo liền một khối, chân xếp bằng, đầu có tai dài và mặt; mỗi vị một
// tư thế / vật cầm (bình bát, tràng hạt, tích trượng, cuốn kinh, tay bắt ấn) theo thứ tự trong scene, xen màu đá và
// đồng. Mặt quay về +z cục bộ (hướng ry trong scene). Gộp tất cả vào batch theo vật liệu.
function addArhat(batch, m, item, index = 0) {
  const size = item.scale || 1;
  const body = index % 3 === 1 ? m.bronze : m.arhatStone;
  const place = (geometry, material, local, options = {}) => batch.add(geometry, material, {
    position: localTransform(item, local, size),
    rotation: [options.rx || 0, (item.ry || 0) + (options.ry || 0), options.rz || 0],
    scale: options.scale || [size, size, size],
  });
  // Bệ đá hai tầng.
  place(new THREE.BoxGeometry(1.2, 0.3, 1.0), m.darkStone, [0, 0.15, 0]);
  place(new THREE.BoxGeometry(1.05, 0.12, 0.88), m.stone, [0, 0.36, 0]);
  // Chân xếp bằng phủ vạt áo và thân áo liền khối.
  place(new THREE.CapsuleGeometry(0.17, 0.62, 6, 12), body, [0, 0.58, 0.12], { rz: Math.PI / 2, scale: [size, size, size * 0.95] });
  place(lathe([[0, 0], [0.44, 0], [0.42, 0.14], [0.33, 0.34], [0.3, 0.62], [0.33, 0.78], [0.24, 0.9], [0.1, 0.96], [0, 0.96]], 18), body, [0, 0.46, -0.02], { scale: [size, size, size * 0.82] });
  // Đầu tròn, tai dài, mặt.
  place(new THREE.SphereGeometry(0.21, 16, 12), body, [0, 1.62, 0]);
  place(new THREE.SphereGeometry(0.212, 18, 10, Math.PI * 1.5 - Math.PI / 3, (Math.PI * 2) / 3, Math.PI * 0.3, Math.PI * 0.42), m.arhatFace, [0, 1.62, 0], { ry: Math.PI });
  for (const side of [-1, 1]) place(new THREE.CapsuleGeometry(0.035, 0.12, 4, 8), body, [side * 0.21, 1.58, -0.01]);
  // Tay theo tư thế.
  const pose = index % 5;
  const arm = (side, local, rx, rz) => place(new THREE.CapsuleGeometry(0.07, 0.34, 4, 8), body, local.map((value, axis) => (axis === 0 ? value * side : value)), { rx, rz: rz * side });
  if (pose === 0) {
    // Thiền định: hai tay đặt trong lòng, bình bát.
    arm(-1, [0.2, 0.98, 0.18], 1.1, 0.4);
    arm(1, [0.2, 0.98, 0.18], 1.1, 0.4);
    place(lathe([[0, 0], [0.1, 0], [0.16, 0.08], [0.15, 0.12], [0, 0.1]], 14), m.darkStone, [0, 0.82, 0.32]);
  } else if (pose === 1) {
    // Lần tràng hạt trước ngực.
    arm(-1, [0.2, 1.1, 0.15], 1.35, 0.3);
    arm(1, [0.2, 1.1, 0.15], 1.35, 0.3);
    place(new THREE.TorusGeometry(0.13, 0.025, 6, 20), m.wood, [0, 1.12, 0.32], { rx: 0.3 });
  } else if (pose === 2) {
    // Cầm tích trượng tay phải.
    arm(-1, [0.2, 0.98, 0.18], 1.1, 0.4);
    arm(1, [0.26, 1.2, 0.1], 0.2, 0.2);
    place(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 6), m.gold, [0.34, 1.35, 0.18]);
    place(new THREE.TorusGeometry(0.1, 0.018, 6, 16), m.gold, [0.34, 2.35, 0.18]);
  } else if (pose === 3) {
    // Đọc cuốn kinh mở trên tay.
    arm(-1, [0.18, 1.02, 0.2], 1.3, 0.35);
    arm(1, [0.18, 1.02, 0.2], 1.3, 0.35);
    place(new THREE.BoxGeometry(0.34, 0.03, 0.24), m.paper, [0, 1.06, 0.36], { rx: -0.5 });
  } else {
    // Tay phải giơ bắt ấn thí vô úy, tay trái đặt gối.
    arm(-1, [0.24, 0.92, 0.2], 0.9, 0.5);
    arm(1, [0.3, 1.3, 0.1], -0.2, -0.25);
    place(new THREE.SphereGeometry(0.07, 10, 8), body, [0.33, 1.52, 0.14], { scale: [size * 0.8, size * 1.2, size * 0.5] });
  }
}

function addBench(batch, m, item) {
  const size = item.scale || 1;
  const place = (geometry, local) => batch.add(geometry, m.stone, {
    position: localTransform(item, local, size), rotation: [0, item.ry || 0, 0], scale: [size, size, size],
  });
  place(new THREE.BoxGeometry(2.2, 0.18, 0.68), [0, 0.62, 0]);
  place(new THREE.BoxGeometry(2.2, 0.65, 0.14), [0, 0.9, -0.28]);
  place(new THREE.BoxGeometry(0.22, 0.55, 0.52), [-0.75, 0.3, 0]);
  place(new THREE.BoxGeometry(0.22, 0.55, 0.52), [0.75, 0.3, 0]);
}

// Đất luống có rãnh vun: nền nâu, các luống đất sáng tối xen nhau.
function soilTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#5b3a22';
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 6; row += 1) {
      const y = (row + 0.5) * (h / 6);
      ctx.fillStyle = 'rgba(122, 82, 50, 0.85)';
      ctx.fillRect(0, y - 6, w, 8);
      ctx.fillStyle = 'rgba(40, 24, 12, 0.6)';
      ctx.fillRect(0, y + 3, w, 3);
    }
    for (let dot = 0; dot < 160; dot += 1) {
      ctx.fillStyle = dot % 2 ? 'rgba(150, 110, 70, 0.4)' : 'rgba(30, 18, 8, 0.35)';
      ctx.fillRect((dot * 53) % w, (dot * 97) % h, 2, 2);
    }
  });
}

// Sỏi kem: nền sáng, nhiều viên sỏi nhỏ sắc độ khác nhau. Lặp 0,5 lần mỗi mét.
function gravelTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e4d6b4';
    ctx.fillRect(0, 0, w, h);
    let seed = 11;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let stone = 0; stone < 900; stone += 1) {
      const tone = 170 + Math.floor(random() * 70);
      ctx.fillStyle = `rgb(${tone}, ${tone - 10}, ${tone - 34})`;
      ctx.beginPath();
      ctx.ellipse(random() * w, random() * h, 1.5 + random() * 3, 1.2 + random() * 2.4, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [9, 5]);
}

// Số luống 1–10 trên nền gỗ, xếp ngang trong một texture (mỗi ô một số).
function plotNumberTexture() {
  return canvasTexture(640, 64, (ctx, w, h) => {
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff3d6';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let index = 0; index < 10; index += 1) ctx.fillText(String(index + 1), (index + 0.5) * (w / 10), h / 2 + 2);
  });
}

// Vườn Công Đức (world.courtyard.garden): luống đất viền gỗ, cổng gỗ có biển tên, quầy hạt giống có mái. Cây trồng
// trên luống thay đổi theo dữ liệu thật nên dựng riêng ở garden3d.mjs; ở đây chỉ là phần tĩnh + mesh ẩn để chạm.
function addGarden(batch, m, garden, pickables, root, signs) {
  const bed = garden.bed || 2.6;
  // Mái hai tấm dọc theo trục x cục bộ của công trình (xoay theo ry), nóc mạ vàng.
  const gableRoof = (item, length, depth, y) => {
    for (const side of [-1, 1]) {
      const board = new THREE.BoxGeometry(length, 0.12, depth / 2 + 0.15);
      board.rotateX(side * 0.5);
      board.translate(0, 0, side * depth / 4);
      batch.add(board, m.roof, { position: localTransform({ ...item, scale: 1 }, [0, y, 0]), rotation: [0, item.ry || 0, 0] });
    }
    batch.add(new THREE.BoxGeometry(length + 0.2, 0.12, 0.16), m.gold, { position: localTransform({ ...item, scale: 1 }, [0, y + depth * 0.14, 0]), rotation: [0, item.ry || 0, 0] });
  };
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  // Khung bao khu trồng (theo hàng rào; không có rào thì theo các luống).
  const points = (garden.fence || []).flatMap(([x0, z0, x1, z1]) => [[x0, z0], [x1, z1]]);
  if (!points.length) for (const plot of garden.plots || []) points.push([plot.x - bed, plot.z - bed], [plot.x + bed, plot.z + bed]);
  const box = points.length ? {
    x: [Math.min(...points.map((p) => p[0])), Math.max(...points.map((p) => p[0]))],
    z: [Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[1]))],
  } : null;
  const gate = garden.entrance;
  if (box) {
    // Nền sỏi kem trong rào.
    const gravel = new THREE.PlaneGeometry(box.x[1] - box.x[0], box.z[1] - box.z[0]);
    gravel.rotateX(-Math.PI / 2);
    batch.add(gravel, m.gravel, { position: [(box.x[0] + box.x[1]) / 2, 0.004, (box.z[0] + box.z[1]) / 2] });
    // Đá bước dọc lối giữa hai hàng luống, từ cổng vào.
    if (gate) {
      for (let x = box.x[0] + 0.5, index = 0; x < box.x[1] - 0.3; x += 0.75, index += 1) {
        batch.add(new THREE.CylinderGeometry(0.26, 0.28, 0.06, 9), m.darkStone, {
          position: [x, 0.03, gate.z + (index % 2 ? 0.16 : -0.16)], rotation: [0, index * 0.7, 0], scale: [1 + (index % 3) * 0.12, 1, 0.85],
        });
      }
    }
    // Đèn đá bốn góc; hoa dọc chân rào (tránh khoảng cổng).
    for (const [x, z] of [[box.x[0] + 0.45, box.z[0] + 0.45], [box.x[1] - 0.45, box.z[0] + 0.45], [box.x[0] + 0.45, box.z[1] - 0.45], [box.x[1] - 0.45, box.z[1] - 0.45]]) {
      if (garden.barrel && Math.hypot(garden.barrel.x - x, garden.barrel.z - z) < 0.8) continue;
      batch.add(new THREE.BoxGeometry(0.34, 0.12, 0.34), m.darkStone, { position: [x, 0.06, z] });
      batch.add(new THREE.CylinderGeometry(0.07, 0.09, 0.55, 8), m.stone, { position: [x, 0.4, z] });
      batch.add(new THREE.BoxGeometry(0.26, 0.22, 0.26), m.paper, { position: [x, 0.78, z] });
      batch.add(new THREE.ConeGeometry(0.28, 0.2, 4), m.darkStone, { position: [x, 0.98, z], rotation: [0, Math.PI / 4, 0] });
    }
    const blooms = [m.flowerPink, m.flowerYellow, m.flowerViolet];
    let bloom = 0;
    for (const [x0, z0, x1, z1] of garden.fence || []) {
      const length = Math.hypot(x1 - x0, z1 - z0);
      for (let t = 0.9; t < length - 0.6; t += 1.3) {
        const k = t / length;
        // Lùi vào trong rào 0,35 m.
        const x = x0 + (x1 - x0) * k + Math.sign(((box.x[0] + box.x[1]) / 2) - x0) * (x1 === x0 ? 0.35 : 0);
        const z = z0 + (z1 - z0) * k + Math.sign(((box.z[0] + box.z[1]) / 2) - z0) * (z1 === z0 ? 0.35 : 0);
        batch.add(new THREE.IcosahedronGeometry(0.2, 0), m.leaf, { position: [x, 0.16, z], scale: [1.2, 0.8, 1.2] });
        for (const [dx, dz] of [[-0.08, 0.05], [0.09, -0.04], [0, 0.1]]) {
          batch.add(new THREE.SphereGeometry(0.06, 6, 5), blooms[bloom % blooms.length], { position: [x + dx, 0.32, z + dz] });
        }
        bloom += 1;
      }
    }
  }
  // Thùng nước gỗ có gáo.
  if (garden.barrel) {
    const { x, z } = garden.barrel;
    batch.add(new THREE.CylinderGeometry(0.3, 0.27, 0.62, 14), m.wood, { position: [x, 0.31, z] });
    for (const y of [0.12, 0.5]) batch.add(new THREE.TorusGeometry(0.29, 0.02, 5, 18), m.darkStone, { position: [x, y, z], rotation: [Math.PI / 2, 0, 0] });
    batch.add(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 14), m.water, { position: [x, 0.58, z] });
    batch.add(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 5), m.wood, { position: [x + 0.12, 0.72, z], rotation: [0, 0, -0.6] });
    batch.add(new THREE.SphereGeometry(0.07, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.wood, { position: [x + 0.28, 0.95, z] });
  }
  // Biển số luống: một texture ghép (số 1–10) cho mọi biển, gộp chung một lượt vẽ.
  const signPlane = (id) => {
    const plane = new THREE.PlaneGeometry(0.42, 0.26);
    const uv = plane.attributes.uv;
    const cell = (id - 1) % 10;
    for (let index = 0; index < uv.count; index += 1) uv.setX(index, (cell + uv.getX(index)) / 10);
    return plane;
  };
  for (const plot of garden.plots || []) {
    // Đất có rãnh (texture), viền gỗ sáng, cột góc có mũ.
    batch.add(new THREE.BoxGeometry(bed, 0.22, bed), m.soil, { position: [plot.x, 0.11, plot.z] });
    for (const [dx, dz, w, d] of [[0, -bed / 2, bed + 0.2, 0.14], [0, bed / 2, bed + 0.2, 0.14], [-bed / 2, 0, 0.14, bed], [bed / 2, 0, 0.14, bed]]) {
      batch.add(new THREE.BoxGeometry(w, 0.3, d), m.fence, { position: [plot.x + dx, 0.15, plot.z + dz] });
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      batch.add(new THREE.BoxGeometry(0.2, 0.38, 0.2), m.wood, { position: [plot.x + sx * bed / 2, 0.19, plot.z + sz * bed / 2] });
    }
    // Biển số quay ra lối đi giữa hai hàng luống.
    const toward = gate ? Math.sign(gate.z - plot.z) || 1 : 1;
    const signZ = plot.z + toward * (bed / 2 + 0.22);
    batch.add(new THREE.BoxGeometry(0.05, 0.55, 0.05), m.wood, { position: [plot.x - bed / 2 + 0.35, 0.28, signZ] });
    batch.add(new THREE.BoxGeometry(0.48, 0.32, 0.04), m.wood, { position: [plot.x - bed / 2 + 0.35, 0.6, signZ] });
    batch.add(signPlane(plot.id), m.plotNumbers, {
      position: [plot.x - bed / 2 + 0.35, 0.6, signZ + toward * 0.025], rotation: [0, toward > 0 ? 0 : Math.PI, 0],
    });
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(bed, 1.6, bed), proxyMaterial);
    proxy.position.set(plot.x, 0.8, plot.z);
    proxy.userData.gardenPlot = plot.id;
    root.add(proxy);
    pickables.push(proxy);
  }
  // Hàng rào gỗ quanh khu trồng: cọc đầu nhọn cách nhau ~0,5 m, hai thanh ngang (gộp vào batch, không thêm lệnh vẽ).
  for (const [x0, z0, x1, z1] of garden.fence || []) {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const angle = Math.atan2(x1 - x0, z1 - z0);
    const count = Math.max(1, Math.round(length / 0.5));
    for (let index = 0; index <= count; index += 1) {
      const x = x0 + ((x1 - x0) * index) / count;
      const z = z0 + ((z1 - z0) * index) / count;
      batch.add(new THREE.BoxGeometry(0.09, 0.85, 0.05), m.fence, { position: [x, 0.43, z], rotation: [0, angle, 0] });
      batch.add(new THREE.ConeGeometry(0.065, 0.14, 4), m.fence, { position: [x, 0.92, z], rotation: [0, angle + Math.PI / 4, 0] });
    }
    for (const y of [0.32, 0.68]) {
      batch.add(new THREE.BoxGeometry(0.04, 0.07, length), m.wood, { position: [(x0 + x1) / 2, y, (z0 + z1) / 2], rotation: [0, angle, 0] });
    }
  }
  // Cổng gỗ: hai cột, xà ngang, mái nhỏ, biển tên (rộng theo entrance.width).
  if (gate) {
    const half = (gate.width || 3.8) / 2;
    const at = (local) => localTransform({ ...gate, scale: 1 }, local);
    for (const side of [-1, 1]) {
      batch.add(new THREE.CylinderGeometry(0.14, 0.18, 2.8, 10), m.pillar, { position: at([side * half, 1.4, 0]) });
      batch.add(new THREE.CylinderGeometry(0.26, 0.3, 0.22, 8), m.stone, { position: at([side * half, 0.11, 0]) });
    }
    batch.add(new THREE.BoxGeometry(half * 2 + 0.7, 0.2, 0.28), m.wood, { position: at([0, 2.75, 0]), rotation: [0, gate.ry || 0, 0] });
    gableRoof(gate, half * 2 + 1, 1.1, 2.98);
    signs.push({ text: garden.sign || '', position: at([0, 2.35, -0.16]), ry: (gate.ry || 0) + Math.PI, width: Math.min(2.6, half * 2 - 0.2) });
  }
  // Quầy hạt giống: mặt quầy, mái che, kệ hạt nhiều màu, biển tên.
  const shop = garden.shop;
  if (shop) {
    const at = (local) => localTransform({ ...shop, scale: 1 }, local);
    const turn = [0, shop.ry || 0, 0];
    batch.add(new THREE.BoxGeometry(2.2, 0.95, 0.8), m.wood, { position: at([0, 0.48, 0]), rotation: turn });
    batch.add(new THREE.BoxGeometry(2.4, 0.06, 0.95), m.stone, { position: at([0, 0.98, 0]), rotation: turn });
    for (const side of [-1, 1]) batch.add(new THREE.BoxGeometry(0.1, 2.3, 0.1), m.wood, { position: at([side * 1.1, 1.15, 0.45]), rotation: turn });
    gableRoof(shop, 2.8, 1.6, 2.4);
    [m.lantern, m.flowerYellow, m.flowerPink, m.leaf].forEach((material, index) => {
      batch.add(new THREE.BoxGeometry(0.34, 0.22, 0.3), material, { position: at([-0.75 + index * 0.5, 1.13, 0.1]), rotation: turn });
    });
    signs.push({ text: garden.shopSign || '', position: at([0, 1.85, -0.5]), ry: (shop.ry || 0) + Math.PI, width: 1.8 });
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 1.2), proxyMaterial);
    proxy.position.set(...at([0, 1.2, 0]));
    proxy.rotation.y = shop.ry || 0;
    proxy.userData.gardenShop = true;
    root.add(proxy);
    pickables.push(proxy);
  }
}

// Bảng gỗ mô tả đặt trước mỗi khu. Tọa độ, góc xoay và nội dung đều lấy từ scene JSON; mesh ẩn chỉ dùng raycast
// để mở lại hướng dẫn, còn va chạm do world.walk.obstacles của cảnh quyết định.
function addGuideBoard(batch, m, item, pickables, root, signs) {
  const width = item.width || 2.2;
  const height = item.height || 1.15;
  const ry = item.ry || 0;
  const at = (local) => localTransform({ ...item, scale: 1 }, local);
  for (const side of [-1, 1]) {
    batch.add(new THREE.CylinderGeometry(0.08, 0.11, 1.75, 8), m.wood, {
      position: at([side * width * 0.42, 0.88, 0]), rotation: [0, ry, 0],
    });
    batch.add(new THREE.ConeGeometry(0.13, 0.16, 4), m.gold, {
      position: at([side * width * 0.42, 1.83, 0]), rotation: [0, ry + Math.PI / 4, 0],
    });
  }
  batch.add(new THREE.BoxGeometry(width + 0.16, height + 0.16, 0.13), m.wood, {
    position: at([0, 1.24, 0]), rotation: [0, ry, 0],
  });
  signs.push({
    text: item.sign || '', position: at([0, 1.24, -0.075]), ry: ry + Math.PI, width, height,
  });

  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.3, 2.05, 0.42),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  proxy.position.set(...at([0, 1.03, 0]));
  proxy.rotation.y = ry;
  proxy.userData.zoneGuide = item.id;
  root.add(proxy);
  pickables.push(proxy);
}

// Mặt tượng Quan Âm: mắt khép nhìn xuống, chân mày cong dài, bạch hào, môi mỉm (vẽ canvas, nét xám nhạt trên đá trắng).
function guanyinFaceTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.strokeStyle = 'rgba(120, 112, 100, 0.85)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    for (const x of [92, 164]) {
      ctx.beginPath();
      ctx.arc(x, 112, 26, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, 122, 18, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(200, 150, 90, 0.9)';
    ctx.beginPath();
    ctx.arc(128, 96, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(124, 150);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(170, 110, 100, 0.85)';
    ctx.beginPath();
    ctx.arc(128, 160, 13, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  });
}

// Tượng Quan Âm trắng đứng trên đài sen: áo liền một khối thon từ chân lên vai, khăn trùm, tay trái tịnh bình,
// tay phải cành dương liễu, hào quang sau đầu. Mặt tượng quay về +z cục bộ (hướng ry trong scene).
function addGuanyin(batch, m, item) {
  const size = item.scale || 1;
  const place = (geometry, material, local, options = {}) => batch.add(geometry, material, {
    position: localTransform(item, local, size),
    rotation: [options.rx || 0, (item.ry || 0) + (options.ry || 0), options.rz || 0],
    scale: options.scale || [size, size, size],
  });
  // Bệ đá và đài sen hai tầng cánh.
  place(new THREE.CylinderGeometry(1.12, 1.28, 0.42, 24), m.stone, [0, 0.21, 0]);
  place(new THREE.CylinderGeometry(0.88, 1.04, 0.34, 20), m.whiteStone, [0, 0.58, 0]);
  for (let tier = 0; tier < 2; tier += 1) {
    for (let petal = 0; petal < 12; petal += 1) {
      const angle = ((petal + tier * 0.5) / 12) * Math.PI * 2;
      const r = 0.74 - tier * 0.18;
      place(new THREE.SphereGeometry(0.24, 10, 7), m.whiteStone, [Math.cos(angle) * r, 0.78 + tier * 0.12, Math.sin(angle) * r], {
        scale: [size * 0.62, size * 0.32, size * 1.15], ry: -angle,
      });
    }
  }
  // Áo: một khối tiện liền từ chân (vạt xòe) lên eo, ngực, vai.
  place(lathe([[0, 0], [0.62, 0], [0.6, 0.12], [0.5, 0.6], [0.42, 1.2], [0.36, 1.6], [0.38, 1.85], [0.41, 2.05], [0.36, 2.22], [0.2, 2.32], [0.11, 2.36], [0, 2.36]], 26), m.whiteStone, [0, 0.9, 0], { scale: [size, size, size * 0.82] });
  // Đường xếp nếp áo dọc thân.
  for (const x of [-0.18, 0.02, 0.2]) {
    place(new THREE.CylinderGeometry(0.018, 0.03, 1.3, 6), m.whiteStone, [x, 1.65, 0.42 - Math.abs(x) * 0.4]);
  }
  // Cổ, đầu, mặt, búi tóc, khăn trùm buông vai.
  place(new THREE.CylinderGeometry(0.09, 0.11, 0.18, 12), m.whiteStone, [0, 3.32, 0]);
  place(new THREE.SphereGeometry(0.27, 20, 16), m.whiteStone, [0, 3.58, 0], { scale: [size * 0.92, size * 1.08, size * 0.95] });
  place(new THREE.SphereGeometry(0.272, 24, 12, Math.PI * 1.5 - Math.PI / 3, (Math.PI * 2) / 3, Math.PI * 0.3, Math.PI * 0.42), m.guanyinFace, [0, 3.58, 0], {
    scale: [size * 0.92, size * 1.08, size * 0.95], ry: Math.PI,
  });
  place(new THREE.SphereGeometry(0.13, 14, 10), m.whiteStone, [0, 3.9, -0.04], { scale: [size * 0.85, size * 1.25, size * 0.85] });
  place(new THREE.SphereGeometry(0.31, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), m.whiteStone, [0, 3.63, -0.06], { scale: [size * 1.02, size * 1.12, size] });
  place(lathe([[0, 0], [0.44, 0], [0.34, 0.45], [0.27, 0.62], [0, 0.66]], 20), m.whiteStone, [0, 2.88, -0.1], { scale: [size * 1.05, size, size * 0.7] });
  // Tay: cánh tay áo rủ, tay trái nâng tịnh bình trước ngực, tay phải cầm cành dương liễu.
  place(new THREE.CapsuleGeometry(0.1, 0.62, 4, 10), m.whiteStone, [-0.4, 2.72, 0.06], { rz: -0.32 });
  place(new THREE.CapsuleGeometry(0.1, 0.62, 4, 10), m.whiteStone, [0.4, 2.72, 0.06], { rz: 0.32 });
  place(new THREE.CapsuleGeometry(0.085, 0.36, 4, 10), m.whiteStone, [-0.36, 2.38, 0.24], { rx: 1.2 });
  place(new THREE.CapsuleGeometry(0.085, 0.36, 4, 10), m.whiteStone, [0.36, 2.48, 0.22], { rx: 1.0 });
  place(lathe([[0, 0], [0.07, 0], [0.11, 0.08], [0.06, 0.2], [0.04, 0.27], [0.06, 0.3], [0, 0.3]], 12), m.whiteStone, [-0.32, 2.4, 0.42]);
  place(new THREE.CylinderGeometry(0.008, 0.012, 0.55, 5), m.leaf, [0.34, 2.75, 0.4], { rz: 0.25 });
  // Hào quang sau đầu.
  place(new THREE.TorusGeometry(0.5, 0.045, 8, 40), m.gold, [0, 3.62, -0.34]);
}

// Cây bồ đề: thân lớn nhiều múi, tán rộng xanh tươi, bệ đá tròn quanh gốc, vài dải vải đỏ buộc cầu nguyện.
function addBodhi(treeBatch, batch, m, item, { foundation = true, ribbons = true } = {}) {
  const size = item.size || 1;
  for (let lobe = 0; lobe < 5; lobe += 1) {
    const angle = (lobe / 5) * Math.PI * 2;
    treeBatch.add(new THREE.CylinderGeometry(0.22 * size, 0.42 * size, 3.6 * size, 8), m.bark, {
      position: [item.x + Math.cos(angle) * 0.22 * size, 1.8 * size, item.z + Math.sin(angle) * 0.22 * size],
      rotation: [Math.sin(angle) * 0.06, 0, -Math.cos(angle) * 0.06],
    });
  }
  for (let branch = 0; branch < 6; branch += 1) {
    const angle = branch * 1.05;
    treeBatch.add(new THREE.CylinderGeometry(0.08 * size, 0.16 * size, 2.4 * size, 6), m.bark, {
      position: [item.x + Math.cos(angle) * 0.8 * size, 3.9 * size, item.z + Math.sin(angle) * 0.8 * size],
      rotation: [Math.sin(angle) * 0.75, 0, -Math.cos(angle) * 0.75],
    });
  }
  for (let blob = 0; blob < 12; blob += 1) {
    const angle = blob * 0.52;
    const ring = blob % 3;
    treeBatch.add(new THREE.IcosahedronGeometry((1.35 + ring * 0.25) * size, 1), blob % 2 ? m.bodhiLeaf : m.leaf, {
      position: [item.x + Math.cos(angle) * (1.2 + ring * 0.9) * size, (4.6 + (blob % 4) * 0.45 - ring * 0.25) * size, item.z + Math.sin(angle) * (1.2 + ring * 0.9) * size],
      scale: [1.1, 0.7, 1.1],
    });
  }
  if (foundation) {
    // Bệ đá tròn quanh gốc chỉ mở khóa khi công trình hoàn thành.
    batch.add(new THREE.CylinderGeometry(1.55 * size, 1.65 * size, 0.42, 28, 1, true), m.stone, { position: [item.x, 0.21, item.z] });
    batch.add(new THREE.TorusGeometry(1.6 * size, 0.1, 6, 32), m.darkStone, { position: [item.x, 0.44, item.z], rotation: [Math.PI / 2, 0, 0] });
  }
  if (ribbons) {
    for (let ribbon = 0; ribbon < 6; ribbon += 1) {
      const angle = ribbon * 1.1 + 0.4;
      batch.add(new THREE.BoxGeometry(0.06, 0.7, 0.012), m.lantern, {
        position: [item.x + Math.cos(angle) * 1.5 * size, 3.2 * size, item.z + Math.sin(angle) * 1.5 * size], rotation: [0, -angle, 0.08],
      });
    }
  }
}

// Năm nhóm mesh tĩnh riêng vẫn ít draw call nhưng có thể bật/tắt tức thì theo snapshot công trình.
// Tọa độ và tỉ lệ từng giai đoạn lấy từ scene JSON; engine không chứa vị trí riêng của chánh điện.
function buildCommunityBodhi({ root, casters, materials, item }) {
  const defaults = [0, 0.18, 0.42, 0.72, 1];
  const scales = Array.isArray(item.stageScales) && item.stageScales.length === 5 ? item.stageScales : defaults;
  const groups = scales.map((scale, stageIndex) => {
    const group = new THREE.Group();
    group.name = `community-bodhi-stage-${stageIndex}`;
    const decoration = new StaticBatch();
    const trees = new StaticBatch();
    if (stageIndex === 0) {
      decoration.add(new THREE.CylinderGeometry(1.25, 1.45, 0.18, 24), materials.soil, { position: [item.x, 0.09, item.z] });
      decoration.add(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 6), materials.bark, { position: [item.x + 0.65, 0.4, item.z + 0.25], rotation: [0, 0, -0.08] });
      decoration.add(new THREE.BoxGeometry(0.72, 0.42, 0.06), materials.wood, { position: [item.x + 0.68, 0.82, item.z + 0.25], rotation: [0, -0.3, 0] });
    } else {
      addBodhi(trees, decoration, materials, { ...item, size: (item.size || 1) * scale }, {
        foundation: stageIndex === 4,
        ribbons: stageIndex === 4,
      });
    }
    trees.build(group, { castShadow: true });
    decoration.build(group, { castShadow: true, receiveShadow: true });
    group.visible = stageIndex === 0;
    group.traverse((child) => { if (child.isMesh) casters.push(child); });
    root.add(group);
    return group;
  });
  return {
    set(project) {
      const requested = Number.isSafeInteger(project?.stageIndex) ? project.stageIndex : 0;
      const active = Math.max(0, Math.min(groups.length - 1, requested));
      groups.forEach((group, index) => { group.visible = index === active; });
    },
  };
}

// Chậu hoa kiểng: chậu sành, khóm lá, hoa điểm màu.
function addPlanter(batch, m, item) {
  const flower = item.flower === 'yellow' ? m.flowerYellow : m.flowerPink;
  batch.add(lathe([[0, 0], [0.32, 0], [0.42, 0.42], [0.46, 0.46], [0, 0.46]], 16), m.pot, { position: [item.x, 0, item.z] });
  batch.add(new THREE.IcosahedronGeometry(0.5, 1), m.leaf, { position: [item.x, 0.78, item.z], scale: [1, 0.8, 1] });
  for (let bloom = 0; bloom < 7; bloom += 1) {
    const angle = bloom * 0.9;
    batch.add(new THREE.SphereGeometry(0.09, 8, 6), flower, {
      position: [item.x + Math.cos(angle) * 0.36, 0.9 + (bloom % 3) * 0.1, item.z + Math.sin(angle) * 0.36],
    });
  }
}

// Bồn nước giữa vườn: bồn đá tròn, trụ hai tầng đài sen; mặt nước và tia nước làm riêng để chuyển động.
function addFountain(batch, m, item) {
  const radius = item.radius || 2.6;
  batch.add(new THREE.CylinderGeometry(radius + 0.25, radius + 0.35, 0.5, 40, 1, true), m.stone, { position: [item.x, 0.25, item.z] });
  batch.add(new THREE.TorusGeometry(radius + 0.28, 0.14, 8, 48), m.stone, { position: [item.x, 0.52, item.z], rotation: [Math.PI / 2, 0, 0] });
  batch.add(new THREE.CylinderGeometry(radius + 0.2, radius + 0.2, 0.05, 40), m.darkStone, { position: [item.x, 0.03, item.z] });
  batch.add(new THREE.CylinderGeometry(0.28, 0.4, 1.3, 14), m.stone, { position: [item.x, 0.65, item.z] });
  batch.add(lathe([[0, 0], [0.9, 0.05], [1.0, 0.2], [0.95, 0.24], [0, 0.18]], 24), m.stone, { position: [item.x, 1.28, item.z] });
  batch.add(new THREE.CylinderGeometry(0.14, 0.2, 0.7, 12), m.stone, { position: [item.x, 1.75, item.z] });
  batch.add(lathe([[0, 0], [0.5, 0.04], [0.56, 0.16], [0, 0.12]], 20), m.stone, { position: [item.x, 2.08, item.z] });
  for (let petal = 0; petal < 8; petal += 1) {
    const angle = (petal / 8) * Math.PI * 2;
    batch.add(new THREE.SphereGeometry(0.12, 8, 6), m.flowerPink, {
      position: [item.x + Math.cos(angle) * 0.14, 2.32, item.z + Math.sin(angle) * 0.14], scale: [0.6, 1.3, 0.6], rotation: [Math.sin(angle) * 0.5, 0, -Math.cos(angle) * 0.5],
    });
  }
}

// Khu Quan Âm riêng: nền đá tròn, hàng cây xén bao quanh chừa lối vào phía trước tượng, bàn thờ nhỏ, đèn đá, bình hoa.
function addGuanyinGarden(batch, m, item, lanternGlows) {
  const front = { ...item, scale: 1 };
  const garden = item.garden || {};
  const platformRadius = garden.platformRadius || 5.2;
  const hedgeRadius = garden.radius || 5.6;
  const hedgeCount = garden.hedgeCount || 22;
  const entryHalfAngle = garden.entryHalfAngle ?? 0.5;
  const altar = garden.altar || { x: 0, z: 3, width: 1.4, depth: 0.6 };
  const lanterns = garden.lanterns || [{ x: -2.4, z: 3.4 }, { x: 2.4, z: 3.4 }];
  batch.add(new THREE.CylinderGeometry(platformRadius, platformRadius, 0.06, 48), m.stone, { position: [item.x, 0.03, item.z] });
  batch.add(new THREE.TorusGeometry(platformRadius, 0.12, 6, 64), m.darkStone, { position: [item.x, 0.07, item.z], rotation: [Math.PI / 2, 0, 0] });
  for (let index = 0; index < hedgeCount; index += 1) {
    const local = (index / hedgeCount) * Math.PI * 2;
    // Chừa lối vào phía trước tượng (hướng +z cục bộ).
    if (Math.abs(Math.atan2(Math.sin(local), Math.cos(local))) < entryHalfAngle) continue;
    batch.add(new THREE.IcosahedronGeometry(0.62, 1), m.leafDark, { position: localTransform(front, [Math.sin(local) * hedgeRadius, 0.55, Math.cos(local) * hedgeRadius]), scale: [1.2, 0.85, 1] });
  }
  const at = (local) => localTransform(front, local);
  batch.add(new THREE.BoxGeometry(altar.width, 0.8, altar.depth), m.wood, { position: at([altar.x, 0.4, altar.z]), rotation: [0, item.ry || 0, 0] });
  batch.add(new THREE.BoxGeometry(altar.width + 0.1, 0.06, altar.depth + 0.1), m.lantern, { position: at([altar.x, 0.82, altar.z]), rotation: [0, item.ry || 0, 0] });
  batch.add(lathe([[0, 0], [0.14, 0], [0.18, 0.12], [0.16, 0.16], [0, 0.16]], 14), m.bronze, { position: at([altar.x, 0.85, altar.z]) });
  for (const side of [-1, 1]) {
    batch.add(lathe([[0, 0], [0.08, 0], [0.12, 0.18], [0.06, 0.32], [0.08, 0.36], [0, 0.36]], 12), m.whiteStone, { position: at([altar.x + side * 0.5, 0.85, altar.z]) });
    batch.add(new THREE.IcosahedronGeometry(0.14, 1), m.flowerPink, { position: at([altar.x + side * 0.5, 1.28, altar.z]) });
  }
  for (const itemLantern of lanterns) {
    const lantern = at([itemLantern.x, 0, itemLantern.z]);
    batch.add(new THREE.BoxGeometry(0.5, 0.18, 0.5), m.darkStone, { position: [lantern[0], 0.09, lantern[2]] });
    batch.add(new THREE.CylinderGeometry(0.1, 0.13, 0.9, 8), m.stone, { position: [lantern[0], 0.63, lantern[2]] });
    batch.add(new THREE.BoxGeometry(0.34, 0.34, 0.34), m.paper, { position: [lantern[0], 1.32, lantern[2]] });
    batch.add(new THREE.ConeGeometry(0.4, 0.32, 4), m.darkStone, { position: [lantern[0], 1.65, lantern[2]], rotation: [0, Math.PI / 4, 0] });
    lanternGlows.push(new THREE.Vector3(lantern[0], 1.32, lantern[2]));
  }
}

export function buildCourtyard({ root, scene3d, renderer, camera, world }) {
  const data = world.courtyard;
  const ground = data.ground;
  const m = {
    tiles: new THREE.MeshStandardMaterial({ map: stoneTiles([(ground.x[1] - ground.x[0]) / 6, (ground.z[1] - ground.z[0]) / 6]), roughness: 0.92 }),
    stone: new THREE.MeshStandardMaterial({ color: '#a7a39a', roughness: 0.85 }),
    darkStone: new THREE.MeshStandardMaterial({ color: '#6d6a64', roughness: 0.9 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#6b4a24', metalness: 0.75, roughness: 0.38, envMapIntensity: 0.6 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d4a640', metalness: 0.6, roughness: 0.35, emissive: '#3a2604', emissiveIntensity: 0.4 }),
    pillar: new THREE.MeshStandardMaterial({ color: '#9b1d16', roughness: 0.55 }),
    wall: new THREE.MeshStandardMaterial({ color: '#a8402c', roughness: 0.85 }),
    brick: new THREE.MeshStandardMaterial({ map: bricks([6, 1]), roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: '#3a2b26', roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: '#4a2a17', roughness: 0.8 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3d6b35', roughness: 0.9, flatShading: true }),
    leafDark: new THREE.MeshStandardMaterial({ color: '#2f5a33', roughness: 0.9, flatShading: true }),
    bark: new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.95 }),
    grass: new THREE.MeshStandardMaterial({ color: '#547544', roughness: 1 }),
    arhatStone: new THREE.MeshStandardMaterial({ color: '#b6925e', roughness: 0.92 }),
    whiteStone: new THREE.MeshStandardMaterial({ color: '#f1eee5', roughness: 0.72 }),
    pot: new THREE.MeshStandardMaterial({ color: '#8b3e28', roughness: 0.88 }),
    soil: new THREE.MeshStandardMaterial({ map: soilTexture(), roughness: 1 }),
    fence: new THREE.MeshStandardMaterial({ color: '#c9a36a', roughness: 0.85 }),
    gravel: new THREE.MeshStandardMaterial({ map: gravelTexture(), roughness: 1 }),
    flowerViolet: new THREE.MeshStandardMaterial({ color: '#a77be0', roughness: 0.8 }),
    plotNumbers: new THREE.MeshStandardMaterial({ map: plotNumberTexture(), roughness: 0.7 }),
    flowerPink: new THREE.MeshStandardMaterial({ color: '#e9789d', roughness: 0.8 }),
    flowerYellow: new THREE.MeshStandardMaterial({ color: '#f0bd49', roughness: 0.8 }),
    bodhiLeaf: new THREE.MeshStandardMaterial({ color: '#5f8f3e', roughness: 0.85, flatShading: true }),
    arhatFace: new THREE.MeshStandardMaterial({ map: arhatFaceTexture(), transparent: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }),
    guanyinFace: new THREE.MeshStandardMaterial({ map: guanyinFaceTexture(), transparent: true, roughness: 0.72, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }),
    paper: new THREE.MeshStandardMaterial({ color: '#ffd28a', emissive: '#ffb347', emissiveIntensity: 1.2, roughness: 0.6 }),
    lantern: new THREE.MeshStandardMaterial({ color: '#d23a2a', emissive: '#b8281a', emissiveIntensity: 0.9, roughness: 0.6 }),
    water: new THREE.MeshStandardMaterial({ color: '#3c7979', metalness: 0.25, roughness: 0.24, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
    // Mặt hồ phải đọc được rõ trên cả màn hình sáng: vẫn trong để thấy cá nhưng đủ màu/độ phản sáng để không giống hồ cạn.
    pondWater: new THREE.MeshStandardMaterial({
      color: '#35a8bb', emissive: '#0a3942', emissiveIntensity: 0.2,
      metalness: 0.05, roughness: 0.2, transparent: true, opacity: 0.64,
      depthWrite: false, side: THREE.DoubleSide,
    }),
    pondBed: new THREE.MeshStandardMaterial({ color: '#6b6a4e', roughness: 1, side: THREE.BackSide }),
    rock: new THREE.MeshStandardMaterial({ color: '#7d7a72', roughness: 0.95, flatShading: true }),
    koi: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }),
    mountain: new THREE.MeshStandardMaterial({ color: '#4f6a63', roughness: 1, flatShading: true }),
  };
  const glowTexture = softDot('rgba(255, 210, 140, 1)');
  const smokeTexture = softDot('rgba(238, 232, 222, 0.6)');
  const casters = [];
  const batch = new StaticBatch();
  const midX = (ground.x[0] + ground.x[1]) / 2;
  const midZ = (ground.z[0] + ground.z[1]) / 2;

  // ---- Nền: đá lát cả sân, hoặc (floor: 'grass') bãi cỏ có lối đá (paths) và khoét lỗ cho hồ lớn ----
  const pond = data.pond;
  const bigPond = Boolean(pond && pond.depth);
  if (data.floor === 'grass') {
    const grass = new THREE.Mesh(groundShape(ground, bigPond ? [{ x: pond.x, z: pond.z, rx: pond.radiusX + 0.35, rz: pond.radiusZ + 0.35 }] : [], 0.002),
      new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }));
    grass.receiveShadow = true;
    root.add(grass);
    const tiles = stoneTiles([1, 1]);
    tiles.repeat.set(1 / 6, 1 / 6);
    const pathMaterial = new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.92 });
    for (const rect of data.paths || []) {
      const path = new THREE.Mesh(groundShape(rect, [], 0.006), pathMaterial);
      path.receiveShadow = true;
      root.add(path);
    }
  } else {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ground.x[1] - ground.x[0], ground.z[1] - ground.z[0]), m.tiles);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(midX, 0.002, midZ);
    floor.receiveShadow = true;
    root.add(floor);
  }
  const bakedShadow = new THREE.Mesh(
    groundPlane(ground, 0.012),
    new THREE.MeshBasicMaterial({
      map: bakedCourtyardShadows(data), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false,
    }),
  );
  bakedShadow.renderOrder = 1;
  root.add(bakedShadow);
  for (const lawn of data.lawns || []) {
    batch.add(new THREE.PlaneGeometry(lawn.width, lawn.depth), m.grass, {
      position: [lawn.x, 0.007, lawn.z], rotation: [-Math.PI / 2, 0, 0],
    });
  }
  // Đất ngoài sân (cỏ khô) tới chân núi.
  // Khoét cùng lỗ hồ lớn để thấy được lòng hồ bên dưới.
  const fieldHoles = bigPond ? [{ x: pond.x, z: pond.z, rx: pond.radiusX + 0.35, rz: pond.radiusZ + 0.35 }] : [];
  const field = new THREE.Mesh(groundShape({ x: [-120, 120], z: [midZ - 80, midZ + 160] }, fieldHoles, -0.02), new THREE.MeshStandardMaterial({ color: '#56603e', roughness: 1 }));
  root.add(field);

  // ---- Mặt tiền chánh điện: tường đỏ mở cửa giữa, thềm đá, hàng cột son, hoành phi, mái ngói ----
  const door = data.door;
  const frontZ = ground.z[0];
  // Kích thước chánh điện (world.hall): tường, mái và thềm ôm theo.
  const hall = hallLayout(world);
  const hw = hall.halfWidth;
  const wallHeight = hall.height - 0.4;
  const side = hw - door.width / 2;
  for (const s of [-1, 1]) {
    batch.add(new THREE.BoxGeometry(side, wallHeight, 0.3), m.wall, { position: [s * (door.width / 2 + side / 2), wallHeight / 2, frontZ + 0.15] });
  }
  batch.add(new THREE.BoxGeometry(door.width, wallHeight - door.height, 0.3), m.wall, { position: [0, door.height + (wallHeight - door.height) / 2, frontZ + 0.15] });
  // Khung cửa gỗ, cánh cửa mở vào trong.
  for (const s of [-1, 1]) {
    batch.add(new THREE.BoxGeometry(0.18, door.height, 0.36), m.wood, { position: [s * (door.width / 2 + 0.05), door.height / 2, frontZ + 0.16] });
    batch.add(new THREE.BoxGeometry(door.width / 2, door.height - 0.1, 0.08), m.pillar, {
      position: [s * (door.width / 2 - 0.12), door.height / 2, frontZ - door.width / 4 + 0.1], rotation: [0, s * 1.35, 0],
    });
  }
  batch.add(new THREE.BoxGeometry(door.width + 0.4, 0.22, 0.4), m.wood, { position: [0, door.height + 0.1, frontZ + 0.16] });
  // Tường ngoài hai bên và phía sau chánh điện (tường trong chỉ nhìn được từ bên trong).
  const back = hall.back - 0.3;
  for (const s2 of [-1, 1]) batch.add(new THREE.BoxGeometry(0.3, wallHeight, frontZ - back), m.wall, { position: [s2 * (hw + 0.16), wallHeight / 2, (frontZ + back) / 2] });
  batch.add(new THREE.BoxGeometry(hw * 2 + 0.6, wallHeight, 0.3), m.wall, { position: [0, wallHeight / 2, hall.back - 0.16] });
  // Thềm đá thấp trước cửa (chỉ là hình, người đi lại vẫn trên mặt sân).
  batch.add(new THREE.BoxGeometry(hw * 2 + 1, 0.08, 2.4), m.stone, { position: [0, 0.04, frontZ + 1.2] });
  batch.add(new THREE.BoxGeometry(hw * 2 + 1.4, 0.04, 2.8), m.darkStone, { position: [0, 0.02, frontZ + 1.3] });
  for (const [x, z] of data.porchPillars) {
    batch.add(new THREE.CylinderGeometry(0.42, 0.46, 0.3, 8), m.stone, { position: [x, 0.15, z] });
    batch.add(new THREE.CylinderGeometry(0.24, 0.27, 5.2, 10), m.pillar, { position: [x, 2.9, z] });
    batch.add(new THREE.TorusGeometry(0.26, 0.03, 6, 16), m.gold, { position: [x, 5.3, z], rotation: [Math.PI / 2, 0, 0] });
  }
  // Mái hiên trước thềm và mái chính.
  batch.add(new THREE.BoxGeometry(hw * 2 + 1.4, 0.22, 2.6), m.wood, { position: [0, 5.6, frontZ + 1.25] });
  addRoof(batch, m, { x0: -(hw + 0.6), x1: hw + 0.6, z0: frontZ - 0.2, z1: frontZ + 2.6, y: 5.7, rise: 1.0 });
  addRoof(batch, m, { x0: -(hw + 0.4), x1: hw + 0.4, z0: hall.back - 0.4, z1: frontZ + 0.4, y: wallHeight + 0.1, rise: 3.2 + (hw - 6) * 0.25 });
  // Hoành phi trên cửa.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.1), new THREE.MeshStandardMaterial({ map: textBoard(data.sign || ''), roughness: 0.6, emissive: '#2a0606', emissiveIntensity: 0.4 }));
  sign.position.set(0, Math.max(6.4, wallHeight - 1.2), frontZ + 0.33);
  root.add(sign);
  // Đèn lồng đỏ treo hiên.
  const lanternGlows = [];
  for (const [x] of data.porchPillars) {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), m.lantern);
    lantern.scale.y = 1.25;
    lantern.position.set(x + (x < 0 ? 1.4 : -1.4), 4.7, frontZ + 1.6);
    root.add(lantern);
    lanternGlows.push(lantern.position.clone());
  }

  // ---- Lư hương đồng lớn trên bệ đá giữa sân ----
  const burner = new THREE.Group();
  burner.position.set(data.burner.x, 0, data.burner.z);
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 1.7), m.stone);
  pedestal.position.y = 0.375;
  const pedestalTop = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.9), m.darkStone);
  pedestalTop.position.y = 0.8;
  const pot = new THREE.Mesh(lathe([[0, 0], [0.45, 0.05], [0.62, 0.3], [0.7, 0.62], [0.66, 0.86], [0.58, 0.92], [0.62, 0.98], [0, 0.98]]), m.bronze);
  pot.position.y = 1.18;
  const neck = new THREE.Mesh(lathe([[0, 0], [0.28, 0], [0.22, 0.2], [0.36, 0.26], [0, 0.26]]), m.bronze);
  neck.position.y = 0.9;
  burner.add(pedestal, pedestalTop, neck, pot);
  for (const s of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 18), m.bronze);
    handle.position.set(s * 0.74, 1.95, 0);
    handle.rotation.y = Math.PI / 2;
    burner.add(handle);
  }
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.58, 24), m.darkStone);
  ash.rotation.x = -Math.PI / 2;
  ash.position.y = 2.12;
  burner.add(ash);
  // Bó nhang cắm giữa lư.
  for (let index = 0; index < 9; index += 1) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5), m.lantern);
    stick.position.set(Math.cos(index * 0.7) * 0.12, 2.45, Math.sin(index * 0.7) * 0.12);
    stick.rotation.set(Math.sin(index) * 0.08, 0, Math.cos(index) * 0.08);
    burner.add(stick);
  }
  burner.traverse((item) => { if (item.isMesh) casters.push(item); });
  root.add(burner);

  // ---- Đèn đá hai bên lối đi ----
  for (const [x, z] of data.lanterns) {
    batch.add(new THREE.BoxGeometry(0.5, 0.18, 0.5), m.darkStone, { position: [x, 0.09, z] });
    batch.add(new THREE.CylinderGeometry(0.1, 0.13, 0.9, 8), m.stone, { position: [x, 0.63, z] });
    batch.add(new THREE.BoxGeometry(0.46, 0.08, 0.46), m.stone, { position: [x, 1.1, z] });
    batch.add(new THREE.BoxGeometry(0.34, 0.34, 0.34), m.paper, { position: [x, 1.32, z] });
    batch.add(new THREE.ConeGeometry(0.4, 0.32, 4), m.darkStone, { position: [x, 1.65, z], rotation: [0, Math.PI / 4, 0] });
    lanternGlows.push(new THREE.Vector3(x, 1.32, z));
  }

  // ---- Đại hồng chung và trống lớn hai bên thềm ----
  for (const item of data.instruments || []) addInstrument(batch, m, item);

  // ---- Cây đa lớn, tùng, bụi cây: gộp chung thành vài lượt vẽ (đổ bóng) ----
  const treeBatch = new StaticBatch();
  for (const tree of data.trees || []) {
    const size = tree.size || 1;
    treeBatch.add(new THREE.CylinderGeometry(0.32 * size, 0.55 * size, 3.4 * size, 9), m.bark, { position: [tree.x, 1.7 * size, tree.z] });
    // Rễ nổi ôm gốc và rễ phụ buông từ tán làm cây đa nhận ra được cả khi nhìn xa.
    for (let rootIndex = 0; rootIndex < 7; rootIndex += 1) {
      const angle = (rootIndex / 7) * Math.PI * 2;
      treeBatch.add(new THREE.CylinderGeometry(0.035 * size, 0.14 * size, 1.65 * size, 6), m.bark, {
        position: [tree.x + Math.cos(angle) * 0.38 * size, 0.82 * size, tree.z + Math.sin(angle) * 0.38 * size],
        rotation: [Math.sin(angle) * 0.18, 0, -Math.cos(angle) * 0.18],
      });
      if (rootIndex < 5) {
        treeBatch.add(new THREE.CylinderGeometry(0.018 * size, 0.045 * size, 2.8 * size, 5), m.bark, {
          position: [tree.x + Math.cos(angle + 0.35) * 1.05 * size, 1.55 * size, tree.z + Math.sin(angle + 0.35) * 1.05 * size],
        });
      }
    }
    for (let blob = 0; blob < 7; blob += 1) {
      const angle = blob * 0.9;
      treeBatch.add(new THREE.IcosahedronGeometry((1.3 + (blob % 3) * 0.35) * size, 1), blob % 2 ? m.leaf : m.leafDark, {
        position: [tree.x + Math.cos(angle) * 1.4 * size, (3.6 + (blob % 3) * 0.6) * size, tree.z + Math.sin(angle) * 1.4 * size],
        scale: [1, 0.75, 1],
      });
    }
  }
  for (const [x, z] of data.pines || []) {
    treeBatch.add(new THREE.CylinderGeometry(0.12, 0.18, 1.4, 7), m.bark, { position: [x, 0.7, z] });
    for (let tier = 0; tier < 4; tier += 1) {
      treeBatch.add(new THREE.ConeGeometry(1.1 - tier * 0.22, 1.2, 8), tier % 2 ? m.leaf : m.leafDark, { position: [x, 1.5 + tier * 0.75, z] });
    }
  }
  if (data.bodhi && !data.bodhi.projectId) addBodhi(treeBatch, batch, m, data.bodhi);
  const trees = new THREE.Group();
  treeBatch.build(trees, { castShadow: true });
  root.add(trees);
  trees.traverse((item) => { if (item.isMesh) casters.push(item); });
  const communityBodhi = data.bodhi?.projectId
    ? buildCommunityBodhi({ root, casters, materials: m, item: data.bodhi })
    : null;
  for (const [x, z] of data.bushes || []) {
    batch.add(new THREE.IcosahedronGeometry(0.75, 1), m.leaf, { position: [x, 0.5, z], scale: [1.3, 0.75, 1] });
  }

  // ---- Hồ cá lớn (pond.depth): lòng hồ khoét xuống dưới mặt cỏ, bờ đá, lá sen, cá koi bơi dưới mặt nước ----
  const koi = [];
  let koiMesh = null;
  let communityLotus = null;
  if (bigPond) {
    const stagedPond = Boolean(pond.projectId);
    const rockBatch = stagedPond ? new StaticBatch() : batch;
    const lotusBatch = stagedPond ? new StaticBatch() : batch;
    const depth = pond.depth;
    const bed = new THREE.Mesh(lathe([[0, -depth], [0.55, -depth * 0.96], [0.85, -depth * 0.7], [0.97, -depth * 0.3], [1, 0.01]], 48), m.pondBed);
    bed.scale.set(pond.radiusX + 0.35, 1, pond.radiusZ + 0.35);
    bed.position.set(pond.x, 0, pond.z);
    root.add(bed);
    // Một lớp nước nông có cả mặt và thành bên: ở góc camera thấp vẫn thấy rõ màu nước thay vì chỉ thấy đáy hồ.
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.18, 64, 1, false), m.pondWater);
    water.scale.set(pond.radiusX + 0.3, 1, pond.radiusZ + 0.3);
    water.position.set(pond.x, -0.21, pond.z);
    water.renderOrder = 2;
    // Hồ cá là cảnh nền có sẵn: mặt nước không được biến mất trong lúc chờ tải tiến độ công trình hồ sen.
    if (stagedPond) water.visible = (pond.stageVisibility?.water ?? 1) === 0;
    root.add(water);
    // Bờ đá: đá to nhỏ xen nhau theo chu vi elip.
    const perimeter = Math.PI * 2 * Math.sqrt((pond.radiusX ** 2 + pond.radiusZ ** 2) / 2);
    const rocks = Math.round(perimeter / 0.75);
    for (let index = 0; index < rocks; index += 1) {
      const angle = (index / rocks) * Math.PI * 2;
      const size = 0.32 + ((index * 37) % 7) * 0.05;
      rockBatch.add(new THREE.DodecahedronGeometry(size, 0), m.rock, {
        position: [pond.x + Math.cos(angle) * (pond.radiusX + 0.42), size * 0.35, pond.z + Math.sin(angle) * (pond.radiusZ + 0.42)],
        rotation: [index * 0.7, index * 1.3, 0], scale: [1.3, 0.75, 1],
      });
    }
    // Lá sen và hoa sen nổi trên mặt nước (dồn về một phía để chừa chỗ ngắm cá).
    for (let index = 0; index < 22; index += 1) {
      const angle = index * 2.39996;
      const reach = 0.35 + 0.55 * Math.sqrt((index + 0.5) / 22);
      const x = pond.x - Math.abs(Math.cos(angle)) * reach * pond.radiusX * 0.9;
      const z = pond.z + Math.sin(angle) * reach * pond.radiusZ * 0.9;
      const radius = 0.32 + (index % 4) * 0.08;
      lotusBatch.add(new THREE.CircleGeometry(radius, 14, 0.4, Math.PI * 2 - 0.4), m.leaf, {
        position: [x, -0.12, z], rotation: [-Math.PI / 2, 0, index * 0.9],
      });
      if (index % 4 === 1) {
        lotusBatch.add(new THREE.SphereGeometry(0.13, 10, 7), m.flowerPink, { position: [x, -0.02, z], scale: [1, 0.85, 1] });
      }
    }
    // Cá koi: một InstancedMesh, mỗi con bơi vòng elip riêng ở độ sâu riêng, đuôi lắc theo nhịp bơi.
    const count = Math.min(60, pond.fish ?? 20);
    const colors = ['#f26b1d', '#ffffff', '#f5b323', '#e8432c', '#f4f0e6', '#ff8a3d'];
    koiMesh = new THREE.InstancedMesh(koiGeometry(), m.koi, count);
    koiMesh.frustumCulled = false;
    for (let index = 0; index < count; index += 1) {
      const a = 0.25 + ((index * 53) % 60) / 100;
      koi.push({
        cx: pond.x + (((index * 29) % 11) / 11 - 0.5) * pond.radiusX * 0.5,
        cz: pond.z + (((index * 17) % 7) / 7 - 0.5) * pond.radiusZ * 0.5,
        ax: a * pond.radiusX * 0.6,
        az: a * pond.radiusZ * 0.6,
        speed: (0.18 + ((index * 7) % 5) * 0.05) * (index % 2 ? 1 : -1),
        phase: index * 1.7,
        y: -0.3 - ((index * 13) % 5) * 0.08,
        size: 1.1 + ((index * 11) % 6) * 0.12,
      });
      koiMesh.setColorAt(index, new THREE.Color(colors[index % colors.length]));
    }
    if (stagedPond) koiMesh.visible = (pond.stageVisibility?.fish ?? 4) === 0;
    root.add(koiMesh);
    if (stagedPond) {
      const rocksGroup = new THREE.Group();
      const lotusGroup = new THREE.Group();
      rocksGroup.name = 'community-lotus-rocks';
      lotusGroup.name = 'community-lotus-plants';
      rockBatch.build(rocksGroup, { castShadow: true, receiveShadow: true });
      lotusBatch.build(lotusGroup, { castShadow: true, receiveShadow: true });
      rocksGroup.visible = false;
      lotusGroup.visible = false;
      root.add(rocksGroup, lotusGroup);
      rocksGroup.traverse((child) => { if (child.isMesh) casters.push(child); });
      lotusGroup.traverse((child) => { if (child.isMesh) casters.push(child); });
      const visibility = { water: 0, rocks: 2, lotus: 3, fish: 0, ...pond.stageVisibility };
      communityLotus = {
        set(project) {
          const stageIndex = Number.isSafeInteger(project?.stageIndex) ? Math.max(0, Math.min(4, project.stageIndex)) : 0;
          water.visible = stageIndex >= visibility.water;
          rocksGroup.visible = stageIndex >= visibility.rocks;
          lotusGroup.visible = stageIndex >= visibility.lotus;
          koiMesh.visible = stageIndex >= visibility.fish;
        },
      };
    }
  } else if (pond) {
    // ---- Hồ sen nhỏ: bờ đá và lá gộp vào batch, chỉ mặt nước là một mesh trong suốt riêng ----
    batch.add(new THREE.CylinderGeometry(1, 1, 0.16, 32), m.darkStone, {
      position: [pond.x, 0.08, pond.z], scale: [pond.radiusX + 0.22, 1, pond.radiusZ + 0.22],
    });
    batch.add(new THREE.CylinderGeometry(1, 1, 0.08, 32), m.stone, {
      position: [pond.x, 0.17, pond.z], scale: [pond.radiusX + 0.08, 1, pond.radiusZ + 0.08],
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), m.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(pond.x, 0.225, pond.z);
    water.scale.set(pond.radiusX, pond.radiusZ, 1);
    water.receiveShadow = true;
    root.add(water);
    const lotusOffsets = [
      [-0.52, -0.28, 0.3], [0.42, -0.18, 0.26], [-0.12, 0.34, 0.34], [0.68, 0.35, 0.23], [-0.72, 0.38, 0.2],
    ];
    for (let index = 0; index < lotusOffsets.length; index += 1) {
      const [offsetX, offsetZ, radius] = lotusOffsets[index];
      const x = pond.x + offsetX * pond.radiusX;
      const z = pond.z + offsetZ * pond.radiusZ;
      batch.add(new THREE.CircleGeometry(radius, 16), m.leaf, {
        position: [x, 0.24, z], rotation: [-Math.PI / 2, 0, index * 0.7], scale: [1, 0.72, 1],
      });
      if (index === 1 || index === 3) {
        batch.add(new THREE.SphereGeometry(0.1, 10, 7), m.lantern, { position: [x, 0.36, z], scale: [1, 0.75, 1] });
      }
    }
  }

  // ---- Vườn chùa: 18 vị La Hán quanh sân, khu Quan Âm trắng riêng, bồn nước, chậu hoa kiểng, ghế đá ----
  // Tượng La Hán và Quan Âm dựng bằng khối nằm trong nhóm riêng: khi tải xong tượng quét thật (statues3d.mjs) thì ẩn.
  const arhatBatch = new StaticBatch();
  const guanyinBatch = new StaticBatch();
  const benchPickables = [];
  const benchProxyGeometry = new THREE.BoxGeometry(2.3, 1.05, 0.85);
  const benchProxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  (data.arhats || []).forEach((item, index) => addArhat(arhatBatch, m, item, index));
  for (const item of data.benches || []) {
    addBench(batch, m, item);
    // Mesh đơn giản chỉ dùng raycast: ghế thật đã gộp vào StaticBatch nên không còn nhận diện được từng ghế.
    const proxy = new THREE.Mesh(benchProxyGeometry, benchProxyMaterial);
    const size = item.scale || 1;
    proxy.position.set(...localTransform(item, [0, 0.55, 0], size));
    proxy.rotation.y = item.ry || 0;
    proxy.scale.setScalar(size);
    proxy.userData.benchId = item.id;
    root.add(proxy);
    benchPickables.push(proxy);
  }
  for (const item of data.planters || []) addPlanter(batch, m, item);
  // Mỗi khu có một bảng hướng dẫn vật lý; chạm bảng sẽ mở lại hộp hướng dẫn của khu đó.
  const guidePickables = [];
  const guideSigns = [];
  for (const item of data.guideBoards || []) addGuideBoard(batch, m, item, guidePickables, root, guideSigns);
  for (const sign of guideSigns) {
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(sign.width, sign.height),
      new THREE.MeshStandardMaterial({ map: textBoard(sign.text, { width: 1024, height: 512 }), roughness: 0.6, side: THREE.DoubleSide }),
    );
    board.position.set(...sign.position);
    board.rotation.y = sign.ry;
    root.add(board);
  }
  // Vườn Công Đức: phần tĩnh; biển tên là mesh riêng (texture chữ).
  const gardenPickables = [];
  if (data.garden) {
    const gardenSigns = [];
    addGarden(batch, m, data.garden, gardenPickables, root, gardenSigns);
    for (const sign of gardenSigns) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(sign.width, sign.width * 0.24), new THREE.MeshStandardMaterial({ map: textBoard(sign.text), roughness: 0.6, side: THREE.DoubleSide }));
      board.position.set(...sign.position);
      board.rotation.y = sign.ry;
      root.add(board);
    }
  }
  if (data.guanyin) {
    addGuanyinGarden(batch, m, data.guanyin, lanternGlows);
    addGuanyin(guanyinBatch, m, data.guanyin);
  }
  const proceduralStatues = { arhats: new THREE.Group(), guanyin: new THREE.Group() };
  arhatBatch.build(proceduralStatues.arhats, { castShadow: true });
  guanyinBatch.build(proceduralStatues.guanyin, { castShadow: true });
  root.add(proceduralStatues.arhats, proceduralStatues.guanyin);
  let fountainWater = null;
  const sprays = [];
  if (data.fountain) {
    addFountain(batch, m, data.fountain);
    const radius = data.fountain.radius || 2.6;
    fountainWater = new THREE.Mesh(new THREE.CircleGeometry(radius + 0.18, 48), m.water);
    fountainWater.rotation.x = -Math.PI / 2;
    fountainWater.position.set(data.fountain.x, 0.42, data.fountain.z);
    fountainWater.receiveShadow = true;
    root.add(fountainWater);
  }

  // ---- Tường gạch thấp hai bên và phía trước, cột đèn lồng; cổng tam quan ----
  const wallLength = ground.z[1] - frontZ;
  for (const s of [-1, 1]) {
    batch.add(new THREE.BoxGeometry(0.4, 1.3, wallLength), m.brick, { position: [s * (ground.x[1] - 0.2), 0.65, frontZ + wallLength / 2] });
    batch.add(new THREE.BoxGeometry(0.6, 0.12, wallLength), m.roof, { position: [s * (ground.x[1] - 0.2), 1.36, frontZ + wallLength / 2] });
    for (let z = frontZ + 2; z < ground.z[1]; z += 5) {
      batch.add(new THREE.BoxGeometry(0.3, 2.4, 0.3), m.pillar, { position: [s * (ground.x[1] - 0.6), 1.2, z] });
      batch.add(new THREE.SphereGeometry(0.22, 12, 10), m.lantern, { position: [s * (ground.x[1] - 0.6), 2.55, z], scale: [1, 1.25, 1] });
      lanternGlows.push(new THREE.Vector3(s * (ground.x[1] - 0.6), 2.55, z));
    }
  }
  if (data.gate) {
    const gz = data.gate.z;
    const openings = data.gate.openings || [
      { x: -2.4, width: 1.6, height: 3.05 },
      { x: 0, width: 3.2, height: 3.5 },
      { x: 2.4, width: 1.6, height: 3.05 },
    ];
    for (const s of [-1, 1]) {
      batch.add(new THREE.BoxGeometry((ground.x[1] - 3.4), 1.3, 0.4), m.brick, { position: [s * (3.4 + (ground.x[1] - 3.4) / 2), 0.65, gz] });
    }
    const pillarXs = new Set();
    for (const opening of openings) {
      pillarXs.add(opening.x - opening.width / 2);
      pillarXs.add(opening.x + opening.width / 2);
      const radius = opening.width / 2 - 0.08;
      batch.add(new THREE.TorusGeometry(radius, 0.11, 6, 24, Math.PI), m.gold, {
        position: [opening.x, opening.height - radius, gz - 0.24],
      });
      addRoof(batch, m, {
        x0: opening.x - opening.width / 2 - 0.18,
        x1: opening.x + opening.width / 2 + 0.18,
        z0: gz - 0.65,
        z1: gz + 0.65,
        y: opening.x === 0 ? 4 : 3.65,
        rise: opening.x === 0 ? 0.9 : 0.62,
      });
    }
    for (const x of pillarXs) batch.add(new THREE.BoxGeometry(0.5, 3.6, 0.5), m.pillar, { position: [x, 1.8, gz] });
    batch.add(new THREE.BoxGeometry(7.4, 0.5, 0.8), m.wood, { position: [0, 3.75, gz] });
    const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.55), new THREE.MeshStandardMaterial({ map: textBoard(data.gateSign || 'TAM QUAN'), roughness: 0.6 }));
    gateSign.position.set(0, 3.75, gz - 0.42);
    gateSign.rotation.y = Math.PI;
    root.add(gateSign);
  }
  // Bảng vàng công đức.
  if (data.board) {
    const { x, z } = data.board;
    batch.add(new THREE.BoxGeometry(0.12, 2.2, 0.12), m.wood, { position: [x - 0.85, 1.1, z] });
    batch.add(new THREE.BoxGeometry(0.12, 2.2, 0.12), m.wood, { position: [x + 0.85, 1.1, z] });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.3), new THREE.MeshStandardMaterial({ map: textBoard(data.board.title || '', { height: 768, background: '#1f1a14' }), roughness: 0.6 }));
    board.position.set(x, 1.55, z + 0.07);
    root.add(board);
  }
  // Điểm công việc chung: đạo cụ nhỏ giúp người chơi nhận ra nơi làm việc; tương tác vẫn dựa vào khoảng cách và
  // id trong scene JSON, không raycast từ xa. Hình khối ít mặt và được gộp cùng batch để không tăng draw call.
  for (const chore of data.chores || []) {
    const { x, z, kind } = chore;
    if (kind === 'sweep') {
      // Chổi được người chơi cầm trong hoạt ảnh; tại điểm làm việc chỉ để một đống lá nhỏ nhằm tránh nhìn như có hai cây chổi.
      for (const [dx, dz, scale, material] of [
        [-0.24, -0.03, 1, m.flowerYellow],
        [-0.08, 0.08, 0.8, m.leaf],
        [0.12, -0.06, 0.9, m.flowerYellow],
        [0.25, 0.05, 0.7, m.leaf],
      ]) batch.add(new THREE.SphereGeometry(0.12, 5, 3), material, {
        position: [x + dx, 0.035, z + dz], scale: [scale * 1.5, 0.18, scale], rotation: [0, dx * 5, 0],
      });
    } else if (kind === 'water') {
      // Bình tưới được cầm trong tay khi làm; vệt nước nhỏ chỉ đánh dấu nơi tưới, không tạo thêm một bình khổng lồ cạnh người.
      batch.add(new THREE.CircleGeometry(0.3, 16), m.water, { position: [x + 0.42, 0.018, z], rotation: [-Math.PI / 2, 0, 0], scale: [1.35, 1, 1] });
    } else if (kind === 'light') {
      batch.add(new THREE.CylinderGeometry(0.08, 0.1, 0.62, 8), m.darkStone, { position: [x, 0.31, z] });
      batch.add(new THREE.BoxGeometry(0.34, 0.36, 0.34), m.paper, { position: [x, 0.8, z] });
      batch.add(new THREE.ConeGeometry(0.42, 0.28, 4), m.darkStone, { position: [x, 1.12, z], rotation: [0, Math.PI / 4, 0] });
    } else if (kind === 'feed') {
      batch.add(new THREE.CylinderGeometry(0.32, 0.22, 0.18, 16), m.wood, { position: [x, 0.09, z] });
      batch.add(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 16), m.soil, { position: [x, 0.19, z] });
    } else if (kind === 'clean') {
      batch.add(new THREE.CylinderGeometry(0.26, 0.2, 0.38, 12), m.water, { position: [x, 0.19, z] });
      batch.add(new THREE.TorusGeometry(0.24, 0.025, 6, 14, Math.PI), m.darkStone, { position: [x, 0.42, z], rotation: [0, 0, Math.PI] });
      batch.add(new THREE.BoxGeometry(0.38, 0.035, 0.25), m.flowerYellow, { position: [x + 0.35, 0.06, z] });
    } else if (kind === 'tea') {
      // Bàn trà thấp kiểu ngồi bệt, vừa tầm nhân vật chibi; ấm và chén thu theo cùng tỉ lệ.
      batch.add(new THREE.BoxGeometry(0.72, 0.075, 0.42), m.wood, { position: [x, 0.34, z] });
      for (const side of [-1, 1]) batch.add(new THREE.BoxGeometry(0.06, 0.32, 0.06), m.wood, { position: [x + side * 0.26, 0.16, z] });
      batch.add(new THREE.SphereGeometry(0.11, 12, 8), m.bronze, { position: [x, 0.45, z], scale: [1, 0.75, 1] });
      for (const side of [-1, 1]) batch.add(new THREE.CylinderGeometry(0.04, 0.032, 0.07, 10), m.paper, { position: [x + side * 0.18, 0.42, z] });
    }
  }
  // Các khối tĩnh vẫn được gộp theo vật liệu; trên máy đủ mạnh, mỗi mesh gộp đổ bóng thật mà không tăng số mesh.
  batch.build(root, { castShadow: true });

  // ---- Bầu trời chuyển màu và núi xa ----
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(data.sky?.top || '#7aa6d8') }, horizon: { value: new THREE.Color(data.sky?.horizon || '#f6dcb0') } },
      vertexShader: 'varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vPos; void main() { float h = clamp(normalize(vPos).y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.7)), 1.0); }',
    }),
  );
  sky.renderOrder = -1;
  scene3d.add(sky);
  const mountains = new StaticBatch();
  for (let index = 0; index < 9; index += 1) {
    const angle = -1.2 + (index / 8) * 2.4;
    mountains.add(new THREE.ConeGeometry(18 + (index % 3) * 8, 14 + (index % 4) * 6, 6), m.mountain, { position: [Math.sin(angle) * 95, 5, midZ + 40 + Math.cos(angle) * 70] });
  }
  mountains.build(root);

  // ---- Ánh nắng (chỉ khi camera ở ngoài sân) và bóng đổ ----
  const sun = new THREE.DirectionalLight('#fff1d6', 0);
  const direction = sunDirection(data);
  sun.target.position.set(midX, 0, midZ - 2);
  sun.position.set(midX + direction[0], direction[1], midZ - 2 + direction[2]);
  // Điện thoại bắt đầu bằng bóng nướng sẵn; renderer sẽ thử shadow map 512 nếu 3 giây đầu đạt 45 FPS.
  const touch = matchMedia('(pointer: coarse)').matches;
  sun.castShadow = !touch;
  sun.shadow.mapSize.set(1024, 1024);
  // Khung bóng phủ cả sân (sân lớn thì bóng mềm hơn).
  const halfWidth = (ground.x[1] - ground.x[0]) / 2 + 2;
  const halfDepth = (ground.z[1] - ground.z[0]) / 2 + 2;
  Object.assign(sun.shadow.camera, { left: -halfWidth, right: halfWidth, top: halfDepth, bottom: -halfDepth, near: 1, far: 60 + halfDepth * 2 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.updateProjectionMatrix();
  const shadowRange = { near: sun.shadow.camera.near, far: sun.shadow.camera.far };
  let shadowsCleared = false;
  const skyFill = new THREE.HemisphereLight('#cfe2ff', '#6b5a3c', 0);
  scene3d.add(sun, sun.target, skyFill);
  for (const item of casters) item.castShadow = true;
  renderer.shadowMap.enabled = !touch;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  // Quầng sáng đèn (sprite cộng sáng, không thêm nguồn sáng).
  const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: '#ffbf6a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const position of lanternGlows) {
    const glow = new THREE.Sprite(glowMaterial);
    glow.position.copy(position);
    glow.scale.set(1.1, 1.1, 1);
    root.add(glow);
  }

  // ---- Khói hương từ lư lớn ----
  const smokeMaterial = new THREE.SpriteMaterial({ map: smokeTexture, transparent: true, depthWrite: false, opacity: 0.35 });
  const smoke = [];
  let smokeTimer = 0;
  const smokeOrigin = new THREE.Vector3(data.burner.x, 2.75, data.burner.z);

  // Tia nước từ đài sen trên đỉnh bồn: vài giọt sprite rơi theo đường cong (dùng chung vật liệu).
  if (data.fountain) {
    const dropMaterial = new THREE.SpriteMaterial({ map: softDot('rgba(220, 240, 255, 0.9)'), transparent: true, depthWrite: false, opacity: 0.8 });
    for (let index = 0; index < 18; index += 1) {
      const drop = new THREE.Sprite(dropMaterial);
      drop.scale.set(0.12, 0.12, 1);
      root.add(drop);
      sprays.push({ drop, phase: index / 18, angle: (index / 18) * Math.PI * 2 * 3 });
    }
  }

  // Chó mèo đi lại trên bãi cỏ (world.courtyard.animals), tránh vật cản theo world.walk.
  const animals = data.animals?.length ? buildAnimals({ root, animals: data.animals, walk: world.walk }) : null;
  const koiDummy = new THREE.Object3D();
  let outside = 0;
  return {
    proceduralStatues,
    animals,
    benchPickables,
    gardenPickables,
    guidePickables,
    setCommunityProject(project) {
      if (project?.id === data.bodhi?.projectId) communityBodhi?.set(project);
      if (project?.id === data.pond?.projectId) communityLotus?.set(project);
    },
    // Bật bóng đổ (thử trên điện thoại), hoặc tắt khi máy yếu. Tắt không đổi số đèn đổ bóng (đổi là mọi vật liệu
    // biên dịch lại shader, đứng hình vài giây): thu khung chụp bóng về rỗng, vẽ một lần cho sạch bóng rồi thôi vẽ.
    setShadows(on, mapSize = touch ? 512 : 1024) {
      const camera = sun.shadow.camera;
      if (on) {
        shadowsCleared = false;
        Object.assign(camera, shadowRange);
        camera.updateProjectionMatrix();
        sun.shadow.mapSize.set(mapSize, mapSize);
        sun.castShadow = true;
        renderer.shadowMap.enabled = true;
        sun.shadow.needsUpdate = true;
      } else if (sun.castShadow && renderer.shadowMap.enabled) {
        shadowsCleared = true;
        Object.assign(camera, { near: 0.001, far: 0.002 });
        camera.updateProjectionMatrix();
        sun.shadow.needsUpdate = true;
      }
    },
    shadowsEnabled() {
      return sun.castShadow && renderer.shadowMap.enabled && !shadowsCleared;
    },
    update(dt, time) {
      // Ra sân thì nắng dần lên, vào điện thì tắt (cửa giữa là ranh giới).
      const target = camera.position.z > frontZ - 0.5 ? 1 : 0;
      outside += (target - outside) * Math.min(1, dt * 3);
      sun.intensity = 2.1 * outside;
      skyFill.intensity = 0.9 * outside;
      // Không bật/tắt đèn (đổi số nguồn sáng làm mọi vật liệu biên dịch lại shader, giật mỗi lần qua cửa):
      // trong điện chỉ để cường độ 0 và ngừng vẽ lại bóng.
      sun.shadow.autoUpdate = !shadowsCleared && outside > 0.02;
      for (let index = 0; index < koi.length; index += 1) {
        const fish = koi[index];
        const t = (time / 1_000) * fish.speed + fish.phase;
        const x = fish.cx + Math.cos(t) * fish.ax;
        const z = fish.cz + Math.sin(t * 1.3) * fish.az;
        const vx = -Math.sin(t) * fish.ax * fish.speed;
        const vz = Math.cos(t * 1.3) * 1.3 * fish.az * fish.speed;
        koiDummy.position.set(x, fish.y + Math.sin(t * 2) * 0.04, z);
        koiDummy.rotation.set(0, Math.atan2(vx, vz) + Math.sin(time / 180 + fish.phase) * 0.18, 0);
        koiDummy.scale.setScalar(fish.size);
        koiDummy.updateMatrix();
        koiMesh.setMatrixAt(index, koiDummy.matrix);
      }
      if (koiMesh) koiMesh.instanceMatrix.needsUpdate = true;
      animals?.update(dt, time);
      for (const spray of sprays) {
        const k = ((time / 1_600) + spray.phase) % 1;
        const reach = 0.25 + k * 0.85;
        spray.drop.position.set(
          data.fountain.x + Math.cos(spray.angle) * reach,
          2.4 + k * 0.7 - k * k * 2.0,
          data.fountain.z + Math.sin(spray.angle) * reach,
        );
      }
      if (fountainWater) fountainWater.material.opacity = 0.78 + Math.sin(time / 700) * 0.04;
      smokeTimer += dt;
      if (smokeTimer > 0.45 && smoke.length < MAX_SMOKE) {
        smokeTimer = 0;
        const puff = new THREE.Sprite(smokeMaterial);
        puff.position.copy(smokeOrigin).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2));
        puff.scale.set(0.35, 0.35, 1);
        root.add(puff);
        smoke.push({ puff, life: 0, drift: (Math.random() - 0.5) * 0.25, seed: Math.random() * 6 });
      }
      for (let index = smoke.length - 1; index >= 0; index -= 1) {
        const item = smoke[index];
        item.life += dt;
        const k = item.life / 6;
        if (k >= 1) {
          root.remove(item.puff);
          smoke.splice(index, 1);
          continue;
        }
        item.puff.position.y += dt * 0.45;
        item.puff.position.x += Math.sin(time / 900 + item.seed) * dt * 0.08 + item.drift * dt;
        // Dùng chung một vật liệu khói: mờ dần bằng cách co lại ở cuối đời thay vì đổi độ trong từng làn.
        const size = (0.35 + k * 1.6) * Math.min(1, (1 - k) * 4);
        item.puff.scale.set(size, size, 1);
      }
    },
  };
}
