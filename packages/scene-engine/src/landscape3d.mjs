// Phong cảnh sân chùa theo vùng (chánh điện tiểu bang nào dùng vùng nào: THIEN_THEMES trong room rules). Chỉ đổi phần
// nhìn: trời, sương, ánh nắng, đất ngoài tường, nền sân, núi xa, kiểu cây (đứng đúng chỗ cây trong scene nên vật cản
// đi lại không đổi), cây / đá rải ngoài tường, màu mái / tường / gạch / cột và chùa nhìn từ ngoài. Không đụng bố cục
// sân nên bot, trốn tìm, vườn, ghế giữ nguyên ở mọi vùng.
//
// Mỗi vùng gồm dữ liệu `<themeBase><vùng>.json` (kiểm tra bằng validateTheme) và bộ đồ dựng hình
// `landscape/<vùng>.mjs`, chỉ tải khi chọn vùng đó. Kiểu nhắc tới trong dữ liệu được tìm trong bộ đồ
// của vùng trước, rồi tới bộ đồ chung `landscape/common.mjs` (hình dạng bộ đồ ghi ở đầu file đó). Vùng 'default' là
// cảnh gốc, dựng ngay lúc tạo. Kế hoạch chia vùng: KE_HOACH_VUNG.md.
//
// Trên cảnh vùng có thêm lớp mỏng theo tiểu bang (KE_HOACH_BANG.md): dữ liệu `<stateBase><mã>.json` (validateState) và
// bộ đồ `landmarks/<mã>.mjs` (`export const kit = { landmarks, scatter }`), kiểu tìm ở bộ đồ bang → bộ đồ vùng →
// `landmarks/common.mjs`. Điểm nhìn xa dùng vật liệu ít sương (env.far) để đứng xa vẫn thấy; đèn đêm (env.night*) chỉ
// sáng khi tối; chuyển động (env.animate) chỉ chạy khi camera ở sân.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { StaticBatch } from './temple3d-models.mjs';
import { validateState, validateTheme } from './world.mjs';
import { GLOW_ORDER } from './daylight3d.mjs';
import { kit as common, seeded } from './landscape/common.mjs';
import { kit as landmarkCommon } from './landmarks/common.mjs';

const DEFAULT_LIGHT = { sun: '#fff1d6', sky: '#cfe2ff', ground: '#6b5a3c' };
// Sương cảnh gốc ngoài sân (trùng màu renderer3d đặt khi có sân).
const DEFAULT_FOG = '#d9c3a0';
const DEFAULT_MOUNTAINS = { shape: 'cone', colors: ['#4f6a63'] };
const NAME = /^[a-z0-9-]{1,32}$/;

// Gộp khối phong cảnh (cây, vật rải, núi) theo kiểu bề mặt thay vì theo vật liệu: màu của vật liệu ghi vào màu đỉnh,
// các vật liệu chỉ khác màu (và độ nhám) dồn thành một mesh. Vùng nhiều màu không tốn thêm lệnh vẽ. Cùng cách gọi
// add(geometry, material, { position, rotation, scale }) như StaticBatch; vật liệu có ảnh / trong suốt giữ riêng.
class ColorBatch {
  constructor() {
    this.parts = new Map();
  }

  add(geometry, material, transform) {
    this.push(ColorBatch.prepare(geometry, material, transform));
  }

  push({ key, material, plain, geometry }) {
    if (!this.parts.has(key)) this.parts.set(key, { material, plain, geometries: [] });
    this.parts.get(key).geometries.push(geometry);
  }

  // Một mảnh đã đặt đúng chỗ, tô màu đỉnh, sẵn để gộp: { key, material, plain, geometry } (giữ lại được để gộp lại lần
  // sau mà không dựng hình lại).
  // order: thứ tự góc Euler (mặc định 'XYZ' như three.js); 'YXZ' = nghiêng quanh trục của vật trước rồi mới xoay hướng
  // (rotation [nghiêng, hướng, 0] đúng với mọi hướng).
  static prepare(geometry, material, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], order = 'XYZ' } = {}) {
    const plain = material.isMeshStandardMaterial && !material.map && !material.transparent;
    const key = plain
      ? `${material.flatShading ? 'flat' : 'smooth'}|${material.side}|${material.emissive.getHexString()}|${material.emissiveIntensity}|${material.metalness > 0.1}|${material.userData.haze ?? ''}`
      : material;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation, order)),
      new THREE.Vector3(...scale),
    );
    const copy = geometry.clone().applyMatrix4(matrix);
    geometry.dispose();
    // Khối không có chỉ mục (khối đa diện): gắn chỉ mục 0…n-1 cho gộp được với khối có chỉ mục. Không dò đỉnh trùng
    // (mergeVertices) vì chậm gấp nhiều lần mà phần lớn khối phong cảnh vẽ phẳng mặt, đỉnh trùng không đáng kể.
    if (!copy.index) copy.setIndex([...Array(copy.attributes.position.count).keys()]);
    const prepared = copy;
    for (const name of Object.keys(prepared.attributes)) if (!['position', 'normal', 'uv'].includes(name)) prepared.deleteAttribute(name);
    if (!prepared.attributes.uv) prepared.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(prepared.attributes.position.count * 2), 2));
    if (plain) {
      const colors = new Float32Array(prepared.attributes.position.count * 3);
      for (let index = 0; index < colors.length; index += 3) colors.set([material.color.r, material.color.g, material.color.b], index);
      prepared.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    return { key, material, plain, geometry: prepared };
  }

  // materialFor(mẫu): vật liệu màu đỉnh dùng chung cho một kiểu bề mặt (engine giữ, không tạo mới mỗi lần dựng).
  // keep: giữ các mảnh (đang được nhớ để gộp lại), không giải phóng.
  build(root, materialFor, { castShadow = false, keep = false } = {}) {
    for (const { material, plain, geometries } of this.parts.values()) {
      const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
      if (!keep) for (const geometry of geometries) geometry.dispose();
      const mesh = new THREE.Mesh(merged, plain ? materialFor(material) : material);
      mesh.castShadow = castShadow;
      root.add(mesh);
    }
    this.parts.clear();
  }
}

// Điểm ngẫu nhiên ngoài tường sân, cách tường từ band[0] tới band[1] mét (đi vòng chu vi sân rồi bước ra ngoài).
// Dùng cho nhóm vật rải có `band`, vd. dừa chỉ mọc trên dải bãi biển trước khi tới mặt nước.
export function bandPoint(ground, [near, far], rand) {
  const width = ground.x[1] - ground.x[0];
  const depth = ground.z[1] - ground.z[0];
  let t = rand() * 2 * (width + depth);
  const away = near + rand() * (far - near);
  if (t < width) return [ground.x[0] + t, ground.z[1] + away];
  t -= width;
  if (t < depth) return [ground.x[1] + away, ground.z[0] + t];
  t -= depth;
  if (t < width) return [ground.x[0] + t, ground.z[0] - away];
  t -= width;
  return [ground.x[0] - away, ground.z[0] + t];
}

// Vật liệu xa: chỉ chịu `haze` phần sương của cảnh (0 = không sương, 1 = như mọi vật), để điểm nhìn xa của tiểu bang
// vẫn nổi rõ trên nền trời. Màu sương vẫn là sương của cảnh (đổi theo giờ). Mọi vật liệu xa dùng chung một chương trình
// shader, mỗi vật liệu một giá trị haze.
function applyHaze(material, haze) {
  material.userData.haze = haze;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.haze = { value: haze };
    shader.fragmentShader = `uniform float haze;\n${shader.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth ) * haze;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`)}`;
  };
  material.customProgramCacheKey = () => 'landscape-haze';
  return material;
}

// Vị trí điểm nhìn xa của tiểu bang: phía (gate / east / west / back), cách tường sân `distance` m, lệch dọc tường `offset` m.
export function landmarkPoint(ground, { side, distance, offset = 0 }) {
  const midZ = (ground.z[0] + ground.z[1]) / 2;
  if (side === 'gate') return [offset, ground.z[1] + distance];
  if (side === 'back') return [offset, ground.z[0] - distance];
  if (side === 'east') return [ground.x[1] + distance, midZ + offset];
  return [ground.x[0] - distance, midZ + offset];
}

// Giải phóng hình của một nhóm; owned: vật liệu / texture tạo riêng cho lần dựng đó.
function disposeGroup(group, owned = null) {
  group.traverse((item) => {
    if (item.isMesh || item.isPoints) item.geometry.dispose();
    // InstancedMesh còn bộ đệm ma trận (và màu) từng bản trên GPU.
    if (item.isInstancedMesh) item.dispose();
  });
  for (const item of owned || []) item.dispose();
  owned?.clear();
  group.clear();
}

// root: nhóm cảnh; data: world.courtyard; m: vật liệu của sân (đổi màu roof/wall/brick/pillar, cỏ); field: mặt đất
// ngoài tường; lawns: vật liệu cỏ trong sân; sun: nắng (vẽ lại bóng khi đổi cảnh); paint(bảng màu): nhận màu ban ngày
// của vùng { top, horizon, fog, sun, sky, ground } để sân pha theo giờ (daylight3d.mjs) rồi đặt vào trời / sương / đèn;
// themeBase: đường dẫn thư mục dữ liệu vùng (vd. '/scenes/thien-default/themes/'), null thì chỉ có cảnh gốc;
// temple: { hall, door, textBoard, glowMaterial } để dựng chùa nhìn từ ngoài.
// stateBase: thư mục dữ liệu tiểu bang (vd. '/scenes/thien-default/states/'), null thì không có lớp tiểu bang.
export function createLandscape({ root, renderer, data, materials: m, field, lawns, sun, paint, themeBase = null, stateBase = null, temple }) {
  const ground = data.ground;
  const midZ = (ground.z[0] + ground.z[1]) / 2;
  const sharedMaterials = new Map();
  const material = (color, extra = {}) => {
    const key = `${color}|${JSON.stringify(extra)}`;
    if (!sharedMaterials.has(key)) sharedMaterials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra }));
    return sharedMaterials.get(key);
  };
  const groundCache = new Map([['common:grass', field.material]]);
  const vertexMaterials = new Map();
  const vertexMaterial = (sample) => {
    const haze = sample.userData.haze;
    const key = `${sample.flatShading}|${sample.side}|${sample.emissive.getHexString()}|${sample.emissiveIntensity}|${sample.metalness > 0.1}|${haze ?? ''}`;
    if (!vertexMaterials.has(key)) {
      const made = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: sample.roughness, metalness: sample.metalness, flatShading: sample.flatShading, side: sample.side,
        emissive: sample.emissive, emissiveIntensity: sample.emissiveIntensity,
      });
      vertexMaterials.set(key, haze === undefined ? made : applyHaze(made, haze));
    }
    return vertexMaterials.get(key);
  };
  // Vật liệu xa (điểm nhìn xa của tiểu bang): như material(màu, thêm) nhưng chỉ chịu haze phần sương.
  const farMaterials = new Map();
  const far = (color, { haze = 0.4, ...extra } = {}) => {
    const key = `${color}|${haze}|${JSON.stringify(extra)}`;
    if (!farMaterials.has(key)) farMaterials.set(key, applyHaze(new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra }), haze));
    return farMaterials.get(key);
  };
  // Đèn đêm của tiểu bang: vật liệu cộng sáng, độ đậm theo mức tối (tick), ban ngày ẩn hẳn; vẽ sau lớp phủ đêm.
  const nightMaterials = new Map();
  let nightLevel = 0;
  const nightMaterial = (key, make, base = 1) => {
    if (!nightMaterials.has(key)) {
      const material = make();
      material.userData.base = base;
      material.opacity = base * nightLevel;
      material.visible = nightLevel > 0.01;
      nightMaterials.set(key, material);
    }
    return nightMaterials.get(key);
  };
  const animations = [];
  const defaults = {
    colors: Object.fromEntries(['roof', 'wall', 'brick', 'pillar'].map((key) => [key, `#${m[key].color.getHexString()}`])),
    lawns: lawns.map((item) => ({
      color: item.color.clone(), emissive: item.emissive.clone(), intensity: item.emissiveIntensity, roughness: item.roughness,
      maps: { map: item.map, normalMap: item.normalMap, roughnessMap: item.roughnessMap },
    })),
    sky: { top: data.sky?.top || '#7aa6d8', horizon: data.sky?.horizon || '#f6dcb0' },
  };
  const groups = Object.fromEntries(['trees', 'grove', 'scatter', 'mountains', 'temple', 'landmarks'].map((name) => {
    const group = new THREE.Group();
    group.name = `landscape-${name}`;
    root.add(group);
    return [name, group];
  }));
  const templeOwned = new Set();
  // Bảng chữ (hoành phi, cổng) vẽ canvas một lần rồi dùng lại mỗi lần dựng lại chùa.
  const boards = new Map();
  const textBoard = (text, options = {}) => {
    const key = `${text}|${JSON.stringify(options)}`;
    if (!boards.has(key)) boards.set(key, temple.textBoard(text, options));
    return boards.get(key);
  };
  const loaded = new Map();
  const loadedStates = new Map();
  const warned = new Set();
  let current = null;
  let currentTheme = {};
  let currentKit = {};
  let currentState = null;
  // Chỗ không rải vật của vùng (clear của tiểu bang đang dùng), tính lúc dựng vật rải.
  let stateClear = [];
  let request = 0;
  const built = { trees: null, temple: null, scatter: null, landmarks: null };
  const warnOnce = (key, text) => {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(text);
  };

  // Tìm kiểu trong bộ đồ vùng rồi bộ đồ chung; không có thì cảnh báo một lần và bỏ qua.
  const find = (kit, section, kind, also = null) => {
    const found = kit[section]?.[kind] || (also && kit[also]?.[kind]) || common[section]?.[kind] || (also && common[also]?.[kind]);
    if (!found && !warned.has(`${section}:${kind}`)) {
      warned.add(`${section}:${kind}`);
      console.warn(`Phong cảnh: không có kiểu ${section}.${kind}`);
    }
    return found || null;
  };
  // Khu đi lại ngoài tường (lối + Đài ngắm cảnh ngoài cổng, Rừng thiền ngoài cổng tây) cho bộ đồ tiểu bang chừa chỗ
  // (landmarks/common.mjs: walkwayCut / onWalkway) và để không rải vật vùng lên đó.
  const walkways = [
    ...(data.overlook ? [data.overlook.path, data.overlook.terrace] : []),
    ...(data.grove ? [data.grove.area] : []),
  ];
  const envFor = (theme) => ({
    m, material, renderer, ground, midZ, theme, detail: 1, walkways,
    colors: theme.mountains?.colors || DEFAULT_MOUNTAINS.colors,
  });

  function groundMaterial(kit, kitName, kind, env) {
    const builder = kit.grounds?.[kind] ? kit : common.grounds?.[kind] ? common : null;
    const key = `${builder === kit ? kitName : 'common'}:${kind}`;
    if (!groundCache.has(key)) {
      const make = builder?.grounds[kind];
      if (!make) return find(kit, 'grounds', kind) || groundCache.get('common:grass');
      groundCache.set(key, make(env));
    }
    return groundCache.get(key);
  }

  function applyColors(theme, kit, kitName, env) {
    paint({
      top: theme.sky?.top || defaults.sky.top,
      horizon: theme.sky?.horizon || defaults.sky.horizon,
      fog: theme.fog || DEFAULT_FOG,
      sun: theme.light?.sun || DEFAULT_LIGHT.sun,
      sky: theme.light?.sky || DEFAULT_LIGHT.sky,
      ground: theme.light?.ground || DEFAULT_LIGHT.ground,
    });
    for (const key of Object.keys(defaults.colors)) m[key].color.set(theme.colors?.[key] || defaults.colors[key]);
    // Nền sân trong tường: cỏ gốc (có thể nhuộm màu) hoặc phủ bằng texture của một kiểu đất (cát, tuyết…).
    const surface = theme.lawn?.surface || 'grass';
    const cover = surface === 'grass' ? null : groundMaterial(kit, kitName, surface, env);
    lawns.forEach((item, index) => {
      const base = defaults.lawns[index];
      const maps = cover ? { map: cover.map, normalMap: null, roughnessMap: null } : base.maps;
      if (item.map !== maps.map) {
        Object.assign(item, maps, { roughness: cover ? cover.roughness : base.roughness, needsUpdate: true });
        item.emissive.copy(cover ? cover.emissive : base.emissive);
        item.emissiveIntensity = cover ? cover.emissiveIntensity : base.intensity;
      }
      item.color.set(theme.lawn?.tint || `#${base.color.getHexString()}`);
    });
    const kind = theme.field || 'grass';
    field.material = kind === 'grass' ? groundCache.get('common:grass') : groundMaterial(kit, kitName, kind, env);
  }

  // Cây trong sân: kiểu `trees` đứng chỗ cây đa (data.trees, phóng thêm treeScale), kiểu `pines` đứng chỗ cây tùng.
  function buildTrees(theme, kit, env, key) {
    disposeGroup(groups.trees);
    const batch = new ColorBatch();
    const big = find(kit, 'trees', theme.trees || 'banyan');
    const small = find(kit, 'trees', theme.pines || 'pine');
    const rand = seeded(`trees:${theme.trees || 'banyan'}:${theme.pines || 'pine'}`);
    const scale = theme.treeScale || 1;
    if (big) for (const tree of data.trees || []) big(batch, tree.x, tree.z, (tree.size || 1) * scale, rand, env);
    if (small) for (const [x, z] of data.pines || []) small(batch, x, z, 1, rand, env);
    batch.build(groups.trees, vertexMaterial, { castShadow: true });
    built.trees = key;
    pendingGrove = data.grove?.trees?.length ? { theme, big, small, scale, env } : null;
  }

  // Rừng thiền ngoài cổng tây (data.grove.trees): cây lớn (big) theo kiểu cây lớn của vùng, còn lại kiểu cây nhỏ — rừng
  // đổi theo vùng. Dựng ở tick() khung kế tiếp chứ không cùng lúc đổi vùng: 55 cây làm mỗi lần đổi vùng chậm thêm
  // 30–40 ms, tách ra thì không khung nào phải gánh cả hai.
  let pendingGrove = null;
  function buildGrove({ theme, big, small, scale, env }) {
    disposeGroup(groups.grove);
    const batch = new ColorBatch();
    const rand = seeded(`grove:${theme.trees || 'banyan'}:${theme.pines || 'pine'}`);
    for (const tree of data.grove.trees) {
      const make = tree.big ? big : small;
      if (make) make(batch, tree.x, tree.z, (tree.size || 1) * (tree.big ? scale : 1), rand, env);
    }
    batch.build(groups.grove, vertexMaterial, { castShadow: true });
    if (sun.castShadow) sun.shadow.needsUpdate = true;
  }

  // Rải ngoài tường (giữa tường sân và núi), chừa hai bên / sau chánh điện, lối trước cổng cho cảnh thoáng, và chỗ tiểu
  // bang dành riêng (clear, vd. mặt biển).
  const cleared = (x, z) => stateClear.some(({ side, from }) => (side === 'gate' ? z > ground.z[1] + from
    : side === 'back' ? z < ground.z[0] - from
      : side === 'east' ? x > ground.x[1] + from : x < ground.x[0] - from));
  // Khu đi lại ngoài tường (walkways) cộng lề 3 m: không rải vật vùng / bang lên đó.
  const onWalkways = (x, z) => walkways.some((rect) => x > rect.x[0] - 3 && x < rect.x[1] + 3 && z > rect.z[0] - 3 && z < rect.z[1] + 3);
  const reserved = (x, z) => (x > ground.x[0] - 5 && x < ground.x[1] + 5 && z > ground.z[0] - 26 && z < ground.z[1] + 5)
    || (Math.abs(x) < 9 && z < ground.z[1] + 30) || onWalkways(x, z);
  const blocked = (x, z) => reserved(x, z) || cleared(x, z);
  // items: [{ kind, count, band? }]; build(kind): hàm dựng hoặc null; seed: tiền tố chuỗi ngẫu nhiên; avoid(x, z): chỗ
  // không đặt (thử lại chỗ khác); placed(x, z): báo trước mỗi vật được dựng.
  function scatterInto(batch, items, build, seed, env, avoid = blocked, placed = null) {
    // Vật ngoài tường ở xa: bộ đồ dùng env.detail = 0 để giảm số mặt (tán cây, khối tròn).
    const far = { ...env, detail: 0 };
    items.forEach((item, group) => {
      const make = build(item.kind);
      // Mỗi nhóm một chuỗi ngẫu nhiên riêng: thêm / bớt / đổi một nhóm không làm xáo chỗ các nhóm khác.
      const rand = seeded(`${seed}:${group}:${item.kind}`);
      for (let index = 0; index < item.count; index += 1) {
        let x = 0;
        let z = 0;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (item.band) [x, z] = bandPoint(ground, item.band, rand);
          else {
            x = (rand() - 0.5) * 2 * (ground.x[1] + 52);
            z = ground.z[0] - 30 + rand() * (ground.z[1] - ground.z[0] + 100);
          }
          if (!avoid(x, z)) break;
        }
        if (!make || avoid(x, z)) continue;
        placed?.(x, z);
        make(batch, x, z, 0.8 + rand() * 0.7, rand, far);
      }
    });
  }

  // Vật rải của vùng đặt theo vùng (không theo tiểu bang); các mảnh hình của từng vật được nhớ cho vùng đang dùng, đổi
  // tiểu bang (chỗ chừa `clear` khác) chỉ lọc bỏ vật nằm trong chỗ chừa rồi gộp lại, không dựng hình lại.
  let scatterPieces = { name: null, items: [] };
  function buildScatter(theme, kit, env, name) {
    disposeGroup(groups.scatter);
    built.scatter = `${name}|${JSON.stringify(stateClear)}`;
    if (scatterPieces.name !== name) {
      for (const item of scatterPieces.items) for (const piece of item.pieces) piece.geometry.dispose();
      const items = [];
      const recorder = { add: (geometry, material, transform) => items[items.length - 1].pieces.push(ColorBatch.prepare(geometry, material, transform)) };
      if (theme.scatter?.length) {
        scatterInto(recorder, theme.scatter, (kind) => find(kit, 'scatter', kind, 'trees'), `scatter:${name}`, env, reserved, (x, z) => items.push({ x, z, pieces: [] }));
      }
      scatterPieces = { name, items };
    }
    if (!scatterPieces.items.length) return;
    const batch = new ColorBatch();
    for (const item of scatterPieces.items) if (!cleared(item.x, item.z)) for (const piece of item.pieces) batch.push(piece);
    // Ngoài tường không ai đi tới: không đổ bóng thật (đỡ cho shadow map), chỉ nhận ánh nắng.
    batch.build(groups.scatter, vertexMaterial, { keep: true });
  }

  function buildMountains(theme, kit, env) {
    disposeGroup(groups.mountains);
    const batch = new ColorBatch();
    find(kit, 'mountains', theme.mountains?.shape || DEFAULT_MOUNTAINS.shape)?.(batch, env);
    batch.build(groups.mountains, vertexMaterial);
  }

  // Chùa nhìn từ ngoài: bộ đồ vùng có `temple` thì dùng, không thì chùa gốc. Dựng lại khi đổi hàm dựng hoặc tham số.
  function buildTemple(theme, kit, env) {
    const builder = kit.temple || common.temple;
    const key = JSON.stringify(theme.temple || {});
    if (built.temple?.builder === builder && built.temple.key === key) return;
    disposeGroup(groups.temple, templeOwned);
    const batch = new StaticBatch();
    const festivalPositions = [];
    const ctx = {
      batch, m, data, env,
      hall: temple.hall,
      door: data.door,
      params: theme.temple || {},
      textBoard,
      add: (object) => groups.temple.add(object),
      own: (item) => {
        templeOwned.add(item);
        return item;
      },
      glow: (x, y, z) => {
        const sprite = new THREE.Sprite(temple.glowMaterial);
        sprite.position.set(x, y, z);
        sprite.scale.set(1.1, 1.1, 1);
        sprite.renderOrder = GLOW_ORDER;
        groups.temple.add(sprite);
      },
      festival: (points) => festivalPositions.push(...points),
    };
    builder(ctx);
    batch.build(groups.temple, { castShadow: true });
    if (festivalPositions.length) {
      const bulbMaterial = nightMaterial('temple-festival-bulbs', () => new THREE.MeshBasicMaterial({
        color: '#ffd36b', transparent: true, depthWrite: false, toneMapped: false,
      }));
      const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 6, 4), bulbMaterial, festivalPositions.length);
      const dummy = new THREE.Object3D();
      festivalPositions.forEach((position, index) => {
        dummy.position.copy(position);
        dummy.updateMatrix();
        bulbs.setMatrixAt(index, dummy.matrix);
      });
      bulbs.instanceMatrix.needsUpdate = true;
      bulbs.renderOrder = GLOW_ORDER + 2;
      groups.temple.add(bulbs);
      const haloGeometry = new THREE.BufferGeometry();
      haloGeometry.setAttribute('position', new THREE.Float32BufferAttribute(festivalPositions.flatMap((point) => point.toArray()), 3));
      const halos = new THREE.Points(haloGeometry, nightMaterial('temple-festival-halos', () => new THREE.PointsMaterial({
        map: temple.glowMaterial.map, color: '#ffad42', size: 9, sizeAttenuation: false,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
      }), 0.58));
      halos.renderOrder = GLOW_ORDER + 1;
      groups.temple.add(halos);
    }
    built.temple = { builder, key };
  }

  function apply(name, theme, kit) {
    if (name === current) return;
    currentTheme = theme;
    currentKit = kit;
    const env = envFor(theme);
    applyColors(theme, kit, name, env);
    const treeKey = `${name}:${theme.trees || 'banyan'}:${theme.pines || 'pine'}:${theme.treeScale || 1}`;
    if (built.trees !== treeKey) buildTrees(theme, kit, env, treeKey);
    buildScatter(theme, kit, env, name);
    buildMountains(theme, kit, env);
    buildTemple(theme, kit, env);
    if (sun.castShadow) sun.shadow.needsUpdate = true;
    current = name;
  }

  // Lớp tiểu bang trên cảnh vùng đang dùng: ẩn núi vùng nếu bang thay, dựng lại vật rải vùng nếu chỗ chừa đổi, dựng điểm
  // nhìn xa + vật rải của bang. overlay null: không có lớp bang.
  function applyState(code, overlay) {
    const state = overlay?.data || {};
    groups.mountains.visible = !(state.hide || []).includes('mountains');
    if (built.scatter !== `${current}|${JSON.stringify(stateClear)}`) buildScatter(currentTheme, currentKit, envFor(currentTheme), current);
    const key = `${current}|${overlay ? code : ''}`;
    if (built.landmarks === key) return;
    disposeGroup(groups.landmarks);
    animations.length = 0;
    built.landmarks = key;
    currentState = overlay ? code : null;
    if (!overlay) return;
    const kit = overlay.kit;
    const pendingPoints = new Map();
    const env = {
      ...envFor(currentTheme),
      far,
      add: (object) => groups.landmarks.add(object),
      animate: (fn) => animations.push(fn),
      // Quầng sáng đêm (sprite cộng sáng).
      nightGlow: (x, y, z, size = 2, color = '#ffd27a') => {
        const sprite = new THREE.Sprite(nightMaterial(`glow|${color}`, () => new THREE.SpriteMaterial({
          map: temple.glowMaterial.map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        })));
        sprite.position.set(x, y, z);
        sprite.scale.set(size, size, 1);
        sprite.renderOrder = GLOW_ORDER;
        groups.landmarks.add(sprite);
        return sprite;
      },
      // Đốm đèn (cửa sổ thành phố, đèn cầu, cửa sổ nhà gỗ rải ngoài tường): points = [[x, y, z], …]. Mọi lần gọi cùng
      // màu + cỡ gom thành một lệnh vẽ, dựng sau khi xong lớp bang.
      nightPoints: (points, { color = '#ffd27a', size = 0.7 } = {}) => {
        const key = `${color}|${size}`;
        if (!pendingPoints.has(key)) pendingPoints.set(key, { color, size, list: [] });
        const list = pendingPoints.get(key).list;
        for (const point of points) list.push(point[0], point[1], point[2]);
      },
      // Khối phát sáng mờ chỉ hiện khi tối (luồng sáng hải đăng…); trả mesh để quay / dời bằng animate.
      // vertexColors: nhân thêm màu đỉnh của hình (mỗi phần sáng một màu, vd. khinh khí cầu).
      nightMesh: (geometry, color = '#fff3c4', opacity = 0.3, { vertexColors = false } = {}) => {
        const mesh = new THREE.Mesh(geometry, nightMaterial(`mesh|${color}|${opacity}|${vertexColors}`, () => new THREE.MeshBasicMaterial({
          color, vertexColors, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
        }), opacity));
        mesh.renderOrder = GLOW_ORDER;
        groups.landmarks.add(mesh);
        return mesh;
      },
    };
    const batch = new ColorBatch();
    (state.landmarks || []).forEach((item, index) => {
      const build = kit.landmarks?.[item.kind] || currentKit.landmarks?.[item.kind] || landmarkCommon.landmarks?.[item.kind];
      if (!build) {
        warnOnce(`landmark:${item.kind}`, `Phong cảnh: không có điểm đặc trưng ${item.kind}`);
        return;
      }
      const [x, z] = landmarkPoint(ground, item);
      build(batch, x, z, item.scale ?? 1, seeded(`landmark:${code}:${index}:${item.kind}`), env, {
        face: Math.atan2(-x, midZ - z), side: item.side, haze: item.haze ?? 0.4, params: item.params || {},
      });
    });
    // Vật rải: bộ đồ bang → thư viện chung của lớp bang → bộ đồ vùng → bộ đồ chung phong cảnh.
    const findScatter = (kind) => kit.scatter?.[kind] || kit.trees?.[kind] || landmarkCommon.scatter?.[kind] || find(currentKit, 'scatter', kind, 'trees');
    scatterInto(batch, state.scatter || [], findScatter, `state:${code}`, env);
    batch.build(groups.landmarks, vertexMaterial);
    for (const { color, size, list } of pendingPoints.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
      const dots = new THREE.Points(geometry, nightMaterial(`points|${color}|${size}`, () => new THREE.PointsMaterial({
        color, size, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })));
      dots.renderOrder = GLOW_ORDER;
      groups.landmarks.add(dots);
    }
  }

  // Tải dữ liệu rồi bộ đồ của tiểu bang (một lần). Bang chưa làm (404) thì không có lớp bang; dữ liệu lỗi thì bỏ qua và
  // thử lại lần sau.
  function loadState(code) {
    if (!loadedStates.has(code)) {
      loadedStates.set(code, fetch(`${stateBase}${code}.json`).then((response) => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }).then((state) => {
        if (!state) return null;
        const errors = validateState(code, state);
        if (errors.length) throw new Error(errors.join('; '));
        return import(`./landmarks/${code}.mjs`).then((module) => module.kit || {}, () => ({})).then((kit) => ({ data: state, kit }));
      }).catch((error) => {
        loadedStates.delete(code);
        warnOnce(`state:${code}`, `Phong cảnh: lớp tiểu bang ${code} lỗi (${error.message}), chỉ dùng cảnh vùng`);
        return null;
      }));
    }
    return loadedStates.get(code);
  }

  // Tải dữ liệu rồi bộ đồ của vùng (một lần). Vùng chưa làm (chưa có dữ liệu) thì không hỏi bộ đồ; dữ liệu lỗi thì từ
  // chối; bộ đồ tải lỗi thì chỉ dùng bộ đồ chung.
  function load(name) {
    if (!loaded.has(name)) {
      loaded.set(name, fetch(`${themeBase}${name}.json`).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }).then((theme) => {
        const errors = validateTheme(name, theme);
        if (errors.length) throw new Error(errors.join('; '));
        return import(`./landscape/${name}.mjs`).then((module) => module.kit || {}, () => ({})).then((kit) => ({ theme, kit }));
      }));
    }
    return loaded.get(name);
  }

  apply('default', {}, {});

  return {
    // Đổi vùng (tên trong THIEN_THEMES; 'default' / vùng chưa có dữ liệu là cảnh gốc) và lớp tiểu bang (state: mã bang,
    // null = không có). Trả Promise tên vùng đang dùng. Gọi dồn nhiều lần (đổi tiểu bang liên tục) thì chỉ lần gọi sau
    // cùng có hiệu lực.
    setTheme(name, { state = null } = {}) {
      const key = typeof name === 'string' && NAME.test(name) && themeBase ? name : 'default';
      const code = typeof state === 'string' && /^[a-z]{2}$/.test(state) && stateBase ? state : null;
      const mine = ++request;
      const region = key === 'default' ? Promise.resolve({ theme: {}, kit: {} }) : load(key).catch((error) => {
        loaded.delete(key);
        warnOnce(`theme:${key}`, `Phong cảnh: chưa có vùng ${key} (${error.message}), dùng cảnh gốc`);
        return null;
      });
      return Promise.all([region, code ? loadState(code) : null]).then(([found, overlay]) => {
        if (mine !== request) return current;
        stateClear = overlay?.data.clear || [];
        apply(found ? key : 'default', found?.theme || {}, found?.kit || {});
        applyState(code, overlay);
        return current;
      });
    },
    // Mỗi khung (courtyard): night = mức tối 0–1 (đèn đêm của tiểu bang), outside = camera ở sân (chạy chuyển động).
    tick(seconds, night = 0, outside = 1) {
      if (pendingGrove) {
        const job = pendingGrove;
        pendingGrove = null;
        buildGrove(job);
      }
      if (Math.abs(night - nightLevel) > 0.004) {
        nightLevel = night;
        for (const material of nightMaterials.values()) {
          material.opacity = material.userData.base * night;
          material.visible = night > 0.01;
        }
      }
      if (outside > 0.02) for (const step of animations) step(seconds);
    },
    // Chỉ để đo "độ thấy" khi phát triển: ẩn / hiện lớp tiểu bang.
    setLandmarksVisible(on) {
      groups.landmarks.visible = Boolean(on);
    },
    theme() {
      return current;
    },
    // Số mesh (≈ lệnh vẽ) và tam giác của riêng phần phong cảnh: cây, vật rải, núi, chùa (ngân sách KE_HOACH_VUNG.md).
    // landmarks: riêng lớp tiểu bang (ngân sách KE_HOACH_BANG.md).
    stats() {
      const count = (list) => {
        let meshes = 0;
        let triangles = 0;
        for (const group of list) {
          group.traverse((item) => {
            if (!item.isMesh && !item.isSprite && !item.isPoints) return;
            meshes += 1;
            if (item.isMesh) triangles += (item.geometry.index?.count ?? item.geometry.attributes.position.count) / 3;
          });
        }
        return { meshes, triangles: Math.round(triangles) };
      };
      const region = count([groups.trees, groups.grove, groups.scatter, groups.mountains, groups.temple]);
      return { theme: current, ...region, state: currentState, landmarks: count([groups.landmarks]) };
    },
  };
}
