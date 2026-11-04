# Load test

Chỉ chạy bằng mock trên môi trường test theo skill `load-test`. Không nhắm vào bản online hay dịch vụ bên thứ ba.

## Sức chứa một phòng (`room-capacity.mjs`)

Đo một phòng Thiền trên **một** máy realtime: tự bật một máy realtime riêng (cổng 4511, không bot, danh bạ trong bộ
nhớ, sức chứa phòng nâng lên 5.000 để tìm giới hạn thật; `maxWalkers` giữ theo room rules), rồi tăng dần số người giả
trong cùng một phòng. Người giả nói đúng protocol: vé → WebSocket → `hello` → `move`; sau đó 30 % đang đi (5 tin
`move`/giây), chat 1 tin/30 giây, quỳ/đứng 1 lần/phút, ping 5 giây/lần. Không cần cài thêm gì (dùng `ws`).

```bash
node loadtest/room-capacity.mjs                        # mốc 20 → 2000, giữ 30 giây mỗi mốc
node loadtest/room-capacity.mjs 100,200,500 --hold 20  # mốc tự chọn
LOADTEST_WALKING=0.6 LOADTEST_CHAT_MS=10000 node loadtest/room-capacity.mjs   # phòng sôi động hơn
```

Một mốc **đạt** khi: chat p95 < 300 ms, ping p95 < 300 ms, vào phòng thành công ≥ 99,9 %, CPU máy realtime < 70 %
của một nhân, event loop p99 < 100 ms, không rớt kết nối. Kết quả chi tiết ghi vào `loadtest/results/` (không commit).

Giới hạn của cách đo: client giả và server chạy chung một máy, mạng là localhost (không có độ trễ mạng thật); không
đo được điện thoại vẽ bao nhiêu nhân vật thì còn mượt — cột "mỗi máy kbps" và "tin/giây/máy" là tải mạng mỗi điện
thoại phải nhận.

Kịch bản k6 cho các mốc 1.000 / 10.000 / 100.000 kết nối nhiều phòng sẽ thêm sau.

### Kết quả trên máy dev (MacBook M1 Pro, 03/11/2026)

Client giả và server chạy chung máy (đang mở Chrome, tải máy ~6), mạng localhost. 30 % đang đi, chat 1 tin/30 giây.

| Người trong một phòng | Trước (gửi cả danh sách cho mọi người) | Sau (chánh điện / sân riêng, mỗi máy nhận 40–60 người gần nhất) |
| --- | --- | --- |
| 300 | đạt; chat p95 68 ms; vào phòng 2,9 s | đạt; chat p95 14 ms; CPU 14 %; vào phòng 0,1 s |
| 500 | **không đạt**: chat p95 475 ms, CPU 69 %, vào phòng 7,9 s, 1,5 Mbps mỗi máy | **đạt**: chat p95 46 ms, CPU 24 %, vào phòng 0,15 s, 177 kbps mỗi máy |
| 750 | sập ở ~600 (11 % không vào được) | không đạt: event loop p99 124 ms, vào phòng 5,2 s (vượt sức chứa 500 nên thực tế không xảy ra) |
