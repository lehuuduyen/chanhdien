# Kế hoạch: Chánh Điện Online → nền tảng nhiều phòng xem chung

Ngày lập: 01/11/2026. Dựa trên [PHAN_TICH_SOURCE.md](PHAN_TICH_SOURCE.md) và các quyết định đã chốt trong buổi trao đổi thiết kế.

## 1. Mục tiêu

Biến dự án hiện tại (một chánh điện 2.5D, người xem mô phỏng hoặc từ TikTok LIVE) thành nền tảng web nhiều phòng, nơi người thật vào cùng xem, cùng ngồi, cùng chat. Mỗi loại phòng là một hoạt động:

| Phòng | Hoạt động | Ghi chú |
| --- | --- | --- |
| Cinema | Cùng xem video YouTube, chat hiện trên đầu nhân vật | Phòng đầu tiên, làm MVP |
| Thiền/Tụng kinh | Chánh điện hiện có: nhạc thiền, chuông, mõ, đọc kinh, hồi hướng | Giữ lại, chuyển sang engine mới |
| Music | Chỉ nội dung âm nhạc | Kiểm tra thể loại video khi gửi |
| English / Spanish / Vietnamese | Xem chung, bàn luận bằng một ngôn ngữ | Một mẫu "Phòng ngôn ngữ" có tham số `lang` |
| Dating | Khán phòng + 2 ghế ghép đôi | Làm sau cùng, cần lớp an toàn |
| Private | Nhóm bạn tự đặt luật | Vào bằng link mời |

### Quyết định đã chốt

- Video: **chỉ nhúng YouTube** (IFrame Player API). Không cho tải video lên.
- Cinema: **chat hiện bong bóng trên đầu nhân vật**, không vẽ đè lên khung video.
- **Giữ phòng Thiền/Tụng kinh.**
- Quy mô mục tiêu: **100.000 người online cùng lúc** trên toàn hệ thống.
- Cảnh dựng **2.5D** (ảnh nền + sprite + Canvas 2D) như source hiện tại, chưa làm 3D.

### Ngoài phạm vi giai đoạn đầu

Ứng dụng di động gốc, tải video lên, phát livestream của người dùng, thanh toán tiền thật (chờ chọn cổng thanh toán).

## 2. Kiến trúc mục tiêu (tóm tắt)

```
Client ─► Cloudflare (CDN, TLS, chống DDoS)
            ├─ asset tĩnh: HTML/JS, ảnh cảnh, sprite, nhạc, audio tụng kinh đọc sẵn
            ▼
       Nginx/HAProxy ── /api/*            ─► API (stateless, nhiều bản)
                     └─ /ws/{node}?room=  ─► máy realtime {node}
                                              ▲
                     Danh bạ phòng (API + Redis) quyết định phòng nào ở máy nào

Redis:    quyền giữ phòng (lease + epoch), snapshot phòng, presence, rate limit, chat gần đây
Postgres: người dùng, phòng private, sổ quà (ledger), báo cáo vi phạm
```

Nguyên tắc:

1. **Một phòng do đúng một máy realtime giữ.** Mọi người trong phòng nối vào cùng máy. State xử lý trong bộ nhớ như `server.mjs` hiện tại, chỉ đổi từ một phòng toàn cục sang `Map<roomId, Room>`.
2. **Không phòng nào quá ~500 kết nối.** Đổi ngày 02/11/2026 (chuyển sang game nhập vai, người dùng đồng ý): trong một phòng tối đa `maxWalkers` nhân vật đi lại tự do (room rules, đang để 200; người dùng muốn nhiều hơn 100, **con số cuối chốt bằng load test**), người vào sau xem như khán giả; ghế/bồ đoàn là điểm tương tác để ngồi. Đông thì mở thêm phòng cùng loại (PV1, PV2…). 100.000 người ⇒ vài trăm đến ~1.000 phòng. Đổi ngày 03/11/2026 (người dùng yêu cầu, sau load test một phòng sập ở ~600 người vì mỗi lần đổi người/ghế server gửi lại cả danh sách cho mọi người): phòng chánh điện nhận đủ 500 người, `maxWalkers` = 500; chánh điện và sân là hai vùng riêng, mỗi máy chỉ nhận và vẽ `view[vùng]` người gần nhất cùng vùng (đang để 60 trong điện, 40 ngoài sân) cộng người ngồi bồ đoàn/ghế đá; số người cả phòng (có tính bot, ghi rõ số bot) gửi riêng qua `room.count`. Sảnh mở phòng tiếp theo khi phòng đủ 500 người thật.
3. **Video không đi qua server.** Server chỉ phát `{videoId, startedAt, paused}`; client tự đồng bộ theo giờ server.
4. **Phòng tự hồi sinh khi máy chết:** lease Redis TTL 10 giây, snapshot 2–5 giây, epoch chống hai máy cùng giữ phòng, client nối lại có jitter và resume token giữ ghế 60 giây.
5. **Cảnh là dữ liệu:** mỗi cảnh là một file JSON (ảnh nền, lớp lưng ghế, vị trí màn chiếu, bản đồ ghế, góc camera; từ 02/11/2026 thêm `world.walk`: vùng đi được, vật cản, chỗ xuất hiện, tốc độ). Engine dùng chung.
6. **Đồng bộ di chuyển gom gói** (thêm 02/11/2026): client gửi `move` tối đa 5 lần/giây khi đang đi và một lần khi dừng (chạm để đi cũng gửi theo nhịp đó trên đường đi); server kiểm tra thô (vùng chữ nhật trong room rules, tốc độ tối đa, chống dịch chuyển tức thời), làm tròn 1 cm, gom mỗi 200 ms thành một `room.moves`. Động tác (`emote`: đứng, quỳ, lạy 3, lạy 108) là sự kiện. Va chạm chi tiết, tìm đường làm ở client theo `world.walk`.

### Cấu trúc thư mục đề xuất

```
apps/
  web/            # client: sảnh, phòng, scene engine, UI
  api/            # HTTP: auth khách, sảnh, join, gửi video, quà
  realtime/       # WebSocket: room actor, failover, rate limit
packages/
  protocol/       # schema message client↔server dùng chung, có version
  scene-engine/   # vẽ 2.5D: lớp, sprite, sort, bong bóng, camera
  room-rules/     # cấu hình từng loại phòng (luật nội dung, ghế, ngôn ngữ)
scenes/           # cinema/, thien/, music/, dating/… (JSON + ảnh WebP)
tools/
  seat-editor/    # trang nội bộ click ghế trên ảnh nền → xuất JSON
loadtest/         # kịch bản k6
infra/            # Docker, Nginx/HAProxy, CI, giám sát
legacy/           # index.html và live/ hiện tại, giữ để tham chiếu và chạy TikTok LIVE
```

## 3. Lộ trình

Kích thước công việc: S (vài ngày), M (1–2 tuần), L (2–4 tuần), với một người làm chính. Đây là ước lượng sơ bộ, cần chỉnh lại sau giai đoạn 0.

### Giai đoạn 0. Chuẩn bị nền móng (M)

- Viết `CLAUDE.md` (quy ước code, cách chạy, cấu trúc thư mục).
- Dựng cấu trúc monorepo như trên; chuyển code cũ vào `legacy/`, vẫn chạy được.
- Thiết lập lint, test runner, CI chạy test mỗi PR.
- Sửa các lỗi ưu tiên cao trong PHAN_TICH_SOURCE.md mục 6 cho bản legacy (ghế cố định, đua kết nối TikTok, hàng đợi TTS) nếu còn dùng TikTok LIVE.
- Định nghĩa `packages/protocol`: danh sách message, kiểu dữ liệu, version.

**Xong khi:** CI xanh, legacy chạy như cũ, protocol v1 được review.

**Tiến độ hiện tại:** phần code của giai đoạn 0 đã được dựng trên nhánh `codex/phase-0-foundation`:

- Monorepo, test runner, syntax check và workflow CI đã có; kiểm tra local đạt.
- Legacy đã chuyển vào `legacy/`, control/overlay chạy được và bốn lỗi ưu tiên cao đã được sửa.
- Protocol v1 có tài liệu, validator, quyền theo vai trò và test tương thích cơ bản.
- Agent/skill dùng chung cho Claude Code và Codex đã được cấu hình.
- Còn cần CI chạy trên remote sau khi người dùng yêu cầu commit/push, và kiểm tra TikTok/TTS với dịch vụ thật khi có phòng live phù hợp.

### Giai đoạn 1. Nền tảng nhiều phòng (L)

- API: tài khoản khách (token có chữ ký), sảnh, `POST /rooms/join` trả URL máy realtime + vé vào phòng.
- Realtime: `Map<roomId, Room>`, vào/ra phòng, chọn ghế, chat, presence; cách ly lỗi từng phòng (một phòng lỗi không làm sập máy).
- Danh bạ phòng trong Redis: lease + epoch, snapshot định kỳ.
- Client: kết nối lại với backoff + jitter, resume token.
- Rate limit theo người và theo phòng; giới hạn kích thước message.

**Xong khi:** 2 máy realtime chạy song song, 2 phòng ở 2 máy, `kill -9` một máy thì phòng hồi sinh ở máy kia và người dùng về đúng ghế.

**Tiến độ hiện tại:**

- Đã có: sảnh, cấu hình Cinema, API cấp vé khách ký số, WebSocket vào/rời phòng, chọn ghế độc quyền, presence, chat, rate limit cơ bản; client Cinema đã kiểm tra với hai tab.
- Đã có: giữ ghế 60 giây khi rớt mạng; client nối lại với backoff + jitter.
- Đã có: `packages/room-directory` (bản bộ nhớ và Redis cùng hợp đồng) với lease + epoch, snapshot có chặn ghi theo epoch, đăng ký máy realtime theo nhịp.
- Đã có: resume token có chữ ký nên máy nào cũng xác minh được; phòng mất lease tự đóng với mã 4002; rút máy (`SIGTERM`) lưu snapshot và trả lease ngay.
- Đã có: API `GET /api/v1/rooms/{id}/locate`; client hỏi lại máy giữ phòng mỗi lần nối lại; `npm run dev:cluster` chạy 2 máy realtime trên Redis.
- Đã có: rate limit theo người và theo phòng nằm trong phòng (phòng chỉ ở một máy nên không cần Redis; giới hạn của một người vẫn giữ khi nối lại), trần chat cả phòng 30 tin/giây; kết nối không gửi `hello` bị đóng sau 10 giây.
- Đã có: snapshot hỏng thì bỏ mục hỏng hoặc mở phòng trống; resume hết hạn trả `INVALID_RESUME_TOKEN` và client xin vé mới ngay; sảnh hiện số người lấy từ nhịp đăng ký của các máy realtime.
- Đã kiểm chứng: test failover trong bộ nhớ, bộ test danh bạ trên Redis 7.4 thật, và chaos e2e `kill -9` máy giữ phòng trên Redis thật: người dùng về đúng ghế ở máy kia sau 8–12 giây (epoch 1 → 2), với backoff client trần 4 giây ±50%.
- Chưa làm (chuyển sang giai đoạn sau): chuyển cả nhóm sang phòng cùng loại khi phòng hỏng cần nhiều phòng cùng loại (tự mở "Cinema #N", giai đoạn 3); chaos test có tải ≥ 1.000 client (giai đoạn 5); kiểm tra luồng nối lại trên trình duyệt thật.

### Giai đoạn 2. Scene engine 2.5D (M)

- Tách phần vẽ từ `legacy/index.html`/`legacy/live/overlay.html` thành `packages/scene-engine`.
- Hệ thống lớp: nền, iframe màn chiếu, ghế/sàn, nhân vật, lưng ghế, bong bóng, UI.
- Định dạng scene JSON và trình kiểm tra hợp lệ.
- Công cụ `tools/seat-editor`.
- Góc camera dựng sẵn: toàn cảnh, ghế của tôi, màn chiếu, khán giả.
- Tối ưu: vẽ nền tĩnh một lần, chỉ sort khi có người vào/ra, giảm FPS khi tab ẩn.
- Asset WebP, tên file kèm hash.

**Xong khi:** cảnh chánh điện và cảnh Cinema chạy chung một engine; 100 nhân vật ổn định ≥ 30 FPS trên điện thoại tầm trung.

**Tiến độ hiện tại:**

- Đã có: `packages/scene-engine` gồm phần thuần (kiểm tra scene JSON, sinh ghế phối cảnh, thứ tự lấp ghế, camera contain + chuyển đổi tọa độ, chọn ghế bằng chạm, bố trí bong bóng không đè màn chiếu và không đè nhau) và renderer Canvas cho trình duyệt.
- Đã có: nền tĩnh nằm ở canvas riêng, camera di chuyển bằng CSS transform; canvas chính chỉ vẽ người, lưng ghế xen kẽ theo hàng và bong bóng. Góc camera: toàn cảnh, ghế của tôi, màn chiếu, khán giả (chuyển mượt 320 ms, tắt khi người dùng chọn giảm chuyển động).
- Đã có: `scenes/cinema-default` (nền và lưng ghế vẽ bằng code, 100 ghế S-1…S-100 khớp room rules, khán giả dạng bóng người) và `scenes/thien-default` (ảnh `hall.jpg`, sprite và 20 bồ đoàn: 16 vị trí theo tranh + 4 vị trí mở rộng).
- Đã có: trang thử `/scene-demo.html` và công cụ đặt ghế `/tools/seat-editor/` (thêm/kéo/xóa ghế, kiểm tra hợp lệ, xuất JSON).
- Đã đo (Chrome trên Mac, canvas 2014×1308, trang mới tải, 60 khung): Cinema 100 người + 18 bong bóng 2,91 ms/khung; chánh điện 20 người 2,17 ms/khung. Trước khi tách lớp nền là 36,6 ms/khung.
- Chưa làm: đo trên điện thoại tầm trung thật (cần người dùng mở `/scene-demo.html?scene=cinema-default&n=100` trên máy); ảnh nền Cinema thật (đang vẽ bằng code); WebP + tên file kèm hash; animation đi vào/ngồi xuống của bản legacy; canh lại lưới bồ đoàn cho khớp tranh bằng công cụ đặt ghế; gắn cảnh vào trang phòng Cinema (đầu giai đoạn 3).

### Giai đoạn 3. Cinema MVP (L)

- Đồng bộ YouTube: đo lệch đồng hồ, sửa lệch (bỏ qua < 0,5s; đổi tốc độ 0,5–2s; tua > 2s), xử lý quảng cáo/buffering.
- Gửi video: kiểm tra nhúng được (oEmbed/Data API), cache metadata theo `videoId`, giới hạn số video mỗi người.
- Hàng chờ, vote bỏ qua (tỷ lệ cấu hình được, ví dụ 35%), tự bỏ bài khi nhiều client báo lỗi phát.
- Chat trên đầu: gom gửi 100–200 ms, tối đa 15–20 bong bóng cùng lúc, cắt ~40 ký tự, lịch sử đầy đủ ở khung chat.
- Kiểm duyệt cơ bản: lọc từ cấm và link, báo cáo, tắt tiếng người khác.
- Rà soát YouTube API Services Terms (không che player, kích thước tối thiểu).

**Xong khi:** 100 người thật trong một phòng xem cùng video, lệch ≤ 1 giây ngoài lúc quảng cáo, chat p95 < 300 ms.

**Tiến độ hiện tại (01/11/2026):**

- Đã có: protocol `queue.add`, `vote.skip`, `playback.report`, `playback.state`; server giữ bài đang chiếu, giờ bắt đầu theo giờ server, hàng chờ (50, mỗi người 3), kiểm tra video bằng oEmbed, vote bỏ qua và báo lỗi theo 35% người đang kết nối, tự chuyển bài theo thời lượng (trung vị cao của báo cáo), giữ bài và hàng chờ qua failover.
- Đã có: trang phòng Cinema dùng cảnh 2.5D (ngồi bằng cách bấm ghế, bong bóng chat trên đầu, 4 góc camera), YouTube IFrame đặt đúng khung màn chiếu, nút bật tiếng, đồng bộ theo giờ server (đo lệch giờ bằng ping/pong), hàng chờ và vote trên giao diện; xử lý livestream (không tua, không báo thời lượng).
- Đã kiểm tra qua link ngrok trên Chrome: vào rạp, chọn ghế trong cảnh, thêm video (từ chối link sai), video phát trong khung màn chiếu, bong bóng chat trên đầu.
- Chưa làm: đo độ lệch giữa nhiều máy thật (skill `youtube-sync-check`); bot lấp ghế có nhãn và vote chỉ tính người thật; ghế đôi/ba; tự mở "Cinema #N" khi đầy; lọc từ cấm/link trong chat, báo cáo, tắt tiếng người khác; rà soát YouTube API Services Terms. Trên màn máy tính thấp (khoảng 650 px), khung player ở góc toàn cảnh còn dưới 200 px chiều cao.

### Giai đoạn 4. Phòng Thiền/Tụng kinh trên engine mới (M)

- Chuyển cảnh, nhân vật, chuông, mõ, hương, hào quang, đèn lồng sang scene JSON.
- Đổi `msedge-tts` sang dịch vụ TTS chính thức; câu hồi hướng ghép từ mẫu đọc sẵn + tên, cache theo nội dung; bài tụng đọc sẵn trên CDN.
- Chuông/mõ phát kèm giờ server để mọi người nghe cùng nhịp.
- Chế độ Đại lễ: nhiều phòng con cùng nghe một buổi, bộ đếm tổng, banner quà lớn phát toàn bộ có giới hạn tần suất.

- Giữ các giới hạn đã áp cho bản legacy khi nhiều người tặng quà cùng lúc (01/11/2026): tối đa 140 cánh hoa và 12 hiệu ứng quà trên màn, màn thỉnh chuông lớn xếp hàng cách nhau 1,6 giây (tối đa 6 chờ), lời đọc xếp hàng tối đa 3 câu (6 với quà lớn hoặc quà của mình) thay vì hủy nhau, sprite thu nhỏ sẵn, nền là lớp riêng không vẽ lại mỗi khung, không dùng `backdrop-filter` trên canvas động. Đo trên Mac với 15 lần thỉnh chuông + 30 quà nhỏ cùng lúc: xử lý quà 42,5 → 8,3 ms, khung ngay sau đó 6,3 → 4,3 ms (chỉ phần CPU), cánh hoa 720 → 140.

**Xong khi:** phòng Thiền chạy nhiều người thật; không còn phụ thuộc dịch vụ TTS không chính thức.

**Tiến độ hiện tại (01/11/2026, ưu tiên trước Cinema theo yêu cầu):**

- Đã có: loại phòng `thien` trong room rules (scene tối đa 20 bồ đoàn, số hoạt động lấy từ `THIEN_RULES.seats`, hiện là 20; 6 hình nhân vật; lễ vật miễn phí có công đức 1/5/20/99 và không có thời gian chờ riêng), danh mục phòng dùng chung cho API và máy realtime (`thien-1`, `cinema-1`).
- Đã có: protocol `avatar.set`, `offering.send`, `offering`; người trong phòng có `skin` và `merit`, giữ qua nối lại và failover; phòng chánh điện từ chối lệnh video.
- Đã có: renderer có hiệu ứng lễ vật cấu hình trong scene JSON (sprite bay, cánh hoa, quầng sáng người dâng, hào quang tượng Phật khi thỉnh chuông, khói hương) với trần 140 cánh hoa / 12 hiệu ứng và sprite thu nhỏ sẵn.
- Đã có: trang `/chanh-dien.html` nhiều người thật trên engine mới; module dùng chung `realtime-session.js` (vé, nối lại, locate, đồng hồ server) và `temple-audio.js` (nhạc nền, chuông, mõ, tiếng lễ vật, lời đọc xếp hàng; mõ và chuông canh theo giờ server). Sảnh trỏ tới trang mới; `/thien/` (legacy) giữ cho bộ TikTok LIVE.
- Đã kiểm tra qua link ngrok với hai tab: cùng thấy nhau, thỉnh chuông/dâng hương/hoa sen/cánh sen phát cho cả phòng, bảng công đức cập nhật, bong bóng lời nhắn trên đầu, tự ngồi bồ đoàn gần bàn thờ.
- Đã sửa: scene nguồn có 16 bồ đoàn theo tranh và 4 vị trí mở rộng; client 2D/3D cắt danh sách theo `THIEN_RULES.seats`. Realtime dùng cùng giá trị để kiểm tra ghế và sức chứa.
- Đã có (01/11/2026): cổng chọn 50 tiểu bang + Washington, D.C. và bốn ngôn ngữ Việt/Anh/Trung/Tây Ban Nha. Mỗi cặp tiểu bang/ngôn ngữ có dãy phòng riêng (`Arizona · PV1`, `PV2`…; `Arizona · PA1`, `PA2`…), tự mở phòng kế tiếp khi đủ số bồ đoàn cấu hình. Bot không tính vào ngưỡng; chỗ của người rớt mạng được giữ trong thời hạn nối lại. Toàn bộ giao diện, thông báo, giọng đọc và bot đổi theo ngôn ngữ phòng.
- Đã có (02/11/2026): mỗi phòng chánh điện có link mời chứa mã AES-256-GCM, không để lộ `roomId` trên thanh địa chỉ và không thể sửa mã để chuyển sang phòng khác. Nút **Sao chép mã phòng** chia sẻ link để người khác vào đúng phòng, tiểu bang và ngôn ngữ; mã hết hạn sau 30 ngày. Link sai, hết hạn hoặc bị sửa bị từ chối; nếu phòng được mời đã đủ bồ đoàn, người mới được trả về cổng để vào phòng kế tiếp từ sảnh.
- Đã có: bài giảng YouTube hằng ngày lúc 18:00 theo múi giờ của tiểu bang, một video riêng cho mỗi ngôn ngữ; người vào trễ được tua đến cùng thời điểm theo giờ server. `?event=now` dùng để thử ngay.
- Đã có (02/11/2026): nghi lễ tụng kinh gồm một Giảng sư cố định trên pháp tòa, một vị phụ lễ thỉnh chuông và một vị phụ lễ gõ mõ. Ba vị hiển thị ở cả cảnh 2D/3D, không chiếm bồ đoàn và không tính vào số người; động tác chuông/mõ dùng cùng đồng hồ máy chủ với âm thanh và dừng khi bài giảng YouTube đang phát.
- Đã có (02/11/2026): sớ Cầu an/Cầu siêu gửi nhà chùa, mỗi sớ ghi tối đa 10 người. Người dùng chọn năm sinh trong phạm vi tương ứng 1–100 tuổi; hệ thống tự tính tuổi âm năm hiện tại và tra sao Cửu Diệu cho Cầu an. Cầu siêu hiển thị tuổi âm quy đổi và không gán sao. Có bảng tra đủ 1–100 tuổi, bản dịch bốn ngôn ngữ, lưu sớ ở API và trang admin xem/cập nhật trạng thái đã nhận, xếp lịch, hoàn lễ.
- Đã có (02/11/2026): trang `/admin-thien.html` chỉnh giờ phát địa phương và tiêu đề/link YouTube cho bốn ngôn ngữ. API kiểm tra `ADMIN_SECRET`, chuẩn hóa URL thành YouTube video ID, lưu nguyên tử vào `.data/thien-event.json`; client đang mở tự nạp cấu hình mới trong tối đa 60 giây.
- Đã có: bot phía server cho chánh điện (mặc định 8 trong room rules, đổi bằng `BOTS_THIEN`, 0 để tắt): chỉ có khi phòng có người thật; vào dần (3 ngồi sẵn, còn lại cách nhau 5–20 giây), thỉnh thoảng có người rời và người khác vào; mỗi bot có nhịp riêng, tụng kinh hoặc dâng lễ (dâng hương nhiều nhất), đôi khi kèm lời nguyện; bồ đoàn của bot được giữ như người thật nên bấm vào không làm bot biến mất. Khi số người thật tăng, bot rời phòng trước để luôn đủ bồ đoàn cho người thật; bot không vào snapshot failover. Theo yêu cầu (01/11/2026), tên bot hiển thị như người thường, không ghi nhãn.
- Giới hạn bắt buộc với bot (không đổi khi chưa có quyết định mới): số người, vote, số ở sảnh chỉ đếm người thật; bot không chào hỏi/trò chuyện riêng với người thật, không thỉnh chuông; **trước khi có ủng hộ bằng tiền thật (giai đoạn 6) phải loại bot khỏi bảng công đức** để không tạo áp lực ủng hộ giả.
- Đã có (theo yêu cầu, thay quyết định "chưa làm 3D" ở mục 1): chế độ **3D** cho chánh điện bằng Three.js 0.160.0 (ghim, phục vụ từ server ở `/vendor/three/`), dựng bằng hình khối (sàn gỗ, tường/trần, cột đỏ, bàn thờ, tượng Phật vàng có hào quang, nến, đèn lồng, tối đa 20 vị trí bồ đoàn và chỉ dựng số đang cấu hình, người ngồi 3D theo 6 hình nhân vật, tên và bong bóng chat, hiệu ứng lễ vật). Xoay/kéo/phóng to bằng chuột hoặc ngón tay, camera giữ trong chánh điện, góc mặc định tự lùi cho thấy trọn khu bồ đoàn theo tỷ lệ màn hình; chạm bồ đoàn/người để ngồi (raycast). Mặc định 3D khi có WebGL, nút chuyển 2D (tranh vẽ) cho máy yếu; không có WebGL thì tự dùng 2D. Vị trí 3D của bồ đoàn ở `world` trong scene JSON (`packages/scene-engine/src/world.mjs` kiểm tra).
- Thiết kế lại 3D theo các skill `threejs-*` (01/11/2026), mô hình ở `packages/scene-engine/src/temple3d-models.mjs`: chánh điện (bệ ba cấp, phông đỏ khung vàng, hoành phi "CHÁNH ĐIỆN", câu đối, cột bát giác chân đá có rồng quấn, chân tường gỗ, cửa sổ song hắt sáng, trần ô cờ, đèn lồng chóp vàng, thảm đỏ, mâm quả, bình sen, chuông, mõ, lư hương); tượng Phật (đài sen hai tầng, thân ngồi, tay ấn thiền, vạt y, tóc xoắn ốc instanced, nhục kế, tai dài, mắt khép, bạch hào, hào quang và vầng lửa); người ngồi (kiết già, tay chắp, cổ áo, kiểu tóc/khăn/y theo hình nhân vật, bồ đoàn trên tọa cụ, bóng tiếp xúc giả, thở nhẹ, cúi lạy khi dâng lễ). Ánh sáng môi trường RoomEnvironment cho vàng phản chiếu; khối tĩnh gộp theo vật liệu; 177 lệnh vẽ, ~118k tam giác với 16 người.
- Làm lại tượng Phật và mặt người dùng: tượng ngồi kiết già kiểu tượng Việt (cà sa vắt vai trái để lộ vai phải, viền y chéo, cơ vai, tay dựng theo khớp vai–khuỷu–cổ tay, ấn thiền hai ngón cái chạm nhau, bàn chân ngửa trên đùi, cổ ba ngấn, tai dài, đường chân tóc xoắn ốc chừa trán), mặt vẽ bằng texture trên mảnh cầu sát mặt (mày cong, mắt khép nhìn xuống, môi mỉm, bạch hào) cộng khối 3D cho mũi, môi, cằm; người dùng có mặt (mắt, lông mày theo màu tóc, mũi, miệng cười, má hồng) quay về bàn thờ, tóc chừa trán.
- Hiệu năng 3D: tối đa 1,5× độ phân giải trên màn cảm ứng; tự hạ chất lượng sau mỗi 2 giây (dưới 28 FPS → 1×, dưới 22 FPS → tắt ánh sáng môi trường và giảm độ kim loại để vàng vẫn sáng); camera không chui vào cột. Đo bằng Chrome headless vẽ bằng CPU (SwiftShader, máy chậm nhất có thể): 9 FPS ở chất lượng đầy đủ, ~30–37 FPS sau khi tự hạ. Chưa đo trên điện thoại thật.
- Chưa làm cho 3D: model thiết kế (glTF) thay hình khối; animation đi vào/ngồi xuống; Three.js 0.160 chưa có `scene.environmentIntensity` mà các skill dùng (đang chỉnh bằng `envMapIntensity` từng vật liệu).
- Cả bốn lễ vật không còn thời gian chờ (theo yêu cầu); vẫn giới hạn chung 6 lễ/10 giây mỗi người, trần hiệu ứng trên màn, và mỗi máy chỉ phát tối đa một tiếng chuông lớn của người khác mỗi 1,5 giây.
- Đã có (01/11/2026, theo yêu cầu): **tài khoản và công đức lưu lâu dài**. Đăng nhập tên/mật khẩu (scrypt) hoặc Google (Google Identity Services, API xác minh ID token theo `GOOGLE_CLIENT_ID`; chưa đặt thì nút Google tự ẩn). Phiên là cookie HttpOnly ký số 30 ngày, có phiên bản để đăng xuất mọi nơi; chặn thử đăng nhập theo IP; form chỉ nhận từ cùng origin. Vé vào phòng có vai `member` kèm `accountId` (giữ qua nối lại và failover, không lộ ra phòng). Chỉ API ghi dữ liệu: máy realtime gửi lễ vật của thành viên qua `POST /internal/offerings` có khóa nội bộ suy ra từ `SESSION_SECRET` (`API_INTERNAL_URL`). Hồ sơ: ảnh đại diện (ảnh Google hoặc chữ cái đầu), tổng công đức, số lần dâng hương, chuỗi ngày liên tiếp và kỷ lục (theo giờ Việt Nam), 7 cấp độ (Sơ tâm → Bồ đề tâm), lịch sử hoạt động; bảng xếp hạng cộng đồng theo công đức / dâng hương / chuỗi ngày, mọi lúc hoặc 7 ngày (chỉ tài khoản thật, bot và khách không lên bảng). Điểm lưu có giới hạn mỗi ngày từng lễ vật (cánh sen 200, hương 100, hoa sen 30, chuông 10 lần), quá giới hạn vẫn ghi lịch sử nhưng +0, để bảng xếp hạng không bị spam.
- Cạnh tên kiểu TikTok LIVE: ảnh đại diện (ảnh Google của thành viên đăng nhập Gmail, chỉ nhận `*.googleusercontent.com`; còn lại chữ cái đầu), huy hiệu hạng TOP 1/2/3 (vương miện vàng/bạc/đồng, theo công đức trong phòng; ở bảng xếp hạng cộng đồng theo hạng trên bảng) và huy hiệu cấp công đức (hoa sen + số cấp, màu theo cấp) ở tin chat, thông báo dâng lễ, bảng công đức trong phòng, bảng xếp hạng và hồ sơ. Cấp đi trong vé vào phòng và `room.state` (`participants[].level`, tùy chọn); sau mỗi lễ vật API trả cấp mới, máy realtime cập nhật và cả phòng thấy thông báo "lên cấp". Khách và bot không có huy hiệu (không gắn cấp giả cho bot).
- **Lệch kế hoạch cần quyết định:** tài khoản đang lưu bằng SQLite (`node:sqlite`, file `DATA_DIR/app.db`, cần Node ≥ 22.13) cho chạy một máy API; kế hoạch gốc là Postgres. Trước khi chạy nhiều máy API phải chuyển `packages/accounts` sang Postgres (giữ nguyên giao diện store). Bảng xếp hạng chuỗi ngày đang tính trên mọi tài khoản mỗi 15 giây (cache), cần bảng tổng hợp khi tài khoản nhiều.
- Chưa làm: trang admin (cần đăng nhập trước khi đưa lên mạng) để chỉnh số bot, tên bot, nội dung và link bài giảng; TTS chính thức (đang dùng giọng đọc của máy); chế độ Đại lễ; animation đi vào/ngồi xuống; vẽ 4 bồ đoàn mở rộng trực tiếp vào ảnh nền; lọc từ cấm trong lời nguyện; chuyển trang Cinema sang `realtime-session.js`.

### Giai đoạn 5. Quy mô và độ bền (L)

- Load balancer: route `/ws/{node}`, idle timeout > chu kỳ ping, rút máy từ từ khi deploy, health check theo event loop lag.
- Giám sát: số kết nối, phòng/máy, sự kiện/giây, độ trễ chat, lỗi phát YouTube, hàng đợi TTS; cảnh báo.
- Load test k6: 1.000 → 10.000 → 100.000 kết nối, gồm kịch bản 100.000 người vào trong 1 phút.
- Chaos test: `kill -9` máy realtime, cắt mạng 15 giây rồi cho sống lại (kiểm tra epoch).
- Autoscale hoặc luôn dư ≥ 30% sức chứa.

**Xong khi:** đạt 100.000 kết nối đồng thời trong load test với chat p95 < 300 ms; tắt một máy, phòng hồi phục trong ≤ 20 giây, không mất hay nhân đôi quà.

### Giai đoạn 6. Quà và sổ cái (M, chờ chọn cổng thanh toán)

- Sổ quà trong Postgres, mã idempotency, ghi trước rồi mới phát hiệu ứng.
- Tách ghi nhận quà khỏi quyền có ghế.
- Bảng công đức/ủng hộ đọc từ sổ cái, không từ bộ nhớ.

### Giai đoạn 7. Music, Phòng ngôn ngữ, Private (M mỗi loại)

- Music: chỉ nhận video thể loại Music, nút "Không phải nhạc", cảnh sân khấu, đèn theo nhịp giả.
- Ngôn ngữ: giao diện vi/en/es, giọng TTS theo ngôn ngữ, nhận diện ngôn ngữ chat và nhắc nhẹ, câu gợi chuyện sau video.
- Private: link mời, chủ phòng điều khiển phát/tua/hàng chờ/vote/kick, chọn cảnh và số ghế.

### Giai đoạn 8. Dating (L)

- 2 ghế spotlight, hàng chờ ứng tuyển, vòng 5–10 phút, cả hai cùng đồng ý mới mở phòng riêng.
- An toàn: xác nhận 18+, chặn và báo cáo, ẩn thông tin cá nhân, quyền kiểm duyệt kéo người khỏi ghế.
- Rà soát pháp lý và điều khoản trước khi mở công khai.

### Giai đoạn 9. Game nhập vai (đề xuất 02/11/2026, đang làm)

Theo yêu cầu: chuyển chánh điện thành game nhập vai góc nhìn thứ ba, chọn phòng (Chùa / Rạp phim) ở màn hình chọn phòng; đồ họa dùng mô hình CC0 + động tác Mixamo (người dùng chọn).

- 9.1 Lõi nhập vai trong chánh điện hiện tại (**đã làm 02/11/2026**): `packages/scene-engine/src/walk.mjs` (vùng đi, va chạm trượt theo vật cản, tìm đường A* lưới 25 cm), `explore3d.mjs` (plugin của bộ vẽ 3D: nhân vật đứng/đi/quỳ/lạy dựng tạm bằng hình khối, W-A-S-D, chạm sàn để đi, chạm bồ đoàn để đi tới rồi ngồi, camera bám sau lưng, nội suy người khác), `apps/web/public/explore-ui.js` (cần điều khiển ảo, thanh động tác). Protocol `move`, `emote`, `room.moves`, `participant.pos/emote`; máy realtime gom 200 ms, chặn đi nhanh, đứng dậy đi thì rời bồ đoàn. Máy realtime ping WebSocket mỗi 30 giây để gỡ kết nối chết; cổng web đóng cả hai đầu khi một đầu ngắt. Đã thử hai trình duyệt: cùng phòng thấy nhau đi và lạy.
- Sớ cầu an / cầu siêu (02/11/2026): gửi sớ xong, cả phòng thấy "Thầy đã nhận sớ … của [tên trong phòng]" (protocol `prayer.announce` → `prayer.received`, chỉ mang loại sớ, không mang tên người trong sớ; 3 lần/10 phút); giảng sư cầm sớ cúi đọc 30 giây, nhãn "Thầy đang đọc sớ…" (ai cũng thấy). Bài đọc có tên, năm sinh, lời khấn từng người chỉ phát bằng giọng đọc trên máy người dâng sớ (`apps/web/public/prayer-recite.js`, 4 ngôn ngữ; `temple-audio.recite`: chuông mở đầu, giọng trầm chậm, lời đọc thường của người khác nhường).
- Tụng kinh / gõ mõ (02/11/2026): emote `chant` (kèm mã bài `sutra`) và `woodfish`; nhân vật quỳ gõ mõ, nhãn "Đang tụng …" cho cả phòng; giọng tụng + mõ chỉ trên máy người tụng. Kinh văn ở `apps/web/public/sutras.js`: Bát Nhã Tâm Kinh trọn bài (Hán Việt + chữ Hán); A Di Đà, Phổ Môn, Dược Sư, Vu Lan mới có khung (kệ khai kinh, tên kinh, chú/niệm, hồi hướng), **chờ nhà chùa cung cấp toàn văn bản chuẩn**; hai thần chú (Vãng sanh, Dược Sư) cần nhà chùa đối chiếu.
- Nhân vật kiểu chú tiểu chibi (`packages/scene-engine/src/chibi3d.mjs`, dựng bằng hình khối + mặt vẽ canvas) cho người đi lại, ngồi bồ đoàn và người hành lễ; tràng hạt niệm Phật 108 hạt (`apps/web/public/mala.js`, đếm hạt/chuỗi lưu trên máy, niệm thầm hoặc thành tiếng).
- Sân ngoài chùa (02/11/2026, tham khảo bố cục didenchua.online, dựng bằng code riêng): `packages/scene-engine/src/courtyard3d.mjs` theo `world.courtyard` trong scene JSON (mặt tiền mở cửa, thềm, cột son, mái, hoành phi, lư hương đồng lớn có khói, đèn đá, cây đa/tùng, 18 La Hán, cây bồ đề, khu Quan Âm trắng, hồ cá, bồn nước, ghế đá, cây hoa kiểng, tường gạch đèn lồng, cổng tam quan, bảng vàng công đức, trời và núi). Nắng có bóng đổ chỉ bật khi camera ở ngoài sân; máy yếu tự tắt bóng. Vùng đi `world.walk.areas` (điện + cửa + sân), A* dùng đống nhị phân; vào phòng xuất hiện ở sân; giữ Shift / đẩy cần hết cỡ để chạy (runSpeed 5,4 m/s; server maxSpeed 7, vùng thô tới z 100).
- Bóng sân ngoài chùa (02/11/2026, hoàn tất mục 2.1 của `KE_HOACH2.md`): thiết bị cảm ứng luôn có một lightmap canvas trong suốt cho bóng mềm của mặt tiền, cột, lư hương, đèn đá, cây, tường và cổng; người đi có bóng dài lệch theo cùng hướng nắng. Máy tính bắt đầu với shadow map 1024; điện thoại đạt ≥ 45 FPS trong 3 giây đầu mới thử shadow map 512 và tự tắt nếu tụt dưới 28 FPS. Batch kiến trúc/cây đã có `castShadow`, khung bóng ôm sân, ánh sáng trong điện giữ nguyên. So với trước, nhánh mobile thêm đúng 1 lệnh vẽ và 2 tam giác; mẫu shadow map thật tăng 18 lệnh vẽ (338 → 356) và vẫn khoảng 29 FPS trong Chrome headless. Ảnh QA 440×956 với `pointer: coarse` xác nhận shadow map tắt, lightmap và bóng nhân vật vẫn hiện; cảnh tĩnh không người là 173 lệnh vẽ / 96.604 tam giác, không có lỗi console. SwiftShader toàn cảnh chỉ 2–9 FPS nên chưa đại diện điện thoại thật; góc chơi sau khi tự hạ chất lượng đo khoảng 29 FPS. Vẫn phải đo lại trên điện thoại thật trước khi phát hành.
- Bổ sung sân chùa (02/11/2026, đang làm mục 2.2–2.3 của `KE_HOACH2.md`): thêm đại hồng chung và trống lớn có giá gỗ hai bên thềm, rễ nổi/rễ phụ cho cây đa, hồ sen có bờ đá/lá/hoa và cổng tam quan ba cửa vòm ba mái. Mọi vị trí nằm trong `world.courtyard`; chuông, trống và hồ có vật cản trong `world.walk`. Bảng công đức được dời sát tường sau khi QA phát hiện che chuông. Các phần lặp lại vẫn gộp trong `StaticBatch`; góc toàn cảnh giả lập mobile không người đo 159 lệnh vẽ, dưới ngưỡng 220. `resolveMove` đã chuyển phần chuyển động bị chặn sang tiếp tuyến nên chạy thẳng vào lư hương trượt ngay thay vì khựng; có test hồi quy.
- Bot ngoài sân (02/11/2026): `THIEN_RULES.bots.walk` giữ tối đa 3 bot tuần tra 20 điểm trên lối đá. Máy realtime dùng chung `Room.move` và `room.moves`, nên client thấy bot đi như người thật; bot ngoài sân không chiếm bồ đoàn và vẫn ở lại khi đủ 20 người thật, còn bot ngồi rời để nhường chỗ. Có test toàn tuyến tuần tra đi được, phát gói di chuyển và trường hợp phòng kín.
- Sửa điều khiển mobile (02/11/2026): bot dùng đúng quy ước góc quay của chibi, khi nội suy luôn quay theo vector dịch chuyển thật và đi tuyến 20 đoạn vòng vật cản. Cần điều khiển giữ trạng thái chạy tới lúc thả tay nên quẹo không bất chợt đổi sang đi bộ. Va chạm quét theo bước 20 cm cho cả người và bot để FPS thấp không xuyên vật; bụi cây, ghế đá và cụm Quan Âm (hàng cây, bàn lễ, đèn đá) có vùng cản đúng kích thước lấy từ scene. Test lấy mẫu cả đoạn mỗi 10 cm và có ca nhảy qua vật nhỏ để chặn hồi quy. Camera nhập vai lấy `world.camera.follow`, khóa zoom/pan ở khung gần như ảnh mobile; trang chặn browser zoom, tap highlight và chọn chữ khi nhấn giữ, nhưng giữ chọn chữ trong ô nhập.
- Ghế đá tương tác (03/11/2026): sáu ghế sân chùa thu còn 72% để cân với nhân vật. Mỗi ghế có hai chỗ được máy realtime cấp phát; khi lại gần ghế hoặc bồ đoàn còn chỗ mới hiện nút “Ngồi xuống”, bấm nút thì nhân vật tự đi nốt quãng ngắn và ngồi; người thứ ba nhận báo ghế đã đầy. Trạng thái `benchId/benchSpot` đồng bộ cả phòng, giữ qua reconnect/failover; đứng dậy, di chuyển hoặc chọn bồ đoàn sẽ nhường chỗ. Vị trí, tỷ lệ và số chỗ vẫn nằm trong scene/rules; mesh bấm vô hình riêng giữ phần ghế vẽ được gộp batch.
- Công trình chung (04/11/2026): tiến độ toàn hệ thống, không chia theo tiểu bang/ngôn ngữ/phòng. Cây Bồ Đề và Hồ Sen là hai công trình độc lập trong SQLite; mỗi tài khoản làm từng việc tối đa một lần/ngày/công trình, POST có idempotency, realtime phát snapshot vừa đổi. Hồ sen mở dần nước → bờ đá → sen → cá koi theo năm mốc trong `world.courtyard.pond.stageVisibility`; mọi tọa độ và mốc cảnh nằm trong scene JSON. Giao diện cho chuyển giữa hai công trình, bốn ngôn ngữ, chỉ thưởng danh hiệu/mỹ phẩm, không bán sức mạnh.
- Tối ưu oẳn tù xì (02/11/2026): khi bảng trò chơi phủ màn hình, tạm dừng WebGL phía sau thay vì tiếp tục vẽ khoảng 258k tam giác/khung; đồng hồ chỉ cập nhật đúng dòng số giây, không dựng lại toàn bộ DOM mỗi 500 ms. Đóng trò chơi thì cảnh tiếp tục ngay, không tạo lại renderer hay shader.
- 9.2 Mô hình thật: nhân vật CC0 có khung xương (.glb, nén meshopt/KTX2), động tác Mixamo (đi, quỳ, lạy, ngồi thiền) do người dùng tải bằng tài khoản Adobe; chú tiểu, Tam Thế Phật tự dựng hoặc chỉnh từ mô hình CC0. Thay phần avatar trong `explore3d.mjs`, giữ điều khiển/đồng bộ.
- 9.3 Chùa trên núi: sân đá rêu, vách núi, tùng/thông (instancing), lư hương đồng giữa sân, hoàng hôn + sương nhiều lớp (không dùng sương thể tích thật để máy yếu vẫn ~30 FPS), chánh điện mở cửa với Tam Thế Phật; thả đèn lồng ở mép vách; âm thanh chuông/mõ theo vị trí.
- Góp ý & Báo lỗi (03/11/2026): trang `apps/web/public/ho-tro.html` (báo lỗi / góp ý nâng cấp / khác, liên hệ tùy chọn, tự kèm trang vừa mở và trình duyệt); API `POST /api/v1/support` (khách cũng gửi được, 5 phiếu/10 phút, cắt 1.000 ký tự), lưu `support.json` ở DATA_DIR; quản trị xem và đổi trạng thái ở mục 04 trang admin (`GET/PATCH /api/v1/admin/support`). Đường vào: menu ⚙ ở chùa, nút 🛟 ở rạp, chân trang phòng game / Ủng hộ / sảnh. Phiếu mới báo qua Telegram nếu đặt `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (`apps/api/notify.mjs`, tin dạng chữ thường; `npm run telegram:setup`).
- Nhiệm vụ hằng ngày (03/11/2026, mở rộng 04/11): 7 việc gồm điểm danh, trồng cây, tưới, hái, dâng quả, góp cây Bồ Đề và góp Hồ Sen — mỗi nhiệm vụ +5 xu, nhận một lần mỗi ngày theo ngày của vườn; server tự kiểm tra lịch sử vườn và `community_project_contributions` (`claim` trong `@chanh-dien/garden`, bảng `quest_claims`, loại giao dịch `quest`). Danh sách ghi rõ Chánh điện / Ngoài sân / Khu vườn, có nút “Đi tới” dùng message `travel.go` sẵn có; hướng dẫn ngắn bằng bốn ngôn ngữ. Nhận ở Quầy (bấm ô 📜 trên header); ô 🪙 có chấm đỏ khi có nhiệm vụ chưa nhận. Không có nhiệm vụ chơi Bầu Cua.
- Trang Ủng hộ (03–04/11/2026): `apps/web/public/ung-ho.html` — quyên góp tự nguyện qua Zelle để duy trì server, không bán xu, khoản góp không đổi ra xu hay quyền lợi trong game. Thông tin nhận tiền từ biến môi trường `DONATE_*`; tổng tháng lưu bền trong SQLite và đọc qua `GET /api/v1/donate`. Quản trị xác nhận tiền đã nhận bằng lệnh Telegram `donate 1` (cộng 1 USD) qua webhook có `TELEGRAM_WEBHOOK_SECRET`, giới hạn đúng `TELEGRAM_CHAT_ID`, chống cộng trùng bằng `update_id`; trang đang mở tự tải số mới mỗi 15 giây. Đường vào: menu ⚙ ở chùa, nút 💝 trên thanh công cụ rạp (mở tab mới), phòng game, chân trang sảnh. Đây là ghi nhận thủ công qua Telegram, không tự động đối soát Zelle (Zelle không có API cho cá nhân).
- Bầu Cua chơi chung theo thời gian thực (03/11/2026): loại phòng `game` (room rules `GAME_RULES`, danh mục `game-1`). Máy realtime giữ nhịp ván — đặt cược 20 s → lắc 3 s → kết quả 6 s — và lắc xúc xắc (`apps/realtime/bau-cua.mjs`); ví xu vẫn do API giữ: cược trừ ngay (`POST /internal/games/bau-cua/stake`), lắc xong chốt cả ván một giao dịch (`/settle`), ván treo quá 3 phút (máy realtime chết) thì hoàn cược (garden schema 5: `bau_cua_stakes`, `bau_cua_rounds`, giao dịch `game_refund`). Message mới trong `packages/protocol`: `bet.place`, `game.state`, `game.mine`, `game.payout`. Khách vào xem, chỉ thành viên cược. Bỏ chế độ lắc riêng một mình (`/api/v1/games/bau-cua/roll`). Hủy cược (04/11/2026): nút "↩ Hủy cược" chỉ hiện trong pha đặt cược khi mình có cược; gửi `bet.cancel`, API hoàn toàn bộ cược của người đó trong ván (`/internal/games/bau-cua/unstake`, giao dịch `game_refund`), tổng cả bàn trừ phần đã hủy; hết pha đặt thì không hủy được.
- Shop nhân vật (04/11/2026): trang `/shop.html`, ví kim cương 💎 riêng (bảng `shop_wallets`, `shop_transactions`, `shop_payments`, `shop_items` trong `app.db`, `apps/api/shop.mjs`), chỉ nạp được bằng tiền thật qua Stripe Checkout (gọi REST, không SDK): mỗi phiên Checkout cộng đúng một lần, khóa là session id, đối chiếu đúng người + đúng số tiền; cộng qua webhook có chữ ký (`/api/v1/stripe/webhook`) hoặc khi trang quay về hỏi lại (`/api/v1/shop/checkout/confirm`). Món đầu tiên: hình `chibigirl` (Bé Mũ Đỏ, 300 💎); hình Nữ mặc định trở lại hình khối. Quyền mặc hình: API ghi `skins` vào vé vào phòng, máy realtime trả `SKIN_LOCKED` nếu `avatar.set` hình shop mà vé không có; người mới/bot không bao giờ được chia hình shop. Ghi sổ dùng SQLite như ví xu (nguyên tắc 6 nói Postgres — chuyển khi có Postgres). Header chùa/rạp có ô 💎 (bấm mở các gói nạp → Stripe) và nút 🛍 Shop (chùa); gói nạp chỉnh ở admin (mục 05, `GET/PUT /api/v1/admin/shop/packs`, bảng `shop_packs`, tối đa 8 gói, giá $0.50–$999.99).
- Đổi phòng chánh điện (04/11/2026): bấm tên phòng (vd: "Arizona · PV1 ⇄") mở bảng chọn tiểu bang / ngôn ngữ, danh sách phòng đang có người (`/api/v1/thien/rooms` nay kèm `inviteCode` của từng phòng đang mở) hoặc "Vào phòng còn chỗ" (`/api/v1/thien/assign`). Đổi phòng giữ tên, hình nhân vật, chỗ đứng; phòng khác ngôn ngữ thì đổi luôn ngôn ngữ giao diện và giọng đọc. Nhiệm vụ hằng ngày chuyển thành nút lớn giữa mép trái; header còn ← · số người · 🪙 · 💎 · 🛍 · ⚙.
- Nhân vật tải lên trong Shop (05/11/2026): admin (mục 06) tải `.glb` có khung xương (Meshy "Rig & Animate", xương Mixamo, có Walking; ≤ 40k tam giác, ≤ 64 MB) → API kiểm tra (`inspectGlb`), nén bằng gltf-transform (meshopt + WebP 1024, ~1 giây, còn vài trăm KB), lưu `DATA_DIR/models/<mã>.glb`, danh mục `shop_catalog` (tên, giá 💎, hình Nam/Nữ thay thế, bật/tắt, version). Mã nhân vật `shop-<tên>`: protocol/room-rules nhận theo mẫu `SHOP_SKIN`, realtime vẫn chỉ cho mặc khi vé có (đã mua). Engine `rigged3d.mjs`: đi/chạy bằng động tác trong file (AnimationMixer), đứng chắp tay / ngồi ghế / ngồi xếp bằng / quỳ / lạy dựng bằng cách ngắm hướng xương (chạy cho mọi rig tên chuẩn); người ngồi được nướng thành lưới tĩnh để rạp đông vẫn vẽ hàng loạt. File tĩnh không khung xương bị từ chối (`NO_SKELETON`). `@gltf-transform/cli` chuyển từ devDependencies sang dependencies; nginx production nâng `client_max_body_size` 64m riêng cho route tải nhân vật.
- Giá gốc / giá bán (05/11/2026): admin (mục 06) sửa giá bán và giá gốc của mọi nhân vật, kể cả Bé Mũ Đỏ có sẵn trong code (lưu ở `shop_item_overrides`; nhân vật tải lên thêm cột `original_price`). Giá gốc lớn hơn giá bán thì shop hiện giá gốc gạch ngang, giá bán và % giảm; mua luôn trừ theo giá bán. Để trống giá gốc = không giảm.
- Ảnh chân dung nhân vật dựng sẵn (05/11/2026): trước đây shop/admin/cổng chùa dựng ảnh 3D trên máy người xem (tải three.js + mọi mô hình, ~3,4 s trên 4G) và tạm hiện ảnh 2D "Nữ" cũ. Nay Bé Mũ Đỏ có `apps/web/public/models/characters/chibi-girl.png`; nhân vật tải lên có `DATA_DIR/models/<mã>.png` do trang admin dựng rồi gửi (`PUT /api/v1/admin/shop/items/<mã>/thumb`, PNG ≤ 600 KB, cột `thumb_version`), tự tạo khi admin mở danh sách mà món chưa có ảnh hoặc vừa thay file. Shop hiện ảnh sau ~0,3 s, không tải three.js; món chưa có ảnh thì ô trống chờ dựng 3D.
- Tài Xỉu (Sic Bo) (05/11/2026): phòng `taixiu-1` (room rules `TAI_XIU_RULES`, loại `taixiu`), trang `apps/web/public/tai-xiu.html` (bàn như Sic Bo: tổng 4–17 kèm tỷ lệ, Xỉu / Tài thua khi ra bộ ba, 6 mặt xúc xắc; 10 ván gần nhất). Tái dùng bàn chung của Bầu Cua: `BauCuaTable` nhận định nghĩa trò (`DICE_TABLE_GAMES`: tiền tố mã ván, ô cược, cách lắc), cùng nhịp ván, ví xu, đặt/hủy cược, route nội bộ và bảng `bau_cua_stakes` / `bau_cua_rounds`; API chọn cách trả thưởng theo tiền tố mã ván (`bc-` Bầu Cua, `tx-` Tài Xỉu, `settleTaiXiu`), ghi sổ `game_rounds.game = 'tai_xiu'`. Protocol: `bet.place` thêm `spot`, `game.state` thêm `game: 'tai-xiu'` + `history`. Lịch sử 10 ván giữ trong bộ nhớ máy realtime (mất khi phòng dựng lại).
- Phòng game (03/11/2026): trang `apps/web/public/game.html` (một file HTML/CSS/JS thuần), game đầu tiên Bầu Cua Tôm Cá, cược bằng xu của ví Vườn Công Đức (xu bán trái cây, 1 xu cược = 1 xu ví; xu ảo, không quy đổi tiền thật), phải đăng nhập. Server lắc xúc xắc (`crypto.randomInt`), trừ cược/cộng thưởng trong một giao dịch SQLite kèm Idempotency-Key (`POST /api/v1/games/bau-cua/roll`, `playBauCua` trong `@chanh-dien/garden`), ghi `coin_transactions` (`game_bet`/`game_win`) và `game_rounds` (migration garden schema 3); vào/ra bằng menu "📍 Đi nhanh" ở chùa, rạp phim và phòng game. Chưa làm: chơi chung nhiều người (cần message mới trong `packages/protocol` và room rules cho phòng game).
- 9.4 Rạp phim 3D: đi vào ghế, khung YouTube phẳng khi xem (không vẽ gì đè lên khung).
  - Đã có (03/11/2026): rạp 3D dựng bằng hình khối (`scene-engine/src/cinema3d.mjs`, bố cục ở `theater3d` trong `scenes/cinema-default`): sàn bậc thang, 100 ghế nhung, rèm, đèn tường, tia máy chiếu; người ngồi kiểu chibi vẽ bằng InstancedMesh (≈ 50–60 lần vẽ với 30 người); chạm ghế để ngồi; bong bóng chat trên đầu. Camera nhìn thẳng màn chiếu bằng frustum lệch tâm nên iframe YouTube đặt phẳng đúng khung; góc "Khán giả" thu player thành khung nhỏ ở góc. Không có WebGL hoặc `?2d=1` thì dùng cảnh 2.5D. Chưa làm: đi bộ vào ghế (hiện chạm là ngồi), đo FPS trên điện thoại thật với 100 người.
  - Chuyển map (03/11/2026): menu "📍 Đi nhanh" của chùa có thêm "🎬 Rạp phim" (sang phòng `cinema-1`, tự vào bằng pháp danh đã nhập); rạp có menu Đi nhanh về Chánh điện / Ngoài sân / Khu vườn, quay lại đúng phòng chùa vừa ở (link lưu trong `sessionStorage`) và gửi `travel.go` tới khu đã chọn ngay khi vào phòng.
  - Góc nhìn nhân vật + giao diện rạp (03/11/2026): vào rạp xuất hiện ở cửa sau, chạm sàn để đi, chạm ghế (có vòng sáng) thì tự đi theo lối đi rồi ngồi, phím mũi tên/WASD trên máy tính. Camera bám sau lưng nhưng vẫn nhìn thẳng màn chiếu (frustum lệch tâm), nên khung YouTube luôn phẳng. Cinema có `world` trong room rules (server kiểm tra thô, phát `room.moves` cho cả phòng), message mới `reaction.send`/`reaction` (thả cảm xúc 👏😂❤️😮😢🔥, 6/10 giây). Giao diện: đang chiếu + vote bỏ qua có thanh tiến độ, trạng thái phòng, chép link, toàn màn hình, ẩn giao diện, thanh công cụ (đổi ghế, gửi video, hàng chờ, trò chuyện, tương tác, người xem), chat dưới đáy, âm lượng. Các thanh báo kích thước cho bộ vẽ (`setInsets`) nên không nút nào nằm trên khung player (test tự động ở khung điện thoại và máy tính). Bỏ thanh tiêu đề trang (tên phòng, đi nhanh nằm trong cảnh như chánh điện), cần điều khiển trên máy cảm ứng, "Đổi ghế" mở sơ đồ 100 ghế để chọn rồi nhân vật tự đi tới ngồi. Đi lại dùng tìm đường A* trên lưới 10 cm (vòng qua hàng ghế cong), trượt men theo hàng khi chạm ghế, kéo cần về phía bị hàng ghế chặn thì tự men ra lối đi; đứng trước ghế trống hiện nút "💺 Ngồi ghế …". Xem ngang: điện thoại xoay ngang tự vào (nút ⛶ ở mọi máy, kèm toàn màn hình/khóa hướng nếu trình duyệt cho), camera `zoom` phóng vào màn chiếu, video cao ~98% màn hình, chỉ còn 3 nút ở dải trống bên phải. Nhân vật: cổng chỉ chọn Nam/Nữ (ảnh dựng từ mô hình 3D), cùng một cái đầu ở mọi nơi; ở chùa mặc áo tràng, vào rạp mặc đồ thường ngày nhiều màu (màu cố định theo từng người, người ngồi ôm hộp bắp rang); Cinema có `skins: ['man','woman']` nên rạp nhận đúng nhân vật đã chọn (`avatar.set`), không còn bị đổi. Ghế đôi: hai hàng cuối có 8 sofa nhung hồng (16 ghế, id giữ nguyên S-…), tay vịn hai đầu, trái tim trên lưng sáng và đập khi đủ hai người; sơ đồ "Đổi ghế" hiện ghế đôi liền nhau có ❤. Chưa làm: phòng riêng, tủ đồ đổi nhân vật, đo FPS trên điện thoại thật khi 100 người.
- 9.5 Load test phần di chuyển (bot k6 đi lại, đo băng thông/phòng ở 100/200/300/500 nhân vật) rồi chốt `maxWalkers`; bot chánh điện đi lại.

**Xong khi:** trên điện thoại thật đi lại mượt (≥ 30 FPS máy tầm trung), hai máy thấy nhau đi/lạy lệch < 300 ms, load test đạt ngưỡng ở `maxWalkers` đã chốt.

## 4. Rủi ro chính

| Rủi ro | Ảnh hưởng | Giảm thiểu |
| --- | --- | --- |
| Quảng cáo YouTube làm lệch đồng bộ | Người xem thấy khác nhau vài giây | Client báo trạng thái quảng cáo, tua lại sau quảng cáo; chấp nhận lệch nhỏ |
| Hạn mức YouTube Data API (mặc định 10.000 đơn vị/ngày) | Không kiểm tra được video mới | Cache theo `videoId`, ưu tiên oEmbed, giới hạn gửi, xin tăng hạn mức |
| Điều khoản YouTube về player nhúng | Bị khóa API key | Không vẽ đè lên player, rà soát điều khoản trước khi ra mắt |
| TTS không chính thức bị chặn khi đông | Phòng Thiền mất giọng đọc | Chuyển dịch vụ chính thức, mẫu đọc sẵn, cache |
| Bão kết nối lại khi một máy chết | Sập dây chuyền | Backoff + jitter, dư sức chứa, giới hạn tốc độ kết nối tại LB |
| Spam và nội dung xấu | Trải nghiệm kém, rủi ro pháp lý | Rate limit, lọc, báo cáo, kiểm duyệt |
| Dating: quấy rối, người chưa đủ tuổi | Rủi ro pháp lý và an toàn | Làm sau cùng, xác nhận tuổi, đồng ý hai chiều, kiểm duyệt |
| Asset tạo bằng AI (Google Flow, Gemini) | Ràng buộc điều khoản thương mại | Kiểm tra điều khoản hoặc thay tài nguyên |

## 5. Quyết định còn mở

1. Hạ tầng tự quản (VPS/Kubernetes) hay dịch vụ realtime có sẵn (Ably, Pusher…)?
2. Cổng thanh toán cho quà.
3. Còn giữ bộ TikTok LIVE (`legacy/live/`) để phát song song không?
4. Đăng nhập: chỉ tài khoản khách, hay thêm Google/Apple/số điện thoại?
5. Có cần bản giao diện ngang cho máy tính ngay từ đầu không?

## 6. Agent và skill cần cho Claude Code

Phần này mô tả cách tổ chức agent và skill đã được tạo cho dự án.

### 6.1. Nguyên tắc

- **Ít agent, chia theo ranh giới code**, không chia theo từng tính năng. Mỗi agent khởi động lại từ đầu và phải đọc lại bối cảnh, nên càng nhiều agent càng tốn và dễ lệch nhau.
- **Agent** dùng cho việc cần chuyên môn riêng và có thể chạy song song (backend vs client vs hạ tầng).
- **Skill** dùng cho quy trình lặp lại nhiều lần, có checklist cố định (thêm loại phòng, thêm cảnh, đổi protocol, load test).
- `CLAUDE.md` chứa quy ước chung để mọi agent cùng đọc; `packages/protocol` là hợp đồng giữa các agent.

### 6.2. Agent có sẵn, dùng ngay

| Agent | Dùng khi |
| --- | --- |
| Plan | Thiết kế chi tiết đầu mỗi giai đoạn trước khi code |
| Explore | Tìm nhanh trong code cũ (`legacy/`) khi tách module |
| general-purpose | Việc lặt vặt không thuộc agent nào |

### 6.3. Agent tự định nghĩa (`.claude/agents/*.md`)

| Agent | Phạm vi | Công cụ | Giai đoạn chính |
| --- | --- | --- | --- |
| `realtime-backend` | `apps/realtime`, `apps/api`, Redis, Postgres: room actor, lease/epoch, snapshot, rate limit, sổ quà | Read, Edit, Write, Bash | 1, 3, 4, 5, 6 |
| `scene-frontend` | `apps/web`, `packages/scene-engine`, `tools/seat-editor`: Canvas 2.5D, lớp, sprite, bong bóng, camera, YouTube IFrame API, hiệu năng điện thoại | Read, Edit, Write, Bash, Chrome | 2, 3, 4, 7, 8 |
| `infra-scale` | `infra/`, `loadtest/`: Docker, Nginx/HAProxy, CI, giám sát, k6, chaos test | Read, Edit, Write, Bash | 0, 5 |
| `qa-tester` | Viết và chạy test hành vi, test protocol, test đồng bộ video, kịch bản trong mục "Xong khi" | Read, Edit, Write, Bash, Chrome | mọi giai đoạn |
| `trust-safety` | Chỉ đọc và đánh giá: auth, vé vào phòng, kiểm duyệt, rate limit, an toàn Dating, điều khoản YouTube/TTS, quyền riêng tư | Read, Grep, Bash (chỉ đọc) | 1, 3, 6, 8 |

Có thể thêm sau khi cần: `i18n-content` (bản dịch vi/en/es, câu gợi chuyện, lời hồi hướng) ở giai đoạn 7.

Không nên tách `protocol` thành agent riêng: protocol thay đổi theo từng tính năng, để agent làm tính năng sửa luôn qua skill `protocol-change`.

### 6.4. Skill có sẵn, dùng ngay

| Skill | Dùng khi |
| --- | --- |
| `/init` | Giai đoạn 0, tạo `CLAUDE.md` |
| `run` | Chạy và mở app để xem thay đổi (sẽ dùng skill `run-local` của dự án khi có) |
| `/code-review` | Trước khi merge mỗi PR |
| `/security-review` | Mỗi PR chạm auth, WebSocket, kiểm duyệt, quà |
| `/simplify` | Dọn code sau khi tách module từ legacy |
| `chrome-browser` | Kiểm tra giao diện trên khung điện thoại, quay GIF demo |
| `dataviz` | Biểu đồ kết quả load test và giám sát |
| `update-config` | Hook tự chạy lint/test sau khi sửa file, allowlist lệnh |
| `fewer-permission-prompts` | Giảm hỏi quyền khi đã ổn định lệnh hay dùng |
| `schedule` / `loop` | Chạy load test hằng đêm, theo dõi CI hoặc deploy |

Các skill Expo không cần ở giai đoạn này (dự án là web). Chỉ dùng khi làm ứng dụng di động.

### 6.5. Skill tự viết (`.claude/skills/<tên>/SKILL.md`)

| Skill | Nội dung quy trình |
| --- | --- |
| `run-local` | Bật Redis, Postgres, API, 2 máy realtime, web; tạo dữ liệu mẫu; mở trình duyệt khung 9:16 |
| `add-room-type` | Checklist thêm loại phòng: cấu hình `room-rules`, scene, bản dịch, luật nội dung, test, cập nhật sảnh |
| `add-scene` | Ảnh nền → tách lớp lưng ghế → WebP + hash → seat-editor → JSON → kiểm tra hợp lệ → xem thử |
| `protocol-change` | Sửa schema trong `packages/protocol`, tăng version, cập nhật cả client và server, test tương thích ngược |
| `youtube-sync-check` | Mở nhiều client giả, đo độ lệch, thử quảng cáo/buffering/video cấm nhúng |
| `load-test` | Chạy k6 theo mốc 1k/10k/100k, thu số liệu, so với ngưỡng, xuất báo cáo |
| `chaos-failover` | Tắt máy realtime, cắt mạng, đo thời gian hồi phục, kiểm tra ghế và sổ quà |
| `deploy-drain` | Quy trình deploy: ngừng nhận phòng mới, chuyển phòng, đợi, cập nhật, kiểm tra sức khỏe |

### 6.6. Phân công theo giai đoạn

| Giai đoạn | Agent chính | Agent phụ / review | Skill |
| --- | --- | --- | --- |
| 0. Nền móng | `infra-scale` | Plan, Explore | `/init`, `update-config`, `/simplify` |
| 1. Nhiều phòng | `realtime-backend` | `qa-tester`, `trust-safety` | `protocol-change`, `chaos-failover`, `run-local` |
| 2. Scene engine | `scene-frontend` | `qa-tester` | `add-scene`, `chrome-browser` |
| 3. Cinema | `scene-frontend` + `realtime-backend` | `trust-safety` | `youtube-sync-check`, `add-room-type`, `/security-review` |
| 4. Thiền | `scene-frontend` + `realtime-backend` | `qa-tester` | `add-scene`, `add-room-type` |
| 5. Quy mô | `infra-scale` | `realtime-backend` | `load-test`, `chaos-failover`, `deploy-drain`, `dataviz` |
| 6. Quà | `realtime-backend` | `trust-safety` | `/security-review`, `protocol-change` |
| 7. Music/Ngôn ngữ/Private | `scene-frontend` | `realtime-backend`, `i18n-content` | `add-room-type`, `add-scene` |
| 8. Dating | `scene-frontend` + `realtime-backend` | `trust-safety` | `add-room-type`, `/security-review` |

Giai đoạn 3 có thể chạy song song `scene-frontend` (phía client) và `realtime-backend` (phía server) trong hai git worktree riêng, nối với nhau qua `packages/protocol`.

### 6.7. Thứ tự tạo

1. `CLAUDE.md` (qua `/init`) và skill `run-local`.
2. Agent `realtime-backend`, `scene-frontend`, `qa-tester`.
3. Skill `protocol-change`, `add-scene`, `add-room-type`.
4. Agent `infra-scale`, `trust-safety`; skill `load-test`, `chaos-failover`, `deploy-drain`, `youtube-sync-check` khi bắt đầu giai đoạn 5.
