// Phong cảnh sân chùa theo vùng (chánh điện tiểu bang nào dùng vùng nào: THIEN_THEMES trong room rules). Chỉ đổi phần
// nhìn: trời, sương, ánh nắng, đất ngoài tường, nền sân, núi xa, kiểu cây (đứng đúng chỗ cây trong scene nên vật cản
// đi lại không đổi), cây / đá rải ngoài tường, màu mái / tường / gạch / cột và chùa nhìn từ ngoài. Không đụng bố cục
// sân nên bot, trốn tìm, vườn, ghế giữ nguyên ở mọi vùng.
//
// Mỗi vùng gồm dữ liệu `<themeBase><vùng>.json` (kiểm tra bằng validateTheme) và bộ đồ dựng hình
// `landscape/<vùng>.mjs`, chỉ tải khi chọn vùng đó. Kiểu nhắc tới trong dữ liệu được tìm trong bộ đồ
// của vùng trước, rồi tới bộ đồ chung `landscape/common.mjs` (hình dạng bộ đồ ghi ở đầu file đó). Vùng 'default' là
// cảnh gốc, dựng ngay lúc tạo. Kế hoạch chia vùng: KE_HOACH_VUNG.md.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { StaticBatch } from './temple3d-models.mjs';
import { validateTheme } from './world.mjs';
import { GLOW_ORDER } from './daylight3d.mjs';
import { kit as common, seeded } from './landscape/common.mjs';

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

  add(geometry, material, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    const plain = material.isMeshStandardMaterial && !material.map && !material.transparent;
    const key = plain
      ? `${material.flatShading ? 'flat' : 'smooth'}|${material.side}|${material.emissive.getHexString()}|${material.emissiveIntensity}|${material.metalness > 0.1}`
      : material;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
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
    if (!this.parts.has(key)) this.parts.set(key, { material, plain, geometries: [] });
    this.parts.get(key).geometries.push(prepared);
  }

  // materialFor(mẫu): vật liệu màu đỉnh dùng chung cho một kiểu bề mặt (engine giữ, không tạo mới mỗi lần dựng).
  build(root, materialFor, { castShadow = false } = {}) {
    for (const { material, plain, geometries } of this.parts.values()) {
      const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
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

// Giải phóng hình của một nhóm; owned: vật liệu / texture tạo riêng cho lần dựng đó.
function disposeGroup(group, owned = null) {
  group.traverse((item) => { if (item.isMesh) item.geometry.dispose(); });
  for (const item of owned || []) item.dispose();
  owned?.clear();
  group.clear();
}

// root: nhóm cảnh; data: world.courtyard; m: vật liệu của sân (đổi màu roof/wall/brick/pillar, cỏ); field: mặt đất
// ngoài tường; lawns: vật liệu cỏ trong sân; sun: nắng (vẽ lại bóng khi đổi cảnh); paint(bảng màu): nhận màu ban ngày
// của vùng { top, horizon, fog, sun, sky, ground } để sân pha theo giờ (daylight3d.mjs) rồi đặt vào trời / sương / đèn;
// themeBase: đường dẫn thư mục dữ liệu vùng (vd. '/scenes/thien-default/themes/'), null thì chỉ có cảnh gốc;
// temple: { hall, door, textBoard, glowMaterial } để dựng chùa nhìn từ ngoài.
export function createLandscape({ root, renderer, data, materials: m, field, lawns, sun, paint, themeBase = null, temple }) {
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
    const key = `${sample.flatShading}|${sample.side}|${sample.emissive.getHexString()}|${sample.emissiveIntensity}|${sample.metalness > 0.1}`;
    if (!vertexMaterials.has(key)) {
      vertexMaterials.set(key, new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: sample.roughness, metalness: sample.metalness, flatShading: sample.flatShading, side: sample.side,
        emissive: sample.emissive, emissiveIntensity: sample.emissiveIntensity,
      }));
    }
    return vertexMaterials.get(key);
  };
  const defaults = {
    colors: Object.fromEntries(['roof', 'wall', 'brick', 'pillar'].map((key) => [key, `#${m[key].color.getHexString()}`])),
    lawns: lawns.map((item) => ({
      color: item.color.clone(), emissive: item.emissive.clone(), intensity: item.emissiveIntensity, roughness: item.roughness,
      maps: { map: item.map, normalMap: item.normalMap, roughnessMap: item.roughnessMap },
    })),
    sky: { top: data.sky?.top || '#7aa6d8', horizon: data.sky?.horizon || '#f6dcb0' },
  };
  const groups = Object.fromEntries(['trees', 'scatter', 'mountains', 'temple'].map((name) => {
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
  const warned = new Set();
  let current = null;
  let request = 0;
  const built = { trees: null, temple: null };

  // Tìm kiểu trong bộ đồ vùng rồi bộ đồ chung; không có thì cảnh báo một lần và bỏ qua.
  const find = (kit, section, kind, also = null) => {
    const found = kit[section]?.[kind] || (also && kit[also]?.[kind]) || common[section]?.[kind] || (also && common[also]?.[kind]);
    if (!found && !warned.has(`${section}:${kind}`)) {
      warned.add(`${section}:${kind}`);
      console.warn(`Phong cảnh: không có kiểu ${section}.${kind}`);
    }
    return found || null;
  };
  const envFor = (theme) => ({
    m, material, renderer, ground, midZ, theme, detail: 1,
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
  }

  // Rải ngoài tường (giữa tường sân và núi), chừa hai bên / sau chánh điện và lối trước cổng cho cảnh thoáng.
  function buildScatter(theme, kit, env, name) {
    disposeGroup(groups.scatter);
    if (!theme.scatter?.length) return;
    const batch = new ColorBatch();
    const blocked = (x, z) => (x > ground.x[0] - 5 && x < ground.x[1] + 5 && z > ground.z[0] - 26 && z < ground.z[1] + 5)
      || (Math.abs(x) < 9 && z < ground.z[1] + 30);
    // Vật ngoài tường ở xa: bộ đồ dùng env.detail = 0 để giảm số mặt (tán cây, khối tròn).
    const far = { ...env, detail: 0 };
    theme.scatter.forEach((item, group) => {
      const build = find(kit, 'scatter', item.kind, 'trees');
      // Mỗi nhóm một chuỗi ngẫu nhiên riêng: thêm / bớt / đổi một nhóm không làm xáo chỗ các nhóm khác.
      const rand = seeded(`scatter:${name}:${group}:${item.kind}`);
      for (let index = 0; index < item.count; index += 1) {
        let x = 0;
        let z = 0;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (item.band) [x, z] = bandPoint(ground, item.band, rand);
          else {
            x = (rand() - 0.5) * 2 * (ground.x[1] + 52);
            z = ground.z[0] - 30 + rand() * (ground.z[1] - ground.z[0] + 100);
          }
          if (!blocked(x, z)) break;
        }
        if (!build || blocked(x, z)) continue;
        build(batch, x, z, 0.8 + rand() * 0.7, rand, far);
      }
    });
    // Ngoài tường không ai đi tới: không đổ bóng thật (đỡ cho shadow map), chỉ nhận ánh nắng.
    batch.build(groups.scatter, vertexMaterial);
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
    };
    builder(ctx);
    batch.build(groups.temple, { castShadow: true });
    built.temple = { builder, key };
  }

  function apply(name, theme, kit) {
    if (name === current) return;
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
    // Đổi vùng (tên trong THIEN_THEMES; 'default' / vùng chưa có dữ liệu là cảnh gốc). Trả Promise tên vùng đang dùng.
    // Gọi dồn nhiều lần (đổi tiểu bang liên tục) thì chỉ lần gọi sau cùng có hiệu lực.
    setTheme(name) {
      const key = typeof name === 'string' && NAME.test(name) && themeBase ? name : 'default';
      const mine = ++request;
      if (key === 'default') {
        apply('default', {}, {});
        return Promise.resolve(current);
      }
      if (key === current) return Promise.resolve(current);
      return load(key).then(({ theme, kit }) => {
        if (mine === request) apply(key, theme, kit);
        return current;
      }, (error) => {
        loaded.delete(key);
        if (!warned.has(`theme:${key}`)) {
          warned.add(`theme:${key}`);
          console.warn(`Phong cảnh: chưa có vùng ${key} (${error.message}), dùng cảnh gốc`);
        }
        if (mine === request) apply('default', {}, {});
        return current;
      });
    },
    theme() {
      return current;
    },
    // Số mesh (≈ lệnh vẽ) và tam giác của riêng phần phong cảnh: cây, vật rải, núi, chùa (ngân sách KE_HOACH_VUNG.md).
    stats() {
      let meshes = 0;
      let triangles = 0;
      for (const group of Object.values(groups)) {
        group.traverse((item) => {
          if (!item.isMesh && !item.isSprite) return;
          meshes += 1;
          if (item.isMesh) triangles += (item.geometry.index?.count ?? item.geometry.attributes.position.count) / 3;
        });
      }
      return { theme: current, meshes, triangles: Math.round(triangles) };
    },
  };
}
