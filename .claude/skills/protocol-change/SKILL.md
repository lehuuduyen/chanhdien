---
name: protocol-change
description: Quy trình thêm hoặc sửa message giữa client và server (WebSocket/API) trong packages/protocol — cập nhật schema, version, cả hai phía, test tương thích. Dùng mỗi khi thêm sự kiện mới, đổi trường, hoặc đổi ý nghĩa một message.
---

# Thay đổi protocol

`packages/protocol` là hợp đồng giữa client và server (và giữa các agent làm hai phía). Mọi message phải đi qua đây; không định nghĩa message "tạm" trong `apps/`.

## 1. Thiết kế
- Ghi rõ: tên message, chiều (client→server / server→client), ai được gửi (vai trò), trường và kiểu, giới hạn độ dài/tần suất.
- Message server→client mang `epoch` của phòng.
- Ưu tiên **thêm trường tùy chọn** thay vì đổi/xóa trường. Đổi không tương thích ngược thì tăng version chính và giữ xử lý version cũ trong thời gian chuyển tiếp (client cũ có thể còn kết nối khi deploy).

## 2. Cập nhật schema
- Sửa schema và kiểu trong `packages/protocol`, tăng version.
- Validate chặt: kiểu rõ ràng, không ép kiểu ngầm, cắt độ dài văn bản, từ chối trường lạ nếu không cần.

## 3. Cập nhật hai phía
- Server: validate đầu vào bằng schema, kiểm tra quyền theo vai trò, áp rate limit cho message mới.
- Client: xử lý message mới và bỏ qua an toàn message không biết.
- Nếu message ảnh hưởng snapshot (`state`), cập nhật cả snapshot để người vào sau/nối lại nhận đúng trạng thái.

## 4. Test
- Test schema: hợp lệ, sai kiểu, thiếu trường, quá dài, vai trò không đủ quyền.
- Test tương thích: client version cũ với server mới (và ngược lại nếu cần).
- Chạy toàn bộ test của `apps/realtime`, `apps/api`, `apps/web`.

## 5. Ghi lại
Cập nhật bảng message trong tài liệu protocol (README của `packages/protocol`) và nêu thay đổi trong mô tả PR.
