---
name: deploy-drain
description: Quy trình deploy phiên bản mới cho máy realtime mà không làm rớt phòng — ngừng nhận phòng mới, chuyển hoặc đợi phòng, cập nhật, kiểm tra sức khỏe, làm lần lượt từng máy. Dùng khi phát hành bản mới của apps/realtime.
disable-model-invocation: true
---

# Deploy rút máy từ từ

Đây là thao tác trên hạ tầng thật: **xác nhận với người dùng trước khi bắt đầu** (môi trường nào, phiên bản nào), và dừng lại hỏi nếu bất kỳ bước kiểm tra nào không đạt.

## Trước khi deploy
- CI xanh trên commit cần deploy; protocol tương thích với client đang chạy (xem skill `protocol-change`).
- API và web deploy trước nếu chúng hiểu được cả protocol cũ và mới.
- Sức chứa còn dư đủ để gánh phòng của một máy đang rút (≥ 30%).
- Ghi lại số kết nối, số phòng, chỉ số lỗi hiện tại để so sánh.

## Lần lượt từng máy realtime
1. **Đánh dấu draining** trong danh bạ phòng: máy không nhận phòng mới.
2. **Chuyển phòng**: chuyển chủ động từng phòng sang máy khác (tăng epoch, snapshot mới nhất), hoặc đợi phòng hết người với thời hạn tối đa. Client nối lại có jitter.
3. Khi máy còn 0 phòng: dừng tiến trình, cập nhật phiên bản, khởi động.
4. **Health check**: kết nối, event loop lag, lỗi; mở lại cho nhận phòng.
5. Theo dõi vài phút: độ trễ chat, lỗi kết nối, số phòng. Ổn định mới sang máy tiếp theo.

Không rút nhiều máy cùng lúc trừ khi sức chứa dư cho phép và người dùng đồng ý.

## Quay lui
Nếu lỗi tăng hoặc độ trễ vượt ngưỡng: dừng rollout, rút máy mới về phiên bản cũ theo đúng quy trình trên, báo người dùng kèm số liệu.

## Báo cáo
Phiên bản, thứ tự máy, thời gian từng bước, số phòng chuyển, số liệu trước/sau, sự cố nếu có.
