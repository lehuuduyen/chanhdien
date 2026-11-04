---
name: load-test
description: Chạy load test WebSocket bằng k6 theo các mốc 1.000 / 10.000 / 100.000 kết nối, gồm kịch bản bão kết nối, thu số liệu, so với ngưỡng và xuất báo cáo. Dùng trước mỗi mốc phát hành hoặc sau thay đổi lớn ở realtime/hạ tầng.
---

# Load test

## Nguyên tắc an toàn
- **Chỉ chạy trên môi trường test** do người dùng chỉ định. Hỏi lại nếu không rõ đích. Không bao giờ nhắm vào môi trường thật hoặc dịch vụ bên thứ ba.
- YouTube và TTS phải dùng mock; client giả chỉ nói protocol, không mở player thật.
- Máy phát tải cần đủ mạnh và có thể cần nhiều máy cho mốc 100.000; báo trước chi phí nếu phải thuê máy.

## Kịch bản (trong `loadtest/`)
1. **steady** — vào phòng qua API, nối WebSocket, ngồi ghế, chat 1 tin/30s, thỉnh thoảng vote; giữ 10–15 phút.
2. **join-storm** — toàn bộ số người vào trong 1 phút (mở sự kiện).
3. **churn** — 10%/phút rời và vào lại.
4. **hot-room** — nhiều phòng đầy 500 người cùng lúc + chế độ Đại lễ (nếu đã có).

Phân bố người dùng: ~100 ngồi + phần còn lại khán đài mỗi phòng, theo tỷ lệ thật dự kiến.

## Các mốc
Chạy lần lượt 1.000 → 10.000 → 100.000. Dừng ở mốc chưa đạt, tìm nguyên nhân trước khi lên mốc tiếp.

## Số liệu cần thu
- Phía client giả: tỷ lệ kết nối thành công, thời gian vào phòng, độ trễ chat p50/p95/p99, số message nhận/giây, lỗi.
- Phía server: số kết nối và số phòng mỗi máy, CPU, RAM, event loop lag, sự kiện/giây, băng thông ra, Redis ops/giây và độ trễ.
- Load balancer: kết nối đồng thời, lỗi 5xx, kết nối bị cắt.

## Ngưỡng đạt
- Chat p95 < 300 ms, tỷ lệ kết nối thành công ≥ 99,9%.
- Không máy nào > 70% CPU ở trạng thái ổn định.
- join-storm: 100% vào được trong ≤ 2 phút, không máy nào sập.

## Báo cáo
- Bảng theo mốc: cấu hình (số máy, loại máy), số liệu, đạt/không đạt.
- Biểu đồ độ trễ và tài nguyên theo thời gian (skill `dataviz`).
- Điểm nghẽn tìm được và đề xuất. Báo đúng số liệu thật, kể cả khi chưa đạt.
