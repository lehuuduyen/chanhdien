# KE_HOACH2 — Sân ngoài chùa: hoàn thiện cảnh vật và bóng đổ

Bàn giao ngày 02/11/2026 cho trợ lý làm tiếp (GPT/Codex/Claude). Đọc trước: `AGENTS.md` (quy ước, nguyên tắc kiến trúc), `KE_HOACH.md` mục Giai đoạn 9 (game nhập vai).

Người dùng phản hồi: **"cảnh vật bên ngoài chưa đầy đủ và chưa có bóng"**. Tài liệu này mô tả hiện trạng, việc cần làm, tiêu chí xong.

## 1. Hiện trạng

Sân ngoài chùa đã có ở chế độ 3D (nhập vai). Người chơi xuất hiện ở sân, nhìn về lư hương và chánh điện, đi qua cửa giữa để vào điện.

| Thành phần | File |
| --- | --- |
| Dựng sân: nền, mặt tiền, lư hương, đèn, cây, tường, cổng, trời, nắng | `packages/scene-engine/src/courtyard3d.mjs` (`buildCourtyard`) |
| Gắn sân vào bộ vẽ, sương, chất lượng tự hạ | `packages/scene-engine/src/renderer3d.mjs` (tìm `courtyard`) |
| Bố cục sân (dữ liệu, không viết cứng trong engine) | `scenes/thien-default/scene.json` → `world.courtyard` |
| Vùng đi được, vật cản, chỗ xuất hiện, tốc độ đi/chạy | `scenes/thien-default/scene.json` → `world.walk` (`areas`, `obstacles`, `spawn`, `speed`, `runSpeed`) |
| Va chạm, tìm đường A* | `packages/scene-engine/src/walk.mjs` (test: `packages/scene-engine/test/walk.test.mjs`) |
| Nhân vật đi lại (chú tiểu chibi), camera bám, chạy bằng Shift | `packages/scene-engine/src/explore3d.mjs`, `chibi3d.mjs` |
| Kiểm tra thô phía server (vùng, tốc độ tối đa 7 m/s) | `packages/room-rules/src/index.mjs` (`THIEN_RULES.world`), `apps/realtime/server.mjs` (`Room.move`) |

`world.courtyard` hiện có: `door`, `ground`, `burner`, `lanterns`, `porchPillars`, `trees`, `pines`, `bushes`, `board`, `sign`, `gate`, `sky`.

Đã dựng:
- Nền đá lát ô vuông (texture canvas).
- Mặt tiền chánh điện: tường đỏ có cửa giữa mở, cánh cửa, thềm đá thấp, 4 cột son, mái hiên và mái chính (hộp nghiêng, đầu đao là chóp nón vàng), hoành phi chữ, đèn lồng đỏ treo hiên.
- Lư hương đồng lớn trên bệ đá, bó nhang, khói (tối đa 12 làn).
- 6 đèn đá hai bên lối đi (quầng sáng là sprite).
- 1 cây đa (khối đa diện), 3 cây tùng (chồng nón), bụi cây.
- Tường gạch thấp hai bên có cột đèn lồng, cổng tam quan đơn giản, bảng vàng công đức.
- Bầu trời chuyển màu (shader), 9 núi chóp nón ở xa, đất ngoài sân phẳng một màu.

Ánh sáng và bóng hiện tại:
- Nắng (`DirectionalLight`) chỉ bật khi camera ở ngoài sân (`camera.position.z > frontZ − 0.5`), tắt khi vào điện để giữ ánh sáng ấm trong điện.
- **Bóng đổ bị tắt hoàn toàn trên điện thoại** (`matchMedia('(pointer: coarse)')` → `shadowMap.enabled = false`), và tự tắt trên máy tính khi FPS < 28 (`adaptQuality` gọi `courtyard.setShadows(false)`). Đây là lý do người dùng (dùng điện thoại) thấy "chưa có bóng".
- Kể cả khi bật, chỉ lư hương, cây và nhân vật đi lại đổ bóng. Cột, tường, đèn đá, mái được gộp bằng `StaticBatch` nên **không đổ bóng**. Chỉ nền sân nhận bóng.
- Nhân vật có bóng tròn giả dưới chân (`shadow` trong `explore3d.mjs`), cả trên điện thoại.

Ảnh tham khảo người dùng muốn giống: trang didenchua.online (sân chùa "An Tự Duyên"). Học bố cục và không khí; **không lấy tài nguyên** (mô hình, ảnh, âm thanh) của họ. Những gì quan sát được từ trang đó:
- **Sân:** nền đá xám ô lớn, có bóng đổ rõ của người, cây, cột.
- **Chánh điện:** bậc thềm rộng nhiều bậc dẫn lên điện cao hơn sân. Bên trong có ba tượng Phật, nhiều tượng nhỏ trên kệ.
- **Hai bên sân:** tường gạch đỏ thấp với cột đèn lồng, cột đèn đá đen, cây đa lớn rễ buông, bụi cây xanh, bảng vàng công đức.
- **Gần thềm:** chuông và trống (vật màu đen gần thềm).
- **Ánh sáng:** ban ngày, sáng, ấm.

## 2. Việc cần làm

Ưu tiên theo thứ tự. Mỗi mục làm xong thì chạy `npm run lint`, `npm test`, và chụp kiểm tra ở khung điện thoại 9:16 (xem mục 4).

### 2.1 Bóng đổ (ưu tiên cao nhất)

Mục tiêu: điện thoại tầm trung cũng thấy bóng, vẫn giữ khoảng 30 FPS.

1. **Bóng "nướng sẵn" cho vật tĩnh (rẻ, chạy cả trên điện thoại):**
   - Vẽ một texture bóng mềm cho nền sân (canvas hoặc lightmap), gồm bóng của cột hiên, tường, mái hiên, đèn đá, lư hương, cây, cổng. Dùng chung hướng nắng với `sun.position`.
   - Đặt texture làm lớp phủ (mặt phẳng nhân màu `MultiplyBlending` sát nền, hoặc `aoMap`/`lightMap` của nền).
   - Hướng bóng tính từ dữ liệu `world.courtyard` (vị trí và kích thước vật), không vẽ tay theo toạ độ.
2. **Bóng động cho nhân vật trên điện thoại:**
   - Giữ bóng tròn giả, nhưng làm bóng dài và lệch theo hướng nắng khi ở ngoài sân (ellipse kéo về phía ngược nắng), mờ hơn khi vào điện.
   - Hoặc dùng shadow map 512 chỉ cho nhân vật (`layers` hoặc chỉ nhân vật `castShadow`), khung camera bóng nhỏ bám theo người chơi.
3. **Máy tính và điện thoại mạnh: shadow map thật.**
   - Cho các khối tĩnh lớn (cột, tường, mái, đèn đá, cổng) đổ bóng: tách các khối này khỏi `StaticBatch` chung thành một batch riêng có `castShadow = true` (vẫn gộp để ít lệnh vẽ).
   - Khung camera bóng (`sun.shadow.camera`) ôm vừa sân. Chỉnh `bias`/`normalBias` để không bị sọc.
   - Thêm một mức chất lượng: điện thoại có FPS ≥ 45 trong 3 giây đầu thì bật shadow map 512 (`PCFShadowMap`), tụt dưới 28 thì tắt như hiện tại. Sửa `adaptQuality` trong `renderer3d.mjs` và `setShadows` trong `courtyard3d.mjs`.
4. Không đổi ánh sáng trong chánh điện. Logic bật/tắt nắng theo vị trí camera giữ nguyên.

Xong khi:
- Ảnh chụp ở khung 9:16 giả lập điện thoại (`pointer: coarse`) thấy rõ bóng cột, đèn đá, lư hương, cây và bóng nhân vật lệch theo nắng.
- Trên máy tính thấy bóng thật từ shadow map.
- Đo `renderer.stats()` (lệnh vẽ, FPS) trước và sau, ghi vào `KE_HOACH.md`.

Tiến độ 02/11/2026: **đã hoàn tất phần code và QA giả lập**. Mobile có lightmap tĩnh + bóng nhân vật lệch nắng; desktop và điện thoại mạnh có shadow map thật với ngưỡng tự bật/tắt. `KE_HOACH.md` đã ghi số đo và phần còn phải thử trên điện thoại thật.

### 2.2 Cảnh vật cho đầy đủ

Mọi vị trí mới thêm vào `world.courtyard` trong scene JSON. Vật nào cản đường thì thêm vào `world.walk.obstacles`. Thêm test trong `walk.test.mjs` nếu thay đổi vùng đi.

1. **Bậc thềm và nền điện cao:**
   - Làm chánh điện cao hơn sân khoảng 0,6–0,9 m, có bậc thềm rộng nhiều bậc như ảnh tham khảo.
   - Cần thêm độ cao nền cho đi lại: `world.walk` có thêm vùng dốc hoặc bậc (ví dụ `areas[i].y` hoặc hàm độ cao theo z). Nhân vật (`explore3d.mjs`) đặt `group.position.y` theo độ cao. Server không cần biết độ cao.
   - Nếu làm cách này, nền trong điện (`buildHall`), bồ đoàn, bàn thờ trong `renderer3d.mjs` cũng phải nâng theo; hoặc giữ điện ở y = 0 và hạ sân xuống. Chọn cách ít sửa nhất, ghi lý do vào `KE_HOACH.md`.
2. **Mái chùa đẹp hơn:**
   - Mái cong (lưng mái võng xuống), ngói ống (texture sọc hoặc nhiều ống trụ gộp), đầu đao cong vút ở bốn góc, bờ nóc có trang trí (lưỡng long chầu nguyệt đơn giản).
   - Hiện là hộp nghiêng phẳng trong `addRoof`.
3. **Hai bên mặt tiền:** chuông lớn treo giá gỗ và trống lớn đặt hai bên thềm (vật trang trí, có va chạm).
4. **Cây đa:** thân to hơn, rễ phụ buông (ống mảnh), tán rộng nhiều khối. Thêm cây hoa (mai/đào) và chậu cây cảnh dọc tường.
5. **Nền và vườn:**
   - Thêm thảm cỏ và lối sỏi ở rìa sân.
   - Có thể thêm hồ sen nhỏ (mặt nước phản chiếu đơn giản, vài lá sen và hoa) ở một góc sân, có va chạm.
6. **Tượng ngoài trời:** tượng Quan Âm đứng trên bệ ở một góc sân (dựng bằng khối như tượng Phật trong điện, `buildBuddha` trong `temple3d-models.mjs` làm mẫu), có đèn và hoa trước tượng.
7. **Cổng tam quan đầy đủ:** ba cửa vòm, mái nhiều tầng, câu đối hai bên. Ngoài cổng có bậc xuống và đường mòn.
8. **Xa hơn:**
   - Núi nhiều lớp màu nhạt dần theo khoảng cách, thêm vài lớp sương mỏng (mặt phẳng trong suốt, gradient) giữa sân và núi.
   - Mây trôi chậm trên trời (sprite).
   - Rừng thông thưa phía sau tường (instanced).
9. **Hiệu ứng nhỏ:**
   - Lá rơi chậm trong sân (tối đa 30 sprite, có thể nhặt khi "Quét lá" về sau).
   - Chim bay ngang trời thỉnh thoảng.
   - Đèn lồng đung đưa nhẹ.
   - Đèn đá sáng hơn khi về chiều (theo giờ tiểu bang như `lecture.js`, tùy chọn).
10. **Âm thanh ngoài trời** (tùy chọn): chim hót, gió nhẹ khi ở sân, tắt khi vào điện. Dùng `temple-audio.js`; âm thanh tự tổng hợp hoặc file có giấy phép rõ ràng.

Xong khi:
- Ảnh chụp sân từ chỗ xuất hiện và từ cổng nhìn vào có đủ các nhóm trên; không còn chỗ trống trơn (đất phẳng một màu, tường thiếu).
- Chạy, đi, tìm đường không xuyên vật.
- Số lệnh vẽ ngoài sân ≤ khoảng 220 (gộp `StaticBatch`, dùng `InstancedMesh` cho vật lặp lại).
- Máy giả lập chậm (SwiftShader) vẫn ≥ 25 FPS sau khi tự hạ chất lượng.

Tiến độ 02/11/2026: đã làm chuông + trống (mục 3), rễ cây đa (một phần mục 4), hồ sen (mục 5) và cổng ba cửa vòm/ba mái (mục 7). Tất cả đã có dữ liệu scene và vật cản cần thiết; góc toàn cảnh không người đo 159 lệnh vẽ. Còn bậc thềm có cao độ, mái cong/ngói, tượng Quan Âm, cảnh xa và hiệu ứng nhỏ.

### 2.2b Vườn chùa mở rộng (02/11/2026, Claude làm tiếp phần Codex dừng giữa chừng)

Người dùng yêu cầu: "mở rộng chùa, khu vườn bên ngoài có đầy đủ các vị La Hán ngồi xung quanh, cây bồ đề, tượng Quan Âm trắng lớn ở một khu riêng, cây hoa kiểng, ghế đá, bồn nước".

- Codex đã làm: nới sân thành x ±24, z 16–54 (`world.courtyard.ground`, `world.walk`, `THIEN_RULES.world.bounds`), dữ liệu `arhats` (18 vị), `bodhi`, `guanyin`, `fountain`, `benches`, `planters`, `lawns`, vật cản tương ứng, bóng nướng sẵn cho các vật này.
- Claude làm tiếp trong `courtyard3d.mjs`:
  - **La Hán:** `addArhat` ngồi kiết già, mặt vẽ canvas, 5 tư thế xoay vòng (bình bát, tràng hạt, tích trượng, cuốn kinh, ấn thí vô úy), xen màu đá và đồng.
  - **Cây bồ đề:** `addBodhi` thân nhiều múi, tán rộng, bệ đá tròn quanh gốc, dải vải đỏ.
  - **Khu Quan Âm riêng:** `addGuanyinGarden` (nền đá tròn, hàng cây xén chừa lối trước tượng, bàn thờ, bình hoa, đèn đá). Tượng `addGuanyin` dựng lại: đài sen hai tầng, áo liền khối có nếp, mặt hiền, khăn trùm, tịnh bình, cành dương liễu, hào quang.
  - **Bồn nước:** `addFountain` bồn đá, hai tầng đài, sen hồng, mặt nước và 18 giọt nước chuyển động.
  - **Cây hoa kiểng:** `addPlanter` (hoa hồng / vàng).
  - **Ghế đá:** `addBench` (Codex viết hàm, Claude gọi).
  - Tượng Quan Âm quay về lối giữa (`ry: -1.5708`). Giới hạn camera nới thành x ±25, y ≤ 16, z ≤ 56 để camera theo được vào vườn.
- Đo trên máy giả lập chậm (SwiftShader, không người): khoảng 212 lệnh vẽ, khoảng 169k tam giác, 10 FPS (máy giả lập vốn chậm; cần đo trên điện thoại thật).
- Còn có thể làm: biển tên từng vị La Hán, lối sỏi dẫn tới khu Quan Âm và cây bồ đề, cánh hoa/lá rơi trong vườn, tiếng nước chảy gần bồn (âm thanh theo vị trí), gộp tượng La Hán bằng `InstancedMesh` nếu cần giảm tam giác.

### 2.2c Tượng quét 3D thật (02/11/2026, Claude)

Người dùng muốn tượng "giống thật". Đã dùng bản quét bảo tàng CC0 thay tượng dựng khối:
- **Nguồn** (Sketchfab, CC0): Mia "Seated Buddha" (`c1c3d5a4878c42778eceded83673dea7`), "12th C CE Water-Moon Guanyin" (`f3316610c8b740c595c22ca1d7df54ca`), "Standing Arhat, 6th C CE" (`5f209e2a3efa4ec18fae8daea2426af9`, đã thay); Wirtualne Muzea Małopolski "Figure of seated arhat with a vase" (`bcceaf7ec75644ed94e30d88d02cdc0c`, CC0, La Hán ngồi tráng men cloisonné).
- **Cách tải:** Blender MCP (`mcp-for-blender` 2.2.6, add-on ghim commit `992233b`, telemetry tắt) đã cấu hình cho dự án; người dùng tự dán Sketchfab API token trong Blender.
- **Xử lý:**
  - Trong Blender: gộp mesh, gốc ở giữa đáy, cao 1 m, mặt trước +z.
  - Xuất GLB rồi nén: `npx gltf-transform optimize <in> <out> --compress meshopt --texture-compress webp --texture-size 1024|512 --simplify-ratio 0.45|0.2|0.04 --simplify-error 0.003`.
  - File gốc để ở `assets-src/statues/` (gitignore).
- **Kết quả** (`apps/web/public/models/statues/`):

  | File | Dung lượng | Tam giác |
  | --- | --- | --- |
  | `buddha-seated.glb` | 744 KB | ~28,8k |
  | `guanyin.glb` | 740 KB | ~40,4k |
  | `arhat-seated.glb` | 275 KB | ~6,5k |

- **Gắn vào cảnh:** `packages/scene-engine/src/statues3d.mjs` theo `world.statues` trong scene JSON.
  - Phật: khớp khung bao tượng khối trên bàn thờ, giữ hào quang.
  - Quan Âm: phủ đá trắng, trên bệ tròn.
  - La Hán: InstancedMesh, mỗi vị một sắc đá, trên bệ vuông.
  - Tượng khối giữ làm dự phòng, chỉ ẩn khi tải tượng quét thành công. Courtyard trả `proceduralStatues` để ẩn.
- Tổng tam giác cảnh vườn lên khoảng 249k (trước khoảng 169k). Cần đo trên điện thoại thật; nếu nặng, giảm `--simplify-ratio` của Quan Âm hoặc thêm LOD.
- **La Hán ngồi (thay bản đứng bị gãy tới đầu gối):** bản quét gốc 359k mặt, nằm nghiêng (xoay −90° quanh X). Bản quét có hàng nghìn mảnh UV rời nên `--simplify` của gltf-transform kẹt ở ~14k và Decimate làm vỡ texture. Cách đã dùng trong Blender: gộp đỉnh trùng → Decimate còn ~6,5k → Smart UV Project → bake màu (Cycles, Diffuse/Color, selected-to-active) từ bản gốc sang ảnh 1024 mới → xuất → `optimize --compress meshopt --texture-compress webp --texture-size 1024 --no-simplify`. Lưu ý: bake vào ảnh **mới** rồi nạp lại từ file PNG trước khi xuất, không thì Blender xuất ảnh đóng gói cũ. Bản thô ở `assets-src/statues/arhat-seated.raw.glb`.
- **Đã sửa lỗi nạp:** `loadParts` đổi position/normal lượng tử hoá (Int16/Int8) sang Float32 trước khi áp ma trận node; trước đó đỉnh bị ghi tràn thành một "cây gậy" đen.
- Hai bản khắc gỗ La Hán hàng long / phục hổ (hunnudigital, CC-BY) đã xem nhưng không dùng: là tác phẩm khắc rễ cây, không rõ dáng tượng.

### 2.2d Vườn cỏ lớn, hồ cá, chó mèo, 4 mẫu La Hán (02/11/2026, Claude)

- **Sân mở rộng:** `ground` x ±36, z 16–100 (trước ±24, 16–54); cổng tam quan ở z 98,6. `floor: 'grass'` cho nền cỏ (texture canvas, UV tính bằng mét), `paths` là các lối đá lát (sân trước điện, lối giữa, lối ngang z 50, sân bồn nước). Server: `THIEN_RULES.world.bounds` x ±36, z −2…100 — **phải khởi động lại realtime** thì mới đi ra phần sân mới được.
- **Bố cục:** đại lộ 18 La Hán hai bên lối giữa (x ±5,6, z 34–70, cách 4,5 m), bồ đề (−22, 50) và Quan Âm (22, 50) hai đầu lối ngang, bồn nước (0, 80), hồ cá lớn (−19,5, 80) bán kính 12 × 9 m, bãi cỏ phía sau bên phải cho chó mèo. Sinh bằng `scripts/thien-garden-layout.mjs` (vật cản tính từ vật thể): sửa bố cục trong script rồi chạy lại.
- **Hồ cá** (`pond.depth` có giá trị → hồ lớn): mặt cỏ và đồng ngoài sân khoét lỗ elip, lòng hồ là lathe (BackSide) sâu `depth`, mặt nước trong mờ ở −0,14 m, bờ đá, lá và hoa sen; `pond.fish` con cá koi là một InstancedMesh bơi vòng elip ở các độ sâu khác nhau. Không có `depth` thì vẫn là hồ sen nhỏ như cũ.
- **Vật cản elip:** `world.walk.obstacles` nhận `{ x, z, rx, rz }` (bờ hồ); đi vào thì bị đẩy lên bờ và trượt dọc bờ. Rút gọn đường A* kiểm tra với thân người nới thêm 2 cm (trước đó có đoạn lướt sát mép lư hương).
- **Chó mèo** (`packages/scene-engine/src/animals3d.mjs`, `courtyard.animals`): dựng bằng khối, mỗi loài 3 InstancedMesh (thân, chân, đuôi), màu lông theo `color`; đi lang thang trong `area`, tránh vật cản theo `world.walk`, lúc đứng vẫy đuôi, lúc nằm nghỉ. Chạy riêng trên từng máy, không đồng bộ qua server. `chanhDienRenderer.debugAnimals()` trả vị trí để kiểm tra.
- **La Hán 4 mẫu:** `world.statues.arhats` là danh sách mẫu `{ src, height, ry? }`; `courtyard.arhats[i].model` chọn mẫu (xen kẽ để hai bên không trùng nhau). Mẫu nào lỗi thì dùng mẫu tải được đầu tiên. Ba mẫu mới (CC BY, ghi công trong README): tượng sư đá chùa Cực Lạc (cắt bỏ nền gạch trong bản quét, xoay 180° bằng `ry`), Bố Đại, sư ngồi thiền (đổi màu texture sang đồng). Cùng quy trình Blender như mục 2.2c, mỗi mẫu ~6,5k tam giác.
- **Giật khi đi (đã sửa):**
  - Đèn mặt trời trước đây bật/tắt (`visible`) mỗi lần đi qua cửa điện. Đổi số nguồn sáng làm three.js biên dịch lại shader của mọi vật liệu, nên khựng mỗi lần ra vào. Giờ đèn luôn bật, trong điện cường độ 0 và `shadow.autoUpdate = false`.
  - `renderer.compile(scene3d, camera)` lúc nạp và trước khi đưa tượng quét vào cảnh, để không biên dịch giữa lúc đang đi. `compileAsync` của three 0.160 lỗi với nhóm chưa nằm trong cảnh, nên dùng bản đồng bộ.
- Máy giả lập (SwiftShader): ~230 lệnh vẽ, ~223k tam giác. Cần đo trên điện thoại thật.

### 2.2e Bàn thờ theo ảnh mẫu: Địa Tạng đồng + Hộ pháp, 13 dáng La Hán (02/11/2026, Claude)

- **Tượng chính** (`world.statues.buddha`, `throne: true`): bản quét "Ngài Địa Tạng" (tích trượng, minh châu; bỏ phần đá nền), nhuộm màu đồng. Đặt trên bộ `packages/scene-engine/src/throne3d.mjs`: bệ bát giác viền vàng, đài sen cánh nhọn phát sáng, vầng lửa đồng (ExtrudeGeometry, texture canvas mép cam), vòng lửa sau đầu (cộng sáng). Cả bộ cao `height` 3,2 m. Hào quang và tượng khối cũ bị ẩn khi tải xong. Ảnh mẫu là tượng ngồi đội mão. Chưa tìm được bản quét mở giấy phép nào như vậy, nên dùng tượng đứng. Tượng sư ngồi (`arhat-monk-black`) có thể thay nếu muốn dáng ngồi.
- **Hộ pháp** (`world.statues.guardians`): cặp Nio (CC0) màu đồng, trên bệ đồng bát giác ở x ±3,3, z −1,5 (ngoài vùng đi).
- **La Hán:** 13 mẫu trong `world.statues.arhats`. Script bố cục xếp 9 dáng bên trái; bên phải là 4 dáng còn lại xen với 5 dáng lặp lại. Mỗi dáng lặp đổi `finish` (`gold`, `bronze`, `stone`) và cách bản gốc ít nhất 4 hàng. Muốn đủ 18 dáng riêng thì cần thêm 5 bản quét.
- Bản quét "unlit" (Budai) được đổi sang MeshStandardMaterial lúc nạp. Nếu không đổi, khi phủ `finish` lên vật liệu unlit thì three.js lỗi uniform `emissive` mỗi khung hình.
- Toàn bộ tượng ~6 MB (tải sau khi cảnh hiện). `buddha-seated.glb` không còn dùng.
- Xử lý Blender: `process3.py` kiểu lọc lưới theo tên (`NgaiDiaTang`, `Monk Statue 0x`), tách theo khoảng x (bộ 3 tượng Jizo đội nón), cắt nền theo bán kính.

### 2.2f Chánh điện lớn, Tây Phương ba tượng, Hộ pháp ngoài hiên (03/11/2026, Claude)

- **`world.hall`** (scene JSON) giờ quyết định kích thước chánh điện. Các hàm đọc nó: `hallLayout()` trong `temple3d-models.mjs`, `buildHall`, `buildAltar`, `buildLanterns`, mặt tiền / mái / thềm trong `courtyard3d.mjs`, và việc camera tránh cột trong `renderer3d.mjs`. Thiếu trường nào thì dùng số của chánh điện cũ (12 × 19 m). Hiện tại: rộng 18 m (`halfWidth` 9), z −5…16, trần 9,5 m, cột ở x ±7,4, bệ thờ dài 14 m.
- **Bàn thờ** (`world.statues.shrine`): A Di Đà đứng ở giữa (cao 4,6 m cả bệ), Địa Tạng bên trái, Quan Âm bên phải (nhìn từ phía người lạy). Mỗi tượng có bệ bát giác + vầng lửa (`throne`). A Di Đà và Quan Âm có sẵn đài sen nên dùng `throne: { lotus: false }`. Tượng A Di Đà đặt `replaces: 'buddha'` để ẩn tượng Phật khối khi tải xong.
- **Hộ pháp** dời ra hiên (x ±3,9, z 17,7), quay mặt ra sân, có vật cản đi lại.
- **Sửa tượng đen:**
  - Bố Đại là bản unlit không có pháp tuyến; nay tự tính pháp tuyến khi thiếu.
  - Lớp phủ vàng/đồng giảm độ kim loại xuống 0,3, vì trên máy yếu ánh sáng môi trường bị tắt và kim loại cao thì đen.
  - Tượng sư đen và hai tượng sư CTI được nhuộm lại texture sang đồng. Script thay texture: `scratchpad/retexture.mjs` (gltf-transform core) — thay ảnh rồi `optimize` lại.
- Bỏ `buddha-seated.glb` (không còn dùng). Đã bỏ lời gọi `buildLanterns` bị trùng (trước vẽ đèn lồng hai lần).

### 2.2g Thẻ người chơi, kết bạn, khiêu chiến kéo búa bao (03/11/2026, Claude)

- **Bấm vào người khác** (nhân vật đi lại, hoặc bồ đoàn có người ngồi) → `apps/web/public/player-social.js` mở thẻ thông tin:
  - nội dung: ảnh, tên, cấp, công đức, Khách / Thành viên / "Phật tử ảo (máy)";
  - nút Kết bạn và Khiêu chiến.
  `explore3d.mjs` nhận `onWalkerTap` (raycast thân nhân vật trước bồ đoàn và sàn).
- **Protocol (v1, chỉ thêm loại mới):** `friend.request` / `friend.respond` → `friend.state`; `challenge.send` / `respond` / `move` / `cancel` → `challenge.state`. Chỉ gửi cho hai người liên quan. Bảng chi tiết ở `packages/protocol/README.md`.
- **Server làm trọng tài** (`Room` trong `apps/realtime/server.mjs`):
  - lựa chọn của từng người chỉ lộ ra ở `last` khi lượt xong;
  - chạm 2 thắng, tối đa 9 lượt; mỗi lượt 10 giây, không ra tay thì thua lượt; lời mời hết hạn sau 20 giây;
  - mỗi người một trận một lúc (`BUSY`);
  - người rời phòng (hết hạn nối lại) hoặc bot rời thì trận bị huỷ; bot đang chơi thì không rời giữa trận.
  - Bot nhận lời khiêu chiến và ra ngẫu nhiên (thẻ ghi rõ là máy). Không kết bạn được với bot.
- **Bạn bè:** cả hai đã đăng nhập thì realtime gọi `POST /internal/friends` (`action: add`), lưu bảng `friends` trong `packages/accounts` (mỗi cặp một dòng). Khách thì chỉ là bạn trong phiên. `GET /api/v1/me/friends` trả danh sách bạn (chưa có giao diện danh sách bạn).
- Lỗi của thao tác kết bạn / khiêu chiến có `requestId` bắt đầu bằng `social-`, nên được báo bằng câu riêng (`social.err.*`), không dùng câu lỗi chung.
- Chữ hiển thị có đủ vi/en/zh/es.
- Kiểm tra trình duyệt hai người: `scratchpad/social-check.mjs` (bấm thật vào nhân vật nhờ `chanhDienExplore.debugScreenOf(id)`; có `window.chanhDienSocial` khi bật `debug-explore`).
- **Chặn / báo cáo (03/11/2026):**
  - `player.block`: người bị chặn không gửi lời mời kết bạn / khiêu chiến được (cả hai chiều, lỗi chung `NOT_ALLOWED` nên không lộ ai chặn ai), trận đang có giữa hai người bị huỷ. Trên máy người chặn, chat và lời nguyện kèm lễ của người bị chặn được ẩn. Danh sách chặn giữ khi nối lại, nhưng chỉ trong phiên.
  - `player.report`: chọn 1 trong 4 lý do, realtime chuyển `POST /internal/reports` → bảng `reports` (có tên + tài khoản nếu có, phòng, lý do, ghi chú). Giới hạn 3 lần / 10 phút; không báo cáo bot; người bị báo cáo không biết.
  - **Chưa có giao diện quản trị để xem báo cáo** (`accounts.reports()` đã có). Cần làm trước khi mở rộng tương tác giữa người lạ; rà lại với trust-safety.
- **Màn Bạn bè** (menu ⚙ → 👥 Bạn bè): hai mục "Đang ở phòng này" (bạn trong phiên, có nút Khiêu chiến) và "Bạn đã lưu" (`GET /api/v1/me/friends`; khách thấy lời nhắc đăng nhập).
- Kiểm tra trình duyệt: `scratchpad/block-check.mjs` chạy hai tiến trình Chrome riêng (profile riêng → tài khoản riêng), đăng ký hai tài khoản, kiểm tra kết bạn có lưu, chặn, ẩn chat, báo cáo trong SQLite.
- **Còn có thể làm:** mời bạn đã lưu vào phòng của mình; thêm trò khác (`GAMES` trong protocol); bảng thắng/thua cho thành viên; giao diện quản trị báo cáo.
- **Tối ưu oẳn tù xì 02/11/2026:** đo Chrome mobile trước khi sửa cho thấy bảng trò chơi đã phủ màn hình nhưng WebGL phía sau vẫn vẽ 313 draw call / khoảng 258k tam giác mỗi khung, đồng hồ còn dựng lại toàn bộ bảng mỗi 500 ms (176 thay đổi DOM trong 5 giây). `renderer3d.setPaused(true)` nay dừng render/cập nhật 3D khi bảng mở và chạy lại khi đóng; đồng hồ chỉ sửa dòng đếm ngược khi số giây đổi, không tạo lại nút/emoji; panel dùng `contain: layout paint`, tay lật chỉ promote `transform/opacity`. QA xác nhận `paused: true` trong trận, chọn nước đi hoạt động, đóng bảng trả `paused: false` và cảnh chạy lại khoảng 58 FPS trên Chrome thử; 135 test + lint qua.

### 2.2h Bot đi dạo ngoài khuôn viên (02/11/2026, Codex)

- `THIEN_RULES.bots.walk` cấu hình tối đa 3 bot ngoài sân (1 bot xuất hiện ngay), tốc độ, thời gian nghỉ và 20 điểm tuần tra dọc các lối đá từ sân trước tới bồn nước. Test cảnh xác nhận mọi điểm đều thuộc `world.walk`, không nằm trong hồ hay vật cản.
- `Room` tạo bot ngoài sân với `pos` thay vì `seatId`; mỗi giây tiến tới điểm kế tiếp và dùng chung `Room.move`, nên vị trí vẫn được giới hạn tốc độ, gom gói 200 ms và phát `room.moves` giống người thật. Client dùng sẵn `explore-ui.js` để dựng nhân vật đi bộ, không cần một luồng hiển thị riêng.
- Bot ngoài sân niệm Phật/trò chuyện theo ngôn ngữ phòng nhưng không dâng lễ vật từ ngoài sân. Bot ngồi vẫn dâng hương/hoa trong chánh điện.
- Khi người thật tăng, bot ngồi rời trước để nhường bồ đoàn; tối đa 3 bot đi dạo vẫn ở ngoài vì không chiếm ghế, kể cả khi 20 bồ đoàn đã đủ người thật. Khi người thật cuối cùng rời phòng thì mọi bot vẫn được dọn như trước.
- QA Chrome mobile 440×956 xác nhận phòng tiếng Anh nhận đồng thời 3 bot ngoài sân, vị trí thay đổi và `visible: true`. Toàn bộ 130 test qua, lint 71 JavaScript + 17 JSON qua.
- **Sửa 02/11/2026:** góc quay bot dùng cùng quy ước trục −z với nhân vật 3D nên không còn trượt lùi. Tuyến tuần tra đổi thành vòng 20 đoạn: luôn quay lại lối giữa và vòng hai phía bồn nước, không nối thẳng xuyên bồn/tượng. Test lấy mẫu mỗi 10 cm trên cả đoạn và kiểm tra hướng quay; trình duyệt mobile xác nhận bot đi trái quay +π/2, đi về phía sân quay ±π.
- **Camera mobile cố định:** `world.camera.follow` giữ khoảng cách ngang 3,8 m, cao 2,7 m, nhìn vào cao độ 0,95 m; khóa zoom và pan nhưng vẫn cho xoay quanh nhân vật. Trang chánh điện chặn browser zoom, tap highlight, chọn chữ/callout khi nhấn giữ (trừ trường nhập liệu). QA 440×956 đo khoảng cách camera 4,184 m trước/sau thao tác thu nhỏ không đổi. Sau thay đổi: 135 test qua, lint sạch.

### 2.2h Vòng sáng chỗ ngồi được (03/11/2026, Claude)

- `explore3d.mjs`: khi nhân vật của mình cách bồ đoàn (`world.seats`) hoặc ghế đá (`world.courtyard.benches`) **còn chỗ** dưới 2,6 m, dưới vật đó hiện vòng sáng vàng nhấp nháy (tối đa 3 vòng gần nhất; ghế đá là vòng elip theo hướng ghế). Vật gần nhất có chữ "Chạm để ngồi" (`explore.tapToSit`, 4 ngôn ngữ). Đang ngồi, đang xem (khán giả) hoặc `prefers-reduced-motion` thì tắt / không nhấp nháy.
- Chỗ có người lấy từ `room.state`: `explore-ui.js` gọi `api.setOccupancy({ seats, benches })`.
- Lỗi "Message không hợp lệ" khi bấm ghế đá: server realtime đang chạy bản cũ chưa có `bench.select` (`UNKNOWN_MESSAGE_TYPE`). Khởi động lại server là hết. Client giờ báo rõ "Máy chủ chưa cập nhật tính năng này" (`err.UNKNOWN_MESSAGE_TYPE`).

### 2.2i Vườn Công Đức (03/11/2026, Claude)

- **Rà soát → cách tích hợp:**
  - API đã có tài khoản SQLite (`node:sqlite`, `.data/app.db`) và cookie phiên; realtime nhận lệnh nội bộ có khóa. Postgres chưa có.
  - Vì vậy vườn dùng chung file SQLite với tài khoản. Thao tác đi qua REST `/api/v1/garden/*` (đăng nhập, cùng origin, `Idempotency-Key`, giới hạn 30 lần/phút).
  - API báo realtime `POST /internal/garden`; realtime kiểm schema rồi phát `garden.plot` cho mọi phòng chánh điện.
  - Luật và bảng: `packages/garden/README.md`.
- **3D:** khu trồng gọn có hàng rào gỗ bao quanh (x 13,2–31,4, z 63–73).
  - 10 luống 2,2 m (2 hàng × 5, cách 3,4 m, hai hàng z 65,5 / 70,5).
  - Cổng "VƯỜN CÔNG ĐỨC" ở cạnh tây (z 68, rộng 2,4 m) có lối đá nối với lối giữa.
  - Quầy hạt giống ngoài rào cạnh cổng (10,6; 64,2).
  - Hàng rào là các đoạn `garden.fence: [[x0, z0, x1, z1]]`; script đổi mỗi đoạn thành chuỗi vật cản nhỏ, nên không đi xuyên rào được.
  - Trang trí trong rào (`addGarden`, tính từ khung hàng rào): nền sỏi kem, đá bước dọc lối cổng, đất luống có rãnh, viền gỗ sáng + cột góc, biển số luống quay ra lối đi (một texture ghép số 1–10), hoa dọc chân rào, đèn đá bốn góc, thùng nước có gáo (`garden.barrel`).
- **Giao diện vườn (thiết kế lại):**
  - Thẻ luống nổi ở đáy màn hình (`.garden-card`), vẫn thấy cây: thanh 4 giai đoạn, 3 giọt nước, hàng icon quả.
  - Luống trống: chọn 1 trong 3 thẻ hạt → "Gieo 1 hạt …".
  - Trong 8 giờ sau lần tưới gần nhất thì khóa nút tưới và hiện đếm ngược; cảnh báo mốc héo 24 giờ.
  - Quầy chỉ còn "Mua 1 hạt" và bán / dâng từng quả hoặc bán hết.
- **Đổi tài khoản giữ vị trí:** trước khi vào lại phòng, `explore.keepPosition()` nhớ chỗ đứng (`api.selfPose()`); lần báo vị trí đầu tiên dùng chỗ đó thay cho cửa chánh điện.
  - Tất cả lấy từ `world.courtyard.garden`, sinh bằng `scripts/thien-garden-layout.mjs`.
  - Phần tĩnh: `courtyard3d.mjs` (`addGarden`).
  - Phần động: `garden3d.mjs`
    - 4 giai đoạn: ụ đất + hạt + que biển → mầm → cây non → cây ra quả (quả là một InstancedMesh cho cả vườn, đúng số còn lại, màu theo loại);
    - nhãn trên luống;
    - hiệu ứng gieo, tưới, hái (cả phòng cùng thấy qua `effect`).
  - Lại gần luống / quầy thì có vòng sáng và chữ "Chạm để xem luống" / "Quầy hạt giống".
- **Giao diện** (`apps/web/public/garden-ui.js`):
  - bảng luống: cây, người trồng, giai đoạn, thanh tiến độ tưới, số quả; nút Gieo / Tưới / Hái;
  - quầy: ví xu, mua hạt +1 / +5, kho quả, bán, dâng, lịch sử xu;
  - khách thấy nút đăng nhập.
  - Mỗi lần bấm sinh một khóa idempotency; mạng lỗi thì thử lại đúng khóa đó.
  - Client tải lại vườn mỗi 20 giây.
- **Đã kiểm tra:**
  - 9 test store, 3 test API, 1 test realtime, 1 test protocol;
  - trình duyệt với hai thành viên ở hai Chrome riêng:
    - hai người gieo cùng lúc thì đúng một người thắng (409 `PLOT_TAKEN` cho người kia);
    - các lần tưới cách nhau 8 giờ; đủ 3 lần ra 10 quả (khóa thử dùng đồng hồ giả lập);
    - khách hái 2 rồi bị chặn; chủ hái 8; luống trống;
    - bán / dâng cập nhật ví và kho;
    - người kia thấy chủ luống ngay nhờ realtime.
- **Triển khai:**
  - `GARDEN_TIMEZONE` (mặc định `America/Los_Angeles`) chỉ còn phục vụ ngày thống kê/hết hạn quả; mốc tưới 8/24 giờ dùng timestamp server.
  - `REALTIME_INTERNAL_URL` để API báo realtime.
  - Sao lưu `.data/app.db` (giờ có cả ví xu).
- **Giới hạn hiện tại:**
  - API chỉ báo một máy realtime (`REALTIME_INTERNAL_URL`). Chạy nhiều máy realtime thì các máy khác chỉ cập nhật nhờ client tải lại mỗi 20 giây; cần Redis pub/sub nếu muốn tức thì.
  - Chưa có màn quản trị ví / đối soát.
  - Dâng quả chưa cộng công đức.
  - Khách không tưới được, vì cần tài khoản để ghi lịch sử tưới (khác yêu cầu gốc "any user can water").
  - Camera nhập vai không tự quay về phía luống.
- **Cập nhật 03/11/2026 — luống kết trái và chu kỳ nước:** cây ở giai đoạn kết trái đổi từ một cây to sang sáu cụm cây thấp xếp hai hàng trong luống, quả phân bố trên từng cụm giống vườn rau/quả tham chiếu. Lần tưới đầu được thực hiện ngay, các lần sau cách 8 giờ theo đồng hồ server; quá 24 giờ cây chuyển màu, rũ xuống và hiện cảnh báo héo nhưng không bị xóa. Tưới cây héo sẽ hồi phục. Migration v2 thêm `last_water_at`; protocol bổ sung các mốc `nextWaterAt`, `wiltsAt`, `canWater`, `wilted` dưới dạng trường tùy chọn để client cũ vẫn đọc được.

### 2.2j Phòng 500 người: chánh điện / sân riêng (03/11/2026, Claude)

- Load test (`loadtest/room-capacity.mjs`): bản cũ gửi lại cả danh sách người cho mọi người mỗi khi có người vào/ra/đổi ghế, sập ở ~600 người. Giờ phòng chánh điện nhận 500 người (`maxParticipants`, `maxWalkers` = 500); sảnh chỉ mở PV2 khi PV1 đủ 500 người thật.
- `world.zones.hall` + `world.view` trong room rules: mỗi máy chỉ nhận người cùng vùng (chánh điện hoặc sân), tối đa 60/40 người gần nhất, cộng người ngồi bồ đoàn/ghế đá và người đang mời/đấu với mình. `room.state` gửi riêng từng người, chỉ khi phần đó đổi (đi lại không gửi lại, vị trí đi bằng `room.moves` đã lọc). Danh sách tính lại mỗi 500 ms; phòng ≤ 80 người tính ngay.
- `room.count` (mới): tổng người cả phòng **có tính bot** (theo yêu cầu) kèm số bot; chạm số người hiện "Gồm N Phật tử ảo (máy)". Bảng công đức lấy top 10 + hạng của mình từ đây. `chat.message`, `offering`, `prayer.received` có thêm `displayName?` để hiện tên người ở xa.
- Kết quả 500 người: chat p95 46 ms, CPU 24 %, mỗi điện thoại nhận 177 kbps (trước 1,5 Mbps). Thử trên trình duyệt với 150 người giả: ngoài sân vẽ 40 người, trong điện 30, số người hiện 154.
- Còn lại: vote, sức chứa và sảnh vẫn chỉ đếm người thật; chưa đo nhiều phòng trên một máy và chưa đo trên máy chủ thật.

### 2.2k Vào phòng không giật, camera đứng sẵn ngoài sân (03/11/2026, Claude)

- Đo (CPU profile + danh sách chương trình shader trước/sau khi vào): khung hình đầu sau khi vào mất ~3,6 s vì
  (1) nhân vật, nhãn, vòng sáng chưa từng hiện nên chưa biên dịch; (2) bộ tự hạ chất lượng tắt bóng nắng → đổi số đèn
  đổ bóng → mọi vật liệu biên dịch lại; (3) tượng (6,8 MB) tải xong dồn cùng lúc.
- Sửa: `warmup()` của explore3d + người ngồi/vòng/cuộn sớ được biên dịch lúc nạp; dựng thử 4 khung thật từ chỗ xuất
  hiện (sau cổng vào); tắt bóng = thu khung chụp bóng về rỗng rồi ngừng vẽ (không đổi shader); tượng hiện lần lượt
  mỗi khung một nhóm, đưa ảnh lên GPU bằng `initTexture`; quả trong vườn có `instanceColor` từ đầu.
- Cổng vào hiện "Đang tải cảnh 3D… n%". Bấm vào là camera đặt ngay sau lưng chỗ xuất hiện (`previewSpawn`), không còn
  nhìn cảnh tổng đỏ trong chánh điện 1–2 s chờ server. Chỗ xuất hiện lùi về z = 33 cho lư hương không che màn hình.
- Kết quả (Chrome chạy GPU, mạng trễ 400 ms): lúc vào chỉ còn 2 khung ~0,15 s, không còn tác vụ dài.
  Còn lại: bật bóng thử trên điện thoại và tắt ánh sáng môi trường (máy rất yếu) vẫn biên dịch lại một lần.

### 2.3 Lỗi và chi tiết còn lại

- **Đã sửa 02/11/2026 — chạy thẳng vào lư hương bị khựng:** `resolveMove` chuyển một phần quãng đi bị chặn sang tiếp tuyến và có test đi đúng tâm lư hương.
- **Đã sửa 02/11/2026 — quay ngược, đổi chạy/đi và xuyên vật:** bot/người khác quay theo vector nội suy thật thay vì góc mạng tới trễ; cần điều khiển đã vào trạng thái chạy thì giữ chạy tới lúc thả tay. `resolveMove` quét cả quãng đường theo bước 20 cm nên FPS thấp không nhảy qua vật nhỏ, và cùng va chạm này áp dụng cho bot. Bụi cây, toàn bộ chiều dài ghế đá, 19 khóm hàng rào cây, bàn lễ và hai đèn đá trong khu Quan Âm đã có vùng cản; lối chính vào khu Quan Âm vẫn để trống. Test hồi quy phủ vật nhỏ, tường, hồ, tuyến bot và từng vật ở khu Quan Âm.
- **Đã làm 03/11/2026 — ghế đá hai người:** dữ liệu `world.courtyard.benches` có `id`, `scale: 0.72`, `seats: 2`; collider và bóng nướng sẵn co theo cùng tỷ lệ. Ghế vẽ trong `StaticBatch`, còn `courtyard3d.mjs` tạo proxy raycast vô hình để chạm trúng từng ghế. `bench.select` cấp spot 1/2 tại server; `participant.benchId/benchSpot` nằm trong state/snapshot. Client chỉ cho tương tác trong bán kính 2,6 m, hiện nút DOM “Ngồi xuống” dùng chung cho ghế đá và bồ đoàn, rồi dùng A* đi nốt tới mép chỗ ngồi. Sau khi server chấp nhận mới snap vào tư thế ngồi; người thứ ba không được cấp chỗ. Đã QA ba trình duyệt: spot 1, spot 2 và người thứ ba vẫn đứng ngoài; QA mobile xác nhận cả hai loại chỗ chỉ hiện nút khi lại gần.
- **Camera:** khi đứng sát tường hoặc cột ngoài sân, camera có thể chui vào vật (hiện chỉ tránh cột trong điện, `PILLARS` trong `renderer3d.mjs`). Thêm tránh vật cản ngoài sân, lấy từ `world.walk.obstacles`.
- **Màn hình nạp:** sân làm lần tải 3D chậm hơn. Cân nhắc dựng sân sau khi điện đã hiện (tách bước), hoặc thêm thanh tiến độ.

## 3. Ràng buộc (không được phá)

- Nguyên tắc kiến trúc trong `AGENTS.md`. Đặc biệt:
  - Cảnh là dữ liệu: toạ độ để trong scene JSON, không viết cứng trong engine.
  - Message client↔server chỉ định nghĩa trong `packages/protocol`.
- Không vẽ gì đè lên khung YouTube (bài giảng 18:00 có khung phát 200×200).
- Three.js ghim 0.160.0 (phục vụ ở `/vendor/three/`). Không thêm framework hay bundler. Skill tham khảo: `.claude/skills/threejs-*` (đặc biệt `threejs-lighting`, `threejs-performance`, `threejs-geometry`).
- Chữ hiển thị đủ 4 ngôn ngữ trong `apps/web/public/thien-i18n.js` (vi, en, zh, es).
- Không lấy tài nguyên của didenchua.online hay chuasen.com. Mô hình ngoài (nếu dùng) phải là CC0 hoặc có giấy phép, ghi nguồn trong README. Hỏi người dùng trước khi tải file.
- Nhiều trợ lý đang sửa cùng repo:
  - Đọc lại file trước khi sửa, sửa từng chỗ nhỏ.
  - Không tắt server người khác đang chạy (`npm run online`, `npm run dev`). Muốn thử thì chạy bộ riêng ở cổng khác, ví dụ `WEB_PORT=3200 API_PORT=4200 REALTIME_PORT=4201`, với `API_UPSTREAM`, `REALTIME_UPSTREAM`, `REALTIME_INTERNAL_URL`, `API_INTERNAL_URL` trỏ đúng cổng; xem `scripts/online.mjs`.
  - Thay đổi phía server (`apps/realtime`, `apps/api`, `packages/room-rules`, `packages/protocol`) chỉ có hiệu lực sau khi khởi động lại server.
- Chỉ commit khi người dùng yêu cầu.

## 4. Cách kiểm tra

- `npm run lint`, `npm test` (hiện 121 test đạt).
- Chụp màn hình bằng Chrome chạy ngầm, khung 440×956:
  - Cờ `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader`, điều khiển qua DevTools Protocol (cổng `--remote-debugging-port`). Phải giả lập điện thoại (`Emulation.setDeviceMetricsOverride` với `mobile: true`, `Emulation.setTouchEmulationEnabled`) để thử nhánh `pointer: coarse` (tắt shadow map).
  - Đặt `localStorage['debug-explore'] = '1'` trước khi tải trang: trang gắn `window.chanhDienExplore` (api nhập vai: `position()`, `debugState()`, `setWalkers()`…) và `window.chanhDienRenderer` (`debugView(position, target)`, `stats()`).
  - Muốn đặt camera tự do: gọi `chanhDienExplore.setWalkers([], { seatedSelf: true })` để tắt camera bám, rồi `chanhDienRenderer.debugView([x, y, z], [tx, ty, tz])`.
  - Đi lại trong trang: phát `KeyboardEvent('keydown', { code: 'KeyW' })` lên `window` (giữ Shift: `{ key: 'Shift' }`).
- Các góc nên chụp:
  - từ chỗ xuất hiện (sân, z 27,5 nhìn về điện);
  - từ cổng (z 31 nhìn vào);
  - từ thềm nhìn ra cổng;
  - góc chéo thấy tường và cây hai bên;
  - trong điện nhìn ra cửa.
- Ghi số FPS và lệnh vẽ vào `KE_HOACH.md`.

## 5. Việc dở dang khác (ngoài sân, để biết)

- **Kinh văn:** Kinh A Di Đà, Phổ Môn, Dược Sư, Vu Lan mới có khung (`apps/web/public/sutras.js`, chỗ `TODO(nhà chùa)`). Chờ nhà chùa gửi toàn văn bản chuẩn. Hai thần chú (Vãng sanh, Dược Sư) cần nhà chùa đối chiếu.
- **Mô hình thật:** chú tiểu .glb có khung xương + động tác Mixamo (người dùng chọn CC0 + Mixamo). Mixamo cần tài khoản Adobe nên người dùng tự tải. `chibi3d.mjs` là bản dựng tạm, thay được mà không đổi điều khiển.
- **Load test** phần di chuyển để chốt `maxWalkers` (đang 200).
- **Rạp phim 3D** (Giai đoạn 9.4).
- **Chưa thử trên điện thoại thật:**
  - giọng đọc (đã sửa nhiều lần, xem `temple-audio.js`: hàng đọc tự quản, chống kẹt, không đánh thức nhạc khi đang đọc);
  - tốc độ khung hình ngoài sân.
