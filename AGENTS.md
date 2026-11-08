# AGENTS.md

Hướng dẫn chung cho mọi trợ lý lập trình AI (Claude Code, Codex…) làm việc trong repo này. `CLAUDE.md` import file này; sửa quy ước ở đây, không sửa ở `CLAUDE.md`.

## Dự án

Chánh Điện Online: chánh điện 2.5D (ảnh nền + sprite + Canvas 2D) kèm bộ công cụ TikTok LIVE. Đang được chuyển thành **nền tảng web nhiều phòng xem chung** (Cinema, Thiền/Tụng kinh, Music, phòng ngôn ngữ, Private, Dating), mục tiêu 100.000 người online cùng lúc.

Đọc trước khi làm việc lớn:
- [KE_HOACH.md](KE_HOACH.md): mục tiêu, kiến trúc, lộ trình 9 giai đoạn, điều kiện "Xong khi", vai trò agent.
- [PHAN_TICH_SOURCE.md](PHAN_TICH_SOURCE.md): phân tích code hiện có và các lỗi đã biết.
- [KE_HOACH2.md](KE_HOACH2.md): bàn giao việc đang làm dở — sân ngoài chùa (cảnh vật, bóng đổ), cách kiểm tra bằng Chrome chạy ngầm.

## Trạng thái code hiện tại

Giai đoạn 0 đã bắt đầu. Monorepo mới nằm trong `apps/`, `packages/`, `scenes/`; code cũ được giữ trong `legacy/`:

| Đường dẫn | Là gì |
| --- | --- |
| `legacy/index.html`, `legacy/assets/` | Web tĩnh, một người, dữ liệu mô phỏng |
| `legacy/live/server.mjs` | Server Node (HTTP + WebSocket + TikTok + TTS), state trong bộ nhớ |
| `legacy/live/overlay.html`, `legacy/live/control.html` | Cảnh 1080×1920 cho livestream và bảng điều khiển |

Cấu trúc đích (giai đoạn 0 sẽ dựng):

```
apps/web  apps/api  apps/realtime
packages/protocol  packages/scene-engine  packages/room-rules
scenes/  tools/seat-editor/  loadtest/  infra/  legacy/
```

## Lệnh

Nền tảng mới (Node.js ≥ 22.13, cần `node:sqlite` cho tài khoản):

```bash
npm ci
npm run dev
# web: http://localhost:3000
# API health: http://localhost:4000/health
# realtime health: http://localhost:4001/health
```

Mở cho người ở xa vào (ngrok đã đăng nhập; web/API/realtime ở cổng 3100/4100/4101, khóa phiên lưu ở `.env.online`; số bot chánh điện: `BOTS_THIEN=8 npm run online`, 0 để tắt):

```bash
npm run online   # in ra link https công khai; Ctrl+C để tắt
```

Tài khoản và Vườn Công Đức (ví xu ảo, kho, luống) lưu ở `.data/app.db` (đổi bằng `DATA_DIR`); ngày tưới vườn theo `GARDEN_TIMEZONE` (mặc định `America/Los_Angeles`). Vườn có 50 luống (5 hàng × 10, bố cục `THIEN_GARDEN` trong room rules, `node scripts/thien-garden-layout.mjs` ghi vào scene); bot đi dạo tới (0, 62) / (0, 74) có thể rẽ vào vườn (`bots.garden` trong `THIEN_RULES`, mỗi phòng một bot một lúc), hỏi API việc qua `POST /internal/garden/bot` (hái → tưới → gieo), đi lối giữa các hàng tới luống rồi làm, mỗi chuyến làm liền tối đa 3 việc (`bots.garden.perVisit`) rồi mới ra; bot giữ tối đa 30% số luống (`BOT_PLOT_LIMIT`), chỉ chăm luống của bot. Luống đổi (người hay bot), mộ ở Khu tưởng niệm và công trình chung: API báo **mọi** máy realtime trong `REALTIME_INTERNAL_URLS` (`apps/api/realtime-broadcast.mjs`; mỗi máy phát cho phòng nó giữ); `garden.plot` kèm mốc `at` tăng dần (cả `GET /api/v1/garden` và câu trả lời thao tác) để trình duyệt bỏ qua dữ liệu luống cũ tới trễ. Bật đăng nhập Google: đặt `GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com` trước khi chạy (origin của trang phải nằm trong "Authorized JavaScript origins" của client đó).

Khu tưởng niệm (sân chánh điện mở rộng thành 104 m, khu này ở dải đất mới phía tây; bố cục `THIEN_MEMORIAL` trong room rules, `node scripts/thien-garden-layout.mjs` ghi vào scene; điểm đi nhanh `memorial`): 36 ô mộ, thành viên trả 100 xu (ví vườn, giao dịch `memorial`) đắp một mộ ghi tên (1–24 ký tự, qua bộ lọc chữ và sổ khóa như chat), bia hiện R.I.P, giữ 24 giờ rồi ô trống lại (`GRAVE_*` trong `@chanh-dien/garden`, bảng `memorial_graves`). API `GET /api/v1/memorial`, `POST /api/v1/memorial/build` (Idempotency-Key); đổi ô thì báo realtime `/internal/memorial` → `memorial.grave`. Mỗi mộ mới báo nhóm Telegram kèm tên người đắp; quản trị gỡ bằng `/xoamo <số ô>` (không hoàn xu).

Khu vui chơi (bên phải sân đá trước chánh điện; điểm đi nhanh `park`): mô hình `nhanvat/park.glb` (2 bộ xích đu, tháp + cầu tuột, đu quay, thú nhún, khung leo) — `node scripts/park-model.mjs` cắt 4 ghế xích đu khỏi mô hình rồi nén ra `apps/web/public/models/park/park.glb`; vị trí, số đo ghế / đường trượt và vật cản lấy theo mô hình ở `PARK_*` trong `scripts/thien-garden-layout.mjs`. 2 xích đu (`B-7`, `B-8`) và 1 cầu tuột (`B-9`) khai báo như ghế đá có `kind: 'swing' | 'slide'` + `approach` (điểm chờ), mỗi món 2 chỗ, chọn chỗ qua `bench.select` (`benches.count` = 9 trong `THIEN_RULES`). Engine (`packages/scene-engine/src/park3d.mjs`) tải mô hình, vẽ ghế xích đu riêng và tính dáng theo giờ máy: xích đu đu qua lại (ghế đu theo), cầu tuột leo thang → ngồi → trượt → đi vòng về; hai chỗ lệch pha. Bot chọn món còn chỗ như chọn ghế đá (`BOT_BENCH_CHANCE`), chơi 20–60 giây (`BOT_PLAY_MS`).

Nông trại nhỏ (dải cỏ phía đông khu thú cưng, `c.farmZone` trong `scripts/thien-garden-layout.mjs`, vùng = `THIEN_RULES.world.farmArea`; điểm đi nhanh `farm` 🐐): cổng chính phía nam, lối nối với khu thú cưng ở z = 88 (hàng rào đông khu thú cưng và hàng rào tây nông trại cùng chừa lối), chuồng gỗ đỏ, máng ăn, cỏ khô, ao vịt (`barn`, `trough`, `hay`, `duckpond` trong `addPetZone` của `courtyard3d.mjs`). 8 con thuộc 6 loài mô hình Meshy (file gốc `nhanvat/farm/<loài>.glb`, bản nén `apps/web/public/models/pets/farm-<loài>.glb`): thỏ (Bông Gòn, Mochi), vịt (Vịt Vàng, Vịt Bầu), dê con, heo con, nai sao, ngựa con; dùng chung bộ não đi lại với thú cưng (`animals3d.mjs`, thông số theo loài: thỏ nhảy cóc, vịt lạch bạch). Tương tác như thú cưng (`pet.interact`, đứng trong `petArea` hoặc `farmArea`) với lời và thức ăn riêng từng loài (`pet.<loài>.<hành động>` trong i18n, `FOOD` trong `animals3d.mjs`) và thêm hành động `trick` "Làm trò" cho mọi loài (`trickPose`: thỏ nhảy tưng, vịt vỗ cánh, dê đứng hai chân, heo lăn, nai cúi chào, ngựa chồm, chó quay vòng, mèo lăn). Bot đi dạo cũng ghé nông trại.

Vườn Hoa (bãi cỏ phía tây sân trước, giữa chánh điện và Khu tưởng niệm; điểm đi nhanh `flowers` 🌸): khu ngắm cảnh, bố cục `FLOWER*` trong `scripts/thien-garden-layout.mjs` ghi vào `world.courtyard.flowerGarden` — hàng rào cây xén, cổng vòm hoa hồng ở cạnh đông (lối đá từ lối giữa) và lối ra bắc tới Khu tưởng niệm, 4 luống (tulip sọc cầu vồng, oải hương, hồng bụi, cúc cánh bướm), quảng trường có đình bát giác, đèn vườn, cây anh đào, bướm bay. Engine `packages/scene-engine/src/flowers3d.mjs` vẽ hoa bằng InstancedMesh (mỗi loại hình một lượt vẽ, màu theo từng cây). 4 ghế đá quanh đình là `B-10`…`B-13` (`benches.count` = 13); bot đi dạo dừng ở các điểm ngắm (`flowerGarden.views`) và ngồi các ghế đó như ghế đá khác.

Linh thú (đợt 1, menu ⚙ → 🐾 Linh thú, `apps/web/public/pet-ui.js`; class CSS tiền tố `spirit-`, đừng dùng `pet-` vì đã thuộc thú cưng ngoài sân): Cá Chép, Rùa Thần, Hạc Tiên, Sư Tử (`SPIRIT_PETS` trong `@chanh-dien/garden`). Giá nhận nuôi (kim cương) và bật / tắt bán do admin đặt ở trang admin mục 09 (`/api/v1/admin/shop/pets`, bảng `spirit_pet_prices` ở shop; giá trong code chỉ là giá khởi tạo). Nhận nuôi `POST /api/v1/pets/adopt` trừ qua sổ shop `spend` lý do `pet_adopt` (Idempotency-Key; mỗi loài một con, không ghi được thì hoàn). Nuôi bằng xu ví vườn: cho ăn `PET_FOOD_PRICE` = 5 xu, mỗi ngày (theo `GARDEN_TIMEZONE`) một bữa; linh thú đào xu vào rương theo loài (cấp 1: 0,8 / 0,8 / 1 / 1,2 xu/giờ, mỗi cấp +4 %, cấp 10 ×1,36), rương đầy sau 30 giờ đào thì ngừng, bấm Nhận để lấy. Không phạt: ≤ 24 giờ từ bữa cuối đào đủ, 24–48 giờ một nửa, lâu hơn thì ngủ (không mất gì, cho ăn bữa thường là dậy). Cấp theo số ngày được cho ăn (`PET_LEVEL_DAYS`, tối đa 10). Cân bằng (test "cân bằng xu" trong `apps/api/test/pets.test.mjs` chạy code thật): chăm mỗi ngày tháng đầu lãi ~18 / 18 / 23 / 29 xu/ngày; vào 2 / 3 / 7 ngày một lần lãi ít dần nhưng không âm; đủ 4 con cấp 10 ~98 xu/ngày, dưới thu nhập của người chơi miễn phí chăm chỉ (~120). Đổi tên qua bộ lọc chat. Bảng `spirit_pets`, giao dịch xu `pet_food` / `pet_yield`. Đi theo chủ ngoài sân (đợt 2): mỗi tài khoản dẫn theo tối đa một con (bảng `spirit_pet_companion`, con đầu tiên tự được chọn; `POST /api/v1/pets/companion { species | null }`, nút "Dẫn theo" trên thẻ). Vé vào phòng mang `pet: { species, level }`; đổi con / nhận nuôi / cho ăn (lên cấp) thì API báo mọi máy realtime `/internal/account-pet` để cả phòng thấy ngay; `room.state` có `pet?` (protocol, không mang tên linh thú). Hình là mô hình Meshy (file gốc `nhanvat/spirits/<loài>.glb`, bản nén `gltf-transform optimize … --simplify-ratio 0.2 --simplify-error 0.012 --texture-size 512 --texture-compress webp --compress meshopt` ở `apps/web/public/models/spirits/`, ~4–8 nghìn tam giác, 110–230 KB); engine `packages/scene-engine/src/spirit3d.mjs` chuẩn hóa kích thước / hướng lúc tải, chuyển động bằng code, bản dựng bằng khối chỉ là hình dự phòng lúc đang tải hoặc tải lỗi; linh thú cách camera > 30 m thì ẩn. Ảnh chân dung trong bảng Linh thú (`apps/web/public/models/spirits/<loài>.webp`, 192 px nền trong suốt) dựng từ chính các mô hình đó; ảnh lỗi thì hiện emoji. Cá Chép bơi lơ lửng và Hạc Tiên bay ngang vai phải (không che nhân vật khi camera ở sau lưng), Rùa Thần và Sư Tử đi sau lưng; cấp 4 có vòng sáng, cấp 7 đốm sáng bay quanh, cấp 10 hào quang vàng và thân ánh vàng. Vị trí linh thú do từng máy tự tính theo chủ, không gửi qua server. Khoảng 30 % bot chánh điện cũng dẫn theo linh thú (`bots.spiritPets` trong `THIEN_RULES`).

Hồ nước và Vườn Hoa (thiết kế lại): mặt nước hồ sen lớn và ao vịt dùng chung vật liệu `packages/scene-engine/src/water3d.mjs` (vật liệu chuẩn mở rộng bằng `onBeforeCompile`: giữa thẫm mép nhạt, gợn sáng, viền bọt; `tick` mỗi khung). Mô hình trang trí Meshy đặt bằng `packages/scene-engine/src/props3d.mjs` (`placeProp` một bản, `instanceProp` nhiều bản bằng InstancedMesh; tải lỗi thì giữ hình dựng bằng khối): đá bờ, sen, đèn đá (`c.pond.lanterns`), nhà vịt (`duckhouse` trong `c.farmZone.props`) ở `apps/web/public/models/scene/`, đình ở `apps/web/public/models/flowers/pavilion.glb`; lau sậy dựng bằng code (`addReeds`). Đá, sen của hồ lớn vẫn hiện theo giai đoạn công trình chung. Hoa trong luống, cây anh đào và cổng vòm hoa hồng là ảnh dựng từ mô hình Meshy (`apps/web/public/models/flowers/<tên>.webp`): hoa và cây là billboard quay về camera, đung đưa theo gió (cánh trắng của tulip / cúc nhuộm màu theo instance), cổng vòm là hai tấm ảnh cố định. Quy trình Meshy cho vật nhiều mảnh nhỏ (hoa, cây, cổng hoa): tạo với `should_remesh: false` rồi dựng thành ảnh; kiến trúc (đình): tạo chi tiết đầy đủ rồi dùng API Remesh của Meshy (~20k tam giác, giữ ảnh màu) — Meshy giảm lưới thấp ngay lúc tạo làm vỡ hình thành mảnh vụn; `scripts/sloppy-simplify.mjs` giảm mạnh được nhưng làm hỏng UV nên chỉ dùng cho vật không cần ảnh màu đẹp; `scripts/carve-interior.mjs` khoét lòng mô hình kín. File nén meshopt lưu tọa độ dạng số nguyên chuẩn hóa: đổi sang số thực trước khi gộp biến đổi vào lưới (`props3d.mjs` đã làm). Chụp kiểm tra: `window.chanhDienExplore.debugFreeCamera(true)` + `window.chanhDienRenderer.debugView(vị trí, đích)`, `debugPick(x, y)` cho biết vật dưới điểm trên màn hình (cần `localStorage.debug-explore = '1'`).

Trang Ủng hộ (`/ung-ho.html`, quyên góp tự nguyện duy trì server, không đổi ra xu): đặt `DONATE_ZELLE_NAME`, `DONATE_ZELLE_HANDLE` (email/số điện thoại Zelle) và tùy chọn `DONATE_MEMO`, `DONATE_MONTHLY_GOAL`, `DONATE_MONTH_RAISED` (USD, số nguyên, cập nhật tay), `DONATE_CONTACT` trước khi chạy API. Người chọn khu vực Việt Nam (mã `vn`, đứng đầu danh sách khu vực ở cổng chánh điện, phòng `thien-vn-<ngôn ngữ>-<số>`) chỉ thấy mã QR; mọi khu vực khác thấy Zelle rồi mục "Góp qua MoMo" (mã VietQR, MoMo quét được) ngay dưới: đặt `DONATE_VIETQR_IMAGE` (đường dẫn ảnh .png/.jpg/.webp trên máy chủ, API phát ở `/api/v1/donate/vietqr`) và `DONATE_VIETQR_NAME`. Không ghi các giá trị này vào repo; chưa đặt thì trang hiện "đang cập nhật".

Shop nhân vật (`/shop.html`): mua hình nhân vật (hiện có Bé Mũ Đỏ = mô hình chibigirl) bằng kim cương 💎; kim cương chỉ có khi nạp qua Stripe Checkout (ví riêng, không đổi qua lại với xu). Đặt `STRIPE_SECRET_KEY` (sk_test_… khi thử) và `STRIPE_WEBHOOK_SECRET` (endpoint `https://<domain>/api/v1/stripe/webhook`, sự kiện `checkout.session.completed` + `checkout.session.async_payment_succeeded`); tùy chọn `PUBLIC_URL` (gốc trang để Stripe đưa người dùng quay về). Thiếu khóa thì shop vẫn mở, chỉ tắt nạp. Danh mục món ở `SHOP_ITEMS` (`@chanh-dien/room-rules`). Gói nạp (số 💎, giá USD, bật/tắt) chỉnh ở trang admin (`/admin-thien.html`, mục 05, khóa `ADMIN_SECRET`), lưu bảng `shop_packs`; lần đầu tạo bảng lấy `DIAMOND_PACKS` trong `apps/api/shop.mjs`. Ô 💎 trên header chùa/rạp (`gem-ui.js`) mở bảng nạp. Mở phim ở rạp (thêm video vào hàng chờ) tốn `content.videoPrice` 💎 (20, trong `CINEMA_RULES`), chỉ thành viên: máy realtime kiểm tra video + hàng chờ, gọi `POST /internal/shop/spend` (ghi sổ `spend`, khóa theo `requestId`, bảng `shop_spends`) rồi mới thêm video; không thêm được thì `POST /internal/shop/refund` (hoàn tối đa một lần); trừ xong gửi `wallet.update` cho chủ ví. Nhân vật mới: admin mục 06 tải file `.glb` có khung xương kiểu Mixamo + động tác Walking (Meshy "Rig & Animate", ≤ 40k tam giác, ≤ 64 MB); API kiểm tra rồi nén bằng `@gltf-transform/cli` (dependency chạy production), lưu `DATA_DIR/models/shop-<tên>.glb`, danh mục ở bảng `shop_catalog`; engine `packages/scene-engine/src/rigged3d.mjs` chạy động tác và tạo dáng ngồi/quỳ/lạy bằng xương. Nhún nhảy (emote `dance`, menu ▾, chỉ ngoài sân chùa): file có điệu nhảy (tên động tác chứa Dance / Hip Hop / Cheering / Jump…) thì chạy điệu đó; không có thì nhún bằng code theo kiểu admin chọn ở mục 06 (`bounce`, `sway`, `spin`, `hop`, `nod`; cột `dance` bảng `shop_catalog`); hình có sẵn trong code mỗi hình một kiểu (`BUILTIN_DANCE` trong `chibi3d.mjs`). Khu thú cưng: thú khối (Mộc, Nâu, Sữa, Miu, Mây, Bông) và thú có mô hình riêng Milo, Fox (chó), Meomeo (mèo) — file gốc `nhanvat/pet/<loài>_<tên>.glb`, bản nén (`gltf-transform optimize … --simplify-ratio 0.02 --texture-size 512 --texture-compress webp --compress meshopt`) ở `apps/web/public/models/pets/`, khai báo `model`/`height`/`modelRy` trong `world.courtyard.animals` (sửa ở `scripts/thien-garden-layout.mjs`), mã thú thêm vào `THIEN_RULES.world.pets`. Nút ✨ Tương tác (emote `act`, chỉ ngoài sân; thay nút 💃 Nhún nhảy cũ): mỗi lần bấm chọn ngẫu nhiên một động tác trong kho = các động tác trong file ngoài đi / chạy / đứng (`BASE_CLIP` trong `rigged3d.mjs` và `shop.mjs`) + 5 kiểu nhún nhảy bằng code (`DANCE_STYLES`), không lặp lại động tác vừa làm; chọn theo `at` của message emote nên mọi máy thấy cùng động tác. Động tác trong file chạy một lần, kiểu bằng code chạy 4 giây. Emote `dance` vẫn nhận (client cũ).

Báo phiếu Góp ý & Báo lỗi qua Telegram: đặt `TELEGRAM_BOT_TOKEN` (tạo bot với @BotFather) và `TELEGRAM_CHAT_ID`; tùy chọn `SUPPORT_ADMIN_URL` (link trang admin kèm trong tin). `npm run telegram:setup` kiểm tra bot, tìm chat ID (`-- --save` ghi vào `.env.online`) và gửi tin thử (`-- --test`). `npm run online` tự nạp các dòng `KEY=VALUE` trong `.env.online` (gitignore), biến đặt trên dòng lệnh được ưu tiên.

Chat với bot qua Telegram (`apps/api/bot-chat.mjs`): người chơi bấm "💬 Nhắn" trên thẻ bot (hoặc gõ tin bắt đầu bằng `@Tên bot`) → tin báo về nhóm Telegram kèm mã; trả lời bằng `/tl <mã> <nội dung>` hoặc Reply vào tin báo rồi gõ nội dung → bot nói câu đó trong phòng (tự thêm `@Tên người hỏi`). Bot cũng nhận kết bạn (trong phiên), nắm tay (bot đi theo người dẫn) và khiêu chiến như người thật; bạn bot lưu theo tên (thành viên: bảng `bot_friends`, khách: localStorage) nên ra vào phòng không mất. Thẻ bot không còn ghi "Phật tử ảo (máy)"; AI vẫn nói thật là bot khi được hỏi. Thành viên nhắn bot thì cuộc trò chuyện (tin mình nhắn, câu bot trả lời / bắt chuyện, câu quản trị trả lời bằng `/tl`) lưu bảng `bot_talk` theo tài khoản + tên bot, chỉ trong ngày (`GARDEN_TIMEZONE`), 400 tin/ngày; màn 💬 Tin nhắn → Bạn bè liệt kê bạn bot, mở ra xem lại qua `GET /api/v1/me/bot-thread?name=<tên>`. Bạn bot hiện y như bạn là người (không chữ "bot" nào trên giao diện): chung danh sách với bạn người, hiện tin cuối (`botFriends[].last` trong `GET /api/v1/me/friends`), số tin chưa đọc (mốc đã xem giữ ở localStorage), "Đang online" khi đang ở cùng phòng. Nhắn riêng được bất cứ lúc nào, bot không cần ở phòng nào: `POST /api/v1/me/bot-thread { name, text }` (phải là bạn bot, qua bộ lọc chat, 8 tin/phút) lưu tin và báo Telegram ("Tin nhắn riêng"); tin riêng không dùng AI, chỉ quản trị trả lời bằng `/tl <mã>` (câu trả lời vào thẳng cuộc trò chuyện, báo `inbox.notify`). Nhắn chung trong phòng (`@Tên bot`) thì AI (Groq) trả lời như trên. Câu bot nói trong phòng vẫn lưu qua `/internal/bot-chat` kèm `fromBot: true`.

Bạn bè (`apps/api/friend-links.mjs`): máy realtime báo API danh sách thành viên đang online mỗi 15 giây (`/internal/presence`, trạng thái chỉ giữ trong bộ nhớ API); danh sách trả trạng thái online nhưng không trả phòng, mã mời, `participantId` hay vị trí của người/bot. Người chơi vẫn có thể "Mời" bạn vào phòng mình và "Nhắn" (≤ 200 chữ, đọc được cả khi bạn offline, qua bộ lọc chat). Lời nhắn/lời mời lưu bảng `friend_notes` (chỉ trong ngày, tính từ nửa đêm theo `GARDEN_TIMEZONE`; lời mời bấm được 15 phút); có thư mới thì API báo máy realtime gửi `inbox.notify`. Người chơi có thể "Ẩn mình với bạn bè". Nút 💬 cạnh ô chat chánh điện (`apps/web/public/chat-center.js`) mở màn Tin nhắn: thẻ Chung là chat của phòng trong ngày (máy realtime giữ tối đa 100 tin trong bộ nhớ, gửi `chat.history` cho người mới vào, qua nửa đêm `GARDEN_TIMEZONE` thì xóa), thẻ Bạn bè là trò chuyện riêng hai chiều với từng bạn (`GET /api/v1/me/friends/thread?with=<accountId>`, cùng bảng `friend_notes`, 200 tin/ngày).

Bot nói bằng AI (`apps/realtime/bot-ai.mjs`, Groq gói miễn phí, model mặc định `qwen/qwen3.8-27b`): đặt `GROQ_API_KEY` cho máy realtime (tùy chọn `BOT_AI_MODEL`; `BOT_AI=0` tắt hẳn). Bot đi dạo tự bắt chuyện người đứng gần (mỗi phòng 3–6 phút một lần, mỗi người 30 phút một lần, nói theo ngôn ngữ người chơi vừa gõ; bỏ qua người đang ngồi/tụng kinh/nắm tay): chào, rủ oẳn tù tì, hoặc mời sang Lô Tô/Tài Xỉu/Bầu Cua (`game.invite`); nhắn `@Tên bot` thì AI trả lời (vẫn báo Telegram, `/tl` vẫn trả lời thay được). Câu AI viết phải qua bộ lọc chat; thiếu khóa, hết hạn mức (6 lượt/phút, 300 lượt/ngày mỗi máy) hoặc lỗi thì dùng câu mẫu. Người chơi tắt bằng "🔕 Đừng mời nữa" hoặc menu ⚙ (`bot.quiet`). Ngoài sân bot nói chuyện đời thường, hai bot gần nhau đối đáp, có người chào cả sân thì bot gần đó chào lại (câu mẫu `bots.talk` trong room rules, không tốn lượt AI; cả phòng tối đa một câu nói vu vơ / 8 giây). `addbot chanhdien N` áp dụng N bot cho từng chánh điện tiểu bang (`thien-<bang>-<ngôn ngữ>-<số>`): tổng bot đúng N (tối đa `bots.max` = 200 trong `THIEN_RULES`, phòng ngôn ngữ khác còn bị giới hạn bởi số tên bot), bot ngồi không vượt số bồ đoàn còn trống (20), còn lại đi dạo ngoài sân. Bot đi khắp sân theo bản đồ đi lại của scene (`apps/realtime/bot-nav.mjs` đọc `scenes/<sceneId>/scene.json`, lưới 0,5 m, tìm đường A*; `bots.walk.roam`): tự chọn chỗ tới (ghế đá — ngồi thật qua `selectBench`, bờ hồ, đài phun, bồ đề, Quan Âm, La Hán, khu thú cưng, cổng, hoặc đi loanh quanh), mỗi bot một tốc độ, đứng ngắm quay mặt vào cảnh, dừng nhìn quanh giữa đường, tránh đứng chồng lên người khác; không đọc được scene thì đi vòng theo `bots.walk.waypoints`. Số bot `addbot` đặt cho mỗi phòng không đứng yên: dao động ±10 quanh con số đó (không dưới min(số đặt, 2), không vượt giới hạn bot của phòng), mỗi 15–45 giây thêm/bớt một bot, ưu tiên bot rảnh rời trước (`driftBotCount` trong `apps/realtime/server.mjs`); `addbot 0` vẫn tắt hẳn. Riêng phòng công cộng `loto-1` quanh 30 bot, luôn giữ bàn chạy, dao động kiểu đám đông (`bots.drift = { spread: 12, daily, randomStart }` trong `LOTO_RULES`, `driftCrowd`): mở phòng chọn ngẫu nhiên trong 18–42, mỗi 3–8 phút chọn đích mới lệch quanh tâm = 30 × hệ số giờ (`BOT_CROWD_HOURS` theo `GARDEN_TIMEZONE`: khuya vắng, 20–22h đông), xa đích thì vào/ra dồn (5–15 giây/người), gần đích thì thưa (15–50 giây), thỉnh thoảng một bước ngược chiều; bot đang có vé ở lại tới hết ván. Mỗi bot có thói quen mua vé riêng (`bots.tickets`): có ván ngồi xem (mua 50–95% số ván), có bot hay mua 2 vé, mua rải rác trong pha mua vé (`botBuyTicket`) nên số người chơi / số vé mỗi ván một khác; phòng ≤ 4 bot thì bot nào cũng mua. `BOTS_LOTO` hoặc lệnh `addbot loto N` ghi đè con số gốc (mở phòng đúng N rồi dao động quanh N), còn `loto-private` không tự thêm bot. Rạp phim luôn có 10–30 bot (`bots.range` trong `CINEMA_RULES`): mở rạp là có ngay số bot ngẫu nhiên trong khoảng, mỗi bot ngồi một ghế trống ngẫu nhiên (`randomSeat`), số bot dao động trong khoảng đó; `addbot` và `BOTS_CINEMA` đều không đổi số bot rạp (máy realtime bỏ qua `BOTS_CINEMA`).

Kiểm duyệt chat toàn hệ thống (`packages/moderation` lọc từ, `apps/api/moderation.mjs` sổ khóa, `apps/realtime/moderation.mjs` lọc từng tin): tin có từ cấm bị chặn; chửi 3 lần/giờ (phòng `strict`; phòng khác 4) thì tắt chat 10 phút, tái phạm trong 24 giờ khóa nick 24 giờ (khách: chặn IP băm); nick mới nhắn trùng hàng loạt bị khóa 7 ngày + chặn IP 24 giờ, chừa người nhắn đầu. Mỗi lần khóa và mỗi từ khả nghi báo về cùng nhóm Telegram (cần `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`; lệnh trong nhóm cần thêm `TELEGRAM_WEBHOOK_SECRET`): `/blockchattu <từ>`, `/boblockchattu <từ>`, `/dschattu`, `/unban <mã k-… | tên>`, `/ban <tên> [giờ]`, `/dsban`. Trang admin mục 07 xem sổ khóa, mở khóa, thêm/bỏ từ. Máy realtime đồng bộ sổ khóa + từ từ API mỗi 15 giây (`API_INTERNAL_URL`). Từ có dấu chỉ so chữ có dấu (tránh chặn "các", "đi", "đeo"); từ không dấu chỉ khớp khi người dùng gõ không dấu.

Phòng Lô Tô riêng (`apps/api/private-rooms.mjs`, luật `loto-private` / `PRIVATE_LOTO` trong room rules): thành viên trả 50 xu mở phòng `loto-p-<mã>` (trang `/loto.html?room=<mã>`), tối đa 20 khách: mời bạn đã lưu (người hoặc bạn bot) hoặc gửi link phòng (thành viên đã đăng nhập mở link là tự thành khách, không cần kết bạn; API kiểm tra lúc cấp vé). Không có bot tự vào, bot được mời tự mua vé. Chủ phòng đuổi được người/bot, người bị đuổi không vào lại bằng link được (bảng `private_room_kicked`) trừ khi chủ phòng mời lại; chủ phòng rời (bấm Đóng phòng hai lần) thì máy realtime báo `/internal/private-rooms/closed`, đóng phòng cho cả nhóm và hủy ván dở để hoàn vé. Lưu bảng `private_rooms`, `private_room_members`, `private_room_kicked`.

Deploy không làm rớt ván: SIGTERM máy realtime chờ ván đang lắc / chốt tiền xong (tối đa 10 giây), lưu snapshot phòng kèm ván Lô Tô / Bầu Cua / Tài Xỉu (`toRecord` / `restoreRecord` / `resume` trong `loto.mjs`, `bau-cua.mjs`; xúc xắc lắc trước khi chốt nên dựng lại ván đang lắc vẫn mở đúng kết quả), rồi ghi `DATA_DIR/realtime-<NODE_ID>.json` (đổi bằng `REALTIME_STATE_FILE`): kế hoạch `addbot` và, khi không có Redis, snapshot + epoch của danh bạ trong bộ nhớ. Bật lại thì nạp file, áp dụng lại addbot, ván chạy tiếp với đồng hồ lùi ít nhất 4 giây cho người chơi nối lại; tiền vé / cược vẫn ở API, chốt bằng cùng `roundId`.

Web server là cổng vào chung: `/api/*` chuyển tới API, `/ws` chuyển tới realtime; client dùng cùng origin với trang.

Thử cảnh 2.5D và đặt ghế (khi `npm run dev` đang chạy):

```bash
# http://localhost:3000/scene-demo.html          (thêm ?scene=thien-default&n=36&bench=1 để đo ms/khung)
# http://localhost:3000/tools/seat-editor/
```

Chạy 2 máy realtime dùng chung Redis (thử failover):

```bash
docker compose -f infra/docker-compose.dev.yml up -d redis
npm run dev:cluster
# realtime thứ hai: http://localhost:4002/health
```

Kiểm tra:

```bash
npm run lint
npm test
REDIS_URL=redis://127.0.0.1:6379 node --test packages/room-directory/test/*.test.mjs  # chạy thêm bộ test trên Redis thật
```

Bản legacy:

```bash
cd legacy/live && npm ci && npm start
# control: http://localhost:3000/live/control.html
# overlay: http://localhost:3000/live/overlay.html (bấm "Bật âm thanh")
```

Kiểm tra cú pháp server cũ: `node --check legacy/live/server.mjs`.

## Quy ước code

- JavaScript ES modules, ít phụ thuộc, không thêm framework/bundler khi chưa có quyết định trong `KE_HOACH.md`.
- Khớp phong cách file đang sửa: cách đặt tên, mật độ comment, cách tổ chức.
- Chữ hiển thị cho người dùng bằng tiếng Việt (phòng ngôn ngữ: vi/en/es).
- Văn bản từ người dùng chỉ đưa ra màn hình qua canvas hoặc `textContent`, không `innerHTML` có nội suy. Escape trước khi đưa vào TTS/SSML.
- Validate mọi message vào theo schema, kiểm tra kiểu rõ ràng, cắt độ dài.
- Phụ thuộc ghim phiên bản chính xác.
- Không đưa secret, API key vào repo.

## Nguyên tắc kiến trúc (không tự ý thay đổi)

1. Một phòng do đúng một máy realtime giữ; lease + epoch trong Redis; snapshot 2–5s.
2. Phòng ≤ ~500 kết nối; tối đa `maxWalkers` nhân vật đi lại (room rules, chốt bằng load test), còn lại xem; đông thì mở thêm phòng cùng loại.
3. Video chỉ **nhúng YouTube** (IFrame Player API). Server chỉ phát `{videoId, startedAt, paused}`. **Không vẽ gì đè lên khung player.**
4. Chat Cinema hiện bong bóng trên đầu nhân vật, giới hạn số bong bóng và độ dài.
5. Cảnh là dữ liệu (scene JSON); engine không chứa tọa độ riêng của phòng nào.
6. Quà: ghi sổ Postgres với idempotency key trước, hiệu ứng sau.
7. Message client↔server chỉ định nghĩa trong `packages/protocol`.
8. Di chuyển nhân vật gửi gom gói (`move` ≤ 5 lần/giây khi đi, server gom 200 ms thành `room.moves`); va chạm/tìm đường ở client theo `world.walk` trong scene JSON.

Muốn đổi một nguyên tắc: đề xuất và cập nhật `KE_HOACH.md` trước, không đổi lặng lẽ trong code.

## Vai trò

Chia việc theo ranh giới code. Định nghĩa đầy đủ ở `.claude/agents/<tên>.md`; custom agent Codex tương ứng nằm ở `.codex/agents/<tên>.toml` và trỏ về cùng hướng dẫn để tránh lệch quy ước.

| Vai trò | Phạm vi | Hướng dẫn | Codex |
| --- | --- | --- | --- |
| realtime-backend | `apps/realtime`, `apps/api`, Redis, Postgres, `legacy/live/server.mjs` | [.claude/agents/realtime-backend.md](.claude/agents/realtime-backend.md) | [.codex/agents/realtime-backend.toml](.codex/agents/realtime-backend.toml) |
| scene-frontend | `apps/web`, `packages/scene-engine`, `scenes/`, `tools/seat-editor`, YouTube, legacy HTML | [.claude/agents/scene-frontend.md](.claude/agents/scene-frontend.md) | [.codex/agents/scene-frontend.toml](.codex/agents/scene-frontend.toml) |
| infra-scale | `infra/`, `loadtest/`, CI, CDN | [.claude/agents/infra-scale.md](.claude/agents/infra-scale.md) | [.codex/agents/infra-scale.toml](.codex/agents/infra-scale.toml) |
| qa-tester | Test mọi phần, kiểm tra "Xong khi" | [.claude/agents/qa-tester.md](.claude/agents/qa-tester.md) | [.codex/agents/qa-tester.toml](.codex/agents/qa-tester.toml) |
| trust-safety | Rà soát chỉ đọc: bảo mật, kiểm duyệt, Dating, điều khoản | [.claude/agents/trust-safety.md](.claude/agents/trust-safety.md) | [.codex/agents/trust-safety.toml](.codex/agents/trust-safety.toml) |

## Quy trình (checklist)

Ở `.claude/skills/<tên>/SKILL.md`; `.agents/skills/<tên>` là symlink tới cùng thư mục cho Codex. Sửa skill ở `.claude/skills/`; skill mới thì tạo ở đó rồi thêm symlink tương ứng. Làm đúng checklist khi gặp việc tương ứng:

| Việc | Checklist |
| --- | --- |
| Chạy dự án trên máy | [run-local](.claude/skills/run-local/SKILL.md) |
| Thêm/sửa loại phòng | [add-room-type](.claude/skills/add-room-type/SKILL.md) |
| Thêm/sửa cảnh 2.5D | [add-scene](.claude/skills/add-scene/SKILL.md) |
| Thêm/sửa message client↔server | [protocol-change](.claude/skills/protocol-change/SKILL.md) |
| Kiểm tra đồng bộ YouTube | [youtube-sync-check](.claude/skills/youtube-sync-check/SKILL.md) |
| Load test | [load-test](.claude/skills/load-test/SKILL.md) |
| Kiểm tra failover | [chaos-failover](.claude/skills/chaos-failover/SKILL.md) |
| Deploy máy realtime | [deploy-drain](.claude/skills/deploy-drain/SKILL.md) (chỉ khi người dùng yêu cầu) |
| Làm phần 3D (Three.js 0.160.0, `packages/scene-engine/src/renderer3d.mjs`) | `.claude/skills/threejs-*` (13 skill bên thứ ba, xem [THIRD_PARTY_THREEJS.md](.claude/skills/THIRD_PARTY_THREEJS.md)); dự án không dùng React nên bỏ qua `threejs-react-three-fiber` trừ khi đổi hướng |

## Quy tắc làm việc

- Chạy test/kiểm tra liên quan trước khi báo xong; báo kết quả thật, kể cả lỗi hoặc bước bỏ qua.
- Thay đổi giao diện: kiểm tra trên trình duyệt ở khung điện thoại 9:16.
- Chỉ commit/push khi người dùng yêu cầu; đang ở `main` thì tạo nhánh trước.
- Hỏi trước khi: deploy, xóa dữ liệu/tài nguyên, chạy load test ngoài môi trường test, gọi dịch vụ trả phí, đổi nguyên tắc kiến trúc.
- Load test và chaos test không nhắm vào môi trường thật hay dịch vụ bên thứ ba (YouTube, TTS) — dùng mock.
- Tôn trọng nội dung Phật giáo trong phòng Thiền; giữ phần miễn trừ trách nhiệm và ghi công trong README.
