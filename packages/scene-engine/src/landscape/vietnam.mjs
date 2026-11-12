// Vùng Việt Nam (VN): đồng lúa nước chia thửa có bờ (lúa xanh, ruộng mạ ngập nước, lúa chín), lũy tre làng, cau,
// chuối, đống rơm, trâu, nhà ngói làng xa và núi đá vôi dựng đứng (sau chánh điện và ngoài cổng). Chùa: mái chồng diêm
// đầu đao cong (theme.temple), tường vàng, cột son (theme.colors), lưỡng long chầu nguyệt trên nóc mái trên và nóc cửa
// giữa cổng tam quan. Dữ liệu vùng ở scenes/thien-default/themes/vietnam.json; hình dạng bộ đồ xem đầu landscape/common.mjs.
import * as THREE from 'three';
import { buildTemple, canvasTexture, mountainArc, seeded } from './common.mjs';

const UP = new THREE.Vector3(0, 1, 0);
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

// Khối trụ nối hai điểm (cây tre, cuống lá).
function rod(batch, from, to, radiusBottom, radiusTop, material, sides = 5) {
  const start = new THREE.Vector3(...from);
  const direction = new THREE.Vector3(...to).sub(start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, sides, 1, true);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()));
  batch.add(geometry, material, { position: start.addScaledVector(direction, length / 2).toArray() });
}

// Điểm theo hệ của vật quay góc yaw quanh trục đứng (dx sang phải, dz ra trước).
const frame = (x, z, yaw) => (dx, dy, dz) => [x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, dy, z - Math.sin(yaw) * dx + Math.cos(yaw) * dz];

const trees = {
  // Cau: thân xám mảnh thẳng có đốt, bẹ xanh, tàu lá rủ và buồng cau trên ngọn (lá trên 5 m, không che lối đi).
  cau(batch, x, z, size, rand, env) {
    const height = (6.4 + rand() * 2.2) * size;
    batch.add(new THREE.CylinderGeometry(0.09 * size, 0.13 * size, height, 6), env.material('#9d9583'), { position: [x, height / 2, z] });
    if (env.detail !== 0) {
      for (let ring = 1; ring < 5; ring += 1) {
        batch.add(new THREE.CylinderGeometry(0.115 * size, 0.115 * size, 0.05, 6), env.material('#7e766a'), { position: [x, (height * ring) / 5, z] });
      }
    }
    const top = height + 0.45 * size;
    batch.add(new THREE.CylinderGeometry(0.12 * size, 0.1 * size, 0.9 * size, 6), env.material('#5f8c3a'), { position: [x, height, z] });
    const fronds = env.detail === 0 ? 7 : 10;
    for (let index = 0; index < fronds; index += 1) {
      const angle = (index / fronds) * Math.PI * 2 + rand() * 0.3;
      const leaf = env.material(pick(rand, ['#4f8a38', '#5d9840', '#467c33']), { flatShading: true, side: THREE.DoubleSide });
      // Hai đoạn: vươn lên rồi rủ xuống.
      for (const [from, length, tilt] of [[0, 0.9, 0.45], [0.8, 1.1, -0.55]]) {
        const reach = from * size;
        const lift = from ? 0.62 * size : 0;
        batch.add(new THREE.BoxGeometry(length * size, 0.03 * size, 0.34 * size), leaf, {
          position: [
            x + Math.cos(angle) * (reach + (Math.cos(tilt) * length * size) / 2),
            top + lift + (Math.sin(tilt) * length * size) / 2,
            z - Math.sin(angle) * (reach + (Math.cos(tilt) * length * size) / 2),
          ],
          rotation: [0, angle, tilt],
        });
      }
    }
    batch.add(new THREE.SphereGeometry(0.22 * size, 6, 4), env.material('#6f9a3a', { flatShading: true }), {
      position: [x + 0.18 * size, height - 0.2 * size, z], scale: [1, 1.3, 1],
    });
  },
};

const scatter = {
  // Lũy tre: bụi tre nhiều cây vươn chếch ra ngoài; mỗi ngọn một chùm lá dài vươn theo hướng cây, rủ nhẹ.
  tre(batch, x, z, size, rand, env) {
    const culms = env.detail === 0 ? 7 : 12;
    for (let index = 0; index < culms; index += 1) {
      const angle = rand() * Math.PI * 2;
      const lean = 0.08 + rand() * 0.3;
      const height = (7 + rand() * 4) * size;
      const base = [x + Math.cos(angle) * rand() * 0.5 * size, 0, z + Math.sin(angle) * rand() * 0.5 * size];
      const point = (k) => [base[0] + Math.cos(angle) * Math.sin(lean) * height * k, Math.cos(lean) * height * k, base[2] + Math.sin(angle) * Math.sin(lean) * height * k];
      rod(batch, base, point(1), 0.07 * size, 0.035 * size, env.material(pick(rand, ['#7f9b3c', '#6d8a34', '#93a54a'])));
      for (const k of env.detail === 0 ? [0.92] : [0.72, 0.95]) {
        const [px, py, pz] = point(k);
        const out = (0.5 + rand() * 0.5) * size;
        batch.add(new THREE.IcosahedronGeometry(0.55 * size, 0), env.material(pick(rand, ['#5e8f38', '#6f9e40', '#557f33', '#7aa844']), { flatShading: true }), {
          position: [px + Math.cos(angle) * out, py - 0.35 * size, pz + Math.sin(angle) * out],
          rotation: [0.25, Math.PI / 2 - angle, 0], scale: [0.75, 0.42, 2.1],
        });
      }
    }
  },
  // Chuối: thân giả, tàu lá to vươn lên rồi gãy rủ, buồng hoa tím.
  chuoi(batch, x, z, size, rand, env) {
    const height = (1.7 + rand() * 0.6) * size;
    batch.add(new THREE.CylinderGeometry(0.12 * size, 0.17 * size, height, 6), env.material('#7d8c48'), { position: [x, height / 2, z] });
    for (let index = 0; index < 7; index += 1) {
      const angle = (index / 7) * Math.PI * 2 + rand() * 0.4;
      const leaf = env.material(pick(rand, ['#5f9a3e', '#6fae48', '#58913a', '#9aa84a']), { flatShading: true, side: THREE.DoubleSide });
      const rise = (0.5 + rand() * 0.4) * size;
      for (const [from, length, tilt] of [[0, 1.0, 0.75], [0.55, 1.1, -0.35]]) {
        const reach = from * size;
        const lift = from ? rise : 0;
        batch.add(new THREE.BoxGeometry(length * size, 0.02 * size, 0.42 * size), leaf, {
          position: [
            x + Math.cos(angle) * (reach + (Math.cos(tilt) * length * size) / 2),
            height + lift + (Math.sin(tilt) * length * size) / 2,
            z - Math.sin(angle) * (reach + (Math.cos(tilt) * length * size) / 2),
          ],
          rotation: [0, angle, tilt],
        });
      }
    }
    if (rand() < 0.5) {
      batch.add(new THREE.SphereGeometry(0.13 * size, 6, 4), env.material('#7a2d3a'), { position: [x + 0.3 * size, height - 0.25 * size, z], scale: [1, 1.6, 1] });
    }
  },
  // Đống rơm quanh cây cột tre.
  rom(batch, x, z, size, rand, env) {
    const straw = env.material(pick(rand, ['#d6b65e', '#c9a64e', '#dcbf6a']), { flatShading: true });
    const radius = (1.0 + rand() * 0.35) * size;
    const body = (1.2 + rand() * 0.5) * size;
    batch.add(new THREE.CylinderGeometry(radius, radius * 1.05, body, 10), straw, { position: [x, body / 2, z] });
    batch.add(new THREE.ConeGeometry(radius * 1.08, radius * 1.1, 10), straw, { position: [x, body + radius * 0.55, z] });
    batch.add(new THREE.CylinderGeometry(0.04, 0.05, 0.8 * size, 4), env.material('#8a7a52'), { position: [x, body + radius * 1.1 + 0.2 * size, z] });
  },
  // Trâu: thân, bốn chân, đầu cúi, sừng cong hình lưỡi liềm, đuôi; quay hướng ngẫu nhiên.
  trau(batch, x, z, size, rand, env) {
    const yaw = rand() * Math.PI * 2;
    const at = frame(x, z, yaw);
    const hide = env.material('#4b4f52');
    batch.add(new THREE.BoxGeometry(1.9 * size, 0.88 * size, 0.95 * size), hide, { position: at(0, 1.05 * size, 0), rotation: [0, yaw, 0] });
    batch.add(new THREE.SphereGeometry(0.55 * size, 8, 5), hide, { position: at(0.1 * size, 0.85 * size, 0), rotation: [0, yaw, 0], scale: [1.6, 0.7, 0.95] });
    for (const dx of [-0.7, 0.7]) {
      for (const dz of [-0.3, 0.3]) {
        batch.add(new THREE.CylinderGeometry(0.09 * size, 0.08 * size, 0.75 * size, 5), hide, { position: at(dx * size, 0.38 * size, dz * size) });
      }
    }
    batch.add(new THREE.BoxGeometry(0.55 * size, 0.45 * size, 0.44 * size), hide, { position: at(1.15 * size, 1.0 * size, 0), rotation: [0, yaw, -0.35] });
    batch.add(new THREE.BoxGeometry(0.3 * size, 0.28 * size, 0.34 * size), env.material('#3a3d40'), { position: at(1.42 * size, 0.84 * size, 0), rotation: [0, yaw, -0.35] });
    // Sừng: nửa vòng hình chữ U nằm ngang qua đầu.
    batch.add(new THREE.TorusGeometry(0.42 * size, 0.05 * size, 5, 12, Math.PI), env.material('#d9d0bb'), {
      position: at(1.08 * size, 1.42 * size, 0), rotation: [0, yaw + Math.PI / 2, Math.PI],
    });
    batch.add(new THREE.CylinderGeometry(0.03 * size, 0.02 * size, 0.7 * size, 4), hide, { position: at(-1.0 * size, 0.8 * size, 0), rotation: [0, yaw, 0.25] });
  },
  // Nhà ngói làng: tường vôi, mái ngói đỏ hai dốc, cửa gỗ; mặt nhà quay về phía chùa.
  nha(batch, x, z, size, rand, env) {
    const yaw = Math.atan2(-x, (env.midZ ?? 58) - z);
    const at = frame(x, z, yaw);
    const width = (5.6 + rand() * 1.6) * size;
    const depth = 3.6 * size;
    const wall = 2.4 * size;
    const rise = 1.5 * size;
    batch.add(new THREE.BoxGeometry(width, wall, depth), env.material(pick(rand, ['#e6dcc4', '#e2c27a', '#ddd2b8'])), { position: at(0, wall / 2, 0), rotation: [0, yaw, 0] });
    const slope = Math.hypot(depth / 2 + 0.5 * size, rise);
    const angle = Math.atan2(rise, depth / 2 + 0.5 * size);
    const tile = env.material(pick(rand, ['#a24a2e', '#8f3f28', '#9a4630']), { flatShading: true });
    for (const side of [-1, 1]) {
      const geometry = new THREE.BoxGeometry(width + 0.6 * size, 0.14 * size, slope);
      geometry.rotateX(side * angle);
      batch.add(geometry, tile, { position: at(0, wall + rise / 2, side * (depth / 4 + 0.25 * size)), rotation: [0, yaw, 0] });
    }
    batch.add(new THREE.BoxGeometry(width + 0.8 * size, 0.2 * size, 0.24 * size), env.material('#6e3420'), { position: at(0, wall + rise + 0.05 * size, 0), rotation: [0, yaw, 0] });
    batch.add(new THREE.BoxGeometry(1.1 * size, 1.8 * size, 0.08), env.material('#5b3a24'), { position: at(0, 0.9 * size, depth / 2 + 0.04), rotation: [0, yaw, 0] });
    for (const side of [-1, 1]) {
      batch.add(new THREE.BoxGeometry(0.7 * size, 0.6 * size, 0.08), env.material('#3f2c20'), { position: at(side * width * 0.3, 1.4 * size, depth / 2 + 0.04), rotation: [0, yaw, 0] });
    }
  },
};

// Một khối núi đá vôi: thân tiện (lathe) phình lõm không đều quanh vòng và theo chiều cao, vách dựng đứng đỉnh tròn,
// mũ cây trên đỉnh và nhiều chòm cây bám vách.
function karstTower(batch, env, rand, x, z, radius, height) {
  const rock = env.material(env.colors[Math.floor(rand() * 2) % env.colors.length], { flatShading: true, roughness: 1 });
  const green = env.material(env.colors[2] || env.colors[0], { flatShading: true, roughness: 1 });
  const profile = [
    [1, 0], [0.97, 0.12], [0.86 + rand() * 0.14, 0.3], [0.78 + rand() * 0.16, 0.5], [0.66 + rand() * 0.16, 0.68],
    [0.5 + rand() * 0.12, 0.83], [0.3, 0.95], [0.001, 1],
  ].map(([r, y]) => new THREE.Vector2(r * radius, y * height));
  const geometry = new THREE.LatheGeometry(profile, 9);
  // Méo theo vòng: mỗi góc một độ lồi riêng (giữ đường nối khép kín), thêm lệch tâm theo chiều cao cho thân nghiêng nhẹ.
  const bumps = Array.from({ length: 9 }, () => 0.78 + rand() * 0.4);
  const tilt = [(rand() - 0.5) * 0.25, (rand() - 0.5) * 0.25];
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const px = position.getX(index);
    const py = position.getY(index);
    const pz = position.getZ(index);
    const angle = Math.atan2(pz, px);
    const slot = ((Math.round((angle / (Math.PI * 2)) * 9) % 9) + 9) % 9;
    const k = py / height;
    const bump = 1 + (bumps[slot] - 1) * Math.sin(Math.PI * Math.min(1, k * 1.2));
    position.setXYZ(index, px * bump + tilt[0] * py, py, pz * bump + tilt[1] * py);
  }
  geometry.computeVertexNormals();
  const squash = 0.75 + rand() * 0.4;
  batch.add(geometry, rock, { position: [x, -2, z], rotation: [0, rand() * Math.PI, 0], scale: [1, 1, squash] });
  const topX = x + tilt[0] * height;
  const topZ = z + tilt[1] * height * squash;
  batch.add(new THREE.IcosahedronGeometry(radius * 0.5, 0), green, { position: [topX, height - 2 - radius * 0.05, topZ], scale: [1.1, 0.5, squash] });
  for (let index = 0; index < 5; index += 1) {
    const angle = rand() * Math.PI * 2;
    const k = 0.25 + rand() * 0.6;
    const reach = radius * (0.95 - k * 0.45);
    batch.add(new THREE.IcosahedronGeometry(radius * (0.18 + rand() * 0.12), 0), green, {
      position: [x + tilt[0] * height * k + Math.cos(angle) * reach, height * k - 2, z + (tilt[1] * height * k + Math.sin(angle) * reach) * squash],
      scale: [1.4, 0.6, 1.4],
    });
  }
}

const mountains = {
  // Núi đá vôi: một dãy sau chánh điện nhô lên trên mái chùa (mặt đất ngoài tường phía sau chỉ tới z = midZ − 80 nên
  // đứng gần; khối phụ quay ra sau để không lấn tới lưng điện), các cụm hai ba ngọn theo cung ngoài cổng và một vòng xa
  // hơn mờ trong sương. Màu: theme.mountains.colors = [đá, đá sẫm, cây].
  karst(batch, env) {
    const rand = seeded('karst');
    const back = env.midZ - 81;
    // Chừa khoảng trời ngay sau mái chùa (|x| < 22) cho dáng mái và lưỡng long chầu nguyệt nổi trên nền trời.
    for (const x of [-86, -66, -46, -28, 28, 46, 66, 86]) {
      if (rand() < 0.15) continue;
      karstTower(batch, env, rand, x + (rand() - 0.5) * 6, back + (rand() - 0.5) * 3, 5.5 + rand() * 1.5, 20 + rand() * 10);
    }
    mountainArc(env, 9, { spread: 1.35, radiusX: 112, radiusZ: 88 }, (x, z) => {
      const angle = Math.atan2(x, z - env.midZ - 40);
      const peaks = 2 + Math.floor(rand() * 2);
      for (let peak = 0; peak < peaks; peak += 1) {
        const offset = (peak - (peaks - 1) / 2) * (11 + rand() * 6);
        karstTower(batch, env, rand, x + Math.cos(angle) * offset, z - Math.sin(angle) * offset + (rand() - 0.5) * 8, 8 + rand() * 6, 18 + rand() * 18);
      }
    });
    mountainArc(env, 11, { spread: 1.3, radiusX: 140, radiusZ: 112 }, (x, z) => {
      karstTower(batch, env, rand, x, z, 11 + rand() * 7, 28 + rand() * 20);
    });
  },
};

// Ruộng lúa nước: các cột thửa bề ngang khác nhau, mỗi cột chia thửa lệch nhau như ruộng thật; thửa lúa xanh, ruộng mạ
// ngập nước (ánh trời), lúa chín; hàng lúa trong thửa; bờ đất có cỏ. Bờ ở mép 0 vẽ cả ở mép bên kia để ô ảnh nối liền.
function paintPlot(ctx, x, y, width, height, rand) {
  const kind = rand();
  const vertical = rand() < 0.5;
  if (kind < 0.2) {
    ctx.fillStyle = pick(rand, ['#9cb9b6', '#a6c0bb', '#93b2b0']);
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(x + width * 0.2, y + height * 0.15, width * 0.35, height * 0.2);
    ctx.fillStyle = 'rgba(96, 150, 62, 0.85)';
    for (let a = 4; a < (vertical ? width : height); a += 6) {
      for (let b = 3; b < (vertical ? height : width); b += 6) ctx.fillRect(x + (vertical ? a : b), y + (vertical ? b : a), 2, 2);
    }
    return;
  }
  const ripe = kind > 0.84;
  ctx.fillStyle = ripe ? pick(rand, ['#c2b552', '#cbbb58', '#b4b04a']) : pick(rand, ['#79b042', '#86bb48', '#6fa63d', '#8fc04e']);
  ctx.fillRect(x, y, width, height);
  for (let a = 2; a < (vertical ? width : height); a += 4) {
    ctx.fillStyle = a % 8 < 4 ? 'rgba(40, 80, 20, 0.22)' : 'rgba(230, 245, 150, 0.16)';
    if (vertical) ctx.fillRect(x + a, y, 1.5, height);
    else ctx.fillRect(x, y + a, width, 1.5);
  }
}

const grounds = {
  'ruong-lua'({ renderer }) {
    const rand = seeded('ruong-lua');
    const map = canvasTexture(512, (ctx, size) => {
      const edges = [];
      for (let x = 0; x < size;) {
        let width = 64 + Math.floor(rand() * 72);
        if (size - x - width < 48) width = size - x;
        for (let y = 0; y < size;) {
          let height = 56 + Math.floor(rand() * 88);
          if (size - y - height < 40) height = size - y;
          paintPlot(ctx, x, y, width, height, rand);
          edges.push([x, y, width, 'h'], [x, y, height, 'v']);
          y += height;
        }
        x += width;
      }
      const dyke = 5;
      for (const [x, y, length, direction] of edges) {
        for (const shift of [0, size]) {
          if (direction === 'h') {
            ctx.fillStyle = '#857650';
            ctx.fillRect(x, y - dyke / 2 + shift, length, dyke);
            ctx.fillRect(x, y - dyke / 2 - shift, length, dyke);
            ctx.fillStyle = '#7f9a48';
            ctx.fillRect(x, y - 1 + shift, length, 1.5);
            ctx.fillRect(x, y - 1 - shift, length, 1.5);
          } else {
            ctx.fillStyle = '#857650';
            ctx.fillRect(x - dyke / 2 + shift, y, dyke, length);
            ctx.fillRect(x - dyke / 2 - shift, y, dyke, length);
            ctx.fillStyle = '#7f9a48';
            ctx.fillRect(x - 1 + shift, y, 1.5, length);
            ctx.fillRect(x - 1 - shift, y, 1.5, length);
          }
        }
      }
    }, renderer, 64);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0 });
  },
};

// Lưỡng long chầu nguyệt trên nóc một mái addRoof: mặt trăng (đĩa đỏ, vòng lửa vàng) giữa nóc, hai rồng uốn khúc hai
// bên ngẩng đầu chầu vào. scale theo bề dài nóc.
function ridgeDragons(ctx, spec, scale) {
  const { batch, m, env } = ctx;
  const top = spec.y + spec.rise + 0.19;
  const cx = (spec.x0 + spec.x1) / 2;
  const cz = (spec.z0 + spec.z1) / 2;
  const gold = m.gold;
  const moonY = top + 0.75 * scale;
  batch.add(new THREE.BoxGeometry(0.12 * scale, 0.45 * scale, 0.12 * scale), gold, { position: [cx, top + 0.2 * scale, cz] });
  batch.add(new THREE.CylinderGeometry(0.38 * scale, 0.38 * scale, 0.1 * scale, 18), env.material('#d8452a', { roughness: 0.5 }), {
    position: [cx, moonY, cz], rotation: [Math.PI / 2, 0, 0],
  });
  batch.add(new THREE.TorusGeometry(0.46 * scale, 0.06 * scale, 6, 20), gold, { position: [cx, moonY, cz] });
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    batch.add(new THREE.ConeGeometry(0.07 * scale, 0.26 * scale, 5), gold, {
      position: [cx + Math.cos(angle) * 0.6 * scale, moonY + Math.sin(angle) * 0.6 * scale, cz], rotation: [0, 0, angle - Math.PI / 2],
    });
  }
  for (const side of [-1, 1]) {
    const point = (dx, dy) => new THREE.Vector3(cx + side * dx * scale, top + dy * scale, cz);
    const curve = new THREE.CatmullRomCurve3([
      point(0.8, 0.62), point(1.3, 0.85), point(1.85, 0.32), point(2.45, 0.66), point(3.05, 0.22), point(3.55, 0.5), point(3.8, 0.95),
    ]);
    batch.add(new THREE.TubeGeometry(curve, 36, 0.11 * scale, 6), gold);
    const head = point(0.66, 0.66);
    batch.add(new THREE.BoxGeometry(0.42 * scale, 0.3 * scale, 0.3 * scale), gold, { position: head.toArray(), rotation: [0, 0, side * 0.25] });
    batch.add(new THREE.ConeGeometry(0.12 * scale, 0.32 * scale, 6), gold, { position: point(0.38, 0.62).toArray(), rotation: [0, 0, side * Math.PI / 2] });
    for (const dz of [-0.09, 0.09]) {
      batch.add(new THREE.ConeGeometry(0.035 * scale, 0.32 * scale, 4), gold, {
        position: [head.x + side * 0.12 * scale, head.y + 0.24 * scale, cz + dz * scale], rotation: [0, 0, -side * 0.7],
      });
    }
    for (let t = 0.12; t < 0.95; t += 0.11) {
      const p = curve.getPointAt(t);
      batch.add(new THREE.ConeGeometry(0.05 * scale, 0.2 * scale, 4), gold, { position: [p.x, p.y + 0.12 * scale, p.z] });
    }
  }
}

// Chùa gốc (mái chồng diêm, đầu đao theo theme.temple) + lưỡng long chầu nguyệt trên nóc mái trên và nóc cửa giữa cổng.
function temple(ctx) {
  const parts = buildTemple(ctx);
  const ridge = parts.roofs.upper || parts.roofs.main;
  ridgeDragons(ctx, ridge, Math.min(1.25, (ridge.x1 - ridge.x0) / 2 / 4.4));
  const gate = parts.gate?.roofs?.find((roof) => Math.abs((roof.x0 + roof.x1) / 2) < 0.01);
  if (gate) ridgeDragons(ctx, gate, (gate.x1 - gate.x0) / 2 / 4.4);
  return parts;
}

export const kit = { trees, scatter, mountains, grounds, temple };
