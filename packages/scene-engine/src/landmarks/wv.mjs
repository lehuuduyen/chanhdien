// West Virginia (vùng blossom): cầu vòm thép New River Gorge — vòm dàn thép màu gỉ sắt vắt qua hẻm sông sâu rừng phủ
// kín ngoài cổng, mặt cầu nằm ngang mép vách đá cát trên cao; dưới đáy là sông New River có bè vượt thác vàng đỏ. Ban đêm
// đèn dọc mặt cầu. Các lớp núi của vùng ẩn đi; phía đông là đồi rừng (đồi chung `hills`, states/wv.json).
import * as THREE from 'three';
import { outward, ridge, sweep } from './common.mjs';

const landmarks = {
  // (x, z): miệng hẻm. params: { span, height (đỉnh vách, m), slope (m bề ngang sườn hẻm) }.
  'new-river-gorge'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const P = (u, y, d) => [x + ax * u + ox * d, y, z + az * u + oz * d];
    const span = params.span || 460;
    const top = (params.height || 44) * scale;
    const river = 7 * scale;
    const slope = (params.slope || 50) * scale;
    const depth = 100 * scale;
    const phase = rand() * 6;
    const smooth = (a, b, v) => {
      const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    const crest = (t) => (top + Math.sin(t * 0.04 + phase) * 3) * smooth(river, river + slope, Math.abs(t));
    const far = (color) => env.far(color, { haze, flatShading: true, roughness: 1 });
    ridge(batch, x, z, {
      side, span, depth, crest, rise: (v) => Math.min(1, v / 0.25) ** 0.8, ribs: 2, jag: 2, columns: 110, rows: 14, phase,
      bands: [[0, 0.1, far('#3a6a3e')], [0.1, 0.18, far('#2f5a35')], [0.18, 0.23, far('#9a8a70')], [0.23, 1, far('#3c6b42')]],
    });
    // Sông dưới đáy hẻm và bè.
    batch.add(new THREE.PlaneGeometry(1, 1), env.far('#4f7f73', { haze, flatShading: true, roughness: 0.3 }), {
      position: P(0, 0.1, depth / 2), rotation: [-Math.PI / 2, 0, 0], scale: ax ? [river * 2.2, depth, 1] : [depth, river * 2.2, 1],
    });
    for (let index = 0; index < 4; index += 1) {
      const at = P((rand() - 0.5) * river, 0.35 * scale, 8 * scale + index * 9 * scale);
      batch.add(new THREE.BoxGeometry(2.2 * scale, 0.5 * scale, 1.2 * scale), far(index % 2 ? '#e8b623' : '#c93a2c'), { position: at, rotation: [0, rand(), 0] });
    }
    // Mép vách ở độ cao y về phía sign.
    const edge = (y, sign, bury = 2 * scale) => {
      let u = river;
      while (u < river + slope && crest(sign * u) < y) u += 0.5;
      return u + bury;
    };
    const steel = env.far('#8a4f33', { haze, flatShading: true, roughness: 0.8 });
    const bridgeD = depth * 0.42;
    const deckY = top + 1.5 * scale;
    const spring = 8 * scale;
    const left = edge(spring, -1, 0);
    const right = edge(spring, 1, 0);
    const crown = deckY - 6 * scale;
    const arch = (u, lift = 0) => {
      const k = (2 * u + left - right) / (left + right);
      return spring + lift + (crown - spring - lift * 0.4) * (1 - k * k);
    };
    const axis = [ox, 0, oz];
    // Hai sườn vòm, mỗi sườn hai biên (trên / dưới) nối bằng thanh đứng + chéo kiểu dàn.
    for (const w of [-3.2 * scale, 3.2 * scale]) {
      for (const lift of [0, 4 * scale]) {
        const points = [];
        for (let step = 0; step <= 16; step += 1) {
          const u = -left + (step / 16) * (left + right);
          points.push(P(u, arch(u, lift * (1 - Math.abs((2 * u + left - right) / (left + right)) ** 4)), bridgeD + w));
        }
        batch.add(sweep(points, { axis, radius: () => [0.6 * scale, 0.6 * scale], steps: 32, radial: 4 }), steel);
      }
      let previous = null;
      for (let u = -left + 5 * scale; u < right - 4 * scale; u += 6 * scale) {
        const bottom = arch(u);
        const k = 1 - Math.abs((2 * u + left - right) / (left + right)) ** 4;
        const upper = arch(u, 4 * scale * k);
        batch.add(new THREE.BoxGeometry(0.4 * scale, Math.max(0.5, upper - bottom), 0.4 * scale), steel, { position: P(u, (upper + bottom) / 2, bridgeD + w) });
        // Cột đỡ mặt cầu từ biên trên.
        const post = deckY - upper;
        if (post > 1) batch.add(new THREE.BoxGeometry(0.5 * scale, post, 0.5 * scale), steel, { position: P(u, upper + post / 2, bridgeD + w) });
        // Thanh chéo từ biên dưới ô trước lên biên trên ô này.
        if (previous) {
          const du = u - previous[0];
          const dy = upper - previous[2];
          const tilt = Math.atan2(dy, du);
          batch.add(new THREE.BoxGeometry(Math.hypot(du, dy), 0.3 * scale, 0.3 * scale), steel, {
            position: P((u + previous[0]) / 2, (upper + previous[2]) / 2, bridgeD + w),
            rotation: ax ? [0, 0, tilt] : [-tilt, Math.PI / 2, 0],
          });
        }
        previous = [u, upper, bottom];
      }
    }
    // Mặt cầu dàn thép dài vượt qua cả hai mép vách.
    const deckLeft = edge(deckY, -1, 14 * scale);
    const deckRight = edge(deckY, 1, 14 * scale);
    const length = deckLeft + deckRight;
    batch.add(new THREE.BoxGeometry(ax ? length : 9 * scale, 1.2 * scale, ax ? 9 * scale : length), steel, { position: P((deckRight - deckLeft) / 2, deckY, bridgeD) });
    batch.add(new THREE.BoxGeometry(ax ? length : 7 * scale, 3 * scale, ax ? 7 * scale : length), steel, { position: P((deckRight - deckLeft) / 2, deckY - 2 * scale, bridgeD) });
    const lights = [];
    for (let u = -deckLeft; u <= deckRight; u += 4 * scale) for (const w of [-4.5 * scale, 4.5 * scale]) lights.push(P(u, deckY + 1 * scale, bridgeD + w));
    env.nightPoints(lights, { color: '#ffe0a0', size: 0.9 * scale });
  },
};

export const kit = { landmarks, scatter: {} };
