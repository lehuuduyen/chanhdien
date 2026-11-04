---
name: add-scene
description: Quy trình thêm hoặc sửa cảnh 2.5D cho một phòng — ảnh nền, tách lớp lưng ghế, nén WebP kèm hash, đặt ghế bằng seat-editor, xuất scene JSON, kiểm tra hợp lệ và xem thử. Dùng khi tạo cảnh mới, thay ảnh nền, hoặc chỉnh vị trí ghế/màn chiếu.
---

# Thêm cảnh 2.5D

Cảnh là dữ liệu trong `scenes/<sceneId>/`. Engine (`packages/scene-engine`) không chứa tọa độ riêng của cảnh nào.

## 1. Asset đầu vào
Cần có (hỏi người dùng nếu thiếu, không tự tạo ảnh thay):
- `bg` — ảnh nền đầy đủ: tường, trần, sàn, ghế. Khung chính 1080×1920 (dọc).
- `seatbacks` — PNG trong suốt chỉ có phần lưng ghế, cùng kích thước với `bg`, để vẽ đè lên nhân vật. Engine cắt ảnh thành dải theo từng hàng (`y − 64·scale` tới `y + 16·scale`), nên lưng ghế mỗi hàng phải nằm gọn trong dải của hàng đó. Không có ảnh thì dùng `{ "type": "procedural" }`. Định dạng đầy đủ: `scenes/README.md`.
- (tùy chọn) ảnh hiệu ứng ánh sáng, đồ trang trí tiền cảnh.

Ghi nguồn gốc ảnh (tự vẽ, AI — công cụ nào) để kiểm tra điều khoản sử dụng.

## 2. Xử lý ảnh
- Chuyển WebP; nền mục tiêu < ~1 MB tổng cho cả cảnh.
- Đặt tên kèm hash nội dung (`bg.<hash>.webp`) để CDN cache dài hạn mà không dính ảnh cũ.

## 3. Đặt ghế
- Mở `tools/seat-editor`, nạp `bg`.
- Đánh dấu khung màn chiếu: hình chữ nhật nhìn thẳng (iframe YouTube không nghiêng).
- Click từng ghế: `id`, `x`, `y`, `scale`, `row`, `zone`. Đánh dấu ghế đặc biệt (spotlight Dating, bồ đoàn hàng đầu Thiền).
- Khai báo vùng khán đài đứng (nếu có) và các góc camera: toàn cảnh, ghế của tôi, màn chiếu, khán giả.
- Bố cục ghế đều đặn có thể sinh bằng công thức phối cảnh thay vì click tay.

## 4. Scene JSON
Lưu `scenes/<sceneId>/scene.json` gồm: tên file asset, khung màn chiếu, danh sách ghế, vùng đứng, camera, ánh sáng/ambience. Chạy trình kiểm tra schema của scene-engine; sửa đến khi hợp lệ.

Kiểm tra thêm:
- Ghế không chồng nhau, sắp xếp `row` khớp chiều sâu (`y` tăng thì `scale` không giảm).
- Không ghế nào nằm trong khung màn chiếu; bong bóng chat của hàng trên cùng không đè lên màn chiếu.
- Số ghế khớp sức chứa khai báo trong `room-rules`.

## 5. Xem thử
- Chạy `run-local`, mở phòng dùng cảnh này ở khung điện thoại.
- Đổ 100 người mẫu: kiểm tra lưng ghế che đúng, kích thước nhân vật theo hàng, bong bóng không đè video, FPS ≥ 30.
- Chụp ảnh từng góc camera đính kèm báo cáo.
