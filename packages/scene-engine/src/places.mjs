// Nhận diện khu trong sân từ dữ liệu scene. Hàm thuần để giao diện nhập vai, bản đồ và test dùng chung,
// tránh hai nơi tự giữ một thứ tự ưu tiên khác nhau khi các vùng chồng mép cổng.

const inside = (area, point, pad = {}) => area
  && point.x >= area.x[0] + (pad.left || 0)
  && point.x <= area.x[1] + (pad.right || 0)
  && point.z >= area.z[0] + (pad.back || 0)
  && point.z <= area.z[1] + (pad.front || 0);

function fenceBounds(fence, padding) {
  const points = (fence || []).flatMap(([x0, z0, x1, z1]) => [[x0, z0], [x1, z1]]);
  if (!points.length) return null;
  return {
    x: [Math.min(...points.map(([x]) => x)) + padding.x[0], Math.max(...points.map(([x]) => x)) + padding.x[1]],
    z: [Math.min(...points.map(([, z]) => z)) + padding.z[0], Math.max(...points.map(([, z]) => z)) + padding.z[1]],
  };
}

export function placeExtras(world) {
  return {
    gardenBounds: fenceBounds(world?.courtyard?.garden?.fence, { x: [-2.8, 0.5], z: [-0.5, 0.5] }),
    memorialBounds: fenceBounds(world?.courtyard?.memorial?.fence, { x: [-0.5, 2.8], z: [-0.5, 0.5] }),
    fieldsArea: world?.courtyard?.fields?.area || null,
  };
}

export function placeOf(world, point, extras = placeExtras(world)) {
  if (!world || !point) return null;
  const hall = world.hall;
  if (hall && point.x >= -hall.halfWidth && point.x <= hall.halfWidth && point.z >= hall.back && point.z <= hall.front) return 'hall';
  if (inside(world.courtyard?.petZone?.area, point)) return 'pets';
  if (inside(world.courtyard?.farmZone?.area, point)) return 'farm';
  if (inside(world.courtyard?.park?.area, point, { left: -2 })) return 'park';
  // Tàng Kinh Các (khu Trí tuệ) góc đông bắc sân.
  if (inside(world.courtyard?.library?.area, point)) return 'library';

  // Vườn Hoa hình chữ L: xét từng khối, thiếu thì dùng khung bao; nới 2 m ra phía cổng đông.
  const garden = world.courtyard?.flowerGarden;
  const flowerAreas = garden?.areas || (garden?.area ? [garden.area] : []);
  if (flowerAreas.some((area) => inside(area, point, { right: 2 }))) return 'flowers';
  if (inside(extras.gardenBounds, point)) return 'garden';
  if (inside(extras.memorialBounds, point)) return 'memorial';
  if (inside(world.courtyard?.wishGarden?.area, point)) return 'wishes';

  // Ra khỏi cổng chính: lối đá và Đài ngắm cảnh.
  const overlook = world.courtyard?.overlook;
  if (overlook && point.z >= overlook.path.z[0]) return 'overlook';
  // Phước Điền nằm phía nam Rừng thiền nên phải xét trước Rừng thiền ở phần chồng mép.
  if (extras.fieldsArea && point.x <= extras.fieldsArea.x[1] + 0.5 && point.z >= extras.fieldsArea.z[0]) return 'myfarm';
  const grove = world.courtyard?.grove;
  if (grove && point.x <= grove.area.x[1]) return 'grove';
  return 'courtyard';
}

