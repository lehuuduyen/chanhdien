// Mặt nước hồ (hồ sen lớn, ao vịt…): vật liệu chuẩn của Three.js (vẫn ăn ánh sáng ngày / đêm và sương mù) mở rộng bằng
// onBeforeCompile: giữa hồ thẫm, mép nhạt (theo khoảng cách tới tâm trong tọa độ cục bộ của mesh — hình gốc là hình tròn
// bán kính 1, scale ra elip), gợn sóng ánh sáng chạy chậm, viền bọt nhạt sát bờ. Một vật liệu dùng chung cho nhiều hồ;
// gọi tick(seconds) mỗi khung để nước chuyển động.
import * as THREE from 'three';

export function createWaterMaterial({ deep = '#165a5c', shallow = '#4fa39a', foam = '#e8f4ee', opacity = 0.9 } = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(deep) },
    uShallow: { value: new THREE.Color(shallow) },
    uFoam: { value: new THREE.Color(foam) },
  };
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.12, metalness: 0.08, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterLocal;\nvarying vec2 vWaterWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaterLocal = position.xy;\nvec4 waterWorld = modelMatrix * vec4(position, 1.0);\nvWaterWorld = waterWorld.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
varying vec2 vWaterLocal;
varying vec2 vWaterWorld;
float waterWave(vec2 p) {
  return sin(p.x * 1.7 + uTime * 0.9) * 0.5 + sin(p.y * 2.3 - uTime * 0.7) * 0.5
    + sin((p.x + p.y) * 3.1 + uTime * 1.3) * 0.35 + sin((p.x - p.y) * 4.7 - uTime * 1.6) * 0.2;
}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
float waterR = clamp(length(vWaterLocal), 0.0, 1.0);
float waterDepth = smoothstep(0.98, 0.15, waterR);
vec3 waterColor = mix(uShallow, uDeep, waterDepth);
float ripple = waterWave(vWaterWorld * 0.9);
waterColor *= 0.94 + ripple * 0.05;
float foamLine = smoothstep(0.86, 0.99, waterR) * (0.55 + 0.45 * sin(waterR * 60.0 - uTime * 2.0));
waterColor = mix(waterColor, uFoam, clamp(foamLine, 0.0, 1.0) * 0.55);
vec4 diffuseColor = vec4(waterColor, opacity * mix(0.82, 1.0, waterDepth));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float sparkle = pow(max(0.0, waterWave(vWaterWorld * 2.6 + vec2(uTime * 0.15, 0.0)) - 0.9) / 0.65, 3.0);
totalEmissiveRadiance += uFoam * sparkle * 0.22;`);
  };
  // Mỗi chỗ dùng một bản biên dịch chung (cùng chuỗi shader).
  material.customProgramCacheKey = () => 'water-v1';
  return {
    material,
    tick(seconds) {
      uniforms.uTime.value = seconds;
    },
  };
}
