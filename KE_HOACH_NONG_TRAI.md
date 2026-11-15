# KE_HOACH_NONG_TRAI — Nông trại riêng: trồng cây, nuôi gà lấy trứng, nuôi bò lấy sữa

Lập ngày 14/11/2026. Người đọc: người dùng (chốt các quyết định ở mục 3) và Claude Code / GPT-Codex làm theo giai đoạn
(mục 7). Đọc trước: `AGENTS.md` (các đoạn Vườn Công Đức, Nông trại nhỏ, Linh thú, Phòng Lô Tô riêng, Bạn bè), rồi đọc
file này từ đầu tới cuối.

Yêu cầu của người dùng: **làm giống game Nông Trại Vui Vẻ — trồng cây, nuôi gà lấy trứng để bán, nuôi bò lấy sữa.**

Kế hoạch chỉ lấy **cơ chế của thể loại game nông trại** (cơ chế không ai giữ độc quyền). Không chép tên "Nông Trại
Vui Vẻ", hình vẽ, nhân vật, nhạc hay giao diện của game đó; tên và hình của mình tự làm (mục 3, câu 6).

## 1. Phân tích Nông Trại Vui Vẻ

**Game là gì.**
- Bản tiếng Việt do VNG phát hành, khoảng năm 2010 trên mạng xã hội Zing Me. Nay VNG (Firebat Studio) có thêm bản di
  động.
- Bản Việt theo dòng Happy Farm (开心农场) của hãng 5 Minutes, Trung Quốc, ra cuối 2008. Lúc đỉnh điểm Happy Farm có
  23 triệu người chơi mỗi ngày; tạp chí Wired xếp nó vào 15 game ảnh hưởng nhất thập niên vì có hàng chục bản làm theo
  trên Facebook.
- Nguồn ở mục 9.

### 1.1 Vòng chơi và vì sao người chơi quay lại

| Cơ chế | Cách chơi | Vì sao giữ chân người chơi |
| --- | --- | --- |
| Ô đất + hạt giống chín theo giờ thật | Mua hạt, gieo, chờ vài phút tới cả ngày tùy cây | Lúc nào mở game cũng có việc. Cây ngắn hợp lúc rảnh; gieo cây dài trước khi đi ngủ hay đi làm |
| Chăm sóc | Tưới nước, nhổ cỏ, bắt sâu; mỗi việc được điểm kinh nghiệm | Việc nhỏ, bấm là có thưởng ngay |
| Kho → bán → mua | Thu hoạch vào kho, bán lấy vàng, mua hạt tốt hơn | Vòng tiền dễ hiểu, thấy mình giàu lên |
| Cấp độ | Kinh nghiệm lên cấp, mở hạt mới, mở rộng đất, nâng cấp đất | Luôn có mục tiêu kế tiếp |
| Hàng xóm | Thăm vườn bạn, giúp tưới / bắt sâu, tặng quà, xin nông sản | Chơi cùng bạn bè, có lý do ghé nhau |
| **Hái trộm** | Cây nhà bạn chín mà bạn vắng thì vào hái trộm; nhà nuôi chó canh vườn để chặn | Lý do số một khiến người chơi canh giờ cây chín, mở game nhiều lần một ngày. Cũng là điều nhiều người ghét nhất |
| Chăn nuôi | Mua con giống, cho ăn, thu sản phẩm theo chu kỳ (trứng, sữa…) | Thêm một vòng sản xuất, dùng nông sản làm thức ăn |
| Bản mới | Thú cưng có kỹ năng (chó tìm sâu nhà hàng xóm, mèo gọi khách đặt đơn), chậu sưu tầm, lai giống, đơn hàng, sự kiện theo lễ Tết / Trung Thu | Sưu tầm và sự kiện theo mùa |
| Hai loại tiền | Vàng kiếm trong game; tiền nạp mua đồ đặc biệt, tăng tốc | Nguồn thu của nhà phát hành |

- Nguồn tìm được không tả kỹ phần chăn nuôi của bản gốc, nên phần gà / bò ở mục 4 theo các game cùng thể loại và theo
  yêu cầu của bạn.
- Theo một bài viết về bản xưa, nâng cấp cây trồng và vật nuôi tốn rất nhiều vàng. Đó là chỗ tiêu tiền giữ cho kinh tế
  game không phình ra.

### 1.2 Lấy gì, đổi gì, bỏ gì

| | Cơ chế |
| --- | --- |
| **Lấy** | Cây chín theo giờ thật với nhiều độ dài; tưới / nhổ cỏ / bắt sâu; kho + chợ; cấp độ mở khóa; mở rộng đất; thăm và giúp hàng xóm; tặng quà; chăn nuôi theo chu kỳ; sự kiện theo lễ (Rằm, Vu Lan, Tết) |
| **Đổi** | Hái trộm → **giúp đỡ + "góc chia sẻ"** (chủ để sẵn một phần cho khách lấy; mục 4.7). Lý do: cảnh đặt trong chùa (giới không trộm cắp), và người bị trộm thì nản |
| **Đổi** | Cây héo chết / mất đồ khi vắng → **không phạt**: vắng thì chỉ ngừng sinh thêm, đồ đã có còn nguyên (giống Linh thú). Người chơi vẫn muốn quay lại vì ổ trứng / thùng sữa đầy thì ngừng, giá chợ đổi theo ngày, có việc giúp bạn |
| **Đổi** | Tiền nạp mua tăng tốc → **kim cương chỉ mua đồ trang trí**. Quy ước hiện có: kim cương không đổi qua lại với xu |
| **Bỏ** | Giết mổ, bán con vật lấy thịt; chó cắn người; thả sâu / thả cỏ phá vườn bạn |

## 2. Trong dự án đã có gì dùng lại được

| Đã có | Dùng lại cho nông trại |
| --- | --- |
| **Vườn Công Đức** (`@chanh-dien/garden`, `apps/api/garden.mjs`, `garden-ui.js`): ví xu, sổ giao dịch, khóa idempotency, ngày theo `GARDEN_TIMEZONE`, 3 loại cây (táo, cam, đào), tưới 3 lần cách 8 giờ, khách hái 2 quả, bán / cúng dường, bot làm vườn | Ví, sổ giao dịch, idempotency, ngày vườn. **Nhưng 50 luống dùng chung cho mọi phòng của cả hệ thống**, nhiều người thì không đủ chỗ (mục tiêu 100.000 người online), nên nông trại phải là **đất riêng** từng người |
| **Nông trại nhỏ ngoài sân**: 8 con (thỏ, vịt, dê, heo, nai, ngựa) dựng từ mô hình Meshy, cử động chân / đầu bằng shader (`animals3d.mjs`), bộ não đi lại, chuồng gỗ, máng, cỏ khô, ao vịt | Gà và bò làm cùng quy trình: mô hình Meshy → nướng trọng số chân / đầu → bộ não chung. Cổng vào nông trại riêng đặt ở đây |
| **Động tác làm vườn** (`GARDEN_ACTIONS` trong `explore3d.mjs`): túi hạt, bình tưới, giỏ hái, hiệu ứng hạt / nước | Thêm rải thóc, nhặt trứng, vắt sữa, nhổ cỏ, bắt sâu bằng cùng cơ chế đạo cụ + hiệu ứng |
| **Linh thú**: kiểu "không phạt", rương đầy thì ngừng, test "cân bằng xu" chạy code thật | Khuôn cho gà / bò (ổ trứng, thùng sữa) và cho test kinh tế |
| **Phòng riêng** (Lô Tô riêng, rạp riêng): mỗi người một phòng, mời bạn, gửi link, đuổi, đóng | Khuôn cho "nông trại của tôi" có bạn bè ghé thăm |
| **Bạn bè, bạn bot, hộp thư** (`friend-links.mjs`, `inbox.notify`) | Thăm, giúp, tặng quà, nhắc "ruộng chín / ổ đầy" |
| **Phong cảnh theo vùng + trời theo giờ thật** (`landscape3d.mjs`, `daylight3d.mjs`) | Nông trại lấy trời, núi, cây của tiểu bang chủ nông trại; ngày đêm theo giờ thật |

**Thu nhập xu hiện nay** (ghi ở đầu `packages/garden/src/index.mjs`):
- Người chơi miễn phí chăm chỉ kiếm khoảng 120 xu/ngày: nhiệm vụ 35, việc chùa 60, vườn khoảng 25.
- Đủ 4 linh thú cấp 10 thêm khoảng 98 xu/ngày.

Xu là tiền chung của Tiến Lên, Lô Tô, Bầu Cua, Oẳn Tù Tì, rạp phim. Nông trại in ra quá nhiều xu sẽ làm lạm phát các
phòng đó, nên mục 5 phải hãm.

## 3. Quyết định cần người dùng chốt

Mỗi câu có sẵn đề xuất. Người dùng chưa trả lời câu nào thì làm theo đề xuất.

| # | Câu hỏi | Đề xuất | Lý do |
| --- | --- | --- | --- |
| 1 | Đất riêng mỗi người hay dùng chung? | **Đất riêng mỗi tài khoản.** Vườn Công Đức giữ nguyên làm vườn chung của chùa | 50 luống chung không đủ cho nhiều người; game nông trại cần "đất của tôi" |
| 2 | Nông trại hiện thế nào? | **Cảnh 3D riêng, đi lại được**, ở trang `/nong-trai.html` dùng chung engine với chánh điện | Bảng 2D rẻ hơn nhưng lạc giữa một app 3D; engine, phong cảnh, động tác đều đã có |
| 3 | Có hái trộm không? | **Không.** Thay bằng giúp đỡ + góc chia sẻ | Mục 1.2 |
| 4 | Kim cương mua được gì? | **Chỉ đồ trang trí** (hàng rào, nhà, giống vật nuôi khác màu nhưng năng suất như nhau). Không tăng tốc, không đổi ra xu | Giữ công bằng; giữ quy ước kim cương / xu tách riêng |
| 5 | Khách (chưa đăng nhập)? | **Chỉ thành viên có nông trại.** Khách vào thăm được nông trại của bot | Giống ví xu: cần tài khoản |
| 6 | Tên tính năng? | **"Phước Điền"** (ruộng phước — chữ nhà Phật: gieo hạt lành, gặt quả phước). Phương án khác: "Nông Trại An Lạc" | Không dùng tên "Nông Trại Vui Vẻ" (tên thương mại của VNG) |
| 7 | Mô hình 3D bằng Meshy (trả phí)? | Xin duyệt chi phí **trước giai đoạn 2**; danh sách ở mục 6.4 | Theo quy tắc: hỏi trước khi gọi dịch vụ trả phí |
| 8 | Nông trại cho thêm bao nhiêu xu mỗi ngày? | **Hạn mức chợ: 30 xu/ngày ở cấp 1, tăng dần tới 90 xu/ngày ở cấp 30** (mục 5) | Đủ để thấy có lời, không làm lạm phát phòng game; nick phụ mới chỉ được 30 xu/ngày |

## 4. Thiết kế trò chơi

Mọi con số dưới đây là **số nháp**. Chốt bằng test mô phỏng ở mục 5.

### 4.1 Vòng chơi

```
 gieo hạt ──► chăm (tưới, nhổ cỏ, bắt sâu) ──► thu hoạch ──► KHO
                                                             │
           ┌───────────────── ngô / thóc ◄────────────────────┤
           ▼                                                  │
   gà ăn ──► đẻ trứng vào ổ ──► nhặt ──► KHO                  │
   bò ăn cỏ ──► sữa vào thùng ──► vắt ──► KHO                 │
                                                             ▼
             CHỢ (bán lấy xu, có hạn mức/ngày) · cúng dường · tặng bạn
                                                             │
   xu ──► hạt, con giống, mở đất, nâng chuồng / kho ◄─────────┘
   mọi việc ──► kinh nghiệm ──► cấp mới mở thêm cây, con, đất
```

### 4.2 Đất và cây trồng

**Đất:**
- Bắt đầu 6 ô; mở rộng theo cấp + xu, tối đa 36 ô.
- Chạm một ô rồi kéo qua các ô bên cạnh là gieo / thu cả dãy, đỡ phải bấm từng ô.

**Cây trồng** (mỗi cây một độ dài, ngắn thì hợp lúc rảnh, dài thì gieo trước khi ngủ):

| Cây | Mở ở cấp | Chín sau | Thu được | Dùng |
| --- | --- | --- | --- | --- |
| Rau muống | 1 | 20 phút | bó rau | bán |
| Cà chua | 1 | 1 giờ | quả | bán |
| Ngô | 2 | 3 giờ | bắp | bán, **thức ăn gà** |
| Lúa | 3 | 6 giờ | thóc | **thức ăn gà**, bán |
| Cỏ voi | 5 | 2 giờ | bó cỏ | **thức ăn bò** (không bán) |
| Bí đỏ | 7 | 8 giờ | quả | bán |
| Dưa hấu | 9 | 12 giờ | quả | bán |
| Táo / cam / đào (như Vườn Công Đức) | 12 | 24 giờ lần đầu, sau đó ra quả mỗi 12 giờ, 4 lứa | quả | bán, cúng dường |

**Chăm sóc:**
- Tưới: đất khô thì cây ngừng lớn nhưng không chết. Tưới một lần giữ ẩm khoảng 8 giờ.
- Cỏ và sâu: server rút ngẫu nhiên (định trước theo mã vụ, không cần chạy việc nền), mọc khi cây đang lớn. Nhổ / bắt
  được kinh nghiệm; để nguyên thì giảm tối đa 20 % sản lượng.
- Cây chín để nguyên tới khi hái. Đất là của riêng mình nên không cần dọn chỗ cho người khác.

### 4.3 Gà lấy trứng (mở ở cấp 3)

- **Chuồng:** chuồng gà có sân nhỏ, 3 chỗ, nâng lên 6 rồi 9 (cần xu + cấp).
- **Lớn lên:** mua gà con bằng xu; được cho ăn đủ 12 giờ thì thành gà mái. Gà con lon ton theo mẹ trong sân chuồng.
- **Cho ăn:** mỗi lượt 1 bắp ngô hoặc 1 thóc mỗi con, no 8 giờ. Động tác rải thóc: gà chạy lại mổ.
- **Đẻ trứng:** gà no thì cứ 6 giờ đẻ 1 trứng vào ổ. Ổ giữ tối đa 4 trứng (khoảng một ngày); đầy thì gà ngừng đẻ, phải
  ra nhặt.
- **Đói:** gà ngừng đẻ, không chết, không gầy.
- **Không giết thịt, không bán gà.** Có thể tặng gà cho bạn (giai đoạn 4).
- **Trứng:** bán ở chợ, tặng bạn; giai đoạn 5 dùng làm bánh.

### 4.4 Bò lấy sữa (mở ở cấp 5)

- **Chuồng:** chuồng bò + bãi cỏ, 1 chỗ, nâng lên 2 rồi 3.
- **Lớn lên:** mua bê; được cho ăn đủ 2 ngày thì thành bò sữa.
- **Cho ăn:** mỗi lượt 2 bó cỏ voi tự trồng, hoặc cỏ khô mua ở chợ (đắt hơn), no 12 giờ.
- **Cho sữa:** bò no thì cứ 12 giờ được 1 xô sữa. Thùng giữ tối đa 2 xô; đầy thì ngừng.
- **Vắt sữa:** nhân vật ngồi ghế đẩu, xô sữa đầy dần.
- **Chải lông** mỗi ngày một lần: bò vui, thêm 10 % sữa. Không bắt buộc.
- **Sữa:** bán ở chợ, tặng bạn, hoặc cúng dường ở chánh điện. Gợi ý gắn với tích nàng Sujata dâng bát cháo sữa lên Đức
  Phật trước đêm thành đạo; cúng sữa tính vào nhiệm vụ ngày.

### 4.5 Kho và chợ

- **Kho:** một kho chung cho mọi nông sản, ban đầu chứa 50 món, nâng cấp bằng xu. Kho có sức chứa nên phải bán hoặc dùng
  thường xuyên, và nâng kho là một chỗ tiêu xu.
- **Giá:** mỗi món có giá gốc. Giá trong ngày lệch ±15 %, tính theo ngày + mã món nên mọi người thấy cùng một giá; bảng
  chợ ghi "hôm nay trứng được giá".
- **Hạn mức chợ:** chợ mỗi ngày chỉ thu theo giá đủ tới hạn mức của cấp (mục 3, câu 8); quá hạn mức thì chỉ trả 20 %.
  Đồ dư để trong kho bán ngày sau, đem tặng, cúng dường hoặc làm thức ăn.
- **Không mua bán giữa người chơi.** Tránh lừa đảo và tránh chuyển xu qua lại giữa các nick để cày phòng game. Chỉ tặng
  quà, có giới hạn mỗi ngày.

### 4.6 Cấp độ

- **Kinh nghiệm** có được từ gieo, thu hoạch, chăm sóc, cho ăn, nhặt trứng, vắt sữa và giúp bạn. Có 30 cấp.
- **Mỗi cấp mở:**
  - cây mới (bảng 4.2);
  - gà ở cấp 3, bò ở cấp 5;
  - thêm ô đất (6 → 36);
  - nâng chuồng gà (3 → 9 chỗ), chuồng bò (1 → 3 chỗ), kho;
  - hạn mức chợ cao hơn.
- **Tốc độ lên cấp:** cấp đầu lên nhanh (vài giờ), cấp cao cần nhiều ngày. Nhờ vậy nick phụ mới tạo không cày được nhiều.
- **Bảng xếp hạng:** theo cấp và theo "điểm phước" (mục 4.7). Không bắt buộc.

### 4.7 Hàng xóm (thay cho hái trộm)

- **Thăm:** vào nông trại của bạn (cả bạn bot) từ danh sách bạn bè hoặc mục "Hàng xóm". Chủ có thể bật "mở cửa cho mọi
  người".
- **Giúp:**
  - Việc giúp được: tưới đất khô, nhổ cỏ, bắt sâu, cho gà / bò đang đói ăn. Thức ăn lấy trong kho của chủ, không trừ
    của người giúp.
  - Mỗi người giúp tối đa 5 việc mỗi nông trại mỗi ngày.
  - Người giúp được kinh nghiệm và một ít xu, có trần xu mỗi ngày.
  - Chủ được báo "X đã giúp bạn tưới 3 ô".
- **Góc chia sẻ:**
  - Chủ đặt một rổ ở cổng và bỏ nông sản vào (hoặc bật "tự để 10 % mỗi lần thu").
  - Khách lấy tối đa 2 món mỗi nông trại mỗi ngày.
  - Chủ được "điểm phước" theo số món người khác nhận.
  - Vẫn giữ cảm giác ghé nhà nhau có quà mang về như hái trộm, nhưng là cho chứ không phải lấy.
- **Tặng quà:** gửi nông sản hoặc gà con cho bạn, có giới hạn mỗi ngày, qua hộp thư (`inbox.notify`).
- **Nhắc:** "Ruộng đã chín", "Ổ trứng đầy" hiện ở hộp thư / thông báo khi vào app.

### 4.8 Bot

- **Bạn bot có nông trại:** server tự chăm bằng mô phỏng, không tốn máy, để mục "Hàng xóm" lúc nào cũng có người.
- **Bot ghé giúp:** bot thỉnh thoảng giúp nông trại người chơi (tối đa 1 lần/ngày), không lấy đồ ở góc chia sẻ.

## 5. Kinh tế xu (chốt bằng test mô phỏng)

**Mục tiêu** (theo mục 3, câu 8; người dùng đổi thì sửa ở đây):
- Người chăm (vào 2–3 lần/ngày) chạm hạn mức chợ của cấp mình.
- Người vào 1 lần/ngày được khoảng 60 % hạn mức.
- Vào 3 ngày một lần vẫn có lời, không bao giờ âm (trừ khi tự mua đồ trang trí bằng xu).

**Xu vào và ra:**
- **Xu vào:** bán nông sản / trứng / sữa (trong hạn mức), giúp bạn (có trần).
- **Xu ra:** hạt giống, gà con, bê, cỏ khô, mở đất, nâng chuồng / kho, đồ trang trí bằng xu.

**Cách hãm lạm phát:**
- hạn mức chợ mỗi ngày, theo tài khoản;
- ổ trứng / thùng sữa đầy thì ngừng;
- kho có sức chứa;
- cây dài lãi theo giờ thấp hơn cây ngắn: thưởng người hay vào nhưng không quá;
- cấp cao cần nhiều ngày, nên nick phụ chỉ có hạn mức thấp.

**Ví dụ một con / ngày khi no đủ (số nháp):**

| Con | Sản phẩm / ngày | Giá gốc | Thức ăn / ngày | Lãi / ngày |
| --- | --- | --- | --- | --- |
| Gà mái | 4 trứng | 3 xu | 3 ngô / thóc tự trồng (~1 xu mỗi món) | ~9 xu |
| Bò sữa | 2 xô | 12 xu | 4 bó cỏ tự trồng (~1 xu mỗi bó) | ~20 xu |

Đủ 9 gà + 3 bò thì làm ra nhiều hơn hạn mức chợ. Đó là chủ ý: phần dư dùng để tặng, cúng dường, làm đơn hàng
(giai đoạn 5) và bán ngày sau, không biến hết thành xu.

**Test:** `apps/api/test/farm-economy.test.mjs` chạy code thật theo đồng hồ giả, giống test "cân bằng xu" của linh thú.
- **Các kiểu chơi:** vào 3 lần/ngày, 1 lần/ngày, 3 ngày/lần, ở cấp 1, 10, 30, trong 30 ngày.
- **Kiểm:** lãi nằm trong khoảng mục tiêu, không kiểu chơi nào âm, nick mới không vượt 30 xu/ngày.
- Đổi con số nào thì chạy lại test này.

## 6. Kỹ thuật

### 6.1 Phòng và cảnh

**Loại phòng mới `farm`:**
- Luật `FARM_RULES` trong `@chanh-dien/room-rules`.
- Mỗi nông trại một phòng `farm-<mã>`, mã là chuỗi ngắn băm từ mã tài khoản, không lộ mã tài khoản.
- Làm theo skill `add-room-type`.

**Ai vào được:** chủ, bạn bè, bạn bot, hoặc mọi người nếu chủ mở cửa; tối đa 20 người như phòng riêng.

**Chủ vắng vẫn vào được:**
- Khách vào được kể cả khi chủ không online. Chính lúc đó cần người giúp.
- Máy realtime mở phòng khi có người vào. Trạng thái nông trại nằm ở API, không nằm trong phòng.

**Cảnh `scenes/nong-trai/`** (skill `add-scene`):
- **Gồm:** ô đất xếp lưới, chuồng gà, chuồng bò + bãi cỏ, kho thóc, giếng, nhà nhỏ, hàng rào, rổ chia sẻ ở cổng, ao nhỏ.
- **Bố cục:** script `scripts/farm-layout.mjs` sinh ra rồi ghi vào `scene.json`. Đúng nguyên tắc 5: engine không chứa tọa
  độ riêng của phòng nào.
- **Ô chưa mở:** vẫn vẽ, phủ cỏ dại + biển "mở ở cấp N" để người chơi thấy mục tiêu.

**Engine:**
- **Phần mới:** `packages/scene-engine/src/farm3d.mjs` dựng cảnh từ `world.farm`.
- **Dùng lại:**
  - `landscape3d` (trời, núi, cây theo vùng của tiểu bang chủ nông trại);
  - `daylight3d`, `water3d`, `props3d`;
  - `animals3d` (gà, bò);
  - billboard ảnh như hoa ở Vườn Hoa cho cây trồng theo giai đoạn;
  - `explore3d` + `explore-ui` cho đi lại và động tác.

**Đường vào:**
- **Trang:** `/nong-trai.html`.
- **Từ chùa:** cổng gỗ "Về nông trại" ở Nông trại nhỏ, điểm đi nhanh mới `myfarm`. Tên `farm` đã dùng cho Nông trại nhỏ.
  Thêm đích đi nhanh là thay đổi cộng thêm.
- **Lối khác:** menu ⚙, nút "Thăm nông trại" trên thẻ bạn bè.
- **Về chùa:** nút về.

### 6.2 API và dữ liệu

**Chỗ đặt code:**
- `apps/api/farm.mjs` (đường HTTP).
- Phần lõi đặt trong `packages/garden` (file mới `farm.mjs`) để dùng chung ví xu và sổ giao dịch trong **cùng một
  giao dịch SQLite** như vườn.

**Bảng (nháp):**

| Bảng | Giữ gì |
| --- | --- |
| `farm_profiles` | cấp, kinh nghiệm, số ô, số chỗ chuồng gà / bò, sức chứa kho, cài đặt góc chia sẻ, mở cửa |
| `farm_plots` | ô: cây, lúc gieo, ẩm tới lúc nào, cỏ / sâu, lúc chín, sản lượng |
| `farm_animals` | con: loài, giai đoạn (con / lớn), chỗ, no tới lúc nào, mốc sinh sản phẩm, số đang chờ trong ổ / thùng |
| `farm_items` | kho chung: (tài khoản, món, số lượng) — gồm hạt, nông sản, trứng, sữa, cỏ khô |
| `farm_market_sales` | đã bán bao nhiêu xu theo giá đủ trong ngày, để tính hạn mức |
| `farm_help_events`, `farm_share_takes`, `farm_gifts` | giúp / lấy ở góc chia sẻ / tặng theo ngày, để giới hạn và báo chủ |

**Giao dịch xu:**
- Thêm các loại giao dịch mới (`farm_buy`, `farm_sell`, `farm_help`…).
- Bảng `coin_transactions` có ràng buộc CHECK nên phải dựng lại bảng trong `MIGRATIONS`, như các lần thêm trò trước.

**Tính trạng thái:**
- Tính lười: không chạy đồng hồ cho từng nông trại. Lúc đọc mới tính từ các mốc thời gian (như linh thú).
- Mọi mốc lấy theo đồng hồ server.

**Đường API (nháp):**
- `GET /api/v1/farm` (của mình).
- `GET /api/v1/farm/<mã>` (thăm; kiểm tra quyền thăm).
- `POST /api/v1/farm/{plant, water, weed, pest, harvest, buy, feed, collect, groom, sell, expand, upgrade, help, share,
  take, gift}`.
- Mọi lệnh POST có `Idempotency-Key`, kiểm `sameOrigin`, giới hạn tần suất.

### 6.3 Realtime và giao thức

- **Báo đổi:** nông trại đổi (do chủ, người giúp hay bot) thì API báo các máy realtime trong `REALTIME_INTERNAL_URLS` qua
  `/internal/farm`, giống `garden.plot`. Máy giữ phòng `farm-<mã>` phát `farm.update` gồm:
  - `slot` / `animal` và `state`;
  - `effect` { kind, by } để người đứng gần làm động tác;
  - mốc `at` tăng dần để bỏ tin cũ tới trễ.
- **Vào phòng:** người mới vào nhận ảnh chụp trạng thái nông trại (`farm.state`).
- **Giao thức:** tin mới định nghĩa trong `packages/protocol`, làm theo skill `protocol-change`. Thêm loại tin là thay đổi
  cộng thêm.

### 6.4 Hình 3D (Meshy — trả phí, cần duyệt ở mục 3 câu 7)

**Danh sách (~30 thứ):**
- **Gà:** gà mái, gà trống (trang trí), gà con.
- **Bò:** bò sữa, bê.
- **Chuồng và đồ dùng:** chuồng gà, chuồng bò, ổ trứng, xô / thùng sữa, ghế đẩu, máng ăn.
- **Công trình:** kho thóc, giếng, nhà nhỏ, rổ chia sẻ, bao thóc.
- **Cây trồng:** mỗi cây 3 giai đoạn (mầm / lớn / chín) — rau muống, cà chua, ngô, lúa, cỏ voi, bí đỏ, dưa hấu.

**Quy trình** (theo AGENTS.md và ghi nhớ Meshy):
- Cây nhiều mảnh nhỏ: tạo với `should_remesh: false`, rồi dựng thành ảnh billboard như hoa.
- Gà, bò: nén `gltf-transform` như thú ở Nông trại nhỏ, cử động chân / đầu bằng shader.
- Chuồng, kho: kiến trúc, dùng API Remesh khoảng 20.000 tam giác.

**Trong lúc chờ mô hình:**
- Gà / bò dựng tạm bằng khối, như các thú khối ở khu thú cưng.
- Cây dựng tạm bằng khối màu.
- Nhờ vậy giai đoạn 0–1 làm được trước khi có mô hình.

**Động tác mới:** rải thóc, nhặt trứng bỏ giỏ, vắt sữa, chải lông bò, nhổ cỏ, bắt sâu. Dùng chung đạo cụ + hiệu ứng
`applyChore` / `GARDEN_ACTIONS`.

### 6.5 Giao diện

- **Thanh trên:**
  - cấp + thanh kinh nghiệm;
  - xu;
  - "Chợ hôm nay còn thu X xu";
  - nút Kho, Chợ, Cửa hàng (hạt, con giống), Hàng xóm.
- **Chạm vào vật:** chạm ô đất / con vật / ổ trứng / thùng sữa thì hiện bảng hành động nhỏ (kiểu `pet-actions`).
  Nhân vật tự đi tới rồi làm, giống vườn.
- **Trên đầu vật:** ô chín hoặc ổ đầy có biểu tượng nổi (🌽 🥚 🥛), nhìn từ xa biết chỗ nào cần làm.
- **Ngôn ngữ:** chữ vi / en / zh / es trong file i18n.
- **Kiểm tra:** khung điện thoại 9:16, 390×844. Chữ to, ít bước bấm, vì người chơi có cả người lớn tuổi.

### 6.6 An toàn và chống gian lận

- **Không tin máy người chơi:** mọi mốc thời gian theo server; mỗi lệnh dùng một lần (idempotency); giới hạn tần suất.
- **Giới hạn mỗi ngày:** giúp, lấy ở góc chia sẻ, tặng quà.
- **Chống cày xu bằng nick phụ:**
  - xu từ giúp đỡ có trần mỗi ngày;
  - chỉ tính khi hai người là bạn từ 24 giờ trở lên;
  - hạn mức chợ theo cấp.
- **Tên:** tên nông trại và tên vật nuôi đi qua bộ lọc chat (`packages/moderation`).
- **Quyền thăm:** API kiểm quyền thăm. Danh sách hàng xóm không lộ phòng, vị trí hay mã người khác (như danh sách bạn
  bè).

### 6.7 Hiệu năng

- **Nhẹ hơn sân chùa:**
  - ô đất và cây vẽ bằng InstancedMesh;
  - gà / bò chung một bộ não;
  - con ở xa camera thì ẩn.
- **Ngân sách:** số lệnh vẽ và tam giác không vượt sân chánh điện, đo bằng `stats()`.
- **Load test:** đo tải trước khi mở cho mọi người, vì mỗi nông trại có người là một phòng (skill `load-test`, chỉ chạy
  ở môi trường thử).

## 7. Lộ trình

Mỗi giai đoạn xong thì chạy `npm run lint` + `npm test` và kiểm tra trên trình duyệt 390×844 rồi mới qua giai đoạn sau.
Cỡ việc: S nhỏ, M vừa, L lớn.

| GĐ | Nội dung | Cỡ | Xong khi |
| --- | --- | --- | --- |
| **0. Chốt + khung** | Chốt mục 3. Loại phòng `farm`, cảnh `nong-trai` trống (đất, hàng rào, nhà, phong cảnh theo vùng), trang `/nong-trai.html`, cổng ở Nông trại nhỏ + điểm đi nhanh `myfarm`, bạn bè vào thăm | M | Từ sân chùa vào được nông trại riêng; bạn vào cùng thì hai bên thấy nhau đi lại; về lại chùa được; test luật phòng + quyền vào |
| **1. Trồng trọt** | 6 ô → 36 ô, 8 loại cây (hình tạm bằng khối), tưới / cỏ / sâu, thu hoạch, kho, chợ (giá theo ngày, hạn mức), cấp độ, mở đất, động tác nhổ cỏ / bắt sâu | L | Gieo → chín → thu → bán chạy hết trên trang thật; hai máy thấy cùng trạng thái ô; vắng 3 ngày không mất gì; test kinh tế phần trồng trọt đạt |
| **2. Gà lấy trứng** | Duyệt Meshy, làm mô hình gà + chuồng. Mua gà con, lớn thành gà mái, cho ăn bằng ngô / thóc, đẻ vào ổ, nhặt, bán; động tác rải thóc, nhặt trứng | M | Đủ vòng gà trên trang thật; ổ đầy thì ngừng; gà đói không chết; test kinh tế có gà đạt |
| **3. Bò lấy sữa** | Mô hình bò + chuồng. Mua bê, lớn thành bò sữa, cỏ voi / cỏ khô, vắt sữa, chải lông, bán, cúng dường sữa ở chánh điện | M | Đủ vòng bò trên trang thật; cúng sữa tính nhiệm vụ ngày; test kinh tế toàn bộ đạt |
| **4. Hàng xóm** | Thăm khi chủ vắng, giúp, góc chia sẻ, tặng quà, nông trại bạn bot, nhắc qua hộp thư, bảng xếp hạng | M | Hai tài khoản thử giúp / tặng / lấy góc chia sẻ đúng giới hạn; nick mới không cày được quá hạn mức; trust-safety rà soát |
| **5. Mở rộng** (tùy chọn) | Đơn hàng của làng ("tiệm bánh cần 10 trứng"), chế biến (bánh, sữa chua), đồ trang trí bằng kim cương, sự kiện lễ (Tết: trồng nếp + lá dong gói bánh chưng; Vu Lan; Rằm) | L | Mỗi phần có "Xong khi" riêng lúc lên kế hoạch |

## 8. Rủi ro

- **Lạm phát xu sang các phòng game:** hãm bằng hạn mức chợ + test mô phỏng (mục 5). Theo dõi tổng xu phát ra mỗi ngày
  sau khi mở.
- **Nông trại kéo người khỏi chánh điện** (chùa vẫn là trọng tâm): cổng nông trại đặt trong sân chùa, cúng dường sữa /
  quả, nhiệm vụ ngày vẫn ở chùa.
- **Khối lượng 3D lớn, Meshy tốn tiền:** làm giai đoạn 0–1 bằng hình tạm trước, thấy người chơi thích rồi mới đầu tư
  mô hình.
- **Bản quyền:** không dùng tên, hình, nhân vật, nhạc, giao diện của Nông Trại Vui Vẻ / Happy Farm (mục đầu).
- **Nhiều phòng nhỏ:** mỗi nông trại có người là một phòng. Đo tải trước khi mở rộng (mục 6.7).
- **Không phạt nên có thể ít động lực quay lại:** bù bằng ổ / thùng đầy thì ngừng, giá chợ theo ngày, giúp bạn, nhắc
  qua hộp thư. Sau khi mở thì đo xem người chơi quay lại mấy lần một ngày.

## 9. Nguồn tham khảo

- [Game Nông Trại Vui Vẻ ngày xưa — FPT Shop](https://fptshop.com.vn/tin-tuc/giai-tri/game-nong-trai-vui-ve-ngay-xua-173869)
  (chỉ đọc được phần tóm tắt trong kết quả tìm kiếm: mở rộng đất, lên cấp, thuê nhân công, nâng cấp tốn nhiều vàng)
- [Nông Trại Vui Vẻ trên TapTap](https://www.taptap.io/vn/app/25031) (mô tả bản di động hiện nay của VNG Firebat:
  30 loại hạt, lai giống, thú cưng có kỹ năng, chậu sưu tầm, hàng xóm, đơn hàng)
- [Happy Farm — Wikipedia](https://en.wikipedia.org/wiki/Happy_Farm) (5 Minutes, 2008, 23 triệu người chơi mỗi ngày,
  có hái trộm)
