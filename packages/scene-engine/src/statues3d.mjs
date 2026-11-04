// Tượng quét 3D thật (bản quét bảo tàng, CC0) thay cho tượng dựng bằng khối. Tải sau khi cảnh đã hiện: tải xong thì
// ẩn tượng khối tương ứng; tải lỗi thì giữ nguyên tượng khối (cảnh không bao giờ thiếu tượng).
//
// world.statues (scene JSON):
//   buddha:  { src, fit: true, throne?, height?, finish? } — khớp vào khung bao của tượng Phật khối trên bàn thờ;
//            throne: true → dựng bệ bát giác + đài sen phát sáng + vầng lửa (throne3d.mjs), tượng ngồi trên đài sen,
//            cả bộ cao `height` (mặc định bằng khung bao tượng khối); finish: 'bronze' → phủ ánh kim loại đồng
//   shrine:  [{ src, x, z, y?, height, throne?, finish?, replaces? }] — các tượng trên bàn thờ (vd Tây Phương: A Di Đà
//            giữa, Địa Tạng trái, Quan Âm phải). throne: true | { lotus: false } dựng bệ + vầng lửa (throne3d.mjs), cả bộ
//            cao `height`; không có throne thì tượng cao `height`. replaces: 'buddha' → ẩn tượng Phật khối khi tải xong.
//   guardians: [{ src, x, z, ry, height, finish? }]    — tượng Hộ pháp đứng trên bệ thấp
//   guanyin: { src, height, material?: 'whiteStone' } — đặt tại world.courtyard.guanyin (x, z, ry), trên bệ đá
//   arhats:  [{ src, height, ry?, finish? }]           — các mẫu La Hán; world.courtyard.arhats[i].model chọn mẫu
//                                                        (mặc định xen kẽ), arhats[i].finish đổi chất liệu từng vị.
//                                                        ry: xoay thêm nếu bản quét quay lưng.
//   arhat:   { src, height }                          — (cũ) một mẫu dùng chung
// File .glb đã nén meshopt + WebP (xem KE_HOACH2.md, mục tượng thật). Mặt trước mô hình là +z, gốc ở giữa đáy, cao 1.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { buildThrone } from './throne3d.mjs';

let loader = null;
function gltfLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

// Gom mọi mesh trong file thành danh sách { geometry, material } (đã áp biến đổi nội bộ của file).
async function loadParts(src) {
  const gltf = await gltfLoader().loadAsync(src);
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone();
    // File nén lưu vị trí/pháp tuyến dạng số nguyên (KHR_mesh_quantization); đổi sang float trước khi áp biến đổi,
    // không thì giá trị sau biến đổi bị ghi tràn vào mảng nguyên (đỉnh văng ra thành "gậy").
    for (const name of ['position', 'normal']) {
      const attribute = geometry.getAttribute(name);
      if (!attribute || attribute.array instanceof Float32Array) continue;
      const values = new Float32Array(attribute.count * 3);
      for (let index = 0; index < attribute.count; index += 1) {
        values[index * 3] = attribute.getX(index);
        values[index * 3 + 1] = attribute.getY(index);
        values[index * 3 + 2] = attribute.getZ(index);
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
    }
    geometry.applyMatrix4(node.matrixWorld);
    // Bản quét unlit thường không có pháp tuyến: thiếu thì vật liệu chuẩn tính sáng ra đen thui, nên tự tính.
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    // Bản quét "unlit" (KHR_materials_unlit → MeshBasicMaterial) không nhận ánh sáng và không đổi chất liệu được:
    // chuyển sang vật liệu chuẩn giữ nguyên texture.
    const material = node.material?.isMeshBasicMaterial
      ? new THREE.MeshStandardMaterial({ map: node.material.map, color: node.material.color, roughness: 0.6 })
      : node.material;
    parts.push({ geometry, material });
  });
  return parts;
}

function whiteStone() {
  return new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: 0.62, metalness: 0, envMapIntensity: 0.5 });
}

// Chất liệu phủ lên bản quét: 'bronze' (giữ texture, ánh kim loại ấm), 'gold' (mạ vàng), 'stone' (đá trắng, bỏ texture
// màu). Các vị La Hán dùng chung một dáng nhờ vậy vẫn trông khác nhau.
function finished(material, finish) {
  if (!material || !['bronze', 'gold', 'stone'].includes(finish)) return material;
  const copy = material.clone();
  if (finish === 'stone') {
    copy.map = null;
    copy.color = new THREE.Color('#e4dfd5');
    copy.metalness = 0;
    copy.roughness = 0.8;
    copy.emissive = new THREE.Color('#000000');
  } else {
    // Kim loại thấp: điện thoại yếu tắt ánh sáng môi trường, khi đó vật liệu kim loại cao không có gì để phản chiếu và
    // thành đen thui. Ánh vàng/đồng lấy từ màu, ánh tự phát và đèn.
    copy.color = new THREE.Color(finish === 'gold' ? '#ffd27a' : '#ffffff');
    copy.metalness = 0.3;
    copy.roughness = finish === 'gold' ? 0.4 : 0.48;
    copy.envMapIntensity = 1.1;
    copy.emissive = new THREE.Color(finish === 'gold' ? '#6a420c' : '#3a1d08');
    copy.emissiveIntensity = 0.55;
  }
  copy.needsUpdate = true;
  return copy;
}

function placeMatrix({ x, y = 0, z, ry = 0, height }) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
    new THREE.Vector3(height, height, height),
  );
}

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'];

// onProgress(done, total): số tệp tượng đã tải xong (để trang hiện "Đang tải cảnh…").
export function loadStatues({ root, world, buddha, courtyard, shadows = false, renderer = null, camera = null, scene3d = null, onProgress = null }) {
  const config = world.statues;
  if (!config) return Promise.resolve([]);
  const tasks = [];
  // Biên dịch shader và đưa ảnh lên GPU trước khi đưa tượng vào cảnh: không thì khung hình đầu có tượng dừng vài
  // trăm ms (giật khi đang đi). Tượng tải xong cùng lúc thì xếp hàng, mỗi khung hình hiện một nhóm, để không dồn
  // thành một lần đứng hình dài (hay rơi đúng lúc vừa vào phòng).
  let revealing = Promise.resolve();
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const reveal = (...objects) => {
    revealing = revealing.then(async () => {
      await nextFrame();
      // compileAsync của three 0.160 lỗi với nhóm chưa nằm trong cảnh, nên biên dịch đồng bộ (một lần, lúc tượng vừa tải).
      if (renderer?.compile && camera && scene3d) {
        const holding = new THREE.Group();
        holding.add(...objects);
        try {
          renderer.compile(holding, camera, scene3d);
        } catch {}
      }
      if (renderer?.initTexture) {
        const seen = new Set();
        for (const object of objects) {
          object.traverse((mesh) => {
            for (const material of [mesh.material].flat()) {
              for (const slot of TEXTURE_SLOTS) {
                const texture = material?.[slot];
                if (texture && !seen.has(texture)) {
                  seen.add(texture);
                  renderer.initTexture(texture);
                }
              }
            }
          });
        }
      }
      root.add(...objects);
    });
    return revealing;
  };
  // Đếm tệp tải xong (thành công hay lỗi) để báo tiến độ.
  let loaded = 0;
  let total = 0;
  const loadPartsCounted = (src) => {
    total += 1;
    return loadParts(src).finally(() => {
      loaded += 1;
      onProgress?.(loaded, total);
    });
  };
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.88 });

  // Tượng Phật trong chánh điện: đo khung bao tượng khối (không tính hào quang) rồi đặt bản quét vào đúng chỗ đó.
  if (config.buddha?.src && buddha) {
    tasks.push(loadPartsCounted(config.buddha.src).then((parts) => {
      const keep = new Set([buddha.aureole, buddha.haloDisc, buddha.haloRing].filter(Boolean));
      const box = new THREE.Box3();
      buddha.group.updateMatrixWorld(true);
      for (const child of buddha.group.children) if (!keep.has(child)) box.expandByObject(child);
      const center = box.getCenter(new THREE.Vector3());
      const statue = new THREE.Group();
      for (const part of parts) {
        const mesh = new THREE.Mesh(part.geometry, finished(part.material, config.buddha.finish));
        mesh.castShadow = shadows;
        statue.add(mesh);
      }
      const objects = [statue];
      if (config.buddha.throne) {
        // Bộ tượng kiểu đồng: bệ + đài sen + vầng lửa; tượng ngồi trên đài sen. Ẩn cả hào quang khối cũ.
        const throne = buildThrone(config.buddha.height || box.max.y - box.min.y);
        throne.group.position.set(center.x, box.min.y, center.z);
        statue.applyMatrix4(placeMatrix({ x: center.x, y: box.min.y + throne.seatY, z: center.z, height: throne.statueHeight }));
        objects.push(throne.group);
        keep.clear();
      } else {
        statue.applyMatrix4(placeMatrix({ x: center.x, y: box.min.y, z: center.z, height: box.max.y - box.min.y }));
      }
      return reveal(...objects).then(() => {
        for (const child of buddha.group.children) if (!keep.has(child)) child.visible = false;
        return 'buddha';
      });
    }));
  }

  // Các tượng trên bàn thờ (shrine): mỗi tượng một bộ bệ + vầng lửa, đặt trên mặt bệ thờ (y mặc định 0,75).
  (config.shrine || []).forEach((item, index) => {
    if (!item?.src) return;
    tasks.push(loadPartsCounted(item.src).then((parts) => {
      const statue = new THREE.Group();
      for (const part of parts) {
        const mesh = new THREE.Mesh(part.geometry, finished(part.material, item.finish));
        mesh.castShadow = shadows;
        statue.add(mesh);
      }
      const y = item.y ?? 0.75;
      const objects = [statue];
      if (item.throne) {
        const throne = buildThrone(item.height || 3, item.throne === true ? {} : item.throne);
        throne.group.position.set(item.x, y, item.z);
        statue.applyMatrix4(placeMatrix({ x: item.x, y: y + throne.seatY, z: item.z, ry: item.ry || 0, height: throne.statueHeight }));
        objects.push(throne.group);
      } else {
        statue.applyMatrix4(placeMatrix({ x: item.x, y, z: item.z, ry: item.ry || 0, height: item.height || 2.5 }));
      }
      return reveal(...objects).then(() => {
        if (item.replaces === 'buddha' && buddha) for (const child of buddha.group.children) child.visible = false;
        return item.id || `shrine${index + 1}`;
      });
    }));
  });

  // Hộ pháp: tượng đứng trên bệ đồng thấp.
  (config.guardians || []).forEach((guardian, index) => {
    if (!guardian?.src) return;
    tasks.push(loadPartsCounted(guardian.src).then((parts) => {
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.3, 8), new THREE.MeshStandardMaterial({ color: '#5a3418', metalness: 0.3, roughness: 0.5, emissive: '#1c0d04', emissiveIntensity: 0.6 }));
      plinth.position.set(guardian.x, 0.15, guardian.z);
      plinth.rotation.y = Math.PI / 8;
      const statue = new THREE.Group();
      for (const part of parts) {
        const mesh = new THREE.Mesh(part.geometry, finished(part.material, guardian.finish));
        mesh.castShadow = shadows;
        statue.add(mesh);
      }
      statue.applyMatrix4(placeMatrix({ x: guardian.x, y: 0.3, z: guardian.z, ry: guardian.ry || 0, height: guardian.height || 1.9 }));
      return reveal(plinth, statue).then(() => `guardian${index + 1}`);
    }));
  });

  const yard = world.courtyard;
  // Quan Âm: bản quét phủ đá trắng, đặt trên bệ đá tròn tại vị trí tượng khối.
  if (config.guanyin?.src && yard?.guanyin) {
    tasks.push(loadPartsCounted(config.guanyin.src).then((parts) => {
      const spot = yard.guanyin;
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 1.1, 32), stoneMaterial);
      plinth.position.set(spot.x, 0.55, spot.z);
      const statue = new THREE.Group();
      const material = config.guanyin.material === 'whiteStone' ? whiteStone() : null;
      for (const part of parts) {
        const mesh = new THREE.Mesh(part.geometry, material || part.material);
        mesh.castShadow = shadows;
        statue.add(mesh);
      }
      statue.applyMatrix4(placeMatrix({ x: spot.x, y: 1.1, z: spot.z, ry: spot.ry || 0, height: config.guanyin.height || 5 }));
      return reveal(plinth, statue).then(() => {
        if (courtyard?.proceduralStatues?.guanyin) courtyard.proceduralStatues.guanyin.visible = false;
        return 'guanyin';
      });
    }));
  }

  // 18 vị La Hán: mỗi mẫu một nhóm InstancedMesh (mỗi phần vật liệu một mesh), bệ đá vuông vừa khổ từng mẫu, mỗi vị
  // một sắc hơi khác. Mẫu nào tải lỗi thì các vị dùng mẫu đó lấy mẫu tải được đầu tiên.
  const models = config.arhats || (config.arhat?.src ? [config.arhat] : []);
  if (models.length && yard?.arhats?.length) {
    tasks.push(Promise.allSettled(models.map((model) => loadPartsCounted(model.src))).then(async (results) => {
      const loaded = results.map((result) => (result.status === 'fulfilled' ? result.value : null));
      const fallback = loaded.findIndex(Boolean);
      if (fallback < 0) throw new Error('không tải được mẫu La Hán nào');
      // Gom theo (mẫu, chất liệu): mỗi nhóm một bộ InstancedMesh.
      const groups = new Map();
      yard.arhats.forEach((item, index) => {
        let model = Number.isInteger(item.model) ? item.model % models.length : index % models.length;
        if (!loaded[model]) model = fallback;
        const key = `${model}:${item.finish || models[model].finish || ''}`;
        if (!groups.has(key)) groups.set(key, { model, finish: item.finish || models[model].finish, members: [] });
        groups.get(key).members.push({ item, index });
      });
      const tint = new THREE.Color();
      const objects = [];
      for (const { model, finish, members } of groups.values()) {
        const parts = loaded[model];
        const height = models[model].height || 1.5;
        const turn = models[model].ry || 0;
        const footprint = new THREE.Box3();
        for (const part of parts) {
          part.geometry.computeBoundingBox();
          footprint.union(part.geometry.boundingBox);
        }
        const plinthWidth = (footprint.max.x - footprint.min.x) * height + 0.2;
        const plinthDepth = (footprint.max.z - footprint.min.z) * height + 0.2;
        const plinths = new THREE.InstancedMesh(new THREE.BoxGeometry(plinthWidth, 0.4, plinthDepth), stoneMaterial, members.length);
        members.forEach(({ item }, slot) => plinths.setMatrixAt(slot, placeMatrix({ x: item.x, y: 0.2, z: item.z, ry: item.ry || 0, height: 1 })));
        objects.push(plinths);
        for (const part of parts) {
          const mesh = new THREE.InstancedMesh(part.geometry, finished(part.material, finish), members.length);
          members.forEach(({ item, index }, slot) => {
            mesh.setMatrixAt(slot, placeMatrix({ x: item.x, y: 0.4, z: item.z, ry: (item.ry || 0) + turn, height: height * (item.scale || 1) * (0.96 + (index % 3) * 0.03) }));
            // Sắc hơi khác nhau: ấm, trung tính, hơi xám xen nhau.
            tint.setHSL(0.09 + (index % 3) * 0.015, 0.1 + (index % 4) * 0.04, 0.86 + (index % 3) * 0.05);
            mesh.setColorAt(slot, tint);
          });
          mesh.castShadow = shadows;
          objects.push(mesh);
        }
      }
      await reveal(...objects);
      if (courtyard?.proceduralStatues?.arhats) courtyard.proceduralStatues.arhats.visible = false;
      return 'arhats';
    }));
  }

  // Tượng nào lỗi thì bỏ qua (giữ tượng khối), tượng khác vẫn thay bình thường.
  return Promise.allSettled(tasks).then((results) => results.filter((item) => item.status === 'fulfilled').map((item) => item.value));
}
