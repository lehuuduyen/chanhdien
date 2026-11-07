// Mộ ở Khu tưởng niệm theo dữ liệu thật từ server: nấm đất dài theo trục x, bia đá ở đầu phía tây quay mặt về phía
// đông, mặt bia vẽ "R.I.P" + tên (canvas, chữ người dùng chỉ vẽ lên canvas), bó hoa và hai nén hương trước mộ. Mộ
// quá expiresAt thì tự ẩn (server cũng không trả mộ hết hạn nữa). Geometry/vật liệu đá dùng chung; mỗi bia một texture.
const CHECK_MS = 1_000;

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  // Từ quá dài (không có dấu cách): cắt theo ký tự.
  const out = [];
  for (const item of lines) {
    let rest = [...item];
    while (rest.length) {
      let take = rest.length;
      while (take > 1 && ctx.measureText(rest.slice(0, take).join('')).width > maxWidth) take -= 1;
      out.push(rest.slice(0, take).join(''));
      rest = rest.slice(take);
    }
  }
  if (out.length > maxLines) {
    out.length = maxLines;
    out[maxLines - 1] = `${out[maxLines - 1].replace(/.$/u, '')}…`;
  }
  return out;
}

function stoneFace(THREE, name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#8d8a84');
  gradient.addColorStop(1, '#6f6c66');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(30, 28, 26, 0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f0d27a';
  ctx.font = 'bold 54px Georgia, "Times New Roman", serif';
  ctx.fillText('R.I.P', canvas.width / 2, 78);
  ctx.fillStyle = 'rgba(240, 210, 122, 0.8)';
  ctx.fillRect(70, 118, canvas.width - 140, 3);
  ctx.fillStyle = '#f7f3ea';
  let size = 52;
  let lines = [];
  for (; size >= 24; size -= 4) {
    ctx.font = `bold ${size}px system-ui, "Segoe UI", sans-serif`;
    lines = wrapLines(ctx, name, canvas.width - 48, 3);
    if (lines.every((line) => ctx.measureText(line).width <= canvas.width - 48) && lines.length * size * 1.2 <= 170) break;
  }
  const top = 205 - ((lines.length - 1) * size * 1.2) / 2;
  lines.forEach((line, index) => ctx.fillText(line, canvas.width / 2, top + index * size * 1.2));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createMemorialView({ THREE, root, memorial }) {
  const mound = memorial?.mound || { length: 2, width: 1.1 };
  const slots = new Map((memorial?.graves || []).map((grave) => [grave.id, { ...grave, data: null, group: null, key: '', texture: null }]));
  const material = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });
  const m = {
    earth: material('#7a5636', 1),
    grass: material('#5f8a3c', 0.95),
    stone: material('#7d7a74', 0.8),
    flower: material('#f2f0ea', 0.7),
    flowerRed: material('#d8463a', 0.7),
    stem: material('#4d7a34', 0.9),
    incense: material('#b0523a', 0.8),
    ember: new THREE.MeshStandardMaterial({ color: '#ff9a3c', emissive: '#ff6a1a', emissiveIntensity: 1.4 }),
  };
  const g = {
    mound: new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    stone: new THREE.BoxGeometry(0.18, 0.95, 0.86),
    cap: new THREE.CylinderGeometry(0.43, 0.43, 0.18, 18, 1, false, 0, Math.PI),
    face: new THREE.PlaneGeometry(0.74, 0.92),
    base: new THREE.BoxGeometry(0.4, 0.14, 1.04),
    bloom: new THREE.SphereGeometry(0.06, 8, 6),
    stem: new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4),
    stick: new THREE.CylinderGeometry(0.01, 0.01, 0.34, 4),
    ember: new THREE.SphereGeometry(0.018, 6, 4),
  };
  g.mound.scale(mound.length, 0.9, mound.width);
  // Nửa trụ nằm ngang (trục theo x, bề dày bằng thân bia) làm đỉnh bia bo tròn; θ 0…π sau khi xoay là nửa trên.
  g.cap.rotateZ(Math.PI / 2);

  function build(slot, grave) {
    const group = new THREE.Group();
    group.position.set(slot.x, 0, slot.z);
    const add = (geometry, mat, [x, y, z], rotation = null) => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(x, y, z);
      if (rotation) mesh.rotation.set(...rotation);
      mesh.castShadow = geometry !== g.face;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    add(g.mound, m.earth, [0, 0.08, 0]);
    // Đầu tây: bệ + thân bia + đỉnh bo tròn; mặt bia quay về +x.
    const headX = -mound.length / 2 - 0.12;
    add(g.base, m.stone, [headX, 0.07, 0]);
    add(g.stone, m.stone, [headX, 0.6, 0]);
    add(g.cap, m.stone, [headX, 1.075, 0]);
    slot.texture = stoneFace(THREE, grave.name);
    add(g.face, new THREE.MeshStandardMaterial({ map: slot.texture, roughness: 0.7 }), [headX + 0.095, 0.62, 0], [0, Math.PI / 2, 0]);
    // Bó hoa đặt trên giữa nấm mộ, hai nén hương ở cuối mộ: không che mặt bia.
    for (const [dx, dz, red] of [[-0.12, -0.08, false], [0, 0.06, true], [0.1, -0.04, false], [-0.04, 0.14, false]]) {
      add(g.stem, m.stem, [dx + 0.3, 0.46, dz], [0, 0, 0.25]);
      add(g.bloom, red ? m.flowerRed : m.flower, [dx + 0.34, 0.6, dz]);
    }
    for (const dz of [-0.18, 0.18]) {
      add(g.stick, m.incense, [mound.length / 2 + 0.12, 0.17, dz]);
      add(g.ember, m.ember, [mound.length / 2 + 0.12, 0.35, dz]);
    }
    root.add(group);
    return group;
  }

  function clear(slot) {
    if (!slot.group) return;
    root.remove(slot.group);
    slot.group.traverse((object) => {
      if (object.isMesh && object.material?.map === slot.texture) object.material.dispose();
    });
    slot.texture?.dispose();
    slot.group = null;
    slot.texture = null;
    slot.key = '';
  }

  function sync(slot) {
    const grave = slot.data && slot.data.expiresAt > Date.now() ? slot.data : null;
    const key = grave ? `${grave.name}|${grave.builtAt}` : '';
    if (key === slot.key) return;
    clear(slot);
    if (grave) {
      slot.group = build(slot, grave);
      slot.key = key;
    }
  }

  let checkedAt = 0;
  return {
    // list: [{ slot, grave | null }] (snapshot đầy đủ hoặc vài ô vừa đổi).
    setGraves(list, { full = false } = {}) {
      const seen = new Set();
      for (const item of list || []) {
        const slot = slots.get(item.slot);
        if (!slot) continue;
        slot.data = item.grave || null;
        seen.add(item.slot);
        sync(slot);
      }
      if (full) for (const [id, slot] of slots) if (!seen.has(id)) { slot.data = null; sync(slot); }
    },
    update() {
      const now = Date.now();
      if (now - checkedAt < CHECK_MS) return;
      checkedAt = now;
      for (const slot of slots.values()) if (slot.group && slot.data?.expiresAt <= now) sync(slot);
    },
    grave: (id) => {
      const slot = slots.get(id);
      return slot?.data && slot.data.expiresAt > Date.now() ? slot.data : null;
    },
    debug: () => [...slots.values()].filter((slot) => slot.group).map((slot) => ({ slot: slot.id, name: slot.data.name, meshes: slot.group.children.length })),
  };
}
