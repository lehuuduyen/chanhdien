// Thư viện điểm đặc trưng dùng chung cho nhiều tiểu bang (KE_HOACH_BANG.md mục 4). Bộ đồ một bang ở landmarks/<mã>.mjs:
//   export const kit = {
//     landmarks: { kiểu(batch, x, z, scale, rand, env, { face, side, haze, params }) },  // điểm nhìn xa
//     scatter: { kiểu(batch, x, z, size, rand, env) },                                   // vật rải ngoài tường
//   };
// Điểm nhìn xa tìm ở bộ đồ bang → bộ đồ vùng (landscape/<vùng>.mjs) → file này; vật rải tìm ở bộ đồ bang → file này →
// bộ đồ vùng → landscape/common.mjs.
// (x, z): vị trí theo side / distance / offset trong dữ liệu bang (landmarkPoint); face: góc quay để mặt trước (+z cục
// bộ) nhìn về giữa sân; params: tham số riêng trong dữ liệu bang.
// batch.add(geometry, vật liệu, { position, rotation, scale, order }): rotation theo thứ tự Euler `order` (mặc định 'XYZ':
// trục nghiêng là trục thế giới). Vật vừa nghiêng vừa quay hướng ([nghiêng, hướng, 0]) phải dùng order: 'YXZ', hoặc
// nghiêng sẵn hình (geometry.rotateX) rồi chỉ quay hướng — nếu không, vật quay hướng khác cổng sẽ nghiêng sai trục.
// env như bộ đồ vùng (material, colors, midZ, ground…) thêm:
//   far(màu, { haze, …thêm }) vật liệu xa (chỉ chịu haze phần sương) — dùng cho điểm nhìn xa để đứng xa vẫn thấy;
//   nightGlow(x, y, z, cỡ, màu) / nightPoints([[x, y, z]…], { color, size }) / nightMesh(geometry, màu, độ đậm,
//   { vertexColors }) (vertexColors: nhân màu đỉnh của hình, vd. hình từ paintMerge): đèn chỉ sáng khi tối (vẽ sau lớp
//   phủ đêm). nightGlow / nightMesh mỗi lần gọi một lệnh vẽ; nightPoints gom mọi lần gọi cùng màu + cỡ (kể cả từ vật
//   rải) thành một. add(object): thêm vật riêng (không gộp, vd. vật chuyển động);
//   animate(fn(giây)): gọi mỗi khung khi camera ở sân — giữ thật rẻ (đổi rotation / position vài vật).
// Điểm nhìn xa chung: sea, lighthouse, suspension-bridge, capitol, hills, dunes, sailboats, farmstead, covered-bridge,
// skyline. Vật rải chung (scatter dưới cùng file): ranch-fence, cow, seagrass, bison, cabin.
// Tiện ích dựng hình trong file này: frame, outward, sweep (khối uốn theo đường cong), along (bảng bề dày), ridge (dãy
// núi / vách đá bằng lưới cao độ), beam (thanh nối hai điểm), paintMerge (gộp nhiều màu thành một hình cho vật chuyển
// động).
// Khối gộp theo màu đỉnh như phong cảnh vùng: dùng env.far / env.material thoải mái, nhiều màu không tốn lệnh vẽ.
import * as THREE from 'three';

// Điểm theo hệ quay của vật (dx sang phải, dz ra trước, yaw = face).
export const frame = (x, z, yaw) => (dx, dy, dz) => [x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, dy, z - Math.sin(yaw) * dx + Math.cos(yaw) * dz];

// Hướng "ra ngoài" (xa sân) của một phía: [dx, dz].
export const outward = (side) => ({ gate: [0, 1], back: [0, -1], east: [1, 0], west: [-1, 0] }[side] || [0, 1]);

// Khối ống dày mỏng tùy chỗ chạy theo một đường cong phẳng (vòm đá, cổng vòm, cầu vòm…). points: [[x, y, z]…] (đường
// Catmull-Rom), axis: pháp tuyến mặt phẳng chứa đường (bề dày "sâu"), radius(t) → [bề dày trong mặt phẳng, bề sâu]
// theo t 0–1 dọc đường; from / to: chỉ lấy một đoạn (để đoạn khác màu khác); wobble(t, góc) → hệ số méo mặt cắt (đá
// lồi lõm; hàm của t nên các đoạn nối khít). Hai đầu để hở (chôn xuống đất).
export function sweep(points, { axis, radius, steps = 24, radial = 7, from = 0, to = 1, wobble = null }) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, 'centripetal');
  const depth = new THREE.Vector3(...axis).normalize();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const positions = [];
  const index = [];
  for (let step = 0; step <= steps; step += 1) {
    const t = from + (to - from) * (step / steps);
    const point = curve.getPointAt(t);
    curve.getTangentAt(t, tangent);
    normal.crossVectors(tangent, depth).normalize();
    const [across, deep] = radius(t);
    for (let side = 0; side < radial; side += 1) {
      const angle = (side / radial) * Math.PI * 2;
      const k = wobble ? wobble(t, angle) : 1;
      const c = Math.cos(angle) * across * k;
      const s = Math.sin(angle) * deep * k;
      positions.push(point.x + normal.x * c + depth.x * s, point.y + normal.y * c + depth.y * s, point.z + normal.z * c + depth.z * s);
    }
  }
  for (let step = 0; step < steps; step += 1) {
    for (let side = 0; side < radial; side += 1) {
      const a = step * radial + side;
      const b = step * radial + ((side + 1) % radial);
      index.push(a, a + radial, b, b, a + radial, b + radial);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

// Dãy núi / vách đá dài dựng bằng lưới cao độ, mặt quay về sân: t dọc dãy (−span/2…span/2 m), v từ chân (0) lên đỉnh
// (1), chân ở (x, z), đỉnh lùi ra xa sân `depth` m. crest(t): độ cao đỉnh; rise(v): tỷ lệ độ cao theo v; bands:
// [[v0, v1, vật liệu]…] tô màu theo dải; ribs: biên độ gân đá dọc (m); jag: độ lởm chởm (m, tăng dần lên đỉnh).
export function ridge(batch, x, z, { side, span, depth, crest, rise = (v) => v, bands, ribs = 0, jag = 0, columns = 60, rows = 10, phase = 0 }) {
  const [ox, oz] = outward(side);
  const ax = oz ? 1 : 0;
  const az = ox ? 1 : 0;
  // Mặt núi quay về sân: phía cổng / tây giữ chiều tam giác, phía sau / đông đảo chiều (trục dọc dãy đổi hướng).
  const flip = oz < 0 || ox > 0;
  const hash = (i, v) => {
    const s = Math.sin(i * 127.1 + Math.round(v * 1000) * 0.311 + phase * 13.7) * 43758.5453;
    return s - Math.floor(s);
  };
  for (const [v0, v1, material] of bands) {
    const positions = [];
    const index = [];
    const steps = Math.max(1, Math.round((v1 - v0) * rows));
    for (let i = 0; i <= columns; i += 1) {
      const t = (i / columns - 0.5) * span;
      const rib = Math.sin(t * 0.9 + phase) * 0.6 + Math.sin(t * 0.37 + phase * 2) * 0.4;
      for (let j = 0; j <= steps; j += 1) {
        const v = v0 + (v1 - v0) * (j / steps);
        const y = crest(t) * rise(v) * (1 + (ribs ? rib * 0.06 * v : 0)) + (hash(i, v) - 0.5) * jag * v - 0.5;
        const d = v * depth + rib * ribs * v;
        positions.push(x + ax * t + ox * d, y, z + az * t + oz * d);
      }
    }
    const stride = steps + 1;
    for (let i = 0; i < columns; i += 1) {
      for (let j = 0; j < steps; j += 1) {
        const a = i * stride + j;
        if (flip) index.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
        else index.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    batch.add(geometry, material);
  }
}

// Thanh thẳng (hộp vuông cạnh `size`) nối hai điểm a, b: dây cáp, cột buồm, thanh giằng.
export function beam(batch, a, b, size, material) {
  const from = new THREE.Vector3(...a);
  const dir = new THREE.Vector3(...b).sub(from);
  const length = dir.length();
  if (length < 1e-6) return;
  const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  batch.add(new THREE.BoxGeometry(size, length, size), material, {
    position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rotation: [rotation.x, rotation.y, rotation.z],
  });
}

// Nội suy tuyến tính theo bảng [[t, giá trị]…] (t tăng dần): bề dày dọc đường của sweep.
export const along = (table) => (t) => {
  for (let index = 1; index < table.length; index += 1) {
    const [t1, v1] = table[index];
    if (t <= t1) {
      const [t0, v0] = table[index - 1];
      return v0 + (v1 - v0) * ((t - t0) / Math.max(1e-6, t1 - t0));
    }
  }
  return table[table.length - 1][1];
};

// Gộp nhiều khối nhiều màu thành một hình có màu đỉnh, cho vật chuyển động cả khối (env.add + vật liệu
// env.far('#ffffff', { vertexColors: true })). parts: [[geometry, màu, { position, rotation, scale, order }?]…].
export function paintMerge(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  const color = new THREE.Color();
  for (const [geometry, paint, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], order = 'XYZ' } = {}] of parts) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation, order)), new THREE.Vector3(...scale)));
    if (!flat.attributes.normal) flat.computeVertexNormals();
    color.set(paint);
    positions.push(...flat.attributes.position.array);
    normals.push(...flat.attributes.normal.array);
    for (let index = 0; index < flat.attributes.position.count; index += 1) colors.push(color.r, color.g, color.b);
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return merged;
}

const landmarks = {
  // Mặt biển từ đường (x, z) ra xa về phía side, bờ có đá lô nhô. params: { color, shallow, width (m dọc bờ), rocks }.
  sea(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const water = env.far(params.color || '#3f6f8a', { haze: Math.max(haze, 0.5), roughness: 0.3, metalness: 0.08 });
    const shallow = env.far(params.shallow || '#5f93a6', { haze: Math.max(haze, 0.5), roughness: 0.35 });
    const width = params.width || 560;
    const depth = 260;
    const along = ox ? [0, 1] : [1, 0];
    const center = [x + ox * depth / 2, z + oz * depth / 2];
    // Mỗi phía một độ cao hơi khác: hai mặt biển chồng góc nhau không nhấp nháy.
    const lift = { gate: 0, east: 0.006, west: 0.012, back: 0.018 }[side] || 0;
    const plane = (w, d, cx, cz, material, y) => batch.add(new THREE.PlaneGeometry(ox ? d : w, ox ? w : d), material, {
      position: [cx, y + lift, cz], rotation: [-Math.PI / 2, 0, 0],
    });
    plane(width, depth, center[0] + along[0] * 0, center[1], water, 0.04);
    plane(width, 6, x + ox * 3, z + oz * 3, shallow, 0.05);
    const rock = env.far('#6d6a63', { haze, flatShading: true, roughness: 1 });
    const rockDark = env.far('#57534d', { haze, flatShading: true, roughness: 1 });
    // Đá chỉ ở đoạn bờ nhìn thấy từ sân (xa hơn sương che gần hết).
    for (let t = -150; t < 150; t += 6 + rand() * 6) {
      if (params.rocks === false) break;
      const size = (0.8 + rand() * 1.8) * scale;
      const px = x + along[0] * t + ox * (rand() * 3 - 1);
      const pz = z + along[1] * t + oz * (rand() * 3 - 1);
      batch.add(new THREE.DodecahedronGeometry(size, 0), rand() < 0.5 ? rock : rockDark, {
        position: [px, size * 0.25, pz], rotation: [rand() * 3, rand() * 3, 0], scale: [1.4, 0.7, 1.1],
      });
    }
  },

  // Hải đăng trên mỏm đá: thân tròn thon (dải màu tùy chọn), ban công, phòng đèn, mái chóp, nhà người gác; ban đêm đèn sáng
  // và hai luồng sáng quay. params: { height (m), cliff (m, vách đá dưới chân), body, band, bands (số dải), spiral (số vòng
  // sọc xoắn, thay cho bands), plinth (màu bệ tám cạnh), elevation (m, nâng tháp lên địa hình tự dựng), roof, house,
  // houseRoof, rocks }.
  lighthouse(batch, x, z, scale, rand, env, { face, haze, params }) {
    // cliff: dựng khối vách tròn dưới chân; elevation: chỉ nâng tháp lên (đứng trên địa hình bang tự dựng, vd. mỏm đá).
    const mesa = (params.cliff || 0) * scale;
    const cliff = mesa + (params.elevation || 0) * scale;
    const at0 = frame(x, z, face);
    const at = (dx, dy, dz) => at0(dx, dy + cliff, dz);
    const height = (params.height || 22) * scale;
    const body = env.far(params.body || '#f4f1e8', { haze });
    const band = env.far(params.band || '#b3261e', { haze });
    const dark = env.far(params.roof || '#2c2c2c', { haze });
    const glass = env.far('#3a4a50', { haze, roughness: 0.3 });
    const base = 2.1 * scale;
    const top = 1.35 * scale;
    // Vách đá: khối đá lớn chồng lên, mặt trên phẳng phủ cỏ để tháp và nhà đứng.
    if (mesa > 0) {
      const stone = env.far(params.stone || '#8e887c', { haze, flatShading: true, roughness: 1 });
      const grass = env.far('#6f8a4a', { haze, flatShading: true, roughness: 1 });
      batch.add(new THREE.CylinderGeometry(13 * scale, 17 * scale, mesa, 9), stone, { position: [x - Math.cos(face) * 3 * scale, mesa / 2, z + Math.sin(face) * 3 * scale] });
      batch.add(new THREE.CylinderGeometry(13.2 * scale, 13.2 * scale, 0.4 * scale, 9), grass, { position: [x - Math.cos(face) * 3 * scale, mesa + 0.2 * scale, z + Math.sin(face) * 3 * scale] });
      for (let index = 0; index < 10; index += 1) {
        const angle = (index / 10) * Math.PI * 2 + rand() * 0.3;
        const size = (3 + rand() * 3) * scale;
        batch.add(new THREE.DodecahedronGeometry(size, 0), stone, {
          position: [x + Math.cos(angle) * 15 * scale, size * 0.5, z + Math.sin(angle) * 15 * scale], rotation: [rand() * 3, rand() * 3, 0], scale: [1.2, 0.9, 1.1],
        });
      }
    }
    // Mỏm đá dưới chân.
    if (params.rocks !== false && !cliff) {
      const rock = env.far('#6d6a63', { haze, flatShading: true, roughness: 1 });
      for (let index = 0; index < 9; index += 1) {
        const angle = (index / 9) * Math.PI * 2 + rand() * 0.4;
        const reach = (3 + rand() * 4) * scale;
        const size = (1.6 + rand() * 1.6) * scale;
        batch.add(new THREE.DodecahedronGeometry(size, 0), rock, {
          position: [x + Math.cos(angle) * reach, size * 0.3, z + Math.sin(angle) * reach], rotation: [rand() * 3, rand() * 3, 0], scale: [1.3, 0.75, 1.1],
        });
      }
    }
    // Bệ gạch tám cạnh dưới chân tháp (params.plinth = màu).
    if (params.plinth) batch.add(new THREE.CylinderGeometry(base * 1.3, base * 1.4, 3 * scale, 8), env.far(params.plinth, { haze, flatShading: true }), { position: [x, cliff + 1.5 * scale, z] });
    // Thân: chia đoạn để có dải màu ngang (bands), hoặc sọc xoắn (spiral = số vòng xoắn, như hải đăng Cape Hatteras).
    const radiusAt = (y) => base + (top - base) * (y / height);
    if (params.spiral) {
      const rows = 18;
      const sectors = 12;
      for (let row = 0; row < rows; row += 1) {
        const y0 = (row / rows) * height;
        const y1 = ((row + 1) / rows) * height;
        for (let sector = 0; sector < sectors; sector += 1) {
          // Hai sọc sẫm hai sọc sáng xoắn quanh thân.
          const turn = (sector / sectors) * 2 + (row / rows) * params.spiral * 2;
          batch.add(new THREE.CylinderGeometry(radiusAt(y1), radiusAt(y0), y1 - y0, 2, 1, true, (sector / sectors) * Math.PI * 2, (Math.PI * 2) / sectors), turn % 1 < 0.5 ? band : body, {
            position: [x, cliff + (y0 + y1) / 2, z],
          });
        }
      }
    } else {
      const bands = params.bands ?? (params.band ? 1 : 0);
      const segments = Math.max(1, bands * 2 + 1);
      for (let index = 0; index < segments; index += 1) {
        const y0 = (index / segments) * height;
        const y1 = ((index + 1) / segments) * height;
        batch.add(new THREE.CylinderGeometry(radiusAt(y1), radiusAt(y0), y1 - y0, 14), index % 2 && bands ? band : body, { position: [x, cliff + (y0 + y1) / 2, z] });
      }
    }
    const crown = cliff + height;
    batch.add(new THREE.CylinderGeometry(top + 0.6 * scale, top + 0.6 * scale, 0.3 * scale, 14), dark, { position: [x, crown + 0.15 * scale, z] });
    batch.add(new THREE.TorusGeometry(top + 0.55 * scale, 0.05 * scale, 4, 16), dark, { position: [x, crown + 0.85 * scale, z], rotation: [Math.PI / 2, 0, 0] });
    batch.add(new THREE.CylinderGeometry(top * 0.8, top * 0.8, 1.8 * scale, 10), glass, { position: [x, crown + 1.2 * scale, z] });
    batch.add(new THREE.ConeGeometry(top, 1.3 * scale, 12), dark, { position: [x, crown + 2.75 * scale, z] });
    batch.add(new THREE.SphereGeometry(0.25 * scale, 8, 6), dark, { position: [x, crown + 3.5 * scale, z] });
    // Nhà người gác cạnh chân tháp, mặt quay về sân.
    if (params.house !== false) {
      const wall = env.far(params.houseWall || '#f2eee4', { haze });
      const roof = env.far(params.houseRoof || '#b3261e', { haze, flatShading: true });
      const w = 7 * scale;
      const d = 4.5 * scale;
      const h = 3.2 * scale;
      batch.add(new THREE.BoxGeometry(w, h, d), wall, { position: at(-5.5 * scale, h / 2 + 0.6 * scale, -1 * scale), rotation: [0, face, 0] });
      for (const s of [-1, 1]) {
        const slope = new THREE.BoxGeometry(w + 0.6 * scale, 0.18 * scale, d * 0.62);
        slope.rotateX(s * 0.62);
        batch.add(slope, roof, { position: at(-5.5 * scale, h + 0.6 * scale + 0.8 * scale, -1 * scale + s * d * 0.25), rotation: [0, face, 0] });
      }
    }
    // Ban đêm: đèn sáng và hai luồng sáng quay quanh tháp.
    const lampY = cliff + height + 1.2 * scale;
    env.nightGlow(x, lampY, z, 7 * scale, '#fff1c4');
    const beam = new THREE.ConeGeometry(1.8 * scale, 30 * scale, 10, 1, true);
    beam.translate(0, -15 * scale, 0);
    beam.rotateZ(Math.PI / 2);
    const twin = beam.clone().rotateY(Math.PI);
    const beams = env.nightMesh(BufferMerge([beam, twin]), '#fff3c4', 0.08);
    beams.position.set(x, lampY, z);
    env.animate((seconds) => { beams.rotation.y = seconds * 0.9; });
  },

  // Cầu treo: hai tháp (cổng nhiều xà ngang), hai dây cáp chính võng giữa hai tháp và xuôi về hai mố neo, dây treo
  // thẳng đứng, mặt cầu có dàn cứng, cầu dẫn trên trụ; ban đêm đèn dọc mặt cầu + dây cáp, đèn đỏ đỉnh tháp. Trục cầu dọc
  // tường, xoay `yaw` độ ra phía xa sân; (x, z) là giữa nhịp chính. params: { span (m, nhịp chính), sideSpan (tỷ lệ nhịp
  // biên), approach (m, cầu dẫn mỗi đầu), drop (độ cao đầu cầu dẫn / mặt cầu, 0–1, mặc định 1 = phẳng), deck, tower (m, cao
  // mặt cầu / đỉnh tháp), width (m), color, truss (màu dàn),
  // struts (số xà ngang trên mặt cầu), twin (m, khoảng cách tới cầu song song thứ hai, 0 = không), lights, yaw, style
  // ('masonry': tháp đá khối liền có hai cửa vòm nhọn, màu `stone`) }.
  'suspension-bridge'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const yaw = ((params.yaw || 0) * Math.PI) / 180;
    const bx = ax * Math.cos(yaw) + ox * Math.sin(yaw);
    const bz = az * Math.cos(yaw) + oz * Math.sin(yaw);
    const main = (params.span || 160) * scale;
    const sideSpan = (params.sideSpan ?? 0.35) * main;
    const approach = (params.approach ?? 30) * scale;
    const deckY = (params.deck || 16) * scale;
    const towerH = (params.tower || 50) * scale;
    const width = (params.width || 9) * scale;
    const turn = Math.atan2(-bz, bx);
    const steel = env.far(params.color || '#c0362c', { haze, flatShading: true, roughness: 0.7 });
    const truss = env.far(params.truss || params.color || '#c0362c', { haze, flatShading: true, roughness: 0.8 });
    const concrete = env.far('#9c968c', { haze, flatShading: true, roughness: 1 });
    const stone = env.far(params.stone || '#a8987a', { haze, flatShading: true, roughness: 1 });
    const gap = env.far('#2f2c28', { haze, flatShading: true, roughness: 1 });
    const lights = [];
    const red = [];
    const one = (offset) => {
      // Tọa độ cầu: s dọc trục cầu, w ngang mặt cầu.
      const P = (s, y, w) => [x + bx * s - bz * (w + offset), y, z + bz * s + bx * (w + offset)];
      const end = main / 2 + sideSpan;
      batch.add(new THREE.BoxGeometry(2 * end, 1.4 * scale, width), steel, { position: P(0, deckY, 0), rotation: [0, turn, 0] });
      batch.add(new THREE.BoxGeometry(2 * end, 2.6 * scale, width * 0.9), truss, { position: P(0, deckY - 2 * scale, 0), rotation: [0, turn, 0] });
      // Cầu dẫn: mặt cầu dốc từ mố neo xuống thấp dần (params.drop: tỷ lệ độ cao còn lại ở đầu cầu), trụ bê tông cách đều.
      const low = deckY * (params.drop ?? 1);
      const deckAt = (a) => (a <= end ? deckY : deckY + (low - deckY) * Math.min(1, (a - end) / approach));
      for (const sign of [-1, 1]) {
        if (approach > 0) {
          const ramp = new THREE.BoxGeometry(Math.hypot(approach, deckY - low), 1.4 * scale, width * 0.92);
          ramp.rotateZ(sign * Math.atan2(deckY - low, approach) * -1);
          batch.add(ramp, steel, { position: P(sign * (end + approach / 2), (deckY + low) / 2, 0), rotation: [0, turn, 0] });
        }
        for (let s = end + 12 * scale; s < end + approach; s += 20 * scale) {
          const h = deckAt(s);
          batch.add(new THREE.BoxGeometry(1.6 * scale, h, width * 0.6), concrete, { position: P(sign * s, h / 2, 0), rotation: [0, turn, 0] });
        }
        // Mố neo cáp.
        batch.add(new THREE.BoxGeometry(9 * scale, deckY + 3 * scale, width * 1.5), concrete, { position: P(sign * end, (deckY + 3 * scale) / 2, 0), rotation: [0, turn, 0] });
      }
      for (const sign of [-1, 1]) {
        const s0 = (sign * main) / 2;
        // Bệ tháp dưới nước.
        batch.add(new THREE.BoxGeometry(8 * scale, 5 * scale, width * 1.7), concrete, { position: P(s0, 1.5 * scale, 0), rotation: [0, turn, 0] });
        if (params.style === 'masonry') {
          // Tháp đá khối liền (kiểu cầu Brooklyn): thân thu nhẹ, hai cửa vòm nhọn cho hai làn đường, gờ đỉnh.
          const block = new THREE.BoxGeometry(7 * scale, towerH, width * 1.9);
          block.translate(0, towerH / 2, 0);
          batch.add(block, stone, { position: P(s0, 0, 0), rotation: [0, turn, 0] });
          batch.add(new THREE.BoxGeometry(7.8 * scale, 1.6 * scale, width * 2.05), stone, { position: P(s0, towerH - 0.8 * scale, 0), rotation: [0, turn, 0] });
          const archH = (towerH - deckY) * 0.5;
          const archW = width * 0.42;
          for (const face of [-1, 1]) {
            for (const w of [-width * 0.42, width * 0.42]) {
              batch.add(new THREE.BoxGeometry(0.3 * scale, archH, archW), gap, { position: P(s0 + face * 3.55 * scale, deckY + archH / 2, w), rotation: [0, turn, 0] });
              const point = new THREE.BoxGeometry(0.3 * scale, archW * 0.7071, archW * 0.7071);
              point.rotateX(Math.PI / 4);
              batch.add(point, gap, { position: P(s0 + face * 3.55 * scale, deckY + archH, w), rotation: [0, turn, 0] });
            }
          }
          red.push(P(s0, towerH + 0.6 * scale, 0));
          continue;
        }
        // Hai chân tháp thu nhỏ dần theo ba đoạn; xà ngang nối hai chân.
        const pieces = [[0, 0.45, 1], [0.45, 0.78, 0.85], [0.78, 1, 0.7]];
        for (const w of [-width / 2 - 0.6 * scale, width / 2 + 0.6 * scale]) {
          for (const [a, b, k] of pieces) {
            const h = (b - a) * towerH;
            batch.add(new THREE.BoxGeometry(3.6 * k * scale, h, 2.6 * k * scale), steel, { position: P(s0, a * towerH + h / 2, w), rotation: [0, turn, 0] });
          }
          red.push(P(s0, towerH + 0.6 * scale, w));
        }
        const struts = params.struts ?? 4;
        for (let index = 0; index < struts; index += 1) {
          const y = deckY + (towerH - deckY) * (0.25 + (0.73 * index) / Math.max(1, struts - 1));
          batch.add(new THREE.BoxGeometry(2.2 * scale, 2 * scale, width + 1.2 * scale), steel, { position: P(s0, y, 0), rotation: [0, turn, 0] });
        }
        batch.add(new THREE.BoxGeometry(2.2 * scale, 2 * scale, width + 1.2 * scale), steel, { position: P(s0, deckY - 5 * scale, 0), rotation: [0, turn, 0] });
      }
      // Dây cáp chính: võng parabol giữa hai tháp, xuôi về mố neo hai đầu; dây treo đứng mỗi ~7 m.
      const cable = (s) => {
        const a = Math.abs(s);
        if (a <= main / 2) return deckY + 2 * scale + (towerH - deckY - 2 * scale) * ((2 * s) / main) ** 2;
        const u = Math.min(1, (a - main / 2) / sideSpan);
        return deckY + 1.5 * scale + (towerH - deckY - 1.5 * scale) * (1 - u) ** 1.5;
      };
      const across = [-bz, 0, bx];
      for (const w of [-width / 2 - 0.6 * scale, width / 2 + 0.6 * scale]) {
        const points = [];
        for (let step = 0; step <= 40; step += 1) {
          const s = -end + (step / 40) * 2 * end;
          points.push(P(s, cable(s), w));
        }
        batch.add(sweep(points, { axis: across, radius: () => [0.45 * scale, 0.45 * scale], steps: 60, radial: 4 }), steel);
        for (let s = -end + 7 * scale; s < end - 3 * scale; s += 7 * scale) {
          if (Math.abs(Math.abs(s) - main / 2) < 3 * scale) continue;
          const h = cable(s) - deckY;
          if (h < 1) continue;
          batch.add(new THREE.BoxGeometry(0.18 * scale, h, 0.18 * scale), steel, { position: P(s, deckY + h / 2, w) });
          lights.push(P(s, cable(s) + 0.4 * scale, w));
        }
        for (let s = -end - approach; s <= end + approach; s += 6 * scale) lights.push(P(s, deckAt(Math.abs(s)) + 1.4 * scale, w));
      }
    };
    one(0);
    if (params.twin) one(params.twin * scale);
    env.nightPoints(lights, { color: params.lights || '#ffd89a', size: 0.9 * scale });
    env.nightPoints(red, { color: '#ff3b30', size: 1.4 * scale });
  },

  // Tòa capitol mái vòm: hai cánh nhà dài tân cổ điển (hàng cột), tầng trống tròn có hàng cột bao quanh, mái vòm, đèn lồng
  // và tượng trên đỉnh; ban đêm mái vòm được rọi sáng. Mặt trước quay về sân. params: { width (m, cả hai cánh), dome (màu
  // mái vòm), wall (màu tường), height (m, tới đỉnh tượng), corners (số vòm nhỏ ở góc, 0 / 4) }.
  capitol(batch, x, z, scale, rand, env, { face, haze, params }) {
    const at = frame(x, z, face);
    const width = (params.width || 110) * scale;
    const top = (params.height || 46) * scale;
    const wall = env.far(params.wall || '#ecebe4', { haze, flatShading: true, roughness: 0.9 });
    const shade = env.far(params.trim || '#cfcdc4', { haze, flatShading: true, roughness: 0.9 });
    const domeColor = env.far(params.dome || '#f1efe8', { haze, roughness: 0.6 });
    const dark = env.far('#4b4d52', { haze, flatShading: true, roughness: 0.8 });
    const wingH = top * 0.27;
    const depth = top * 0.6;
    batch.add(new THREE.BoxGeometry(width, wingH, depth), wall, { position: at(0, wingH / 2, 0), rotation: [0, face, 0] });
    batch.add(new THREE.BoxGeometry(width * 1.01, wingH * 0.08, depth * 1.02), shade, { position: at(0, wingH, 0), rotation: [0, face, 0] });
    // Hàng cột và trán tường tam giác ở giữa và hai đầu mặt trước.
    for (const [dx, cols] of [[0, 8], [-width * 0.38, 6], [width * 0.38, 6]]) {
      const span = cols * 2.6 * scale;
      for (let col = 0; col < cols; col += 1) {
        batch.add(new THREE.CylinderGeometry(0.55 * scale, 0.6 * scale, wingH * 0.82, 8), wall, {
          position: at(dx - span / 2 + (col + 0.5) * (span / cols), wingH * 0.41 + wingH * 0.04, depth / 2 + 2 * scale),
        });
      }
      // Lăng trụ tam giác mỏng, đỉnh lên trên, trục theo chiều sâu.
      const pediment = new THREE.CylinderGeometry(span * 0.62, span * 0.62, 1.4 * scale, 3);
      pediment.rotateX(-Math.PI / 2);
      batch.add(pediment, shade, { position: at(dx, wingH + 0.8 * scale, depth / 2 + 1.5 * scale), rotation: [0, face, 0], scale: [1, 0.22, 1] });
      batch.add(new THREE.BoxGeometry(span, 1.2 * scale, 4.5 * scale), shade, { position: at(dx, wingH * 0.9, depth / 2 + 1.6 * scale), rotation: [0, face, 0] });
    }
    // Tầng trống hai bậc có hàng cột, mái vòm cao, đèn lồng, tượng.
    const drumR = top * 0.2;
    const drum1 = top * 0.17;
    batch.add(new THREE.CylinderGeometry(drumR * 1.15, drumR * 1.2, wingH * 0.4, 20), shade, { position: at(0, wingH + wingH * 0.2, 0) });
    const baseY = wingH * 1.4;
    batch.add(new THREE.CylinderGeometry(drumR * 0.94, drumR * 0.94, drum1, 24), wall, { position: at(0, baseY + drum1 / 2, 0) });
    for (let col = 0; col < 24; col += 1) {
      const angle = (col / 24) * Math.PI * 2;
      batch.add(new THREE.CylinderGeometry(0.4 * scale, 0.4 * scale, drum1 * 0.9, 6), wall, {
        position: [at(0, 0, 0)[0] + Math.cos(angle) * drumR * 1.05, baseY + drum1 * 0.45, at(0, 0, 0)[2] + Math.sin(angle) * drumR * 1.05],
      });
    }
    batch.add(new THREE.CylinderGeometry(drumR * 1.1, drumR * 1.1, 1 * scale, 24), shade, { position: at(0, baseY + drum1, 0) });
    const drum2 = top * 0.07;
    batch.add(new THREE.CylinderGeometry(drumR * 0.82, drumR * 0.86, drum2, 24), wall, { position: at(0, baseY + drum1 + drum2 / 2, 0) });
    const domeY = baseY + drum1 + drum2;
    const domeH = top * 0.27;
    const dome = new THREE.SphereGeometry(drumR * 0.84, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, domeH / (drumR * 0.84), 1);
    dome.translate(...at(0, domeY, 0));
    env.nightMesh(dome.clone(), '#fff0cc', 0.32);
    batch.add(dome, domeColor);
    const lantern = domeY + domeH;
    batch.add(new THREE.CylinderGeometry(drumR * 0.16, drumR * 0.18, top * 0.07, 12), wall, { position: at(0, lantern + top * 0.035, 0) });
    batch.add(new THREE.SphereGeometry(drumR * 0.17, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), domeColor, { position: at(0, lantern + top * 0.07, 0) });
    batch.add(new THREE.CylinderGeometry(0.35 * scale, 0.6 * scale, top - lantern - top * 0.1, 6), dark, { position: at(0, (top + lantern + top * 0.1) / 2, 0) });
    env.nightGlow(...at(0, lantern + top * 0.04, 0), 5 * scale, '#fff1c4');
    // Bốn vòm nhỏ ở góc (kiểu capitol Iowa).
    if (params.corners) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const p = at(sx * width * 0.22, wingH, sz * depth * 0.3);
          batch.add(new THREE.CylinderGeometry(drumR * 0.3, drumR * 0.3, top * 0.12, 12), wall, { position: [p[0], wingH + top * 0.06, p[2]] });
          batch.add(new THREE.SphereGeometry(drumR * 0.3, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), domeColor, { position: [p[0], wingH + top * 0.12, p[2]], scale: [1, 1.3, 1] });
        }
      }
    }
  },

  // Dãy đồi / núi thấp dọc tường: đỉnh lượn sóng, tô màu theo dải từ chân lên đỉnh; có thể mở khe (thung lũng / hẻm
  // sông) ở giữa. params: { span, height, depth (m), colors (chân → đỉnh), wave (0–1, độ lượn), freq, jag, ribs,
  // notch: { at (m dọc tường), half (nửa đáy khe), slope (m bề ngang sườn khe) }, trees: { count, colors, size } (cụm tán
  // cây rải trên sườn) }.
  hills(batch, x, z, scale, rand, env, { side, haze, params }) {
    const span = params.span || 460;
    const height = (params.height || 30) * scale;
    const wave = params.wave ?? 0.3;
    const freq = params.freq || 0.02;
    const phase = rand() * 6;
    const notch = params.notch;
    const open = (t) => {
      if (!notch) return 1;
      const k = Math.min(1, Math.max(0, (Math.abs(t - (notch.at || 0)) - notch.half * scale) / (notch.slope * scale)));
      return k * k * (3 - 2 * k);
    };
    const crest = (t) => (height * (1 - wave + wave * (0.5 + 0.5 * Math.sin(t * freq + phase))) + Math.sin(t * freq * 3.7 + phase * 2) * height * 0.05) * open(t);
    const colors = params.colors || ['#4f7a4a', '#3f6845', '#5f7f66'];
    const bands = colors.map((color, index) => [index / colors.length, (index + 1) / colors.length, env.far(color, { haze, flatShading: true, roughness: 1 })]);
    const depth = (params.depth || 60) * scale;
    const rise = (v) => Math.sin((v * Math.PI) / 2) ** 1.2;
    ridge(batch, x, z, { side, span, depth, crest, rise, ribs: params.ribs ?? 2, jag: params.jag ?? 1.5, columns: 90, rows: 10, phase, bands });
    // Cụm tán cây nhiều màu rải trên sườn (rừng thu lốm đốm): params.trees = { count, colors, size }.
    if (params.trees) {
      const [ox, oz] = outward(side);
      const ax = oz ? 1 : 0;
      const az = ox ? 1 : 0;
      const tones = (params.trees.colors || ['#b8452a', '#d0782c', '#c9a03a', '#3f5f3e']).map((color) => env.far(color, { haze, flatShading: true, roughness: 1 }));
      for (let index = 0; index < (params.trees.count || 120); index += 1) {
        const t = (rand() - 0.5) * span * 0.96;
        const v = 0.04 + rand() * 0.8;
        const r = (params.trees.size || 3.5) * scale * (0.7 + rand() * 0.6);
        const d = v * depth;
        batch.add(new THREE.IcosahedronGeometry(r, 0), tones[Math.floor(rand() * tones.length)], {
          position: [x + ax * t + ox * d, crest(t) * rise(v) - 0.5 + r * 0.3, z + az * t + oz * d], scale: [1.2, 0.75, 1.2],
        });
      }
    }
  },

  // Đụn cát ven biển chạy dọc tường: các đụn tròn lượn sóng, cỏ biển mọc trên đỉnh. params: { span, height, depth }.
  dunes(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const span = params.span || 500;
    const height = (params.height || 7) * scale;
    const depth = (params.depth || 18) * scale;
    const phase = rand() * 6;
    const crest = (t) => height * (0.65 + 0.35 * Math.sin(t * 0.045 + phase)) + Math.sin(t * 0.13) * 0.8;
    const rise = (v) => Math.sin(v * Math.PI) ** 0.8;
    ridge(batch, x, z, {
      side, span, depth, crest, rise, columns: 90, rows: 8, phase,
      bands: [[0, 0.5, env.far(params.sand || '#e3cf9f', { haze, flatShading: true, roughness: 1 })], [0.5, 1, env.far(params.back || '#d6bf8c', { haze, flatShading: true, roughness: 1 })]],
    });
    const grass = env.far('#8f9a5a', { haze, flatShading: true, roughness: 1 });
    for (let t = -span / 2; t < span / 2; t += 3 + rand() * 4) {
      const v = 0.35 + rand() * 0.3;
      const d = v * depth;
      batch.add(new THREE.ConeGeometry(0.7 * scale, 1.6 * scale, 5), grass, { position: [x + ax * t + ox * d, crest(t) * rise(v) - 0.2, z + az * t + oz * d], rotation: [0, rand() * 3, 0] });
    }
  },

  // Thuyền buồm trôi trên mặt nước (cả đàn một mesh, bập bềnh và trôi chậm). Phạm vi: dải `depth` m tính từ (x, z) ra xa,
  // dài `width` m dọc tường. params: { count, width, depth, sails (màu buồm) }.
  sailboats(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const sails = params.sails || ['#f7f5ee', '#f7f5ee', '#e9e2cf', '#d9493a', '#2f6db0'];
    const parts = [];
    const width = (params.width || 200) * scale;
    const depth = (params.depth || 60) * scale;
    for (let index = 0; index < (params.count || 8); index += 1) {
      const t = (rand() - 0.5) * width;
      const d = rand() * depth;
      const px = x + ax * t + ox * d;
      const pz = z + az * t + oz * d;
      const size = (0.9 + rand() * 0.5) * scale;
      const yaw = rand() * Math.PI * 2;
      parts.push([new THREE.BoxGeometry(5 * size, 0.9 * size, 1.6 * size), '#f2efe6', { position: [px, 0.45 * size, pz], rotation: [0, yaw, 0] }]);
      parts.push([new THREE.CylinderGeometry(0.06 * size, 0.06 * size, 7 * size, 4), '#5b5148', { position: [px, 4 * size, pz] }]);
      const sail = new THREE.BufferGeometry();
      sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.9, 0, 0, 7.2, 0, 2.4, 0.9, 0, 0, 0.9, 0, 2.4, 0.9, 0, 0, 7.2, 0].map((v) => v * size), 3));
      sail.computeVertexNormals();
      parts.push([sail, sails[Math.floor(rand() * sails.length)], { position: [px, 0, pz], rotation: [0, yaw, 0] }]);
    }
    const mesh = new THREE.Mesh(paintMerge(parts), env.far('#ffffff', { haze, vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
    env.add(mesh);
    env.animate((seconds) => {
      mesh.position.set(ax * Math.sin(seconds * 0.03) * 6 * scale, Math.sin(seconds * 0.9) * 0.12 * scale, az * Math.sin(seconds * 0.03) * 6 * scale);
    });
  },

  // Trang trại: chuồng đỏ mái gãy viền trắng, hai silo tròn mái vòm, vài kiện cỏ khô; cửa sổ sáng ban đêm.
  farmstead(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const red = env.far('#a33a2c', { haze, flatShading: true, roughness: 0.9 });
    const white = env.far('#efece4', { haze, flatShading: true, roughness: 0.9 });
    const roof = env.far('#4b4a48', { haze, flatShading: true, roughness: 0.9 });
    const silo = env.far('#9aa3a8', { haze, flatShading: true, roughness: 0.8 });
    const w = 16 * scale;
    const d = 11 * scale;
    const h = 7 * scale;
    batch.add(new THREE.BoxGeometry(w, h, d), red, { position: at(0, h / 2, 0), rotation: [0, face, 0] });
    for (const s of [-1, 1]) {
      const lower = new THREE.BoxGeometry(w + 0.6 * scale, 0.3 * scale, d * 0.36);
      lower.rotateX(s * 1.05);
      batch.add(lower, roof, { position: at(0, h + 1.4 * scale, s * d * 0.4), rotation: [0, face, 0] });
      const upper = new THREE.BoxGeometry(w + 0.6 * scale, 0.3 * scale, d * 0.34);
      upper.rotateX(s * 0.42);
      batch.add(upper, roof, { position: at(0, h + 3.3 * scale, s * d * 0.16), rotation: [0, face, 0] });
    }
    batch.add(new THREE.BoxGeometry(4 * scale, 4.4 * scale, 0.12), white, { position: at(0, 2.2 * scale, d / 2 + 0.06), rotation: [0, face, 0] });
    for (const [dx, tall] of [[w / 2 + 3.5 * scale, 17], [w / 2 + 8.5 * scale, 14]]) {
      const H = tall * scale;
      batch.add(new THREE.CylinderGeometry(2.3 * scale, 2.3 * scale, H, 14), silo, { position: at(dx, H / 2, -1 * scale) });
      batch.add(new THREE.SphereGeometry(2.35 * scale, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2), silo, { position: at(dx, H, -1 * scale) });
    }
    const hay = env.far('#d8b660', { haze, flatShading: true, roughness: 1 });
    for (let index = 0; index < 5; index += 1) {
      const bale = new THREE.CylinderGeometry(0.75 * scale, 0.75 * scale, 1.2 * scale, 10);
      bale.rotateZ(Math.PI / 2);
      batch.add(bale, hay, { position: at(-w / 2 - 4 * scale - rand() * 10 * scale, 0.75 * scale, d / 2 + 3 * scale + rand() * 8 * scale), rotation: [0, rand() * 3, 0] });
    }
    env.nightPoints([at(-w * 0.3, h * 0.6, d / 2 + 0.2), at(w * 0.3, h * 0.6, d / 2 + 0.2), at(0, 3 * scale, d / 2 + 0.3)], { color: '#ffd28a', size: 1.2 * scale });
  },

  // Cầu có mái: thân hộp gỗ đỏ, mái dốc xám, hai cửa đầu cầu tối, dãy cửa sổ nhỏ; bắc qua suối chảy ra xa, mố đá hai bờ.
  // params: { length (m) }.
  'covered-bridge'(batch, x, z, scale, rand, env, { side, face, haze, params }) {
    const [ox, oz] = outward(side);
    const at = frame(x, z, face);
    const length = (params.length || 26) * scale;
    const red = env.far('#a2342a', { haze, flatShading: true, roughness: 0.9 });
    const roof = env.far('#55585c', { haze, flatShading: true, roughness: 0.9 });
    const dark = env.far('#241c18', { haze, flatShading: true, roughness: 1 });
    const stone = env.far('#8c8a84', { haze, flatShading: true, roughness: 1 });
    const water = env.far('#4f7a86', { haze, flatShading: true, roughness: 0.3 });
    // Suối: dải nước chạy ra xa sân, cầu bắc ngang (thân cầu dọc tường).
    batch.add(new THREE.PlaneGeometry(1, 1), water, { position: [x + ox * 40 * scale, 0.07, z + oz * 40 * scale], rotation: [-Math.PI / 2, 0, 0], scale: ox ? [120 * scale, 10 * scale, 1] : [10 * scale, 120 * scale, 1] });
    for (const sx of [-1, 1]) batch.add(new THREE.BoxGeometry(4 * scale, 3 * scale, 7 * scale), stone, { position: at(sx * (length / 2 - 1 * scale), 1.5 * scale, 0), rotation: [0, face, 0] });
    const w = 6 * scale;
    const h = 5 * scale;
    batch.add(new THREE.BoxGeometry(length, h, w), red, { position: at(0, 3 * scale + h / 2, 0), rotation: [0, face, 0] });
    for (const side2 of [-1, 1]) {
      const slope = new THREE.BoxGeometry(length + 1.2 * scale, 0.3 * scale, w * 0.66);
      slope.rotateX(side2 * 0.62);
      batch.add(slope, roof, { position: at(0, 3 * scale + h + 1.1 * scale, side2 * w * 0.24), rotation: [0, face, 0] });
    }
    for (const sx of [-1, 1]) batch.add(new THREE.BoxGeometry(0.2 * scale, h * 0.8, w * 0.6), dark, { position: at(sx * (length / 2 + 0.05), 3 * scale + h * 0.4, 0), rotation: [0, face, 0] });
    for (let dx = -length / 2 + 3 * scale; dx < length / 2 - 2 * scale; dx += 3.5 * scale) {
      batch.add(new THREE.BoxGeometry(1 * scale, 0.8 * scale, 0.15 * scale), dark, { position: at(dx, 3 * scale + h * 0.62, w / 2 + 0.05), rotation: [0, face, 0] });
    }
  },

  // Đường chân trời thành phố (không tòa nhà có thật): tháp hộp cao dần vào giữa, vài tháp có tầng thu nhỏ / chóp nhọn;
  // ban đêm cửa sổ mặt quay về sân sáng đèn. params: { width (m dọc tường), depth (m), count, low, high (m), colors,
  // lights (màu đèn cửa sổ), neon (màu đèn thứ hai, rải ở tầng thấp và đỉnh), windows (tỷ lệ cửa sổ sáng 0–1), towers
  // (tháp chính đặt tay, xem dưới), crown (màu đèn đỉnh tháp chính, mặc định đỏ hàng không) }.
  skyline(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const width = params.width || 160;
    const depth = params.depth || 40;
    const low = (params.low || 12) * scale;
    const high = (params.high || 50) * scale;
    const colors = (params.colors || ['#8f97a3', '#a8adb4', '#6f7a88', '#b9b2a3']).map((color) => env.far(color, { haze, flatShading: true, roughness: 0.6 }));
    const dark = env.far('#4a5058', { haze, flatShading: true, roughness: 0.5 });
    const windows = [];
    const neon = [];
    const ratio = params.windows ?? 0.4;
    for (let index = 0; index < (params.count || 24); index += 1) {
      const t = (rand() - 0.5) * width;
      const d = rand() * depth;
      // Tháp cao dồn vào giữa cho đường chân trời có dáng.
      const h = low + (high - low) * (0.25 + 0.75 * rand()) * Math.exp(-((t / (width * 0.38)) ** 2));
      const w = (6 + rand() * 8) * scale;
      const deep = (6 + rand() * 8) * scale;
      const px = x + ax * t + ox * d;
      const pz = z + az * t + oz * d;
      const size = ax ? [w, h, deep] : [deep, h, w];
      batch.add(new THREE.BoxGeometry(...size), colors[Math.floor(rand() * colors.length)], { position: [px, h / 2, pz] });
      let top = h;
      if (rand() < 0.35) {
        const step = h * (0.12 + rand() * 0.12);
        batch.add(new THREE.BoxGeometry(size[0] * 0.65, step, size[2] * 0.65), colors[Math.floor(rand() * colors.length)], { position: [px, h + step / 2, pz] });
        top += step;
      }
      if (rand() < 0.15) batch.add(new THREE.ConeGeometry(0.5 * scale, h * 0.18, 5), dark, { position: [px, top + h * 0.09, pz] });
      // Cửa sổ trên mặt quay về sân.
      const face = (ox ? size[0] : size[2]) / 2 + 0.15;
      const across = ax ? size[0] : size[2];
      for (let floor = 2; floor < h - 1; floor += 3.2 * scale) {
        for (let col = -across / 2 + 1.2; col < across / 2 - 0.8; col += 2.4 * scale) {
          const roll = rand();
          if (roll > ratio) continue;
          const point = [px + ax * col - ox * face, floor, pz + az * col - oz * face];
          if (params.neon && (floor < 8 || floor > h - 6) && roll < ratio * 0.35) neon.push(point);
          else windows.push(point);
        }
      }
    }
    // Tháp chính đặt tay (params.towers: [{ t, d, height, width, steps, spire, color }]): thân vuông thu nhỏ dần theo
    // từng nấc (kiểu art deco), chóp nhọn; đèn cửa sổ và đèn đỉnh ban đêm. Dáng chung, không mô phỏng tòa nhà cụ thể.
    const crowns = [];
    for (const tower of params.towers || []) {
      const px = x + ax * (tower.t || 0) * scale + ox * (tower.d || 0) * scale;
      const pz = z + az * (tower.t || 0) * scale + oz * (tower.d || 0) * scale;
      const material = tower.color ? env.far(tower.color, { haze, flatShading: true, roughness: 0.6 }) : colors[0];
      let y = 0;
      let w = (tower.width || 16) * scale;
      const total = (tower.height || 70) * scale;
      const steps = tower.steps || 4;
      for (let step = 0; step < steps; step += 1) {
        const h = steps === 1 ? total : total * (step === 0 ? 0.62 : 0.38 / (steps - 1)) * (step === steps - 1 ? 0.8 : 1);
        batch.add(new THREE.BoxGeometry(w, h, w), material, { position: [px, y + h / 2, pz] });
        for (let floor = y + 2; floor < y + h - 1; floor += 3.2 * scale) {
          for (let col = -w / 2 + 1.2; col < w / 2 - 0.8; col += 2.4 * scale) {
            if (rand() < ratio) windows.push([px + ax * col - ox * (w / 2 + 0.15), floor, pz + az * col - oz * (w / 2 + 0.15)]);
          }
        }
        y += h;
        w *= 0.74;
      }
      crowns.push([px, y + 0.5 * scale, pz]);
      if (tower.spire !== false) {
        const spire = (tower.spire || 0.16) * total;
        batch.add(new THREE.ConeGeometry(w * 0.32, spire, 6), dark, { position: [px, y + spire / 2, pz] });
        crowns.push([px, y + spire * 0.2, pz], [px, y + spire, pz]);
      }
    }
    // Cùng màu + cỡ với đèn cầu treo (#ffd89a / đèn đỏ đỉnh tháp) để gom chung lệnh vẽ khi đặt cạnh nhau.
    if (windows.length) env.nightPoints(windows, { color: params.lights || '#ffd89a', size: 0.9 * scale });
    if (neon.length) env.nightPoints(neon, { color: params.neon, size: 1.1 * scale });
    if (crowns.length) env.nightPoints(crowns, { color: params.crown || '#ff3b30', size: 1.4 * scale });
  },
};

// Gộp vài hình nhỏ (cùng thuộc tính) thành một, không cần addon.
function BufferMerge(list) {
  const positions = [];
  const normals = [];
  for (const geometry of list) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    positions.push(...flat.attributes.position.array);
    normals.push(...flat.attributes.normal.array);
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

// Vật rải dùng ở nhiều bang.
const scatter = {
  // Hàng rào gỗ kiểu zíc zắc (thanh gỗ chéo chồng nhau), dài 8–12 m.
  'ranch-fence'(batch, x, z, size, rand, env) {
    const rail = env.material('#7a6248', { flatShading: true });
    const yaw = rand() * Math.PI;
    const at = frame(x, z, yaw);
    const segments = 4 + Math.floor(rand() * 3);
    for (let index = 0; index < segments; index += 1) {
      const dx = (index - segments / 2) * 2.2 * size;
      const zig = index % 2 ? 0.5 : -0.5;
      for (let level = 0; level < 3; level += 1) {
        batch.add(new THREE.BoxGeometry(2.5 * size, 0.1 * size, 0.1 * size), rail, {
          position: at(dx, (0.35 + level * 0.32) * size, zig * 0.5 * size), rotation: [0, yaw + zig * 0.42, 0],
        });
      }
    }
  },
  // Bò sữa Holstein: thân trắng đốm đen, chân ngắn, đầu nhỏ.
  cow(batch, x, z, size, rand, env) {
    const white = env.material('#f1efe9', { flatShading: true });
    const black = env.material('#1f1f22', { flatShading: true });
    const yaw = rand() * Math.PI * 2;
    const at = frame(x, z, yaw);
    const s = size;
    batch.add(new THREE.BoxGeometry(0.9 * s, 0.8 * s, 1.8 * s), white, { position: at(0, 1.05 * s, 0), rotation: [0, yaw, 0] });
    for (let index = 0; index < 3; index += 1) {
      batch.add(new THREE.BoxGeometry(0.92 * s, 0.4 * s, 0.4 * s), black, { position: at(0, (0.95 + rand() * 0.3) * s, (rand() - 0.5) * 1.3 * s), rotation: [0, yaw, 0] });
    }
    batch.add(new THREE.BoxGeometry(0.45 * s, 0.45 * s, 0.6 * s), black, { position: at(0, 1.25 * s, 1.1 * s), rotation: [0.3, yaw, 0], order: 'YXZ' });
    for (const sx of [-0.3, 0.3]) for (const sz of [-0.7, 0.7]) batch.add(new THREE.BoxGeometry(0.16 * s, 0.7 * s, 0.16 * s), white, { position: at(sx * s, 0.35 * s, sz * s), rotation: [0, yaw, 0] });
  },
  // Cỏ biển: búi lá mảnh xanh vàng.
  seagrass(batch, x, z, size, rand, env) {
    const grass = env.material(rand() < 0.5 ? '#9aa35e' : '#b3a866', { flatShading: true });
    for (let index = 0; index < 5; index += 1) {
      batch.add(new THREE.ConeGeometry(0.12 * size, (0.9 + rand() * 0.7) * size, 3), grass, {
        position: [x + (rand() - 0.5) * 0.8 * size, 0.45 * size, z + (rand() - 0.5) * 0.8 * size], rotation: [(rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.5],
      });
    }
  },
  // Bò rừng bison: u vai cao lông sẫm xù, mông nhỏ, đầu cúi thấp, sừng ngắn cong.
  bison(batch, x, z, size, rand, env) {
    const fur = env.material('#4a3324', { flatShading: true });
    const mane = env.material('#2f2119', { flatShading: true });
    const horn = env.material('#d8d0c0', { flatShading: true });
    const yaw = rand() * Math.PI * 2;
    const at = frame(x, z, yaw);
    const s = size * 1.1;
    batch.add(new THREE.SphereGeometry(0.75 * s, 8, 6), fur, { position: at(0, 1.05 * s, -0.55 * s), rotation: [0, yaw, 0], scale: [0.95, 0.85, 1.1] });
    batch.add(new THREE.SphereGeometry(0.85 * s, 8, 6), mane, { position: at(0, 1.25 * s, 0.35 * s), rotation: [0, yaw, 0], scale: [1, 1.05, 0.95] });
    batch.add(new THREE.SphereGeometry(0.42 * s, 7, 5), mane, { position: at(0, 0.85 * s, 1.15 * s), rotation: [0.4, yaw, 0], order: 'YXZ', scale: [0.9, 1.1, 1.1] });
    for (const side of [-1, 1]) {
      batch.add(new THREE.ConeGeometry(0.07 * s, 0.32 * s, 5), horn, { position: at(side * 0.32 * s, 1.08 * s, 1.15 * s), rotation: [0, yaw, side * 0.9] });
      for (const end of [-0.6, 0.45]) {
        batch.add(new THREE.CylinderGeometry(0.1 * s, 0.08 * s, 0.75 * s, 5), mane, { position: at(side * 0.32 * s, 0.37 * s, end * s), rotation: [0, yaw, 0] });
      }
    }
  },
  // Nhà gỗ: tường gỗ đậm, mái dốc phủ tuyết, ống khói đá, cửa sổ sáng đèn ban đêm.
  cabin(batch, x, z, size, rand, env) {
    const yaw = rand() * Math.PI * 2;
    const at = frame(x, z, yaw);
    const w = (4 + rand() * 1.6) * size;
    const d = (3.4 + rand() * 1) * size;
    const h = 2.4 * size;
    const log = env.material(rand() < 0.5 ? '#6e4a2e' : '#7d5636', { flatShading: true });
    const roof = env.material(cabinRoof(env), { flatShading: true });
    batch.add(new THREE.BoxGeometry(w, h, d), log, { position: at(0, h / 2, 0), rotation: [0, yaw, 0] });
    // Đầu gỗ nhô ở bốn góc.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) batch.add(new THREE.BoxGeometry(0.3 * size, h, 0.3 * size), log, { position: at(sx * (w / 2 + 0.05 * size), h / 2, sz * (d / 2 + 0.05 * size)), rotation: [0, yaw, 0] });
    }
    for (const side of [-1, 1]) {
      const slope = new THREE.BoxGeometry(w + 0.8 * size, 0.25 * size, d * 0.62);
      slope.rotateX(side * 0.6);
      batch.add(slope, roof, { position: at(0, h + 0.8 * size, side * d * 0.24), rotation: [0, yaw, 0] });
    }
    // Hồi nhà: lăng trụ tam giác dọc nóc, đỉnh lên trên.
    const r = d * 0.577;
    const gable = new THREE.CylinderGeometry(r, r, w, 3);
    gable.rotateZ(Math.PI / 2);
    gable.rotateX(-Math.PI / 2);
    batch.add(gable, log, { position: at(0, h + 0.2 * r, 0), rotation: [0, yaw, 0], scale: [1, 0.4, 1] });
    batch.add(new THREE.BoxGeometry(0.6 * size, 2 * size, 0.6 * size), env.material('#8d8a84', { flatShading: true }), { position: at(w * 0.3, h + 0.9 * size, -d * 0.15), rotation: [0, yaw, 0] });
    const glass = env.material('#2b2a2a', { flatShading: true });
    const windows = [];
    for (const dx of [-w * 0.27, w * 0.27]) {
      batch.add(new THREE.BoxGeometry(0.7 * size, 0.6 * size, 0.08), glass, { position: at(dx, h * 0.55, d / 2 + 0.03), rotation: [0, yaw, 0] });
      windows.push(at(dx, h * 0.55, d / 2 + 0.12));
    }
    batch.add(new THREE.BoxGeometry(0.8 * size, 1.7 * size, 0.08), env.material('#4a3220', { flatShading: true }), { position: at(0, 0.85 * size, d / 2 + 0.03), rotation: [0, yaw, 0] });
    env.nightPoints?.(windows, { color: '#ffc46b', size: 0.9 });
  },
};

// Màu mái nhà gỗ theo vùng: vùng tuyết mái trắng, vùng khác mái ván sẫm.
const cabinRoof = (env) => (env.theme?.field === 'snow' ? '#eef2f6' : '#5a4636');

export const kit = { landmarks, scatter };
