# Seat editor

Công cụ nội bộ để đặt ghế trên ảnh nền và xuất `scene.json`. Chạy `npm run dev` rồi mở `http://localhost:3000/tools/seat-editor/`.

- **Mở**: tải `scenes/<id>/scene.json` cùng ảnh nền.
- **Mở rộng layout**: đổi `seatLayout` (công thức) thành danh sách ghế để chỉnh từng ghế.
- Bấm chỗ trống để thêm ghế với hàng và tỷ lệ đang chọn; bấm ghế để chọn, kéo để di chuyển, mũi tên để chỉnh 1 px (Shift: 10 px), Delete để xóa.
- Khung chữ nhật quanh mỗi ghế là chiều cao người ngồi (`characters.height × scale`): dùng để canh tỷ lệ cho khớp tranh.
- **Đánh số lại**: S-1 ở hàng xa nhất, bên trái, giống engine. Cinema phải giữ đúng S-1…S-100 vì server kiểm tra id ghế.
- **Kiểm tra + xuất JSON**: chạy `validateScene` và in JSON; **Tải scene.json** để lưu đè vào `scenes/<id>/`.

Quy trình đầy đủ khi thêm cảnh: skill `add-scene`.
