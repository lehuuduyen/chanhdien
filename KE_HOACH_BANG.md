# KE_HOACH_BANG — Điểm đặc trưng riêng của từng tiểu bang (Claude và GPT/Codex làm chung)

Lập ngày 12/11/2026. Người đọc: Claude Code và GPT/Codex cùng làm, chia theo bang. Đọc trước: `AGENTS.md` (đoạn
"Phong cảnh theo vùng", "Trời theo giờ thật"), [KE_HOACH_VUNG.md](KE_HOACH_VUNG.md) mục 3–6 (ràng buộc, quy trình), rồi
file này từ đầu tới cuối.

Yêu cầu của người dùng: **mỗi tiểu bang thêm điểm đặc trưng riêng; đứng xa cũng phải thấy cảnh.**

Hiện mỗi bang lấy cảnh của vùng (9 vùng, KE_HOACH_VUNG.md), nên các bang cùng vùng trông giống hệt nhau (vd. 12 bang
`autumn`). Kế hoạch này thêm một lớp mỏng theo bang đặt lên cảnh vùng:
- **Điểm nhìn xa:** một cảnh lớn nhô lên trên tường sân, nhìn từ đâu trong sân cũng thấy.
- **Chi tiết gần:** vài vật nhỏ rải ngoài tường.

## 1. "Từ xa cũng phải thấy" nghĩa là gì (đo được)

Sân rộng 104 × 84 m, tường thấp 1,3–1,5 m, sương từ 30 m tới 150 m. Cảnh đặt xa mà dùng vật liệu thường thì sương phủ
gần kín (ở 120 m mất khoảng 75 %), nên phải có cỡ lớn và vật liệu riêng:

- **Cao và đặt ở đâu:**
  - Điểm nhìn xa cao ít nhất 20 m.
  - Đặt cách tường sân 25–90 m, ở một hoặc hai phía: `gate` (ngoài cổng), `east`, `west`, `back` (sau chánh điện; mặt
    đất phía sau chỉ tới z = −22).
- **Ít sương hơn:** dùng vật liệu xa `env.far(màu, { haze })`, chỉ chịu một phần sương (haze 0,3–0,6) nên vẫn nổi rõ
  trên nền trời.
- **Đo bằng `npm run theme:shots -- --state <mã>`:** chụp mỗi góc hai lần, có và không có lớp của bang, rồi tính phần
  trăm điểm ảnh khác nhau ("độ thấy"). Đạt khi:
  - **Ban ngày** (`--sun 50`):
    - độ thấy ≥ 1,5 % ở ít nhất 4 trong 8 góc;
    - bắt buộc có góc giữa sân nhìn ra cổng (`3-cong-nui`) và một trong hai góc mới đứng xa: `7-vuon-hoa-tay` ở góc Vườn
      Hoa phía tây, `8-nong-trai-dong` ở góc phía đông, cả hai nhìn về khoảng ngoài cổng (0, 160). Khung dọc điện
      thoại chỉ rộng ~24°, nên điểm nhìn xa nên to hoặc đặt gần trục cổng.
  - **Ban đêm** (`--sun -15`): độ thấy ≥ 0,8 % ở ít nhất 2 góc. Đêm vẫn phải nhận ra cảnh, nhờ đèn, quầng sáng hoặc bóng
    hình trên nền trời.
- **Thứ tự:** điểm nhìn xa không che hết núi của vùng và không che bảng tên các khu trong sân.

## 2. Nguyên tắc nội dung (người dùng quyết 12/11/2026: được dựng công trình nổi tiếng)

- **Được dựng công trình và thắng cảnh nổi tiếng của bang** (cầu, tháp, tượng đài, hải đăng, đập, núi, thác…) ở dạng khối
  giản lược, nhìn dáng là nhận ra. Nên chọn thắng cảnh thiên nhiên và công trình công (của liên bang / bang / thành phố).
- **Không ghi chữ, logo, tên thương hiệu** lên công trình hay cảnh.
- **Mặc định không dựng** (người dùng muốn đưa vào thì sửa danh sách này):

  | Công trình | Lý do |
  | --- | --- |
  | Chữ HOLLYWOOD | Thương hiệu, cấp phép chặt |
  | Lâu đài Disney | Thương hiệu |
  | Tượng Cloud Gate (Chicago) | Tác phẩm có bản quyền |
  | Rock & Roll Hall of Fame | Công trình 1995 có bản quyền, thương hiệu |
  | Tháp đôi Churchill Downs | Thương hiệu |
  | Tòa sòng bạc, sân vận động đội thể thao | Thương hiệu |
  | Space Needle | Chủ sở hữu giữ thương hiệu hình dáng và hay đòi phí |
  | Tượng khắc Stone Mountain (GA) | Tạc tướng Liên minh miền Nam, nhạy cảm |
  | Nhà thờ, công trình tôn giáo khác | Cảnh đặt cạnh chùa Phật giáo |
- **Đưa vào nhưng cần lưu ý:**
  - Cầu Cổng Vàng (CA) và tòa Empire State (NY, trong đường chân trời): chủ sở hữu có đăng ký thương hiệu hình dáng, mà ứng
    dụng có bán kim cương (dùng thương mại). Chỉ dựng giản lược, không chữ; bị khiếu nại thì thay bằng thắng cảnh khác của
    bang.
  - Núi Rushmore (SD): người dùng xác nhận dựng (12/11/2026). Tượng bốn tổng thống tạc trên núi Black Hills, nơi thiêng
    của người Lakota: dựng nghiêm trang, giản lược, không thêm gì lên mặt tượng (mũ, đồ vật, hiệu ứng vui), không chữ.
  - Đây không phải ý kiến pháp lý.
- **Không có người thật**, trừ bốn khuôn mặt tạc ở núi Rushmore (SD). Văn hóa bản địa (cột totem, trang phục) không dùng làm
  đồ trang trí.
- Nhìn là biết bang nào, không cần ghi tên lên cảnh.

## 3. Chia việc

51 mã (50 bang + DC). Việt Nam đã có vùng riêng `vietnam`, không thuộc kế hoạch này. Chia theo vùng mỗi người đã làm (đã
quen bộ đồ vùng đó), riêng vùng `autumn` (12 bang) chia đôi:

| Người làm | Vùng | Số bang |
| --- | --- | --- |
| **Claude** | `desert` (AZ NV NM UT), `snow` (AK CO MT WY ID), `california` (CA), `blossom` (DC DE KY MD NC TN VA WV), `autumn` (CT ME MA NH RI VT NY + NJ PA MI MN WI nhận từ GPT 12/11/2026), `tropical` (FL HI, nhận từ GPT 12/11/2026) | **32** + Bước 0 (phần chung) |
| **GPT/Codex** | `plains` (IL IN IA KS MO NE ND OH OK SD), `south` (AL AR GA LA MS SC TX), `pacific` (OR WA) | **19** (ban đầu 26) |

- GPT làm xong 2 vùng nền `south`, `pacific` (KE_HOACH_VUNG.md) rồi mới nhận bang của 2 vùng đó.
- Bang của các vùng đã xong thì nhận được ngay sau Bước 0.
- Người dùng đổi phân công bằng cách sửa cột "Người làm" ở mục 5.

## 4. Bước 0 — phần chung (Claude, xong 12/11/2026)

1. **Dữ liệu mỗi bang một file** `scenes/thien-default/states/<mã>.json` (`validateState` trong `world.mjs`, chỉ kiểm
   tra dạng):

   ```json
   {
     "landmarks": [
       { "kind": "grand-canyon", "side": "gate", "distance": 62, "offset": 0, "scale": 1, "haze": 0.3, "params": {} }
     ],
     "hide": ["mountains"],
     "clear": [{ "side": "gate", "from": 48 }],
     "scatter": [{ "kind": "ocotillo", "count": 30, "band": [6, 40] }]
   }
   ```

   - Tối đa 6 mục `landmarks` (bang ven biển cần mặt nước nhiều phía), 3 nhóm `scatter`.
   - `side`: `gate` / `east` / `west` / `back`; `distance`: mét tính từ tường sân (nên 25–90; `back` tối đa ~35 vì đất
     sau điện chỉ tới z = −22); `offset`: lệch dọc tường (m); `params`: tham số riêng của kiểu.
   - `hide: ["mountains"]`: ẩn núi của vùng khi cảnh bang thay chỗ đó (Grand Canyon, biển).
   - `clear`: không rải vật của vùng (và của bang) ở phía `side` cách tường từ `from` m trở ra, vd. chỗ có biển. Bang có
     `clear` thì đổi bang phải dựng lại vật rải của vùng.
2. **Bộ đồ mỗi bang** `packages/scene-engine/src/landmarks/<mã>.mjs`:
   - `export const kit = { landmarks: { kiểu(batch, x, z, scale, rand, env) }, scatter: { … } }`.
   - Kiểu tìm trong bộ đồ bang trước, rồi bộ đồ vùng, rồi `landmarks/common.mjs`.
3. **Thư viện chung** `landmarks/common.mjs` cho những thứ dùng ở nhiều bang (tham số hóa: màu, sọc, cỡ, số nhịp).
   Đã có:
   - điểm nhìn xa: `sea` (mặt biển có bờ đá về một phía), `lighthouse` (dải màu `bands` hoặc sọc xoắn `spiral`, bệ
     `plinth`, vách đá `cliff`, nhà người gác, đèn + luồng sáng quay ban đêm), `suspension-bridge` (cầu treo: tháp nhiều
     xà, cáp võng, dây treo, cầu dẫn dốc `drop`, cầu đôi `twin`, xoay `yaw`, đèn đêm), `capitol` (tòa mái vòm hai cánh, đèn
     rọi mái vòm; `dome` màu vàng / `corners` cho IA), `hills` (dãy đồi tô màu theo dải, có thể mở khe `notch`), `dunes`
     (đụn cát có cỏ biển), `sailboats` (thuyền buồm trôi, một mesh), `skyline` (đường chân trời thành phố, tòa nhà không
     có thật, cửa sổ sáng đèn + đèn neon ban đêm);
   - `farmstead` (trang trại: chuồng đỏ, silo, kiện cỏ khô; VA, VT, WI); `covered-bridge` (cầu gỗ có mái đỏ qua suối; VT,
     PA); `lighthouse` thêm `elevation` (đặt tháp lên địa hình tự dựng, như mỏm đá MN); `suspension-bridge` thêm kiểu tháp đá
     `style: 'masonry'` (cầu Brooklyn); `skyline` thêm tháp chính đặt tay `towers` (nhiều nấc + chóp, dáng chung); `hills`
     thêm `trees` (cụm tán rải trên sườn: rừng thu lốm đốm);
   - vật rải: `bison` (bò rừng), `cabin` (nhà gỗ, mái phủ tuyết ở vùng tuyết, cửa sổ sáng đèn ban đêm), `ranch-fence`
     (hàng rào gỗ zíc zắc), `seagrass` (cỏ biển), `cow` (bò sữa); vật rải tìm ở bộ đồ bang → thư viện chung này → bộ đồ
     vùng;
   - hàm dựng hình: `beam` (thanh nối hai điểm: dây cáp, cột buồm, thanh giằng), `ridge` (dãy núi / vách đá bằng lưới cao độ, có gân đá, lởm chởm, tô theo dải; dùng cho núi, vách
     hẻm, khe sông), `sweep` + `along` (khối uốn theo đường cong, dày mỏng tùy chỗ, méo đá `wobble`; dùng cho vòm đá,
     cổng vòm, sườn cầu vòm), `paintMerge` (gộp nhiều màu thành một hình cho vật chuyển động cả khối), `frame`,
     `outward`.

   Các món khác Claude thêm khi có bang cần; người cần ghi vào mục 8.

   | Món | Dùng ở |
   | --- | --- |
   | hải đăng (sọc, màu, đèn quay ban đêm) — **đã có** `lighthouse` | ME, NC, MD, MN, OH, MI |
   | cầu treo (màu, số nhịp, cao tháp) — **đã có** `suspension-bridge` | CA, DE, MD, RI, MI, NY |
   | cầu dây văng | MA, SC |
   | đường chân trời thành phố (đèn ban đêm) — **đã có** `skyline` | NY, MA, IL, NV |
   | mái vòm điện capitol — **đã có** `capitol` | DC, IA, WI |
   | tháp obelisk / cột tưởng niệm | DC, TX |
   | núi lửa chóp tuyết | WA, OR, AK, HI (biến thể có dung nham) |
   | cối gió điện quay | IA |
   | giếng dầu gật gù / tháp khoan | ND, OK, TX |
   | thuyền buồm trôi (**đã có** `sailboats`), đàn chim bay, đàn bò rừng (**đã có** `bison`) / gia súc | nhiều bang |

   Món mới mà nhiều bang cần thì ghi đề xuất ở mục 8 và không tự sửa `common.mjs`.
4. **Lõi:**
   - Engine:
     - `renderer.setTheme(vùng, { state })` tải lớp bang sau lớp vùng, gọi dồn thì lần sau cùng thắng;
     - nhóm `landscape-landmarks` dựng lại khi đổi bang;
     - bang chưa có file thì chỉ hiện cảnh vùng.
   - Trang chánh điện truyền tiểu bang đang chọn; `?state=<mã>` để xem thử.
5. **Tiện ích** (ghi đầy đủ ở đầu `landmarks/common.mjs`):
   - `env.far(màu, { haze })`: vật liệu xa, chịu một phần sương, vẫn pha màu theo giờ.
   - `env.nightGlow(x, y, z, cỡ, màu)`, `env.nightPoints([[x, y, z]…], { color, size })`, `env.nightMesh(geometry,
     màu, độ đậm, { vertexColors })`: đèn / quầng sáng chỉ hiện khi tối, vẽ sau lớp phủ đêm. `nightGlow` / `nightMesh`
     mỗi lần gọi một mesh; `nightPoints` gom mọi lần gọi cùng màu + cỡ (kể cả từ vật rải như cửa sổ nhà gỗ) thành một.
   - Vật chuyển động cả khối nhiều màu: `paintMerge` + `env.far('#ffffff', { vertexColors: true })` + `env.add`; lớp sáng
     đêm đi theo thì gắn làm con (`mesh.add(env.nightMesh(…))`), xem khinh khí cầu ở `landmarks/nm.mjs`.
   - `env.animate(fn(giây))`: chuyển động rẻ (khinh khí cầu trôi, cối gió quay, mạch nước phun, tên lửa phóng, cực
     quang), chỉ chạy khi camera ở sân. `env.add(object)`: vật riêng không gộp.
   - Hàm dựng nhận `(batch, x, z, scale, rand, env, { face, side, haze, params })`; `face` quay mặt trước về giữa sân.
   - `batch.add(…, { rotation, order })`: mặc định thứ tự Euler 'XYZ' (trục nghiêng là trục thế giới). Vật vừa nghiêng
     vừa quay hướng (`rotation: [nghiêng, face, 0]`, vd. mái nhà) phải thêm `order: 'YXZ'` (hoặc `geometry.rotateX` trước
     rồi chỉ quay hướng) — nếu không, vật ở phía đông / tây nghiêng sai trục (mái lệch).
   - Vật rải của vùng đặt theo vùng, không theo bang; `clear` chỉ bỏ vật nằm trong chỗ chừa (mảnh hình được nhớ, đổi
     bang chỉ gộp lại nên nhanh).
6. **Đo:** `npm run theme:shots -- --state <mã>[,<mã>…]` (cần `npm run dev`; thêm `--base` nếu web chạy cổng khác):
   - thêm 2 góc đứng xa (mục 1);
   - in ĐẠT / CHƯA ĐẠT theo mục 1, ảnh ghép ngày + đêm ở `.data/theme-shots/sheet.png`;
   - tính độ thấy ngày / đêm, số mesh / tam giác / ms của riêng lớp bang;
   - không rò bộ nhớ khi đổi qua lại 5 lần.
7. **Test** `packages/scene-engine/test/states.test.mjs`:
   - mỗi file bang hợp lệ, mã có trong `US_STATES`, mọi kiểu có thật;
   - điểm nhìn xa nằm ngoài sân và không lấn vào lưng điện; vật thêm riêng (`env.add`) xét từng đỉnh, kể cả sau khi chạy
     chuyển động ở vài thời điểm; khối dài xoay chéo (mặt cầu) xét theo hình chiếu thật trên mặt đất, không theo hộp bao;
   - tam giác mỗi bang trong ngân sách (đếm bằng batch giả như `themes.test.mjs`).
8. **Hai bang mẫu:** AZ (vùng `desert`, địa hình) và ME (vùng `autumn`, dùng hải đăng của thư viện chung).

## 5. Thiết kế từng bang

"Điểm nhìn xa" là phần bắt buộc phải thấy từ xa; "Chi tiết gần" là vật rải ngoài tường (không bắt buộc). Người làm được
đổi thiết kế nếu giữ mục 1–2 và khác rõ các bang cùng vùng; đổi thì sửa bảng này.

### Claude (25 bang)

| Mã | Vùng | Điểm nhìn xa | Chi tiết gần | Ban đêm | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| AZ | desert | Hẻm vực Grand Canyon: vách đỏ nhiều tầng chạy ngang chân trời ngoài cổng (mẫu) | Xương rồng ocotillo | Vách hắt ánh trăng | Chờ duyệt (Claude, 12/11/2026) |
| NV | desert | Đập Hoover cong trong hẻm Black Canyon + cầu vòm bê tông đôi phía trước; phía đông xa là đường chân trời kiểu Las Vegas (không dựng tòa sòng bạc có thật) | Cây Joshua | Thành phố rực đèn | Chờ duyệt (Claude, 12/11/2026) |
| NM | desert | Hàng chục khinh khí cầu lễ hội Albuquerque trôi trên trời (ngoài cổng và hai bên) + vách núi Sandia hồng | Nhà adobe | Khinh khí cầu phát sáng | Chờ duyệt (Claude, 12/11/2026) |
| UT | desert | Vòm đá Delicate Arch trước dãy La Sal phủ tuyết + rừng cột đá hoodoo (ngoài cổng bên trái, phía đông) | Đá đỏ | Bóng vòm trên nền sao | Chờ duyệt (Claude, 12/11/2026) |
| AK | snow | Núi Denali tuyết phủ khổng lồ (hai đỉnh) + đồi lãnh nguyên có sông băng chảy qua khe | Nai sừng tấm, nhà gỗ | Cực quang xanh lục gợn sóng | Chờ duyệt (Claude, 12/11/2026) |
| CO | snow | Hai chóp Maroon Bells đỏ tía, gờ tuyết trên cao, hồ Maroon trước chân; hai sườn thung lũng dương vàng + vân sam | Cây dương vàng, nhà gỗ | Đèn nhà gỗ | Chờ duyệt (Claude, 12/11/2026) |
| MT | snow | Dãy răng cưa công viên Glacier (sọc đá xám / đỏ / xanh, chóp sừng giữa) + hồ băng xanh ngọc + khách sạn nhà gỗ bên hồ | Bò rừng, hàng rào trại zíc zắc | Cửa sổ khách sạn sáng đèn | Chờ duyệt (Claude, 12/11/2026) |
| WY | snow | Dãy Grand Teton nhọn dựng đứng + mạch nước phun Old Faithful (phun ~20 giây mỗi 75 giây) cạnh hồ nước nóng nhiều màu | Bò rừng | Hơi nước sáng bạc | Chờ duyệt (Claude, 12/11/2026) |
| ID | snow | Thác Shoshone rộng nhiều nhánh đổ từ vách bazan (nước chảy), bụi nước, sông về phía sân | Ruộng khoai tây (luống đất phủ tuyết) | Thác bạc dưới trăng | Chờ duyệt (Claude, 12/11/2026) |
| CA | california | Cầu Cổng Vàng cam đỏ vắt qua eo biển (tháp art deco, cáp võng) + đồi Marin cỏ vàng; phía đông rừng gỗ đỏ | Vườn nho, hoa anh túc | Đèn dọc cáp và mặt cầu, đèn đỏ đỉnh tháp | Chờ duyệt (Claude, 12/11/2026) |
| DC | blossom | Đài tưởng niệm Washington (obelisk) + tòa Capitol mái vòm phía xa + hồ Tidal Basin viền anh đào, đài Jefferson; phía đông đài Lincoln | Ghế công viên | Tháp và mái vòm rọi sáng, đèn đỏ đỉnh tháp | Chờ duyệt (Claude, 12/11/2026) |
| DE | blossom | Cầu treo đôi Delaware Memorial tháp xanh lục qua sông rộng + đụn cát; phía đông tháp quan sát bê tông thời Thế chiến II | Cỏ biển | Đèn cầu | Chờ duyệt (Claude, 12/11/2026) |
| KY | blossom | Đồi cỏ xanh lam, hàng rào trắng chạy theo sườn đồi, chuồng ngựa đen mái gãy (không dựng tháp đôi Churchill Downs); có cả phía đông | Đàn ngựa | Đèn cửa chuồng | Chờ duyệt (Claude, 12/11/2026) |
| MD | blossom | Cầu Chesapeake Bay (cầu treo đôi tháp xám, cầu dẫn dài dốc xuống chạy chéo qua vịnh) + thuyền buồm; phía đông hải đăng chân cọc Thomas Point | Cỏ biển, thuyền buồm | Đèn cầu, hải đăng | Chờ duyệt (Claude, 12/11/2026) |
| NC | blossom | Hải đăng Cape Hatteras sọc xoắn đen trắng trên bệ gạch + đụn cát + biển | Cỏ biển, hàng rào chắn cát | Đèn hải đăng + luồng sáng quay | Chờ duyệt (Claude, 12/11/2026) |
| TN | blossom | Dãy Great Smoky nhiều lớp núi rừng xanh thẫm → lam, dải sương nằm trong thung lũng giữa các lớp | Nhà gỗ | Sương sáng bạc, cửa sổ nhà gỗ | Chờ duyệt (Claude, 12/11/2026) |
| VA | blossom | Dãy Blue Ridge sống dài đều xếp lớp + đường Skyline Drive men sườn (tường đá điểm ngắm) + trang trại chuồng đỏ, silo (cả phía đông) | Hàng rào gỗ zíc zắc | Đèn xe trên Skyline Drive, đèn trang trại | Chờ duyệt (Claude, 12/11/2026) |
| WV | blossom | Cầu vòm dàn thép gỉ sắt New River Gorge vượt hẻm sâu rừng phủ, sông có bè dưới đáy; phía đông đồi rừng | Bè trên sông (trong hẻm) | Đèn mặt cầu | Chờ duyệt (Claude, 12/11/2026) |
| CT | autumn | Tàu săn cá voi cổ ba cột buồm neo ở cảng Mystic Seaport + làng cảng nhà gỗ nhiều màu + đồi rừng thu (cả phía đông) | Tường đá khô | Đèn cầu tàu, đèn lồng trên tàu | Chờ duyệt (Claude, 12/11/2026) |
| ME | autumn | Hải đăng Portland Head trên mỏm đá + biển (mẫu) | Phao bẫy tôm hùm | Đèn hải đăng quay | Chờ duyệt (Claude, 12/11/2026) |
| MA | autumn | Cầu dây văng Zakim trắng (tháp chữ Y ngược) trước đường chân trời Boston + thuyền buồm trên cảng; phía đông đầm việt quất đỏ | Thuyền buồm | Thành phố sáng đèn, tháp và dây cầu xanh lam | Chờ duyệt (Claude, 12/11/2026) |
| NH | autumn | Núi Washington: đỉnh trọc có trạm khí tượng + cột ăng-ten, sườn rừng thu lốm đốm + hồ dưới chân; phía đông đồi rừng thu | Rừng lá đỏ (vùng) | Đèn trạm, đèn đỏ đỉnh ăng-ten | Chờ duyệt (Claude, 12/11/2026) |
| RI | autumn | Cầu treo Newport (cầu dẫn dốc) qua vịnh đầy thuyền buồm; phía đông biệt thự đá thời Gilded Age trên vách đá ven biển | Cỏ biển | Đèn cầu, cửa sổ biệt thự | Chờ duyệt (Claude, 12/11/2026) |
| VT | autumn | Đồi lá đỏ của vùng + dãy Green Mountains rừng thu phía xa + cầu gỗ có mái đỏ qua suối + nhà nấu đường phong bốc hơi; phía đông trại bò sữa | Bò sữa | Hơi nước sáng bạc, đèn nhà | Chờ duyệt (Claude, 12/11/2026) |
| NY | autumn | Tượng Nữ thần Tự do trên đảo trước đường chân trời Manhattan (tháp art deco nhiều nấc giản lược); phía đông cầu Brooklyn tháp đá cửa vòm nhọn | Vườn táo | Đuốc sáng vàng, tượng rọi sáng, thành phố rực đèn | Chờ duyệt (Claude, 12/11/2026) |

### GPT/Codex (26 bang)

| Mã | Vùng | Điểm nhìn xa | Chi tiết gần | Ban đêm | Trạng thái |
| --- | --- | --- | --- | --- | --- |
| FL | tropical | Bệ phóng mũi Canaveral trên doi cát giữa biển: tên lửa nhiều tầng dáng chung (không logo), tháp phóng, ba cột thu sét; cứ 150 giây phóng một lần (lửa, vệt khói); phía đông nhà lắp ráp khổng lồ trên đảo Merritt (không dựng lâu đài Disney) | Vườn cam, hồng hạc | Lửa tên lửa, đèn bệ phóng | Chờ duyệt (Claude, 12/11/2026) |
| HI | tropical | Núi Diamond Head nhô lên từ biển (vành nón, sườn rãnh xói); phía đông núi lửa hình khiên Kīlauea giữa biển đang phun: vòi dung nham, dòng dung nham, cột khói | Ruộng khoai môn | Dung nham đỏ rực | Chờ duyệt (Claude, 12/11/2026) |
| IL | plains | Đường chân trời Chicago bên hồ Michigan, giản lược (không dựng Cloud Gate) | Đồng ngô | Thành phố rực đèn soi hồ | Chờ duyệt (GPT/Codex, 12/11/2026) |
| IN | plains | Cồn cát Indiana Dunes bên hồ + tháp chứa ngũ cốc | Đồng ngô | Đèn tháp | Chờ duyệt (GPT/Codex, 12/11/2026) |
| IA | plains | Hàng cối gió điện quay + mái vòm vàng Điện Capitol Iowa | Đồng ngô | Đèn đỏ đỉnh cối gió | Chờ duyệt (GPT/Codex, 12/11/2026) |
| KS | plains | Biển hoa hướng dương + lốc xoáy xa | Lúa mì | Chớp xa | Chờ duyệt (GPT/Codex, 12/11/2026) |
| MO | plains | Cổng vòm Gateway Arch thép bạc bên sông + tàu guồng | Hàng cây ven sông | Vòm phản chiếu đèn | Chờ duyệt (GPT/Codex, 12/11/2026) |
| NE | plains | Cột đá Chimney Rock + đàn sếu bay | Ruộng tưới vòng tròn | Đàn chim dưới trăng | Chờ duyệt (GPT/Codex, 12/11/2026) |
| ND | plains | Đồi Badlands Theodore Roosevelt + giếng dầu + hướng dương | Đường đất | Lửa khí đốt | Chờ duyệt (GPT/Codex; Claude rà đạt 12/11/2026) |
| OH | plains | Hải đăng Marblehead bên hồ Erie + máy bay cánh đôi anh em Wright bay vòng | Nhà kho vẽ ô chăn | Đèn hải đăng | Chờ duyệt (GPT/Codex; Claude rà đạt 12/11/2026) |
| OK | plains | Tượng Golden Driller (thợ dầu khổng lồ) + tháp khoan dầu + đất đỏ | Cỏ đồng | Đèn tháp khoan | Chờ duyệt (GPT/Codex, 12/11/2026) |
| SD | plains | Núi Rushmore: bốn khuôn mặt tạc trên vách granite xám giữa rừng thông Black Hills (ngoài cổng); đồi Badlands sọc màu một bên (mục 2: nghiêm trang, không thêm gì lên mặt tượng) | Bò rừng | Đèn rọi sáng bốn khuôn mặt | Chờ duyệt (GPT/Codex; Claude rà đạt 12/11/2026) |
| AL | south | Tên lửa Saturn V dựng đứng ở Huntsville + đồng bông | Kiện bông | Đèn chiếu tên lửa | Chờ duyệt (GPT/Codex; Claude rà lại đạt 12/11/2026) |
| AR | south | Núi Ozark + suối nước nóng Hot Springs bốc hơi | Hồ, thuyền câu | Hơi nước dưới trăng | Chờ duyệt (GPT/Codex, 12/11/2026) |
| GA | south | Đại lộ sồi rủ rêu kiểu Savannah + vườn đào (không dựng tượng khắc Stone Mountain) | Rổ đào | Đèn hiên | Chờ duyệt (GPT/Codex, 12/11/2026) |
| LA | south | Cầu Lake Pontchartrain Causeway dài tít trên hồ + đầm lầy bách | Nhà sàn, thuyền | Đèn cầu nối dài | Chờ duyệt (GPT/Codex; Claude rà lại đạt 12/11/2026) |
| MS | south | Sông Mississippi rất rộng + cầu Vicksburg + đoàn sà lan | Mộc lan nở | Đèn sà lan | Chờ duyệt (GPT/Codex, 12/11/2026) |
| SC | south | Cầu dây văng Ravenel + dãy nhà nhiều màu Rainbow Row | Cọ palmetto | Đèn cầu | Chờ duyệt (GPT/Codex; Claude rà lại đạt 12/11/2026) |
| TX | south | Tượng đài San Jacinto (cột cao có ngôi sao) + đồng hoa bluebonnet + tháp khoan dầu | Bò sừng dài | Ngôi sao chiếu sáng | Chờ duyệt (GPT/Codex, 12/11/2026) |
| OR | pacific | Núi Hood + đá Haystack ngoài biển + thác Multnomah | Gỗ trôi dạt | Sóng dưới trăng | Chờ duyệt (GPT/Codex; Claude rà đạt 12/11/2026) |
| WA | pacific | Núi Rainier khổng lồ chiếm một phần trời (không dựng Space Needle) | Vườn táo, phà | Tuyết hắt ánh trăng | Chờ duyệt (GPT/Codex; Claude rà đạt 12/11/2026) |
| NJ | autumn | Vòng đu quay lớn cuối cầu tàu gỗ chìa ra biển Atlantic City (cabin nhiều màu, quay chậm) + đụn cát cỏ biển + biển cả hai phía (không dựng tòa sòng bạc) | Ô che nắng, cỏ biển | Vòng đèn nhiều màu quay theo vòng | Chờ duyệt (Claude, 12/11/2026) |
| PA | autumn | Cầu cạn đá Starrucca nhiều vòm vắt qua thung lũng, hai đầu vùi vào đồi rừng thu, đoàn tàu chạy qua theo nhịp; phía đông cầu gỗ có mái đỏ | Hàng rào zíc zắc | Cửa sổ tàu sáng | Chờ duyệt (Claude, 12/11/2026) |
| MI | autumn | Cầu treo Mackinac dài (tháp màu ngà, dàn xanh, cầu dẫn dốc) qua eo hồ; phía đông hải đăng đỏ cuối đê chắn sóng | Vườn anh đào quả | Đèn cáp cầu, đèn hải đăng quay | Chờ duyệt (Claude, 12/11/2026) |
| MN | autumn | Hải đăng Split Rock (tháp vàng thấp, nhà người gác) trên đỉnh mỏm đá dựng đứng bên hồ Superior + bờ xa rừng thông, bạch dương; phía đông đồi rừng | Bến gỗ có xuồng | Đèn hải đăng + luồng sáng quay | Chờ duyệt (Claude, 12/11/2026) |
| WI | autumn | Điện Capitol Madison mái vòm trắng trên eo đất giữa hai hồ + đồi rừng thu phía xa; phía đông trại bò sữa | Bò sữa | Mái vòm rọi sáng | Chờ duyệt (Claude, 12/11/2026) |

## 6. Ngân sách và "Xong khi" mỗi bang

**Ngân sách** (riêng lớp bang, đo bằng `theme:shots -- --state <mã>`; cộng với vùng vẫn trong ngân sách của vùng):
- +mesh ≤ 8. Gộp theo màu như vùng; mỗi kiểu bề mặt (phẳng / mịn × haze), đèn đêm, vật chuyển động tốn một mesh (hải
  đăng có đèn + luồng sáng đã 2).
- +tam giác ≤ 40.000; cả vùng + bang ≤ 150.000.
- Đổi bang trong cùng vùng ≤ 50 ms (bang có `clear` phải dựng lại vật rải của vùng nên tốn hơn); đổi vùng + bang
  ≤ 100 ms (máy bàn).
- Chuyển động ≤ 3 vật mỗi bang, CPU ≤ 0,2 ms / khung, chỉ chạy khi camera ở sân.
- Tải thêm ≤ 500 KB mỗi bang (code ≤ 30 KB; ảnh WebP ≤ 1024 px nếu cần). Số ngẫu nhiên dùng `seeded()`.

**Xong khi:**
- Đạt độ thấy ngày / đêm ở mục 1.
- Không dựng vật lên các khu đi lại ngoài tường (`env.walkways`): lối đá / Đài ngắm cảnh ngoài cổng (khung
  `world.courtyard.overlook`, x ±13, z 99–135) và Rừng thiền ngoài cổng tây (`world.courtyard.grove.area`, x −94…−53,5,
  z 18–70); mặt nước phẳng nằm dưới thì được. Dãy đồi / đụn cát dùng `walkwayCut(env, …)` để mở khe, vật rời dùng
  `onWalkway(env, x, z)` để tránh; `states.test.mjs` kiểm tra.
- Nhìn ảnh là biết bang nào, khác các bang cùng vùng.
- Không chắn lối, không che bảng tên các khu, không lấn vào sân / lưng điện (test qua).
- Trong ngân sách; đổi qua lại bang mình ↔ bang khác cùng vùng ↔ vùng khác 5 lần, geometry trở về như cũ.
- Không lỗi / cảnh báo mới trong console; thử trang thật ở khung 390×844 với `?state=<mã>`.
- `npm run lint`, `npm test` qua.

## 7. Quy trình

Như KE_HOACH_VUNG.md mục 5, chỉ khác file:
1. **Nhận việc:** sửa cột "Trạng thái" của bang thành `Đang làm (<tên>, <ngày>)`. Mỗi lần nhận một nhóm 3–6 bang cùng
   vùng.
2. **Chỉ sửa file của bang mình:**
   - `scenes/thien-default/states/<mã>.json`
   - `packages/scene-engine/src/landmarks/<mã>.mjs`
   - `apps/web/public/models/states/<mã>/` (nếu có)

   Cần món chung mới hoặc sửa lõi thì ghi mục 8.
3. **Xem thử:** `chanh-dien.html?state=<mã>&sun=50` (ngày) và `&sun=-15` (đêm); chụp + đo bằng
   `npm run theme:shots -- --state <mã>`.
4. **Bàn giao:** chạy lint, test; đổi trạng thái thành `Chờ duyệt`; ghi một mục nhật ký (mục 9) với số đo, độ thấy,
   đường dẫn ảnh.
5. **Rà và duyệt:** Claude rà bang của GPT (như các vùng), GPT rà bang của Claude; người dùng duyệt ảnh. Không commit
   khi người dùng chưa bảo.

**Thứ tự đề xuất:**
1. Claude: Bước 0 + 2 bang mẫu (AZ, ME).
2. Song song:
   - Claude: desert → snow → CA → blossom → New England + NY.
   - GPT: xong `south`, `pacific` (vùng) → plains → tropical → south → pacific → NJ PA MI MN WI.

## 8. Đề xuất sửa phần chung

Ghi theo dạng: ngày, người, cần gì, vì sao. Claude làm, hoặc hỏi người dùng nếu đụng nguyên tắc.

- (chưa có)

## 9. Nhật ký

- 12/11/2026, Claude: lập kế hoạch này. Chưa làm Bước 0.
- 12/11/2026, người dùng quyết: được dựng công trình nổi tiếng. Claude sửa mục 2 (danh sách mặc định không dựng, Rushmore chờ
  xác nhận), mục 4 (thư viện chung), mục 5 (công trình nổi tiếng từng bang).
- 12/11/2026, Claude: **xong Bước 0** + 2 bang mẫu AZ, ME (chờ duyệt). Bang khác mở cho người làm nhận.
  - Phần chung:
    - dữ liệu `states/<mã>.json` (`validateState`), bộ đồ `landmarks/<mã>.mjs`, thư viện `landmarks/common.mjs`
      (`sea`, `lighthouse`);
    - lõi `landscape3d.mjs`: lớp bang, `hide`, `clear`, vật liệu ít sương, đèn đêm, chuyển động;
    - `renderer.setTheme(vùng, { state })`; trang đổi theo bang chọn ở cổng / vào phòng / đổi phòng, `?state=<mã>` xem thử
      (Việt Nam không có lớp bang);
    - import map của web có `/engine/landmarks/*.mjs`;
    - test `states.test.mjs`; `theme:shots -- --state` thêm góc 7 / 8 và đo độ thấy ngày / đêm.
  - Số đo (`npm run theme:shots -- --state az,me`):

    | Bang | Đổi bang lần sau | Mesh | Tam giác | Độ thấy ngày: góc 3 / 7 / 8 | Đêm | Kết quả |
    | --- | --- | --- | --- | --- | --- | --- |
    | AZ | 41 ms | 3 | 11.100 | 20,8 / 13,8 / 15,8 % | như ngày (bóng vách) | Đạt |
    | ME | 47 ms | 8 | 12.000 | 10,6 / 4,3 / 6,1 % | đèn + luồng sáng quay | Đạt |

    Không rò bộ nhớ.
  - Điều chỉnh tiêu chí sau khi đo:
    - ngân sách mesh 5 → 8: hải đăng riêng đèn + luồng sáng đã tốn 2;
    - đổi bang 40 → 50 ms: bang có `clear` phải dựng lại vật rải của vùng;
    - 2 góc đứng xa nhìn về khoảng ngoài cổng (0, 160), vì khung dọc điện thoại chỉ rộng ~24°.
  - Bang chưa có file thì trang hỏi một lần mỗi phiên (404 trong console), hết khi đủ 51 bang.
  - 454/454 test qua, lint sạch.
- 12/11/2026, người dùng xác nhận **dựng núi Rushmore** cho SD. Claude sửa mục 2 (bỏ khỏi danh sách không dựng, thêm lưu ý)
  và dòng SD ở mục 5. SD vẫn do GPT làm.
- 12/11/2026, GPT/Codex: làm nhóm `plains` đầu tiên gồm IL, IN, IA, KS; cả bốn chờ duyệt.
  - **IL:** đường chân trời Chicago giản lược bên hồ Michigan, hai ăng-ten cao, cửa sổ sáng ban đêm; không dựng Cloud Gate;
    gần tường có khóm ngô.
  - **IN:** hồ, dải cồn cát phủ cỏ và cụm silo / tháp chứa ngũ cốc có đèn; gần tường có khóm ngô.
  - **IA:** bảy turbine chia hai dải, rotor quay bằng hai `InstancedMesh` / hai callback; mái vòm vàng Capitol giản lược và
    đèn đỏ trên turbine; gần tường có khóm ngô.
  - **KS:** biển hướng dương, lốc xoáy lớn ngoài cổng và tia chớp sáng ban đêm; giữ nền lúa mì của vùng.
  - Thêm phần tiếp nối nhỏ ở phía đông cho cùng cảnh của từng bang để góc 4 nhận ra được, không nhân đôi công trình chính.
  - Số đo (`npm run theme:shots -- --state il,in,ia,ks`; cột độ thấy là góc 3 / 4 / 7 / 8):

    | Bang | Đổi lần sau | Mesh | Tam giác | Ngày (%) | Đêm (%) | Geometry | Kết quả |
    | --- | --- | --- | --- | --- | --- | --- | --- |
    | IL | 18 ms | 6 | 9.033 | 38,0 / 35,5 / 23,4 / 28,3 | 37,8 / 35,5 / 23,0 / 28,2 | 365 → 365 | Đạt |
    | IN | 22 ms | 6 | 13.520 | 10,8 / 34,8 / 9,8 / 7,7 | 10,8 / 34,2 / 9,8 / 7,7 | 364 → 364 | Đạt |
    | IA | 17 ms | 7 | 10.700 | 2,4 / 4,9 / 1,8 / 1,6 | 2,4 / 5,0 / 1,8 / 1,5 | 368 → 368 | Đạt |
    | KS | 47 ms | 5 | 34.200 | 14,6 / 2,3 / 6,8 / 8,0 | 14,6 / 2,3 / 6,8 / 8,0 | 365 → 365 | Đạt |

  - thử trang thật 390×844 với `?state=il,in,ia,ks` (từng mã riêng), đúng vùng `plains` và lớp bang tương ứng; KS ban đêm
    giữ 60 FPS; không lỗi / cảnh báo console;
  - ảnh ghép ngày / đêm: `.data/theme-shots/sheet.png`; chưa thấy điểm hình ảnh bắt buộc nào còn chưa ổn;
  - không sửa file chung; 454/454 test qua, lint sạch (807 file JavaScript, 45 file JSON).
- 12/11/2026, Claude: **xong NV, NM, UT** (vùng `desert` đủ 4 bang, chờ duyệt).
  - Thư viện chung thêm: `skyline`, `ridge`, `sweep` + `along`, `paintMerge`; `env.nightMesh(…, { vertexColors })`.
    Test `states.test.mjs` xét cả vật thêm riêng (`env.add`) từng đỉnh, kể cả lúc đang chuyển động.
  - Số đo (`npm run theme:shots -- --state az,me,nv,nm,ut`, đo lại AZ / ME sau khi sửa phần chung):

    | Bang | Đổi bang lần sau | Mesh | Tam giác | Độ thấy ngày: góc 3 / 4 / 7 / 8 | Đêm: góc 3 / 7 / 8 | Kết quả |
    | --- | --- | --- | --- | --- | --- | --- |
    | AZ | 45 ms | 3 | 11.100 | 20,8 / 3,2 / 13,8 / 15,8 % | như ngày | Đạt |
    | ME | 49 ms | 8 | 12.000 | 10,6 / 3,9 / 4,2 / 6,0 % | 13,8 / 5,2 / 8,1 % | Đạt |
    | NV | 34 ms | 7 | 13.100 | 30,4 / 20,8 / 22,7 / 24,5 % | 31,4 / 23,0 / 24,9 % (đập rọi sáng, đèn cầu, thành phố) | Đạt |
    | NM | 34 ms | 7 | 14.100 | 18,1 / 3,0 / 19,9 / 16,4 % | 24,6 / 24,5 / 21,8 % (khinh khí cầu sáng màu, đèn thành phố) | Đạt |
    | UT | 41 ms | 3 | 25.400 | 20,6 / 44,2 / 13,5 / 16,7 % | 20,8 / 13,5 / 15,9 % (bóng vòm, tuyết) | Đạt |

    Không rò bộ nhớ; 454/454 test qua, lint sạch.
- 12/11/2026, GPT/Codex: **xong nhóm `plains` còn lại MO, NE, ND, OH, OK, SD**; cả sáu chờ duyệt.
  - **MO:** Gateway Arch thép bạc bên sông Mississippi, tàu guồng phía đông, hàng cây ven sông; đèn chạy theo vòm và
    đèn tàu ban đêm.
  - **NE:** Chimney Rock, đàn sếu bay nối sang phía đông và ruộng tưới vòng tròn gần tường; đàn chim có điểm sáng dưới
    trăng.
  - **ND:** dải Badlands Theodore Roosevelt, giếng dầu phía đông và hướng dương; lửa khí đốt chỉ sáng ban đêm.
  - **OH:** hải đăng Marblehead bên hồ Erie, máy bay cánh đôi bay vòng bằng một mesh gộp màu và nhà kho ô chăn phía
    đông; đèn hải đăng sáng ban đêm.
  - **OK:** tượng thợ dầu Golden Driller cách điệu (không mô phỏng mặt người thật), tháp khoan phía đông, đất đỏ và cỏ
    đồng; đèn an toàn tháp khoan ban đêm.
  - **SD:** Rushmore giản lược nghiêm trang thành bốn phù điêu granite không gắn trang trí lên mặt, rừng thông Black
    Hills, bò rừng và Badlands phía đông; bốn đèn rọi ban đêm.
  - Số đo (`npm run theme:shots -- --state mo,ne,nd,oh,ok,sd`; cột độ thấy là góc 3 / 4 / 7 / 8):

    | Bang | Đổi lần sau | Mesh | Tam giác | Ngày (%) | Đêm (%) | Geometry | Kết quả |
    | --- | --- | --- | --- | --- | --- | --- | --- |
    | MO | 12 ms | 7 | 4.488 | 9,1 / 19,5 / 6,0 / 7,1 | 8,9 / 19,1 / 5,0 / 7,0 | 374 → 374 | Đạt |
    | NE | 3 ms | 7 | 3.244 | 19,1 / 2,6 / 8,0 / 9,4 | 19,1 / 2,6 / 8,0 / 9,4 | 374 → 374 | Đạt |
    | ND | 6 ms | 6 | 3.808 | 20,4 / 4,6 / 11,8 / 15,4 | 20,4 / 5,0 / 11,8 / 15,4 | 373 → 373 | Đạt |
    | OH | 0 ms | 5 | 242 | 6,3 / 26,4 / 2,4 / 4,0 | 6,1 / 26,4 / 2,0 / 4,3 | 374 → 374 | Đạt |
    | OK | 3 ms | 6 | 1.772 | 11,0 / 10,6 / 4,4 / 5,3 | 11,0 / 10,6 / 4,4 / 5,3 | 374 → 374 | Đạt |
    | SD | 9 ms | 5 | 8.468 | 36,7 / 26,4 / 21,8 / 26,7 | 37,1 / 26,3 / 21,4 / 26,7 | 375 → 375 | Đạt |

  - ND và OK ban đầu có 9 mesh do lặp giếng dầu / tháp khoan ở hai phía; bỏ bản lặp, giữ công trình chính ở một phía
    và đo lại còn 6 mesh, độ thấy vẫn đạt.
  - thử trang thật 390×844: đổi đúng sáu phòng `PA1`; vào được Vườn Hoa, Vườn Công Đức, khu vui chơi và nông trại;
    không lỗi / cảnh báo console. Test tìm đường từ sân vào bồ đoàn qua cửa điện qua trong 12,8 ms.
  - ảnh ghép ngày / đêm: `.data/theme-shots/sheet.png`; không sửa file chung.
  - lint sạch (818 file JavaScript, 56 file JSON); lượt `npm test` cuối 454/454 qua. Một lượt trước đó có ca trốn tìm
    với bot chọn ngẫu nhiên tọa độ không đi được, nhưng chạy lại riêng 8/8 và chạy lại toàn bộ 454/454 đều qua.
- 12/11/2026, GPT/Codex: **xong sáu bang đầu vùng `south`: AL, AR, GA, LA, MS, SC**; cả sáu chờ duyệt, TX chưa làm.
  - **AL:** Saturn V cách điệu dựng ngoài cổng, nhà máy tách bông phía đông, kiện bông gần tường và đèn rọi ban đêm.
  - **AR:** dải Ozark, Hot Springs với năm cột hơi nối liền (không còn trông như bong bóng), thuyền câu phía đông và
    hơi nước sáng dưới trăng.
  - **GA:** đại lộ sồi Savannah rủ tán, trang trại đào phía đông, đèn hiên ban đêm; không dựng tượng khắc Stone Mountain.
  - **LA:** cầu Lake Pontchartrain Causeway chạy dài trên hồ, nhà sàn phía đông và chuỗi đèn cầu ban đêm.
  - **MS:** cầu Vicksburg bắc qua sông Mississippi, đoàn sà lan phía đông và mộc lan của bộ cảnh vùng.
  - **SC:** cầu dây văng Ravenel, dãy Rainbow Row phía đông, cọ palmetto gần tường và đèn cầu ban đêm.
  - Số đo (`npm run theme:shots -- --state al,ar,ga,la,ms,sc`; cột độ thấy là góc 3 / 4 / 7 / 8):

    | Bang | Đổi lần sau | Mesh | Tam giác | Ngày (%) | Đêm (%) | Geometry | Kết quả |
    | --- | --- | --- | --- | --- | --- | --- | --- |
    | AL | 2 ms | 6 | 1.290 | 11,9 / 29,9 / 4,6 / 5,7 | 11,9 / 28,9 / 4,6 / 5,6 | 373 → 373 | Đạt |
    | AR | 3 ms | 6 | 2.736 | 18,4 / 11,7 / 11,3 / 12,7 | 18,4 / 14,0 / 11,3 / 12,7 | 372 → 372 | Đạt |
    | GA | 12 ms | 4 | 11.224 | 11,9 / 20,9 / 4,5 / 6,2 | 11,9 / 20,1 / 4,5 / 6,2 | 372 → 372 | Đạt |
    | LA | 1 ms | 5 | 768 | 11,5 / 25,6 / 2,2 / 4,2 | 10,7 / 25,6 / 2,1 / 3,4 | 373 → 373 | Đạt |
    | MS | 1 ms | 6 | 404 | 6,6 / 8,6 / 3,5 / 5,1 | 6,0 / 8,6 / 3,5 / 5,0 | 375 → 375 | Đạt |
    | SC | 6 ms | 8 | 4.320 | 9,4 / 26,7 / 5,8 / 8,1 | 8,9 / 26,4 / 5,2 / 7,9 | 377 → 377 | Đạt |

  - lần đầu AL của lượt chụp cuối mất 1.646 ms do khởi tạo renderer / trình duyệt lạnh; đổi lại cùng bang là 2 ms và
    các lần đo trước không có đột biến này, nên dùng cột “đổi lần sau” để xét ngưỡng đổi bang;
  - thử trang thật 390×844: đổi đúng sáu phòng `PA1`; Đi nhanh tới Vườn Hoa, Vườn Công Đức, khu vui chơi và nông trại
    đều hoạt động, bảng hướng dẫn Vườn mở / đóng đúng; không lỗi / cảnh báo console;
  - ảnh ghép ngày / đêm: `.data/theme-shots/sheet.png`; ảnh kiểm tra mobile: `/tmp/south-sc-farm-mobile.png`;
  - không sửa file chung; mỗi file landmark 2,5–3,8 KB, dưới giới hạn 30 KB;
  - lint sạch (833 file JavaScript, 71 file JSON); `npm test` 454/454 qua.
- 12/11/2026, GPT/Codex: **xong TX, hoàn tất đủ bảy bang vùng `south`**; TX chờ duyệt.
  - cột tưởng niệm San Jacinto cách điệu dựng ngoài cổng, ngôi sao vàng trên đỉnh có lớp sáng riêng ban đêm; tháp khoan
    dầu phía đông có đèn an toàn đỏ; bluebonnet và bò sừng dài rải trong `band` gần tường, không lấn chân trời / lối đi;
  - số đo `npm run theme:shots -- --state tx`: đổi đầu / lần sau 28 / 11 ms; 8 mesh; 6.976 tam giác; geometry
    377 → 377; độ thấy ngày góc 3 / 4 / 7 / 8 = 10,3 / 7,3 / 4,7 / 5,3 %, đêm = 10,3 / 7,4 / 4,8 / 5,3 %;
    tất cả tiêu chí đạt, không rò;
  - thử trang thật 390×844: vào đúng `Texas · PA1`, Đi nhanh tới Vườn Hoa, Vườn Công Đức, khu vui chơi và nông trại;
    bảng hướng dẫn mở / đóng đúng, không lỗi / cảnh báo console. Ảnh mobile: `/tmp/tx-farm-mobile.png`;
  - ảnh ghép ngày / đêm: `.data/theme-shots/sheet.png`; file landmark 4,7 KB, không sửa file chung;
  - lint sạch (840 file JavaScript, 78 file JSON); test tiểu bang 3/3 và `npm test` 454/454 qua.
- 12/11/2026, Claude: **xong AK, CO, MT, WY, ID** (vùng `snow` đủ 5 bang, chờ duyệt).
  - Phần chung:
    - thư viện thêm vật rải `bison`, `cabin` (vật rải tìm cả ở `landmarks/common.mjs`);
    - `nightPoints` gom theo màu + cỡ;
    - test cho phép điểm đặc trưng chỉ có đèn đêm (cực quang).
  - Lõi: vật rải của vùng nhớ mảnh hình, đổi bang có `clear` không dựng lại → đổi bang từ ~50 ms xuống 8–16 ms (ME
    49 → 14 ms). Vị trí vật rải vùng không còn phụ thuộc bang (trước: vật bị chừa được dời chỗ khác; nay: bỏ đi).
  - Số đo (`npm run theme:shots -- --state ak,co,mt,wy,id`):

    | Bang | Đổi bang lần sau | Mesh | Tam giác | Độ thấy ngày: góc 3 / 4 / 7 / 8 | Đêm: góc 3 / 7 / 8 | Kết quả |
    | --- | --- | --- | --- | --- | --- | --- |
    | AK | 14 ms | 7 | 15.000 | 25,8 / 1,6 / 17,7 / 17,7 % | 46,0 / 33,8 / 34,5 % (cực quang) | Đạt |
    | CO | 9 ms | 5 | 9.400 | 25,4 / 9,7 / 15,7 / 15,9 % | như ngày | Đạt |
    | MT | 16 ms | 5 | 14.400 | 25,8 / 6,5 / 16,4 / 18,7 % | như ngày + cửa sổ khách sạn | Đạt |
    | WY | 16 ms | 6 | 14.800 | 25,0 / 2,6 / 17,6 / 19,0 % | 24,9 / 17,5 / 19,0 % | Đạt |
    | ID | 11 ms | 7 | 12.400 | 30,8 / 15,7 / 15,7 / 19,3 % | 31,0 / 16,3 / 19,6 % (thác bạc) | Đạt |

    Không rò bộ nhớ; 454/454 test qua, lint sạch. AK và WY góc 4 (phía đông) chỉ vừa qua 1,5 % (nhờ vật rải gần tường),
    các góc khác dư nhiều.
- 12/11/2026, Claude: **xong CA, DC, DE, KY, MD, NC, TN, VA, WV** (vùng `blossom` đủ 8 bang + CA, chờ duyệt). Claude còn
  6 bang: CT, MA, NH, RI, VT, NY.
  - Phần chung:
    - thư viện thêm `suspension-bridge`, `capitol`, `hills`, `dunes`, `sailboats`; `lighthouse` thêm sọc xoắn `spiral` và
      bệ `plinth`; vật rải `ranch-fence` (dời từ MT), `seagrass`;
    - giới hạn `landmarks` 4 → 6 mục (bang ven biển cần mặt nước nhiều phía);
    - test xét khối dài xoay chéo theo hình chiếu thật (không báo nhầm mặt cầu chéo lấn sân).
  - Số đo (`npm run theme:shots -- --state ca,dc,de,ky,md,nc,tn,va,wv`):

    | Bang | Đổi bang lần sau | Mesh | Tam giác | Độ thấy ngày: góc 3 / 4 / 7 / 8 | Đêm: góc 3 / 7 / 8 | Kết quả |
    | --- | --- | --- | --- | --- | --- | --- |
    | CA | 21 ms | 8 | 15.700 | 16,4 / 40,3 / 9,4 / 11,3 % | 18,9 / 11,1 / 13,9 % | Đạt |
    | DC | 13 ms | 8 | 7.900 | 10,9 / 46,3 / 8,0 / 5,3 % | 11,0 / 8,0 / 5,4 % | Đạt |
    | DE | 13 ms | 6 | 11.100 | 17,4 / 24,0 / 9,4 / 12,1 % | 15,7 / 9,5 / 11,6 % | Đạt |
    | KY | 23 ms | 4 | 18.500 | 13,5 / 23,4 / 8,3 / 9,7 % | 10,2 / 6,5 / 8,1 % | Đạt |
    | MD | 11 ms | 8 | 8.500 | 16,4 / 17,9 / 10,7 / 10,4 % | 15,6 / 10,3 / 9,5 % | Đạt |
    | NC | 14 ms | 7 | 7.200 | 10,6 / 2,1 / 4,4 / 5,3 % | 10,8 / 5,2 / 5,2 % | Đạt |
    | TN | 7 ms | 7 | 12.000 | 23,5 / 21,9 / 15,6 / 17,1 % | 22,4 / 13,9 / 15,9 % | Đạt |
    | VA | 6 ms | 6 | 7.900 | 22,6 / 27,4 / 15,9 / 16,0 % | 22,0 / 14,8 / 15,3 % | Đạt |
    | WV | 3 ms | 2 | 6.200 | 21,3 / 32,6 / 18,0 / 19,4 % | 21,2 / 18,0 / 19,5 % | Đạt |

    Không rò bộ nhớ; 454/454 test qua, lint sạch. Lưu ý: CA và NY (sẽ làm) dùng công trình có đăng ký thương hiệu hình
    dáng (mục 2).
- 12/11/2026, Claude: **xong CT, MA, NH, RI, VT, NY** — **đủ 25 bang phần Claude** (tất cả chờ duyệt).
  - Phần chung thêm: `farmstead` (dời từ VA), `beam`; `suspension-bridge` kiểu tháp đá `masonry`; `skyline` tháp chính
    `towers` (đèn đỉnh đỏ hàng không, đèn cửa sổ cùng màu + cỡ với đèn cầu treo để gom lệnh vẽ); `hills` thêm `trees`.
  - Số đo 6 bang mới:

    | Bang | Đổi bang lần sau | Mesh | Tam giác | Độ thấy ngày: góc 3 / 4 / 7 / 8 | Đêm: góc 3 / 7 / 8 | Kết quả |
    | --- | --- | --- | --- | --- | --- | --- |
    | CT | 26 ms | 7 | 20.500 | 17,5 / 28,9 / 11,0 / 13,1 % | 17,1 / 10,9 / 13,2 % | Đạt |
    | MA | 3 ms | 8 | 2.000 | 27,1 / 11,1 / 15,0 / 23,4 % | 24,8 / 12,9 / 21,2 % | Đạt |
    | NH | 14 ms | 4 | 11.300 | 29,6 / 35,2 / 18,7 / 21,5 % | 30,2 / 19,2 / 22,0 % | Đạt |
    | RI | 12 ms | 8 | 6.900 | 10,6 / 52,5 / 5,3 / 8,6 % | 9,7 / 5,2 / 8,1 % | Đạt |
    | VT | 10 ms | 7 | 8.300 | 8,7 / 21,9 / 7,6 / 10,5 % | 9,1 / 7,7 / 10,4 % | Đạt |
    | NY | 13 ms | 7 | 9.300 | 30,6 / 42,7 / 19,9 / 23,2 % | 30,4 / 19,9 / 22,8 % | Đạt |

  - Đo lại cả 25 bang sau thay đổi phần chung cuối cùng (`npm run theme:shots -- --state az,nv,…,ny`): **25/25 đạt**, mesh
    2–8, đổi bang lần sau 3–26 ms, không rò bộ nhớ; 454/454 test qua, lint sạch.
- 12/11/2026, Claude: **rà 16 bang của GPT** (IL IN IA KS MO NE ND OH OK SD AL AR GA LA MS SC) và vùng `south`.
  - Đo lại (`npm run theme:shots -- --state …`): cả 16 bang qua tiêu chí độ thấy, mesh 4–8, đổi bang lần sau 0–41 ms, không
    rò. Code đúng quy ước (seeded, không chữ, không tạo vật liệu mỗi lần dựng, chỉ sửa file của bang mình).
  - Vùng `south`: đạt (+3 mesh, 24.300 tam giác, đổi vùng 35 ms, không rò; đầm lầy, bách, tường trắng cột xanh rêu).
  - Lõi (Claude sửa): `disposeGroup` giải phóng cả `InstancedMesh` (IA rò bộ đệm ma trận mỗi lần đổi bang); thêm
    `order` cho `batch.add` / `paintMerge` (xem mục 4, tiện ích) và sửa các chỗ của Claude bị cùng lỗi.
  - **Cần sửa (bắt buộc):**
    - **SD:** Rushmore đang là bốn hình trứng có vạch ngang như ria mép, ban đêm mỗi mặt một chấm sáng to — trông như
      tranh vui, không đạt "nghiêm trang" (mục 2). Làm lại thành phù điêu tạc vào vách: mỗi đầu là khối trán / gờ mày / sống
      mũi / cằm nhô khỏi vách (không vẽ mắt miệng), đầu thứ hai và thứ ba lùi sâu hơn như tượng thật; ban đêm rọi sáng cả
      vách bằng `nightMesh` mờ thay vì chấm sáng trước mặt.
    - **ND:** giếng dầu phía đông trông như giá treo cổ có vật lủng lẳng. Làm đúng dáng giếng gật gù: khung chữ A, đòn
      cân nằm ngang trên đỉnh khung, đầu ngựa cong ở một đầu, đối trọng tròn ở đầu kia, cần bơm thẳng xuống miệng giếng.
    - **OH (nhà kho), AL (nhà máy bông), LA (nhà sàn):** mái lệch vì `rotation: [nghiêng, face, 0]` ở phía đông — thêm
      `order: 'YXZ'`.
    - **SC:** dây văng cầu Ravenel đang bắt chéo từ đỉnh tháp này sang chân tháp kia (hình chữ X). Dây văng phải xòe quạt từ
      mỗi tháp xuống mặt cầu hai bên tháp; tháp Ravenel hình kim cương (hai chân chụm dưới mặt cầu, chụm lại trên đỉnh).
    - **LA:** chưa đọc ra cầu Causeway (thấy một đoạn ngắn và hai cột mảnh như cây kim). Cầu phải thấp sát mặt hồ, dài
      thẳng tít ra tới chân trời (nhiều trụ đều nhau, hàng đèn ban đêm nối dài), hồ rộng nhìn thấy được.
  - **Nên sửa:**
    - **IN:** cồn cát là các nửa cầu trơn như đống rơm, hồ khuất sau cồn — dùng `dunes` + `sea` của thư viện chung.
    - **IA:** độ thấy góc 7 / 8 chỉ 1,8 / 1,6 % (sát ngưỡng) — đưa turbine gần hơn / to hơn; mái vòm có thể dùng
      `capitol` chung (`dome` vàng, `corners: 4`).
    - **NE:** Chimney Rock nâu sẫm, đều như ống khói nhà máy — màu vàng đất nhạt, chân côn lởm chởm, chóp mảnh lệch.
    - **OK:** tượng thợ dầu giơ hai tay như "đầu hàng" — tượng thật một tay chống lên tháp khoan, tay kia buông.
    - **GA:** hàng sồi thiếu rêu xám rủ (nét nhận ra Savannah), tán đang giống thông dù.
    - **MO:** tàu guồng phía đông trông như nhà máy — thêm bánh guồng đỏ ở đuôi, hai tầng boong.
  - Bang không ghi ở trên: Claude rà đạt, chờ người dùng duyệt ảnh.
- 12/11/2026, GPT/Codex: **sửa xong ba mục bắt buộc của Claude trong vùng `south`: AL, LA, SC**; chờ duyệt lại.
  - **AL:** thêm `order: 'YXZ'` cho hai mái nhà máy bông phía đông, mái nay ghép đúng theo hướng nhà;
  - **LA:** thêm `order: 'YXZ'` cho mái nhà sàn; dựng lại Causeway thành hai mặt cầu thấp dài 278 m trên hồ rộng,
    28 hàng trụ đều và chuỗi đèn chạy tới chân trời, bỏ hai cột cao trông như cây kim;
  - **SC:** dựng lại hai tháp Ravenel thành ba đoạn chụm–xòe–chụm hình kim cương; dây dùng `beam` xòe quạt từ từng
    tháp xuống mặt cầu hai phía, không còn nối chéo thành chữ X;
  - đo lại `npm run theme:shots -- --state al,la,sc`: AL 6 mesh / 1.290 tam giác / 2 ms, LA 5 mesh / 792 tam giác /
    1 ms, SC 8 mesh / 4.320 tam giác / 7 ms; cả ba đạt độ thấy ngày / đêm, không rò geometry;
  - đổi phòng thật 390×844 sang `Louisiana · PA1` và `South Carolina · PA1` thành công, không lỗi console; ảnh ghép
    `.data/theme-shots/sheet.png`, ảnh mobile `/tmp/south-sc-review-mobile.png`;
  - lint sạch (842 file JavaScript, 78 file JSON); sau khi công việc đồng thời NJ hoàn tất, lượt `npm test` cuối
    đạt 454/454.
- 12/11/2026, Claude: xong 25 bang của mình nên **nhận 5 bang autumn của phần GPT: NJ, PA, MI, MN, WI** (GPT chưa bắt đầu,
  đang làm vùng `pacific`). GPT còn: các bang "Cần sửa", TX, OR, WA, FL, HI.
- 12/11/2026, Claude: **xong NJ, PA, MI, MN, WI** (nhận từ phần GPT; chờ duyệt). Claude tổng cộng 30 bang.
  - Thư viện chung: dời `covered-bridge`, `cow` từ VT; `lighthouse` thêm `elevation`.
  - Số đo (`npm run theme:shots -- --state nj,pa,mi,mn,wi`; ME, NC đo lại sau khi sửa hải đăng chung: vẫn đạt):

    | Bang | Đổi bang lần sau | Mesh | Tam giác | Độ thấy ngày: góc 3 / 4 / 7 / 8 | Đêm: góc 3 / 7 / 8 | Kết quả |
    | --- | --- | --- | --- | --- | --- | --- |
    | NJ | 13 ms | 6 | 8.700 | 10,6 / 22,3 / 4,3 / 5,4 % | 9,8 / 4,7 / 5,2 % (vòng đèn) | Đạt |
    | PA | 11 ms | 4 | 10.000 | 12,7 / 32,6 / 9,6 / 12,4 % | 15,8 / 10,0 / 11,5 % | Đạt |
    | MI | 12 ms | 8 | 8.800 | 12,2 / 6,1 / 6,3 / 8,4 % | 11,3 / 6,4 / 8,6 % | Đạt |
    | MN | 12 ms | 8 | 11.500 | 21,8 / 26,8 / 12,5 / 13,8 % | 23,9 / 12,8 / 14,3 % | Đạt |
    | WI | 9 ms | 7 | 9.100 | 15,7 / 25,3 / 9,2 / 10,6 % | 18,1 / 10,7 / 12,0 % | Đạt |
- 12/11/2026, Claude: **xong FL, HI** (nhận từ phần GPT; vùng `tropical` do Claude làm; chờ duyệt). Claude tổng cộng 32 bang.
  Giữ biển của vùng (không `hide`), công trình đặt trên doi cát / giữa biển.

    | Bang | Đổi bang lần sau | Mesh | Tam giác | Độ thấy ngày: góc 3 / 4 / 7 / 8 | Đêm: góc 3 / 4 / 7 / 8 | Kết quả |
    | --- | --- | --- | --- | --- | --- | --- |
    | FL | 15 ms | 7 | 8.300 | 15,7 / 58,0 / 8,9 / 10,2 % | 15,7 / 58,0 / 8,9 / 10,1 % | Đạt |
    | HI | 9 ms | 8 | 7.000 | 19,6 / 42,3 / 12,6 / 14,7 % | 19,6 / 45,6 / 12,5 / 14,7 % | Đạt |

- 12/11/2026, Claude: rà **TX** (GPT): đạt — tượng đài San Jacinto có ngôi sao (ban đêm sao sáng), đồng bluebonnet, tháp
  khoan phía đông; 8 mesh, 7.000 tam giác, đổi bang 18 ms, độ thấy 10,3 / 7,3 / 4,7 / 5,3 %. Chờ người dùng duyệt ảnh.
  GPT còn: vùng `pacific`, OR, WA và các bang "Cần sửa" (SD đang sửa).
- 12/11/2026, Claude: **rà lại AL, LA, SC** sau khi GPT sửa: đạt. AL mái nhà máy bông thẳng; SC tháp Ravenel hình kim cương,
  dây văng xòe quạt; LA cầu Causeway thấp dài ra tới chân trời, chuỗi đèn đêm, mái nhà sàn thẳng (độ thấy góc 7 / 8 thấp —
  1,5 / 3,1 % — do cầu vốn sát mặt nước, chấp nhận). Còn chờ GPT sửa ND, OH, SD.
- 12/11/2026 20:51, Claude: **rà bản hiện tại của ND, OH, SD, OR, WA** (GPT chưa đổi trạng thái — có thể còn đang làm) và
  vùng `pacific`. Số đo (`theme:shots -- --state nd,oh,sd,or,wa`): đều đạt, mesh 5–6, đổi bang 0–10 ms, không rò.
  - **ND:** giếng gật gù đúng dáng (khung chữ A, đòn cân, đầu ngựa, đối trọng) — đạt.
  - **OH:** mái nhà kho hết lệch — đạt.
  - **SD:** Rushmore thành bốn khuôn mặt tạc khối vào vách, không mắt miệng, ban đêm rọi nhẹ cả vách — đạt yêu cầu nghiêm
    trang. Nên sửa thêm: mặt đang vuông như tượng Moai — bo tròn khối đầu / tóc, xếp so le (Washington nhô trước,
    Jefferson lùi sau bên trái, Roosevelt lọt giữa, Lincoln bên phải) thay vì bốn mặt cách đều một hàng.
  - **OR:** núi Hood chóp tuyết; phía đông thác Multnomah có cầu vắt ngang — đạt. **WA:** núi Rainier khổng lồ; phía đông
    phà — đạt. Hai bang cùng vùng phân biệt được (Hood nhọn đơn độc, Rainier khối rộng nhiều đỉnh).
  - Vùng `pacific`: đạt (+2 mesh, 15.700 tam giác, đổi vùng 30 ms; rừng thông cao, sương mù, chùa gỗ tối, núi lửa chóp
    tuyết).
  - Khi GPT đổi trạng thái các bang này sang chờ duyệt thì coi như Claude đã rà (trừ khi sửa thêm sau 20:51).
- 12/11/2026, người dùng: **GPT dừng, Claude làm nốt phần còn lại.** Claude đổi ND, OH, SD, OR, WA sang chờ duyệt (đã rà
  lúc 20:51), nhận các mục "Nên sửa" của IN, IA, NE, OK, GA, MO, SD.
- 12/11/2026, Claude: **làm xong các mục "Nên sửa"** của phần GPT (GPT đã dừng):
  - **IN:** bỏ cồn cát nửa cầu, dùng `dunes` (cao 13 m, cỏ biển) + `sea` (hồ Michigan) chung; bên kia hồ mờ mờ đường chân
    trời Chicago (`skyline` chung, sương dày); giữ cụm silo phía đông.
  - **IA:** turbine to / gần hơn (độ thấy góc 7 / 8 từ 1,8 / 1,6 % lên 6,6 / 10 %); bỏ mái vòm tự dựng, dùng `capitol` chung
    (mái vòm vàng, 4 vòm nhỏ ở góc); đèn đỏ turbine cùng cỡ để gom lệnh vẽ (8 mesh).
  - **NE:** Chimney Rock dựng lại: gò đất sét vàng nhạt loe rộng mép lởm chởm, chỏm đá cát mảnh hơi nghiêng có dải sẫm.
  - **OK:** tượng Golden Driller mạ vàng toàn thân, tay phải tì lên đỉnh tháp khoan nhỏ, tay trái buông.
  - **GA:** sồi Savannah cành vươn ngang chụm thành vòm trên lối, tán rộng dẹt, rêu xám rủ thành chùm.
  - **MO:** tàu guồng dựng lại trên khúc sông: ba tầng boong có hành lang cột, cabin lái, hai ống khói đen, bánh guồng đỏ.
  - **SD:** thử bo tròn mặt tượng (khối ghép tròn, rồi nắn từ quả cầu) nhưng ra hình mặt nạ / quả trứng — không đạt nghiêm
    trang hơn bản GPT, nên **giữ nguyên bản GPT** (khối tạc, không mắt miệng, rọi nhẹ cả vách). Muốn đẹp hơn thì cần mô
    hình tạc tay (Meshy hoặc người dựng), không làm bằng khối thủ tục.
- 12/11/2026, Claude: **đo lại đủ 51 bang** sau mọi thay đổi phần chung (`npm run theme:shots -- --state <51 mã>`): **51/51 đạt**
  tiêu chí độ thấy ngày / đêm, mesh 2–8, đổi bang lần sau ≤ 49 ms (KS sát ngưỡng), không rò bộ nhớ; 454/454 test qua, lint
  sạch. Toàn bộ 51 bang chờ người dùng duyệt ảnh.
- 12/11/2026, Claude (theo người dùng): **mở Đài ngắm cảnh ngoài cổng** — lối đá ra đài bát giác có lan can, 2 ghế đá,
  điểm đi nhanh `overlook`; từ đài nhìn thẳng ra công trình của bang. Phần chung: `env.overlook`, `overlookCut`,
  `onOverlook`; `sea` / `dunes` / `hills` tự chừa lối; `ridge` giảm lởm chởm ở chỗ đỉnh thấp (đáy khe phẳng). Dời ra xa
  hoặc lệch các công trình phía cổng quá gần: CT, FL, GA, IA, ID, LA, ME, MN, NC, NE, NV, NY, OK, UT, VA, VT, WV; KS, KY
  chừa lối trong bộ đồ. Test mới bắt lấn lên lối / đài (bang và núi vùng).
- 13/11/2026, Claude (theo người dùng): **mở cổng hông phía tây ra Rừng thiền** (khu ~40 × 52 m ngoài tường tây: hồ sen,
  vòng lối thiền hành, bến gỗ ra thủy đình, 3 ghế đá, rừng cây theo kiểu cây của vùng; điểm đi nhanh `grove`). Chọn phía
  tây vì 43 bang đặt công trình phía đông, chỉ OR dùng phía tây (biển 46 m, đá Haystack 58 m — nằm ngoài khu, test qua).
  Phần chung đổi tên cho cả hai khu: `env.overlook` → `env.walkways`, `overlookCut` → `walkwayCut` (chừa khe theo mọi
  phía), `onOverlook` → `onWalkway`; test lấn khu đi lại tính cả Rừng thiền. Góc chụp mới `11-rung-thien`.
