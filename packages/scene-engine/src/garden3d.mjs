// Cây trồng trên luống Vườn Công Đức theo dữ liệu thật từ server: hạt (ụ đất) → mầm → cây non → cây ra quả (số quả =
// số còn lại). Mỗi luống có nhãn (chữ do trang đưa vào, theo ngôn ngữ). Hiệu ứng gieo hạt, tưới nước, hái quả là hạt
// sprite bay ngắn. Hình khối dùng chung geometry/vật liệu; quả của cả vườn là một InstancedMesh.
const FRUIT_COLORS = { apple: '#d8312a', orange: '#f39a1e', peach: '#f7a48e' };
const LEAF_COLORS = { apple: '#4f8f3a', orange: '#2f6f35', peach: '#7aa04a' };
const MAX_FRUITS = 10;

export function createGardenView({ THREE, root, garden, makeBubble, disposeSprite, labelFor, reduceMotion = false }) {
  const plots = new Map((garden?.plots || []).map((plot) => [plot.id, { ...plot, group: null, label: null, labelText: '', key: '' }]));
  const material = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });
  const m = {
    mound: material('#7b5130', 1),
    marker: material('#d9c08a', 0.8),
    seed: material('#c9a36a', 0.7),
    stem: material('#6aa84f', 0.8),
    trunk: material('#6b4a30', 0.95),
    wiltStem: material('#8a7441', 0.95),
    wiltLeaf: material('#8b7a3d', 1),
    leaf: Object.fromEntries(Object.entries(LEAF_COLORS).map(([key, color]) => [key, material(color, 0.9)])),
  };
  const g = {
    mound: new THREE.SphereGeometry(0.35, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    seed: new THREE.SphereGeometry(0.06, 8, 6),
    stem: new THREE.CylinderGeometry(0.045, 0.06, 0.7, 6),
    leaf: new THREE.SphereGeometry(0.2, 8, 6),
    marker: new THREE.BoxGeometry(0.3, 0.2, 0.03),
    stick: new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5),
    trunk: new THREE.CylinderGeometry(0.08, 0.13, 1, 8),
    canopy: new THREE.IcosahedronGeometry(0.55, 1),
  };
  for (const geometry of [g.mound]) geometry.scale(1, 0.45, 1);
  g.leaf.scale(1.4, 0.3, 0.7);

  // Quả: một InstancedMesh cho cả vườn (mỗi luống tối đa MAX_FRUITS quả).
  const fruitMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 10, 8), material('#ffffff', 0.5), plots.size * MAX_FRUITS);
  fruitMesh.frustumCulled = false;
  root.add(fruitMesh);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  // Tạo sẵn màu từng quả: có instanceColor từ đầu thì shader không phải biên dịch lại lúc quả đầu tiên hiện ra.
  const white = new THREE.Color('#ffffff');
  for (let index = 0; index < fruitMesh.count; index += 1) {
    fruitMesh.setMatrixAt(index, hidden);
    fruitMesh.setColorAt(index, white);
  }
  const fruitSlots = [];
  // Khi kết trái, luống là hai hàng cây thấp giống vườn rau/quả trong ảnh tham chiếu, không còn một cây to.
  const cropCells = [[-0.62, -0.38], [0, -0.38], [0.62, -0.38], [-0.62, 0.38], [0, 0.38], [0.62, 0.38]];
  for (let index = 0; index < MAX_FRUITS; index += 1) {
    const [cellX, cellZ] = cropCells[index % cropCells.length];
    const side = index < cropCells.length ? -1 : 1;
    fruitSlots.push([cellX + side * 0.12, 0.78 + (index % 3) * 0.08, cellZ + (index % 2 ? 0.1 : -0.08)]);
  }

  function buildPlant(plot, crop) {
    const group = new THREE.Group();
    group.position.set(plot.x, 0.22, plot.z);
    const add = (geometry, mat, [x, y, z], scale = 1) => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(scale);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const addInstances = (geometry, mat, transforms) => {
      const mesh = new THREE.InstancedMesh(geometry, mat, transforms.length);
      const item = new THREE.Object3D();
      transforms.forEach(({ position, scale = [1, 1, 1], rotation = [0, 0, 0] }, index) => {
        item.position.set(...position);
        item.scale.set(...scale);
        item.rotation.set(...rotation);
        item.updateMatrix();
        mesh.setMatrixAt(index, item.matrix);
      });
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const dry = Boolean(crop.wilted);
    const leaf = dry ? m.wiltLeaf : m.leaf[crop.plantType] || m.leaf.apple;
    const stem = dry ? m.wiltStem : m.stem;
    if (crop.stage === 'seed') {
      // Ụ đất mới vun, vài hạt trên mặt, que cắm biển nhỏ (nhìn xa vẫn biết luống đã gieo).
      add(g.mound, m.mound, [0, 0, 0], 1.6);
      for (const [x, z] of [[-0.12, 0.05], [0.1, -0.08], [0.02, 0.14]]) add(g.seed, m.seed, [x, 0.24, z], 1.3);
      add(g.stick, m.trunk, [0.55, 0.3, 0.55]);
      add(g.marker, m.marker, [0.55, 0.52, 0.56]);
    } else if (crop.stage === 'sprout') {
      add(g.mound, m.mound, [0, 0, 0], 1.3);
      add(g.stem, stem, [0, dry ? 0.3 : 0.4, 0], dry ? 0.82 : 1);
      [[-1, 0.55], [1, 0.62], [-1, 0.75], [1, 0.82]].forEach(([side, y], index) => {
        const leafMesh = add(g.leaf, stem, [side * 0.18, dry ? y * 0.72 : y, (index % 2 ? 0.05 : -0.05)]);
        leafMesh.rotation.z = side * (dry ? 1.05 : 0.45);
      });
    } else if (crop.stage === 'young') {
      add(g.trunk, dry ? m.wiltStem : m.trunk, [0, dry ? 0.4 : 0.5, 0], dry ? 0.8 : 1);
      const crown = add(g.canopy, leaf, [0, dry ? 0.88 : 1.25, 0], dry ? 0.78 : 0.95);
      if (dry) crown.rotation.z = 0.22;
    } else {
      // Sáu cụm cây trồng thành hai hàng, tán thấp dày và quả nổi rõ trên mặt luống.
      addInstances(g.stem, stem, cropCells.map(([x, z]) => ({
        position: [x, dry ? 0.25 : 0.34, z], scale: [0.7, dry ? 0.5 : 0.75, 0.7], rotation: [0, 0, dry ? 0.18 : 0],
      })));
      addInstances(g.canopy, leaf, cropCells.flatMap(([x, z], index) => [
        { position: [x - 0.12, dry ? 0.48 : 0.68, z], scale: [0.42, dry ? 0.24 : 0.38, 0.42], rotation: [0, index * 0.7, dry ? 0.35 : 0] },
        { position: [x + 0.14, dry ? 0.43 : 0.62, z + 0.08], scale: [0.36, dry ? 0.2 : 0.33, 0.36], rotation: [0, index, dry ? -0.3 : 0] },
      ]));
    }
    return group;
  }

  // Quả của một luống: hiện đúng số còn lại, giấu phần còn thừa.
  function placeFruits(slotBase, plot, crop) {
    const color = new THREE.Color(crop?.wilted ? '#8c6c3f' : FRUIT_COLORS[crop?.plantType] || '#ffffff');
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < MAX_FRUITS; index += 1) {
      const visible = crop?.stage === 'fruiting' && index < crop.fruitsLeft;
      if (visible) {
        const [x, y, z] = fruitSlots[index];
        matrix.makeTranslation(plot.x + x, 0.22 + y, plot.z + z);
        fruitMesh.setMatrixAt(slotBase + index, matrix);
        fruitMesh.setColorAt(slotBase + index, color);
      } else fruitMesh.setMatrixAt(slotBase + index, hidden);
    }
    fruitMesh.instanceMatrix.needsUpdate = true;
    if (fruitMesh.instanceColor) fruitMesh.instanceColor.needsUpdate = true;
  }

  function setLabel(plot, text) {
    if (plot.labelText === text) return;
    if (plot.label) {
      root.remove(plot.label);
      disposeSprite(plot.label);
      plot.label = null;
    }
    plot.labelText = text;
    if (!text) return;
    plot.label = makeBubble(text, false);
    plot.label.position.set(plot.x, 2.75, plot.z);
    root.add(plot.label);
  }

  // ---- Hiệu ứng ngắn: hạt rơi, giọt nước, quả bay lên ----
  const dot = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(canvas);
  })();
  const particles = [];
  function burst(plot, kind, plantType) {
    const color = kind === 'water' ? '#8fd3ff' : kind === 'plant' ? '#8a5a34' : FRUIT_COLORS[plantType] || '#ffcf6a';
    const count = kind === 'water' ? 18 : kind === 'plant' ? 10 : 8;
    const spriteMaterial = new THREE.SpriteMaterial({ map: dot, color, transparent: true, depthWrite: false });
    for (let index = 0; index < count; index += 1) {
      const sprite = new THREE.Sprite(spriteMaterial);
      const angle = Math.random() * Math.PI * 2;
      const reach = Math.random() * 0.9;
      const start = kind === 'water'
        ? [plot.x + Math.cos(angle) * reach, 2.2 + Math.random() * 0.6, plot.z + Math.sin(angle) * reach]
        : [plot.x + Math.cos(angle) * reach * 0.4, kind === 'plant' ? 0.35 : 1.5, plot.z + Math.sin(angle) * reach * 0.4];
      sprite.position.set(...start);
      sprite.scale.setScalar(kind === 'water' ? 0.12 : kind === 'plant' ? 0.14 : 0.24);
      root.add(sprite);
      particles.push({
        sprite, kind, life: 0, delay: Math.random() * (kind === 'water' ? 0.6 : 0.2),
        velocity: kind === 'water' ? [0, -3.2, 0] : kind === 'plant' ? [Math.cos(angle) * 0.8, 1.6, Math.sin(angle) * 0.8] : [Math.cos(angle) * 0.5, 2.4, Math.sin(angle) * 0.5],
      });
    }
    if (kind === 'plant') {
      // Hạt rơi xuống luống.
      const seed = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#f3d08a', transparent: true, depthWrite: false }));
      seed.scale.setScalar(0.2);
      seed.position.set(plot.x, 1.6, plot.z);
      root.add(seed);
      particles.push({ sprite: seed, kind: 'seed', life: 0, delay: 0, velocity: [0, -1.6, 0] });
    }
  }

  return {
    pickables: [],
    // Cây mẫu đủ các giai đoạn, để biên dịch sẵn shader lúc nạp cảnh (xem explore3d warmup).
    warmupObjects() {
      return ['seed', 'sprout', 'young', 'fruiting'].map((stage, index) => buildPlant({ x: index, z: 0 }, { plantType: 'apple', stage }));
    },
    // Kiểm tra: mỗi luống đang vẽ gì.
    debug() {
      return [...plots.values()].map((plot) => ({ id: plot.id, x: plot.x, z: plot.z, key: plot.key, meshes: plot.group?.children.length || 0, label: plot.labelText }));
    },
    // plots: [{ id, crop }] từ server. Chỉ dựng lại cây khi loại / giai đoạn đổi; quả và nhãn cập nhật mỗi lần.
    setPlots(list) {
      for (const data of list) {
        const plot = plots.get(data.id);
        if (!plot) continue;
        const crop = data.crop;
        const key = crop ? `${crop.id}:${crop.plantType}:${crop.stage}:${crop.wilted ? 'wilted' : 'fresh'}` : '';
        if (key !== plot.key) {
          if (plot.group) root.remove(plot.group);
          plot.group = crop ? buildPlant(plot, crop) : null;
          if (plot.group) root.add(plot.group);
          plot.key = key;
        }
        placeFruits((data.id - 1) * MAX_FRUITS, plot, crop);
        setLabel(plot, labelFor?.(data) || '');
      }
    },
    // Đổi ngôn ngữ: vẽ lại nhãn.
    relabel(list) {
      for (const data of list) {
        const plot = plots.get(data.id);
        if (plot) setLabel(plot, labelFor?.(data) || '');
      }
    },
    effect(plotId, kind, plantType) {
      const plot = plots.get(plotId);
      if (plot && !reduceMotion) burst(plot, kind, plantType);
    },
    update(dt) {
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const item = particles[index];
        if (item.delay > 0) {
          item.delay -= dt;
          item.sprite.visible = false;
          continue;
        }
        item.sprite.visible = true;
        item.life += dt;
        const [vx, vy, vz] = item.velocity;
        item.sprite.position.x += vx * dt;
        item.sprite.position.y += vy * dt;
        item.sprite.position.z += vz * dt;
        if (item.kind !== 'water' && item.kind !== 'seed') item.velocity[1] -= 3.5 * dt;
        const done = item.life > (item.kind === 'harvest' ? 1.1 : 0.9) || item.sprite.position.y < 0.25;
        item.sprite.material.opacity = Math.max(0, 1 - item.life);
        if (done) {
          root.remove(item.sprite);
          particles.splice(index, 1);
        }
      }
    },
  };
}
