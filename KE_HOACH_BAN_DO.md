# Kế hoạch: Bản đồ và dẫn đường (GPS) trong sân chánh điện

Người làm: **GPT / Codex** (vai `scene-frontend`). Viết ngày 21/11/2026.

Đọc hết file này trước khi sửa code. Muốn đổi điều gì trong mục 2 "Đã chốt" thì ghi đề xuất vào mục 9 rồi chờ người dùng
duyệt, không tự đổi.

## 0. Tóm tắt

Sân chánh điện giờ rộng ~145 × 133 m: chánh điện, sân trước, Vườn Hoa, Rừng thiền, Khu tưởng niệm, khu vui chơi, khu thú
cưng, nông trại nhỏ, Phước Điền, Đài ngắm cảnh, Vườn Đèn Tâm Nguyện. Người mới không biết khu nào ở đâu. Hiện chỉ có nút
"📍 Đi nhanh" đưa thẳng tới nơi, không cho người chơi biết đường.

Làm thêm:

1. **Màn bản đồ** nhìn từ trên xuống cả sân, mỗi khu một màu và một biểu tượng, có mũi tên "bạn đang ở đây".
2. **Dẫn đường**: chọn một điểm trên bản đồ thì trong cảnh 3D hiện **vạch sáng trên mặt đất** từ chỗ mình đứng tới đó,
   tự tính lại khi đi lệch, tới nơi thì tắt. Có nút **Tự đi** để nhân vật tự đi theo vạch.
3. **Giữ nguyên Đi nhanh** cho ai muốn tới ngay.

Lý do làm bây giờ: GTA 6 ra ngày 19/11/2026, bản đồ và chỉ đường là thứ người chơi đang quen tay. Việc này có ích thật cho
sân rộng, không chỉ để theo trend. **Không dùng tên, logo, font, biểu tượng hay màu nhận diện của GTA** ở bất kỳ đâu.

## 1. Hiện trạng code (đã kiểm ngày 21/11/2026)

| Phần | Ở đâu | Ghi chú |
| --- | --- | --- |
| Tìm đường A* lưới 25 cm | `findPath(walk, from, to)` trong `packages/scene-engine/src/walk.mjs` | Trả mảng điểm đã rút gọn đoạn thẳng, `[]` nếu không tới được. Đích sát vật cản tự lấy ô trống trong bán kính 3 ô (0,75 m). |
| Kiểm một điểm đi được không | `isWalkable(walk, x, z)` cùng file | Dùng chỉ mục ô lưới 2 m, nhanh. |
| Chạm đất để đi | `explore3d.mjs` `onPointerDown` → `api.walkTo(point, then)` | Biến `path` / `arrive` trong `explore3d`; `stepSelf` đi theo `path`. Cần điều khiển / phím xóa `path`. `walkTo` tự đứng dậy khỏi bồ đoàn. |
| Khu đang đứng | `placeOf(self)` trong `explore3d.mjs` (~dòng 1009) | Trả `hall`, `pets`, `farm`, `park`, `flowers`, `garden`, `memorial`, `wishes`, `overlook`, `myfarm`, `grove`, `courtyard`; báo trang qua `onPlaceChange`. Đang là hàm trong closure, chưa dùng lại được. |
| Đi nhanh | `apps/web/public/explore-ui.js` dòng ~319–400 | Bảng `.quick-travel-panel`, nút `data-destination`, gửi `travel.go`. `exits` là trang khác (rạp phim, phòng game). Từ 21/11/2026 chánh điện gọi với `travelHost: null`: bảng này nằm trong app Đi nhanh của điện thoại 📱; `explore` có thêm `travelPanel`, `canTravel()`, `isExit()`, `goTo()`, `place`. |
| Điện thoại 📱 | `apps/web/public/phone-ui.js`, phần "Điện thoại" cuối `chanh-dien.js` | Nút 📱 cạnh ô chat mở màn có 12 app. App **🗺️ Bản đồ** (`id: 'map'`) đang là "Sắp có", chờ đúng việc này: gắn bằng `phone.setApp('map', { run: () => mapUI.open(), soon: false })`. Màn dọc: điện thoại trồi lên từ đáy; màn rộng: ngăn phải (class `.phone` đã trong khối "Màn rộng"). |
| Tọa độ điểm đi nhanh | `THIEN_RULES.world.travel` trong `packages/room-rules` | 11 điểm `{ x, z, ry }`. Danh sách mã: `TRAVEL_DESTINATIONS` trong `packages/protocol`. |
| Dữ liệu cảnh | `scenes/thien-default/scene.json` → `world.walk` (`bounds` x −93,4…51,4, z 1,3…133,4; 13 vùng chữ nhật `areas`; 2.274 vật cản tròn / elip), `world.hall`, `world.courtyard.*` (`pond`, `guanyin`, `arhats`, `bodhi`, `fountain`, `burner`, `petZone`, `farmZone`, `park`, `flowerGarden`, `memorial`, `garden`, `overlook`, `grove`, `wishGarden`, `fields`…) | Phần sân do `node scripts/thien-garden-layout.mjs` sinh và ghi vào scene. **Không sửa tay scene.json**, sửa script rồi chạy lại. |
| Thứ tự vẽ ban đêm | `VEIL_ORDER` 50, `GLOW_ORDER` 55, `LABEL_ORDER` 60 trong `daylight3d.mjs` | Vật vẽ trước 50 bị lớp phủ đêm làm tối. Vòng vàng gợi ý ngồi (`ringMaterial` trong `explore3d`) là mẫu vật liệu vẽ trên mặt đất. |
| Nhắm mắt | class `eyes-closed` trên `#stage` (`chanh-dien.css` dòng ~47), `renderer.setLabelsHidden` | Ẩn mọi lớp trên cảnh trừ danh sách ngoại lệ. |
| Trốn tìm | `hide-seek-ui.js`, class `hs-clean` | Trong ván không được đi nhanh. |
| Màn ngang | khối "Màn rộng" cuối `chanh-dien.css`, KE_HOACH_XOAY_NGANG.md mục 10 | Bảng / thẻ mới phải thêm class vào danh sách trong khối đó để camera tự dời tâm. |
| Xem trước khi phát triển | `localStorage['debug-explore'] = '1'` → `window.chanhDienExplore`, `window.chanhDienRenderer` (`debugView`, `debugFreeCamera`) | Dùng để chụp kiểm tra. |

Đo `findPath` trên Node (máy bàn, dữ liệu thật):

| Từ → tới | Thời gian | Điểm | Dài |
| --- | --- | --- | --- |
| hall → myfarm | 71 ms | 10 | 109 m |
| overlook → grove | 36 ms | 26 | 115 m |
| hall → overlook | 28 ms | 7 | 104 m |
| farm → myfarm | 22 ms | 7 | 118 m |
| courtyard → pets | 14 ms | 11 | 58 m |
| hall → farm | 8 ms | 5 | 68 m |

Điện thoại chậm hơn 3–5 lần, nên đường dài nhất có thể tốn 200–350 ms, đủ làm khựng một khung hình. Xem mục 4.6.

## 2. Đã chốt (không tự đổi)

1. Chỉ có ở **chánh điện 3D** (`chanh-dien.html`, mọi phòng `thien-*`). Chế độ 2D, rạp phim, phòng game không có.
2. **Chỉ chạy trên máy người chơi.** Không đổi `packages/protocol`, máy realtime hay API. Không gửi tuyến đường cho ai,
   không tăng `PROTOCOL_VERSION`.
3. **Bản đồ không hiện người khác** (người, bot, bạn bè) ở đợt này. Lý do: Trốn tìm, và quyền riêng tư (danh sách bạn bè
   cố ý không trả vị trí).
4. **Đi nhanh giữ nguyên.** Lối vào bản đồ là **app 🗺️ Bản đồ trong điện thoại 📱** (đã có sẵn biểu tượng "Sắp có",
   `id: 'map'`), không thêm nút mới lên cảnh. Đi nhanh vẫn là app riêng cạnh đó. Trong bản đồ, thẻ của điểm đi nhanh có
   cả "🧭 Dẫn đường" và "⚡ Đi ngay".
5. **Cảnh là dữ liệu** (nguyên tắc kiến trúc 5): engine và trang không ghi tọa độ riêng của phòng nào. Mọi điểm, vùng màu,
   hồ, nhà đọc từ scene JSON và `THIEN_RULES.world.travel`.
6. **Bản đồ nhỏ ở góc màn hình** để sau (mục 6, đợt 3), không làm trong đợt 1–2.
7. Không thêm thư viện. Bản đồ vẽ bằng Canvas 2D, vạch dẫn đường bằng Three.js 0.160.0 sẵn có.

## 3. Thiết kế

### 3.1 Màn bản đồ

- Mở từ app "🗺️ Bản đồ" trong điện thoại (điện thoại tự cất khi mở app). Là một **bảng** (sheet): màn dọc phủ gần hết
  cảnh, có nút ✕; màn ngang là ngăn phải như các bảng khác (thêm class vào khối "Màn rộng").
- **Hướng**: chánh điện ở trên, cổng tam quan và Đài ngắm cảnh ở dưới (z tăng xuống dưới, x tăng sang phải), giống đứng ở
  cổng nhìn vào chùa. Không xoay theo hướng nhìn ở đợt này.
- **Nền**: lưới đi được (mục 4.2) tô theo khu, mỗi khu một màu nhạt; chỗ không đi được tô tối; ngoài tường để trong suốt
  trên nền màu đất. Vẽ thêm: mái chánh điện (`world.hall`), hồ (`courtyard.pond`, `grove.pond`, hồ trong `wishGarden` nếu
  có) màu nước.
- **Biểu tượng** từng khu (dùng đúng biểu tượng đang có trong `travelIcons` của `explore-ui.js`) kèm tên ngắn; tên tự ẩn khi
  thu nhỏ quá mà chồng nhau.
- **Mũi tên "bạn đang ở đây"** theo vị trí và hướng `ry` của mình, cập nhật khi bảng đang mở. Nút "◎" đưa bản đồ về giữa
  chỗ mình.
- **Phóng to / kéo**: chụm hai ngón (1× – 4×), kéo một ngón, cuộn chuột trên máy tính, chạm đúp phóng to. Mở lần đầu thì vừa
  khít cả sân.
- Vạch dẫn đường đang chạy cũng vẽ trên bản đồ.

### 3.2 Thẻ điểm đến

Chạm biểu tượng thì hiện thẻ nhỏ trong bảng:

- Tên khu, biểu tượng, quãng đường theo đường đi thật và thời gian đi bộ ước tính (`độ dài / walk.speed`), ví dụ
  "58 m · ~40 giây đi bộ".
- Nút **🧭 Dẫn đường** (đóng bảng, bật vạch), **⚡ Đi ngay** (gửi `travel.go` y như Đi nhanh; chỉ có ở 11 điểm đi nhanh).
- Đang đứng trong khu đó thì ghi "Bạn đang ở đây", tắt hai nút.

Chạm chỗ trống trên bản đồ:

- Chỗ đi được, hoặc cách chỗ đi được ≤ 3 m: ghim "📍 Điểm đã chọn" với thẻ chỉ có **Dẫn đường**.
- Xa hơn: báo "Không đi tới chỗ này được".

### 3.3 Vạch dẫn đường trong cảnh

- Một dải phẳng rộng ~0,45 m nằm trên mặt đất theo tuyến `findPath`, các khúc quanh nối liền (không hở, không chồng sáng).
- Màu vàng ấm của chùa (cùng tông với vòng `#ffd25a`), có mũi tên nhỏ chạy về phía đích (dịch UV theo thời gian); viền mờ.
- **Chỉ vẽ phần còn phía trước**: phần đã đi qua biến mất dần.
- Nằm trên mặt đi ~0,12 m để không bị mặt Đài ngắm cảnh (0,1 m) hay lối sỏi che. Bị nhà, cây, người che thì che bình
  thường (kiểm tra độ sâu bật).
- **Ban đêm vẫn rõ**: vẽ sau lớp phủ đêm (giữa `VEIL_ORDER` và `LABEL_ORDER`, ví dụ `GLOW_ORDER`), sáng như đèn lồng.
- **Đích**: vòng sáng nhịp thở dưới đất + cột sáng mờ cao ~6 m nhìn thấy từ xa, mờ dần khi lại gần.
- Không thêm quá 2 lệnh vẽ; chỉ dựng lại hình khi tuyến đổi.

### 3.4 Thẻ GPS đang chạy

- Thẻ nhỏ ngay dưới hàng nút phòng (cùng chỗ kiểu nút "Đang nắm tay"; có cả hai thì xếp chồng):
  "🧭 Khu vui chơi · 45 m", nút **▶ Tự đi** / **⏸ Dừng**, nút **✕** tắt dẫn đường.
- Số mét cập nhật khoảng 4 lần mỗi giây theo phần đường còn lại.
- Tới cách đích ≤ 2,5 m: thông báo "Đã tới Khu vui chơi", vạch và thẻ tắt sau ~1 giây.

### 3.5 Tự đi

- Bấm **▶ Tự đi**: nhân vật đi theo tuyến bằng chính cơ chế `path` / `arrive` của chạm-để-đi (thêm hàm trong `explore3d`
  nhận tuyến đã tính, không tính lại).
- Còn > 15 m thì chạy (`walk.runSpeed`), gần thì đi bộ.
- Đẩy cần điều khiển / bấm phím là tự đi dừng (như hiện nay), **vạch vẫn giữ**.
- Đang ngồi bồ đoàn / ghế đá thì đứng dậy rồi đi (như `walkTo`).
- Đang nắm tay và là người đi theo: tắt nút Tự đi (người đi theo bám người dẫn), vạch vẫn hiện. Là người dẫn thì tự đi bình
  thường, người theo đi cùng.

### 3.6 Các tình huống

| Tình huống | Xử lý |
| --- | --- |
| Đi lệch khỏi vạch > 3 m | Tính lại tuyến từ chỗ mới; tối đa 1 lần / 1,5 giây. |
| Đi nhanh (`travel.go`), đổi phòng, tải lại cảnh, về cổng, sang 2D | Tắt dẫn đường. Đi nhanh đúng tới điểm đang dẫn thì coi như đã tới. |
| Không tìm được đường | Thẻ báo "Không tìm được đường tới đây", không bật vạch. |
| Trốn tìm: đang chờ hoặc đang chơi | Tắt dẫn đường lúc vào hàng chờ; chạm app "🗺️ Bản đồ" thì báo "Đang chơi Trốn tìm" thay vì mở (`blocked`). |
| Nhắm mắt / "Ẩn chữ & nút" | Ẩn vạch, đích và thẻ GPS; mở mắt thì hiện lại, tuyến không mất. |
| Chế độ xem (spectator) | Không có bản đồ / dẫn đường. |
| Đổi tiểu bang / vùng | Không ảnh hưởng: bố cục đi lại trong tường giống nhau ở mọi vùng. |
| Mất kết nối | Dẫn đường vẫn chạy (chỉ chạy trên máy). |
| Đang mở bảng khác (vườn, linh thú…) | Vạch vẫn hiện; thẻ GPS ẩn như dòng tin khi đang mở bảng (mục 10 KE_HOACH_XOAY_NGANG). |

## 4. Kỹ thuật

### 4.1 Tách `placeOf` ra module dùng chung

- Tạo `packages/scene-engine/src/places.mjs`: `placeOf(world, point, extras)` thuần, không cần Three.js.
  - `extras` là các khung đang tính trong `explore3d`: `gardenBounds`, `memorialBounds`, `fieldsData.area`.
  - Nếu tính lại được từ `world` thì tính trong module luôn.
- Thứ tự xét giữ y hệt bản hiện tại (`hall` trước, `courtyard` cuối). `explore3d` gọi module này, hành vi không đổi.
- Không cần sửa import map: web server tự khai báo mọi file `.mjs` trong `packages/scene-engine/src` thành
  `/engine/<tên>.mjs` (`apps/web/server.mjs`). Import bằng đường dẫn như các module khác, đừng tự thêm `?v=`.

### 4.2 `packages/scene-engine/src/map2d.mjs` (thuần, test được trên Node)

- `buildMapRaster(world, { cell = 0.5 })`:
  - Ô 0,5 m trên `walk.bounds` (~290 × 264 ô).
  - Mỗi ô ghi `0` = ngoài vùng, `1` = vướng vật cản, `2 + mã khu` = đi được, khu tính bằng `placeOf`.
  - Trả `{ cols, rows, cell, origin, cells: Uint8Array, zones: [...] }`.
  - Tính một lần cho mỗi `sceneId`, nhớ trong bộ nhớ. Đo thời gian; nếu > 150 ms trên máy bàn thì chia nhỏ qua
    `requestIdleCallback` và hiện "Đang vẽ bản đồ…".
- `worldToMap` / `mapToWorld` cho phép chiếu (theo hướng ở mục 3.1).
- `mapPoints(world, travel)`:
  - 11 điểm đi nhanh: vị trí biểu tượng là tâm khu, đích dẫn đường là tọa độ `travel`.
  - Cộng các điểm phụ ở mục 5.
- Không vẽ gì trong module này. Trang tự vẽ raster ra Canvas (`ImageData`, mỗi ô một pixel rồi phóng bằng
  `imageSmoothingEnabled = false` hoặc có làm mềm, chọn cái nào đẹp hơn).

### 4.3 `packages/scene-engine/src/route3d.mjs`

- `createRouteView({ THREE, root })` trả `{ setRoute(points, goal), setProgress(distance), setHidden(bool), tick(time), dispose() }`.
- Hình dải: mỗi đỉnh mang khoảng cách dọc tuyến (UV.x tính theo mét). Shader bỏ phần có khoảng cách < `progress`, nên mỗi
  khung chỉ đổi một uniform, không dựng lại hình.
- Vật liệu: `MeshBasicMaterial` mở rộng bằng `onBeforeCompile` (như `water3d.mjs`) hoặc `ShaderMaterial` nhỏ;
  `transparent`, `depthWrite: false`, `toneMapped: false`, `renderOrder` sau lớp phủ đêm.
- Ảnh mũi tên vẽ bằng canvas trong code, không thêm file ảnh.
- Hàm toán thuần tách riêng để test trên Node: `routeLength`, `projectOnRoute(points, p) → { distance, offset }`,
  `remaining`.

### 4.4 API mới của `explore3d`

Thêm vào `api` (không đổi các hàm cũ):

- `navigateTo(goal, { id })`: tính tuyến từ chỗ mình, bật vạch. Trả `{ ok, length }`.
- `stopNavigation()`.
- `followRoute(on)`: bật / tắt Tự đi bằng `path` / `arrive` sẵn có.
- `onNavigation(callback)`: báo trang `{ state: 'active' | 'arrived' | 'failed' | 'stopped', id, remaining }` để thẻ GPS cập nhật.
- `mapState()`: `{ self: { x, z, ry }, place }` cho mũi tên trên bản đồ (không trả vị trí người khác).
- `setRouteHidden(bool)`: dùng khi nhắm mắt / ẩn chữ.

Kiểm lệch và tính lại nằm trong vòng lặp sẵn có của `explore3d` (sau `stepSelf`), không thêm `requestAnimationFrame` riêng.

### 4.5 Giao diện `apps/web/public/map-ui.js`

- Module mới như `farm-ui.js` / `stopwatch-ui.js`: dựng bảng bản đồ, thẻ điểm đến, thẻ GPS. Gọi từ `chanh-dien.js` khi
  dựng `explore-ui`.
- Gắn vào điện thoại trong `chanh-dien.js`: `phone.setApp('map', { run: () => mapUI.open(), soon: false })` (app đã khai
  báo trong danh sách `apps` của `createPhoneUI`). Đang Trốn tìm thì dùng `blocked: () => 'map.busyHideSeek'` để app báo
  lý do thay vì mở. "⚡ Đi ngay" gọi `explore.goTo(id)`; kiểm tra đi lại được bằng `explore.canTravel()`.
- Chữ người dùng không có ở đây; tên khu từ i18n, vẫn chỉ dùng `textContent`.
- CSS trong `chanh-dien.css`, tiền tố class `map-` (kiểm tra trước không đụng class sẵn có).
- Màn ngang:
  - Bảng bản đồ thêm vào danh sách ngăn phải trong khối "Màn rộng".
  - Thẻ GPS đặt theo `--room-bar-bottom`.
  - Cả hai thêm vào ngoại lệ của `eyes-closed` / `hs-clean` **chỉ nếu** muốn hiện lúc ẩn chữ. Theo mục 3.6 thì không thêm.

### 4.6 Hiệu năng (bắt buộc đo)

- `findPath` đường dài nhất hiện 71 ms trên máy bàn. Mục tiêu: một lần tính ≤ 50 ms khi Chrome giả CPU chậm 4×; không
  khung hình nào > 50 ms lúc bắt đầu dẫn đường; tính lại ≤ 1 lần / 1,5 giây.
- Nếu không đạt, chọn một trong các cách sau và ghi số đo vào mục 8:
  - Thêm **tùy chọn** `findPath(walk, from, to, { cell: 0.5 })`, mặc định giữ 0,25 m để chạm-để-đi và test cũ không đổi.
    Kiểm các khe hẹp vẫn qua được: cửa chánh điện 2,6 m, cổng hông Rừng thiền 2,4 m, cổng gỗ Phước Điền 2,2 m (theo
    `walk.areas`).
  - Tính lại chỉ đoạn đầu (≤ 20 m) rồi nối vào tuyến cũ.
  - Web Worker: lưu ý import map không áp cho worker, phải dùng đường dẫn có `?v=` do server cấp. Chỉ làm nếu hai cách trên
    không đủ.
- Raster bản đồ: tính một lần, ≤ 150 ms máy bàn, không chặn khung hình khi mở bảng lần đầu (mục 4.2).
- Bảng bản đồ đang mở: vẽ lại canvas chỉ khi kéo / phóng / mũi tên đổi, không vẽ mỗi khung.
- `renderer.stats()` trước / sau khi bật vạch: thêm ≤ 2 lệnh vẽ, không cấp phát bộ nhớ mỗi khung.

### 4.7 Chữ (i18n)

- Thêm khóa vào cả bốn từ điển vi / en / zh / es trong `thien-i18n.js`, ví dụ `map.open`, `map.title`, `map.here`,
  `map.navigate`, `map.go`, `map.pin`, `map.unreachable`, `map.noRoute`, `map.arrived`, `map.walk`, `map.stop`,
  `map.distance` ("{m} m · ~{s} giây đi bộ"), `map.busyHideSeek`, `map.point.<id>`.
- Tên 11 khu dùng lại `travel.<id>` sẵn có.

## 5. Điểm phụ trên bản đồ

Ngoài 11 điểm đi nhanh, thêm các điểm chỉ dẫn đường được (không có "Đi ngay"):

| Mã | Biểu tượng | Lấy từ |
| --- | --- | --- |
| `lotus-pond` | 🪷 | `courtyard.pond` |
| `guanyin` | 🙏 | `courtyard.guanyin` |
| `arhats` | 🗿 | `courtyard.arhats` (đầu đường La Hán) |
| `bodhi` | 🌳 | `courtyard.bodhi` |
| `fountain` | ⛲ | `courtyard.fountain` |
| `burner` | 🪔 | `courtyard.burner` (lư hương trước điện) |
| `wishes` | 🏮 | `courtyard.wishGarden` |
| `water-pavilion` | 🛖 | `courtyard.grove.pavilion` (thủy đình, đích là đầu bến gỗ) |

Đích đứng của các điểm này phải nằm ở chỗ đi được, không phải tâm tượng / hồ:

- Thêm `world.map.points` [{ id, icon, x, z, goal: { x, z } }] vào scene, do `scripts/thien-garden-layout.mjs` sinh từ chính
  dữ liệu trên. Ví dụ đích đặt trước mặt tượng 2–3 m, bờ hồ phía lối đi. Chạy script để ghi scene.
- `validateWorld` / kiểm dạng trong `world.mjs` nhận khóa mới (tùy chọn, thiếu thì bản đồ chỉ có 11 điểm).
- Biểu tượng và mã thuộc dữ liệu scene, tên hiển thị thuộc i18n `map.point.<id>`.

## 6. Lộ trình

### Đợt 1: bản đồ + vạch + thẻ GPS

- Mục 4.1, 4.2, 4.3, 4.4 (trừ `followRoute`), 4.5, 4.7 với 11 điểm đi nhanh.

**Xong khi:**

- Mở bản đồ ở 390×844, 844×390, 1440×900 thấy cả sân, đúng hướng, mũi tên đúng vị trí và hướng.
- Từ mọi điểm đi nhanh dẫn đường được tới 10 điểm còn lại; vạch nằm trên đất, không xuyên tường, đi lệch tự tính lại,
  tới nơi tự tắt.
- Ban đêm (`?sun=-15`) vạch vẫn rõ; ban ngày không chói.
- Nhắm mắt, Trốn tìm, Đi nhanh, đổi phòng xử lý đúng bảng mục 3.6.
- Số đo mục 4.6 đạt và ghi vào mục 8.
- `npm run lint`, `npm test` qua.

### Đợt 2: tự đi + điểm phụ + chỉnh đẹp

- `followRoute` và nút Tự đi (mục 3.5).
- Điểm phụ mục 5, chạm chỗ trống để ghim.
- Cột sáng ở đích, tên khu tự ẩn khi chồng nhau.

**Xong khi:**

- Tự đi từ chánh điện tới Phước Điền, Rừng thiền, Đài ngắm cảnh không kẹt.
- Đẩy cần điều khiển là dừng mà vạch còn.
- Nắm tay đúng mục 3.5.
- Mọi điểm phụ tới được (test).

### Đợt 3 (để sau, chưa làm): bản đồ nhỏ góc màn hình

Chỉ làm khi người dùng yêu cầu. Ghi ý tưởng vào mục 9 nếu có.

## 7. Kiểm tra

Test Node (`packages/scene-engine/test/map.test.mjs`, chạy trong `npm test`):

- `placeOf` mới cho đúng mã khu tại mỗi điểm `THIEN_RULES.world.travel` (trừ `courtyard` nằm giữa sân) và trả kết quả giống
  hệt bản cũ trên một lưới điểm mẫu khắp sân.
- `worldToMap` / `mapToWorld` đi rồi về đúng.
- Raster: kích thước đúng, mọi điểm đi nhanh rơi vào ô đi được của đúng khu.
- `projectOnRoute`, `routeLength`, `remaining` với tuyến mẫu (thẳng, gãy khúc, điểm ngoài tuyến).
- Mọi `world.map.points[].goal` đi được và `findPath` tới được từ `travel.courtyard` và `travel.hall` (thêm vào `walk.test.mjs`
  như các test Rừng thiền / Phước Điền sẵn có).
- Nếu thêm tùy chọn `cell` cho `findPath`: 11 × 11 cặp điểm đi nhanh đều có đường với `cell: 0.5`, và mọi test cũ giữ nguyên.

Trên trình duyệt (cần `npm run dev`; **không tắt dev server cổng 3000 nếu đang chạy, có thể là của phiên khác**):

- Chrome chạy ngầm như `npm run theme:shots`, bật `localStorage['debug-explore'] = '1'`.
- Chụp 390×844, 667×375, 844×390, 1180×820, 1440×900: bảng bản đồ mở, thẻ điểm đến, thẻ GPS, vạch nhìn từ camera sau lưng
  ở 4 chỗ: giữa sân, cửa chánh điện, lối ra Đài ngắm cảnh, cổng gỗ Phước Điền.
- Lặp lại ở đêm `?sun=-15` và ở `?state=fl`, `?state=vn`.
- Không lỗi trong console, không chồng lên hàng nút / cần điều khiển / bảng Tấm lòng thành.
- Hiệu năng: DevTools CPU 4× chậm, bắt đầu dẫn đường hall → myfarm, ghi khung dài nhất.

## 8. Nhật ký (GPT ghi khi làm)

Mỗi lần xong một phần thì thêm dòng: ngày, việc đã làm, số đo (thời gian `findPath`, raster, lệnh vẽ), ảnh đã chụp ở đâu,
việc còn lại. Xong đợt nào thì cập nhật đoạn mô tả tương ứng trong `AGENTS.md` (một đoạn ngắn như các tính năng khác) và
đổi dòng trỏ tới file này.

- **21/11/2026 — Đợt 1 hoàn thành (GPT/Codex):** tách `placeOf` sang `packages/scene-engine/src/places.mjs`; thêm
  raster Canvas 2D / phép đổi tọa độ ở `map2d.mjs`, app điện thoại `apps/web/public/map-ui.js`, vạch + đích Three.js ở
  `route3d.mjs`, API xem trước / dẫn đường / dừng / trạng thái bản đồ trong `explore3d.mjs`; gắn đủ 11 điểm Đi nhanh,
  bốn ngôn ngữ, chặn lúc Trốn tìm và ẩn/dừng theo các trạng thái ở mục 3.6. Tuyến GPS dùng `findPath(..., { cell: 0.8 })`;
  mặc định 0,25 m của đi bộ cũ không đổi. Lúc chọn thẻ điểm đến, tuyến và buffer vạch được chuẩn bị khi bảng còn che cảnh;
  bấm Dẫn đường chỉ bật mesh đã có. Dải mũi tên là một mesh, vòng/cột đích là một mesh, `renderOrder = 55`; tiến độ chỉ
  đổi uniform theo nhịp kiểm tra 200 ms, không dựng lại geometry mỗi khung.
  - **Hiệu năng thật:** Chrome DevTools CPU chậm 4×, hall → myfarm: tìm tuyến + chuẩn bị vạch **34,6 ms**, lệnh bấm
    Dẫn đường **0,5 ms**, khung dài nhất trong 12 khung đầu **23,6 ms**; `renderer.stats()` ổn định **500 → 502**,
    đúng **+2 draw calls** của vạch. Tính lại giới hạn một lần /
    1,5 giây (thử kéo lệch tuyến phát hiện và dựng lại sau **1,64 giây**, gồm nhịp kiểm tra 200 ms). Raster 291×266 ô,
    cell 0,5 m dựng **28,5 ms** (lần đo khác 32,1 ms); sau khi ổn định, `drawCount` giữ nguyên **2 → 2** qua 2,2 giây.
  - **Kiểm tra:** test mới xác nhận `placeOf`, đổi tọa độ, raster, toán tuyến và toàn bộ 121 cặp trong 11 điểm với cả
    cell 0,5 / 0,8; `npm run lint` và `npm test` qua. Chrome không có console/page error.
  - **Ảnh:** `.data/map-shots/` — bảng ở 390×844, 667×375, 844×390, 1180×820, 1440×900; thẻ điểm; GPS giữa sân,
    cửa điện ban đêm (`sun=-15`), lối Đài ngắm cảnh (`state=fl`), cổng Phước Điền (`state=vn`); thêm ảnh bản đồ ở đêm,
    Florida và Việt Nam. Đã xem trực tiếp, không chồng cần điều khiển / thanh hành động; vạch ngày không chói và đêm rõ.
  - **Còn lại đúng kế hoạch:** Đợt 2 (Tự đi, điểm phụ, ghim) và Đợt 3 (bản đồ nhỏ góc màn hình); không làm sớm.

## 9. Đề xuất chờ duyệt

(Trống. Muốn đổi điều gì ở mục 2 thì ghi vào đây.)

## Quy tắc khi làm

- Đọc `AGENTS.md`, nhất là "Quy ước code" và "Nguyên tắc kiến trúc".
- Khớp phong cách file đang sửa; comment tiếng Việt như code xung quanh.
- Không sửa phần đang làm dở của agent khác. Thấy file đang có thay đổi chưa commit không phải của mình thì chỉ thêm vào,
  không hoàn tác.
- Không commit / push trừ khi người dùng yêu cầu; đang ở `main` thì tạo nhánh trước.
- Báo kết quả thật, kể cả test lỗi hoặc bước bỏ qua.
