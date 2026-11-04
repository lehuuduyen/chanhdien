// Ảnh chân dung nhân vật cho cổng chọn Nam/Nữ: dựng đúng mô hình chibi 3D trong cảnh rồi chụp thành ảnh (một lần,
// dùng một WebGL renderer rồi giải phóng ngay). Máy không có WebGL thì giữ ảnh vẽ sẵn trong HTML.
export async function renderChibiPortraits(entries, { width = 180, height = 220 } = {}) {
  const THREE = await import('three');
  const { buildChibiWalker } = await import('/engine/chibi3d.mjs');
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff4e0', '#5a3a28', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 1.4);
  key.position.set(-1, 2, -2);
  scene.add(key);
  // Nhìn hơi chếch từ phía trước (nhân vật quay mặt về −z).
  const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 20);
  camera.position.set(0.55, 0.95, -2.35);
  camera.lookAt(0, 0.6, 0);
  const images = {};
  for (const { skin, look } of entries) {
    const { figure } = buildChibiWalker(skin, look);
    figure.rotation.y = 0.2;
    scene.add(figure);
    renderer.render(scene, camera);
    images[look?.outfit === 'casual' ? `${skin}:casual` : skin] = canvas.toDataURL('image/png');
    scene.remove(figure);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return images;
}
