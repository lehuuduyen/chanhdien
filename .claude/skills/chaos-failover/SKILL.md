---
name: chaos-failover
description: Kiểm tra phòng tự hồi sinh khi máy realtime chết — tắt máy, cắt mạng rồi cho sống lại, đo thời gian hồi phục, kiểm tra ghế, playback, epoch và sổ quà. Dùng sau khi sửa lease/epoch/snapshot/kết nối lại, hoặc trong load test giai đoạn 5.
---

# Chaos test failover

Chỉ chạy trên môi trường dev/test. Không tắt máy ở môi trường thật.

## Chuẩn bị
- Ít nhất 2 máy realtime (`run-local` bật sẵn 2), Redis, Postgres.
- Tạo vài phòng có người (client giả hoặc tab trình duyệt), có video đang phát, có người đang chat, có quà đang gửi.
- Ghi lại trước khi phá: máy giữ từng phòng, epoch, danh sách ghế, video và vị trí.

## Kịch bản
| # | Hành động | Đạt khi |
| --- | --- | --- |
| 1 | `kill -9` máy đang giữ phòng | Phòng được máy khác nhận trong ≤ 20s; epoch tăng; người dùng về đúng ghế; video không dừng ở client |
| 2 | Cắt mạng máy giữ phòng 15s rồi nối lại | Máy cũ phát hiện mất lease và tự đóng phòng; không có hai máy cùng phát cho một phòng; client bỏ qua message epoch cũ |
| 3 | Tắt máy trong lúc đang gửi quà | Mỗi quà ghi sổ đúng một lần (idempotency), không mất, không nhân đôi |
| 4 | Xóa/làm hỏng snapshot của một phòng | Người dùng được chuyển sang phòng cùng loại; nhóm Private/cặp Dating đi cùng nhau; có thông báo |
| 5 | Tắt máy khi đang có nhiều phòng (≥ 1.000 client) | Kết nối lại rải theo thời gian (jitter), máy nhận phòng không quá tải |
| 6 | Một phòng ném exception liên tục | Chỉ phòng đó bị đóng; các phòng khác trên cùng máy không bị ảnh hưởng |

## Đo
Thời gian từ lúc phá đến khi phòng nhận chat lại, tỷ lệ người về đúng ghế, số tin chat bị mất, đối soát sổ quà trước/sau, CPU máy nhận phòng.

## Báo cáo
Bảng kết quả theo kịch bản, số liệu đo, log quan trọng (đổi chủ, epoch) và lỗi tìm thấy.
