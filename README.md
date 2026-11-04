# Chánh Điện Online

Nền tảng web nhiều phòng xem chung, xây dựng từ bản chánh điện 2.5D và bộ công cụ TikTok LIVE ban đầu.

Repository đã có nền móng realtime, tài khoản, Cinema và Chánh điện nhiều người. Chánh điện hiện chia phòng
theo 50 tiểu bang Hoa Kỳ + Washington, D.C. và bốn ngôn ngữ: Việt, Anh, Trung, Tây Ban Nha.

## Chạy nền tảng mới

Cần Node.js 22.13 trở lên.

```bash
npm ci
npm run dev
```

Sau đó mở:

- Web: `http://127.0.0.1:3000`
- API health: `http://127.0.0.1:4000/health`
- Realtime health: `http://127.0.0.1:4001/health`
- Quản trị bài giảng: `http://127.0.0.1:3000/admin-thien.html`
- Sớ Cầu an/Cầu siêu gửi từ chánh điện được lưu bền, ghi nguyên tử với quyền file `0600` tại
  `DATA_DIR/prayer-slips.json` (mặc định `.data/prayer-slips.json`); nhà chùa xem và cập nhật trạng thái ngay trên
  trang quản trị bằng `ADMIN_SECRET`. Đây là dữ liệu cá nhân: không commit vào Git; trên VPS phải đặt `DATA_DIR` ở
  volume bền vững và sao lưu có mã hóa. Không đặt API lưu sớ trên filesystem tạm của serverless/Vercel Functions.

Để mở link công khai cho người ở xa, cài Cloudflare Tunnel một lần rồi chạy:

```bash
brew install cloudflared
npm run online
```

Lệnh sẽ in link HTTPS dạng `https://...trycloudflare.com` và chuyển tiếp cả API lẫn WebSocket. Link tồn tại trong
thời gian lệnh đang chạy; URL hiện tại cũng được ghi vào `.data/public-url.txt`. Nếu tunnel rớt, bộ chạy sẽ tự
mở lại. Nếu muốn dùng ngrok theo cách cũ, chạy `TUNNEL_PROVIDER=ngrok npm run online`.

Từ sảnh có thể mở hai trải nghiệm:

- Cinema realtime: `http://127.0.0.1:3000/room.html?room=cinema-1`. Mở hai tab với hai tên khác nhau để thử presence, chọn ghế và chat.
- Chánh điện mới: `http://127.0.0.1:3000/chanh-dien.html`. Chọn tiểu bang và ngôn ngữ ở cổng vào;
  giao diện đổi toàn bộ theo ngôn ngữ đã chọn. Mỗi cặp tiểu bang/ngôn ngữ có dãy phòng riêng, ví dụ
  `Arizona · PV1`, `PV2` cho tiếng Việt và `Arizona · PA1`, `PA2` cho tiếng Anh. Khi toàn bộ bồ đoàn theo
  cấu hình đã được người thật giữ, API tự xếp người tiếp theo vào phòng số kế tiếp.

## Cấu hình Chánh điện theo tiểu bang và ngôn ngữ

Cấu hình nằm trong `packages/room-rules/src/index.mjs`:

- `US_STATES`: mã tiểu bang, tên hiển thị và múi giờ IANA dùng để tính 18:00 địa phương.
- `THIEN_LANGS`: mã phòng và giọng đọc của `vi`, `en`, `zh`, `es`.
- `THIEN_EVENT`: giờ sự kiện và một YouTube `videoId` riêng cho từng ngôn ngữ.
- `THIEN_RULES.seats`: số bồ đoàn được hiển thị, sức chứa người thật và ngưỡng mở phòng tiếp theo. Scene hỗ trợ
  tối đa 20; hiện cấu hình là 20. Khởi động lại API và realtime sau khi đổi giá trị này.

Giờ phát và bốn bài giảng có thể sửa trực tiếp ở `/admin-thien.html`; cấu hình được lưu tại
`.data/thien-event.json` và chánh điện đang mở tự cập nhật trong tối đa 60 giây. Trang quản trị yêu cầu
`ADMIN_SECRET`. Nếu chưa đặt biến này, local dùng cùng giá trị với `SESSION_SECRET`; mặc định local là
`local-development-secret-change-before-deploy`. Khi chạy thật nên đặt một khóa riêng tối thiểu 16 ký tự:

```bash
ADMIN_SECRET='mot-khoa-quan-tri-dai-va-rieng' npm run dev
```

Thử bài giảng ngay mà không chờ đến 18:00 bằng URL kiểm thử:

1. Vào một phòng từ `http://127.0.0.1:3000/chanh-dien.html`.
2. Giữ nguyên URL có `?invite=...`, rồi thêm `&event=now` vào cuối URL.

## Mã mời phòng

Sau khi vào chánh điện, bấm **Sao chép mã phòng** để sao chép link mời. Link chỉ chứa mã `invite` đã mã hóa,
không lộ mã phòng nội bộ. Người khác mở link sẽ được chọn đúng tiểu bang, ngôn ngữ và vào cùng phòng. Nếu
phòng đã đủ bồ đoàn, người đó được trả về cổng vào và có thể vào phòng kế tiếp từ sảnh.

Mã mời hết hạn sau 30 ngày. Mã bị sửa dù chỉ một ký tự sẽ bị từ chối. `SESSION_SECRET` phải có ít nhất 32 ký
tự và phải giữ ổn định giữa các lần khởi động; thay khóa này sẽ làm các link mời cũ mất hiệu lực.

Đường `/thien/` là bản 2.5D cũ, được giữ riêng cho bộ TikTok LIVE.

Kiểm tra mã nguồn:

```bash
npm run lint
npm test
```

## Chạy bản TikTok LIVE cũ

```bash
cd legacy/live
npm ci
npm start
```

Bảng điều khiển: `http://localhost:3000/live/control.html`. Xem hướng dẫn đầy đủ trong [legacy/README.md](legacy/README.md).

## Cấu trúc

```text
apps/web              web client và sảnh
apps/api              HTTP API stateless
apps/realtime         tiến trình giữ trạng thái phòng realtime
packages/protocol     hợp đồng message client ↔ server
packages/scene-engine engine cảnh Canvas 2.5D
packages/room-rules   cấu hình và luật phòng
scenes                dữ liệu cảnh
tools/seat-editor     công cụ đặt ghế
loadtest              kịch bản kiểm tra tải
infra                 hạ tầng và triển khai
legacy                web tĩnh và TikTok LIVE ban đầu
```

Kiến trúc và lộ trình nằm trong [KE_HOACH.md](KE_HOACH.md). Quy ước làm việc nằm trong [AGENTS.md](AGENTS.md).

## Nguồn gốc và trách nhiệm

Bản chánh điện 2.5D và công cụ TikTok LIVE ban đầu do **Kent Juno** thực hiện và được giữ nguyên trong `legacy/`. Xem hướng dẫn, phần ghi công và thông tin ủng hộ tác giả tại [legacy/README.md](legacy/README.md).

Tượng 3D trong chế độ nhập vai dùng bản quét qua Sketchfab (đã giảm lưới, bake lại texture, một số đổi màu đồng):
- Bàn thờ chánh điện (Tây Phương): A Di Đà "Amitabha Buddha" và Quan Âm "Guan Yin Bodhisattva" của AmitabhaNZ (CC BY); Địa Tạng "Ksitigarbha Bodhisattva - Statue" của kieuvantruong060194 (CC BY).
- Hai Hộ pháp ngoài hiên: "Guardian Figure: Nio" 1972.158.1/.2 của Cleveland Museum of Art (CC0).
- Quan Âm: "12th C CE Water-Moon Guanyin" của Minneapolis Institute of Art (CC0).
- La Hán, CC0: "Figure of seated arhat with a vase" của Wirtualne Muzea Małopolski; "10th C BCE Chinese monk" của Minneapolis Institute of Art.
- La Hán, CC BY: "Monk Statue (Kek Lok Si Buddhist Temple, Penang)" của nate_sid; "Budai Statue - Low Poly" của ThomasRedfern12; "Seated Buddhist monk in orange robe" của gtmkf123; "Monk Statues" của local.yany; "Ksitigarbha(地藏菩薩), お地蔵さん(Ojizo-Sama) statue" và "Kasa Jizō" của pierreparfait01; "Jizo Bosatsu statue by MANOWORKS" của manoworks; "Jizo statue in Kyoto - MTSU Animation" của fusion.

Bản nén để dùng trên web nằm ở `apps/web/public/models/statues/`.

Dự án được cung cấp nguyên trạng cho mục đích học tập và tham khảo. Người sử dụng tự chịu trách nhiệm về nội dung phát sóng, quà/donation, bản quyền tài nguyên, điều khoản TikTok, YouTube và các dịch vụ bên thứ ba, cũng như pháp luật áp dụng. Dự án không đại diện cho bất kỳ chùa, tu viện hay tổ chức tôn giáo nào; nội dung Phật giáo cần được sử dụng với sự tôn kính.

## Giấy phép

MIT, xem [LICENSE](LICENSE).
