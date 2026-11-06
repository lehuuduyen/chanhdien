// Nhân vật có khung xương (file .glb admin tải lên, kiểu Meshy "Rig & Animate" / Mixamo): đi lại bằng động tác có
// trong file (Walking, Running, Idle nếu có; nhún nhảy chạy động tác Dance/Hip Hop/Cheering… nếu file có); các dáng đứng chắp tay, ngồi ghế, ngồi xếp bằng, quỳ, lạy dựng bằng cách
// xoay xương cho đúng hướng (không cần file có sẵn động tác đó, chạy được với mọi rig có tên xương chuẩn Mixamo).
//
// Người ngồi (ghế rạp, bồ đoàn) được "nướng" thành lưới tĩnh theo dáng ngồi: vẽ hàng loạt như hình khối, không tốn
// tính toán xương mỗi khung. Chỉ người đang đi lại mới chạy AnimationMixer.
import * as THREE from 'three';

const HEIGHT = 1.1;
// "mixamorig:LeftUpLeg" / "LeftUpLeg" → "leftupleg" (cùng cách API kiểm tra file).
const boneKey = (name) => String(name).replace(/^mixamorig\d*:?/i, '').toLowerCase();

// Hướng của xương (từ khớp tới khớp con) theo hệ của file: mặt nhìn +z, lên +y. Thành phần x nhân với phía của xương
// (trái/phải so với hông) nên một dòng dùng cho cả hai tay / hai chân.
const both = (bone, child, dir) => ['left', 'right'].map((side) => [`${side}${bone}`, `${side}${child}`, dir, true]);
const ARMS_DOWN = [...both('arm', 'forearm', [0.25, -1, 0.05]), ...both('forearm', 'hand', [0.15, -1, 0.2])];
const PRAY = [...both('arm', 'forearm', [0.35, -0.8, 0.45]), ...both('forearm', 'hand', [-0.75, 0.55, 0.4])];
const LAP = [...both('arm', 'forearm', [0.3, -1, 0.15]), ...both('forearm', 'hand', [0.05, -0.25, 1])];
const POSE_SPECS = {
  stand: ARMS_DOWN,
  pray: PRAY,
  chair: [...LAP, ...both('upleg', 'leg', [0.12, 0, 1]), ...both('leg', 'foot', [0.05, -1, 0])],
  lotus: [...LAP, ...both('upleg', 'leg', [0.85, -0.08, 0.55]), ...both('leg', 'foot', [-0.85, 0, 0.35])],
  kneel: [...PRAY, ...both('upleg', 'leg', [0.1, -1, 0]), ...both('leg', 'foot', [0.05, 0, -1])],
  // Lạy: ngồi lên gót, lưng cúi rạp về trước, hai tay chống trước mặt.
  bow: [
    ...both('upleg', 'leg', [0.12, -0.25, 1]), ...both('leg', 'foot', [0.05, -0.15, -1]),
    ['spineroot', 'spinechild', [0, 0.35, 1], false],
    ...both('arm', 'forearm', [0.25, -0.5, 1]), ...both('forearm', 'hand', [0.1, -0.6, 1]),
  ],
};

function bonesOf(root) {
  const bones = {};
  root.traverse((node) => { if (node.isBone) bones[boneKey(node.name)] = node; });
  // Đốt sống đầu tiên trên hông và đốt kế tiếp (tên khác nhau giữa các rig: Spine / Spine01 / Spine02…).
  bones.spineroot = bones.hips?.children.find((node) => node.isBone && /^spine/.test(boneKey(node.name)));
  bones.spinechild = bones.spineroot?.children.find((node) => node.isBone);
  return bones;
}

// Hộp bao theo dáng hiện tại (tính cả xương), trong hệ của root.
function skinnedBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    node.skeleton.update();
    node.computeBoundingBox();
    box.union(node.boundingBox.clone().applyMatrix4(node.matrixWorld));
  });
  return box;
}

// Xoay xương để hướng (khớp → khớp con) trùng hướng mong muốn; root đứng yên ở gốc, không xoay.
function aimBones(root, bones, spec) {
  const hips = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const target = new THREE.Vector3();
  const delta = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const boneQ = new THREE.Quaternion();
  for (const [boneName, childName, [x, y, z], sided] of spec) {
    const bone = bones[boneName];
    const child = bones[childName];
    if (!bone || !child) continue;
    root.updateMatrixWorld(true);
    bones.hips.getWorldPosition(hips);
    bone.getWorldPosition(from);
    child.getWorldPosition(to);
    const side = sided ? Math.sign(from.x - hips.x) || 1 : 1;
    target.set(x * side, y, z).normalize();
    delta.setFromUnitVectors(to.sub(from).normalize(), target);
    bone.parent.getWorldQuaternion(parentQ);
    bone.getWorldQuaternion(boneQ);
    bone.quaternion.copy(parentQ.invert().multiply(delta.multiply(boneQ)));
  }
}

// Ảnh chụp dáng: góc xoay mọi xương + vị trí hông, kèm điểm thấp nhất và độ cao hông (đơn vị của file).
function snapshot(root, bones) {
  const quaternions = {};
  for (const [name, bone] of Object.entries(bones)) if (bone && !['spineroot', 'spinechild'].includes(name)) quaternions[name] = bone.quaternion.clone();
  const box = skinnedBox(root);
  const hipsAt = bones.hips.getWorldPosition(new THREE.Vector3());
  return { quaternions, hipsPosition: bones.hips.position.clone(), minY: box.min.y, hipsY: hipsAt.y };
}

function applyPose(bones, pose) {
  for (const [name, quaternion] of Object.entries(pose.quaternions)) bones[name]?.quaternion.copy(quaternion);
  bones.hips.position.copy(pose.hipsPosition);
}

function blendPose(bones, from, to, amount) {
  for (const [name, quaternion] of Object.entries(from.quaternions)) {
    const other = to.quaternions[name];
    if (bones[name] && other) bones[name].quaternion.copy(quaternion).slerp(other, amount);
  }
  bones.hips.position.copy(from.hipsPosition).lerp(to.hipsPosition, amount);
}

export const DANCE_CLIP = /danc|hip ?hop|samba|salsa|twerk|shuffl|cheer|celebrat|happy|jump/i;
const clipBy = (clips, pattern, not) => clips.find((clip) => pattern.test(clip.name) && !(not && not.test(clip.name))) || null;

// Đọc file, đo chiều cao theo dáng gốc, tính sẵn các dáng. SkeletonUtils dùng để nhân bản mô hình có xương.
export async function loadRiggedModel(url, loader) {
  const [gltf, SkeletonUtils] = await Promise.all([loader.loadAsync(url), import('three/addons/utils/SkeletonUtils.js')]);
  const raw = gltf.scene;
  raw.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.frustumCulled = false;
    // Tự phát sáng nhẹ theo chính texture (như hình khối) để không tối thui trong rạp.
    const material = node.material;
    if (material?.map && material.emissive) {
      material.emissive.set('#ffffff');
      material.emissiveMap = material.map;
      material.emissiveIntensity = 0.18;
    }
  });
  const rest = skinnedBox(raw);
  const scale = HEIGHT / Math.max(1e-6, rest.max.y - rest.min.y);
  const clips = {
    walk: clipBy(gltf.animations, /walk/i),
    run: clipBy(gltf.animations, /run/i),
    idle: clipBy(gltf.animations, /idle|breath/i),
    // Điệu nhảy riêng của nhân vật (Meshy / Mixamo đặt tên theo động tác đã chọn khi xuất file).
    dance: clipBy(gltf.animations, DANCE_CLIP),
  };
  const poses = {};
  for (const [name, spec] of Object.entries(POSE_SPECS)) {
    const clone = SkeletonUtils.clone(raw);
    const bones = bonesOf(clone);
    aimBones(clone, bones, spec);
    poses[name] = snapshot(clone, bones);
  }
  const restBones = bonesOf(raw);
  poses.rest = snapshot(raw, restBones);
  return { raw, clone: SkeletonUtils.clone, scale, clips, poses, height: HEIGHT };
}

// Khung đặt mô hình: quay mặt về −z như mọi nhân vật trong cảnh, thu theo chiều cao chuẩn.
function frame(template, model) {
  const inner = new THREE.Group();
  inner.rotation.y = Math.PI;
  inner.scale.setScalar(template.scale);
  inner.add(model);
  return inner;
}

// Người đứng/đi: cùng giao diện buildChibiWalker. rig.pose nhận thêm moving/running/dt (động tác), kneel/bow (quỳ, lạy),
// sit (ngồi ghế đá: hông đặt ở độ cao hip).
export function buildRiggedWalker(template, look = null) {
  const model = template.clone(template.raw);
  const inner = frame(template, model);
  const figure = new THREE.Group();
  figure.add(inner);
  const bones = bonesOf(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(Object.entries(template.clips).filter(([, clip]) => clip).map(([name, clip]) => [name, mixer.clipAction(clip)]));
  // Ở chùa đứng chắp tay; ở rạp (đồ thường ngày) đứng thả tay.
  const restPose = template.poses[look?.outfit === 'casual' ? 'stand' : 'pray'];
  const ground = (pose) => -pose.minY * template.scale;
  let playing = null;

  function play(name) {
    if (playing === name) return;
    for (const action of Object.values(actions)) action.stop();
    if (name) actions[name].reset().play();
    playing = name;
  }

  const rig = {
    // Có điệu nhảy trong file: nhún nhảy chạy động tác đó; không có thì explore3d nhún nhảy cả thân theo kiểu admin chọn.
    hasDance: Boolean(actions.dance),
    pose({ hip = null, kneel = 0, bow = 0, sit = 0, moving = false, running = false, dance = false, dt = 0 } = {}) {
      if (sit > 0.5) {
        play(null);
        applyPose(bones, template.poses.chair);
        const chair = template.poses.chair;
        inner.position.y = hip === null ? ground(chair) : hip - chair.hipsY * template.scale;
        return;
      }
      if (kneel > 0) {
        play(null);
        const amount = Math.min(1, kneel);
        blendPose(bones, restPose, template.poses.kneel, amount);
        let y = ground(restPose) + (ground(template.poses.kneel) - ground(restPose)) * amount;
        if (bow > 0) {
          blendPose(bones, template.poses.kneel, template.poses.bow, Math.min(1, bow));
          y += (ground(template.poses.bow) - ground(template.poses.kneel)) * Math.min(1, bow);
        }
        inner.position.y = y;
        return;
      }
      if (dance && actions.dance && !moving) {
        play('dance');
        mixer.update(dt);
        inner.position.y = ground(template.poses.rest);
        return;
      }
      if (moving && actions.walk) {
        play(running && actions.run ? 'run' : 'walk');
        mixer.update(dt);
        inner.position.y = ground(template.poses.rest);
        return;
      }
      if (actions.idle) {
        play('idle');
        mixer.update(dt);
        inner.position.y = ground(template.poses.rest);
        return;
      }
      play(null);
      applyPose(bones, restPose);
      inner.position.y = ground(restPose);
    },
  };
  rig.pose();
  // upper/skirt/feet/shins giữ chỗ cho bộ nhập vai (chúng chỉnh hình khối); dáng do rig.pose đặt.
  const placeholder = () => new THREE.Group();
  return {
    figure, upper: placeholder(), skirt: placeholder(), feet: [placeholder(), placeholder()], shins: [placeholder(), placeholder()],
    hips: { stand: template.poses.rest.hipsY * template.scale + ground(template.poses.rest), kneel: 0.2 },
    labelY: template.height + 0.12,
    rig,
  };
}

// Người ngồi: lưới tĩnh theo dáng (ghế rạp: hông ở độ cao seatHip; bồ đoàn: ngồi xếp bằng chạm đất). Nướng một lần
// cho mỗi (mô hình, dáng), các người ngồi dùng chung geometry.
const baked = new WeakMap();
function bake(template, poseName, seatHip) {
  let cache = baked.get(template);
  if (!cache) baked.set(template, (cache = new Map()));
  const key = `${poseName}:${seatHip}`;
  if (cache.has(key)) return cache.get(key);
  const model = template.clone(template.raw);
  const pose = template.poses[poseName];
  applyPose(bonesOf(model), pose);
  const inner = frame(template, model);
  inner.position.y = seatHip === null ? -pose.minY * template.scale : seatHip - pose.hipsY * template.scale;
  inner.updateMatrixWorld(true);
  const parts = [];
  const vertex = new THREE.Vector3();
  model.traverse((node) => {
    if (!node.isSkinnedMesh) return;
    node.skeleton.update();
    const source = node.geometry.getAttribute('position');
    const positions = new Float32Array(source.count * 3);
    for (let index = 0; index < source.count; index += 1) {
      vertex.fromBufferAttribute(source, index);
      node.applyBoneTransform(index, vertex);
      vertex.applyMatrix4(node.matrixWorld);
      positions.set([vertex.x, vertex.y, vertex.z], index * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const uv = node.geometry.getAttribute('uv');
    if (uv) geometry.setAttribute('uv', uv);
    if (node.geometry.index) geometry.setIndex(node.geometry.index);
    geometry.computeVertexNormals();
    parts.push({ geometry, material: node.material });
  });
  cache.set(key, parts);
  return parts;
}

export function buildRiggedPerson(template, look = null, decorate = null) {
  const casual = look?.outfit === 'casual';
  const group = new THREE.Group();
  for (const { geometry, material } of bake(template, casual ? 'chair' : 'lotus', casual ? 0.08 : null)) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    group.add(mesh);
  }
  decorate?.(group);
  // upper không gắn vào cảnh: người ngồi bằng mô hình không cúi lạy (lưới đã nướng cố định).
  return { group, upper: new THREE.Group() };
}
