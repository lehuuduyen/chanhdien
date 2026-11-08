// Mô hình trang trí tĩnh (Meshy, /models/…/*.glb): tải một lần mỗi file, chuẩn hóa về đáy y = 0, tâm x/z = 0, mặt nhìn
// về +z như file gốc. Hai cách đặt:
//   placeProp(root, url, item)        — một bản (đình, cổng vòm, đèn đá, nhà vịt…): item = { x, y?, z, ry?, height | width | size }.
//   instanceProp(root, url, items)    — nhiều bản cùng hình (đá bờ hồ, sen…) bằng InstancedMesh: mỗi mesh của file một
//                                        lượt vẽ cho cả nhóm. items = [{ x, y?, z, ry?, rx?, s }] (s: tỉ lệ so với kích thước gốc).
// Kích thước: height = chiều cao đích (m), width = bề ngang x đích, size = cạnh lớn nhất đích; không có thì giữ nguyên.
// Hàm trả Promise (không ném lỗi): tải lỗi thì null để chỗ gọi giữ hình dựng bằng khối làm dự phòng.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let loader = null;
const cache = new Map();

function loadNormalized(url) {
  if (!cache.has(url)) {
    if (!loader) {
      loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    cache.set(url, loader.loadAsync(url).then((gltf) => {
      const scene = gltf.scene;
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      // Gộp biến đổi của từng node vào hình (để dùng làm InstancedMesh), dời đáy về y = 0, tâm về gốc.
      const offset = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
      const parts = [];
      scene.traverse((node) => {
        if (!node.isMesh) return;
        const geometry = node.geometry.clone();
        // File nén meshopt lưu tọa độ / pháp tuyến dạng số nguyên chuẩn hóa (chỉ chứa được −1…1): đổi sang số thực
        // trước khi gộp biến đổi, không thì giá trị vượt khoảng bị cắt và hình méo (vách đen trong lòng đình).
        for (const name of ['position', 'normal']) {
          const attribute = geometry.getAttribute(name);
          if (!attribute || (attribute.array instanceof Float32Array && !attribute.normalized)) continue;
          const values = new Float32Array(attribute.count * 3);
          for (let index = 0; index < attribute.count; index += 1) {
            values[index * 3] = attribute.getX(index);
            values[index * 3 + 1] = attribute.getY(index);
            values[index * 3 + 2] = attribute.getZ(index);
          }
          geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
        }
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(offset, node.matrixWorld));
        parts.push({ geometry, material: node.material });
      });
      return { parts, size };
    }).catch((error) => {
      console.warn(`Không tải được mô hình ${url}: ${error.message}`);
      return null;
    }));
  }
  return cache.get(url);
}

const fitScale = (size, item) => (item.height ? item.height / size.y
  : item.width ? item.width / size.x
    : item.size ? item.size / Math.max(size.x, size.y, size.z) : 1);

// receiveShadow: false cho kiến trúc có mái che (đình): bóng mái tự đổ lên chính mô hình thành vệt đen như rèm.
export function placeProp(root, url, item, { shadow = true, receiveShadow = true } = {}) {
  return loadNormalized(url).then((model) => {
    if (!model) return null;
    const group = new THREE.Group();
    for (const { geometry, material } of model.parts) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = shadow;
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    group.scale.setScalar(fitScale(model.size, item) * (item.s || 1));
    group.position.set(item.x, item.y || 0, item.z);
    group.rotation.y = item.ry || 0;
    root.add(group);
    return group;
  });
}

// base: kích thước cho s = 1 ({ height | width | size }); từng item nhân thêm s.
// brighten: làm sáng màu ảnh (tự phát sáng nhẹ theo chính ảnh màu) cho vật có ảnh gốc quá tối (đá granite).
export function instanceProp(root, url, items, base = {}, { shadow = true, brighten = 0 } = {}) {
  if (!items.length) return Promise.resolve(null);
  return loadNormalized(url).then((model) => {
    if (!model) return null;
    const scale = fitScale(model.size, base);
    const dummy = new THREE.Object3D();
    const group = new THREE.Group();
    for (const { geometry, material: original } of model.parts) {
      let material = original;
      if (brighten > 0) {
        material = original.clone();
        material.emissive = new THREE.Color('#ffffff');
        material.emissiveMap = original.map || null;
        material.emissiveIntensity = brighten;
      }
      const mesh = new THREE.InstancedMesh(geometry, material, items.length);
      items.forEach((item, index) => {
        dummy.position.set(item.x, item.y || 0, item.z);
        dummy.rotation.set(item.rx || 0, item.ry || 0, 0);
        dummy.scale.setScalar(scale * (item.s || 1));
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    root.add(group);
    return group;
  });
}
