---
name: youtube-sync-check
description: Kiểm tra đồng bộ phát video YouTube giữa nhiều client trong một phòng — đo độ lệch, thử vào giữa bài, tạm dừng/tiếp tục, quảng cáo, buffering, video cấm nhúng hoặc giới hạn tuổi. Dùng sau khi sửa phần phát video, hàng chờ, hoặc đồng bộ đồng hồ.
---

# Kiểm tra đồng bộ YouTube

## Chuẩn bị
- Chạy `run-local`. Mở cùng một phòng Cinema ở **ít nhất 3 tab** (thêm một tab giả lập mạng chậm nếu được).
- Mỗi client cần ghi log (console hoặc overlay debug): `serverOffset`, `expectedTime`, `player.getCurrentTime()`, độ lệch, hành động sửa lệch (bỏ qua/đổi tốc độ/tua).

Chỉ dùng video công khai cho phép nhúng; đừng spam API YouTube — dùng cache metadata.

## Kịch bản
| # | Kịch bản | Đạt khi |
| --- | --- | --- |
| 1 | Cả 3 tab vào trước khi bài bắt đầu | Lệch ≤ 0,5s sau 10s |
| 2 | Một tab vào giữa bài | Tua đúng vị trí, lệch ≤ 1s sau 5s |
| 3 | Chủ phòng tạm dừng rồi tiếp tục (phòng Private) | Mọi tab dừng/tiếp cùng lúc, lệch ≤ 1s |
| 4 | Một tab bị buffering (throttle mạng) | Tab đó đuổi kịp bằng đổi tốc độ hoặc tua, không kéo cả phòng chậm theo |
| 5 | Quảng cáo ở một tab (nếu gặp) | Sau quảng cáo tua về giờ chung; server nhận trạng thái quảng cáo |
| 6 | Đổi giờ máy client lệch vài phút | Vẫn đồng bộ (dùng offset server, không dùng giờ máy) |
| 7 | Gửi video cấm nhúng / giới hạn tuổi / không tồn tại | Bị từ chối khi gửi, thông báo rõ |
| 8 | Video lọt kiểm tra nhưng nhiều client báo lỗi phát | Phòng tự bỏ qua bài |
| 9 | Hết bài | Mọi tab chuyển bài tiếp theo trong hàng chờ cùng lúc |
| 10 | Máy realtime giữ phòng bị tắt giữa bài | Video không dừng; sau khi nối lại vẫn đồng bộ |

## Kiểm tra giao diện
- Không có bong bóng chat hay phần tử nào đè lên khung player.
- Nút "Chạm loa để bật lại tiếng" xuất hiện khi trình duyệt chặn tiếng.

## Báo cáo
Bảng kết quả theo kịch bản với độ lệch đo được (trung bình, tối đa), log hoặc ảnh làm bằng chứng, và lỗi tìm thấy.
