# @chanh-dien/garden — Vườn Công Đức

50 luống trồng chung cho mọi phòng chánh điện, xu ảo trong chùa (không đổi ra tiền thật).

## Luật

| Việc | Ai làm được | Luật |
| --- | --- | --- |
| Xem vườn | mọi người (kể cả khách) | `GET /api/v1/garden` |
| Mua hạt | thành viên | Táo 10, Cam 15, Đào 20 xu/hạt; tối đa 20 hạt mỗi lần; ví mới được 50 xu khởi đầu |
| Gieo | thành viên | luống trống; tốn 1 hạt; người gieo trước chiếm luống cho vụ đó |
| Tưới | thành viên | lần đầu sau khi gieo được tưới ngay; các lần sau cách nhau đúng 8 giờ theo đồng hồ server; cây đã ra quả vẫn cần nước |
| Ra quả | tự động | đủ 3 lần tưới được tính → đúng 10 quả |
| Hái | chủ vụ: phần còn lại; người khác: tối đa 2 quả mỗi vụ | hết quả → luống trống |
| Bán quả | thành viên | Táo 5, Cam 7, Đào 10 xu/quả |
| Dâng quả | thành viên | ghi `fruit_offerings` |
| Héo | tự động | quá 24 giờ kể từ khi gieo/lần tưới gần nhất → cây héo nhưng không mất; tưới lại thì hồi phục |
| Hết hạn | tự động | quả chín để quá 7 ngày → `expired`, luống trống |
| Bot làm vườn | máy realtime (`POST /internal/garden/bot`, khóa nội bộ) | bot giữ tối đa 30% số luống (`BOT_PLOT_LIMIT` = 15); không dùng ví / hạt; chỉ tưới và hái luống của bot (hái hết quả); mỗi tên bot là một tài khoản `gbot-…` không đăng nhập được |

## Bảo đảm

- Mọi thao tác chạy trong `BEGIN IMMEDIATE`. Lỗi nghiệp vụ lùi về savepoint, nên không có thay đổi dở dang.
- Cơ sở dữ liệu tự chặn một vụ đang trồng mỗi luống (`crop_cycles_active_plot`); giao dịch `BEGIN IMMEDIATE`
  cùng `last_water_at` bảo đảm hai người tưới cùng lúc chỉ có một lần vượt mốc 8 giờ.
- Hái trừ có điều kiện (`fruits_left >= ?`), nên không bao giờ hái quá số quả còn.
- `coin_wallets.balance` và kho có `CHECK >= 0`.
- Thao tác kinh tế bắt buộc khóa idempotency (`Idempotency-Key`, 8–64 ký tự). Gửi lại cùng khóa thì nhận nguyên kết quả cũ (`replayed: true`), không trừ / cộng lần hai.
- Server tự tính số dư, chủ luống và ngày. Trường lạ do client gửi bị bỏ qua.
- Lịch sử vụ, tưới, hái, giao dịch xu, dâng quả được giữ để đối soát.

## Bảng

`garden_meta` (phiên bản schema), `garden_plots`, `crop_cycles`, `crop_watering_events`, `crop_harvest_events`, `seed_inventory`, `fruit_inventory`, `coin_wallets`, `coin_transactions`, `fruit_offerings`, `garden_requests` (khóa idempotency).

Migration chạy tự động khi mở store, theo `garden_meta.schema_version`; bản 2 thêm `crop_cycles.last_water_at` và bỏ khóa tưới theo ngày; bản cuối dựng lại `garden_plots` cho 50 luống (tắt khóa ngoại trong lúc đổi, vụ cũ giữ nguyên số luống). Các bảng nằm chung file SQLite với tài khoản (`.data/app.db`) và có khóa ngoại tới `accounts(id)`.
