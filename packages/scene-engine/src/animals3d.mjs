// Chó mèo trong vườn chùa: dựng bằng khối, mỗi loài gộp thành ba InstancedMesh (thân + đầu, chân, đuôi) nên cả đàn chỉ
// tốn vài lệnh vẽ. Mỗi con đi lang thang trong vùng của mình (area), tránh vật cản theo world.walk, lúc đứng vẫy đuôi,
// lúc nằm nghỉ. Chạy riêng trên từng máy (không đồng bộ qua server); hạt ngẫu nhiên cố định nên ai cũng thấy gần giống.
//
// world.courtyard.animals: [{ id, name, type: 'dog' | 'cat', color, x, z, area: { x: [min, max], z: [min, max] } }]
// Thú có mô hình riêng thêm { model: '/models/pets/<tên>.glb', height, modelRy? }: file tĩnh (không khung xương) tải sau,
// đi lại bằng cùng bộ não với thú khối; dáng đi làm bằng code (nảy, lắc mình, cúi ăn, nằm nghỉ).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { isWalkable } from './walk.mjs';

// Gộp các khối thành một geometry có màu đỉnh (màu lông lấy từ instanceColor nhân vào; mắt, mũi giữ màu tối).
function merge(parts) {
  return BufferGeometryUtils.mergeGeometries(parts.map(({ geometry, shade = 1, tone = null, at = [0, 0, 0], scale = [1, 1, 1], rotate = [0, 0, 0] }) => {
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const name of Object.keys(plain.attributes)) if (!['position', 'normal'].includes(name)) plain.deleteAttribute(name);
    plain.scale(...scale);
    plain.rotateX(rotate[0]);
    plain.rotateY(rotate[1]);
    plain.rotateZ(rotate[2]);
    plain.translate(...at);
    const color = tone ? new THREE.Color(tone) : new THREE.Color(shade, shade, shade);
    const colors = new Float32Array(plain.attributes.position.count * 3);
    for (let index = 0; index < colors.length; index += 3) colors.set([color.r, color.g, color.b], index);
    plain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return plain;
  }));
}

// Kích thước theo mét; đầu hướng +z, gốc ở mặt đất giữa thân.
const SPECIES = {
  dog: {
    walkSpeed: 1.2, runSpeed: 2.6, legLength: 0.3, wag: 14, radius: 0.35,
    hips: [[-0.09, 0.32, 0.2], [0.09, 0.32, 0.2], [-0.09, 0.32, -0.2], [0.09, 0.32, -0.2]],
    tailBase: [0, 0.48, -0.3], tailTilt: 0.9,
    body: () => merge([
      { geometry: new THREE.CapsuleGeometry(0.15, 0.42, 4, 10), at: [0, 0.42, 0], rotate: [Math.PI / 2, 0, 0] },
      { geometry: new THREE.SphereGeometry(0.13, 14, 10), at: [0, 0.6, 0.36] },
      { geometry: new THREE.SphereGeometry(1, 10, 8), scale: [0.07, 0.06, 0.1], at: [0, 0.56, 0.47] },
      { geometry: new THREE.SphereGeometry(0.026, 8, 6), tone: '#1a1412', at: [0, 0.575, 0.565] },
      ...[-1, 1].map((side) => ({ geometry: new THREE.SphereGeometry(0.019, 8, 6), tone: '#120d0b', at: [side * 0.055, 0.64, 0.465] })),
      ...[-1, 1].map((side) => ({ geometry: new THREE.SphereGeometry(1, 8, 6), shade: 0.72, scale: [0.035, 0.09, 0.06], at: [side * 0.115, 0.62, 0.32], rotate: [0, 0, side * 0.35] })),
    ]),
    leg: () => merge([{ geometry: new THREE.CylinderGeometry(0.045, 0.04, 0.3, 8), at: [0, -0.15, 0] }, { geometry: new THREE.SphereGeometry(0.05, 8, 6), shade: 0.9, scale: [1, 0.6, 1.3], at: [0, -0.29, 0.02] }]),
    tail: () => merge([{ geometry: new THREE.CylinderGeometry(0.018, 0.03, 0.3, 6), at: [0, 0.15, 0] }]),
  },
  cat: {
    walkSpeed: 0.7, runSpeed: 1.8, legLength: 0.2, wag: 2.5, radius: 0.25,
    hips: [[-0.05, 0.2, 0.13], [0.05, 0.2, 0.13], [-0.05, 0.2, -0.13], [0.05, 0.2, -0.13]],
    tailBase: [0, 0.27, -0.2], tailTilt: 0.35,
    body: () => merge([
      { geometry: new THREE.CapsuleGeometry(0.085, 0.28, 4, 10), at: [0, 0.26, 0], rotate: [Math.PI / 2, 0, 0] },
      { geometry: new THREE.SphereGeometry(0.09, 14, 10), scale: [1.1, 1, 1], at: [0, 0.37, 0.23] },
      { geometry: new THREE.SphereGeometry(0.014, 6, 5), tone: '#d98a8a', at: [0, 0.36, 0.32] },
      ...[-1, 1].map((side) => ({ geometry: new THREE.SphereGeometry(0.016, 8, 6), tone: '#5f7a2a', at: [side * 0.038, 0.39, 0.305] })),
      ...[-1, 1].map((side) => ({ geometry: new THREE.ConeGeometry(0.035, 0.08, 4), at: [side * 0.05, 0.46, 0.22], rotate: [0, 0, side * -0.25] })),
    ]),
    leg: () => merge([{ geometry: new THREE.CylinderGeometry(0.026, 0.024, 0.2, 7), at: [0, -0.1, 0] }]),
    tail: () => merge([{ geometry: new THREE.CylinderGeometry(0.012, 0.018, 0.36, 6), at: [0, 0.18, 0] }]),
  },
};

let loader = null;
function gltfLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

export function buildAnimals({ root, animals, walk }) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const herds = [];
  const solos = [];
  const pickables = [];
  const byId = new Map();
  const effects = [];
  const newAnimal = (item, index, type) => {
    let seed = Math.floor(Math.abs(item.x * 131 + item.z * 977)) + index * 7919 + 1;
    return {
      id: item.id, name: item.name, type,
      x: item.x, z: item.z, heading: index * 1.3, area: item.area, mode: 'idle', timer: 1 + index, target: null,
      speed: SPECIES[type].walkSpeed, gait: 0, lower: 0, reaction: null,
      random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647),
    };
  };
  for (const [type, spec] of Object.entries(SPECIES)) {
    const members = animals.filter((item) => item.type === type && !item.model);
    if (!members.length) continue;
    const meshes = {
      body: new THREE.InstancedMesh(spec.body(), material, members.length),
      leg: new THREE.InstancedMesh(spec.leg(), material, members.length * 4),
      tail: new THREE.InstancedMesh(spec.tail(), material, members.length),
    };
    for (const mesh of Object.values(meshes)) {
      // Các con đi khắp vườn: khung bao tính một lần sẽ sai, nên không cắt theo khung nhìn.
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      root.add(mesh);
    }
    // Raycaster của chế độ nhập vai chỉ cần thân; instanceId ánh xạ về đúng mã thú trong đàn này.
    meshes.body.userData.petIds = members.map((item) => item.id);
    const herd = { spec, meshes, members: [] };
    members.forEach((item, index) => {
      const coat = new THREE.Color(item.color || '#a0784a');
      meshes.body.setColorAt(index, coat);
      meshes.tail.setColorAt(index, coat);
      for (let leg = 0; leg < 4; leg += 1) meshes.leg.setColorAt(index * 4 + leg, coat);
      const animal = newAnimal(item, index, type);
      herd.members.push(animal);
      byId.set(item.id, animal);
    });
    for (const mesh of Object.values(meshes)) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    herds.push(herd);
    pickables.push(meshes.body);
  }
  // Thú có mô hình riêng: mỗi con một nhóm; mô hình tải xong mới hiện (lỗi tải thì con đó không hiện, cảnh vẫn chạy).
  animals.filter((item) => item.model && SPECIES[item.type]).forEach((item, index) => {
    const animal = newAnimal(item, index + 3, item.type);
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    group.visible = false;
    root.add(group);
    solos.push({ spec: SPECIES[item.type], animal, group });
    byId.set(item.id, animal);
    gltfLoader().loadAsync(item.model).then((gltf) => {
      const model = gltf.scene;
      model.rotation.y = item.modelRy || 0;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = item.height / Math.max(1e-6, size.y);
      const inner = new THREE.Group();
      inner.scale.setScalar(scale);
      inner.add(model);
      // Đặt chân chạm đất, tâm thân ở gốc nhóm.
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y, -center.z);
      model.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.userData.petId = item.id;
        pickables.push(node);
      });
      group.add(inner);
      group.visible = true;
    }).catch((error) => console.warn(`Không tải được mô hình thú ${item.id}: ${error.message}`));
  });

  const free = (x, z, spec, area) => x >= area.x[0] && x <= area.x[1] && z >= area.z[0] && z <= area.z[1]
    && isWalkable({ ...walk, radius: spec.radius }, x, z);
  const base = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const out = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const unit = new THREE.Vector3(1, 1, 1);

  function playTarget(animal, spec) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = animal.random() * Math.PI * 2;
      const reach = 1.4 + animal.random() * 2.6;
      const x = animal.x + Math.sin(angle) * reach;
      const z = animal.z + Math.cos(angle) * reach;
      if (!free(x, z, spec, animal.area)) continue;
      animal.target = { x, z };
      animal.mode = 'walk';
      animal.speed = spec.runSpeed;
      animal.timer = 5;
      return true;
    }
    return false;
  }

  function think(animal, spec, dt) {
    if (animal.reaction) {
      animal.reaction.left -= dt;
      if (animal.reaction.left <= 0) animal.reaction = null;
      else if (animal.reaction.action !== 'play') {
        animal.mode = 'idle';
        animal.timer = Math.max(animal.timer, 0.4);
        return;
      } else if (animal.mode !== 'walk' && !playTarget(animal, spec)) return;
    }
    animal.timer -= dt;
    if (animal.mode === 'walk') {
      const dx = animal.target.x - animal.x;
      const dz = animal.target.z - animal.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.3) {
        animal.mode = animal.random() < 0.3 ? 'rest' : 'idle';
        animal.timer = animal.mode === 'rest' ? 8 + animal.random() * 10 : 2 + animal.random() * 5;
        return;
      }
      const wanted = Math.atan2(dx, dz);
      let turn = wanted - animal.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      animal.heading += turn * Math.min(1, dt * 4);
      const step = Math.min(distance, animal.speed * dt) * Math.max(0.2, Math.cos(turn));
      const nextX = animal.x + Math.sin(animal.heading) * step;
      const nextZ = animal.z + Math.cos(animal.heading) * step;
      if (free(nextX, nextZ, spec, animal.area)) {
        animal.x = nextX;
        animal.z = nextZ;
        animal.gait += step * (animal.speed > spec.walkSpeed ? 5 : 7) / spec.legLength * 0.3;
      } else animal.timer = 0;
      if (animal.timer <= 0) {
        animal.mode = 'idle';
        animal.timer = 0.5 + animal.random();
      }
      return;
    }
    if (animal.timer > 0) return;
    // Chọn chỗ mới trong vùng: thử vài điểm ngẫu nhiên đi được, cách 2–9 m.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = animal.random() * Math.PI * 2;
      const reach = 2 + animal.random() * 7;
      const x = animal.x + Math.sin(angle) * reach;
      const z = animal.z + Math.cos(angle) * reach;
      if (free(x, z, spec, animal.area)) {
        animal.target = { x, z };
        animal.mode = 'walk';
        animal.speed = animal.random() < 0.2 ? spec.runSpeed : spec.walkSpeed;
        animal.timer = 12;
        return;
      }
    }
    animal.timer = 1;
  }

  function spawnEffect(animal, action) {
    const group = new THREE.Group();
    group.position.set(animal.x, 0, animal.z);
    if (action === 'pet') {
      for (let index = 0; index < 5; index += 1) {
        const bubble = new THREE.Mesh(
          new THREE.SphereGeometry(0.07 + (index % 2) * 0.025, 8, 6),
          new THREE.MeshBasicMaterial({ color: index % 2 ? '#ff6f91' : '#ffb0c2', transparent: true, opacity: 0.95, depthWrite: false }),
        );
        bubble.userData.phase = index * 1.4;
        group.add(bubble);
      }
    } else if (action === 'feed') {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.12, 14), new THREE.MeshStandardMaterial({ color: '#d85a43', roughness: 0.72 }));
      bowl.position.y = 0.07;
      group.add(bowl);
      for (let index = 0; index < 8; index += 1) {
        const food = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshStandardMaterial({ color: '#7a4b2a', roughness: 1 }));
        food.position.set(((index % 4) - 1.5) * 0.07, 0.15, (Math.floor(index / 4) - 0.5) * 0.08);
        group.add(food);
      }
    } else {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), new THREE.MeshStandardMaterial({ color: '#f3a52b', roughness: 0.62 }));
      ball.userData.ball = true;
      group.add(ball);
    }
    root.add(group);
    effects.push({ group, animal, action, time: 0, duration: action === 'play' ? 5 : 3.5 });
  }

  function updateEffects(dt) {
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      const effect = effects[index];
      effect.time += dt;
      effect.group.position.set(effect.animal.x, 0, effect.animal.z);
      if (effect.action === 'pet') {
        effect.group.children.forEach((bubble, bubbleIndex) => {
          const phase = bubble.userData.phase;
          bubble.position.set(Math.sin(phase) * 0.3, 0.75 + effect.time * 0.32 + bubbleIndex * 0.08, Math.cos(phase) * 0.18);
          bubble.scale.setScalar(Math.max(0.05, 1 - effect.time / effect.duration));
        });
      } else if (effect.action === 'feed') {
        effect.group.position.x += Math.sin(effect.animal.heading) * 0.46;
        effect.group.position.z += Math.cos(effect.animal.heading) * 0.46;
      } else {
        const ball = effect.group.children[0];
        ball.position.set(Math.sin(effect.time * 3.2) * 0.8, 0.18 + Math.abs(Math.sin(effect.time * 5)) * 0.48, Math.cos(effect.time * 3.2) * 0.8);
        ball.rotation.x += dt * 5;
      }
      if (effect.time < effect.duration) continue;
      root.remove(effect.group);
      effect.group.traverse((item) => {
        item.geometry?.dispose?.();
        item.material?.dispose?.();
      });
      effects.splice(index, 1);
    }
  }

  return {
    pickables,
    petAtHit(hit) {
      const id = hit?.object?.userData?.petId || hit?.object?.userData?.petIds?.[hit.instanceId];
      return id ? byId.get(id) || null : null;
    },
    nearest(x, z, maxDistance = Infinity) {
      let best = null;
      let bestDistance = maxDistance;
      for (const animal of byId.values()) {
        const distance = Math.hypot(animal.x - x, animal.z - z);
        if (distance >= bestDistance) continue;
        best = animal;
        bestDistance = distance;
      }
      return best ? { id: best.id, name: best.name, type: best.type, x: best.x, z: best.z, distance: bestDistance } : null;
    },
    interact(id, action) {
      const animal = byId.get(id);
      if (!animal || !['pet', 'feed', 'play'].includes(action)) return false;
      animal.reaction = { action, left: action === 'play' ? 5 : 3.5 };
      if (action === 'play') playTarget(animal, SPECIES[animal.type]);
      else {
        animal.mode = 'idle';
        animal.timer = animal.reaction.left;
      }
      spawnEffect(animal, action);
      return { id: animal.id, name: animal.name, type: animal.type, x: animal.x, z: animal.z };
    },
    positions() {
      return [
        ...herds.flatMap(({ members }, herd) => members.map((animal) => ({ id: animal.id, name: animal.name, type: animal.type, herd, x: animal.x, z: animal.z, mode: animal.mode }))),
        ...solos.map(({ animal, group }) => ({ id: animal.id, name: animal.name, type: animal.type, model: true, loaded: group.visible, heading: animal.heading, x: animal.x, z: animal.z, mode: animal.mode })),
      ];
    },
    update(dt, time) {
      const seconds = time / 1_000;
      for (const { spec, meshes, members } of herds) {
        members.forEach((animal, index) => {
          think(animal, spec, dt);
          const walking = animal.mode === 'walk';
          // Nằm nghỉ: hạ thân xuống, chân gập (thu ngắn) dưới bụng.
          const lowerTarget = animal.mode === 'rest' ? spec.legLength * 0.75 : animal.reaction?.action === 'feed' ? spec.legLength * 0.32 : 0;
          animal.lower += (lowerTarget - animal.lower) * Math.min(1, dt * 3);
          const bob = walking ? Math.abs(Math.sin(animal.gait)) * 0.02 : 0;
          position.set(animal.x, bob - animal.lower, animal.z);
          quaternion.setFromEuler(euler.set(0, animal.heading, 0));
          base.compose(position, quaternion, unit);
          meshes.body.setMatrixAt(index, base);
          const fold = 1 - (animal.lower / spec.legLength) * 0.85;
          spec.hips.forEach((hip, leg) => {
            const swing = walking ? Math.sin(animal.gait + (leg === 0 || leg === 3 ? 0 : Math.PI)) * 0.55 : 0;
            position.set(...hip);
            quaternion.setFromEuler(euler.set(swing, 0, 0));
            local.compose(position, quaternion, new THREE.Vector3(1, fold, 1));
            out.multiplyMatrices(base, local);
            meshes.leg.setMatrixAt(index * 4 + leg, out);
          });
          // Đuôi: chó vẫy nhanh khi đứng, mèo đung đưa chậm.
          const happy = animal.reaction?.action === 'pet' || animal.reaction?.action === 'feed';
          const wag = Math.sin(seconds * spec.wag * (happy ? 1.8 : 1) + index) * (happy ? 0.85 : walking ? 0.25 : 0.55);
          position.set(...spec.tailBase);
          quaternion.setFromEuler(euler.set(-spec.tailTilt, wag, 0, 'YXZ'));
          local.compose(position, quaternion, unit);
          out.multiplyMatrices(base, local);
          meshes.tail.setMatrixAt(index, out);
        });
        for (const mesh of Object.values(meshes)) {
          mesh.instanceMatrix.needsUpdate = true;
          // Ma trận thú thay đổi liên tục; cập nhật bounds để frustum culling và raycast không dùng vị trí cũ.
          mesh.computeBoundingSphere();
        }
      }
      solos.forEach(({ spec, animal, group }, index) => {
        think(animal, spec, dt);
        const walking = animal.mode === 'walk';
        const lowerTarget = animal.mode === 'rest' ? 0.3 : 0;
        animal.lower += (lowerTarget - animal.lower) * Math.min(1, dt * 3);
        const happy = animal.reaction?.action === 'pet' || animal.reaction?.action === 'feed';
        // Đi: nảy theo bước và lắc mình; vui (vuốt ve / cho ăn): lắc mông; ăn: cúi đầu; nằm: thân thấp và dẹp xuống.
        const step = walking ? Math.sin(animal.gait) : 0;
        group.position.set(animal.x, walking ? Math.abs(step) * spec.legLength * 0.14 : 0, animal.z);
        group.rotation.y = animal.heading + (happy ? Math.sin(seconds * 10 + index) * 0.12 : 0);
        group.rotation.x = animal.reaction?.action === 'feed' ? 0.22 : walking ? Math.cos(animal.gait) * 0.03 : 0;
        group.rotation.z = walking ? step * 0.05 : happy ? Math.sin(seconds * 14 + index) * 0.06 : 0;
        group.scale.set(1, 1 - animal.lower, 1 + animal.lower * 0.15);
      });
      updateEffects(dt);
    },
  };
}
