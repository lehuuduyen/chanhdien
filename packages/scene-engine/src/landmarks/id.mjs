// Idaho (vùng snow): thác Shoshone ("Niagara miền Tây") ngoài cổng — vách đá bazan sẫm hẻm sông Snake chạy ngang, giữa
// vách là thác rộng chia nhiều nhánh qua các mỏm đá, nước trắng chảy (ảnh vệt nước trượt xuống), bụi nước dưới chân, sông
// chảy về phía sân. Ban đêm thác sáng bạc dưới trăng. Núi của vùng ẩn đi (states/id.json). Gần tường: ruộng khoai tây
// (luống đất vun phủ tuyết).
import * as THREE from 'three';
import { outward, paintMerge, ridge } from './common.mjs';

// Ảnh nước thác (vệt trắng xanh dọc, trong suốt chỗ thưa) và vật liệu: dựng một lần cho cả trang. Trên Node (test)
// không có canvas thì dùng màu trơn.
let water = null;
function fallsMaterial() {
  if (water) return water;
  let map = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(214,232,240,0.78)';
    ctx.fillRect(0, 0, 64, 256);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let index = 0; index < 90; index += 1) {
      const xx = rand() * 64;
      const yy = rand() * 256;
      const length = 30 + rand() * 90;
      ctx.fillStyle = rand() < 0.7 ? `rgba(255,255,255,${0.5 + rand() * 0.5})` : `rgba(150,185,200,${0.4 + rand() * 0.3})`;
      ctx.fillRect(xx, yy, 1 + rand() * 3, length);
      ctx.fillRect(xx, yy - 256, 1 + rand() * 3, length);
    }
    map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
  }
  water = new THREE.MeshBasicMaterial({ map, color: map ? '#ffffff' : '#dbe9f0', transparent: true, opacity: 0.95, depthWrite: false });
  return water;
}

const landmarks = {
  // (x, z): giữa thác ở chân vách. params: { span (m, vách), height (m, mép thác), falls (m, bề ngang thác) }.
  'shoshone-falls'(batch, x, z, scale, rand, env, { side, haze, params }) {
    const [ox, oz] = outward(side);
    const ax = oz ? 1 : 0;
    const az = ox ? 1 : 0;
    const P = (u, y, d) => [x + ax * u + ox * d, y, z + az * u + oz * d];
    const flip = oz < 0 || ox > 0;
    const span = params.span || 440;
    const lip = (params.height || 26) * scale;
    const half = ((params.falls || 90) / 2) * scale;
    const phase = rand() * 6;
    // Vách bazan: cao hơn ở hai bên, hạ xuống thành mép thác ở giữa; mặt trước gần như dựng đứng, gân cột đá.
    const crest = (t) => {
      const k = Math.min(1, Math.max(0, (Math.abs(t) - half) / (24 * scale)));
      return lip + (8 * scale + Math.sin(t * 0.05 + phase) * 3) * k * k * (3 - 2 * k);
    };
    const rise = (v) => Math.min(1, v / 0.14) ** 0.55;
    ridge(batch, x, z, {
      side, span, depth: 46 * scale, crest, rise, ribs: 2.5, jag: 1.2, columns: 120, rows: 12, phase,
      bands: [
        [0, 0.1, env.far('#57534b', { haze, flatShading: true, roughness: 1 })],
        [0.1, 0.32, env.far('#3a3732', { haze, flatShading: true, roughness: 1 })],
        [0.32, 1, env.far('#e9edf2', { haze, flatShading: true, roughness: 0.9 })],
      ],
    });
    // Thác: các nhánh nước từ mép (lùi vào vách) đổ xuống, chân thác nhô ra; giữa các nhánh là mỏm đá.
    const branches = [];
    let u = -half;
    while (u < half - 4 * scale) {
      const width = Math.min(half - u, (10 + rand() * 16) * scale);
      branches.push([u, u + width]);
      u += width + (2.5 + rand() * 3) * scale;
    }
    // Mặt vách ở độ cao k (0–1 của mép thác) theo đúng hàm rise của vách: thác luôn nằm trước mặt đá.
    const face = (k) => 46 * scale * 0.14 * k ** (1 / 0.55);
    const positions = [];
    const uvs = [];
    const index = [];
    const rows = 6;
    for (const [u0, u1] of branches) {
      const columns = Math.max(2, Math.round((u1 - u0) / (3 * scale)));
      const first = positions.length / 3;
      for (let col = 0; col <= columns; col += 1) {
        const uu = u0 + (u1 - u0) * (col / columns);
        for (let row = 0; row <= rows; row += 1) {
          const k = row / rows;
          const y = lip * k + 0.4;
          // Mép trên sát mép vách, chân thác nhô ra ngoài, giữa nhánh phình nhẹ.
          const d = face(k) - 0.8 * scale - (1 - k) ** 1.4 * 5 * scale - Math.sin((col / columns) * Math.PI) * 1.2 * scale;
          positions.push(...P(uu, y, d));
          uvs.push((uu / (6 * scale)), k * 2.2);
        }
      }
      const stride = rows + 1;
      for (let col = 0; col < columns; col += 1) {
        for (let row = 0; row < rows; row += 1) {
          const a = first + col * stride + row;
          // Mặt nước quay về sân (cột theo dọc tường, hàng theo độ cao).
          if (flip) index.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
          else index.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
        }
      }
    }
    const curtain = new THREE.BufferGeometry();
    curtain.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    curtain.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    curtain.setIndex(index);
    curtain.computeVertexNormals();
    const material = fallsMaterial();
    const falls = new THREE.Mesh(curtain, material);
    env.add(falls);
    env.nightMesh(curtain.clone(), '#d6e6ff', 0.32);
    if (material.map) env.animate((seconds) => { material.map.offset.y = (seconds * 0.55) % 1; });
    // Mỏm đá giữa các nhánh và trên mép thác.
    const rock = env.far('#34312c', { haze, flatShading: true, roughness: 1 });
    for (let index2 = 0; index2 < branches.length - 1; index2 += 1) {
      const mid = (branches[index2][1] + branches[index2 + 1][0]) / 2;
      const size = 3.2 * scale;
      batch.add(new THREE.DodecahedronGeometry(size, 0), rock, { position: P(mid, lip * 0.5, -1.5 * scale), scale: [0.9, lip / (2 * size), 1] });
    }
    // Sông dưới chân thác chảy về phía sân, bụi nước trắng ở chân thác.
    const river = env.far('#4f7b86', { haze, flatShading: true, roughness: 0.3 });
    const length = 40 * scale;
    batch.add(new THREE.PlaneGeometry(1, 1), river, {
      position: P(0, 0.07, -length / 2), rotation: [-Math.PI / 2, 0, 0], scale: ax ? [half * 2.4, length, 1] : [length, half * 2.4, 1],
    });
    const mist = [];
    for (let index2 = 0; index2 < 16; index2 += 1) {
      const at = P((rand() - 0.5) * half * 2, 1 + rand() * 3, -6 * scale - rand() * 4);
      mist.push([new THREE.IcosahedronGeometry(1, 1), '#f6f9fb', { position: at, scale: [(4 + rand() * 3) * scale, (2 + rand() * 1.5) * scale, (3 + rand() * 2) * scale] }]);
    }
    const spray = new THREE.Mesh(paintMerge(mist), env.far('#ffffff', { haze, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, roughness: 1 }));
    env.add(spray);
  },
};

const scatter = {
  // Ruộng khoai tây mùa đông: các luống đất vun sẫm, tuyết đọng giữa luống.
  potatoes(batch, x, z, size, rand, env) {
    const soil = env.material('#6b4f38', { flatShading: true });
    const yaw = rand() * Math.PI;
    const rows = 5 + Math.floor(rand() * 3);
    const length = (6 + rand() * 4) * size;
    for (let index = 0; index < rows; index += 1) {
      const offset = (index - rows / 2) * 1.1 * size;
      const ridgeLine = new THREE.CylinderGeometry(0.42 * size, 0.42 * size, length, 3);
      ridgeLine.rotateZ(Math.PI / 2);
      batch.add(ridgeLine, soil, { position: [x + Math.sin(yaw) * offset, 0.12 * size, z + Math.cos(yaw) * offset], rotation: [0, yaw, 0], scale: [1, 0.55, 1] });
    }
  },
};

export const kit = { landmarks, scatter };
