// Sinh bố cục vườn chùa (world.courtyard + world.walk) cho scenes/thien-default: chạy `node scripts/thien-garden-layout.mjs`
// ở gốc repo. Vật cản đi lại tính từ vị trí vật thể nên sửa bố cục ở đây rồi chạy lại (chạy nhiều lần cho cùng kết quả).
import { readFileSync, writeFileSync } from 'node:fs';
import { THIEN_GARDEN, THIEN_MEMORIAL } from '@chanh-dien/room-rules';
import { flowerLayout, insidePolygon, polylineDistance } from '../packages/scene-engine/src/flower-layout.mjs';
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
// Sân rộng 104 m (mở thêm 16 m mỗi bên cho khu tưởng niệm phía tây và bãi cỏ phía đông).
const HALF = 52, END = 100, GATE = 98.6;
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
  { x: [THIEN_MEMORIAL.fence.x[1], -1.8], z: [THIEN_MEMORIAL.gate.z - 0.6, THIEN_MEMORIAL.gate.z + 0.6] }, // lối đá tới Khu tưởng niệm
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
  // Giai đoạn công trình Hồ Sen: nước và cá luôn có; lau sậy (Dẫn nước), bờ đá, sen, rồi đủ đàn cá + đèn hoa đăng.
  stageVisibility: { water: 0, reeds: 1, rocks: 2, lotus: 3, fish: 0, floats: 4 },
  // Hai đèn đá Meshy bên bờ (nam và tây bắc), quay mặt vào hồ.
  lanterns: [{ x: -12.5, z: 71.7, ry: -0.7 }, { x: -27.1, z: 88, ry: 2.4 }],
};
c.benches = [
  { x: -6.4, z: 74.5, ry: -1.5708 }, { x: -6.4, z: 85.5, ry: -1.5708 },
  { x: 6.2, z: 77.5, ry: -1.5708 }, { x: 6.2, z: 82.5, ry: -1.5708 },
  { x: -15, z: 46.2, ry: 0 }, { x: 15, z: 46.2, ry: 0 },
].map((item, index) => ({ id: `B-${index + 1}`, ...item, scale: 0.72, seats: 2 }));
// Khu vui chơi bên phải sân đá trước chánh điện: mô hình nhanvat/park.glb (nén + cắt ghế xích đu bằng
// scripts/park-model.mjs) phóng 1,25 lần, nền mô hình dày 0,25 m hạ xuống ngang mặt cỏ. Trong mô hình: 2 bộ xích đu
// (mỗi bộ 2 ghế), tháp có cầu tuột, đu quay, 2 thú nhún, khung leo, bụi cây. Xích đu / cầu tuột dùng chung cơ chế ghế
// đá (bench.select, B-7…B-9, mỗi món hai chỗ) nên người chơi và bot "ngồi" như ghế; engine (park3d.mjs) đu ghế, cho
// leo – trượt – đi vòng lại. Số đo dưới đây là tọa độ trong mô hình (m, trước khi phóng), đo từ park.glb.
const PARK_MODEL = { src: '/models/park/park.glb', x: 23, z: 30.9, ry: 0, scale: 1.25, sink: 0.25, half: 5.88, lazyDistance: 20 };
const PS = PARK_MODEL.scale;
const parkPoint = (mx, mz) => {
  const ry = PARK_MODEL.ry;
  return {
    x: Math.round((PARK_MODEL.x + (mx * Math.cos(ry) + mz * Math.sin(ry)) * PS) * 1000) / 1000,
    z: Math.round((PARK_MODEL.z + (-mx * Math.sin(ry) + mz * Math.cos(ry)) * PS) * 1000) / 1000,
  };
};
const round3 = (value) => Math.round(value * 1000) / 1000;
// Độ cao trong mô hình (tính từ mặt nền cam) → độ cao thật.
const parkY = (y) => round3(y * PS);
// Bộ xích đu: tâm cặp ghế (mx, mz), nửa khoảng cách hai ghế; xà cao 2,25 m, mặt ghế 0,58 m (tính từ đáy mô hình).
const parkSwing = (id, mx, half) => {
  const at = parkPoint(mx, -4.07);
  const pivotY = parkY(2.25 - PARK_MODEL.sink);
  return {
    id, kind: 'swing', ...at, ry: PARK_MODEL.ry, scale: 1, seats: 2,
    pivotY, rope: round3(pivotY - parkY(0.55 - PARK_MODEL.sink)), seatX: round3(half * PS), seatWidth: 0.68,
    approach: [0, round3(1.85 * PS)], pick: [round3(2.6 * PS), 2.8, round3(1.9 * PS), 0],
  };
};
// Cầu tuột: neo ở (3,0; 1,5) trong mô hình; leo thang phía tây tháp, ngồi trên sàn, trượt theo máng vàng xuống +z,
// đi vòng phía tây về chân thang. Điểm [mx, mz, y] trong mô hình → local của món (m thật).
const SLIDE_ANCHOR = [3.0, 1.5];
const slideLocal = ([mx, mz, y]) => [round3((mx - SLIDE_ANCHOR[0]) * PS), round3((mz - SLIDE_ANCHOR[1]) * PS), ...(y === undefined ? [] : [parkY(y)])];
const PARK_SLIDE = {
  climb: [[1.0, -0.95, 0], [1.15, 0.35, 0], [2.35, 0.35, 1.3]],
  deck: [3.0, 0.65, 1.3],
  chute: [[3.0, 1.05, 1.4], [3.0, 1.5, 1.33], [3.0, 2.0, 1.0], [3.0, 2.5, 0.6], [3.0, 3.0, 0.27], [3.0, 3.4, 0.08], [3.0, 3.7, 0.05]],
  back: [[3.0, 4.15], [1.8, 3.95], [1.05, 1.3], [1.0, -0.95]],
};
c.park = {
  sign: 'KHU VUI CHƠI',
  area: { x: [round3(PARK_MODEL.x - PARK_MODEL.half * PS), round3(PARK_MODEL.x + PARK_MODEL.half * PS)], z: [round3(PARK_MODEL.z - PARK_MODEL.half * PS), round3(PARK_MODEL.z + PARK_MODEL.half * PS)] },
  signPost: { x: round3(PARK_MODEL.x - PARK_MODEL.half * PS - 0.7), z: PARK_MODEL.z, ry: -1.5708 },
  // Hạ nền mô hình xuống ngang mặt cỏ, cao hơn 1,5 cm để không nhấp nháy với cỏ.
  model: { src: PARK_MODEL.src, x: PARK_MODEL.x, z: PARK_MODEL.z, ry: PARK_MODEL.ry, scale: PS, y: round3(-PARK_MODEL.sink * PS + 0.015), lazyDistance: PARK_MODEL.lazyDistance },
};
c.benches.push(
  parkSwing('B-7', -3.2, 0.345),
  parkSwing('B-8', 0.77, 0.41),
  {
    id: 'B-9', kind: 'slide', ...parkPoint(...SLIDE_ANCHOR), ry: PARK_MODEL.ry, scale: 1, seats: 2,
    approach: slideLocal([1.0, -0.95]).slice(0, 2),
    pick: [round3(2.0 * PS), 3.2, round3(5.4 * PS), round3(-0.3 * PS)],
    track: {
      climb: PARK_SLIDE.climb.map(slideLocal), deck: slideLocal(PARK_SLIDE.deck),
      chute: PARK_SLIDE.chute.map(slideLocal), back: PARK_SLIDE.back.map(slideLocal),
    },
  },
);
// Vật cản trong mô hình (tọa độ mô hình): khung xích đu (gồm vùng đu), tháp, cầu thang, thang leo, máng trượt, khung
// leo, đu quay, thú nhún, bụi cây. Viền nền thấp nên đi qua được.
const PARK_RECTS = [
  [-4.5, -1.85, -5.1, -3.0], [-1.15, 2.15, -5.1, -3.0],
  [2.3, 3.95, -0.35, 1.15], [2.55, 3.65, -1.5, -0.35], [1.3, 2.3, 0, 0.7], [2.45, 3.55, 1.15, 3.9], [3.3, 4.3, -2.9, -1.7],
];
const PARK_CIRCLES = [
  [-0.55, 0, 1.3], [-3.5, -0.72, 0.5], [-2.9, 2.8, 0.5], [3.82, -3.2, 0.55], [4.69, -4.79, 0.45],
  [-4.75, 4.45, 0.45], [-4.75, 4.96, 0.45], [-1.0, 4.85, 0.45], [-0.4, 4.75, 0.45], [4.75, 4.24, 0.45], [4.75, 4.96, 0.45],
];
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
  // Mô hình Meshy chỉ thay lớp cảnh tĩnh cổng + quầy; luống, cây động, vùng chạm và luật vườn vẫn do engine/API giữ.
  // GLB có gốc ở tâm nên y nâng đáy mô hình về đúng mặt cỏ.
  model: { src: '/models/garden/garden-entrance.glb', x: 12.35, y: 2.02, z: 68.35, ry: -1.5708, scale: 2.22, lazyDistance: 24 },
  // Vùng chạm nằm ở gian nhỏ bên phải mô hình, chừa trống điểm đi nhanh (10.8, 68) trước cửa.
  shop: { x: 10.85, z: 70.35, ry: -1.5708 },
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
// Khu tưởng niệm (dải sân mở rộng phía tây): 36 ô mộ trong hàng rào đá thấp, cổng cạnh đông, lư hương nhỏ cạnh cổng.
// Mộ do người chơi đắp (API) nên scene chỉ khai báo ô; engine vẽ nấm mộ + bia theo dữ liệu server.
const MEMORIAL_FENCE = THIEN_MEMORIAL.fence;
const MEMORIAL_GATE = THIEN_MEMORIAL.gate;
c.memorial = {
  sign: 'KHU TƯỞNG NIỆM',
  entrance: { x: MEMORIAL_FENCE.x[1], z: MEMORIAL_GATE.z, ry: 1.5708, width: MEMORIAL_GATE.width },
  mound: THIEN_MEMORIAL.mound,
  graves: THIEN_MEMORIAL.graves.map(({ id, x, z }) => ({ id, x, z })),
  // Lư hương đá ngoài cổng (thắp hương tưởng niệm, trang trí).
  burner: { x: MEMORIAL_FENCE.x[1] + 1.6, z: MEMORIAL_GATE.z + 2.6 },
  fence: [
    [MEMORIAL_FENCE.x[0], MEMORIAL_FENCE.z[0], MEMORIAL_FENCE.x[1], MEMORIAL_FENCE.z[0]],
    [MEMORIAL_FENCE.x[1], MEMORIAL_FENCE.z[0], MEMORIAL_FENCE.x[1], MEMORIAL_GATE.z - MEMORIAL_GATE.width / 2],
    [MEMORIAL_FENCE.x[1], MEMORIAL_GATE.z + MEMORIAL_GATE.width / 2, MEMORIAL_FENCE.x[1], MEMORIAL_FENCE.z[1]],
    [MEMORIAL_FENCE.x[1], MEMORIAL_FENCE.z[1], MEMORIAL_FENCE.x[0], MEMORIAL_FENCE.z[1]],
    [MEMORIAL_FENCE.x[0], MEMORIAL_FENCE.z[1], MEMORIAL_FENCE.x[0], MEMORIAL_FENCE.z[0]],
  ],
};
// Khu thú cưng phía sau bên phải: có cổng mở về lối giữa, đồ chơi và sáu chó mèo có tên riêng.
const PET_FENCE = { x: [7.2, 34], z: [77, 97] };
const PET_GATE = { z: 86.5, width: 3.2 };
// Lối nối sang Nông trại nhỏ ở hàng rào phía đông (cùng z với cổng tây của nông trại).
const PET_FARM_GATE = { z: 88, width: 2.6 };
c.petZone = {
  sign: 'KHU VUI CHƠI THÚ CƯNG',
  area: PET_FENCE,
  entrance: { x: PET_FENCE.x[0], z: PET_GATE.z, ry: -1.5708, width: PET_GATE.width },
  fence: [
    [PET_FENCE.x[0], PET_FENCE.z[0], PET_FENCE.x[1], PET_FENCE.z[0]],
    [PET_FENCE.x[1], PET_FENCE.z[0], PET_FENCE.x[1], PET_FARM_GATE.z - PET_FARM_GATE.width / 2],
    [PET_FENCE.x[1], PET_FARM_GATE.z + PET_FARM_GATE.width / 2, PET_FENCE.x[1], PET_FENCE.z[1]],
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
// Vườn Hoa (bãi cỏ phía tây sân trước, từ sát chánh điện tới Khu tưởng niệm): vườn kiểu tự nhiên hình chữ L, hàng rào
// cây xén bao quanh, ba cổng vòm hoa (đông: lối đá từ lối giữa; đông nam: từ sân trước chánh điện; bắc: tới Khu tưởng
// niệm). Bên trong là bãi cỏ, lối sỏi uốn cong (một vòng lớn + các nhánh vào quảng trường), luống hình tự do trồng dày theo
// từng mảng (thấp ở mép, cao ở giữa), quảng trường tròn có đình bát giác, bốn ghế đá (B-10…B-13), hồ súng nhỏ ở cánh
// bắc, cây hoa (anh đào, hoa sứ, mai vàng, bằng lăng), đèn vườn dọc lối và bướm bay. Hoa / cây là ảnh dựng từ mô hình
// Meshy (engine: flowers3d.mjs); hình học luống / lối dùng chung với engine qua flower-layout.mjs.
const FLOWER = { x: [-51, -15.5], z: [18, 54] };
const FLOWER_WING_X = -27; // cánh bắc (z 44–54) chỉ rộng tới x = −27, chừa chỗ cho cây bồ đề
const FLOWER_MAIN_Z = 44;
const FLOWER_CENTER = { x: -33, z: 31.5 };
const FLOWER_HEDGE = 0.6;
{
  const h = FLOWER_HEDGE / 2;
  const [x0, x1, z0, z1, wx, mz] = [FLOWER.x[0] + h, FLOWER.x[1] - h, FLOWER.z[0] + h, FLOWER.z[1] - h, FLOWER_WING_X + h, FLOWER_MAIN_Z - h];
  const outline = [[x0, z0], [x1, z0], [x1, mz], [wx, mz], [wx, z1], [x0, z1]];
  const entrances = [
    { x: x1, z: 40.75, ry: 1.5708, width: 2.8, arch: true },
    { x: -33, z: z1, ry: 0, width: 2.2, arch: true },
    { x: x1, z: 25, ry: 1.5708, width: 2.6, arch: true },
  ];
  // Hàng rào: các cạnh của outline, chừa khe ở cổng.
  const hedge = [];
  outline.forEach(([ax, az], index) => {
    const [bx, bz] = outline[(index + 1) % outline.length];
    const length = Math.hypot(bx - ax, bz - az);
    const cuts = entrances
      .map((gate) => ({ t: ((gate.x - ax) * (bx - ax) + (gate.z - az) * (bz - az)) / (length * length), gate }))
      .filter(({ t, gate }) => t > 0 && t < 1 && Math.hypot(ax + (bx - ax) * t - gate.x, az + (bz - az) * t - gate.z) < 0.05)
      .sort((a, b) => a.t - b.t);
    let from = 0;
    for (const { t, gate } of cuts) {
      const half = gate.width / 2 / length;
      hedge.push([ax + (bx - ax) * from, az + (bz - az) * from, ax + (bx - ax) * (t - half), az + (bz - az) * (t - half)].map(round3));
      from = t + half;
    }
    hedge.push([ax + (bx - ax) * from, az + (bz - az) * from, bx, bz].map(round3));
  });
  const { x: cx, z: cz } = FLOWER_CENTER;
  // Vòng lối lớn quanh quảng trường: elip hơi méo (10 điểm điều khiển).
  const loop = Array.from({ length: 10 }, (_, index) => {
    const angle = (index / 10) * Math.PI * 2;
    const wobble = 1 + 0.05 * Math.sin(angle * 3 + 1);
    return [round3(cx + Math.cos(angle) * 14 * wobble), round3(cz + Math.sin(angle) * 9.6 * wobble)];
  });
  const paths = [
    { points: loop, width: 2.0, closed: true },
    { points: [[x1, 40.75], [-19.5, 39.6], [-24, 37.6], [-28.3, 34.5]], width: 2.2 }, // cổng đông → quảng trường
    { points: [[x1, 25], [-19.5, 25.6], [-24, 27.2], [-28.6, 29.3]], width: 2.0 }, // cổng đông nam → quảng trường
    { points: [[cx, cz + 4.9], [-33.3, 40], [-32.6, 45], [-33.4, 49.5], [-33, z1]], width: 1.8 }, // quảng trường → cổng bắc
    { points: [[cx - 4.9, cz], [-42, 32.2], [-47.2, 31.5]], width: 1.6 }, // nhánh tây
    { points: [[-33.2, 46.5], [-37, 45.5], [-41.5, 45.3], [-46, 46.2], [-47.6, 49]], width: 1.4 }, // dạo quanh hồ súng
  ];
  const pond = { x: -41, z: 49.4, rx: 4.3, rz: 2.3, lilies: 9 };
  // Luống: mỗi vùng một bộ cây (edge = mép thấp, mid = giữa, back = trong cùng / sát rào); viền được khoét theo lối đi.
  const bed = (x, z, rx, rz, ry, seed, mix) => ({ x, z, rx, rz, ry, seed, mix });
  const beds = [
    bed(-27, 36.5, 7, 5, 0.4, 1, { edge: ['tulip', 'mum'], mid: ['tulip'], back: ['tulip', 'lily'] }),
    bed(-40, 37, 7.5, 5, -0.4, 2, { edge: ['tulip', 'lavender'], mid: ['rose', 'tulip', 'lavender'], back: ['peony', 'rose'] }),
    bed(-40, 26, 7.5, 5, 0.4, 3, { edge: ['tulip', 'mum'], mid: ['hydrangea', 'tulip', 'lily'], back: ['hydrangea'] }),
    bed(-26.5, 26, 7.5, 5, -0.4, 4, { edge: ['tulip', 'marigold'], mid: ['cosmos', 'tulip'], back: ['sunflower', 'cosmos'] }),
    bed(-33, 19.8, 17, 2.4, 0, 5, { edge: ['tulip', 'marigold', 'cosmos'], mid: ['tulip', 'delphinium', 'cosmos'], back: ['sunflower', 'delphinium'] }),
    bed(-49.3, 31, 2, 12, 0, 6, { edge: ['lavender', 'tulip'], mid: ['delphinium', 'grass'], back: ['grass', 'delphinium'] }),
    bed(-18, 32, 3.6, 11, 0, 7, { edge: ['tulip', 'marigold'], mid: ['tulip', 'hibiscus'], back: ['hibiscus', 'grass'] }),
    bed(-41, 43, 7, 2.2, 0, 8, { edge: ['tulip', 'mum'], mid: ['lily', 'tulip', 'hydrangea'], back: ['hydrangea'] }),
    bed(-47.5, 50.5, 3, 3.5, 0.3, 9, { edge: ['tulip', 'mum'], mid: ['delphinium', 'tulip'], back: ['grass', 'delphinium'] }),
    bed(-29.8, 48.8, 2.8, 5, 0, 10, { edge: ['tulip', 'marigold'], mid: ['peony', 'tulip', 'hydrangea'], back: ['hydrangea'] }),
    bed(-21.5, 42.6, 5, 1.3, 0, 11, { edge: ['tulip', 'mum'], mid: ['rose', 'tulip'], back: ['rose'] }),
    bed(-36.5, 51.6, 2.6, 1.6, 0, 12, { edge: ['tulip'], mid: ['lily', 'tulip'], back: ['lily'] }),
    bed(-46.5, 22, 4, 3, 0.5, 13, { edge: ['tulip', 'mum'], mid: ['lavender', 'tulip'], back: ['grass', 'lavender'] }),
    bed(-46.5, 42.5, 3.5, 2.5, -0.5, 14, { edge: ['tulip', 'mum'], mid: ['delphinium', 'peony', 'tulip'], back: ['delphinium'] }),
    bed(-20.5, 40.5, 4.5, 2.2, 0.3, 15, { edge: ['tulip', 'mum'], mid: ['peony', 'rose', 'tulip'], back: ['hibiscus'] }),
  ];
  // Cây hoa: kind = cherry (anh đào), frangipani (hoa sứ), apricot (mai vàng), crape (bằng lăng).
  const trees = [
    { x: -28.5, z: 25, size: 1.0, kind: 'cherry' },
    { x: -41.5, z: 27.5, size: 1.05, kind: 'cherry' },
    { x: -46.6, z: 52.3, size: 0.95, kind: 'cherry' },
    { x: -23, z: 42.6, size: 0.95, kind: 'frangipani' },
    { x: -40.5, z: 36, size: 1.0, kind: 'frangipani' },
    { x: -18, z: 21.2, size: 0.9, kind: 'apricot' },
    { x: -48.6, z: 20.6, size: 0.95, kind: 'apricot' },
    { x: -49.4, z: 40.5, size: 1.05, kind: 'crape' },
    { x: -18.5, z: 42.6, size: 1.0, kind: 'crape' },
    { x: -29.4, z: 51.6, size: 0.95, kind: 'crape' },
  ];
  const garden = { outline, paths, beds, center: FLOWER_CENTER, plaza: { radius: 5.2 }, pond, trees, lamps: [] };
  const layout = flowerLayout(garden);
  // Đèn vườn dọc lối: mỗi ~7 m một cây, so le hai bên, đứng trên mép cỏ (không chắn lối, không đè lên hồ / cây).
  const lamps = [];
  for (const path of layout.paths) {
    let walked = 0;
    let side = 1;
    for (let index = 1; index < path.points.length; index += 1) {
      const [ax, az] = path.points[index - 1];
      const [bx, bz] = path.points[index];
      walked += Math.hypot(bx - ax, bz - az);
      if (walked < 7) continue;
      walked = 0;
      const length = Math.hypot(bx - ax, bz - az) || 1;
      const off = path.width / 2 + 0.35;
      const lamp = { x: round3(bx - ((bz - az) / length) * off * side), z: round3(bz + ((bx - ax) / length) * off * side) };
      side = -side;
      const clear = layout.paths.every((other) => polylineDistance(lamp.x, lamp.z, other.points) > other.width / 2 + 0.25)
        && Math.hypot(lamp.x - cx, lamp.z - cz) > 5.6 && Math.hypot((lamp.x - pond.x) / pond.rx, (lamp.z - pond.z) / pond.rz) > 1.25
        && trees.every((tree) => Math.hypot(tree.x - lamp.x, tree.z - lamp.z) > 1.2)
        && insidePolygon(lamp.x, lamp.z, outline) && polylineDistance(lamp.x, lamp.z, outline, true) > 0.8
        && lamps.every((other) => Math.hypot(other.x - lamp.x, other.z - lamp.z) > 4);
      if (clear) lamps.push(lamp);
    }
  }
  // Ghế đá B-10…B-13: đặt ở mép luống ven lối, mặt nhìn vào luống (ry: hướng mặt người ngồi là (sin ry, cos ry)), lưng
  // quay ra lối. Khi ngồi, camera đứng sau lưng BENCH_CAMERA m, cao ~2,7 m (scene camera.follow): chỗ đó phải thoáng
  // (không vào đình, không vướng tán cây, còn trong vườn), không thì người ngồi chỉ thấy cột / mái đình. Dò mọi điểm dọc
  // lối, chấm điểm theo lượng hoa + cây hoa trong tầm nhìn phía trước, chọn 4 chỗ tốt nhất cách xa nhau.
  const BENCH_CAMERA = 3.8;
  const benchCandidates = [];
  const segmentDistance = (px, pz, ax, az, bx, bz) => {
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(px - ax - dx * t, pz - az - dz * t);
  };
  for (const path of layout.paths) {
    for (let index = 2; index < path.points.length - 2; index += 2) {
      const [ax, az] = path.points[index - 1];
      const [bx, bz] = path.points[index + 1];
      const [px, pz] = path.points[index];
      const length = Math.hypot(bx - ax, bz - az) || 1;
      const normal = [-(bz - az) / length, (bx - ax) / length];
      for (const side of [1, -1]) {
        const fx = normal[0] * side;
        const fz = normal[1] * side;
        // Lưng ghế cách mép lối ~0,15 m.
        const off = path.width / 2 + 0.6;
        const x = px + fx * off;
        const z = pz + fz * off;
        const camX = x - fx * BENCH_CAMERA;
        const camZ = z - fz * BENCH_CAMERA;
        const lookX = x + fx * 5;
        const lookZ = z + fz * 5;
        const ok = insidePolygon(x, z, outline) && polylineDistance(x, z, outline, true) > 1.2
          && layout.bedAt(x + fx * 1.2, z + fz * 1.2) >= 0 && layout.depth(x + fx * 1.6, z + fz * 1.6, layout.bedAt(x + fx * 1.2, z + fz * 1.2)) > 0.5
          && layout.paths.every((other) => polylineDistance(x, z, other.points) > other.width / 2 + 0.4)
          && Math.hypot(x - cx, z - cz) > 6.5
          && entrances.every((gate) => Math.hypot(gate.x - x, gate.z - z) > 4.5)
          && Math.hypot((x - pond.x) / (pond.rx + 1), (z - pond.z) / (pond.rz + 1)) > 1
          && trees.every((tree) => Math.hypot(tree.x - x, tree.z - z) > 1.6)
          // Camera sau lưng: trong vườn, xa đình, không vướng tán cây trên đường nhìn tới hoa.
          && insidePolygon(camX, camZ, outline) && polylineDistance(camX, camZ, outline, true) > 0.5
          && segmentDistance(cx, cz, camX, camZ, lookX, lookZ) > 4.2
          && trees.every((tree) => segmentDistance(tree.x, tree.z, camX, camZ, lookX, lookZ) > 1.7 * (tree.size || 1));
        if (!ok) continue;
        // Điểm nhìn: hoa trong hình quạt ±40° phía trước (2–10 m), cây hoa nở trong tầm mắt cộng thêm.
        let score = 0;
        for (let distance = 1.5; distance <= 10; distance += 0.5) {
          for (let angle = -0.7; angle <= 0.7; angle += 0.1) {
            const dirX = fx * Math.cos(angle) - fz * Math.sin(angle);
            const dirZ = fx * Math.sin(angle) + fz * Math.cos(angle);
            if (layout.bedAt(x + dirX * distance, z + dirZ * distance) >= 0) score += distance < 5 ? 1.5 : 1;
          }
        }
        for (const tree of trees) {
          const dx = tree.x - x;
          const dz = tree.z - z;
          const along = dx * fx + dz * fz;
          if (along > 3 && along < 11 && Math.abs(dx * fz - dz * fx) < along * 0.7) score += 25;
        }
        benchCandidates.push({ x, z, ry: Math.atan2(fx, fz), score });
      }
    }
  }
  benchCandidates.sort((a, b) => b.score - a.score);
  const benches = [];
  for (const spot of benchCandidates) {
    if (benches.length === 4) break;
    if (benches.some((other) => Math.hypot(other.x - spot.x, other.z - spot.z) < 9)) continue;
    benches.push(spot);
  }
  if (benches.length < 4) throw new Error(`Vườn Hoa: chỉ tìm được ${benches.length} chỗ đặt ghế nhìn ra hoa`);
  // Bot đi tới điểm sau lưng ghế (trên lối) rồi mới ngồi; luống tự chừa chỗ quanh ghế (flower-layout.mjs: benches).
  benches.splice(0, 4, ...benches.map((spot, index) => ({
    id: `B-${10 + index}`, x: round3(spot.x), z: round3(spot.z), ry: round3(spot.ry), scale: 0.72, seats: 2, approach: [0, -1.1],
  })));
  for (const tree of trees) {
    const near = layout.paths.find((path) => polylineDistance(tree.x, tree.z, path.points) < path.width / 2 + 0.8);
    if (near) throw new Error(`Cây ${tree.kind} (${tree.x}, ${tree.z}) đứng quá sát lối đi`);
  }
  // Điểm ngắm (bot đi dạo dừng lại nhìn hoa): mỗi ~5 m trên các lối, nhìn về luống gần nhất.
  const bedCenters = beds.map((item, index) => {
    // Điểm sâu nhất của phần trồng được (luống bị lối khoét cong thì tâm elip có thể nằm trên lối).
    let best = null;
    for (let x = item.x - item.rx * 1.2; x <= item.x + item.rx * 1.2; x += 0.25) {
      for (let z = item.z - item.rz * 1.2; z <= item.z + item.rz * 1.2; z += 0.25) {
        if (layout.bedAt(x, z) !== index) continue;
        const depth = layout.depth(x, z, index);
        if (!best || depth > best.depth) best = { x: round3(x), z: round3(z), depth };
      }
    }
    return best;
  });
  const views = [];
  for (const path of layout.paths) {
    let walked = 5;
    for (let index = 1; index < path.points.length; index += 1) {
      const [ax, az] = path.points[index - 1];
      const [bx, bz] = path.points[index];
      walked += Math.hypot(bx - ax, bz - az);
      if (walked < 5) continue;
      if (Math.hypot(bx - cx, bz - cz) < 6 || !insidePolygon(bx, bz, outline) || polylineDistance(bx, bz, outline, true) < 1.4) continue;
      const face = bedCenters.filter(Boolean).map((item) => ({ ...item, d: Math.hypot(item.x - bx, item.z - bz) })).sort((a, b) => a.d - b.d)[0];
      if (!face || face.d > 8) continue;
      walked = 0;
      views.push({ x: round3(bx), z: round3(bz), face: { x: face.x, z: face.z } });
    }
  }
  c.flowerGarden = {
    sign: 'VƯỜN HOA',
    area: FLOWER,
    areas: [{ x: FLOWER.x, z: [FLOWER.z[0], FLOWER_MAIN_Z] }, { x: [FLOWER.x[0], FLOWER_WING_X], z: [FLOWER_MAIN_Z, FLOWER.z[1]] }],
    center: FLOWER_CENTER,
    outline,
    hedge,
    hedgeHeight: 0.95,
    entrances,
    paths,
    beds,
    bedCenters: bedCenters.map((item) => item && { x: item.x, z: item.z }),
    plaza: { radius: 5.2 },
    pavilion: { radius: 2.3, height: 3.1 },
    pond,
    trees,
    lamps,
    // Ghế trong vườn (chép từ c.benches B-10…B-13): luống chừa chỗ quanh ghế, không trồng hoa đè lên.
    benches: benches.map(({ x, z, ry }) => ({ x, z, ry })),
    butterflies: 40,
    lazyDistance: 42,
    views,
  };
  c.benches.push(...benches);
}
c.paths.push(
  { x: [FLOWER.x[1], -1.8], z: [40.15, 41.35] }, // lối đá từ lối giữa vào cổng đông Vườn Hoa
  { x: [FLOWER.x[1], -12], z: [24.4, 25.6] }, // sân trước chánh điện → cổng đông nam
  { x: [-33.6, -32.4], z: [FLOWER.z[1], THIEN_MEMORIAL.gate.z - 0.6] }, // Vườn Hoa → Khu tưởng niệm
);
c.trees = [{ x: 8.6, z: 21, size: 1.3 }, { x: 33.5, z: 54.5, size: 1.0 }, { x: 13, z: 93, size: 1.0 }];
// Dải sân mới hai bên: tùng dọc tường, cây lớn và bụi cây trên bãi cỏ phía đông.
c.trees.push({ x: 44, z: 34, size: 1.15 }, { x: 43, z: 66, size: 1.1 }, { x: 44, z: 90, size: 1.2 });
c.pines = [[-8.6, 20], [-9, 27], [9, 28.5], [31, 22], [-31, 59.5], [31, 40], [-15, 95], [21, 95], [-32, 94],
  [49, 22], [49, 50], [49, 78], [38, 97]];
c.bushes = [[-13.2, 22.5], [-10.6, 23.5], [10.6, 25], [-10.6, 30], [10.6, 31.5], [13.4, 22], [33, 30], [16, 79], [33, 79], [-6.5, 92], [9, 60],
  [40, 46], [38, 60], [40, 80], [47, 64]];
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
// Nông trại nhỏ (dải cỏ phía đông khu thú cưng): thỏ, vịt, dê con, heo con, nai sao, ngựa con (mô hình Meshy,
// nhanvat/farm/<loài>.glb → /models/pets/farm-<loài>.glb). Cổng chính mở về bãi cỏ phía nam, cổng tây nối thẳng với
// khu thú cưng. Khớp THIEN_RULES.world.farmArea (đứng trong khu này mới tương tác được với thú).
const FARM = { x: [36, 50.8], z: [60, 97] };
const FARM_SOUTH_GATE = { x: 43.4, width: 3.2 };
const FARM_WEST_GATE = { z: PET_FARM_GATE.z, width: PET_FARM_GATE.width };
const FARM_ROAM = { x: [FARM.x[0] + 1, FARM.x[1] - 1], z: [FARM.z[0] + 1, FARM.z[1] - 1] };
c.farmZone = {
  sign: 'NÔNG TRẠI NHỎ',
  area: FARM,
  entrance: { x: FARM_SOUTH_GATE.x, z: FARM.z[0], ry: 3.1416, width: FARM_SOUTH_GATE.width },
  fence: [
    [FARM.x[0], FARM.z[0], FARM_SOUTH_GATE.x - FARM_SOUTH_GATE.width / 2, FARM.z[0]],
    [FARM_SOUTH_GATE.x + FARM_SOUTH_GATE.width / 2, FARM.z[0], FARM.x[1], FARM.z[0]],
    [FARM.x[1], FARM.z[0], FARM.x[1], FARM.z[1]],
    [FARM.x[1], FARM.z[1], FARM.x[0], FARM.z[1]],
    [FARM.x[0], FARM.z[1], FARM.x[0], FARM_WEST_GATE.z + FARM_WEST_GATE.width / 2],
    [FARM.x[0], FARM_WEST_GATE.z - FARM_WEST_GATE.width / 2, FARM.x[0], FARM.z[0]],
  ],
  props: [
    { type: 'barn', x: 46.6, z: 93.4, ry: 3.1416 },
    { type: 'trough', x: 38.4, z: 72, ry: 1.5708 },
    { type: 'hay', x: 48.9, z: 70.5, ry: 0.4 },
    { type: 'hay', x: 48.6, z: 72.4, ry: -0.3 },
    { type: 'hay', x: 38.2, z: 92.6, ry: 0.2 },
    { type: 'duckpond', x: 45.2, z: 80.5, ry: 0 },
    { type: 'duckhouse', x: 47.6, z: 83.2, ry: -2.42 },
  ],
};
// Cây bụi cũ nằm trong khu nông trại / trên hàng rào: bỏ (cây lớn 44, 90 giữ làm bóng mát).
const inFarm = (x, z, pad = 0.8) => x > FARM.x[0] - pad && x < FARM.x[1] + pad && z > FARM.z[0] - pad && z < FARM.z[1] + pad;
c.trees = c.trees.filter((t) => !inFarm(t.x, t.z) || (t.x === 44 && t.z === 90));
c.pines = c.pines.filter(([x, z]) => !inFarm(x, z));
c.bushes = c.bushes.filter(([x, z]) => !inFarm(x, z));
// height: chiều cao đứng (m); mô hình Meshy nhìn về +z nên modelRy 0.
const farmAnimal = (id, name, type, height, x, z) => ({ id, name, type, model: `/models/pets/farm-${type}.glb`, height, modelRy: 0, x, z, area: FARM_ROAM });
c.animals.push(
  farmAnimal('farm-rabbit-bong', 'Bông Gòn', 'rabbit', 0.36, 39.5, 66),
  farmAnimal('farm-rabbit-mochi', 'Mochi', 'rabbit', 0.34, 41.5, 69),
  farmAnimal('farm-duck-vang', 'Vịt Vàng', 'duck', 0.42, 43.5, 78),
  farmAnimal('farm-duck-bau', 'Vịt Bầu', 'duck', 0.4, 43.6, 83.8),
  farmAnimal('farm-goat-rau', 'Dê Râu', 'goat', 0.72, 46, 66),
  farmAnimal('farm-pig-un', 'Ủn Ỉn', 'pig', 0.5, 40.5, 85),
  farmAnimal('farm-deer-sao', 'Nai Sao', 'deer', 1.0, 44, 73),
  farmAnimal('farm-pony-gio', 'Ngựa Gió', 'pony', 1.25, 42.5, 90),
);
c.guideBoards = [
  ...(c.guideBoards || []).filter((item) => !['garden', 'pets'].includes(item.id)),
  // Bảng hướng dẫn đứng riêng bên trái cổng; Store nằm trong gian bên phải, không còn chồng vùng bấm / vòng sáng.
  { id: 'garden', x: 10.6, z: 64.65, ry: -1.5708, width: 2.2, height: 1.15, sign: 'HƯỚNG DẪN KHU VƯỜN' },
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
  circle(c.park.signPost.x, c.park.signPost.z, 0.35),
  // Hai Hộ pháp ngoài hiên, hai bên cửa chánh điện.
  circle(-3.9, 17.7, 0.75), circle(3.9, 17.7, 0.75),
  ...c.instruments.map((item) => circle(item.x, item.z, 0.8)),
  circle(c.bodhi.x, c.bodhi.z, 3.2),
  circle(c.guanyin.x, c.guanyin.z, 2.8),
  ...guanyinGardenObstacles,
  circle(c.fountain.x, c.fountain.z, 3),
  { x: c.pond.x, z: c.pond.z, rx: c.pond.radiusX + 0.45, rz: c.pond.radiusZ + 0.45 },
  ...c.pond.lanterns.map((item) => circle(item.x, item.z, 0.45)),
  // Ghế dài 2,2 m: elip đúng chiều ghế, không để lọt qua hai đầu. Bụi cây cũng là vật thể đặc thay vì chỉ trang trí.
  ...c.benches.filter((item) => !item.kind && !/^B-1\d$/.test(item.id)).map(benchObstacle),
  // Khu vui chơi: vật cản lấy theo mô hình (xích đu / cầu tuột nằm trong các khối này).
  ...PARK_RECTS.map(([x0, x1, z0, z1]) => {
    const center = parkPoint((x0 + x1) / 2, (z0 + z1) / 2);
    const turned = Math.abs(Math.sin(PARK_MODEL.ry)) > 0.5;
    const rx = round3(((x1 - x0) / 2) * PS);
    const rz = round3(((z1 - z0) / 2) * PS);
    return { ...center, rx: turned ? rz : rx, rz: turned ? rx : rz };
  }),
  ...PARK_CIRCLES.map(([mx, mz, r]) => circle(parkPoint(mx, mz).x, parkPoint(mx, mz).z, round3(r * PS))),
  ...c.planters.map((p) => circle(p.x, p.z, 0.55)),
  ...c.arhats.map((a) => circle(a.x, a.z, 1.0)),
  // Luống vườn (đi quanh, không giẫm lên), quầy hạt giống, hàng rào (chuỗi vật cản nhỏ dọc từng đoạn).
  // Luống trong một hàng sát nhau nên dùng hình chữ nhật đúng cỡ luống (đi giữa các hàng, không đi xuyên luống).
  ...c.garden.plots.map((plot) => ({ x: plot.x, z: plot.z, rx: c.garden.bed / 2 + 0.05, rz: c.garden.bed / 2 + 0.05 })),
  circle(c.garden.barrel.x, c.garden.barrel.z, 0.35),
  circle(c.garden.shop.x, c.garden.shop.z, 1.3),
  // Mộ: nấm đất + bia (hình chữ nhật đúng cỡ, bia ở đầu phía tây), lư hương ngoài cổng, hàng rào đá.
  ...c.memorial.graves.map((grave) => ({ x: grave.x - 0.1, z: grave.z, rx: c.memorial.mound.length / 2 + 0.2, rz: c.memorial.mound.width / 2 + 0.05 })),
  circle(c.memorial.burner.x, c.memorial.burner.z, 0.6),
  ...c.memorial.fence.flatMap(([x0, z0, x1, z1]) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(length / 0.5);
    return Array.from({ length: steps + 1 }, (_, index) => circle(
      Math.round((x0 + ((x1 - x0) * index) / steps) * 100) / 100,
      Math.round((z0 + ((z1 - z0) * index) / steps) * 100) / 100,
      0.25,
    ));
  }),
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
  // Nông trại nhỏ: hàng rào và chuồng, máng, cỏ khô, ao vịt.
  ...c.farmZone.fence.flatMap(([x0, z0, x1, z1]) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(length / 0.5);
    return Array.from({ length: steps + 1 }, (_, index) => circle(
      Math.round((x0 + ((x1 - x0) * index) / steps) * 100) / 100,
      Math.round((z0 + ((z1 - z0) * index) / steps) * 100) / 100,
      0.25,
    ));
  }),
  ...c.farmZone.props.flatMap((item) => {
    if (item.type === 'barn') return [{ x: item.x, z: item.z, rx: 2.3, rz: 1.8 }];
    if (item.type === 'trough') return [{ x: item.x, z: item.z, rx: 0.45, rz: 1.1 }];
    if (item.type === 'hay') return [circle(item.x, item.z, 0.6)];
    if (item.type === 'duckpond') return [{ x: item.x, z: item.z, rx: 1.9, rz: 1.5 }];
    if (item.type === 'duckhouse') return [circle(item.x, item.z, 0.75)];
    return [];
  }),
  ...c.petZone.props.flatMap((item) => {
    if (item.type === 'house') return [{ x: item.x, z: item.z, rx: 1.35, rz: 1.05 }];
    if (item.type === 'tunnel') return [{ x: item.x, z: item.z, rx: 1.25, rz: 0.7 }];
    if (item.type === 'seesaw') return [{ x: item.x, z: item.z, rx: 0.38, rz: 1.5 }];
    return [];
  }),
  // Vườn Hoa: hàng rào cây xén (chuỗi vật cản), luống (lưới vòng tròn 1 m phủ phần trồng được), hồ súng, cột đình, đèn,
  // cây hoa, ghế quảng trường (ghế xoay chéo: hai vòng nhỏ dọc thân ghế thay cho elip thẳng trục). Bãi cỏ và lối sỏi đi được.
  ...c.flowerGarden.hedge.flatMap(([x0, z0, x1, z1]) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(length / 0.55);
    return Array.from({ length: steps + 1 }, (_, index) => circle(
      Math.round((x0 + ((x1 - x0) * index) / steps) * 100) / 100,
      Math.round((z0 + ((z1 - z0) * index) / steps) * 100) / 100,
      0.34,
    ));
  }),
  ...(() => {
    const layout = flowerLayout(c.flowerGarden);
    const points = [];
    const { area } = c.flowerGarden;
    for (let x = Math.ceil(area.x[0]); x <= area.x[1]; x += 1) {
      for (let z = Math.ceil(area.z[0]); z <= area.z[1]; z += 1) {
        const bed = layout.bedAt(x, z);
        if (bed >= 0 && layout.depth(x, z, bed) >= 0.3) points.push(circle(x, z, 0.55));
      }
    }
    return points;
  })(),
  { x: c.flowerGarden.pond.x, z: c.flowerGarden.pond.z, rx: round3(c.flowerGarden.pond.rx + 0.2), rz: round3(c.flowerGarden.pond.rz + 0.2) },
  ...Array.from({ length: 8 }, (_, index) => {
    const angle = ((index + 0.5) / 8) * Math.PI * 2;
    const { x, z } = c.flowerGarden.center;
    return circle(round3(x + Math.cos(angle) * c.flowerGarden.pavilion.radius), round3(z + Math.sin(angle) * c.flowerGarden.pavilion.radius), 0.24);
  }),
  ...c.flowerGarden.lamps.map((lamp) => circle(lamp.x, lamp.z, 0.2)),
  ...c.flowerGarden.trees.map((tree) => circle(tree.x, tree.z, round3(0.45 * (tree.size || 1)))),
  ...c.benches.filter((item) => /^B-1\d$/.test(item.id)).flatMap((item) => [-0.4, 0.4].map((lx) => {
    const point = localPoint(item, lx, 0);
    return circle(round3(point.x), round3(point.z), 0.42);
  })),
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
  { id: 'dia-tang', src: '/models/statues/dia-tang.glb', x: -4.5, z: -2.1, height: 3.5, throne: true, finish: 'bronze' },
  { id: 'quan-am', src: '/models/statues/quan-am.glb', x: 4.5, z: -2.1, height: 3.3, throne: { lotus: false } },
];
// Hộ pháp đứng ngoài hiên hai bên cửa, nhìn ra sân.
w.statues.guardians = [
  { src: '/models/statues/guardian-a.glb', x: -3.9, z: 17.7, ry: 0, height: 2.1, finish: 'bronze' },
  { src: '/models/statues/guardian-b.glb', x: 3.9, z: 17.7, ry: 0, height: 2.1, finish: 'bronze' },
];
delete w.statues.arhat;
w.statues.credits = 'Quan Âm: "Guan Yin Bodhisattva" — AmitabhaNZ (CC BY). Tượng Địa Tạng: "Ksitigarbha Bodhisattva - Statue" — kieuvantruong060194 (CC BY). Hộ pháp: Cleveland Museum of Art, Guardian Figure: Nio (CC0). La Hán — CC0: Mia, Wirtualne Muzea Małopolski (Figure of seated arhat with a vase), Mia (10th C BCE Chinese monk); CC BY: nate_sid (Monk Statue, Kek Lok Si), ThomasRedfern12 (Budai Statue - Low Poly), gtmkf123 (Seated Buddhist monk in orange robe), local.yany (Monk Statues), pierreparfait01 (Ksitigarbha / Ojizo-Sama, Kasa Jizō), manoworks (Jizo Bosatsu statue), fusion (Jizo statue in Kyoto - MTSU Animation). Quan Âm: Mia (CC0). Qua Sketchfab';
writeFileSync(file, `${JSON.stringify(scene, null, 2)}\n`);
console.log(`Đã ghi ${file}: ${c.arhats.length} La Hán, ${walk.obstacles.length} vật cản.`);
