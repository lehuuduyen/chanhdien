// Sinh bố cục vườn chùa (world.courtyard + world.walk) cho scenes/thien-default: chạy `node scripts/thien-garden-layout.mjs`
// ở gốc repo. Vật cản đi lại tính từ vị trí vật thể nên sửa bố cục ở đây rồi chạy lại (chạy nhiều lần cho cùng kết quả).
import { readFileSync, writeFileSync } from 'node:fs';
import { THIEN_GARDEN } from '@chanh-dien/room-rules';
const file = 'scenes/thien-default/scene.json';
const scene = JSON.parse(readFileSync(file, 'utf8'));
const w = scene.world;
const c = w.courtyard;
// Chánh điện lớn: 18 × 21 m, trần 9,5 m; bàn thờ dài đặt ba tượng (Tây Phương: A Di Đà giữa, Địa Tạng trái, Quan Âm phải).
const HALL_HALF = 9;
const hallPillarX = 7.4;
w.hall = {
  halfWidth: HALL_HALF, back: -5, front: 16, height: 9.5,
  pillars: [-1.6, 2.6, 6.8, 11, 15].flatMap((z) => [[-hallPillarX, z], [hallPillarX, z]]),
  altarWidth: 14, backdropWidth: 13.2, couplets: 2.2,
  windows: [3, 7, 11], lanterns: { x: 4.6, z: [1.2, 5.2, 9.2, 13.2] },
};
w.camera.frame = { ...w.camera.frame, width: 11 };
c.facade = { width: HALL_HALF * 2 + 1.6, height: w.hall.height + 2.9 };
c.porchPillars = [-8.4, -5.4, -2.4, 2.4, 5.4, 8.4].map((x) => [x, 17.3]);
c.instruments = [{ type: 'bell', x: -11.6, z: 19.2, scale: 1 }, { type: 'drum', x: 11.6, z: 19.2, scale: 1 }];
c.board = { ...c.board, x: -14, z: 19.6 };
const HALF = 36, END = 100, GATE = 98.6;
const WALK_END = Math.round((GATE - 0.9) * 10) / 10;
c.ground = { x: [-HALF, HALF], z: [16, END] };
c.floor = 'grass';
c.paths = [
  { x: [-12, 12], z: [16, 31] },          // sân đá trước chánh điện
  { x: [-1.8, 1.8], z: [31, END] },       // lối giữa tới cổng
  { x: [-19, 19], z: [48.8, 51.2] },      // lối ngang tới bồ đề / Quan Âm
  { x: [-4.6, 4.6], z: [75.4, 84.6] },    // sân nhỏ quanh bồn nước
  { x: [1.8, 13.2], z: [67.4, 68.6] },     // lối đá từ lối giữa vào cổng Vườn Công Đức
  { x: [1.8, 9.2], z: [85.8, 87.2] },      // lối vào Khu vui chơi thú cưng
];
delete c.lawns;
// 9 vị mỗi bên, cách 4,5 m; lối ngang z = 50 nằm giữa hàng thứ 4 và 5.
const arhats = [];
for (let i = 0; i < 9; i += 1) arhats.push({ x: -5.6, z: 34 + i * 4.5, ry: 1.5708 }, { x: 5.6, z: 34 + i * 4.5, ry: -1.5708 });
// 13 dáng (thứ tự như world.statues.arhats). Bên trái 9 dáng; bên phải 4 dáng còn lại xen 5 dáng lặp lại, mỗi dáng lặp
// đổi chất liệu và đặt cách bản gốc ít nhất 4 hàng để không nhìn thấy cạnh nhau.
const LEFT = [0, 5, 1, 4, 2, 7, 3, 8, 6];
const RIGHT = [[9], [3, 'gold'], [10], [8, 'bronze'], [11], [0, 'stone'], [12], [1, 'bronze'], [2, 'gold']];
arhats.forEach((item, index) => {
  const row = Math.floor(index / 2);
  if (item.x < 0) item.model = LEFT[row];
  else {
    const [model, finish] = RIGHT[row];
    item.model = model;
    if (finish) item.finish = finish;
  }
});
c.arhats = arhats;
c.bodhi = {
  ...c.bodhi,
  x: -22, z: 50, size: 1.75,
  projectId: c.bodhi?.projectId || 'bodhi-global-1',
  stageScales: c.bodhi?.stageScales || [0, 0.18, 0.42, 0.72, 1],
};
c.guanyin = {
  x: 22, z: 50, scale: 2.35, ry: -1.5708,
  garden: {
    radius: 5.6, hedgeCount: 22, hedgeRadius: 0.7, entryHalfAngle: 0.5,
    altar: { x: 0, z: 3, width: 1.4, depth: 0.6 },
    lanterns: [{ x: -2.4, z: 3.4 }, { x: 2.4, z: 3.4 }],
  },
};
c.fountain = { x: 0, z: 80, radius: 2.6 };
c.pond = {
  ...c.pond,
  x: -19.5, z: 80, radiusX: 12, radiusZ: 9, depth: 1.3, fish: 26,
  projectId: c.pond?.projectId || 'lotus-global-1',
  stageVisibility: c.pond?.stageVisibility || { water: 0, rocks: 2, lotus: 3, fish: 0 },
};
c.benches = [
  { x: -6.4, z: 74.5, ry: -1.5708 }, { x: -6.4, z: 85.5, ry: -1.5708 },
  { x: 6.2, z: 77.5, ry: -1.5708 }, { x: 6.2, z: 82.5, ry: -1.5708 },
  { x: -15, z: 46.2, ry: 0 }, { x: 15, z: 46.2, ry: 0 },
].map((item, index) => ({ id: `B-${index + 1}`, ...item, scale: 0.72, seats: 2 }));
c.planters = [];
for (const z of [36.25, 45.25, 58.75, 67.75]) c.planters.push({ x: -3.3, z, flower: 'pink' }, { x: 3.3, z, flower: 'yellow' });
c.planters.push({ x: -10, z: 30, flower: 'yellow' }, { x: 10, z: 30, flower: 'pink' }, { x: -14, z: 53.6, flower: 'pink' }, { x: 14, z: 53.6, flower: 'yellow' });
// Vườn Công Đức: 50 luống (5 hàng × 10, bố cục ở THIEN_GARDEN trong room rules, dùng chung với bot làm vườn) ở bãi
// cỏ phía sau bên phải. Hàng rào gỗ bao quanh; cổng ở cạnh tây, quầy hạt giống và thùng nước ngoài rào cạnh cổng.
const GARDEN_FENCE = THIEN_GARDEN.fence;
const GARDEN_GATE = THIEN_GARDEN.gate;
c.garden = {
  sign: 'VƯỜN CÔNG ĐỨC',
  shopSign: 'QUẦY HẠT GIỐNG',
  bed: THIEN_GARDEN.bed,
  entrance: { x: GARDEN_FENCE.x[0], z: GARDEN_GATE.z, ry: -1.5708, width: GARDEN_GATE.width },
  shop: { x: 10.6, z: 64.2, ry: -1.5708 },
  // Thùng nước gỗ cạnh cổng (trang trí, gợi ý chỗ tưới).
  barrel: { x: 12.5, z: 66.2 },
  plots: THIEN_GARDEN.plots.map(({ id, x, z }) => ({ id, x, z })),
  // Hàng rào: các đoạn thẳng [x0, z0, x1, z1], chừa lối vào ở cổng.
  fence: [
    [GARDEN_FENCE.x[0], GARDEN_FENCE.z[0], GARDEN_FENCE.x[1], GARDEN_FENCE.z[0]],
    [GARDEN_FENCE.x[1], GARDEN_FENCE.z[0], GARDEN_FENCE.x[1], GARDEN_FENCE.z[1]],
    [GARDEN_FENCE.x[1], GARDEN_FENCE.z[1], GARDEN_FENCE.x[0], GARDEN_FENCE.z[1]],
    [GARDEN_FENCE.x[0], GARDEN_FENCE.z[1], GARDEN_FENCE.x[0], GARDEN_GATE.z + GARDEN_GATE.width / 2],
    [GARDEN_FENCE.x[0], GARDEN_GATE.z - GARDEN_GATE.width / 2, GARDEN_FENCE.x[0], GARDEN_FENCE.z[0]],
  ],
};
// Khu thú cưng phía sau bên phải: có cổng mở về lối giữa, đồ chơi và sáu chó mèo có tên riêng.
const PET_FENCE = { x: [7.2, 34], z: [77, 97] };
const PET_GATE = { z: 86.5, width: 3.2 };
c.petZone = {
  sign: 'KHU VUI CHƠI THÚ CƯNG',
  area: PET_FENCE,
  entrance: { x: PET_FENCE.x[0], z: PET_GATE.z, ry: -1.5708, width: PET_GATE.width },
  fence: [
    [PET_FENCE.x[0], PET_FENCE.z[0], PET_FENCE.x[1], PET_FENCE.z[0]],
    [PET_FENCE.x[1], PET_FENCE.z[0], PET_FENCE.x[1], PET_FENCE.z[1]],
    [PET_FENCE.x[1], PET_FENCE.z[1], PET_FENCE.x[0], PET_FENCE.z[1]],
    [PET_FENCE.x[0], PET_FENCE.z[1], PET_FENCE.x[0], PET_GATE.z + PET_GATE.width / 2],
    [PET_FENCE.x[0], PET_GATE.z - PET_GATE.width / 2, PET_FENCE.x[0], PET_FENCE.z[0]],
  ],
  props: [
    { type: 'house', x: 30.5, z: 93.5, ry: 3.1416 },
    { type: 'tunnel', x: 21.5, z: 93, ry: 1.5708 },
    { type: 'seesaw', x: 25.5, z: 80.5, ry: 1.5708 },
    { type: 'hoop', x: 12.2, z: 92, ry: 1.5708 },
    { type: 'bowls', x: 10, z: 79.3, ry: 0 },
    { type: 'balls', x: 17.5, z: 80.2, ry: 0 },
  ],
};
c.trees = [{ x: 8.6, z: 21, size: 1.3 }, { x: 33.5, z: 54.5, size: 1.0 }, { x: -30, z: 40, size: 1.2 }, { x: 13, z: 93, size: 1.0 }];
c.pines = [[-8.6, 20], [-9, 27], [9, 28.5], [-31, 20], [31, 22], [-31, 62], [31, 40], [-15, 95], [21, 95], [-32, 94]];
c.bushes = [[-13.2, 22.5], [-10.6, 23.5], [10.6, 25], [-10.6, 30], [10.6, 31.5], [13.4, 22], [-24, 30], [24, 30], [16, 79], [33, 79], [-6.5, 92], [9, 60]];
c.animals = [
  { id: 'pet-dog-moc', name: 'Mộc', type: 'dog', color: '#c8893f', x: 15, z: 84, area: { x: [8, 33], z: [78, 96] } },
  { id: 'pet-dog-nau', name: 'Nâu', type: 'dog', color: '#2b2522', x: 24, z: 86, area: { x: [8, 33], z: [78, 96] } },
  { id: 'pet-dog-sua', name: 'Sữa', type: 'dog', color: '#ece4d6', x: 28, z: 89, area: { x: [8, 33], z: [78, 96] } },
  { id: 'pet-cat-miu', name: 'Miu', type: 'cat', color: '#d9853b', x: 12, z: 88, area: { x: [8, 33], z: [78, 96] } },
  { id: 'pet-cat-may', name: 'Mây', type: 'cat', color: '#8e8f93', x: 26, z: 94, area: { x: [8, 33], z: [78, 96] } },
  { id: 'pet-cat-bong', name: 'Bông', type: 'cat', color: '#f2eee6', x: 18, z: 90, area: { x: [8, 33], z: [78, 96] } },
  // Thú có mô hình riêng (nén từ nhanvat/pet/<loài>_<tên>.glb): height là chiều cao đứng (m), modelRy xoay cho mõm hướng +z.
  { id: 'pet-dog-milo', name: 'Milo', type: 'dog', model: '/models/pets/dog-milo.glb', height: 0.62, modelRy: 0, x: 20, z: 83, area: { x: [8, 33], z: [78, 96] } },
  { id: 'pet-dog-fox', name: 'Fox', type: 'dog', model: '/models/pets/dog-fox.glb', height: 0.6, modelRy: 0, x: 30, z: 85, area: { x: [8, 33], z: [78, 96] } },
  { id: 'pet-cat-meomeo', name: 'Meomeo', type: 'cat', model: '/models/pets/cat-meomeo.glb', height: 0.38, modelRy: 0, x: 14, z: 92, area: { x: [8, 33], z: [78, 96] } },
];
c.guideBoards = [
  ...(c.guideBoards || []).filter((item) => item.id !== 'pets'),
  { id: 'pets', x: 9.4, z: 83.3, ry: -1.5708, width: 2.2, height: 1.15, sign: 'HƯỚNG DẪN KHU THÚ CƯNG' },
];
c.gate = { ...c.gate, z: GATE };
// Đèn đá: hai bên sân lư hương như cũ, thêm dọc lối giữa tới cổng.
c.lanterns = [[-3.4, 20], [3.4, 20], [-3.4, 24.5], [3.4, 24.5], [-3.4, 29], [3.4, 29], [-3, 88], [3, 88], [-3, 94], [3, 94]];

// ---- Đi lại ----
const walk = w.walk;
// Trong điện: cột, lư hương nhỏ và hai người phụ lễ bên bàn thờ.
const inside = [
  ...w.hall.pillars.map(([x, z]) => ({ x, z, r: 0.4 })),
  { x: 0, z: 1, r: 0.6 }, { x: -1.7, z: 0.82, r: 0.45 }, { x: 1.7, z: 0.82, r: 0.45 },
];
const circle = (x, z, r) => ({ x, z, r });
const localPoint = (item, x, z) => ({
  x: item.x + x * Math.cos(item.ry || 0) + z * Math.sin(item.ry || 0),
  z: item.z - x * Math.sin(item.ry || 0) + z * Math.cos(item.ry || 0),
});
const benchObstacle = (item) => {
  const turned = Math.abs(Math.sin(item.ry || 0)) > 0.5;
  const scale = item.scale || 1;
  return { x: item.x, z: item.z, rx: (turned ? 0.38 : 1.12) * scale, rz: (turned ? 1.12 : 0.38) * scale };
};
const guanyinGardenObstacles = [];
const guanyinGarden = c.guanyin.garden;
for (let index = 0; index < guanyinGarden.hedgeCount; index += 1) {
  const angle = (index / guanyinGarden.hedgeCount) * Math.PI * 2;
  if (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < guanyinGarden.entryHalfAngle) continue;
  const point = localPoint(c.guanyin, Math.sin(angle) * guanyinGarden.radius, Math.cos(angle) * guanyinGarden.radius);
  guanyinGardenObstacles.push(circle(point.x, point.z, guanyinGarden.hedgeRadius));
}
const guanyinAltar = localPoint(c.guanyin, guanyinGarden.altar.x, guanyinGarden.altar.z);
const guanyinTurned = Math.abs(Math.sin(c.guanyin.ry || 0)) > 0.5;
guanyinGardenObstacles.push({
  ...guanyinAltar,
  rx: (guanyinTurned ? guanyinGarden.altar.depth : guanyinGarden.altar.width) / 2,
  rz: (guanyinTurned ? guanyinGarden.altar.width : guanyinGarden.altar.depth) / 2,
});
for (const lantern of guanyinGarden.lanterns) {
  const point = localPoint(c.guanyin, lantern.x, lantern.z);
  guanyinGardenObstacles.push(circle(point.x, point.z, 0.3));
}
const obstacles = [
  ...inside,
  ...c.porchPillars.map(([x, z]) => circle(x, z, 0.4)),
  circle(c.burner.x, c.burner.z, 1.05),
  ...c.lanterns.map(([x, z]) => circle(x, z, 0.35)),
  ...c.trees.map((t) => circle(t.x, t.z, 0.6 * t.size + 0.2)),
  ...c.pines.map(([x, z]) => circle(x, z, 0.6)),
  ...c.bushes.map(([x, z]) => circle(x, z, 0.7)),
  circle(c.board.x, c.board.z, 0.7),
  // Hai Hộ pháp ngoài hiên, hai bên cửa chánh điện.
  circle(-3.9, 17.7, 0.75), circle(3.9, 17.7, 0.75),
  ...c.instruments.map((item) => circle(item.x, item.z, 0.8)),
  circle(c.bodhi.x, c.bodhi.z, 3.2),
  circle(c.guanyin.x, c.guanyin.z, 2.8),
  ...guanyinGardenObstacles,
  circle(c.fountain.x, c.fountain.z, 3),
  { x: c.pond.x, z: c.pond.z, rx: c.pond.radiusX + 0.45, rz: c.pond.radiusZ + 0.45 },
  // Ghế dài 2,2 m: elip đúng chiều ghế, không để lọt qua hai đầu. Bụi cây cũng là vật thể đặc thay vì chỉ trang trí.
  ...c.benches.map(benchObstacle),
  ...c.planters.map((p) => circle(p.x, p.z, 0.55)),
  ...c.arhats.map((a) => circle(a.x, a.z, 1.0)),
  // Luống vườn (đi quanh, không giẫm lên), quầy hạt giống, hàng rào (chuỗi vật cản nhỏ dọc từng đoạn).
  // Luống trong một hàng sát nhau nên dùng hình chữ nhật đúng cỡ luống (đi giữa các hàng, không đi xuyên luống).
  ...c.garden.plots.map((plot) => ({ x: plot.x, z: plot.z, rx: c.garden.bed / 2 + 0.05, rz: c.garden.bed / 2 + 0.05 })),
  circle(c.garden.barrel.x, c.garden.barrel.z, 0.35),
  circle(c.garden.shop.x, c.garden.shop.z, 1.3),
  ...c.garden.fence.flatMap(([x0, z0, x1, z1]) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(length / 0.5);
    return Array.from({ length: steps + 1 }, (_, index) => circle(
      Math.round((x0 + ((x1 - x0) * index) / steps) * 100) / 100,
      Math.round((z0 + ((z1 - z0) * index) / steps) * 100) / 100,
      0.25,
    ));
  }),
  // Hàng rào và đồ chơi lớn trong khu thú cưng. Vòng nhảy, bát và bóng nhỏ không cản đường.
  ...c.petZone.fence.flatMap(([x0, z0, x1, z1]) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(length / 0.5);
    return Array.from({ length: steps + 1 }, (_, index) => circle(
      Math.round((x0 + ((x1 - x0) * index) / steps) * 100) / 100,
      Math.round((z0 + ((z1 - z0) * index) / steps) * 100) / 100,
      0.25,
    ));
  }),
  ...c.petZone.props.flatMap((item) => {
    if (item.type === 'house') return [{ x: item.x, z: item.z, rx: 1.35, rz: 1.05 }];
    if (item.type === 'tunnel') return [{ x: item.x, z: item.z, rx: 1.25, rz: 0.7 }];
    if (item.type === 'seesaw') return [{ x: item.x, z: item.z, rx: 0.38, rz: 1.5 }];
    return [];
  }),
];
const gateWall = (x0, x1) => { for (let x = x0; x <= x1; x += 1.2) obstacles.push(circle(x, GATE, 0.6)); };
gateWall(-HALF + 0.6, -3.4); gateWall(3.4, HALF - 0.6);
walk.obstacles = obstacles;
walk.bounds = { x: [-(HALF - 0.6), HALF - 0.6], z: [1.3, WALK_END] };
walk.areas = [{ x: [-(HALL_HALF - 1.1), HALL_HALF - 1.1], z: [1.3, 15.7] }, walk.areas[1], { x: [-(HALF - 0.6), HALF - 0.6], z: [16.5, WALK_END] }];
w.camera.bounds = { x: [-(HALF + 1), HALF + 1], y: [0.6, 16], z: [-1.5, END + 2] };
w.statues.arhats = [
  { src: '/models/statues/arhat-seated.glb', height: 1.5 },
  { src: '/models/statues/arhat-stone.glb', height: 1.75, ry: 3.1416 },
  { src: '/models/statues/arhat-budai.glb', height: 1.3 },
  { src: '/models/statues/arhat-meditate.glb', height: 1.35 },
  { src: '/models/statues/arhat-monk-black.glb', height: 1.3, finish: 'bronze' },
  { src: '/models/statues/arhat-cti-2.glb', height: 2.0, ry: 1.5708 },
  { src: '/models/statues/arhat-cti-3.glb', height: 2.0, ry: 1.5708 },
  { src: '/models/statues/arhat-jizo-halo.glb', height: 1.8 },
  { src: '/models/statues/arhat-jizo-lotus.glb', height: 1.8 },
  { src: '/models/statues/arhat-jizo-bib.glb', height: 1.05 },
  { src: '/models/statues/arhat-kasa-1.glb', height: 1.8 },
  { src: '/models/statues/arhat-kasa-2.glb', height: 1.8 },
  { src: '/models/statues/arhat-kasa-3.glb', height: 1.8 },
];
delete w.statues.buddha;
w.statues.shrine = [
  { id: 'amitabha', src: '/models/statues/amitabha.glb', x: 0, z: -2, height: 4.6, throne: { lotus: false }, replaces: 'buddha' },
  { id: 'dia-tang', src: '/models/statues/dia-tang.glb', x: -4.5, z: -2.1, height: 3.5, throne: true, finish: 'bronze' },
  { id: 'quan-am', src: '/models/statues/quan-am.glb', x: 4.5, z: -2.1, height: 3.3, throne: { lotus: false } },
];
// Hộ pháp đứng ngoài hiên hai bên cửa, nhìn ra sân.
w.statues.guardians = [
  { src: '/models/statues/guardian-a.glb', x: -3.9, z: 17.7, ry: 0, height: 2.1, finish: 'bronze' },
  { src: '/models/statues/guardian-b.glb', x: 3.9, z: 17.7, ry: 0, height: 2.1, finish: 'bronze' },
];
delete w.statues.arhat;
w.statues.credits = 'A Di Đà: "Amitabha Buddha", Quan Âm: "Guan Yin Bodhisattva" — AmitabhaNZ (CC BY). Tượng Địa Tạng: "Ksitigarbha Bodhisattva - Statue" — kieuvantruong060194 (CC BY). Hộ pháp: Cleveland Museum of Art, Guardian Figure: Nio (CC0). La Hán — CC0: Mia, Wirtualne Muzea Małopolski (Figure of seated arhat with a vase), Mia (10th C BCE Chinese monk); CC BY: nate_sid (Monk Statue, Kek Lok Si), ThomasRedfern12 (Budai Statue - Low Poly), gtmkf123 (Seated Buddhist monk in orange robe), local.yany (Monk Statues), pierreparfait01 (Ksitigarbha / Ojizo-Sama, Kasa Jizō), manoworks (Jizo Bosatsu statue), fusion (Jizo statue in Kyoto - MTSU Animation). Quan Âm: Mia (CC0). Qua Sketchfab';
writeFileSync(file, `${JSON.stringify(scene, null, 2)}\n`);
console.log(`Đã ghi ${file}: ${c.arhats.length} La Hán, ${walk.obstacles.length} vật cản.`);
