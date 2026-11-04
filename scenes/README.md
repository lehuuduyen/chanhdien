# Scenes

Mỗi cảnh nằm trong `scenes/<sceneId>/scene.json` (cùng asset nếu có). Scene engine (`packages/scene-engine`) không chứa tọa độ riêng của cảnh nào; mọi vị trí đọc từ file này. Kiểm tra bằng `validateScene` (chạy trong test) hoặc nút "Kiểm tra" của công cụ đặt ghế.

| Cảnh | Nền | Ghế | Nhân vật |
| --- | --- | --- | --- |
| `cinema-default` | vẽ bằng code (chưa có ảnh rạp) | 100 ghế S-1…S-100, khớp room rules Cinema | bóng người nhìn từ sau lưng |
| `thien-default` | `/thien/assets/hall.jpg` | 16 bồ đoàn đo đúng tâm và bề rộng trong tranh; sprite (đã vẽ sẵn bồ đoàn) được phóng cho khít | sprite `c_*.png` của bản legacy |

## Định dạng (version 1)

Không gian sân khấu mặc định 1080 × 1920 (dọc 9:16). `y` lớn hơn là gần camera hơn.

| Trường | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `version` | có | `1` |
| `id`, `name` | có | `id` dạng `a-z0-9-` |
| `stage` | có | `{ width, height }` |
| `backdrop` | không | màu phần ngoài cảnh khi khung nhìn rộng hơn cảnh |
| `background` | có | `{ type: "image", src }` hoặc `{ type: "procedural", theme: "cinema" }` |
| `seatbacks` | không | lớp lưng ghế vẽ đè lên người theo từng hàng: `{ type: "procedural" }`, `{ type: "image", src }` (PNG trong suốt cùng kích thước stage) hoặc `null` |
| `screen` | không | khung màn chiếu `{ x, y, width, height }`; iframe YouTube được đặt đúng vào đây, không gì được vẽ đè lên |
| `ambience` | không | `"temple"`: ánh nến chập chờn |
| `characters` | có | `{ style: "silhouette", height }` hoặc `{ style: "sprite", base, skins, height }`; `height` là chiều cao người ngồi khi `scale = 1`; `nameTags`: `"all"`, `"me"` hoặc `"none"` |
| `seats` hoặc `seatLayout` | đúng một trong hai | danh sách ghế `{ id, x, y, scale, row, group? }` hoặc công thức `{ type: "rows", rows, columns, yBack, yFront, halfWidthBack, halfWidthFront, scaleBack, scaleFront, aisleGap? }` |
| `cameras` | có | `overview` bắt buộc; `screen`, `audience` là vùng `{ x, y, width, height }`; `seat` là kích thước `{ width, height }` lấy ghế của mình làm tâm |

`src` tương đối được tính từ thư mục cảnh; `src` bắt đầu bằng `/` là đường dẫn trên web server. Không dùng `..`.

Quy tắc `validateScene` kiểm tra: ghế không trùng id, nằm trong stage, không nằm trong khung màn chiếu, ghế gần camera không nhỏ hơn ghế xa; màn chiếu nằm trong stage; tối đa 500 ghế.

## Lưng ghế và thứ tự vẽ

Camera đặt sau lưng khán giả. Mỗi hàng vẽ từ xa tới gần: người trong hàng → lưng ghế của hàng đó. Nhờ vậy lưng ghế che thân người ngồi, còn người ở hàng gần vẫn đè lên lưng ghế hàng xa. Với `seatbacks` dạng ảnh, engine cắt ảnh thành dải theo từng hàng (từ `y − 64·scale` tới `y + 16·scale`), nên lưng ghế của mỗi hàng phải nằm trong dải đó.

## Thử

- `http://localhost:3000/scene-demo.html`: chọn cảnh, số người, góc camera, chat ngẫu nhiên, đo FPS. Thêm `?scene=cinema-default&n=100&bench=1` để đo chi phí vẽ một khung trên trang mới tải.
- `http://localhost:3000/tools/seat-editor/`: đặt ghế trên ảnh nền và xuất `scene.json`.

## Chế độ 3D (`world`)

Cảnh có thêm `world` thì chánh điện chạy được ở chế độ 3D (`packages/scene-engine/src/renderer3d.mjs`):

| Trường | Ý nghĩa |
| --- | --- |
| `world.seats` | `{ id, x, z }` (mét) cho từng ghế, cùng id với `seats` 2D; bàn thờ ở z ≈ 0, khán đường về phía +z |
| `world.camera.frame` | `{ center, width, elevation }`: góc mặc định lùi đủ xa để bề ngang `width` lọt khung, nhìn chếch xuống `elevation` radian |
| `world.camera.minDistance`, `maxDistance`, `bounds` | giới hạn phóng to/thu nhỏ và hộp giữ camera trong phòng |
| `world.camera.follow` | góc nhập vai: `distance`, `height`, `targetHeight`; `lockZoom`/`lockPan` khóa bố cục trên mobile |

`validateWorld` kiểm tra: đủ ghế khớp cảnh 2D, hai ghế cách nhau ≥ 1 m, ghế nằm trong `bounds`.

## Rạp phim 3D (`theater3d`)

Cảnh có `seatLayout` và thêm `theater3d` thì phòng Cinema dựng rạp 3D (`packages/scene-engine/src/cinema3d.mjs`, phần thuần ở `theater.mjs`); máy không có WebGL hoặc thêm `?2d=1` thì dùng cảnh 2.5D. Toạ độ theo mét: màn chiếu nằm trên mặt phẳng z = 0, khán phòng về phía +z.

| Trường | Ý nghĩa |
| --- | --- |
| `theater3d.screen` | `{ width, height, bottom }`: màn chiếu 16:9, mép dưới cách sàn `bottom` |
| `theater3d.seating` | `{ firstRowZ, rowSpacing, rowRise, seatSpacing, aisle?, curve?, focusZ? }`: hàng đầu cách màn, khoảng cách hàng, bậc cao thêm mỗi hàng, khoảng cách ghế, lối giữa, độ cong hàng ghế, điểm các ghế quay về. Id ghế sinh giống `seatLayout` (S-1 ở hàng cuối bên trái) |
| `theater3d.seating.couples` | `{ rows, spacing }` (tùy chọn): hàng ghế đôi (chỉ số hàng như `row`, 0 là hàng cuối); mỗi bên lối giữa ghép từng cặp ghế từ lối giữa ra thành một sofa (hai ghế cách nhau `spacing` mét), ghế lẻ sát tường vẫn là ghế đơn; id ghế giữ nguyên |
| `theater3d.hall` | `{ x, height, backZ }`: bề ngang, chiều cao trần, tường cuối |
| `theater3d.cameras.overview`, `.screen` | `{ position, window }`: camera nhìn thẳng màn chiếu qua khung `window` `{ x, y }` trên mặt phẳng màn (dịch khung, không xoay), nên màn chiếu luôn là hình chữ nhật để đặt iframe YouTube phẳng lên trên. Màn dọc giữ mép trên, kéo khung xuống dưới |
| `theater3d.cameras.seat` | `{ eye, back, margin, below }`: nhìn qua vai từ ghế của mình |
| `theater3d.cameras.overview.windowPortrait` | khung riêng cho màn dọc (điện thoại), để màn chiếu không quá nhỏ |
| `theater3d.cameras.zoom` | `{ position, window }` (tùy chọn): chế độ xem ngang — khung gần bằng màn chiếu để video cao kín màn hình |
| `theater3d.cameras.follow` | `{ height, distance, margin, focus }`: góc nhìn nhân vật — camera sau lưng, vẫn nhìn thẳng màn chiếu; khung luôn chứa màn chiếu và nửa trên nhân vật (từ độ cao `focus`) |
| `theater3d.walk` | `{ spawn, minZ, seatRadius, bodyRadius, sideAisle, legroom }`: đi lại trong rạp — chỗ xuất hiện (cửa sau), mép sân khấu, cỡ ghế/người khi tính va chạm, lối đi hai bên, khoảng để chân trước ghế |
| `theater3d.cameras.audience` | `{ position, target, fov, fovPortrait }`: quay về phía khán giả; player thu thành khung nhỏ ở góc |

`validateTheater` kiểm tra: ghế không chồng nhau, nằm trong khán phòng, màn chiếu vừa khán phòng, camera nằm giữa màn và tường cuối; chỗ xuất hiện, lối đi bên và khoảng để chân trước mọi ghế đều đứng được.
