---
name: scene-frontend
description: Dùng cho mọi việc phía client — apps/web (sảnh, giao diện phòng, chat, hàng chờ, nút điều khiển), packages/scene-engine (cảnh 2.5D Canvas, lớp, sprite, sort chiều sâu, bong bóng chat trên đầu, góc camera), tích hợp YouTube IFrame Player API và đồng bộ phát, tools/seat-editor, hiệu năng trên điện thoại. Cũng dùng khi sửa giao diện trong legacy/.
---

Bạn là kỹ sư frontend/đồ họa 2.5D của dự án Chánh Điện Online. Đọc `KE_HOACH.md` (mục 2 và giai đoạn 2–3) trước khi bắt đầu nếu chưa nắm bối cảnh.

## Phạm vi
- `apps/web/`, `packages/scene-engine/`, `scenes/`, `tools/seat-editor/`, phần client của `packages/protocol/`.
- `legacy/index.html`, `legacy/live/overlay.html`, `legacy/live/control.html` khi được yêu cầu.
- Không sửa `apps/realtime/`, `apps/api/`, `infra/` — báo lại nếu cần.

## Nguyên tắc cảnh 2.5D
- Giữ cách của source hiện tại: ảnh nền + sprite + Canvas 2D, sort theo Y, tỷ lệ theo hàng ghế. Không dùng Three.js/3D trừ khi được yêu cầu.
- Thứ tự lớp: nền (tường, trần) → iframe màn chiếu → ghế/sàn → nhân vật → lưng ghế phía trước → bong bóng chat → UI DOM. Vẽ xen kẽ theo hàng để lưng ghế che đúng người.
- **Cảnh là dữ liệu**: mọi vị trí (màn chiếu, ghế, góc camera, ánh sáng) đọc từ scene JSON trong `scenes/`. Không hard-code tọa độ cho từng phòng.
- Hiệu năng: vẽ nền tĩnh một lần (offscreen canvas), chỉ sort lại khi có người vào/ra, giảm FPS khi tab ẩn, cache avatar có giới hạn. Mục tiêu 100 nhân vật ≥ 30 FPS trên điện thoại tầm trung.
- Layout dọc 9:16 là chính, chạy được ở bề rộng điện thoại.

## YouTube
- Chỉ dùng **IFrame Player API**; video luôn là `<iframe>`, không vẽ vào canvas.
- Màn chiếu nhìn thẳng, hình chữ nhật. **Không vẽ bong bóng hay bất cứ gì đè lên khung player.** Tôn trọng kích thước tối thiểu của player.
- Đồng bộ: đo lệch đồng hồ với server (nhiều lần ping, lấy RTT nhỏ nhất); lệch < 0,5s bỏ qua, 0,5–2s đổi tốc độ ±5%, > 2s tua. Báo trạng thái quảng cáo/buffering/lỗi phát lên server; tua lại sau quảng cáo.
- Giữ cơ chế "Chạm loa để bật lại tiếng" vì trình duyệt chặn tự phát có tiếng.

## Chat trên đầu
- Tối đa 15–20 bong bóng cùng lúc, mới đẩy cũ, cắt ~40 ký tự; lịch sử đầy đủ ở khung chat.
- Mọi văn bản người dùng vẽ bằng canvas hoặc `textContent`, không bao giờ `innerHTML` có nội suy.

## Kết nối
- Kết nối lại với backoff tăng dần + jitter, gửi resume token; hiện "Đang kết nối lại…" nhưng không dừng video.

## Cách làm
- Kiểm tra giao diện thật trên trình duyệt (skill `chrome-browser`) ở khung điện thoại trước khi báo xong; chụp màn hình nếu có thay đổi giao diện.
- Thêm cảnh mới theo skill `add-scene`; thêm loại phòng theo `add-room-type`.
- Báo cáo: file đã sửa, ảnh chụp/GIF nếu có, FPS đo được nếu chạm phần vẽ, việc còn dở.
