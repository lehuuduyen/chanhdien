# Protocol v3

`@chanh-dien/protocol` là hợp đồng duy nhất cho message giữa client và realtime server. Mọi message có envelope `{ v, type }`; message server → client luôn có `epoch` của phòng.

Parser từ chối trường lạ, không ép kiểu và trả `{ ok: false, error }`. Client phải bỏ qua an toàn `UNKNOWN_MESSAGE_TYPE` để server có thể thêm message trong cùng major version.

## Client → server

| Type | Vai trò | Giới hạn mặc định | Trường |
| --- | --- | --- | --- |
| `hello` | mọi người | 1/kết nối | `roomId`, `displayName`, `resumeToken?` |
| `chat.send` | mọi người | 5/10 giây | `requestId`, `text` (≤ 280 ký tự) |
| `seat.select` | mọi người | 3/10 giây | `requestId`, `seatId` |
| `avatar.set` | mọi người (phòng có `skins`) | 5/phút | `requestId`, `skin` (`man`, `woman`, `granny`, `nun`, `monk`, `child`, `chibigirl`, `swordsman`). `chibigirl`, `swordsman` và mã `shop-<tên>` (nhân vật admin tải lên, mẫu `SHOP_SKIN`) là hình cao cấp: server chỉ nhận khi vé vào phòng (claim `skins`, do API ghi theo đồ đã mua/được tặng) có hình đó, không thì `protocol.error` `SKIN_LOCKED`; hình mặc định của người mới không bao giờ là hình cao cấp |
| `bench.select` | mọi người trong chánh điện | 3/10 giây | `requestId`, `benchId`; server cấp `benchSpot` trống, tối đa theo room rules |
| `travel.go` | mọi người trong chánh điện 3D | 3/10 giây | `requestId`, `destination` (`hall`, `courtyard`, `garden`, `pets`, `memorial`, `park`, `flowers`, `farm`); server tự tra tọa độ cố định |
| `chore.start` / `chore.stop` | mọi người trong chánh điện 3D | 6/10 giây | `requestId`, `choreId`; bắt đầu chỉ được chấp nhận khi vị trí server giữ nằm trong bán kính điểm việc |
| `pet.interact` | mọi người trong chánh điện 3D | 6/10 giây | `requestId`, `petId`, `action` (`pet`, `feed`, `play`, `trick`: làm trò riêng từng loài); server chỉ nhận mã thú cố định và người đang đứng trong khu thú cưng hoặc Nông trại nhỏ |
| `reaction.send` | mọi người | 6/10 giây | `requestId`, `kind` (`clap`, `laugh`, `heart`, `wow`, `cry`, `fire`); rạp phim: biểu tượng bay trên đầu nhân vật |
| `bet.place` | thành viên đã đăng nhập (phòng game) | 10/5 giây, chỉ trong pha đặt cược, tối đa 1.000 xu mỗi ván | `requestId`, `roundId`, `animal` (`nai`, `bau`, `ga`, `ca`, `cua`, `tom`), `amount` (1–1.000 xu); API trừ xu ngay · Tài Xỉu (phòng `taixiu-1`, mã ván `tx-…`) gửi `spot` thay cho `animal`: `xiu`, `tai`, `t4`…`t17`, `f1`…`f6`; đúng một trong hai |
| `bet.cancel` | thành viên đã đăng nhập (phòng game) | 3/5 giây, chỉ trong pha đặt cược | `requestId`, `roundId`; hủy toàn bộ cược của mình trong ván, API hoàn xu (trả lời bằng `game.mine` với `mine` rỗng) |
| `lotto.buy` | thành viên (phòng `loto-1`) | 5/10 giây, chỉ trong pha mua vé | `requestId`, `roundId` (`lt-…`), `count` 0–2 (tổng ≤ 2 vé/ván), `autoMark` (mua tự đánh dấu 5 xu); phải mua ít nhất một thứ |
| `lotto.claim` | thành viên | 5/10 giây; kinh sai khóa 10 giây (`FALSE_CLAIM`, `CLAIM_LOCKED`) | `requestId`, `roundId`, `ticket` 1–2, `row` 0–2. Server kiểm tra theo vé gốc + số đã gọi, không theo chỗ đánh dấu |
| `hideseek.join` / `hideseek.leave` | mọi người (phòng chánh điện) | 5/10 giây | `requestId`. Xin vào ván trốn tìm kế tiếp / rời (đang chơi thì bỏ cuộc). Đầy thì `GAME_FULL` |
| `hideseek.catch` | người đi kiếm | 10/10 giây, chỉ pha đi kiếm | `requestId`, `targetId`. Server đo khoảng cách theo vị trí server giữ (≤ 3 m); lỗi `TOO_FAR`, `NOT_SEEKING`, `NOT_SEEKER`, `NOT_HIDER` |
| `rps.open` / `rps.find` | thành viên (phòng `oantuti-1`) | 5/10 giây, mỗi người một bàn / trận một lúc (`BUSY`) | `requestId`, `stake` (10, 20, 50, 100, 200 xu). `open` mở bàn mới, `find` vào bàn đang chờ cùng mức (ưu tiên người thật), không có thì mở bàn; API trừ cọc ngay (`INSUFFICIENT_COINS`) |
| `rps.join` | thành viên | 5/10 giây | `requestId`, `tableId` (`rp-…`); bàn vừa có người vào thì `TABLE_TAKEN` |
| `rps.leave` | thành viên | 5/10 giây | `requestId`. Đóng bàn đang chờ (hoàn cọc) hoặc rời bàn sau trận; đang đấu thì `IN_MATCH` |
| `rps.pick` | thành viên | 10/10 giây, một lần mỗi lượt, chỉ trong pha `pick` (`PICK_CLOSED`, `ALREADY_PICKED`) | `requestId`, `matchId`, `choice` (`rock`/`paper`/`scissors`). Server giữ kín tới khi lật |
| `rps.rematch` | thành viên | 5/10 giây, chỉ trong pha `done` | `requestId`, `matchId`; cả hai bấm thì mở trận mới, trừ cọc lại |
| `room.command` | moderator, host | 10/10 giây | `requestId`, `command` (`pause`, `resume`, `skip`) |
| `queue.add` | mọi người | 3/60 giây, tối đa 3 video chờ mỗi người, hàng chờ 50 | `requestId`, `videoId` (id YouTube 11 ký tự). Rạp tốn tiền (xu hoặc 💎, admin đặt ở API), chỉ thành viên; lỗi `SIGN_IN_REQUIRED`, `INSUFFICIENT_COINS`, `INSUFFICIENT_DIAMONDS`, `WALLET_UNAVAILABLE` |
| `queue.remove` | người đã mở video đó | 5/60 giây | `requestId`, `itemId`. Chỉ video còn trong hàng chờ (chưa chiếu); đã trả tiền thì hoàn đúng loại tiền. Lỗi `NOT_QUEUED`, `NOT_OWNER` |
| `vote.skip` | mọi người | 5/60 giây | `requestId`, `itemId` (bài đang chiếu) |
| `playback.report` | mọi người | 10/10 giây | `itemId`, `event` (`duration`, `ended`, `error`), `value?` |
| `ping` | mọi người | 1/10 giây | `sentAt` |
| `friend.request` | mọi người | 5/60 giây | `requestId`, `targetId` (người trong phòng, không phải bot) |
| `friend.respond` | mọi người | 10/60 giây | `requestId`, `fromId`, `accept` (boolean) |
| `hand.request` | mọi người | 5/60 giây | `requestId`, `targetId` (người thật, cả hai đang đứng trong khuôn viên, cách ≤ 6 m, chưa nắm tay ai) |
| `hand.respond` | mọi người | 10/60 giây | `requestId`, `fromId`, `accept` (boolean) |
| `hand.release` | mọi người | 10/60 giây | `requestId` (buông tay người đang nắm) |
| `bot.quiet` | mọi người | 5/60 giây | `requestId`, `quiet` (boolean; `true`: bot không tự bắt chuyện, khiêu chiến hay mời sang phòng game) |
| `challenge.send` | mọi người | 5/60 giây, mỗi người một trận một lúc | `requestId`, `targetId`, `game` (`rps`) |
| `challenge.respond` | người được mời | 10/60 giây | `requestId`, `challengeId`, `accept` |
| `challenge.move` | hai người chơi | 10/10 giây | `requestId`, `challengeId`, `choice` (`rock`, `paper`, `scissors`) |
| `challenge.cancel` | hai người chơi | 10/60 giây | `requestId`, `challengeId` |
| `player.block` | mọi người | 20/60 giây | `requestId`, `targetId`, `blocked` (boolean). Người bị chặn không gửi lời mời kết bạn / khiêu chiến được tới mình; trận đang có giữa hai người bị huỷ. Chỉ trong phiên |
| `player.report` | mọi người | 3/10 phút | `requestId`, `targetId`, `reason` (`spam`, `harassment`, `inappropriate`, `other`), `note?` (≤ 200 ký tự). Lưu vào sổ báo cáo của API, không báo cho người bị báo cáo |

Rate limit trong bảng là hợp đồng hành vi; enforcement sẽ được thêm vào realtime server ở giai đoạn 1.

## Server → client

| Type | Ý nghĩa | Trường chính |
| --- | --- | --- |
| `welcome` | chấp nhận kết nối | `epoch`, `connectionId`, `serverTime`, `heartbeatMs`, `resumeToken?` |
| `room.state` | snapshot khi vào/nối lại và khi người/ghế đổi; phòng đông (room rules có `world.view`): chỉ gồm người máy nhận đang thấy (chính mình, người ngồi bồ đoàn/ghế đá, người đang mời/đấu với mình, `view[vùng]` người gần nhất cùng vùng chánh điện/sân), gửi riêng từng người và chỉ khi phần đó đổi | `epoch`, `roomId`, `revision`, `participants` (`connected?`, `skin?`, `merit?`, `bot?`, `benchId?` + `benchSpot?`, `level?`: cấp công đức của thành viên; `avatarUrl?`: ảnh Google; `title?`: danh hiệu sự kiện; `frame?`: khung đại diện sự kiện; `pet?`: linh thú đang dẫn theo `{ species: carp|turtle|crane|lion, level: 1–10 }` (client tự vẽ đi theo chủ); `handWith?`: id người đang nắm tay, `handLead?`: true ở người dẫn đường) |
| `chat.message` | chat đã được server chấp nhận | `epoch`, `messageId`, `participantId`, `text`, `sentAt`, `displayName?` (tên người gửi, cho máy không thấy người đó) |
| `room.count` | phòng đông: số người cả phòng, gửi riêng từng người khi đổi (tối đa 2 lần/giây) | `epoch`, `total` (có tính bot), `bots`, `top` (≤ 20 `{ id, displayName, merit, level?, avatarUrl? }` theo công đức), `rank?` (hạng công đức của người nhận) |
| `playback.state` | bài đang chiếu và hàng chờ, gửi khi vào phòng và mỗi khi đổi | `epoch`, `current` (`itemId`, `videoId`, `title`, `addedBy`, `startedAt`, `duration?`) hoặc `null`, `queue` (mỗi video có thể kèm `paid` { currency, amount }: đã trả bao nhiêu; không mang id người mở), `votes`, `votesNeeded` |
| `hand.state` | nắm tay (chỉ gửi hai người): người mời dẫn đường, người nhận tự đi bên cạnh | `epoch`, `fromId`, `toId`, `status` (`pending`, `accepted`, `declined`, `released`), `byId?` (ai buông; tự buông khi ngồi, đi nhanh, rời phòng, cách quá 12 m) |
| `wallet.update` | tiền mở phim vừa trừ / hoàn (chỉ gửi chủ ví) | `epoch`, `currency?` (`coins` / `diamonds`, mặc định `diamonds`), đúng một trong `spent` / `refunded`, số dư mới `coins?` hoặc `diamonds?`, `itemId?` (kèm `spent`: video vừa vào hàng chờ, để hiện nút Hủy) |
| `chat.history` | chat của phòng trong ngày (từ nửa đêm theo `GARDEN_TIMEZONE`, cũ trước), gửi riêng người vừa vào / nối lại | `epoch`, `messages` (≤ 100; mỗi tin `participantId`, `displayName?`, `text`, `sentAt`) |
| `inbox.notify` | có lời nhắn / lời mời của bạn bè (gửi mọi kết nối của tài khoản nhận); nội dung tải qua `GET /api/v1/me/inbox` | `epoch`, `kind` (`note`, `invite`) |
| `game.invite` | bot mời sang phòng game (chỉ gửi người được mời; câu mời nằm trong `chat.message` của bot) | `epoch`, `fromId` (bot), `game` (`loto`, `tai-xiu`, `bau-cua`) |
| `friend.state` | lời mời kết bạn (chỉ gửi hai người liên quan) | `epoch`, `fromId`, `toId`, `status` (`pending`, `accepted`, `declined`), `saved?` (đã lưu vào tài khoản khi cả hai đăng nhập) |
| `challenge.state` | trận khiêu chiến (chỉ gửi hai người chơi); server làm trọng tài, lựa chọn chỉ lộ ra ở `last` khi lượt xong | `epoch`, `challengeId`, `game`, `fromId`, `toId`, `status` (`pending`, `declined`, `cancelled`, `expired`, `playing`, `finished`), `round`, `fromScore`, `toScore`, `target` (số lượt thắng để thắng trận), `deadline?`, `moved?` (`from`, `to`), `last?` (`from`, `to`, `winner`), `winner?` (`from`, `to`, `draw`) |
| `garden.plot` | luống Vườn Công Đức vừa đổi (phát cho mọi phòng chánh điện; thao tác thật đi qua API `/api/v1/garden/*`) | `epoch`, `plots` (1–50 `{ id, crop }`; `crop` là `null` khi luống trống, hoặc `plantType`, `ownerName`, `stage` (`seed`, `sprout`, `young`, `fruiting`), `waterDays`, `waterNeeded`, `wateredToday` (tương thích client cũ), `canWater?`, `wilted?`, `lastWateredAt?`, `nextWaterAt?`, `wiltsAt?`, `fruitsLeft`, `fruitsTotal`, `plantedAt`), `effect?` (`plotId`, `kind`: `plant`/`water`/`harvest`, `by`), `at?` (mốc thứ tự của API, ms tăng dần; client bỏ qua dữ liệu luống cũ hơn mốc đã có) |
| `memorial.grave` | ô mộ Khu tưởng niệm vừa đổi (phát cho mọi phòng chánh điện; đắp mộ đi qua API `/api/v1/memorial/build`) | `epoch`, `graves` (1–36 `{ slot, grave }`; `grave` là `null` khi ô trống, hoặc `name` (≤ 24 ký tự), `builderName`, `builtAt`, `expiresAt`; quá `expiresAt` thì client tự ẩn) |
| `community.project` | snapshot công trình Bồ Đề chung vừa đổi (phát cho mọi phòng chánh điện; đóng góp thật đi qua API `/api/v1/community-project/contribute`) | `epoch`, `project` (`id`, `kind`, `stage`, `stageIndex`, `progress`, `target`, `percent`, `completed`, `contributors`, `contributions`, `updatedAt`) |
| `chore.state` | tiến độ công việc chung trong phòng; hai người trở lên được hệ số phối hợp và dùng cùng trạng thái hoạt ảnh | `epoch`, `chores` (tối đa 6 `{ id, kind, progress` 0–1000, `workers`, `completedAt? }`) |
| `chore.reward` | gửi riêng cho thành viên sau khi hoàn thành việc; ví do API xác nhận, không tin client | `epoch`, `choreId`, `kind`, `reward` (0 hoặc 20), `coins`, `count`, `limit` (3) |
| `pet.interaction` | hiệu ứng ngắn với thú cưng, phát cả phòng và không lưu snapshot | `epoch`, `participantId`, `petId`, `action` (`pet`, `feed`, `play`, `trick`), `at` |
| `reaction` | một người vừa thả cảm xúc (phát cả phòng, không lưu vào snapshot) | `epoch`, `participantId`, `kind`, `at` |
| `game.state` | bàn Bầu Cua chung: đổi pha và khi tổng cược đổi (tối đa ~3 lần/giây); gửi cả khi vào phòng | `epoch`, `game` (`bau-cua`), `roundId`, `phase` (`betting`, `rolling`, `result`), `endsAt` (giờ server), `totals` (đủ 6 linh vật), `bettors`, `dice?` (3 linh vật), `winners?` (≤ 5 `{ displayName, net }`), `void?` (ván hủy, cược được hoàn) · `game: "tai-xiu"`: `totals` theo 22 ô Tài Xỉu, `dice` là 3 số 1–6, `history` (tối đa 10 ván gần nhất, mới nhất trước, mỗi ván 3 số) |
| `lotto.state` | bàn Lô Tô: mỗi số gọi, đổi pha, khi bán thêm vé | `roundId`, `phase` (`buying`/`calling`/`claiming`/`result`), `endsAt`, `called` (thứ tự gọi), `pool`, `tickets`, `players`, `nextCallAt?`, `waiting?` (≤ 8 `{ displayName, number }`: còn thiếu 1 số), `claims?`, `winners?` (`{ displayName, share }`), `void?` |
| `hideseek.state` | cả phòng, khi đổi pha / có người vào, rời, bị bắt | `phase` (`idle`/`lobby`/`hiding`/`seeking`/`result`), `round`, `lobby` (`{ id, displayName }` chờ ván sau), `players` (`{ id, displayName, role: seeker/hider, caught }`), `minPlayers`, `endsAt?`, `winner?` (`seekers`/`hiders`/`none`), `lastCatch?`. Không mang vị trí: vị trí đi qua `room.state` / `room.moves` và server lọc theo vai |
| `hideseek.reward` | người thắng trốn tìm có tài khoản | `reward` (10 xu, 0 khi đã đủ lần trong ngày), `coins`, `count`, `limit` |
| `rps.lobby` | phòng Oẳn Tù Tì, cả phòng (gom ~300 ms) | `tables` (≤ 20 `{ id, displayName, stake, skin? }` bàn đang chờ), `playing`, `feed` (≤ 10 `{ a, b, stake, winner: a/b/draw }`) |
| `rps.match` | chỉ hai người trong trận, mỗi người một góc nhìn | `matchId`, `stake`, `phase` (`waiting`/`ready`/`pick`/`reveal`/`done`/`closed`), `round`, `prize`, `opponent?` (`{ displayName, skin?, level? }`, không có cờ bot), `deadline?`, `picked?` (`{ me, opponent }` chỉ là đã chọn hay chưa), `mine?`, `last?` (`{ mine, opponent, result }` sau khi lật; `null` = không chọn kịp), `result?` (`win`/`lose`/`draw`/`void`), `net?`, `coins?`, `rematch?` |
| `lotto.tickets` | gửi riêng người mua (và khi vào lại giữa ván) | `roundId`, `tickets` (≤ 2 `{ no, rows }`, 3 hàng × 9 ô, 0 = trống, mỗi hàng 5 số), `autoMark`, `coins?`, `requestId?` |
| `game.mine` | cược của chính mình trong ván (sau mỗi lần đặt được, và khi vào lại giữa ván) | `epoch`, `roundId`, `mine` (`{ linh vật: xu }`), `coins?` (số dư ví), `requestId?` |
| `game.payout` | kết quả của chính mình sau khi lắc (chỉ người có cược) | `epoch`, `roundId`, `staked`, `payout`, `net` (= payout − staked), `coins` |
| `pong` | đo giờ server và độ trễ | `epoch`, `sentAt`, `serverTime` |
| `protocol.error` | lỗi có mã ổn định | `epoch`, `code`, `message`, `requestId?` |

## Tương thích

- Thêm type mới hoặc trường tùy chọn được phép trong cùng major; client cũ bỏ qua type chưa biết.
- `chat.message`, `offering`, `prayer.received` có thêm `displayName?` (tùy chọn) và `room.count` là type mới: client cũ vẫn chạy, nhưng ở phòng đông sẽ thấy tên mặc định cho người ngoài tầm nhìn và chỉ đếm người mình thấy.
- Đổi ý nghĩa, xóa trường hoặc biến trường tùy chọn thành bắt buộc phải tăng major version.
- Parser v3 từ chối envelope có `v` khác `3`.
- `resumeToken` là trường tùy chọn để client mới giữ participant và ghế trong 60 giây khi mất kết nối; client cũ có thể bỏ qua.
- `resumeToken` có chữ ký (tối đa 512 ký tự) nên máy realtime nào cũng xác minh được; client không cần hiểu nội dung.

## Kết nối và chuyển máy

- Kết nối WebSocket: `/ws?ticket=…` lần đầu, `/ws?resumeToken=…` khi nối lại.
- Mỗi phòng do một máy realtime giữ. Trước khi nối lại, client gọi `GET /api/v1/rooms/{roomId}/locate` để lấy `realtimeUrl` hiện tại.
- Máy không giữ phòng từ chối nâng cấp WebSocket (HTTP 409); client hỏi lại `locate` rồi thử lại với backoff + jitter.
- Mã đóng `4002`: phòng đã chuyển máy (mất lease hoặc máy đang rút). Client nối lại qua `locate` bằng `resumeToken`.
- Mã đóng `4001`: cùng participant vừa kết nối ở phiên khác.
- Mã đóng `4003` (kèm `protocol.error` mã `SESSION_REPLACED`): cùng tài khoản vừa vào phòng từ trình duyệt / máy khác (vé khác). Mỗi tài khoản chỉ là một người trong phòng; phiên cũ bị bỏ khỏi phòng ngay (kể cả bản đang chờ nối lại) và client phải thôi tự nối lại. Khách (không tài khoản) không bị gộp.
- Mã đóng `4004` (kèm `protocol.error` mã `BANNED`): tài khoản / IP đang bị khóa (kiểm duyệt). Client thôi tự nối lại và hiện `message`; xin vé lúc này bị API trả `403 {error: 'banned', message}`.
- Kiểm duyệt chat (`chat.send`, lời nguyện của `offering.send`) trả `protocol.error`: `CHAT_BLOCKED` (có từ cấm, tin không phát), `CHAT_MUTED` (đang tắt chat; server cũng gửi mã này không kèm `requestId` lúc vừa bị tắt), `CHAT_PROMO` (khách / tài khoản mới gửi link, số điện thoại, lời mời sang app khác), `CHAT_REPEAT` (gửi lặp cùng nội dung quá 2 lần / 30 giây). Không đổi schema: `code` là chuỗi tự do, `message` là câu tiếng Việt hiện thẳng cho người dùng.
- Vé thành viên có thể mang `fresh: true` (tài khoản tạo chưa tới 24 giờ) để máy realtime dò nick clone.
- `epoch` tăng mỗi lần phòng đổi máy giữ; message mang epoch cũ hơn epoch đang biết có thể bỏ qua.
- Resume token đúng chữ ký nhưng chỗ đã hết hạn: server nhận kết nối, gửi `protocol.error` mã `INVALID_RESUME_TOKEN` rồi đóng `1008`; client bỏ resume token và xin vé mới.
- Kết nối không gửi `hello` trong 10 giây bị đóng `1008`.

## Mã lỗi rate limit

- `RATE_LIMITED`: người gửi vượt giới hạn của mình (giữ nguyên khi nối lại).
- `ROOM_BUSY`: cả phòng vượt trần chat (30 tin/giây); thử lại sau giây lát.

## Phát video

- Server kiểm tra video bằng oEmbed của YouTube: cấm nhúng → `VIDEO_NOT_EMBEDDABLE`, không có → `VIDEO_NOT_FOUND`. Lỗi mạng thì vẫn nhận (tên trống).
- Vị trí phát = (giờ server − `startedAt`) / 1000 giây. Client đo lệch giờ bằng `ping`/`pong` và tự sửa: lệch < 0,5 s bỏ qua, 0,5–2 s đổi tốc độ, > 2 s tua. Livestream không tua.
- `duration` lấy trung vị cao của các báo cáo `playback.report` (bỏ qua giá trị < 3 giây); server tự chuyển bài khi hết thời lượng + 3 giây. Báo `ended` sớm hơn thời lượng − 5 giây bị bỏ qua.
- Vote bỏ qua và báo lỗi phát cùng ngưỡng: `votesNeeded = max(1, ceil(số người đang kết nối × 35%))`.
