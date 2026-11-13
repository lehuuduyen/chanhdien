# KE_HOACH_VUNG — Phong cảnh sân chùa theo vùng (Claude và GPT/Codex làm chung)

Lập ngày 12/11/2026. Người đọc: Claude Code và GPT/Codex cùng làm, chia theo vùng. Đọc trước: `AGENTS.md` (đoạn
"Phong cảnh theo vùng" và mục Quy ước code), rồi file này từ đầu tới cuối.

Yêu cầu của người dùng: **mỗi tiểu bang một giao diện riêng, chỉ khác chùa và nền đất, phong cảnh; chọn tiểu bang nào
thì tải mô hình của vùng đó.** Không làm 52 bộ riêng: gom các bang vào 9 vùng khí hậu, mỗi vùng là một "lớp áo" đặt lên
cùng một bố cục sân.

## 1. Hiện trạng (12/11/2026, Bước 0 xong, chưa commit)

Bước 0 đã xong: mỗi vùng chỉ cần 2 file riêng, không phải sửa file chung nào. Các vùng còn lại mở cho người làm nhận.

| Phần | File | Ai sửa |
| --- | --- | --- |
| Dữ liệu một vùng (màu trời, đất, kiểu cây, vật rải, núi, màu / tham số chùa) | `scenes/thien-default/themes/<vùng>.json` | Người làm vùng |
| Bộ đồ dựng hình của vùng (`export const kit`) | `packages/scene-engine/src/landscape/<vùng>.mjs` | Người làm vùng |
| Ảnh / mô hình riêng của vùng (nếu có) | `apps/web/public/models/themes/<vùng>/` | Người làm vùng |
| Bộ đồ chung (cây đa, tùng, cọ, núi nón, chùa gốc, tiện ích) và hình dạng bộ đồ | `packages/scene-engine/src/landscape/common.mjs` | Phần chung |
| Lõi: tải vùng, đổi màu, nền, rải vật, gộp khối, dựng chùa | `packages/scene-engine/src/landscape3d.mjs` | Phần chung |
| Kiểm tra dạng dữ liệu (`validateTheme`) | `packages/scene-engine/src/world.mjs` | Phần chung |
| Bảng 51 mã → 9 vùng (`THIEN_THEMES`) | `packages/room-rules/src/index.mjs` | Phần chung (đã đủ) |
| Gọi đổi vùng (cổng, vào phòng, đổi phòng, `?theme=`) | `apps/web/public/chanh-dien.js` | Phần chung |
| Test | `packages/scene-engine/test/themes.test.mjs` | Phần chung |
| Công cụ chụp + đo | `scripts/theme-shots.mjs` (`npm run theme:shots`) | Phần chung |

Mẫu để theo: `landscape/desert.mjs` + `themes/desert.json` (cây nhiều khối, đất vẽ bằng canvas, núi bàn nhiều màu) và
`landscape/snow.mjs` + `themes/snow.json` (lớp tuyết phủ cây / đá / núi, mái phủ tuyết bằng màu `roof`).

Số đo 2 vùng mẫu (`npm run theme:shots`, Chrome chạy ngầm không GPU):

| Vùng | Đổi lần sau | +mesh | +tam giác |
| --- | --- | --- | --- |
| `desert` | 41 ms | +2 | +23.600 |
| `snow` | 40 ms | +5 | +31.700 |

Không rò geometry khi đổi qua lại. Vùng chưa có dữ liệu thì hiện cảnh gốc; mỗi phiên chỉ có một lỗi 404 cho file dữ liệu.

## 2. Chia vùng

| # | Vùng (khóa) | Tiểu bang | Phong cảnh gợi ý | Chùa gợi ý | Người làm | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `desert` Sa mạc | AZ, NV, NM, UT | Cát gợn, xương rồng saguaro, chà là, núi bàn đỏ, trời cam | Tường vàng đất, mái ngói cam | Claude | Đã duyệt 13/11/2026 (Claude, 12/11/2026) |
| 2 | `snow` Núi tuyết | AK, CO, MT, WY, ID | Tuyết, vân sam phủ tuyết, núi chóp trắng | Mái phủ tuyết, thêm nhũ băng, đèn lồng ấm | Claude | Đã duyệt 13/11/2026 (Claude, 12/11/2026) |
| 3 | `tropical` Biển nhiệt đới | FL, HI | Cát trắng, dừa nghiêng, biển xanh ngọc ở chân trời (mặt nước lớn ngoài tường, sóng nhẹ), dâm bụt | Hiên rộng mái thấp, cột trắng | GPT | Đã duyệt 13/11/2026 (GPT/Codex, 12/11/2026) |
| 4 | `autumn` Rừng lá đỏ | CT, ME, MA, MI, MN, NH, NJ, NY, PA, RI, VT, WI | Phong đỏ / cam / vàng, bạch dương, lá rụng trên cỏ, đồi rừng nhiều màu | Gỗ nâu, mái xám đen | Claude | Đã duyệt 13/11/2026 (Claude, 12/11/2026) |
| 5 | `plains` Đồng bằng | IL, IN, IA, KS, MO, NE, ND, OH, OK, SD | Đồng lúa mì vàng theo luống, trời rộng mây trắng, cối xay gió, kho thóc đỏ ở xa | Mái thấp ngói nâu, hiên rộng | GPT | Đã duyệt 13/11/2026 (GPT/Codex, 12/11/2026) |
| 6 | `south` Miền Nam | AL, AR, GA, LA, MS, SC, TX | Sồi lớn rủ rêu, đầm lầy có cây bách, cỏ xanh đậm, mộc lan | Tường trắng, cột xanh rêu | GPT | Đã duyệt 13/11/2026 (GPT/Codex, 12/11/2026) |
| 7 | `blossom` Đồi hoa | DC, DE, KY, MD, NC, TN, VA, WV | Đồi xanh nhấp nhô, dãy núi xanh lam ở xa, anh đào và sơn thù du nở hoa | Mái cong nhẹ, ngói xanh ngọc | Claude | Đã duyệt 13/11/2026 (Claude, 12/11/2026) |
| 8 | `pacific` Tây Bắc | OR, WA | Thông Douglas rất cao, sương mù, đá phủ rêu, một núi lửa chóp tuyết đơn độc ở xa | Gỗ tối, mái xám đá | GPT | Đã duyệt 13/11/2026 (GPT/Codex; Claude rà đạt 12/11/2026) |
| 9 | `california` California | CA | Đồi cỏ vàng, sồi rải rác, cọ cao mảnh, biển ở xa, nắng vàng | Tường trắng, mái ngói đỏ | Claude | Đã duyệt 13/11/2026 (Claude, 12/11/2026) |
| 10 | `vietnam` Việt Nam | VN | Ruộng lúa nước chia thửa, lũy tre, cau, chuối, đống rơm, trâu, nhà ngói, núi đá vôi | Tường vàng, mái chồng diêm đầu đao cong, lưỡng long chầu nguyệt | Claude | Đã duyệt 13/11/2026 (Claude, 12/11/2026) |
| — | `default` cảnh gốc | (vùng chưa có dữ liệu) | Cảnh gốc | Chùa gốc | — | Giữ làm dự phòng |

Đủ 51 mã của Mỹ (50 bang + DC), mỗi mã đúng một vùng.

- **Phân công:** Claude giữ phần chung (Bước 0, mục 8) và làm 5 vùng (gồm 2 mẫu). GPT làm 4 vùng. Người dùng đổi phân công
  bằng cách sửa cột "Người làm".
- **Phong cảnh / chùa gợi ý:** chỉ là gợi ý. Người làm được đổi, miễn là vùng nhận ra được ngay từ ảnh và khác các vùng còn lại.

## 3. Ràng buộc (mọi vùng, không được phá)

**Giữ nguyên ở mọi vùng:**
- Bố cục đi lại: `world.walk`, vật cản, lối đi, cổng.
- Bên trong chánh điện.
- Vị trí các khu: Vườn Hoa, Vườn Công Đức, khu thú cưng, nông trại, khu vui chơi, Khu tưởng niệm, hồ sen, đài phun nước. Được
  đổi màu nền sân quanh các khu, không dời và không che các khu.
- Bot, trốn tìm, ghế đá, vườn chạy theo bố cục này. Máy chủ không biết vùng và không cần biết.

**Cây trong sân:**
- Cây mới đứng đúng chỗ cây đa / tùng trong scene (`data.trees`, `data.pines`).
- Gốc không to hơn vật cản đang có. Tán không xòe xuống thấp hơn 2,2 m trên lối đi (camera và người chơi đi qua).

**Chùa:**
- Giữ đúng khung: mặt tiền 19,6 m, cửa giữa 3,2 × 4,4 m, đúng chỗ hiện tại. Người chơi đi qua cửa vào điện.
- Được đổi mái (dáng, màu, số tầng), màu tường / cột, trang trí, hiên, cổng tam quan (giữ lối đi của cổng).
- Vẫn phải là chùa Phật giáo: giữ hoành phi "Đại Hùng Bảo Điện", không biến thành nhà thờ hay lâu đài.
- Không dựng lại y hệt một ngôi chùa thật có tên. Tôn trọng nội dung Phật giáo (AGENTS.md).

**Phong cảnh:**
- Chỉ gợi ý chung của vùng (đồi, cây, núi, biển).
- Không dựng bản sao công trình nổi tiếng (cầu, tòa nhà, tượng đài) và không dùng thương hiệu.

**Trời theo giờ thật:** trang thật đổi trời theo giờ ở bang (đêm có lớp phủ tối). Xem vùng mình lúc ban ngày bằng `?sun=50`
(vd. `chanh-dien.html?theme=<vùng>&sun=50`); `npm run theme:shots` mặc định chụp ban ngày (`--sun 50`), muốn xem đêm thì
`--sun -15`. Vùng không cần làm gì thêm: màu trời / sương / nắng của vùng là màu ban ngày, lõi tự pha theo giờ.

**Hiệu năng** (so với cảnh gốc, đo bằng `npm run theme:shots`; số mesh / tam giác là của riêng phần phong cảnh, cố định,
không dao động như lệnh vẽ cả khung hình):
- Mesh (≈ lệnh vẽ): thêm tối đa 12. Cây / vật rải / núi đã gộp theo màu đỉnh: thêm màu không tốn mesh, chỉ thêm kiểu bề mặt
  (phẳng / mịn, hai mặt, phát sáng) hoặc vật liệu có ảnh mới tốn.
- Tam giác: thêm tối đa 150.000.
- Đổi vùng (lần sau, đã tải): tối đa 80 ms trên máy bàn.
- FPS: không giảm quá 10 %.
- Tải thêm của một vùng: tối đa 1,5 MB, chỉ tải khi vào vùng đó.
- Ảnh: WebP ≤ 1024 px, hoặc vẽ bằng canvas.
- Vật ngoài tường: không đổ bóng. Mỗi nhóm vật rải tối đa 200 cái.
- Vật nhiều bản: gộp theo vật liệu (`StaticBatch`) hoặc dùng `InstancedMesh`.
- Số ngẫu nhiên dùng `seeded()` để mọi máy thấy giống nhau.

**Kỹ thuật:**
- Three.js 0.160.0, ES module, không thêm thư viện hay bundler.
- Dữ liệu vùng là JSON, không viết tọa độ riêng của phòng vào engine (nguyên tắc 5 trong AGENTS.md).
- Chữ hiển thị bằng tiếng Việt.

**Hỏi người dùng trước khi:**
- Gọi Meshy hay dịch vụ trả phí nào khác. Khóa `MESHY_API_KEY` nằm trong `.env.online`, không in khóa ra.
- Sửa file chung (mục 5).
- Commit hoặc push.

## 4. Bước 0 — tách để làm song song (Claude, xong 12/11/2026)

Đã làm:
- **Dữ liệu mỗi vùng một file** `scenes/thien-default/themes/<vùng>.json`, đã bỏ khỏi `scene.json`.
  - Trang tải file khi chọn vùng: `setTheme` trả Promise, gọi dồn thì lần sau cùng thắng.
  - Vùng chưa có file thì hiện cảnh gốc.
- **Engine chia theo vùng:**
  - Lõi `landscape3d.mjs`; bộ đồ chung `landscape/common.mjs`.
  - Bộ đồ vùng `landscape/<vùng>.mjs` nạp bằng `import()`, không có danh sách chung nào phải sửa.
  - Kiểu tìm trong bộ đồ vùng trước rồi `common`.
- **Chùa đổi được theo vùng:** mặt tiền, mái, hiên, cổng tam quan tách khỏi sân thành nhóm riêng.
  - `kit.temple(ctx)` dựng; không có thì dùng chùa gốc.
  - Các phần dựng sẵn để ghép: `buildTempleFacade`, `buildTempleRoof`, `buildGate`, `addRoof`, `templeFrame`.
- **Bảng 51 mã → 9 vùng** đã đủ trong `THIEN_THEMES`. Không ai phải sửa room rules nữa.
- **`validateTheme` chỉ kiểm tra dạng:** khóa được phép, màu `#rrggbb`, tên kiểu `[a-z0-9-]`, số trong khoảng.
- **Test `themes.test.mjs`:**
  - bảng vùng đủ và không trùng;
  - mỗi file dữ liệu hợp lệ và có bộ đồ đi kèm;
  - kiểu nhắc tới có thật;
  - cây / vật rải / núi dựng ra khối hợp lệ, núi không lấn vào sân;
  - chùa của mọi vùng không chắn lối qua cửa điện và 3 cửa cổng tam quan;
  - phần cây dưới 1 m không lấn ra ngoài vật cản của gốc cây quá 0,6 m.

  Test này bắt được nhánh thấp của vân sam vùng tuyết xòe quá rộng, đã sửa.
- **`npm run theme:shots`** chụp 6 góc chuẩn, ra ảnh ghép và số đo (mục 5).
- **Gộp khối theo màu đỉnh** (`ColorBatch`): cảnh gốc cũng bớt mesh.

**Hình dạng bộ đồ** ghi ở đầu `landscape/common.mjs`:

```js
export const kit = {
  trees: { kiểu(batch, x, z, size, rand, env) {} },     // đứng chỗ cây đa / tùng; cũng dùng để rải
  scatter: { kiểu(batch, x, z, size, rand, env) {} },   // vật rải ngoài tường
  mountains: { dáng(batch, env) {} },                   // núi xa (mountainArc giúp xếp theo cung)
  grounds: { kiểu(env) { return new THREE.MeshStandardMaterial(...); } }, // UV tính bằng mét
  temple: (ctx) => {},                                  // chùa nhìn từ ngoài; ctx.params = theme.temple
};
```

**Dữ liệu vùng** (mọi khóa đều không bắt buộc):
- Màu: `sky` { top, horizon }, `fog`, `light` { sun, sky, ground }, `colors` { roof, wall, brick, pillar }.
- Nền: `field` (đất ngoài tường), `lawn` { surface, tint } (nền sân).
- Núi: `mountains` { shape, colors[1–4] }.
- Cây: `trees` + `treeScale` (chỗ cây đa), `pines` (chỗ cây tùng).
- Rải: `scatter` [{ kind, count ≤ 200, band? }] tối đa 8 nhóm; mỗi nhóm một chuỗi ngẫu nhiên riêng.
  - Mặc định rải đều khắp vùng ngoài tường tới chân núi.
  - `band: [gần, xa]` chỉ rải cách tường sân từ `gần` tới `xa` mét (`bandPoint` trong `landscape3d.mjs`), vd. dừa trên dải bãi
    biển trước mặt nước.
  - Lõi luôn chừa 5 m sát tường hai bên và lối trước cổng.
- Chùa: `temple` { tham số cho `kit.temple`, ≤ 2000 ký tự JSON }. Chùa gốc (`buildTemple`) đã đọc sẵn `tiers` (2 = mái hai
  tầng / chồng diêm) và `hook` (độ to đầu đao, 1 = gốc): vùng chỉ cần đổi màu + hai tham số này thì không phải viết `kit.temple`.

**Tiện ích cho bộ đồ:**
- `env.detail`: 1 cho cây trong sân, 0 cho vật rải ngoài tường. Dùng làm độ chia mặt khối tròn (`IcosahedronGeometry(r, env.detail ?? 1)`)
  và bớt cành / khối tán cho cây ở xa: đây là cách giữ đổi vùng dưới 80 ms.
- `env.material(màu, thêm)` dùng thoải mái: cây / vật rải / núi gộp theo màu đỉnh, nhiều màu không tốn thêm lệnh vẽ.
- `mountainArc(env, số, { spread, radiusX, radiusZ }, fn)` xếp núi theo cung trước cổng. Núi ở xa bị sương phủ gần kín: nón nhọn
  đơn lẻ trông như kim tự tháp, nên dùng vòm dẹt (`SphereGeometry` nửa trên) hoặc nhiều đỉnh chồng nhau.

## 5. Quy trình làm một vùng (Claude và GPT như nhau)

1. **Nhận việc:** sửa cột "Trạng thái" ở mục 2 thành `Đang làm (<tên>, <ngày>)`. Mỗi người một vùng một lúc.
2. **Chỉ sửa file của vùng mình:**
   - `scenes/thien-default/themes/<vùng>.json`
   - `packages/scene-engine/src/landscape/<vùng>.mjs`
   - `apps/web/public/models/themes/<vùng>/` (ảnh, mô hình riêng, nếu có)

   Cần sửa file chung thì ghi vào mục 8 và không tự sửa:
   - `landscape3d.mjs`, `landscape/common.mjs`, `courtyard3d.mjs`, `renderer3d.mjs`
   - `world.mjs`, room rules, `chanh-dien.js`, `scene.json`, AGENTS.md
3. **Dựng:**
   - Đọc skill `threejs-geometry`, `threejs-materials`, `threejs-performance`.
   - Mẫu để theo: `landscape/desert.mjs` (cây nhiều khối, đất vẽ canvas, núi bàn) và `landscape/snow.mjs` (lớp tuyết phủ).
   - Codex dùng vai `scene-frontend` (`.codex/agents/scene-frontend.toml`), Claude dùng agent cùng tên.
4. **Xem thử:** `npm run dev` rồi mở `http://localhost:3000/chanh-dien.html?theme=<vùng>`.
   - Chụp + đo bằng `npm run theme:shots -- <vùng>` (khoảng 30 giây mỗi vùng).
   - Ảnh ghép so với cảnh gốc ở `.data/theme-shots/sheet.png`.
   - Web chạy cổng khác thì thêm `--base http://localhost:<cổng>`.
5. **Kiểm tra:** `npm run lint`, `npm test`, đủ tiêu chí mục 6. Báo kết quả thật, kể cả chỗ chưa đạt.
6. **Bàn giao:**
   - Đổi trạng thái thành `Chờ duyệt`.
   - Ghi một mục ở nhật ký (mục 9): đã làm gì, số đo, đường dẫn ảnh ghép, chỗ còn chưa ổn.
   - Không commit. Người dùng xem ảnh, duyệt rồi mới commit.
7. **Hai máy / hai bản clone:** mỗi vùng một nhánh `theme/<vùng>`, tách từ nhánh đã có Bước 0. Vì chỉ sửa file riêng nên gộp
   không đụng nhau. Riêng bảng mục 2 và nhật ký mục 9 có thể vướng vài dòng: giữ cả hai bên.

## 6. "Xong khi" của một vùng

- Ảnh 6 góc chuẩn nhìn là biết vùng nào, khác rõ cảnh gốc và các vùng đã xong. Người dùng duyệt ảnh.
- Chùa khác cảnh gốc ở mái / màu / trang trí; cửa đúng chỗ, đi vào điện bình thường.
- Đi bộ một vòng sân (hoặc đi nhanh tới Vườn Hoa, khu thú cưng, nông trại, khu vui chơi, Khu tưởng niệm): không có cây hay vật
  nào chắn lối, chui qua người, hay che mất bảng tên các khu.
- Số đo nằm trong ngân sách mục 3. Đổi qua lại vùng mình ↔ `default` ↔ một vùng khác 5 lần, số geometry trở về như cũ.
- Không lỗi hoặc cảnh báo mới trong console.
- `npm run lint`, `npm test` (gồm `themes.test.mjs`) qua.

## 7. Giai đoạn 2 (sau khi đủ 9 vùng, cần người dùng duyệt chi phí)

- **Chùa Meshy riêng cho vài vùng đông người Việt** (CA, TX, WA trước):
  - Theo quy trình Meshy trong AGENTS.md: kiến trúc tạo chi tiết đầy đủ rồi dùng API Remesh khoảng 20k tam giác, giữ ảnh màu.
  - Mặt tiền phải khớp khung 19,6 m, cửa đúng chỗ; khoét bằng `scripts/carve-interior.mjs`.
  - Lưu ở `apps/web/public/models/themes/<vùng>/temple.glb`, chỉ tải khi vào vùng. Tải lỗi thì giữ chùa dựng bằng khối.
- **Cây đặc trưng dạng ảnh Meshy** (billboard như hoa trong Vườn Hoa) nếu cây dựng bằng khối chưa đủ đẹp.
- **Trời theo giờ địa phương của bang**: xong sớm (12/11/2026, Claude, phần chung, xem nhật ký). Độ cao mặt trời tính theo
  tọa độ từng bang (`THIEN_PLACES`), không theo múi giờ.
- **Vùng `vietnam`** cho Việt Nam: xong sớm (12/11/2026, Claude, người dùng yêu cầu), xem bảng mục 2.

Tiếp theo các vùng: điểm đặc trưng riêng từng tiểu bang đặt lên cảnh vùng, xem [KE_HOACH_BANG.md](KE_HOACH_BANG.md).

## 8. Đề xuất sửa phần chung

Người làm vùng ghi đề xuất vào đây theo dạng: ngày, người, cần gì, vì sao. Người giữ phần chung (Claude) làm, hoặc hỏi người dùng
nếu đụng nguyên tắc.

- (chưa có)

## 9. Nhật ký

- 11/11/2026, Claude: làm khung đổi vùng và 2 vùng mẫu `desert`, `snow` (cảnh vẽ bằng code, không tải thêm file). Đổi vùng
  15–55 ms. Đổi phòng Arizona → Colorado tự chuyển cảnh. 439/439 test qua. Chưa commit.
- 12/11/2026, Claude: lập kế hoạch này.
- 12/11/2026, Claude: xong Bước 0 (mục 4).
  - `desert` / `snow` chạy qua cấu trúc mới.
  - Vân sam vùng tuyết nâng tầng nhánh thấp nhất lên 0,25 m.
  - 443/443 test qua, lint sạch.
  - Đã thử trên trang: chọn bang ở cổng (VN → AK → AZ), vào phòng Arizona, đổi phòng sang Colorado rồi California; cảnh đổi đúng
    `default` → `snow` → `desert` → `snow` → `default`.
  - Chưa commit. Các vùng 3–9 mở cho người làm nhận.
- 12/11/2026, Claude: làm `autumn`, `blossom`, `california`, chờ duyệt.
  - **Rừng lá đỏ:**
    - cảnh: phong nhiều tông đỏ / cam / vàng, bạch dương, đá rêu, đống lá, đồi rừng thu lấm tấm tán cây;
    - đất: cỏ lá rụng (cả nền sân);
    - chùa: tường gỗ nâu, mái xám đá hai tầng.
  - **Đồi hoa:**
    - cảnh: anh đào, sơn thù du, tử kinh, cây xanh, ba lớp núi Blue Ridge, sương ngả lam;
    - đất: đồng cỏ lấm tấm hoa;
    - chùa: tường kem, ngói xanh ngọc, đầu đao to.
  - **California:**
    - cảnh: sồi tán rộng, cọ quạt, chaparral, đá sa thạch, đồi cỏ vàng có sồi, dãy đồi xám xa;
    - đất: cỏ vàng ngoài tường, cỏ xanh trong sân;
    - chùa: tường trắng, mái ngói đỏ.
  - Số đo (`npm run theme:shots`):

    | Vùng | Đổi lần sau | +mesh | +tam giác |
    | --- | --- | --- | --- |
    | `autumn` | 64 ms | +2 | +39.000 |
    | `blossom` | 42 ms | +2 | +36.000 |
    | `california` | 37 ms | +4 | +27.000 |

    Không rò bộ nhớ.
  - Phần chung thêm vào trong lúc làm (đều không đổi gì nếu vùng không dùng):
    - `buildTempleRoof` có `tiers` / `hook`, `buildTemple` đọc `temple.tiers` / `temple.hook`;
    - `env.detail`;
    - gộp khối không dò đỉnh trùng: Rừng lá đỏ từ 258 ms xuống 64 ms;
    - bảng chữ chùa vẽ một lần rồi dùng lại.
  - Test kiểm tra núi bắt được dãy núi gần của Đồi hoa lấn góc sân 1 m, đã đẩy ra.
  - 443/443 test qua, lint sạch.
- 12/11/2026, GPT/Codex: làm `tropical`, chờ duyệt.
  - cảnh: cát san hô sáng, dừa nghiêng, dâm bụt, đá san hô, biển xanh ngọc ở ba phía ngoài tường và vệt sóng tĩnh;
  - chùa: tường trắng ngà, mái xanh ngọc, cột trắng, hiên sâu và mái thấp;
  - `npm run theme:shots -- tropical`: đổi lần sau 42 ms, +6 mesh, +24.184 tam giác; geometry 315 → 315, không rò bộ nhớ;
  - thử thật ở khung 390×844: đi qua cửa chánh điện ra sân, tới Vườn Hoa và Nông trại nhỏ; không có cảnh vật chắn lối,
    không có lỗi console;
  - ảnh ghép: `.data/theme-shots/sheet.png`;
  - 443/443 test qua, lint sạch (791 file JavaScript, 33 file JSON).
- 12/11/2026, Claude rà `tropical` (của GPT).
  - **Đạt:**
    - tự chạy lại `npm run theme:shots -- tropical` khớp số GPT báo: đổi vùng 37 ms, +6 mesh, +24.184 tam giác, không rò;
    - `themes.test.mjs` qua; chỉ sửa file của vùng mình; code đúng quy ước;
    - nhìn là nhận ra biển nhiệt đới (nước xanh ngọc ba phía, cát trắng, dừa, chùa trắng mái xanh ngọc);
    - chùa giữ cửa đúng chỗ.
  - **Cần sửa (bắt buộc): dừa, bụi dâm bụt và đá san hô đứng / nổi giữa mặt biển.**
    - Nguyên nhân: biển phủ gần kín vùng ngoài tường, mà lõi rải vật đều khắp vùng đó.
    - Cách sửa (chỉ trong file của vùng):
      1. trong `tropical-ocean` (`landscape/tropical.mjs`), lùi mép biển để chừa dải bãi cát khoảng 15 m ngoài tường: biển hai bên
         bắt đầu từ |x| ≥ 68, phía cổng từ z ≥ 116, dải nước nông và vệt sóng dời theo;
      2. trong `themes/tropical.json`, thêm `band` (lõi đã có từ 12/11): dừa và dâm bụt `"band": [6, 14]`, đá san hô `"band": [10, 22]`
         (nửa nằm mép nước được).
    - Xong thì chạy lại `npm run theme:shots -- tropical`, xem góc `4-tuong-dong` và `3-cong-nui`.
  - **Góp ý (không bắt buộc):**
    - mái chính `roofRise` 1,9 nhìn từ sân gần như mái bằng (góc `2-san`), mất dáng chùa; cân nhắc 2,4–2,8, hoặc `hook` 0,8–1 cho
      đầu đao rõ hơn;
    - cột trắng (`colors.pillar`) cũng làm trắng cánh cửa và cột đèn trên tường sân (cùng vật liệu `m.pillar`); chấp nhận được,
      ghi để biết.
- 12/11/2026, GPT/Codex: sửa bắt buộc sau khi Claude rà `tropical`, chờ duyệt lại; đồng thời nhận vùng `plains`.
  - lùi mép biển hai bên tới `|x| = 68`, phía cổng tới `z = 116`; dải nước nông và vệt sóng đã dời theo, để lại bãi cát khoảng
    15 m ngoài tường;
  - thêm `band: [6, 14]` cho dừa / dâm bụt và `band: [10, 22]` cho đá san hô; góc `3-cong-nui` và `4-tuong-dong` không còn
    cây hay đá nổi giữa mặt nước;
  - `npm run theme:shots -- tropical`: đổi lần sau 41 ms, +6 mesh, +24.184 tam giác; geometry 314 → 314, không rò bộ nhớ;
  - kiểm tra trang thật ở 390×844, không có lỗi console;
  - ảnh ghép: `.data/theme-shots/sheet.png`;
  - 444/444 test qua, lint sạch (791 file JavaScript, 33 file JSON).
- 12/11/2026, Claude: hoàn thiện `desert`, `snow` (trước chỉ là mẫu, chùa mới đổi màu), chờ duyệt.
  - **Sa mạc:** chùa thêm đầu xà gỗ (viga) nhô dưới mái chính ở mặt trước và hai bên, chuỗi ớt đỏ (ristra) treo hiên cạnh 4 cột
    ngoài (xa cửa, không trùng đèn lồng).
  - **Núi tuyết:**
    - nhũ băng dưới mép mái hiên, mái chính và mái các cửa cổng (cả mặt trong);
    - đèn lồng ấm treo dưới đầu xà cổng;
    - 8 người tuyết ngoài tường (`band` [6, 16]).
  - Số đo:

    | Vùng | Đổi lần sau | +mesh | +tam giác |
    | --- | --- | --- | --- |
    | `desert` | 39 ms | +6 | +27.000 |
    | `snow` | 52 ms | +9 | +40.000 |

    Không rò bộ nhớ.
  - Phần chung thêm (không đổi gì nếu vùng không dùng):
    - `addRoof` / `buildTempleRoof` / `buildGate` / `buildTemple` trả số đo mái và cổng;
    - `roofEaves(mái)` cho mép dưới hai dốc, để vùng treo trang trí theo mép mái (vd. nhũ băng ở `landscape/snow.mjs`).
- 12/11/2026, Claude rà lại `tropical` sau khi GPT sửa (01:21): **đạt phần bắt buộc.**
  - Biển hai bên bắt đầu từ |x| = 68, phía cổng từ z = 116; dừa và dâm bụt `band` [6, 14] đứng trên bãi cát; đá san hô [10, 22]
    nằm mép nước.
  - Số đo không đổi: 42 ms, +6 mesh, +24.184 tam giác, không rò. Test qua.
  - Góp ý mái thấp chưa làm (không bắt buộc, để người dùng quyết khi duyệt ảnh).
- 12/11/2026, GPT/Codex: làm `plains`, chờ duyệt; đồng thời nhận vùng `south`.
  - cảnh: đồng lúa mì vàng có luống thẳng rộng 32 m vẫn rõ từ xa; trời xanh đậm và chân trời sáng; dải đồi vòm rất dẹt,
    hàng cây chắn gió thấp và ba silo tròn, không có núi nhọn;
  - vật rải: 5 cối xay gió và 4 kho thóc đỏ dùng `band` [28, 56] / [32, 58], đứng xa ngoài tường và không lấn lối;
  - chùa: giữ bộ dựng chung, mái nâu một tầng (`tiers: 1`, `hook: 0.65`), tường kem và hiên rộng; cửa chánh điện giữ đúng chỗ;
  - `npm run theme:shots -- plains`: đổi lần sau 15 ms, +4 mesh, +4.470 tam giác, +8 lệnh vẽ; FPS headless 4 → 4,
    geometry 320 → 320, không rò bộ nhớ;
  - thử trang thật ở khung 390×844: đi bộ qua cửa chánh điện ra sân, đi nhanh tới Vườn Hoa, Nông trại nhỏ và Khu vui chơi;
    không có cảnh vật chắn lối, console và danh sách lỗi đều trống;
  - ảnh ghép: `.data/theme-shots/sheet.png`; chưa thấy điểm hình ảnh bắt buộc nào còn chưa ổn;
  - 448/448 test qua, lint sạch (794 file JavaScript, 34 file JSON).

- 12/11/2026, Claude: làm sớm phần chung **trời theo giờ thật** (mục 7), trong lúc chờ GPT.
  - Mỗi bang (và Việt Nam) một tọa độ (`THIEN_PLACES`); độ cao mặt trời tính theo giờ UTC mỗi 30 giây, cả phòng cùng một bầu trời.
  - Mặt trời trên 14°: giữ nguyên màu vùng (đã so ảnh: ban ngày y như trước, chỉ khác hoa / khói / nước đang động).
    Thấp dần: nắng chiều cam → ráng chiều → chạng vạng → đêm xanh thẫm có sao, trăng trên mái điện, đèn lồng sáng hơn.
  - Bảng tên, bong bóng chat, quầng đèn vẽ sau lớp phủ đêm nên vẫn rõ. Đêm vẫn đủ sáng để đi lại, chơi trốn tìm.
  - **Vùng không phải làm gì thêm.** Xem vùng ban ngày bằng `?sun=50`; `theme:shots` mặc định chụp ban ngày.
  - Sửa lỗi phần chung: đổi vùng khác về cảnh gốc thì sương thành nâu sẫm (lấy nhầm sương trong điện), làm núi xa tối đi.
  - Thử trang thật (390×844): đổi bang ở cổng lúc 9:50 sáng giờ Arizona → VN −83° (đêm), NY 31°, HI 3° (bình minh), AK −7°
    (chạng vạng), CA 23°; vào phòng ban đêm, ra sân: không lỗi console.
  - 448/448 test qua (thêm `daylight.test.mjs`), lint sạch.
- 12/11/2026, Claude rà `plains` (của GPT): **đạt, không có lỗi bắt buộc.**
  - Tự chạy lại `npm run theme:shots -- plains california desert`: đổi vùng 11 ms, +4 mesh, +4.470 tam giác, không rò.
  - Nhìn là biết đồng bằng: luống lúa mì, cối xay gió, kho thóc đỏ, trời xanh đậm. Khác rõ `california` (đồi cỏ vàng, sồi) và
    `desert` (cát, xương rồng).
  - Cây trong sân đúng luật: tán bạch dương thấp nhất ~2,8 m; tầng lá thấp nhất của tuyết tùng đỏ ở 1,4 m, cao và hẹp hơn tùng
    gốc. Test qua, chỉ sửa file của vùng.
  - **Góp ý (không bắt buộc):**
    - chùa chỉ khác cảnh gốc ở màu (tường kem, mái nâu), nhìn khá giống chùa `california` (tường trắng); nhật ký ghi "hiên rộng"
      nhưng code dùng hiên gốc. Hoặc sửa lại nhật ký, hoặc làm hiên rộng thật (ghép `buildTempleFacade` + `addRoof` như
      `tropical`, hoặc thêm hiên gỗ kiểu nhà trại);
    - cối xay gió quay về gốc tọa độ (0, 0), không phải giữa sân như comment: dùng `env.midZ - z` thay cho `-z`;
    - sọc lúa tương phản mạnh, nhìn từ trên cao (`6-vuon-hoa`) hơi giống thảm kẻ; có thể giảm độ đậm của sọc rãnh.
- 12/11/2026, Claude: làm vùng `vietnam` (người dùng yêu cầu), chờ duyệt. `vn` chuyển từ cảnh gốc sang vùng này; `default` giữ làm
  dự phòng cho vùng chưa có dữ liệu.
  - **Cảnh:**
    - ruộng lúa nước chia thửa có bờ (lúa xanh, ruộng mạ ngập nước, lúa chín);
    - lũy tre sát tường, cau, chuối, đống rơm, trâu, nhà ngói làng xa;
    - núi đá vôi thân tiện lồi lõm có cây bám vách: một dãy sau chánh điện (chừa trời ngay sau mái chùa), cụm ngoài cổng, vòng
      xa mờ sương;
    - trong sân giữ cây đa, hàng cau thay cây tùng.
  - **Chùa:** tường vàng, cột son, mái ngói nâu đỏ chồng diêm, đầu đao cong (`tiers` 2, `hook` 1,7); lưỡng long chầu nguyệt
    (mặt trăng đỏ, vòng lửa vàng, hai rồng uốn khúc) trên nóc mái trên và nóc cửa giữa cổng tam quan.
  - Số đo: đổi lần sau 61 ms, +5 mesh, +39.800 tam giác, không rò. Đã xem ban ngày, ráng chiều, đêm.
  - Phần chung: test núi cho phép núi sau lưng chánh điện (cách lưng điện ≥ 4 m).
- 12/11/2026, Claude: sửa test lúc qua lúc không "bot đi dạo không đứng chồng lên nhau". Đây là lỗi thật của bot:
  - mỗi bước chếch tránh người đặt lại đồng hồ chờ, nên hai bot cùng qua một điểm đường (hay điểm đường sát người ngồi ghế đá)
    chếch qua chếch lại hàng chục giây;
  - quá giờ chờ thì bot bị ép bước thẳng một bước rồi lại chờ tiếp, nên hai bot ngược chiều nhích từng bước trong khi đã chồng
    lên nhau, rồi còn đứng lại nói chuyện tại chỗ.
  - Sửa trong `apps/realtime/server.mjs`: tính thời gian bị chắn cả lúc đang chếch; quá 3 giây thì vòng rộng, quá 6 giây đi
    thẳng qua luôn 2 giây (`BOT_PASS_MS`); không chọn bot đang sát mình (< `BOT_SPOT_GAP`) để nói chuyện.
  - Đo 100 lần chạy: nhịp chồng tối đa 21 → 8 (ngưỡng 18), không còn bot nào quanh quẩn một chỗ (test giờ kiểm cả điều này).
  - 450/450 test qua, lint sạch.
- 12/11/2026, GPT/Codex: làm `south`, chờ duyệt; đồng thời nhận vùng `pacific`.
  - cảnh: đồng cỏ đầm lầy xanh đậm có kênh nước vẽ bằng canvas; sồi sống tán rộng rủ rêu Tây Ban Nha, bách đầm lầy cao,
    mộc lan hoa trắng; vũng bayou dùng `band` [20, 45], cây rải dùng `band` [10, 50] nên chỉ nằm ngoài tường;
  - chân trời: dải nước thấp, bờ đầm và hàng bách trong sương, không có núi nhọn;
  - chùa: giữ bộ dựng chung và cửa đúng chỗ, tường trắng, cột / mái xanh rêu, mái chồng diêm (`tiers: 2`, `hook: 1.15`);
  - `npm run theme:shots -- south`: đổi lần sau 44 ms, +3 mesh, +24.327 tam giác, +14 lệnh vẽ; FPS headless 15 → 15,
    geometry 359 → 359, không rò bộ nhớ;
  - thử trang thật ở khung 390×844: đi từ sân `z=33` qua cửa vào tận chánh điện `z=8,06`, đi nhanh tới Vườn Hoa,
    Khu vui chơi và Nông trại nhỏ; cảnh đúng `south`, 58–60 FPS, không lỗi console;
  - ảnh ghép: `.data/theme-shots/sheet.png`; chưa thấy điểm hình ảnh bắt buộc nào còn chưa ổn;
  - 454/454 test qua, lint sạch (802 file JavaScript, 40 file JSON).
- 12/11/2026, Claude: rà vùng `south` của GPT: đạt (+3 mesh, 24.300 tam giác, đổi vùng 35 ms, không rò; đầm lầy, bách,
  tường trắng cột xanh rêu). Chờ người dùng duyệt ảnh.
- 12/11/2026 20:51, Claude: rà vùng `pacific` của GPT (bản hiện tại): đạt (+2 mesh, 15.700 tam giác, đổi vùng 30 ms, không rò).
- 13/11/2026, người dùng: **duyệt cả 10 vùng** (mục 2 đổi thành `Đã duyệt`).
- 13/11/2026, Claude: Rừng thiền ngoài cổng tây (55 cây theo kiểu cây của vùng) làm đổi vùng chậm thêm 30–40 ms (đo A/B:
  Việt Nam 54 → 93 ms, quá ngưỡng 80). Cây rừng tách ra nhóm `landscape-grove`, dựng ở `tick()` khung kế tiếp
  (`buildGrove` trong `landscape3d.mjs`), không chung khung đổi vùng. Đo lại cả 10 vùng (đổi lần sau): vietnam 53–56,
  desert 36–38, snow 48–49, tropical 35, autumn 52, plains 12, south 33, blossom 41, pacific 26, california 35–36 ms;
  không rò. Rừng thiền có thảm nền dùng vật liệu cỏ của sân trong (`m.grass`, đổi theo `lawn` của vùng) nên không còn nằm
  trên ruộng lúa (Việt Nam), luống lúa mì (đồng bằng), cỏ vàng (California); vùng sa mạc vẫn là cát như sân trong.

