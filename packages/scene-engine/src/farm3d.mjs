// Phước Điền (world.courtyard.fields): phần thay đổi theo nông trại của người đang xem — cây trên 36 ô theo loài + giai
// đoạn (gieo → mầm → đang lớn → chín), đất khô, cỏ / sâu, ô chưa mở (cỏ dại), gà / bò đi lại trong chuồng, ổ trứng, thùng
// sữa, biểu tượng nổi trên ô chín / ổ đầy / con đói, hạt bay khi gieo / tưới / thu. Phần tĩnh (luống, chuồng, quầy) ở
// courtyard3d.mjs. Cây (mầm / đang lớn / chín) là ảnh billboard dựng từ mô hình Meshy (CROP_SPRITES, mỗi ảnh một
// InstancedMesh cho cả 36 ô); ảnh chưa tải xong / tải lỗi thì ô đó vẽ cây bằng khối. Hạt, cỏ dại, sâu, đất khô vẫn dựng
// bằng khối, mỗi ô gộp thành một mesh. Gà mái, gà con, bò là mô hình Meshy (MODELS), bê dùng mô hình bò thu nhỏ; chưa tải
// xong / tải lỗi thì hiện hình khối.
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeAnimal, loadAnimalModel, poseUniforms, withPose } from './animals3d.mjs';
import { spriteMaterial } from './flowers3d.mjs';
import { instanceProp, placeProp } from './props3d.mjs';

// Mô hình Meshy (file gốc nhanvat/farm/<tên>.glb, bản nén apps/web/public/models/farm/<tên>.glb, nhìn về +z). height =
// chiều cao đứng (m); legLength = độ dài bước (m) để chân bước khớp quãng đường; spec = hông / cổ theo tỉ lệ hình (như
// SPECIES trong animals3d.mjs: gà hai chân bước trái / phải, bò bốn chân chéo nhau).
const MODELS = {
  chicken: {
    adult: { model: '/models/farm/hen.glb', type: 'farm-hen', height: 0.5, legLength: 0.08, peck: 0.9, spec: { legTop: 0.28, neck: [0.62, 0.18], gait: 'waddle' } },
    young: { model: '/models/farm/chick.glb', type: 'farm-chick', height: 0.3, legLength: 0.05, peck: 0.7, spec: { legTop: 0.22, neck: [0.6, 0.12], gait: 'waddle' } },
  },
  cow: {
    adult: { model: '/models/farm/cow.glb', type: 'farm-cow', height: 1.35, legLength: 0.45, peck: 0.75, spec: { legTop: 0.42, neck: [0.55, 0.3] } },
    young: { model: '/models/farm/cow.glb', type: 'farm-cow', height: 0.85, legLength: 0.3, peck: 0.75, spec: { legTop: 0.42, neck: [0.55, 0.3] } },
  },
};
const bakedModels = new Map();
function loadFarmModel(def) {
  if (!bakedModels.has(def.type)) {
    bakedModels.set(def.type, loadAnimalModel(def.model).then((gltf) => bakeAnimal(gltf, { model: def.model, modelRy: 0, type: def.type }, def.spec)));
  }
  return bakedModels.get(def.type);
}

// Ảnh cây (apps/web/public/models/crops/<ảnh>.webp, nền trong suốt, gốc cây ở mép dưới): mỗi loài ảnh `<loài>-grow`
// (đang lớn) và `<loài>-ripe` (chín), mầm dùng chung `sprout`. spots = chỗ trồng trong luống 2,2 m; grow / ripe = chiều cao
// (m) của từng cây.
const SPOTS = {
  grid9: [-0.6, 0, 0.6].flatMap((x) => [-0.6, 0, 0.6].map((z) => [x, z])),
  grid4: [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]],
  dense: [-0.69, -0.23, 0.23, 0.69].flatMap((x) => [-0.69, -0.23, 0.23, 0.69].map((z) => [x, z])),
  vine: [[-0.45, -0.4], [0.45, -0.05], [-0.2, 0.5]],
  single: [[0, 0]],
  wild: [[-0.7, -0.6], [0.1, -0.75], [0.65, -0.2], [-0.35, 0.05], [0.4, 0.55], [-0.75, 0.65], [0.05, 0.4]],
};
const CROP_SPRITES = {
  spinach: { spots: 'grid9', grow: 0.32, ripe: 0.5 },
  tomato: { spots: 'grid4', grow: 0.7, ripe: 1.1 },
  corn: { spots: 'grid9', grow: 0.85, ripe: 2.0 },
  rice: { spots: 'dense', grow: 0.45, ripe: 0.75 },
  carrot: { spots: 'grid9', grow: 0.3, ripe: 0.42 },
  grass: { spots: 'grid9', grow: 0.7, ripe: 1.35 },
  pumpkin: { spots: 'vine', grow: 0.45, ripe: 0.62 },
  watermelon: { spots: 'vine', grow: 0.4, ripe: 0.55 },
  dragonfruit: { spots: 'single', grow: 1.2, ripe: 1.8 },
};
const SPROUT = { spots: 'grid9', height: 0.22 };
// Ô chưa mở: cỏ dại thấp mọc lác đác (dùng ảnh cỏ voi non).
const WILD = { sprite: 'grass-grow', spots: 'wild', height: 0.4 };
// Cỏ dại / sâu trên ô đang trồng: [x, z, cao gốc ảnh] trong luống; sâu bám trên lá (gốc ảnh cao hơn mặt đất).
const ISSUE_SPRITES = {
  weed: { sprite: 'weeds', height: 0.34, spots: [[-0.95, -0.9, 0], [0.92, 0.3, 0], [-0.2, 0.95, 0]] },
  pest: { sprite: 'pest', height: 0.13, spots: [[0.15, -0.55, 0.42], [-0.5, 0.15, 0.36], [0.62, 0.62, 0.38]] },
};
const CROP_MODELS = '/models/crops';
const FARM_PROPS = '/models/farm';
const SOIL_TOP = 0.21;

const ICONS = { spinach: '🥬', tomato: '🍅', corn: '🌽', rice: '🌾', carrot: '🥕', grass: '🌿', pumpkin: '🎃', watermelon: '🍉', dragonfruit: '🐉' };

export function createFarmView({ THREE, root, fields, makeBubble, disposeSprite, reduceMotion = false }) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const group = new THREE.Group();
  group.name = 'farm-view';
  root.add(group);
  const color = new THREE.Color();
  const euler = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const vector = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();

  // Gộp các khối tô màu đỉnh thành một BufferGeometry.
  function painter() {
    const parts = [];
    return {
      add(geometry, hex, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], order = 'XYZ' } = {}) {
        const flat = geometry.index ? geometry.toNonIndexed() : geometry;
        if (flat !== geometry) geometry.dispose();
        for (const name of Object.keys(flat.attributes)) if (!['position', 'normal'].includes(name)) flat.deleteAttribute(name);
        matrix.compose(vector.set(...position), quaternion.setFromEuler(euler.set(...rotation, order)), scaleVector.set(...(Array.isArray(scale) ? scale : [scale, scale, scale])));
        flat.applyMatrix4(matrix);
        color.set(hex);
        const colors = new Float32Array(flat.attributes.position.count * 3);
        for (let index = 0; index < colors.length; index += 3) colors.set([color.r, color.g, color.b], index);
        flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        parts.push(flat);
      },
      build() {
        if (!parts.length) return null;
        const merged = BufferGeometryUtils.mergeGeometries(parts, false);
        for (const part of parts) part.dispose();
        return merged;
      },
    };
  }
  const meshOf = (geometry, castShadow = true) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = false;
    return mesh;
  };
  const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    ball: (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h),
    cone: (r, h, s = 6) => new THREE.ConeGeometry(r, h, s),
    rod: (r, h, s = 5) => new THREE.CylinderGeometry(r, r, h, s),
  };

  // Lưới chỗ trồng trong một luống (2,2 m): 3 × 3 cụm.
  const GRID = [-0.6, 0, 0.6].flatMap((x) => [-0.6, 0, 0.6].map((z) => [x, z]));
  const BED = fields.bed || 2.2;
  const jitter = (index, amount) => ((Math.sin(index * 12.9898) * 43_758.5453) % 1) * amount;

  // Hình cây theo loài; s: tỉ lệ lớn (đang lớn 0,6, chín 1); ripe: có quả / bông.
  function addCrop(p, crop, s, ripe, dry) {
    const leaf = dry ? '#9a9a4a' : '#4f9a3e';
    const leafDark = dry ? '#8a7f3e' : '#2f7a34';
    const y = 0.21;
    if (crop === 'spinach') {
      GRID.forEach(([x, z], i) => {
        for (let k = 0; k < 5; k += 1) {
          const a = (k / 5) * Math.PI * 2 + i;
          p.add(G.cone(0.05, 0.42 * s, 4), leaf, { position: [x + Math.cos(a) * 0.08, y + 0.21 * s, z + Math.sin(a) * 0.08], rotation: [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35] });
          p.add(G.ball(0.09 * s, 6, 4), leafDark, { position: [x + Math.cos(a) * 0.16 * s, y + 0.38 * s, z + Math.sin(a) * 0.16 * s], scale: [1.4, 0.4, 0.8] });
        }
      });
    } else if (crop === 'tomato') {
      [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach(([x, z], i) => {
        p.add(G.rod(0.025, 1.1 * s), '#8a6a3c', { position: [x + 0.18, y + 0.55 * s, z] });
        p.add(G.ball(0.34 * s, 8, 6), leaf, { position: [x, y + 0.45 * s, z], scale: [1, 1.15, 1] });
        p.add(G.ball(0.24 * s, 7, 5), leafDark, { position: [x - 0.1, y + 0.75 * s, z + 0.08] });
        if (ripe) for (let k = 0; k < 5; k += 1) {
          const a = k * 1.3 + i;
          p.add(G.ball(0.09, 8, 6), k % 4 ? '#e0352b' : '#f0a23a', { position: [x + Math.cos(a) * 0.3, y + 0.35 + (k % 3) * 0.17, z + Math.sin(a) * 0.3] });
        }
      });
    } else if (crop === 'corn') {
      GRID.forEach(([x, z], i) => {
        const h = 1.7 * s;
        p.add(G.rod(0.035, h), leaf, { position: [x, y + h / 2, z] });
        for (let k = 0; k < 4; k += 1) {
          const a = k * 1.7 + i;
          p.add(G.box(0.08, 0.02, 0.6 * s), k % 2 ? leaf : leafDark, { position: [x + Math.cos(a) * 0.18 * s, y + h * (0.3 + k * 0.15), z + Math.sin(a) * 0.18 * s], rotation: [0.6, a, 0, 'YXZ'] });
        }
        p.add(G.cone(0.06, 0.22 * s, 5), ripe ? '#d8b04a' : leaf, { position: [x, y + h + 0.08, z] });
        if (ripe) p.add(G.rod(0.06, 0.28, 6), '#f2cc3a', { position: [x + 0.09, y + h * 0.55, z], rotation: [0, 0, -0.35] });
      });
    } else if (crop === 'rice') {
      for (let gx = -0.8; gx <= 0.81; gx += 0.4) for (let gz = -0.8; gz <= 0.81; gz += 0.4) {
        const i = Math.round((gx + 1) * 10 + gz * 7);
        for (let k = 0; k < 3; k += 1) {
          const tilt = (k - 1) * 0.25;
          p.add(G.box(0.03, 0.7 * s, 0.02), ripe ? '#cfae48' : leaf, { position: [gx + tilt * 0.2, y + 0.35 * s, gz + jitter(i + k, 0.08)], rotation: [tilt, k, 0, 'YXZ'] });
        }
        if (ripe) p.add(G.ball(0.07, 5, 4), '#e2c25a', { position: [gx + 0.08, y + 0.66, gz], scale: [0.7, 1.5, 0.7], rotation: [0, 0, 0.6] });
      }
    } else if (crop === 'carrot') {
      GRID.forEach(([x, z], i) => {
        for (let k = 0; k < 6; k += 1) {
          const a = (k / 6) * Math.PI * 2 + i;
          p.add(G.box(0.03, 0.5 * s, 0.1), leaf, { position: [x + Math.cos(a) * 0.07, y + 0.25 * s, z + Math.sin(a) * 0.07], rotation: [Math.sin(a) * 0.4, a, Math.cos(a) * 0.4, 'YXZ'] });
        }
        if (ripe) p.add(G.cone(0.1, 0.25, 6), '#e9782a', { position: [x, y + 0.04, z], rotation: [Math.PI, 0, 0] });
      });
    } else if (crop === 'grass') {
      GRID.forEach(([x, z], i) => {
        for (let k = 0; k < 7; k += 1) {
          const a = (k / 7) * Math.PI * 2 + i * 0.7;
          p.add(G.box(0.05, 1.3 * s, 0.015), k % 2 ? leaf : leafDark, { position: [x + Math.cos(a) * 0.12, y + 0.62 * s, z + Math.sin(a) * 0.12], rotation: [Math.sin(a) * 0.28, a, Math.cos(a) * 0.28, 'YXZ'] });
        }
      });
    } else if (crop === 'pumpkin' || crop === 'watermelon') {
      for (let k = 0; k < 9; k += 1) {
        const [x, z] = GRID[k];
        p.add(G.ball(0.3 * s, 8, 4), k % 2 ? leaf : leafDark, { position: [x + jitter(k, 0.15), y + 0.07, z + jitter(k + 3, 0.15)], scale: [1.2, 0.25, 1] });
      }
      if (ripe || s > 0.8) {
        const fruit = crop === 'pumpkin' ? (ripe ? '#ea8a1f' : '#9fb44a') : (ripe ? '#2f7a2c' : '#8fc06a');
        [[-0.45, -0.35], [0.4, 0.15], [-0.15, 0.55]].forEach(([x, z], k) => {
          if (crop === 'pumpkin') {
            for (let r = 0; r < 5; r += 1) p.add(G.ball(0.2, 8, 6), fruit, { position: [x + Math.cos(r * 1.26) * 0.09, y + 0.2, z + Math.sin(r * 1.26) * 0.09], scale: [0.85, 0.85, 0.85] });
            p.add(G.rod(0.03, 0.12), '#5c7a2c', { position: [x, y + 0.42, z] });
          } else {
            p.add(G.ball(0.32, 10, 8), fruit, { position: [x, y + 0.2, z], scale: [1, 0.72, 1.35], rotation: [0, k, 0] });
            for (const offset of [-0.18, 0, 0.18]) p.add(G.ball(0.322, 10, 8), '#7cbf5a', { position: [x + offset * Math.cos(k), y + 0.2, z - offset * Math.sin(k)], scale: [0.12, 0.72, 1.36], rotation: [0, k, 0] });
          }
        });
      }
    } else if (crop === 'dragonfruit') {
      p.add(G.rod(0.08, 1.4), '#8a6a3c', { position: [0, y + 0.7, 0] });
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2;
        p.add(G.box(0.12, 0.12, 0.8 * s), leaf, { position: [Math.cos(a) * 0.32 * s, y + 1.3 * Math.max(0.6, s), Math.sin(a) * 0.32 * s], rotation: [-0.7, -a + Math.PI / 2, 0, 'YXZ'] });
        if (ripe) p.add(G.ball(0.12, 8, 6), '#e2367a', { position: [Math.cos(a) * 0.62, y + 1.05, Math.sin(a) * 0.62], scale: [1, 1.25, 1] });
      }
    }
  }

  function addSeedRows(p) {
    for (const z of [-0.6, 0, 0.6]) {
      p.add(G.box(1.8, 0.07, 0.24), '#6b4428', { position: [0, 0.23, z] });
      for (const x of [-0.6, 0, 0.6]) p.add(G.ball(0.035, 5, 4), '#d8b37a', { position: [x, 0.28, z] });
    }
  }
  function addSprouts(p, dry) {
    GRID.forEach(([x, z]) => {
      p.add(G.rod(0.015, 0.16), dry ? '#9a9a4a' : '#5fae4a', { position: [x, 0.29, z] });
      for (const side of [-1, 1]) p.add(G.ball(0.06, 6, 4), dry ? '#a8a050' : '#6fc054', { position: [x + side * 0.06, 0.36, z], scale: [1.4, 0.35, 0.8], rotation: [0, 0, side * 0.4] });
    });
  }
  function addIssues(p, issues) {
    if (issues.includes('weed') && !spriteReady(ISSUE_SPRITES.weed.sprite)) for (const [x, z] of ISSUE_SPRITES.weed.spots) {
      for (let k = 0; k < 5; k += 1) p.add(G.cone(0.04, 0.32, 3), '#3d5a1e', { position: [x + (k - 2) * 0.04, 0.36, z], rotation: [(k - 2) * 0.25, 0, (k % 2 ? 1 : -1) * 0.25] });
    }
    if (issues.includes('pest') && !spriteReady(ISSUE_SPRITES.pest.sprite)) for (const [x, z, h] of ISSUE_SPRITES.pest.spots) {
      p.add(G.ball(0.07, 6, 4), '#2b2b22', { position: [x, h, z], scale: [1.4, 0.8, 1] });
      p.add(G.ball(0.04, 6, 4), '#7bb33a', { position: [x + 0.08, h + 0.02, z] });
    }
  }
  // Ô chưa mở: bãi cỏ hoang phủ kín luống đất (không khung gỗ), bốn cọc + dây thừng khoanh lại; cỏ dại bằng ảnh (WILD),
  // ảnh chưa tải thì cỏ khối.
  function addLocked(p, wildReady) {
    const half = BED / 2 + 0.05;
    p.add(G.box(BED + 0.1, 0.215, BED + 0.1), '#5d8a38', { position: [0, 0.108, 0] });
    for (const [x, z] of [[-half, -half], [half, -half], [half, half], [-half, half]]) p.add(G.rod(0.035, 0.5, 6), '#8a6a3c', { position: [x, 0.25, z] });
    for (const [x, z, w, d] of [[0, -half, BED + 0.1, 0.025], [0, half, BED + 0.1, 0.025], [-half, 0, 0.025, BED + 0.1], [half, 0, 0.025, BED + 0.1]]) {
      p.add(G.box(w, 0.025, d), '#d9c48c', { position: [x, 0.42, z] });
    }
    if (wildReady) return;
    for (let k = 0; k < 7; k += 1) {
      const x = jitter(k, 1.6) - 0.8;
      const z = jitter(k + 9, 1.6) - 0.8;
      for (let b = 0; b < 4; b += 1) p.add(G.cone(0.05, 0.3, 3), k % 2 ? '#6f8a3a' : '#57702c', { position: [x + (b - 1.5) * 0.05, 0.36, z], rotation: [(b - 1.5) * 0.3, 0, 0] });
    }
  }
  // Khung gỗ dự phòng của ô đã mở (khi mô hình Meshy `bedframe` chưa tải).
  function addFrame(p) {
    for (const [dx, dz, w, d] of [[0, -BED / 2, BED + 0.16, 0.12], [0, BED / 2, BED + 0.16, 0.12], [-BED / 2, 0, 0.12, BED], [BED / 2, 0, 0.12, BED]]) {
      p.add(G.box(w, 0.26, d), '#b5874f', { position: [dx, 0.13, dz] });
    }
  }

  // ---- Ô đất ----
  const plots = new Map(fields.plots.map((plot) => [plot.slot, { ...plot, mesh: null, key: '', icon: null, iconText: '' }]));
  function setIcon(item, text, x, y, z) {
    if (item.iconText === text) return;
    if (item.icon) {
      group.remove(item.icon);
      disposeSprite(item.icon);
      item.icon = null;
    }
    item.iconText = text;
    if (!text) return;
    item.icon = makeBubble(text, false);
    item.icon.position.set(x, y, z);
    group.add(item.icon);
  }

  function renderPlot(item, state) {
    const key = state ? JSON.stringify(state) : '';
    if (key === item.key) return;
    item.key = key;
    if (item.mesh) {
      group.remove(item.mesh);
      item.mesh.geometry.dispose();
      item.mesh = null;
    }
    if (!state) return;
    const p = painter();
    if (state.locked) addLocked(p, spriteReady(WILD.sprite));
    else if (!framesReady) addFrame(p);
    if (state.crop) {
      if (state.dry) p.add(G.box(2.1, 0.012, 2.1), '#b89466', { position: [0, 0.205, 0] });
      if (state.stage === 'seed') addSeedRows(p);
      else if (spriteReady(spriteOf(state))) {
        // Cây vẽ bằng ảnh (renderSprites).
      } else if (state.stage === 'sprout') addSprouts(p, state.dry);
      else addCrop(p, state.crop, state.stage === 'ripe' ? 1 : 0.62, state.stage === 'ripe', state.dry);
      addIssues(p, state.issues || []);
    }
    const geometry = p.build();
    if (!geometry) return;
    item.mesh = meshOf(geometry);
    item.mesh.position.set(item.x, 0, item.z);
    group.add(item.mesh);
  }

  // ---- Cây bằng ảnh billboard: mỗi ảnh một InstancedMesh (đủ chỗ cho 36 ô), dựng lại khi dữ liệu nông trại đổi ----
  const wind = { uWindTime: { value: 0 } };
  const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const sprites = new Map();
  const textures = new THREE.TextureLoader();
  const spriteOf = (state) => (state.locked ? WILD.sprite : state.stage === 'sprout' ? 'sprout' : state.stage === 'growing' || state.stage === 'ripe'
    ? `${state.crop}-${state.stage === 'ripe' ? 'ripe' : 'grow'}` : null);
  const spriteReady = (name) => Boolean(name && sprites.get(name)?.mesh);
  let lastFarm = null;
  // Tải ảnh lần đầu cần tới; xong thì vẽ lại các ô (ô đang vẽ bằng khối chuyển sang ảnh).
  function ensureSprite(name) {
    if (!name || sprites.has(name) || typeof document === 'undefined') return;
    const entry = { mesh: null };
    sprites.set(name, entry);
    textures.load(`${CROP_MODELS}/${name}.webp`, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const capacity = fields.plots.length * SPOTS.dense.length;
      const mesh = new THREE.InstancedMesh(quad, spriteMaterial(texture, wind, { saturation: 1.15 }), capacity);
      mesh.name = `farm-crop-${name}`;
      mesh.count = 0;
      mesh.frustumCulled = false;
      entry.aspect = texture.image.width / texture.image.height;
      entry.mesh = mesh;
      group.add(mesh);
      for (const item of plots.values()) item.key = '';
      if (lastFarm) api.setFarm(lastFarm);
    }, undefined, () => console.warn(`Không tải được ảnh cây ${name}`));
  }
  const dummy = new THREE.Object3D();
  function renderSprites(states) {
    const lists = new Map();
    for (const [item, state] of states) {
      for (const issue of state?.issues || []) {
        const spec = ISSUE_SPRITES[issue];
        if (!spec) continue;
        ensureSprite(spec.sprite);
        if (!spriteReady(spec.sprite)) continue;
        if (!lists.has(spec.sprite)) lists.set(spec.sprite, []);
        spec.spots.forEach(([x, z, y], index) => lists.get(spec.sprite).push({
          x: item.x + x, z: item.z + z, y, height: spec.height * (0.9 + jitter(item.slot * 13 + index, 0.2)), flip: (item.slot + index) % 2 === 0,
        }));
      }
      const name = state ? spriteOf(state) : null;
      if (!name) continue;
      ensureSprite(name);
      if (!spriteReady(name)) continue;
      const def = state.locked ? WILD : state.stage === 'sprout' ? SPROUT : CROP_SPRITES[state.crop];
      if (!def) continue;
      const height = def.height || (state.stage === 'ripe' ? def.ripe : def.grow);
      if (!lists.has(name)) lists.set(name, []);
      SPOTS[def.spots].forEach(([x, z], index) => {
        const seed = item.slot * 31 + index * 7;
        lists.get(name).push({
          x: item.x + x + jitter(seed, 0.12) - 0.06, z: item.z + z + jitter(seed + 5, 0.12) - 0.06,
          // Đất khô: cây hơi rũ thấp xuống.
          height: height * (0.88 + jitter(seed + 9, 0.24)) * (state.dry ? 0.9 : 1), flip: jitter(seed + 13, 1) > 0.5,
        });
      });
    }
    for (const [name, entry] of sprites) {
      if (!entry.mesh) continue;
      const list = lists.get(name) || [];
      list.forEach((spot, index) => {
        dummy.position.set(spot.x, SOIL_TOP + (spot.y || 0), spot.z);
        dummy.rotation.set(0, spot.flip ? Math.PI : 0, 0);
        dummy.scale.set(spot.height * entry.aspect, spot.height, 1);
        dummy.updateMatrix();
        entry.mesh.setMatrixAt(index, dummy.matrix);
      });
      entry.mesh.count = list.length;
      entry.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---- Khung gỗ luống: mô hình Meshy `bedframe` (InstancedMesh kéo vừa luống) chỉ ở ô đã mở; dựng lại khi số ô mở đổi
  // (thăm hàng xóm, mở thêm đất). Tải xong lần đầu thì vẽ lại các ô cho bỏ khung khối dự phòng. ----
  let frames = null;
  let framesKey = '';
  let framesToken = 0;
  let framesReady = false;
  function renderFrames(open) {
    const key = String(open);
    if (key === framesKey || typeof document === 'undefined') return;
    framesKey = key;
    const token = (framesToken += 1);
    const openPlots = [...plots.values()].filter((item) => item.slot <= open);
    if (!openPlots.length) {
      if (frames) group.remove(frames);
      frames = null;
      return;
    }
    const items = openPlots.map((item) => ({ x: item.x, z: item.z, ry: (item.slot % 4) * (Math.PI / 2) }));
    instanceProp(group, `${FARM_PROPS}/bedframe.glb`, items, { box: [BED + 0.2, 0.3, BED + 0.2] }).then((loaded) => {
      if (!loaded) return;
      if (token !== framesToken) {
        group.remove(loaded);
        return;
      }
      if (frames) group.remove(frames);
      frames = loaded;
      if (!framesReady) {
        framesReady = true;
        for (const item of plots.values()) item.key = '';
        if (lastFarm) api.setFarm(lastFarm);
      }
    });
  }

  // ---- Chuồng: gà / bò đi lại, ổ trứng, thùng sữa ----
  function chickenGeometry(adult) {
    const p = painter();
    if (adult) {
      p.add(G.ball(0.2, 10, 8), '#f4efe2', { position: [0, 0.32, 0], scale: [0.85, 0.8, 1.15] });
      p.add(G.cone(0.12, 0.26, 6), '#efe8d8', { position: [0, 0.45, -0.2], rotation: [-0.9, 0, 0] });
      p.add(G.ball(0.1, 8, 6), '#f6f2e8', { position: [0, 0.52, 0.17] });
      p.add(G.box(0.03, 0.08, 0.11), '#d8352b', { position: [0, 0.63, 0.17] });
      p.add(G.cone(0.03, 0.08, 4), '#e9a83a', { position: [0, 0.51, 0.29], rotation: [Math.PI / 2, 0, 0] });
      p.add(G.ball(0.03, 5, 4), '#d8352b', { position: [0, 0.45, 0.25] });
      for (const side of [-1, 1]) p.add(G.rod(0.015, 0.2), '#e0a43a', { position: [side * 0.07, 0.1, 0] });
    } else {
      p.add(G.ball(0.1, 8, 6), '#f6d84a', { position: [0, 0.12, 0] });
      p.add(G.ball(0.065, 8, 6), '#f8de55', { position: [0, 0.22, 0.07] });
      p.add(G.cone(0.02, 0.05, 4), '#e9883a', { position: [0, 0.22, 0.14], rotation: [Math.PI / 2, 0, 0] });
    }
    return p.build();
  }
  function cowGeometry(adult) {
    const p = painter();
    const k = adult ? 1 : 0.62;
    const body = adult ? '#f3f1ea' : '#b98a5a';
    p.add(G.box(0.62 * k, 0.6 * k, 1.35 * k), body, { position: [0, 0.82 * k, 0] });
    for (const [x, y, z, s] of [[0.32, 0.9, 0.2, 0.22], [-0.32, 0.8, -0.3, 0.26], [0.1, 1.13, -0.2, 0.2], [-0.32, 0.95, 0.35, 0.15]]) {
      p.add(G.ball(s * k, 7, 5), adult ? '#2a2622' : '#f3ece0', { position: [x * k, y * k, z * k], scale: [x ? 0.25 : 1, x ? 1 : 0.25, 1] });
    }
    p.add(G.box(0.38 * k, 0.38 * k, 0.45 * k), body, { position: [0, 1.0 * k, 0.82 * k] });
    p.add(G.box(0.34 * k, 0.2 * k, 0.12 * k), '#e9a6a0', { position: [0, 0.9 * k, 1.07 * k] });
    for (const side of [-1, 1]) {
      p.add(G.box(0.16 * k, 0.07 * k, 0.1 * k), body, { position: [side * 0.26 * k, 1.12 * k, 0.74 * k] });
      if (adult) p.add(G.cone(0.035, 0.14, 5), '#e8dcc0', { position: [side * 0.13, 1.25, 0.76], rotation: [0, 0, -side * 0.5] });
    }
    for (const [x, z] of [[-0.21, -0.48], [0.21, -0.48], [-0.21, 0.48], [0.21, 0.48]]) p.add(G.box(0.13 * k, 0.55 * k, 0.13 * k), adult ? '#e8e4da' : '#a77a4c', { position: [x * k, 0.27 * k, z * k] });
    p.add(G.rod(0.025 * k, 0.6 * k), body, { position: [0, 0.75 * k, -0.7 * k], rotation: [0.3, 0, 0] });
    if (adult) p.add(G.ball(0.13, 8, 6), '#eba7a0', { position: [0, 0.5, -0.2], scale: [1, 0.7, 1.1] });
    return p.build();
  }
  const animalGeometries = {
    chicken: { adult: chickenGeometry(true), young: chickenGeometry(false) },
    cow: { adult: cowGeometry(true), young: cowGeometry(false) },
  };
  const animals = new Map();
  const pens = { chicken: fields.coop, cow: fields.barn };
  const randomIn = (rect) => ({ x: rect.x[0] + Math.random() * (rect.x[1] - rect.x[0]), z: rect.z[0] + Math.random() * (rect.z[1] - rect.z[0]) });
  function syncAnimals(list) {
    const seen = new Set();
    for (const data of list) {
      seen.add(data.id);
      let item = animals.get(data.id);
      const kind = data.adult ? 'adult' : 'young';
      if (item && item.form !== kind) {
        removeAnimal(item);
        item = null;
      }
      if (!item) {
        const pen = pens[data.kind];
        const start = randomIn(pen.roam);
        // Khung con vật: hình khối dự phòng ngay, mô hình Meshy thay vào khi tải xong.
        const mesh = new THREE.Group();
        const block = new THREE.Mesh(animalGeometries[data.kind][kind], material);
        block.castShadow = true;
        mesh.add(block);
        // Hướng trước rồi mới cúi (mổ thóc / gặm cỏ theo hướng con vật đang quay).
        mesh.rotation.order = 'YXZ';
        mesh.position.set(start.x, 0, start.z);
        group.add(mesh);
        item = { id: data.id, kind: data.kind, form: kind, def: MODELS[data.kind][kind], mesh, block, x: start.x, z: start.z, ry: Math.random() * Math.PI * 2, target: null, wait: Math.random() * 3, phase: Math.random() * 10, gait: 0, stride: 0, pitch: 0 };
        animals.set(data.id, item);
        attachModel(item);
      }
      item.hungry = data.hungry;
    }
    for (const [id, item] of animals) if (!seen.has(id)) removeAnimal(item);
  }
  function removeAnimal(item) {
    group.remove(item.mesh);
    animals.delete(item.id);
    for (const used of item.materials || []) used.dispose();
  }
  // Mỗi con một bộ uniform dáng (vật liệu nhân bản, chương trình shader dùng chung); bóng đổ dùng vật liệu độ sâu cùng dáng.
  function attachModel(item) {
    loadFarmModel(item.def).then((baked) => {
      if (animals.get(item.id) !== item) return;
      const scale = item.def.height / Math.max(1e-6, baked.size.y);
      const inner = new THREE.Group();
      inner.scale.setScalar(scale);
      item.uniforms = poseUniforms(baked);
      item.scale = scale;
      const depth = withPose(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), item.uniforms);
      item.materials = [depth];
      for (const part of baked.parts) {
        const posed = withPose(part.material.clone(), item.uniforms);
        item.materials.push(posed);
        const mesh = new THREE.Mesh(part.geometry, posed);
        mesh.customDepthMaterial = depth;
        mesh.castShadow = true;
        inner.add(mesh);
      }
      item.mesh.remove(item.block);
      item.mesh.add(inner);
    }).catch((error) => {
      console.warn(`Không tải được mô hình ${item.def.model}: ${error.message}`);
    });
  }

  // Ổ trứng (rơm + số trứng đang chờ) và thùng sữa cạnh cửa chuồng.
  const extras = { coop: { mesh: null, key: '' }, barn: { mesh: null, key: '' } };
  // Ổ trứng ở góc sân trước nhà gà, thùng sữa sát hàng rào đông sân bò (nhà chuồng ở đầu bắc sân, cửa quay về nam): đứng
  // ở cửa sân nhìn vào là thấy.
  const coopNest = { x: fields.coop.house.x - 2.3, z: fields.coop.house.z + 1.3 };
  const barnCan = { x: fields.barn.area.x[1] - 0.55, z: fields.barn.house.z + 2.2 };
  function renderExtras(eggs, milk) {
    for (const [name, count] of [['coop', eggs], ['barn', milk]]) {
      const item = extras[name];
      const key = String(count);
      if (item.key === key) continue;
      item.key = key;
      if (item.mesh) {
        group.remove(item.mesh);
        item.mesh.geometry.dispose();
        item.mesh = null;
      }
      const p = painter();
      if (name === 'coop') {
        ensureNest();
        if (!nest) p.add(G.rod(0.42, 0.14, 12), '#d9b45a', { position: [0, 0.07, 0] });
        for (let index = 0; index < Math.min(eggs, 12); index += 1) {
          const a = index * 2.1;
          p.add(G.ball(0.07, 8, 6), '#f3e8d2', { position: [Math.cos(a) * 0.08 * (1 + (index % 3)), 0.19 + Math.floor(index / 6) * 0.07, Math.sin(a) * 0.08 * (1 + (index % 3))], scale: [1, 1.3, 1] });
        }
      } else {
        for (let index = 0; index < Math.max(1, Math.min(milk, 6)); index += 1) {
          const x = -(index % 3) * 0.4;
          const z = Math.floor(index / 3) * 0.42;
          p.add(G.rod(0.16, 0.5, 12), milk ? '#c9d2d6' : '#8e979b', { position: [x, 0.25, z] });
          p.add(G.rod(0.1, 0.12, 10), '#c9d2d6', { position: [x, 0.56, z] });
          if (milk) p.add(G.rod(0.09, 0.02, 10), '#ffffff', { position: [x, 0.63, z] });
        }
      }
      // Ổ Meshy đã tải và hết trứng thì không còn khối nào để vẽ (THREE.Mesh không nhận hình rỗng).
      const geometry = p.build();
      if (geometry) {
        item.mesh = meshOf(geometry);
        const spot = name === 'coop' ? coopNest : barnCan;
        item.mesh.position.set(spot.x, 0, spot.z);
        group.add(item.mesh);
      }
      if (name === 'barn') modelCans(milk, item.mesh);
    }
  }
  // Ổ rơm: mô hình Meshy (tải một lần); trứng vẫn vẽ bằng khối theo số trứng chờ nhặt. Tải xong thì vẽ lại ổ không có
  // đĩa rơm khối.
  let nest = null;
  let nestLoading = false;
  function ensureNest() {
    if (nestLoading || typeof document === 'undefined') return;
    nestLoading = true;
    placeProp(group, `${FARM_PROPS}/nest.glb`, { x: coopNest.x, z: coopNest.z, width: 0.95 }).then((loaded) => {
      if (!loaded) return;
      nest = loaded;
      extras.coop.key = '';
      if (lastFarm) api.setFarm(lastFarm);
    });
  }
  // Thùng sữa: mô hình Meshy (InstancedMesh, mỗi xô sữa đang chờ một thùng, ít nhất một thùng); tải xong thì ẩn thùng khối.
  // Đổi số thùng liên tục thì chỉ giữ lần gọi sau cùng.
  let cans = null;
  let cansToken = 0;
  function modelCans(milk, fallback) {
    const token = (cansToken += 1);
    const spots = Array.from({ length: Math.max(1, Math.min(milk, 6)) }, (_, index) => ({
      x: barnCan.x - (index % 3) * 0.4, z: barnCan.z + Math.floor(index / 3) * 0.42, ry: index * 0.9,
    }));
    instanceProp(group, `${FARM_PROPS}/milkcan.glb`, spots, { height: 0.62 }).then((loaded) => {
      if (!loaded) return;
      if (token !== cansToken) {
        group.remove(loaded);
        return;
      }
      if (cans) group.remove(cans);
      cans = loaded;
      fallback.visible = false;
    });
  }
  const penIcons = { coop: { icon: null, iconText: '' }, barn: { icon: null, iconText: '' } };

  // Rổ chia sẻ ở cổng: đồ trong rổ (mỗi món vài quả tròn theo màu), biểu tượng số món nổi trên rổ.
  const BASKET_COLORS = {
    tomato: '#e0352b', corn: '#f2cc3a', egg: '#f3e8d2', milk: '#fbfbf6', pumpkin: '#ea8a1f', watermelon: '#2f7a2c',
    carrot: '#e9782a', spinach: '#4f9a3e', rice: '#e2c25a', dragonfruit: '#e2367a',
  };
  const basketSpot = fields.basket || null;
  const basketItem = { mesh: null, key: '', icon: null, iconText: '' };
  function renderBasket(items) {
    if (!basketSpot) return;
    const entries = Object.entries(items || {}).filter(([, count]) => count > 0);
    const key = JSON.stringify(entries);
    if (basketItem.key === key) return;
    basketItem.key = key;
    if (basketItem.mesh) {
      group.remove(basketItem.mesh);
      basketItem.mesh.geometry.dispose();
      basketItem.mesh = null;
    }
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    setIcon(basketItem, total ? `🧺 ×${total}` : '', basketSpot.x, 1.75, basketSpot.z);
    if (!total) return;
    const p = painter();
    let index = 0;
    for (const [item, count] of entries) {
      for (let k = 0; k < Math.min(count, 4) && index < 14; k += 1, index += 1) {
        const a = index * 2.4;
        const r = 0.08 + (index % 3) * 0.1;
        const y = 0.66 + Math.floor(index / 7) * 0.1;
        if (item === 'milk') p.add(G.rod(0.06, 0.2, 8), BASKET_COLORS.milk, { position: [Math.cos(a) * r, y + 0.06, Math.sin(a) * r] });
        else p.add(G.ball(item === 'watermelon' || item === 'pumpkin' ? 0.13 : 0.08, 8, 6), BASKET_COLORS[item] || '#c9a24a', { position: [Math.cos(a) * r, y, Math.sin(a) * r], scale: item === 'egg' ? [1, 1.3, 1] : item === 'corn' || item === 'carrot' ? [0.8, 0.8, 1.8] : [1, 1, 1], rotation: [0, a, 0] });
      }
    }
    basketItem.mesh = meshOf(p.build(), false);
    basketItem.mesh.position.set(basketSpot.x, 0, basketSpot.z);
    group.add(basketItem.mesh);
  }

  // ---- Hiệu ứng ngắn: hạt / nước / quả bay ----
  const dot = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
  })();
  const particles = [];
  const BURST = {
    plant: { color: '#8a5a34', count: 10, up: 1.6 }, water: { color: '#8fd3ff', count: 18, rain: true }, harvest: { color: '#ffcf6a', count: 10, up: 2.4 },
    tend: { color: '#5c8a2e', count: 10, up: 1.8 }, feed: { color: '#e2b84a', count: 14, up: 1.2 }, collect: { color: '#f6efe0', count: 8, up: 2.2 },
  };
  function burst(x, z, kind) {
    const spec = BURST[kind];
    if (!spec || reduceMotion) return;
    const spriteMaterial = new THREE.SpriteMaterial({ map: dot, color: spec.color, transparent: true, depthWrite: false });
    for (let index = 0; index < spec.count; index += 1) {
      const sprite = new THREE.Sprite(spriteMaterial);
      const angle = Math.random() * Math.PI * 2;
      const reach = Math.random() * 0.9;
      sprite.position.set(x + Math.cos(angle) * reach * (spec.rain ? 1 : 0.5), spec.rain ? 2.2 + Math.random() * 0.6 : 0.5, z + Math.sin(angle) * reach * (spec.rain ? 1 : 0.5));
      sprite.scale.setScalar(spec.rain ? 0.12 : 0.18);
      group.add(sprite);
      particles.push({ sprite, rain: spec.rain, life: 0, delay: Math.random() * (spec.rain ? 0.6 : 0.2), velocity: spec.rain ? [0, -3.2, 0] : [Math.cos(angle) * 0.6, spec.up, Math.sin(angle) * 0.6] });
    }
  }

  const api = {
    pickables: [],
    // data: nông trại từ API ({ plotsOpen, plots, animals, expand, … }) hoặc null (chưa có: ruộng trống, ô 7+ cỏ dại).
    // icons: { slot: chữ } cho ô cần chú ý — trang tự soạn chữ theo ngôn ngữ.
    setFarm(data) {
      lastFarm = data;
      const open = data?.plotsOpen ?? 0;
      const bySlot = new Map((data?.plots || []).map((plot) => [plot.slot, plot]));
      const states = [];
      for (const item of plots.values()) {
        const plot = bySlot.get(item.slot);
        const state = item.slot > open
          ? { locked: true }
          : plot ? { crop: plot.crop, stage: plot.stage, dry: plot.dry, issues: plot.issues } : { empty: true };
        if (state) ensureSprite(spriteOf(state));
        for (const issue of state?.issues || []) ensureSprite(ISSUE_SPRITES[issue]?.sprite);
        renderPlot(item, state);
        states.push([item, state]);
        const icon = item.slot > open
          ? (data?.expand?.slot === item.slot ? `🔒 ${data.expand.label || ''}`.trim() : '')
          : plot?.stage === 'ripe' ? `${ICONS[plot.crop] || '🧺'}` : plot?.issues?.length ? (plot.issues.includes('pest') ? '🐛' : '🌿') : plot?.dry ? '💧' : '';
        setIcon(item, icon, item.x, plot?.stage === 'ripe' && ['corn', 'grass', 'dragonfruit'].includes(plot.crop) ? 2.45 : 1.65, item.z);
      }
      renderSprites(states);
      renderFrames(open);
      const list = data?.animals || [];
      syncAnimals(list);
      const eggs = list.filter((item) => item.kind === 'chicken').reduce((sum, item) => sum + item.stored, 0);
      const milk = list.filter((item) => item.kind === 'cow').reduce((sum, item) => sum + item.stored, 0);
      renderExtras(eggs, milk);
      const hungry = (kind) => list.some((item) => item.kind === kind && item.hungry);
      setIcon(penIcons.coop, eggs ? `🥚 ×${eggs}` : hungry('chicken') ? '🌽 ?' : '', fields.coop.gate.x, 2.2, fields.coop.gate.z + 0.4);
      setIcon(penIcons.barn, milk ? `🥛 ×${milk}` : hungry('cow') ? '🌿 ?' : '', fields.barn.gate.x, 2.4, fields.barn.gate.z + 0.4);
      // Rổ: nông trại mình { items, max }, nông trại hàng xóm { món: số }.
      renderBasket(data?.basket?.items || (data?.basket && !data.basket.max ? data.basket : null));
    },
    // Hạt bay ở ô / chuồng: plant | water | harvest | tend | feed | collect.
    effect(kind, target) {
      if (target?.kind === 'plot') {
        const plot = plots.get(target.slot);
        if (plot) burst(plot.x, plot.z, kind);
      } else if (target?.kind === 'coop' || target?.kind === 'barn') {
        const spot = target.kind === 'coop' ? coopNest : barnCan;
        burst(spot.x, spot.z, kind);
      } else if (target?.kind === 'basket' && basketSpot) burst(basketSpot.x, basketSpot.z, kind);
    },
    debug() {
      return {
        plots: [...plots.values()].filter((item) => item.key).map((item) => ({ slot: item.slot, state: item.key, icon: item.iconText })),
        animals: [...animals.values()].map((item) => ({ id: item.id, kind: item.kind, form: item.form, model: Boolean(item.uniforms), x: Math.round(item.x * 10) / 10, z: Math.round(item.z * 10) / 10 })),
        basket: basketItem.iconText,
        crops: Object.fromEntries([...sprites].map(([name, entry]) => [name, entry.mesh ? entry.mesh.count : 'loading'])),
      };
    },
    update(dt, time) {
      const t = time / 1000;
      wind.uWindTime.value = t;
      for (const item of animals.values()) {
        const pen = pens[item.kind];
        const speed = item.kind === 'cow' ? 0.55 : 0.9;
        if (item.wait > 0) item.wait -= dt;
        else if (!item.target) item.target = randomIn(pen.roam);
        if (item.target && item.wait <= 0) {
          const dx = item.target.x - item.x;
          const dz = item.target.z - item.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.1) {
            item.target = null;
            item.wait = (item.hungry ? 4 : 1.5) + Math.random() * (item.kind === 'cow' ? 6 : 3);
          } else {
            const step = Math.min(distance, speed * (item.hungry ? 0.5 : 1) * dt);
            item.x += (dx / distance) * step;
            item.z += (dz / distance) * step;
            item.gait += step / (item.def.legLength * 0.5);
            const heading = Math.atan2(dx, dz);
            item.ry += Math.atan2(Math.sin(heading - item.ry), Math.cos(heading - item.ry)) * Math.min(1, dt * 6);
          }
        }
        const moving = Boolean(item.target && item.wait <= 0);
        // Đứng yên: gà mổ thóc, bò cúi gặm cỏ.
        const peck = !moving && !reduceMotion ? Math.max(0, Math.sin(t * (item.kind === 'cow' ? 0.8 : 3.2) + item.phase)) : 0;
        item.mesh.rotation.y = item.ry;
        if (item.uniforms) {
          // Mô hình: chân bước khớp quãng đường (sải = nửa bước, nhấc chân khi đưa về trước), thân nhấp nhô mỗi lần chạm
          // đất, cúi đầu quanh điểm cổ (animals3d.mjs).
          item.stride += ((moving ? 1 : 0) - item.stride) * Math.min(1, dt * 6);
          item.pitch += (peck * item.def.peck - item.pitch) * Math.min(1, dt * (item.kind === 'cow' ? 3 : 12));
          const legLength = item.def.legLength;
          item.uniforms.uGait.value = item.gait;
          item.uniforms.uStride.value = (legLength * 0.5 * item.stride) / item.scale;
          item.uniforms.uLift.value = (legLength * 0.3 * item.stride) / item.scale;
          item.uniforms.uPitch.value = item.pitch;
          item.mesh.position.set(item.x, reduceMotion ? 0 : Math.abs(Math.sin(item.gait)) * legLength * 0.06 * item.stride, item.z);
          item.mesh.rotation.x = item.kind === 'chicken' ? Math.sin(item.gait) * 0.04 * item.stride : 0;
          item.mesh.rotation.z = item.kind === 'chicken' ? Math.cos(item.gait) * 0.06 * item.stride : 0;
        } else {
          item.mesh.position.set(item.x, moving && !reduceMotion ? Math.abs(Math.sin(t * (item.kind === 'cow' ? 5 : 11) + item.phase)) * (item.kind === 'cow' ? 0.03 : 0.04) : 0, item.z);
          item.mesh.rotation.x = peck * (item.kind === 'cow' ? 0.08 : 0.45);
        }
      }
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const item = particles[index];
        if (item.delay > 0) {
          item.delay -= dt;
          item.sprite.visible = false;
          continue;
        }
        item.sprite.visible = true;
        item.life += dt;
        item.sprite.position.x += item.velocity[0] * dt;
        item.sprite.position.y += item.velocity[1] * dt;
        item.sprite.position.z += item.velocity[2] * dt;
        if (!item.rain) item.velocity[1] -= 3.5 * dt;
        item.sprite.material.opacity = Math.max(0, 1 - item.life);
        if (item.life > 1 || item.sprite.position.y < 0.2) {
          group.remove(item.sprite);
          particles.splice(index, 1);
        }
      }
    },
    relabel(data) {
      this.setFarm(data);
    },
  };
  return api;
}
