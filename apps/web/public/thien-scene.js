// Scene chứa tối đa 20 vị trí thiết kế. Số bồ đoàn đang hoạt động lấy từ room rules để đổi một cấu hình là
// cả client 2D, client 3D và realtime cùng đổi theo.
export function limitThienScene(scene, count) {
  const seats = (scene.seats || []).slice(0, count);
  const ids = new Set(seats.map((seat) => seat.id));
  return {
    ...scene,
    seats,
    ...(scene.world ? { world: { ...scene.world, seats: (scene.world.seats || []).filter((seat) => ids.has(seat.id)) } } : {}),
  };
}
