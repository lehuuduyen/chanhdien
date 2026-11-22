// Vạch dẫn đường trong sân: một mesh cho dải có mũi tên + một mesh gộp vòng/cột đích.
// Geometry chỉ dựng lại khi đổi tuyến; mỗi khung chỉ đổi uniform tiến độ và thời gian.

export function routeLength(points = []) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z);
  return total;
}

export function projectOnRoute(points = [], point) {
  if (!point || points.length < 2) return { distance: Infinity, progress: 0, remaining: routeLength(points), segment: -1, point: null };
  let travelled = 0;
  let best = { distance: Infinity, progress: 0, segment: -1, point: null };
  const total = routeLength(points);
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const t = length ? Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (length * length))) : 0;
    const projected = { x: a.x + dx * t, z: a.z + dz * t };
    const distance = Math.hypot(point.x - projected.x, point.z - projected.z);
    if (distance < best.distance) best = { distance, progress: travelled + length * t, segment: index - 1, point: projected };
    travelled += length;
  }
  return { ...best, remaining: Math.max(0, total - best.progress) };
}

export function remaining(points, point) {
  return projectOnRoute(points, point).remaining;
}

function arrowTexture(THREE) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 128);
  ctx.fillStyle = '#fff3b0';
  ctx.shadowColor = '#ffc84a';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(32, 12);
  ctx.lineTo(56, 48);
  ctx.lineTo(42, 48);
  ctx.lineTo(42, 92);
  ctx.lineTo(22, 92);
  ctx.lineTo(22, 48);
  ctx.lineTo(8, 48);
  ctx.closePath();
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function stripGeometry(THREE, points, width = 0.45) {
  const positions = [];
  const uvs = [];
  const distances = [];
  const indices = [];
  const clean = [];
  for (const point of points) {
    const last = clean.at(-1);
    if (!last || Math.hypot(point.x - last.x, point.z - last.z) >= 1e-4) clean.push(point);
  }
  let travelled = 0;
  for (let index = 0; index < clean.length; index += 1) {
    const previous = clean[Math.max(0, index - 1)];
    const next = clean[Math.min(clean.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = (-dz / length) * width / 2;
    const nz = (dx / length) * width / 2;
    if (index) travelled += Math.hypot(clean[index].x - clean[index - 1].x, clean[index].z - clean[index - 1].z);
    positions.push(clean[index].x + nx, 0.22, clean[index].z + nz, clean[index].x - nx, 0.22, clean[index].z - nz);
    uvs.push(0, travelled / 2.2, 1, travelled / 2.2);
    distances.push(travelled, travelled);
    if (index) {
      const base = index * 2;
      indices.push(base - 2, base, base - 1, base, base + 1, base - 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aDistance', new THREE.Float32BufferAttribute(distances, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function goalGeometry(THREE) {
  const positions = [];
  const alpha = [];
  const indices = [];
  const segments = 32;
  // Vòng nằm ngang.
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    for (const radius of [0.58, 0.88]) {
      positions.push(Math.cos(angle) * radius, 0.13, Math.sin(angle) * radius);
      alpha.push(radius < 0.7 ? 0.95 : 0.55);
    }
  }
  for (let i = 0; i < segments; i += 1) {
    const base = i * 2;
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  // Cột sáng mềm (mặt ngoài, nhìn từ bên ngoài là FrontSide).
  const columnBase = positions.length / 3;
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * 0.55;
    const z = Math.sin(angle) * 0.55;
    positions.push(x, 0.14, z, x, 6, z);
    alpha.push(0.24, 0);
  }
  for (let i = 0; i < segments; i += 1) {
    const base = columnBase + i * 2;
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alpha, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createRouteView({ THREE, root }) {
  const group = new THREE.Group();
  group.name = 'navigation-route';
  root.add(group);
  const texture = arrowTexture(THREE);
  const uniforms = { map: { value: texture }, progress: { value: 0 }, time: { value: 0 }, opacity: { value: 1 } };
  const routeMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    // Vạch nhấc khỏi nền vài cm để không z-fighting nhưng vẫn kiểm tra độ sâu, nên bị người/vật ở trước che đúng cảnh.
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      attribute float aDistance;
      varying vec2 vUv;
      varying float vDistance;
      void main() {
        vUv = uv;
        vDistance = aDistance;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float progress;
      uniform float time;
      uniform float opacity;
      varying vec2 vUv;
      varying float vDistance;
      void main() {
        if (vDistance < progress - 0.18) discard;
        vec4 arrow = texture2D(map, vec2(vUv.x, fract(vUv.y - time * 0.55)));
        float edge = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
        vec3 color = mix(vec3(0.92, 0.56, 0.08), vec3(1.0, 0.95, 0.58), arrow.a);
        gl_FragColor = vec4(color, edge * (0.34 + arrow.a * 0.62) * opacity);
      }
    `,
  });
  const goalUniforms = { time: { value: 0 }, opacity: { value: 1 } };
  const goalMaterial = new THREE.ShaderMaterial({
    uniforms: goalUniforms,
    transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
    side: THREE.DoubleSide,
    vertexShader: `attribute float aAlpha; varying float vAlpha; varying float vHeight; void main(){vAlpha=aAlpha;vHeight=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform float time; uniform float opacity; varying float vAlpha; varying float vHeight; void main(){float pulse=vHeight<0.2?0.82+sin(time*3.0)*0.18:1.0;gl_FragColor=vec4(1.0,0.73,0.18,vAlpha*pulse*opacity);}`,
  });
  let route = null;
  const goal = new THREE.Mesh(goalGeometry(THREE), goalMaterial);
  goal.name = 'navigation-goal';
  goal.renderOrder = 55;
  goal.frustumCulled = false;
  goal.visible = false;
  group.add(goal);
  let hidden = false;
  let totalLength = 0;
  let active = false;
  let previewVisible = false;
  let preparedPoints = null;
  let previewTimer = null;

  function updateVisibility() {
    if (route) route.visible = !hidden && (active || previewVisible);
    goal.visible = Boolean(route) && !hidden && (active || previewVisible);
  }

  function removeRoute() {
    if (!route) return;
    group.remove(route);
    route.geometry.dispose();
    route.dispose?.();
    route = null;
  }

  function buildRoute(points) {
    removeRoute();
    route = new THREE.Mesh(stripGeometry(THREE, points), routeMaterial);
    route.name = 'navigation-strip';
    route.renderOrder = 55;
    route.frustumCulled = false;
    group.add(route);
    const end = points.at(-1);
    goal.position.set(end.x, 0, end.z);
    preparedPoints = points;
  }

  function setRoute(points = []) {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = null;
    active = false;
    previewVisible = false;
    uniforms.progress.value = 0;
    uniforms.opacity.value = 1;
    goalUniforms.opacity.value = 1;
    totalLength = routeLength(points);
    if (points.length < 2) {
      removeRoute();
      preparedPoints = null;
      updateVisibility();
      return;
    }
    if (!route || preparedPoints !== points) buildRoute(points);
    active = true;
    updateVisibility();
  }

  return {
    setRoute,
    // Chọn một điểm trên bản đồ đã biết chính xác tuyến. Dựng và đưa buffer lên GPU khi bảng bản đồ còn che cảnh,
    // rồi ẩn lại; bấm "Dẫn đường" chỉ bật mesh đã chuẩn bị nên không tạo một khung dài ở lần đầu.
    prepare(points = []) {
      if (points.length < 2) return;
      if (previewTimer) clearTimeout(previewTimer);
      if (!route || preparedPoints !== points) buildRoute(points);
      active = false;
      previewVisible = true;
      uniforms.progress.value = 0;
      uniforms.opacity.value = 0;
      goalUniforms.opacity.value = 0;
      updateVisibility();
      previewTimer = setTimeout(() => {
        previewTimer = null;
        if (active) return;
        previewVisible = false;
        updateVisibility();
      }, 120);
    },
    // renderer3d gọi lúc cổng vào còn che cảnh để shader của hai lệnh vẽ không biên dịch ở lần dẫn đường đầu tiên.
    warmup() {
      const sampleRoute = new THREE.Mesh(stripGeometry(THREE, [{ x: 0, z: 0 }, { x: 1, z: 0 }]), routeMaterial);
      const sampleGoal = new THREE.Mesh(goal.geometry, goalMaterial);
      sampleRoute.frustumCulled = false;
      sampleGoal.frustumCulled = false;
      return {
        objects: [sampleRoute, sampleGoal],
        done() { sampleRoute.geometry.dispose(); sampleRoute.removeFromParent(); sampleGoal.removeFromParent(); },
      };
    },
    setProgress(metres) {
      uniforms.progress.value = Math.max(0, Number(metres) || 0);
      const left = Math.max(0, totalLength - uniforms.progress.value);
      goalUniforms.opacity.value = Math.min(1, Math.max(0.08, left / 5));
    },
    setHidden(on) {
      hidden = Boolean(on);
      updateVisibility();
    },
    tick(seconds) { uniforms.time.value = seconds; goalUniforms.time.value = seconds; },
    stats() {
      return {
        drawCalls: (route?.visible ? 1 : 0) + (goal.visible ? 1 : 0), length: totalLength,
        visible: Boolean(route?.visible), opacity: uniforms.opacity.value,
      };
    },
    dispose() {
      setRoute([]);
      goal.geometry.dispose();
      goalMaterial.dispose();
      routeMaterial.dispose();
      texture.dispose();
      group.removeFromParent();
    },
  };
}

