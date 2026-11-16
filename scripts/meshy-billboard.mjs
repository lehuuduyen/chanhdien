// Dựng ảnh billboard từ mô hình Meshy (cây, hoa… — vật nhiều mảnh nhỏ, xem AGENTS.md):
//   node scripts/meshy-billboard.mjs <thư mục ra> <file.glb>… → <thư mục ra>/<tên>.webp
// Tên = tên file bỏ đuôi "-full". Ảnh nền trong suốt, máy ảnh trực giao nhìn ngang hơi từ trên (mặt +z của mô hình quay
// vào máy ảnh), cắt sát viền trong suốt nên gốc cây nằm ở mép dưới ảnh. Chrome chạy ngầm, three.js lấy từ node_modules.
// Tùy chọn từng ảnh qua biến môi trường OPTIONS (JSON { tên: { … } }):
//   height    chiều cao ảnh ra (px, mặc định 384)       elevation  góc nhìn từ trên (độ, mặc định 12)
//   ry        xoay mô hình (rad)                         clipBelow  bỏ phần dưới theo tỉ lệ chiều cao (củ cà rốt nằm dưới đất)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [outDir, ...files] = process.argv.slice(2);
const root = process.cwd();
const page = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true;
document.body.appendChild(renderer.domElement);
window.render = async (url, { size = 1024, height: outHeight = 384, elevation = 12, ry = 0, clipBelow = 0 } = {}) => {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const scene = new THREE.Scene();
  const model = gltf.scene;
  model.rotation.y = ry;
  model.updateMatrixWorld(true);
  model.traverse((node) => { if (node.isMesh) { node.material.side = THREE.DoubleSide; } });
  scene.add(model);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f7a, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(0.4, 1, 1.2);
  scene.add(sun);
  let box = new THREE.Box3().setFromObject(model);
  // Bỏ phần dưới (mặt phẳng cắt), rồi đặt khung nhìn theo phần còn lại.
  const cut = box.min.y + (box.max.y - box.min.y) * clipBelow;
  renderer.clippingPlanes = clipBelow > 0 ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), -cut)] : [];
  if (clipBelow > 0) box = new THREE.Box3(new THREE.Vector3(box.min.x, cut, box.min.z), box.max.clone());
  const dims = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const aspect = Math.max(0.25, Math.min(2, dims.x / dims.y));
  const width = Math.round(size * aspect);
  renderer.setSize(width, size, false);
  const half = Math.max(dims.y / 2, dims.x / 2 / aspect) * 1.04;
  const camera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.01, 100);
  const tilt = elevation * Math.PI / 180;
  camera.position.set(center.x, center.y + Math.sin(tilt) * 10, center.z + Math.cos(tilt) * 10);
  camera.lookAt(center);
  renderer.render(scene, camera);
  // Cắt sát viền trong suốt, thu về chiều cao ảnh ra, xuất webp (giữ kênh trong suốt).
  const source = document.createElement('canvas');
  source.width = width;
  source.height = size;
  const context = source.getContext('2d', { willReadFrequently: true });
  context.drawImage(renderer.domElement, 0, 0);
  const pixels = context.getImageData(0, 0, width, size).data;
  let [left, top, right, bottom] = [width, size, -1, -1];
  for (let y = 0; y < size; y += 1) for (let x = 0; x < width; x += 1) {
    if (pixels[(y * width + x) * 4 + 3] < 8) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < 0) throw new Error('ảnh trống');
  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  const out = document.createElement('canvas');
  out.height = Math.min(outHeight, cropH);
  out.width = Math.max(1, Math.round((cropW * out.height) / cropH));
  const outContext = out.getContext('2d');
  outContext.imageSmoothingQuality = 'high';
  outContext.drawImage(source, left, top, cropW, cropH, 0, 0, out.width, out.height);
  return out.toDataURL('image/webp', 0.9);
};
window.ready = true;
</script></body></html>`;
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = null;
  if (url === '/') return res.writeHead(200, { 'content-type': 'text/html' }), res.end(page);
  if (url.startsWith('/three/')) file = path.join(root, 'node_modules/three', url.slice(7));
  if (url.startsWith('/model/')) file = url.slice(6);
  if (!file || !existsSync(file)) return res.writeHead(404), res.end();
  const type = file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const profile = mkdtempSync(path.join(os.tmpdir(), 'billboard-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--enable-gpu', '--use-angle=metal', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const endpoint = await new Promise((resolve) => {
  let text = '';
  chrome.stderr.on('data', (c) => { text += c; const m = /DevTools listening on (ws:\/\/\S+)/.exec(text); if (m) resolve(m[1]); });
});
const targets = await fetch(`${endpoint.replace(/^ws/, 'http').replace(/\/devtools\/browser\/.*$/, '')}/json/list`).then((r) => r.json());
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
ws.onmessage = ({ data }) => { const m = JSON.parse(data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const cmd = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (expression) => {
  const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await cmd('Page.navigate', { url: `http://127.0.0.1:${port}/` });
for (let i = 0; i < 50 && !(await ev('Boolean(window.ready)').catch(() => false)); i += 1) await new Promise((r) => setTimeout(r, 200));
const options = JSON.parse(process.env.OPTIONS || '{}');
for (const file of files) {
  const name = path.basename(file, '.glb').replace(/-full$/, '');
  const data = await ev(`render(${JSON.stringify(`/model${path.resolve(file)}`)}, ${JSON.stringify(options[name] || {})})`);
  writeFileSync(path.join(outDir, `${name}.webp`), Buffer.from(data.split(',')[1], 'base64'));
  console.log('ok', name);
}
chrome.kill();
server.close();
