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

Tài khoản và Vườn Công Đức (ví xu ảo, kho, luống) lưu ở `.data/app.db` (đổi bằng `DATA_DIR`); ngày tưới vườn theo `GARDEN_TIMEZONE` (mặc định `America/Los_Angeles`). Bật đăng nhập Google: đặt `GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com` trước khi chạy (origin của trang phải nằm trong "Authorized JavaScript origins" của client đó).

Trang Ủng hộ (`/ung-ho.html`, quyên góp tự nguyện duy trì server, không đổi ra xu): đặt `DONATE_ZELLE_NAME`, `DONATE_ZELLE_HANDLE` (email/số điện thoại Zelle) và tùy chọn `DONATE_MEMO`, `DONATE_MONTHLY_GOAL`, `DONATE_MONTH_RAISED` (USD, số nguyên, cập nhật tay), `DONATE_CONTACT` trước khi chạy API. Không ghi các giá trị này vào repo; chưa đặt thì trang hiện "đang cập nhật".

Báo phiếu Góp ý & Báo lỗi qua Telegram: đặt `TELEGRAM_BOT_TOKEN` (tạo bot với @BotFather) và `TELEGRAM_CHAT_ID`; tùy chọn `SUPPORT_ADMIN_URL` (link trang admin kèm trong tin). `npm run telegram:setup` kiểm tra bot, tìm chat ID (`-- --save` ghi vào `.env.online`) và gửi tin thử (`-- --test`). `npm run online` tự nạp các dòng `KEY=VALUE` trong `.env.online` (gitignore), biến đặt trên dòng lệnh được ưu tiên.

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
