---
name: add-room-type
description: Checklist thêm một loại phòng mới (Cinema, Thiền, Music, phòng ngôn ngữ, Private, Dating…) vào nền tảng — cấu hình luật phòng, cảnh, bản dịch, luật nội dung, sảnh, test. Dùng khi tạo hoặc sửa định nghĩa một loại phòng.
---

# Thêm loại phòng

Một loại phòng = **cảnh + bố cục ghế + luật nội dung + ngôn ngữ + luật tương tác + mức kiểm duyệt**. Không viết engine riêng cho từng phòng; nếu cần hành vi mới, thêm thành tùy chọn cấu hình dùng chung.

## 1. Định nghĩa
Trước khi code, viết ra (trong PR hoặc hỏi người dùng nếu chưa rõ):
- Hoạt động chính của phòng, ai được làm gì.
- Sức chứa: số ghế có nhân vật, số khán đài, có chế độ sự kiện lớn không.
- Luật nội dung video (ví dụ Music: chỉ thể loại Music).
- Ngôn ngữ (`lang`) và giọng TTS nếu có.
- Luật tương tác: ai thêm vào hàng chờ, vote bỏ qua (ngưỡng %), quyền chủ phòng, ghế đặc biệt.
- Rủi ro an toàn riêng (Dating: 18+, đồng ý hai chiều).

## 2. Cấu hình
- Thêm cấu hình vào `packages/room-rules/` theo đúng schema hiện có; giá trị mặc định rõ ràng.
- Nếu cần message mới: làm theo skill `protocol-change`.
- Nếu cần cảnh mới: làm theo skill `add-scene`; nếu dùng lại cảnh có sẵn, chỉ tham chiếu `sceneId`.

## 3. Server (`realtime-backend`)
- Áp luật nội dung khi gửi video (kiểm tra ở API, cache theo `videoId`).
- Áp luật tương tác trong room actor; kiểm tra quyền phía server, không tin client.
- Sảnh: loại phòng xuất hiện, tự mở thêm phòng khi đầy.

## 4. Client (`scene-frontend`)
- Thẻ phòng ở sảnh: tên, video đang chiếu, online/ghế, ngôn ngữ.
- UI riêng (nếu có) bật theo cấu hình, không rẽ nhánh theo tên phòng.
- Bản dịch vi/en/es cho mọi chuỗi mới.

## 5. Kiểm tra
- Test luật nội dung (video hợp lệ/không hợp lệ), luật tương tác, sức chứa.
- Chạy `run-local`, vào phòng bằng 2 tab, kiểm tra giao diện khung điện thoại.
- Loại phòng có rủi ro an toàn hoặc chạm tiền: nhờ agent `trust-safety` rà soát.
- Cập nhật bảng phòng trong `KE_HOACH.md` mục 1 nếu là loại mới.
