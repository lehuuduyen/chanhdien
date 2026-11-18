# Màn hình xoay ngang: phân tích UI/UX và kế hoạch

Đo ngày 17/11/2026 trên dev bằng Chrome chạy ngầm giả lập cảm ứng: điện thoại ngang 844×390 (iPhone 14), iPad ngang
1180×820, máy tính 1440×900.

## 0. Tóm tắt

- Hiện chỉ **rạp phim** chịu màn ngang (chế độ xem ngang, video cao kín màn). **Chánh điện** khóa khung 9:16 nên khi xoay
  ngang chỉ còn một dải 219×390 px giữa màn (26 % bề ngang), giao diện chồng lên nhau; iPad ngang và máy tính cũng chỉ thấy
  một cột hẹp giữa hai dải đen. **Phòng game** là cột giữa: dùng được nhưng nút chính (phỉnh cược, Kéo/Búa/Bao, mua vé)
  bị đẩy xuống dưới mép màn, phải cuộn trong lúc đếm giờ.
- Thử cho khung chánh điện phủ ngang: cảnh 3D đẹp ngay (three.js tự theo tỉ lệ), phần phải làm lại là **lớp giao diện**:
  245 kích thước tính theo bề ngang khung (`cqw`) và 49 lớp đặt tuyệt đối theo bố cục dọc.
- Đề xuất: một bố cục **màn rộng** cho chánh điện dùng chung cho điện thoại ngang, iPad ngang và máy tính (cảnh phủ kín,
  nút dồn ra hai mép, thẻ / bảng thành ngăn bên phải); game chia hai cột; bố cục dọc giữ nguyên từng điểm ảnh.
- Ước lượng 7–9 ngày công, chia 5 đợt (mục 6); đợt 0 (1 ngày) sửa ngay chỗ phải cuộn khi đang chơi.

## 1. Hiện trạng

| Trang | Ở màn ngang 844×390 | Mức |
| --- | --- | --- |
| Trang chủ | Bố cục rộng sẵn, đọc được | Nhẹ |
| Cổng chánh điện | Khung 219×390; form "Vào chánh điện" tràn, bị cắt mép phải | Nặng |
| Trong chánh điện (3D) | Khung 219×390; thanh trên, cột nút trái, cần điều khiển, thẻ nhiệm vụ, nút Đứng/Quỳ chồng lên nhau | Nặng |
| Thẻ / bảng trong chánh điện (Bấm giờ, hồ sơ, vườn, nông trại, trò hai người, linh thú, tin nhắn…) | Bóp trong khung hẹp, chữ xuống nhiều dòng, phải cuộn | Nặng |
| Chánh điện trên iPad ngang / máy tính | Cột 9:16 giữa màn, hai bên đen; dùng được nhưng phí 60–70 % màn | Trung bình |
| Rạp phim | Tự vào "xem ngang": video cao kín màn, nút ✕ 🔇 ✨ bên phải; Android vào toàn màn hình và khóa ngang. Nhưng ở ngang không mở được chat / hàng chờ (báo "Xoay dọc để về giao diện đầy đủ") | Tốt, thiếu chat |
| Bầu Cua, Tài Xỉu | Cột ~400 px giữa màn; bàn cược thấy nửa trên, phỉnh và nút cược dưới mép | Trung bình |
| Lô Tô | Nút "Mua 1 vé / 2 vé" sát mép dưới, vé và bảng số phải cuộn | Trung bình |
| Oẳn Tù Tì (đang đấu) | Thấy hai người + VS, **nút Kéo/Búa/Bao nằm dưới mép** trong lượt 5 giây | Nặng |
| Tiến Lên (đang chơi) | 13 lá một hàng, nút Xếp / Gợi ý / Bỏ lượt / Đánh bên dưới — ổn; ghế trên và tên người chơi hơi chồng | Tốt |
| Shop, Ủng hộ, Hỗ trợ | Trang nội dung cuộn dọc, đọc được | Nhẹ |

Nguyên nhân kỹ thuật (chánh điện):

- `#stage { height: 100%; aspect-ratio: 9 / 16 }` trong `apps/web/public/chanh-dien.css` — khung luôn dọc.
- Mọi cỡ chữ / nút / vị trí trong khung tính bằng `cqw` (245 chỗ, 0 chỗ `cqh`). Khi khung rộng 844 px, `top: 13cqw`
  thành ~110 px (gần 1/3 chiều cao), cột nút trái (khu vực, công trình, Đi nhanh, Trốn tìm, Bấm giờ) chạm cần điều khiển
  và thẻ nhiệm vụ, thanh chat kéo dài hết màn.
- `renderer3d.setInsets` chỉ nhận `top` / `bottom` (chưa dời tâm cảnh sang trái khi có ngăn bên phải).
- Chế độ 2D vẽ ảnh nền scene 9:16 nên vốn không phủ được màn ngang.

## 2. Nguyên tắc thiết kế màn ngang

1. **Cảnh là chính:** cảnh 3D phủ kín màn, giao diện dồn ra mép trái / phải (vùng hai ngón cái), giữa màn để trống cho
   nhân vật và cảnh.
2. **Kích thước theo cạnh ngắn:** đổi `cqw` → `cqmin`. Màn dọc không đổi gì (cạnh ngắn chính là bề ngang); màn ngang thì
   nút và chữ giữ đúng cỡ như lúc cầm dọc thay vì phình theo bề ngang.
3. **Thẻ / bảng thành ngăn bên phải:** cao kín màn, rộng ~40 % (320–440 px), cuộn bên trong; cảnh bên trái vẫn thấy
   nhân vật (camera dời tâm sang trái qua `setInsets({ right })`).
4. **Không cuộn khi đang chơi:** mọi nút có đồng hồ (ra tay, cược, mua vé, Bắt đầu / Dừng) phải nằm trong màn đầu.
5. **Chiều cao thấp:** iPhone ngang 375–430 px, còn ~330 px khi Safari hiện thanh địa chỉ, ~150 px khi bàn phím mở →
   thanh trên một dòng ≤ 44 px; khi gõ chat chỉ giữ ô chat + bong bóng gần nhất.
6. **Vùng an toàn:** tai thỏ / Dynamic Island nằm ở mép trái hoặc phải khi xoay → đệm `env(safe-area-inset-left/right)`;
   thanh home ở dưới → `env(safe-area-inset-bottom)`.
7. **Không bắt xoay:** cả hai hướng đều dùng được; chỉ rạp phim gợi ý xoay ngang như hiện tại.

## 3. Bố cục chánh điện ở màn rộng

```
┌──────────────────────────────────────────────────────────────────┐
│ ← ●14 phật tử  🪙4.270  💎0  🛍     [Arizona·PV1 ⇄] [📍Đi nhanh▾]  ⚙ │  thanh trên 1 dòng
│ ↺                                                          🏗 0/2 │
│ 👁                                                         📜 0/7 │  cột trái: góc nhìn
│                                                            🙈     │  cột phải: tính năng (icon tròn)
│                        cảnh 3D phủ kín                     ⏱      │
│                                                                  │
│  ◯                                          [Đứng] [Quỳ] [✨] [▾] │  cần điều khiển trái dưới,
│ ◯◯◯   [💬 5] [ Gõ lời nguyện…                    ] [Gửi]          │  hành động phải dưới, chat giữa
└──────────────────────────────────────────────────────────────────┘

Mở một thẻ (vườn, nông trại, Bấm giờ, trò hai người, linh thú, tin nhắn, hồ sơ, sớ…):
┌───────────────────────────────────────┬──────────────────────────┐
│ cảnh 3D, camera dời tâm sang trái      │ ✕  Ngăn bên phải          │
│ ◯                                     │ (cuộn bên trong)          │
└───────────────────────────────────────┴──────────────────────────┘
```

- Cột phải gom các nút đang xếp dọc bên trái ở bản dọc (công trình chung, nhiệm vụ, Trốn tìm, Bấm giờ) thành icon tròn
  40 px; chạm giữ hiện tên.
- Bảng toàn màn ở bản dọc (Tin nhắn, Linh thú, Hồ sơ, Nhiệm vụ) → ngăn phải rộng ~50 %, hoặc giữa màn tối đa 560 px nếu
  nội dung là lưới.
- Bàn phím mở (`visualViewport.height` < 220 px): ẩn cột nút và cần điều khiển, chỉ còn ô chat.
- Trốn tìm, nhắm mắt, ẩn chữ & nút: giữ nguyên logic, chỉ đổi chỗ đặt các thẻ.
- 2D ở màn rộng: mặc định 3D; ai chọn 2D thì giữ khung 9:16 giữa màn với nền là ảnh cảnh làm mờ thay cho dải đen.
- Cổng chánh điện: form thành hai cột (trái: khu vực, ngôn ngữ, tài khoản; phải: hình nhân vật + nút Vào), không cắt.

## 4. Các trang khác

- **Rạp phim:** giữ chế độ xem ngang; thêm nút 💬 mở ngăn chat bên phải và nút hàng chờ, thay cho thông báo "Xoay dọc để
  về giao diện đầy đủ". Không vẽ gì đè lên khung YouTube (nguyên tắc kiến trúc 3): ngăn mở ra thì video co lại.
- **Bầu Cua, Tài Xỉu:** hai cột — bàn cược trái; đồng hồ, phỉnh, nút cược, lịch sử bên phải.
- **Lô Tô:** vé của mình bên trái; số vừa gọi, bảng số, nút mua vé bên phải.
- **Oẳn Tù Tì:** đấu trường và ba nút ra tay cùng một màn (hai người hai bên, ba nút hàng ngang ở dưới); sảnh hai cột
  (mức cược + Tìm trận / Tạo bàn trái, danh sách bàn phải).
- **Tiến Lên:** giữ bố cục; chỉnh ghế trên và nhãn tên không chồng nhau.
- **Trang chủ, Shop:** lưới 2–3 cột.

## 5. Kỹ thuật

- Điều kiện bố cục màn rộng: `@media (min-aspect-ratio: 1/1)`; thêm `(max-height: 500px)` cho điện thoại ngang (giao diện
  gọn hơn). Một bộ quy tắc dùng chung cho điện thoại ngang, iPad ngang, máy tính.
- `#stage`: bỏ khóa 9:16 ở màn rộng khi đang 3D; 2D giữ khung cũ.
- Đổi `cqw` → `cqmin` một lượt trong `chanh-dien.css`, rồi chụp lại các màn dọc 390×844 trước / sau phải trùng khớp (bản
  dọc không được đổi).
- `renderer3d.setInsets` nhận thêm `left` / `right`; `updateInsets()` trong `chanh-dien.js` tính cả ngăn bên phải đang mở.
- Rà các chỗ JS đặt vị trí theo khung (vd. `place()` của Bấm giờ dựa vào thanh chat, `place()` của các thẻ nông trại).
- Xoay máy giữa chừng: `resize` → renderer đổi kích thước (đã có); đóng menu thả xuống; giữ thẻ đang mở.
- Toàn màn hình: Android Chrome cho `requestFullscreen` + `screen.orientation.lock` (rạp phim đã dùng, `room.js`). iOS Safari
  không hỗ trợ → gợi ý "Thêm vào màn hình chính" (manifest `display: fullscreen`, `orientation: any`) để mất thanh địa chỉ.
- Hiệu năng: điện thoại ngang cùng số điểm ảnh như dọc; iPad / máy tính nhiều hơn, renderer đã tự hạ chất lượng.
- Kiểm thử: ma trận 667×375 (iPhone SE), 844×390, 932×430 (Pro Max), 800×360 (Android), 1180×820 (iPad), 1440×900, cộng
  390×844 dọc để chặn sửa lan sang bản dọc; script chụp tự động như lúc đo mục 1.

## 6. Lộ trình

| Đợt | Việc | Công | Xong khi |
| --- | --- | --- | --- |
| 0 | Sửa nhanh ở màn ngang thấp: Oẳn Tù Tì (nút ra tay cùng màn), Bầu Cua / Tài Xỉu (phỉnh + cược), Lô Tô (mua vé), cổng chánh điện không bị cắt | 1 ngày | 844×390 chơi được mà không cuộn |
| 1 | Chánh điện màn rộng: khung phủ màn khi 3D, `cqw` → `cqmin`, bố cục thanh trên / hai cột / chat / cần điều khiển, vùng an toàn, bàn phím | 2–3 ngày | đủ thao tác chính ở 844×390 và 1440×900; bản dọc không đổi |
| 2 | Mọi thẻ / bảng trong chánh điện thành ngăn phải + camera dời tâm (`setInsets` left/right) | 2 ngày | mỗi thẻ mở / đóng được, vẫn thấy nhân vật |
| 3 | Rạp phim: chat + hàng chờ ở chế độ ngang; game hai cột hoàn chỉnh; trang chủ / Shop lưới | 1–2 ngày | không còn thông báo bắt xoay dọc |
| 4 | Thêm vào màn hình chính (PWA), nút toàn màn hình Android cho chánh điện, kiểm trên máy thật (iPhone, Android, iPad) | 1 ngày | — |

## 7. Đã chốt (17/11/2026)

1. Phạm vi: **mọi màn rộng** — điện thoại ngang, iPad ngang, máy tính — cùng một bố cục (`@media (min-aspect-ratio: 1/1)`).
2. **Không làm 2D** ở màn rộng (giữ nguyên như hiện tại).
3. Rạp phim ngang: làm theo đề xuất — chat / hàng chờ trong ngăn phải.
4. Làm **đợt 0 trước**, chụp cho chủ dự án xem rồi mới làm tiếp.

## 8. Đợt 0 — đã làm (17/11/2026)

- Bầu Cua (`game.html`), Tài Xỉu (`tai-xiu.html`): màn rộng chia hai cột bằng `grid-template-areas` — bàn cược trái;
  đồng hồ, phỉnh, đĩa xúc xắc (lịch sử) phải. Điện thoại ngang (`max-height: 520px`) bỏ tiêu đề lớn, thu gọn ô.
- Lô Tô (`loto.html`), Oẳn Tù Tì (`oan-tu-ti.html`): thêm hai khối bọc `.col-main` / `.col-side` (`display: contents` ở
  màn dọc nên bố cục dọc giữ nguyên; màn rộng thành hai cột tự cuộn). Lô Tô: vé xếp chồng bên trái, cỡ vé tính theo chiều
  cao màn (một vé / hai vé, `:has()`), lời dặn cuối cột vé; gọi số + mua vé bên phải. Oẳn Tù Tì: sảnh / đấu trường trái,
  bàn đang chờ + trận vừa xong phải; đấu trường xếp ngang, ba nút Kéo / Búa / Bao xếp dọc bên phải.
- Màn rộng mà cao (iPad ngang, máy tính; `min-height: 600px`): nội dung game nằm giữa màn.
- Cổng chánh điện (`chanh-dien.css`): lúc cổng còn mở, khung phủ cả màn (`#stage:has(#gate:not([hidden]))`) và form chia hai
  cột (`columns: 2`, hình nhân vật sang cột phải). Trong sân vẫn khung 9:16 tới đợt 1.
- Kiểm: ở 844×390, 1180×820, 1440×900 nút chính (Vào chánh điện, phỉnh, bàn cược, mua vé, vé, Tìm trận, Kéo / Búa / Bao)
  đều nằm trọn trong màn, không lỗi trang. Bố cục dọc 390×844 so với bản trước (máy web thứ hai chạy commit cũ, đo khung
  từng phần): giống hệt, chỉ khác phần dữ liệu đổi theo lúc tải (số bàn đang chờ, lịch sử ván).
- Còn để đợt 3: phóng to bàn chơi trên màn lớn (hiện vừa màn nhưng chưa tận dụng hết chỗ), chỉnh ghế trên Tiến Lên.

## 9. Đợt 1 — đã làm (17/11/2026)

- Khung: `#stage.view-3d` (class do `setViewMode` trong `chanh-dien.js` gắn khi 3D) phủ cả màn ở màn rộng; 2D giữ 9:16.
  Mọi `cqw` trong `chanh-dien.css` đổi thành `cqmin` (màn dọc cạnh ngắn là bề ngang nên không đổi gì).
- Bố cục (khối "Màn rộng" cuối `chanh-dien.css`): trái — ↺ 👁, nhiệm vụ giữa mép, cần điều khiển góc dưới (`place()` trong
  `explore-ui.js` bỏ `bottom` của cần ở màn rộng); phải — một hàng tên phòng / công trình / Đi nhanh / sự kiện / Trốn tìm /
  Bấm giờ ngay dưới thanh trên (tự xuống dòng khi hẹp), bảng Tấm lòng thành dưới hàng đó, nút động tác trên thanh chat;
  giữa dưới — lễ vật + chat rộng tối đa 600 px, chừa cột cần điều khiển hai bên; dòng tin cạnh cần điều khiển, ngay trên
  thanh chat (`--controls-gap` do `place()` ghi). Bảng Đi nhanh 4 cột dưới hàng nút phải; thẻ Bấm giờ giữa màn ≤ 560 px.
- Ngăn phải (`--dock`): khung bài giảng YouTube đứng ở mép phải từ dưới thanh trên; mọi thứ bám mép phải dời vào, chat và nút
  giữa màn canh giữa phần còn lại; `renderer3d.setInsets` nhận thêm `left` / `right` (dời tâm phối cảnh ngang) và
  `updateInsets()` đo khung bài giảng. Đợt 2 dùng lại cho các thẻ.
- Điện thoại ngang (`max-height: 520px`): đang gõ chat (`#stage.typing`) thì ẩn cột nút, nhiệm vụ, cần điều khiển, nút động
  tác, bảng; có bài giảng thì ẩn bảng Tấm lòng thành và dòng tin (vẫn có bong bóng trên đầu, số tin ở nút 💬).
- Kiểm: 667×375, 844×390, 1180×820, 1440×900 — trong điện (có / không bài giảng), ngoài sân, Đi nhanh, Bấm giờ, đang gõ:
  không chồng nhau, khung YouTube không bị che, không lỗi trang. Bố cục dọc 390×844 (trong điện có bài giảng, bảng Đi nhanh,
  ngoài sân, Bấm giờ; 22 phần tử × 4 màn) so với bản commit cũ: giống hệt, chỉ khác dòng tin và thông báo (nội dung đổi).
- Còn để đợt 2: các thẻ / bảng (vườn, nông trại, thú cưng, trò hai người, linh thú, tin nhắn, hồ sơ, sớ, hướng dẫn khu)
  vẫn là thẻ đáy / toàn màn như bản dọc; khung bài giảng còn 216 px trên màn lớn.

## 10. Đợt 2 — đã làm (17/11/2026)

- Bảng (`.garden-sheet` gồm vườn / chợ nông trại / linh thú, `.social-friends` gồm bạn bè / Tin nhắn, `.rps` trò hai người,
  `.mala` chuỗi hạt, `.community-project-sheet` công trình chung): ngăn phải cao kín màn, rộng `--sheet` =
  clamp(300px, 40 %, 460px), cuộn bên trong; thanh trên co lại chừa chỗ (`--dock-top`).
- Thẻ (`.garden-card` gồm luống / ô ruộng / chuồng / mộ, `.social-card` người chơi, `.sw-card` Bấm giờ): thẻ nổi ở cột phải,
  sát đáy, không lên quá thanh trên. `place()` của Bấm giờ không đặt `bottom` ở màn rộng.
- Hướng dẫn khu vực vẫn là hộp thoại (nền tối, chạm ra ngoài để đóng), thẻ đứng ở cột phải. Hộp thoại `.ledger` (hồ sơ,
  xếp hạng, sớ…) giữ giữa màn, điện thoại ngang cho cao hết màn.
- `--dock` = max(khung bài giảng, ngăn đang mở); màn ≥ 1300 px thì cộng lại: khung bài giảng đứng ngay trái ngăn, thu về
  200 × 200 để còn chỗ cho chat. Dưới 1300 px ngăn đè lên khung bài giảng như bản dọc. iPad / máy tính (≥ 1000 × 600):
  khung bài giảng 16:9 356 × 200 khi không mở ngăn.
- Camera dời tâm: `#dockProbe` (ô ẩn rộng đúng `--dock`) + ResizeObserver → `updateInsets()` → `setInsets({ right })`, nên
  bảng / thẻ mới chỉ cần thêm class vào danh sách trong khối "Màn rộng" là tự dời cảnh.
- Đang mở bảng / thẻ: ẩn bảng Tấm lòng thành, dòng tin, thanh nông trại. `placeRoomBar()` ghi `--room-bar-bottom` để bảng
  Tấm lòng thành, bảng Đi nhanh, thanh nông trại, thông báo luôn dưới hàng nút phòng (hàng này xuống 2–3 dòng khi hẹp).
  Dòng tin lên trên hàng nút động tác; thẻ Trốn tìm dưới nút "Ẩn chữ & nút", giới hạn cao (cuộn), rộng tới 300 px; nút
  "Đang nắm tay" dưới hàng nút phòng, khi đó thông báo xuống dưới nút này.
- Kiểm: 667×375, 844×390, 1180×820, 1440×900 với nhiệm vụ, Tin nhắn, chuỗi hạt, thẻ người chơi, Kéo búa bao (khiêu chiến
  bot thật), công trình chung, Bấm giờ, linh thú, hướng dẫn khu, ô ruộng, chợ, quầy hạt, nắm tay, phòng chờ Trốn tìm: không
  chồng nhau, vẫn thấy nhân vật, không lỗi trang. Bố cục dọc 390×844 (12 màn mở bảng / thẻ × 22 phần tử + thẻ người chơi) so
  với bản commit cũ: giống hệt.
- Còn để sau: Kéo búa bao trong chánh điện vẫn dừng vẽ cảnh 3D khi đang chơi (`onGameActive`), nên ở màn rộng cảnh bên trái
  đứng hình trong lúc đấu; đổi hướng màn hình lúc đang mở thẻ Bấm giờ thì vị trí cập nhật qua `matchMedia`, chưa thử trên
  máy thật.

## 11. Đợt 3 — đã làm (17/11/2026)

- **Rạp phim** (`room.html` / `room.css` / `room.js`): màn ngang thấp (`(orientation: landscape) and (max-height: 520px)`,
  cả điện thoại lẫn cửa sổ máy tính thấp — giao diện đầy đủ ở đó làm khung YouTube còn 100 × 56 px) tự vào xem ngang và
  **bỏ** thông báo "Xoay dọc điện thoại để về giao diện đầy đủ": nút ✕ ẩn ở màn đó, xoay dọc là tự thoát. Dải nút phải thêm
  💬 Trò chuyện, 📃 Hàng chờ (gửi video), 👥 Người xem, 🔒 Rạp riêng (chỉ ở rạp riêng), có số tin chưa đọc / số video chờ.
  Mở ra là ngăn kéo cũ (cùng nội dung, cùng ô nhập) thành cột cạnh dải nút, rộng `clamp(200px, 100% − 440px,
  min(340px, 36%))` để màn chiếu còn ≥ 356 × 200 px; `updateInsets()` chừa ngăn nên video co sang trái, không bị che.
  Bảng cảm xúc ở dải trống bên trái (rộng bằng dải nút: mở ra video không co); khi có ngăn thì xuống hàng ngang dưới video.
  Màn dọc ở chế độ xem ngang (⛶): ngăn là tấm đáy trên dải nút. Ngăn đang mở giữ nguyên khi xoay máy.
- Góc camera `zoom` (`cameraPose` trong `theater.mjs`): phần còn lại gần vuông (tỉ lệ ≥ 0,8, tức đang mở ngăn) thì màn
  chiếu nằm giữa theo chiều dọc (`fitWindow(…, { center })`); màn dọc vẫn giữ mép trên như cũ.
- **Game**: màn lớn phóng to cả trang theo bậc bằng `zoom` trên `.app` (Tiến Lên thêm `.board`): ≥ 1100 × 760 → 1,15;
  ≥ 1300 × 860 → 1,3; ≥ 1700 × 1000 → 1,5 (`--zoom` trên `:root`). Cỡ vé Lô Tô tính theo `100dvh / var(--zoom)`. Chip bay
  ở Bầu Cua / Tài Xỉu gắn vào `body` (không zoom) nên vẫn đúng toạ độ.
- **Tiến Lên** (`tien-len.html`, trước đây chưa có bố cục ngang): sảnh hai cột (chọn kiểu / mức cược trái, bàn đang mở phải);
  bàn chơi rộng tới 820 px. Điện thoại ngang: ba đối thủ một hàng (trái / trên / phải theo vị trí ngồi, ảnh 42 px, tên + số
  lá bên cạnh), chữ "Chặt" nổi trên chồng bài, lá trên tay 50 × 74, bốn nút 2 × 2 bên phải bài, màn kết quả theo cả bàn —
  hết chồng ghế / tên / bài như mục 1.
- **Shop**: màn rộng hai cột (tài khoản, quà đăng nhập, nạp kim cương, ghi chú thanh toán trái; linh thú + nhân vật phải,
  lưới tự chia cột). Hai khối bọc `.col-side` / `.col-main` là `display: contents` ở màn dọc, `order` giữ thứ tự cũ.
  Trang chủ đã có bố cục rộng sẵn nên giữ nguyên.
- Kiểm: rạp ở 667×375, 800×360, 844×390, 1180×820 (⛶), 1440×900 (⛶), 390×844 (⛶) — mở trò chuyện (gửi tin thật), hàng chờ,
  cảm xúc, người xem, đóng, xoay máy khi đang mở ngăn: video luôn ≥ 356 × 200 px, không gì đè lên khung player. Game ở
  1180×820 và 1440×900 (đã đăng nhập: mua 2 vé Lô Tô, vào trận Oẳn Tù Tì, ngồi bàn Tiến Lên), Tiến Lên ở 844×390 / 667×375,
  Shop ở 844×390 / 1180×820 / 1440×900: không chồng nhau, không lỗi trang. Bản dọc 390×844 (rạp 5 cảnh, 5 trang game,
  bàn Tiến Lên, Shop 2 cảnh; 365 phần tử) so với bản commit cũ: khung giống hệt, chỉ khác phần dữ liệu đổi theo lúc tải
  (lịch sử ván, danh sách bàn, vé, tin hệ thống) và dải nút ⛶ có thêm nút mới.
- Còn để sau: rạp ở màn dọc khi mở ngăn kéo (tấm đáy 48 %) thì khung YouTube còn 256 × 144 px — có từ trước, dưới mức
  200 px YouTube yêu cầu; nên sửa (vd. tấm đáy thấp hơn hoặc màn chiếu dùng góc riêng khi có ngăn). Đợt 4: PWA, toàn màn
  hình Android cho chánh điện, thử trên máy thật.

## 12. Đợt 4 — đã làm phần code (17/11/2026)

- **Cài như ứng dụng (PWA):** `apps/web/public/manifest.webmanifest` (tên "Chánh Điện Online", mở vào `/chanh-dien.html`,
  `display: fullscreen` rồi tới `standalone`, `orientation: any`, nền / thanh `#120a06`), biểu tượng hoa sen vàng trên nền đỏ
  thẫm ở `apps/web/public/icons/` (SVG + PNG 192 / 512 / maskable 512 / apple-touch 180; vẽ lại bằng
  `node scripts/app-icons.mjs`). Các trang người chơi (trang chủ, chánh điện, rạp, 5 trang game, Shop, Ủng hộ, Hỗ trợ) có
  thẻ manifest, favicon, apple-touch-icon, `apple-mobile-web-app-capable`; web server trả `.webmanifest` đúng kiểu
  `application/manifest+json`. Không dùng service worker (Chrome hiện không bắt buộc; tránh giữ bản cũ sau deploy):
  `Page.getInstallabilityErrors` của Chrome báo không lỗi.
- **Toàn màn hình cho chánh điện** (`apps/web/public/app-install.js`): nút ⛶ ở cột góc nhìn (chỉ màn rộng; sáng vàng khi đang
  toàn màn hình, bấm lại để thoát) và mục "Màn hình" trong menu ⚙ (mọi hướng) gọi `requestFullscreen` cho cả trang; ẩn khi
  trình duyệt không cho (iPhone) hoặc đã mở từ màn hình chính. Chrome báo `display-mode: fullscreen` cả khi trang tự toàn
  màn hình, nên "đã cài" = chế độ đó mà không có `fullscreenElement`.
- **Thêm vào màn hình chính:** mục trong menu ⚙. Chrome báo cài được (`beforeinstallprompt`, chặn thanh "Cài đặt" mặc định vì
  đè lên cần điều khiển / ô chat) thì mở hộp cài của trình duyệt; iPhone / iPad thì hộp thoại ba bước (Chia sẻ → "Thêm vào
  MH chính" → mở từ biểu tượng); Android trình duyệt khác thì hướng dẫn menu ⋮; mở trong Zalo / Facebook… thì nhắc mở bằng
  trình duyệt trước. Bốn ngôn ngữ (`app.*`, `menu.screen` trong `thien-i18n.js`).
- **Gợi ý một lần:** điện thoại xoay ngang, vào sân 3D, chưa toàn màn hình / chưa cài → thẻ nổi dưới hàng nút phòng
  ("Mở toàn màn hình cho rộng hơn ⛶" nếu được, không thì "Thêm vào màn hình chính… Mở"), tự ẩn sau 12 giây, nhớ ở
  localStorage `thien-app-hint`. Màn dọc không có gợi ý, cột góc nhìn không đổi.
- Kiểm: Chrome có cửa sổ thật ở 1280×760: bấm ⛶ vào toàn màn hình (1728×1080), nút sáng, bấm lại thoát. Giả lập Android
  ngang 844×390: gợi ý hiện dưới hàng nút phòng, menu có hai mục. Giả lập iPhone (tắt API toàn màn hình và hộp cài của Chrome):
  gợi ý "Thêm vào màn hình chính", bấm Mở ra hộp thoại ba bước, đóng được. Dọc 390×844: không gợi ý, cột góc nhìn giữ ↺ 👁.
  Test web server kiểm manifest, biểu tượng, thẻ trên 11 trang và kiểu file.
- **Cần thử trên máy thật** (chưa làm được ở máy dev): iPhone Safari thêm vào màn hình chính rồi mở từ biểu tượng (toàn màn
  hình, xoay ngang, vùng tai thỏ), video YouTube trong rạp, đăng nhập Google và thanh toán Stripe khi mở từ biểu tượng (trang
  ngoài mở trong khung Safari riêng), Android Chrome hộp cài + nút ⛶, iPad ngang.
