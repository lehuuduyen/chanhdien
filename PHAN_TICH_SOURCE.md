# Phân tích mã nguồn Chánh Điện Online

Ngày phân tích: 01/11/2026. Phạm vi: mã nguồn trong repository hiện tại.

> Lưu ý sau giai đoạn 0: bản được phân tích trong tài liệu này đã chuyển nguyên khối vào `legacy/`. Vì vậy `index.html`, `assets/` và `live/` dưới đây tương ứng với `legacy/index.html`, `legacy/assets/` và `legacy/live/` ở cấu trúc hiện tại. Các số dòng là tại thời điểm phân tích ban đầu.

## 1. Tổng quan

Dự án dựng khung cảnh chánh điện 2.5D bằng ảnh nền, sprite nhân vật và Canvas 2D, kết hợp nhạc nền, chuông, mõ và giọng đọc tiếng Việt. Có hai ứng dụng độc lập:

| Thành phần | Mục đích | Trạng thái/dữ liệu |
| --- | --- | --- |
| `index.html` | Bản trải nghiệm web tĩnh, nhập pháp danh, chọn nhân vật, mô phỏng tặng quà | Chạy riêng trong từng trình duyệt; không đồng bộ nhiều người dùng |
| `live/` | Công cụ đưa tương tác TikTok LIVE lên overlay dọc | Server Node.js quản lý người xem và truyền sự kiện qua WebSocket |

**Điểm cần hiểu:** bản web tĩnh không phải phòng trực tuyến nhiều người thật. Những người có sẵn và hoạt động bình luận/tặng quà là dữ liệu mô phỏng. Bộ LIVE mới có đường kết nối sự kiện TikTok; cả hai phần đều không triển khai thanh toán trong mã ứng dụng.

## 2. Cấu trúc và công nghệ

```text
.
├── index.html             # HTML, CSS, JavaScript của bản web tĩnh
├── assets/                # Ảnh nền, nhân vật, sprite animation, hiệu ứng
│   └── music/             # Hai bài nhạc MP3
├── live/
│   ├── server.mjs         # HTTP, WebSocket, TikTok, TTS, trạng thái phòng
│   ├── control.html       # Bảng điều khiển và công cụ mô phỏng
│   ├── overlay.html       # Cảnh 1080 × 1920 để đưa lên livestream
│   ├── package.json       # Lệnh chạy và phụ thuộc trực tiếp
│   └── package-lock.json  # Khóa cây phụ thuộc npm
├── _headers               # Cache assets cho hosting hỗ trợ định dạng này
├── README.md              # Hướng dẫn chạy và mô tả dự án
└── LICENSE                # MIT
```

Không dùng React/Vue, bundler, cơ sở dữ liệu hay ORM. JavaScript và CSS phía trình duyệt được viết trực tiếp trong HTML. Backend dùng ES modules và HTTP tích hợp của Node.js.

Phụ thuộc trực tiếp trong `live/package.json`:

| Thư viện | Phiên bản khai báo | Vai trò |
| --- | --- | --- |
| `ws` | `8.18.0` | WebSocket giữa server, control và overlay |
| `msedge-tts` | `2.1.1` | Tạo giọng đọc tiếng Việt thành MP3 |
| `tiktok-live-connector` | `2.5.0` | Đọc sự kiện phòng TikTok LIVE |

Các phiên bản trên được đọc từ source, không phải đánh giá về phiên bản mới nhất hay kết quả kiểm tra lỗ hổng. README yêu cầu Node.js 20 trở lên, nhưng `package.json` chưa có trường `engines`.

## 3. Kiến trúc và luồng dữ liệu

```text
TikTok LIVE ── connector ──┐
                          ▼
control.html ── lệnh ──> server.mjs ── sự kiện/state ──> overlay.html
                          │                               │
                          ├── Map người xem               ├── Canvas 2D
                          ├── settings, logs              ├── bảng công đức
                          └── Edge TTS → live/tts/*.mp3 ──>└── phát âm thanh
```

- HTTP mặc định lắng nghe `127.0.0.1:3000`; `/` trả bảng điều khiển.
- WebSocket dùng `/ws?role=control` và `/ws?role=overlay`.
- Client mới nhận `state` gồm cài đặt, người xem, sức chứa, thời điểm khởi động và trạng thái TikTok.
- Sau đó server phát sự kiện tăng dần như `join`, `leave`, `skin`, `chat`, `gift`, `like`, `tts`.
- Cả control và overlay thử kết nối lại WebSocket sau 2 giây khi mất kết nối.
- Không có cơ chế lưu phòng: khởi động lại server làm mất người xem, điểm, cài đặt và nhật ký trong bộ nhớ. File TTS cũ bị xóa khi khởi động.

### Giao thức chính

| Chiều | Message/lệnh | Ý nghĩa |
| --- | --- | --- |
| Control → server | `{t:'ctl', cmd:'connect', uniqueId}` | Kết nối phòng TikTok |
| Control → server | `chat`, `gift`, `fill`, `bots` | Tạo tương tác mô phỏng |
| Control → server | `settings`, `clear`, `disconnect` | Điều khiển phòng |
| Control → server | `say`, `chant`, `bell`, `mo` | Điều khiển âm thanh |
| Server → client | `state`, `settings`, `tiktok` | Đồng bộ trạng thái |
| Server → client | `join`, `leave`, `skin`, `chat`, `gift`, `like` | Cập nhật người xem và hiệu ứng |
| Server → client | `tts`, `chant`, `bell`, `mo1` | Yêu cầu phát giọng/âm thanh |
| Server → control | `logs`, `log`, `bots` | Nhật ký và trạng thái bot |

## 4. Phân tích từng phần

### 4.1. Web tĩnh — `index.html`

- Không gian logic 1080 × 1920, co theo màn hình với tỷ lệ 9:16.
- Lưới cố định 36 chỗ, dựng sẵn 22 nhân vật mẫu.
- Chỉ lưu pháp danh vào `localStorage` với khóa `phapdanh`.
- Nhân vật có trạng thái đi vào, ngồi xuống, ngồi; ba skin nam/nữ/bà có sprite animation.
- Sắp xếp nhân vật theo tọa độ Y để tạo cảm giác chiều sâu; kích thước sprite thay đổi theo hàng ghế.
- Quà tăng điểm nội bộ, tạo hiệu ứng, cập nhật bảng ba người đứng đầu.
- Giọng đọc dùng `speechSynthesis` và chỉ chọn giọng tiếng Việt tìm thấy trên máy. Không có giọng phù hợp thì hiện chữ.
- Nhạc MP3 có chuyển bài chồng âm khoảng 4 giây; Web Audio tổng hợp chuông và mõ.
- Có hoạt động demo định kỳ mỗi 4,2 giây.

Đây là bản trình diễn dễ triển khai trên hosting tĩnh. Muốn biến thành phòng dùng chung phải bổ sung backend và cơ chế định danh/đồng bộ, không chỉ đăng file lên hosting.

### 4.2. Backend — `live/server.mjs`

`viewers` là `Map` theo ID, mỗi người chứa tên, skin, avatar, điểm quà, thời điểm vào/tương tác và bình luận gần nhất.

Luồng bình luận:

1. Cắt nội dung còn tối đa 120 ký tự.
2. Nhận diện từ khóa đổi skin.
3. Tạo hoặc cập nhật người xem qua `seat()`.
4. Lưu bình luận gần nhất và phát `chat`; phát thêm `skin` nếu đổi nhân vật.

Luồng quà:

1. Chuẩn hóa tên quà và số lượng.
2. Tạo ghế nếu người tặng chưa có trong phòng.
3. Tính điểm từ giá trị quà nhân số lượng.
4. Dùng bình luận trong vòng 90 giây, dài hơn 6 ký tự, làm lời nguyện; nếu không thì chọn lời mặc định.
5. Chọn hiệu ứng: dưới 10 điểm, từ 10 điểm và từ 99 điểm.
6. Phát sự kiện `gift` và đưa lời đọc vào hàng đợi TTS theo cấu hình.

Tối đa 100 người được giữ trong bộ nhớ. Khi đầy, người chưa tặng quà và im lặng lâu nhất bị thay thế; nếu tất cả đã có điểm thì người mới không được nhận. Bảng công đức chỉ phản ánh những người còn trong `viewers`, không phải sổ tổng hợp quà bền vững.

TTS được xử lý tuần tự, hàng đợi chờ phía server tối đa 15 mục. File âm thanh được ghi vào `live/tts/`, giữ tối đa 40 file sau các lần tạo thành công. Đọc kinh tự động mặc định mỗi 3 phút.

### 4.3. Overlay — `live/overlay.html`

- Canvas cố định 1080 × 1920, toàn bộ stage co bằng CSS transform.
- Lưới 24/36/64/100 chỗ; ưu tiên ghế phía trước gần lối giữa.
- Ba vị thầy cố định là phần trang trí, không nằm trong số người xem.
- Hiển thị avatar, tên, bình luận, hiệu ứng quà/tim, bảng năm người có công đức cao nhất.
- Skin `master` dùng ảnh monk và thêm hào quang, không có file nhân vật riêng.
- Phát MP3 TTS tuần tự, hạ nhạc khi giọng đọc bắt đầu.
- Cần thao tác bật âm thanh; thời gian trên overlay tính từ lúc server khởi động, không phải thời điểm kết nối TikTok.

### 4.4. Bảng điều khiển — `live/control.html`

Ba nhóm chức năng: kết nối TikTok/người xem; tương tác và bot thử nghiệm; âm thanh/cảnh. Mỗi lần thay đổi một trường cài đặt, giao diện gửi toàn bộ nhóm cài đặt hiện có về server.

Có đủ công cụ thử cảnh khi chưa LIVE. Tuy nhiên trạng thái bot chưa nằm trong snapshot, và control chưa xử lý message `settings` từ server nên nhiều cửa sổ điều khiển có thể hiển thị cấu hình lệch nhau.

## 5. Điểm mạnh

- Ít phụ thuộc, không cần build frontend, dễ đọc và chạy thử.
- Tách bảng điều khiển khỏi cảnh phát sóng.
- Backend giữ trạng thái tập trung; snapshot giúp client phục hồi danh sách sau khi kết nối lại.
- Có dữ liệu demo và bot hỗ trợ thử nghiệm.
- Tên và nội dung bên ngoài chủ yếu đi qua `textContent` hoặc Canvas. Các chỗ `innerHTML` được thấy dùng template cố định hoặc xóa nội dung, không nội suy trực tiếp bình luận.
- Có giới hạn độ dài văn bản, payload WebSocket, hàng đợi TTS và một số cấu hình số.
- Có biện pháp hạn chế truy cập phù hợp mục tiêu chạy cục bộ.

## 6. Vấn đề và hướng cải thiện

Các phát hiện dưới đây dựa trên luồng mã; chỉ mục nhận diện skin đã được chạy kiểm tra riêng. Chưa đo trên livestream thật.

### Ưu tiên cao

| Vấn đề | Bằng chứng | Tác động và đề xuất |
| --- | --- | --- |
| Chế độ ghế cố định không giới hạn số người | `server.mjs:42,62`; `overlay.html:126` | Chọn 24 ghế vẫn nhận đến 100 người. Người dư không có ghế mới hoặc giữ ghế cũ khi thu nhỏ lưới, gây chồng hình. Cần chính sách xếp hàng/ẩn người dư hoặc giới hạn theo mode. |
| Kết nối TikTok có thể đua nhau | `server.mjs:143–177` | Biến `tiktok` chỉ được gán sau `await conn.connect()`. Bấm kết nối nhiều lần hoặc ngắt lúc đang chờ có thể để kết nối cũ hoàn tất và ghi đè trạng thái. Cần mã phiên kết nối và hủy/dispose kết nối đang chờ. |
| Hàng đợi TTS phía overlay không có giới hạn | `overlay.html:195–203`; `server.mjs:124–125` | Server tạo file có thể nhanh hơn tốc độ đọc; overlay tồn nhiều URL trong khi server xóa file quá 40 mục. Có thể phát trễ hoặc gặp 404. Nên giới hạn tuổi/độ dài hàng đợi và quản lý vòng đời file theo nhu cầu phát. |
| Bật âm thanh chưa khởi động lại hàng đợi TTS | `overlay.html:168–175,197–203` | TTS nhận trước khi có AudioContext được xếp hàng nhưng `startAudio()` không gọi `playTTS()`. Hàng đợi chỉ thử lại khi có sự kiện mới. Cần gọi phát sau khi bật tiếng và xử lý tiếp hàng đợi khi `play()` bị từ chối. |

**Cập nhật giai đoạn 0:** bốn mục ưu tiên cao trên đã được sửa trong `legacy/live/server.mjs` và `legacy/live/overlay.html`. Đã kiểm tra thủ công chế độ 100 → 24 ghế trên control/overlay; vòng đời TikTok và TTS chưa được thử với dịch vụ thật.

### Ưu tiên vừa

- **TTS thiếu timeout và cleanup chắc chắn** (`server.mjs:112–128`): nếu dịch vụ/stream không kết thúc, `ttsBusy` có thể giữ nguyên và chặn các mục sau. Dùng timeout, `finally` đóng kết nối và cơ chế thử lại có giới hạn.
- **Từ khóa đổi skin rộng hơn mô tả README** (`server.mjs:51–55`): code chấp nhận cả tiền tố trong câu tối đa ba từ. Kiểm tra thực tế cho thấy `Nam mô` → `man`, `bà ơi` → `granny`; câu đầy đủ `Nam mô A Di Đà Phật` không đổi skin. Nếu yêu cầu là từ khóa chính xác, bỏ điều kiện `startsWith`.
- **Bỏ qua quà của người mới khi 100 ghế đều có người đã tặng quà** (`seat()` và `onGift()`): `seat()` trả `null`, nên quà không được ghi điểm hay hiển thị/đọc. Nên tách ghi nhận quà khỏi quyền có ghế.
- **Cài đặt quà chưa chỉnh được**: `settings.gifts` tồn tại nhưng không có trong `SETTING_RULES` hoặc UI. Mặc định `readAll: true` làm tất cả quà đủ luồng xử lý được đưa vào TTS.
- **Đồng bộ nhiều control chưa đầy đủ**: xử lý thêm message `settings`; đưa trạng thái bot vào snapshot; tránh gửi lại toàn bộ cấu hình cũ làm ghi đè thay đổi từ cửa sổ khác.
- **Validation chưa phải schema chặt** (`server.mjs:211–219`): `Boolean('false')` là `true`; kiểu object của `settings` chưa được xác nhận trước khi dùng toán tử `in`. UI hiện gửi đúng kiểu nhưng client tự viết có thể tạo dữ liệu khác. Nên kiểm tra kiểu rõ ràng.
- **ID người xem chưa được kiểm tra bắt buộc**: một số callback dùng `uniqueId`, một số có fallback `userId`. Nếu dữ liệu thiếu ID, nhiều sự kiện có thể bị gom vào key `undefined`. Nên chuẩn hóa ID qua một hàm chung.
- **Chưa giới hạn tần suất sự kiện/lệnh**: `maxPayload` chỉ giới hạn kích thước một message; số hiệu ứng, lệnh điều khiển và tốc độ broadcast chưa có rate limit/backpressure.

### Bảo trì và hiệu năng

- Rendering, âm thanh, network và UI nằm cùng file HTML; nên tách module theo trách nhiệm trước khi mở rộng.
- Hai bản có nhiều logic trùng nhau nhưng hành vi khác: ghế, âm thanh, bảng điểm, sprite. Nên chia sẻ dữ liệu assets và các hàm thuần phù hợp.
- Canvas LIVE vẽ lại toàn cảnh và sort người xem mỗi frame. Với 100 người cần đo FPS/CPU trong môi trường OBS thật trước khi tối ưu.
- Cache avatar trong overlay không có cơ chế loại bỏ; log ở control nối chuỗi không giới hạn, dù server chỉ giữ 300 dòng.
- WebSocket dùng cố định `ws://`; nếu triển khai sau HTTPS cần chuyển theo protocol và thiết kế lại xác thực/Host allowlist.
- Chưa thấy script test/lint hoặc cấu hình CI trong phạm vi repository đã đọc.

## 7. Bảo mật và nội dung mã hóa

### Các lớp đang có

- Bind loopback mặc định; kiểm tra Host theo danh sách localhost/127.0.0.1/IPv6 loopback có cổng.
- WebSocket kiểm tra phần host của Origin, chấp nhận client không có Origin để hỗ trợ client ngoài trình duyệt.
- Chỉ nhận lệnh từ socket mang role `control`.
- Static server chỉ nhận URL dưới `/assets/` hoặc `/live/`, chặn segment bắt đầu bằng dấu chấm và `node_modules`, chặn một số đuôi source/config ngoài assets.
- Escape XML trước khi đưa văn bản vào TTS; giới hạn WebSocket payload 64 KiB.

### Giới hạn cần hiểu đúng

Role được chọn bằng query string, không phải xác thực danh tính. Client truy cập được server có thể tự chọn `role=control`; client không có Origin cũng được chấp nhận. Origin kiểm tra host, không so khớp toàn bộ origin. Đây là ranh giới cho ứng dụng cục bộ, chưa phải cơ chế phân quyền khi công khai dịch vụ.

Đổi `HOST` không tự cập nhật `ALLOWED_HOSTS`, nên truy cập bằng hostname/IP ngoài danh sách vẫn bị chặn. Static allowlist là theo thư mục và một số đuôi file, không phải danh sách chính xác từng file. Nếu mở rộng loại file hoặc cách triển khai cần rà soát lại.

Trong mã ứng dụng đã đọc không thấy chức năng nhập/lưu mật khẩu TikTok. Âm thanh TTS cần dịch vụ bên ngoài; Google Fonts và avatar cũng tạo yêu cầu mạng. Chưa kiểm toán mã phụ thuộc hay lưu lượng chạy thật.

### Đoạn chữ mã hóa ở cuối hai trang

`index.html` và `live/overlay.html` chứa mảng số `_q`, giải mã bằng XOR rồi bọc hàm render. Nội dung giải mã được xác nhận là:

> ✦ Mã nguồn được chia sẻ bởi Kent Juno ✦

Đoạn này vẽ dòng ghi công trên canvas khoảng 7 giây, theo chu kỳ ngẫu nhiên 5–10 phút. Comment gọi đây là hiệu ứng đèn nhưng hành vi thực tế là hiện chữ ghi công. Trong chính đoạn này không có thao tác mạng hay thu thập dữ liệu. Nên thay bằng mã rõ nghĩa và mô tả đúng hành vi để người bảo trì dễ kiểm tra.

## 8. Chạy và triển khai

### Bộ LIVE cục bộ

Theo yêu cầu phiên bản trong README, chuẩn bị Node.js 20 trở lên. Có lockfile nên có thể cài tái lập bằng:

```bash
cd legacy/live
npm ci
npm start
```

- Control: `http://localhost:3000/live/control.html`.
- Overlay: `http://localhost:3000/live/overlay.html`.
- Bật âm thanh ở overlay, thử demo/bot, sau đó kết nối username đang LIVE.
- OBS dùng Browser Source kích thước 1080 × 1920; TikTok LIVE Studio có thể capture cửa sổ overlay theo hướng dẫn README.

### Web tĩnh

Đưa `legacy/index.html` và `legacy/assets/` lên hosting tĩnh với `legacy/` làm publish root. `legacy/_headers` khai báo cache assets 604800 giây (7 ngày) trên nền tảng hỗ trợ; server Node hiện không đọc file này mà trả header riêng. Khi thay asset cùng tên cần lưu ý cache cũ. Server LIVE không phục vụ `index.html` ở root vì `/` được ánh xạ sang control.

## 9. Thứ tự phát triển đề xuất

1. Sửa ghế cố định, vòng đời kết nối TikTok và hàng đợi/phát TTS.
2. Chuẩn hóa ID, schema sự kiện và cài đặt; tách nhận quà khỏi ghế.
3. Đồng bộ trạng thái control và thêm timeout/retry có giới hạn.
4. Bổ sung kiểm thử hành vi: quá 24 ghế, 100 người đã tặng quà, connect/disconnect khi đang chờ, TTS trước khi bật tiếng, phục hồi WebSocket.
5. Tách module và bổ sung lưu trữ nếu cần giữ công đức/cài đặt qua lần khởi động.
6. Chỉ thiết kế triển khai nhiều người/qua mạng sau khi xác định mô hình xác thực và yêu cầu lưu dữ liệu.

## 10. Kiểm chứng đã thực hiện và giới hạn

- Đã đọc ba trang HTML, backend, manifest, README, cấu hình cache và danh sách tài nguyên.
- `node --check legacy/live/server.mjs`: đạt kiểm tra cú pháp sau khi chuyển thư mục.
- Trích script trong cả ba HTML và parse bằng `vm.Script`: đạt kiểm tra cú pháp.
- Chạy riêng hàm nhận diện skin với bốn chuỗi mẫu, xác nhận kết quả ở mục 6.
- Giải mã mảng `_q` trong hai trang, xác nhận nội dung ở mục 7.
- Chưa có `legacy/live/node_modules` tại thời điểm phân tích ban đầu; chưa kết nối TikTok hay gọi dịch vụ TTS thật.
- Những tuyên bố kiểm thử bảo mật trong README là tài liệu của dự án, chưa được xem là kết quả kiểm thử lại trong lần phân tích này.

Tài liệu này phân tích source và nêu hướng cải thiện; không thay đổi mã ứng dụng.
