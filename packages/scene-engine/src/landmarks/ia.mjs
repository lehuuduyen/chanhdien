// Iowa: hàng turbine gió quay giữa đồng ngô trước Điện Capitol mái vòm vàng có bốn vòm nhỏ ở góc (capitol chung, đặt
// trong states/ia.json). Mười hai cánh turbine là một InstancedMesh và dùng một callback chuyển động, nên số lệnh vẽ và
// CPU mỗi khung vẫn thấp. (GPT/Codex dựng, Claude sửa theo góp ý rà: turbine to / gần hơn, mái vòm dùng capitol chung.)
import * as THREE from 'three';
import { frame } from './common.mjs';

const landmarks = {
  'iowa-wind'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const white = env.far('#e4e1d7', { haze, roughness: 0.72, metalness: 0.08 });
    const steel = env.far('#9ba3a2', { haze, roughness: 0.58, metalness: 0.08 });
    const hubs = [];
    for (let index = 0; index < 4; index += 1) {
      const px = (-48 + index * 28) * scale;
      const pz = (index % 2 ? -5 : 2) * scale;
      const height = (28 + (index % 2) * 5) * scale;
      batch.add(new THREE.CylinderGeometry(0.32 * scale, 1.05 * scale, height, 9), white, { position: at(px, height / 2, pz) });
      batch.add(new THREE.SphereGeometry(0.75 * scale, 10, 7), steel, { position: at(px, height, pz) });
      hubs.push([px, height, pz]);
    }

    const bladeLength = 7.5 * scale;
    const bladeGeometry = new THREE.BoxGeometry(0.5 * scale, bladeLength, 0.16 * scale);
    bladeGeometry.translate(0, bladeLength / 2, 0);
    const rotors = new THREE.InstancedMesh(bladeGeometry, steel, hubs.length * 3);
    rotors.position.set(x, 0, z);
    rotors.rotation.y = face;
    const matrix = new THREE.Matrix4();
    const translation = new THREE.Matrix4();
    const rotation = new THREE.Matrix4();
    const update = (seconds) => {
      let instance = 0;
      for (let hub = 0; hub < hubs.length; hub += 1) {
        const [hx, hy, hz] = hubs[hub];
        for (let blade = 0; blade < 3; blade += 1) {
          translation.makeTranslation(hx, hy, hz);
          rotation.makeRotationZ(seconds * 0.72 + hub * 0.5 + (blade / 3) * Math.PI * 2);
          matrix.multiplyMatrices(translation, rotation);
          rotors.setMatrixAt(instance, matrix);
          instance += 1;
        }
      }
      rotors.instanceMatrix.needsUpdate = true;
    };
    update(0);
    rotors.computeBoundingSphere();
    env.add(rotors);
    env.animate(update);

    env.nightPoints(hubs.map(([px, hy, pz]) => at(px, hy + 0.8 * scale, pz)), { color: '#ef4b45', size: 1.1 });
  },

  // Hàng turbine tiếp nối ở phía đông; ba rotor dùng chung một InstancedMesh và một callback.
  'iowa-wind-row'(batch, x, z, scale, rand, env, { face, haze }) {
    const at = frame(x, z, face);
    const white = env.far('#e4e1d7', { haze, roughness: 0.72, metalness: 0.08 });
    const steel = env.far('#9ba3a2', { haze, roughness: 0.58, metalness: 0.08 });
    const hubs = [];
    for (let index = 0; index < 3; index += 1) {
      const px = (index - 1) * 23 * scale;
      const height = (27 + index * 2) * scale;
      batch.add(new THREE.CylinderGeometry(0.3 * scale, 0.95 * scale, height, 9), white, { position: at(px, height / 2, 0) });
      batch.add(new THREE.SphereGeometry(0.7 * scale, 9, 6), steel, { position: at(px, height, 0) });
      hubs.push([px, height, 0]);
    }
    const bladeLength = 6.4 * scale;
    const bladeGeometry = new THREE.BoxGeometry(0.45 * scale, bladeLength, 0.14 * scale);
    bladeGeometry.translate(0, bladeLength / 2, 0);
    const rotors = new THREE.InstancedMesh(bladeGeometry, steel, hubs.length * 3);
    rotors.position.set(x, 0, z);
    rotors.rotation.y = face;
    const matrix = new THREE.Matrix4();
    const translation = new THREE.Matrix4();
    const rotation = new THREE.Matrix4();
    const update = (seconds) => {
      let instance = 0;
      for (let hub = 0; hub < hubs.length; hub += 1) {
        const [hx, hy, hz] = hubs[hub];
        for (let blade = 0; blade < 3; blade += 1) {
          translation.makeTranslation(hx, hy, hz);
          rotation.makeRotationZ(seconds * 0.78 + hub * 0.6 + (blade / 3) * Math.PI * 2);
          matrix.multiplyMatrices(translation, rotation);
          rotors.setMatrixAt(instance, matrix);
          instance += 1;
        }
      }
      rotors.instanceMatrix.needsUpdate = true;
    };
    update(0);
    rotors.computeBoundingSphere();
    env.add(rotors);
    env.animate(update);
    env.nightPoints(hubs.map(([px, hy, pz]) => at(px, hy + 0.7 * scale, pz)), { color: '#ef4b45', size: 1.1 });
  },
};

const scatter = {
  corn(batch, x, z, size, rand, env) {
    const stalk = env.material('#57723d', { roughness: 1 });
    const ear = env.material('#d4af43', { roughness: 0.95 });
    for (let index = 0; index < 5; index += 1) {
      const px = x + (rand() - 0.5) * 1.25 * size;
      const pz = z + (rand() - 0.5) * 1.25 * size;
      const height = (1.45 + rand() * 0.6) * size;
      batch.add(new THREE.CylinderGeometry(0.025 * size, 0.045 * size, height, 4), stalk, { position: [px, height / 2, pz] });
      batch.add(new THREE.ConeGeometry(0.1 * size, 0.32 * size, 5), ear, { position: [px + 0.08 * size, height * 0.68, pz], rotation: [0, 0, -0.65] });
    }
  },
};

export const kit = { landmarks, scatter };
