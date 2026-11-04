---
name: run-local
description: Chạy dự án Chánh Điện Online trên máy để xem thay đổi — bật các dịch vụ cần thiết, tạo dữ liệu mẫu và mở trình duyệt ở khung điện thoại 9:16. Dùng khi cần chạy app, chụp màn hình hoặc kiểm tra thay đổi trong app thật.
---

# Chạy dự án trên máy

Xác định bản đang có trong repo rồi làm theo phần tương ứng.

## A. Nền tảng mới (khi đã có `apps/`)

1. Đọc script thật trong `package.json`; không đoán lệnh chưa tồn tại.
2. Cài phụ thuộc ở root nếu chưa có `node_modules`: `npm ci`.
3. Nếu có `infra/docker-compose.dev.yml` và app đã dùng Redis/Postgres, kiểm tra Docker rồi bật đúng service. Ở khung giai đoạn 0 chưa dùng dữ liệu thì bỏ qua.
4. Chạy `npm run dev`. Khi room actor/failover đã tồn tại, chạy thêm máy realtime thứ hai ở cổng khác theo script trong repo.
5. Đợi web `:3000`, API health `:4000/health`, realtime health `:4001/health` trả kết quả.
6. Mở web ở trình duyệt, khung khoảng 390×844. Chỉ mở tab thứ hai khi app đã có phòng nhiều người.

Lệnh chính xác lấy từ `package.json` ở root và `infra/`. Nếu thiếu script, báo lại thay vì tự đoán cấu hình.

## B. Bản legacy (`legacy/`)

- Web tĩnh: phục vụ thư mục `legacy/` bằng static server, mở `legacy/index.html`.
- Bộ LIVE:
  ```bash
  cd legacy/live && npm ci && npm start
  ```
  - Bảng điều khiển: `http://localhost:3000/live/control.html`
  - Overlay: `http://localhost:3000/live/overlay.html` (bấm **Bật âm thanh** một lần)
  - Thử không cần TikTok: dùng **Thử tương tác**, **Đổ người mẫu** hoặc **Bot mô phỏng** trên bảng điều khiển.

## Khi xong
- Báo URL đã mở, ảnh chụp nếu kiểm tra giao diện, lỗi console nếu có.
- Ghi lại các tiến trình nền đã bật để tắt sau.
