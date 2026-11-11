# Production: Cloudflare + một VPS

Kiến trúc triển khai:

```text
Người dùng ──► Cloudflare ──► lotusgather.online ──► Nginx ─┬─ web :3000
                                                                ├─ API :4000
                                                                └─ /ws :4001
                                       rt1.lotusgather.online ──► realtime :4001
                                       rt2.lotusgather.online ──► realtime :4002
                                                    Redis ── lease/epoch/snapshot
```

Không dùng Vercel. Web, API và hai tiến trình realtime cùng chạy trên VPS; Cloudflare cung cấp DNS, CDN, WAF và
chống DDoS. Hai realtime node trên cùng VPS giúp cập nhật lần lượt không ngắt toàn bộ phòng, nhưng không bảo vệ
được khi cả VPS chết. Muốn chịu lỗi máy vật lý cần thêm VPS thứ hai.

## 1. DNS và Cloudflare

Tạo các record sau, đều bật **Proxied** (mây cam):

| Type | Name | Target |
| --- | --- | --- |
| `A` | `@` | IP VPS |
| `CNAME` | `www` | `lotusgather.online` |
| `A` | `rt1` | IP VPS |
| `A` | `rt2` | IP VPS |

Trong **Network**, bật WebSockets. Không tạo redirect từ domain gốc sang `play`; trang chạy thẳng tại
`https://lotusgather.online`. Nginx chuyển `www` về domain gốc.

Cloudflare mặc định cache các loại file tĩnh quen thuộc. Nginx đặt cache trình duyệt 5 phút và cache CDN một giờ
cho JS, CSS, ảnh, model GLB và audio; `/api/*` không cache. Không dùng Cache Everything cho toàn site vì có tài
khoản và nội dung động.

Lưu ý: "Browser Cache TTL" mặc định của Cloudflare (4 giờ) ghi đè 5 phút của Nginx, nên trình duyệt có thể giữ
`chanh-dien.js` cũ tới 4 giờ sau deploy. Web server đã gắn `?v=<hash>` cho mọi script / stylesheet / module trong
trang HTML (trang HTML luôn `no-cache`), nên bản mới có hiệu lực ngay khi người dùng tải lại trang. Giữ
**Caching → Configuration → Cache Level** ở Standard (cache theo cả query string). Muốn ảnh / model đổi cũng có hiệu
lực ngay thì đặt Browser Cache TTL = "Respect Existing Headers".

## 2. Chuẩn bị VPS lần đầu

Yêu cầu Ubuntu, Node.js ≥ 22.13, Redis, Nginx, Certbot, `sqlite3`, `curl` và `tar`. Tạo hai user riêng:

```bash
sudo useradd --system --home /opt/lotusgather --shell /usr/sbin/nologin lotusgather
sudo adduser deploy
sudo install -d -o lotusgather -g lotusgather /opt/lotusgather/releases /var/lib/lotusgather
sudo install -d -m 0750 -o lotusgather -g lotusgather /var/backups/lotusgather
sudo install -d -m 0750 -o root -g lotusgather /etc/lotusgather
sudo install -d -m 0755 /etc/nginx/snippets
```

Chép cấu hình từ repo:

```bash
sudo install -m 0755 infra/production/deploy.sh /usr/local/sbin/lotusgather-deploy
sudo install -m 0644 infra/production/systemd/lotusgather-web.service /etc/systemd/system/
sudo install -m 0644 infra/production/systemd/lotusgather-api.service /etc/systemd/system/
sudo install -m 0644 infra/production/systemd/lotusgather-realtime@.service /etc/systemd/system/
sudo install -m 0644 infra/production/cloudflare-realip.conf /etc/nginx/snippets/cloudflare-realip.conf
sudo install -m 0644 infra/production/nginx-lotusgather.conf /etc/nginx/conf.d/lotusgather.conf
sudo install -m 0644 infra/production/deploy.conf.example /etc/lotusgather/deploy.conf
sudo install -m 0600 infra/production/common.env.example /etc/lotusgather/common.env
sudo install -m 0600 infra/production/realtime-1.env.example /etc/lotusgather/realtime-1.env
sudo install -m 0600 infra/production/realtime-2.env.example /etc/lotusgather/realtime-2.env
```

Thay toàn bộ secret mẫu trong `/etc/lotusgather/*.env`. `SESSION_SECRET` phải giống nhau ở API và mọi realtime
node; tạo ít nhất 32 byte bằng `openssl rand -base64 48`. Không đưa file thật trở lại Git.

Danh sách IP Cloudflare trong `cloudflare-realip.conf` phải được đối chiếu với
`https://www.cloudflare.com/ips/` trước lần cài và định kỳ sau đó. Cấu hình này giúp rate limit theo IP người dùng,
không gom tất cả người dùng vào IP Cloudflare.

Cho user `deploy` chỉ được chạy script phát hành:

```text
# /etc/sudoers.d/lotusgather-deploy
deploy ALL=(root) NOPASSWD: /usr/local/sbin/lotusgather-deploy *
```

Sau khi DNS đã trỏ tới VPS, kiểm tra Nginx rồi cấp TLS:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d lotusgather.online -d www.lotusgather.online -d rt1.lotusgather.online -d rt2.lotusgather.online
sudo systemctl daemon-reload
sudo systemctl enable redis-server nginx lotusgather-web lotusgather-api lotusgather-realtime@1 lotusgather-realtime@2
```

Firewall chỉ mở SSH, HTTP và HTTPS. Các cổng 3000, 4000, 4001, 4002 bind `127.0.0.1`, không mở ra Internet.
Sau khi TLS hoạt động, đặt Cloudflare SSL/TLS thành **Full (strict)**. Nên giới hạn HTTP/HTTPS tại firewall chỉ từ
dải IP Cloudflare để không ai đi vòng qua WAF; giữ SSH chỉ cho IP quản trị.

## 3. GitHub Environment và secrets

Trong GitHub repo, vào **Settings → Environments → New environment**, tạo `production`, bật **Required reviewers**,
rồi thêm các secret:

| Secret | Nội dung |
| --- | --- |
| `VPS_HOST` | IP hoặc hostname dùng để SSH vào VPS |
| `VPS_PORT` | Cổng SSH, thường là `22` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Private key riêng cho GitHub Actions |
| `VPS_KNOWN_HOSTS` | Dòng `known_hosts` đã tự xác minh fingerprint của VPS |

Tạo key deploy riêng trên máy quản trị, không dùng private key cá nhân:

```bash
ssh-keygen -t ed25519 -C github-lotusgather-deploy -f ./lotusgather_deploy
ssh-copy-id -i ./lotusgather_deploy.pub -p 22 deploy@IP_VPS
ssh-keyscan -H -p 22 IP_VPS
```

Đối chiếu fingerprint qua console nhà cung cấp VPS trước khi lưu kết quả `ssh-keyscan` vào `VPS_KNOWN_HOSTS`.
Đưa nội dung file `lotusgather_deploy` vào `VPS_SSH_KEY`, sau đó xóa bản private key tạm trên máy quản trị khi đã
lưu an toàn.

## 4. Luồng CI/CD

Mỗi pull request và mỗi push vào `main`, workflow `CI` chạy:

1. `npm ci` trên Node 22 và 24.
2. lint, 180+ test và build web tĩnh để bắt thiếu asset.
3. `npm audit --omit=dev --audit-level=high`.

Chỉ khi CI của `main` xanh, workflow `Deploy production` mới:

1. Đóng gói đúng các file Git đang theo dõi của commit vừa kiểm tra.
2. SCP gói release vào `/tmp` trên VPS bằng key riêng.
3. Cài dependency production dưới user `lotusgather`, backup SQLite và đổi symlink `current`.
4. Restart API rồi web, kiểm tra health.
5. Restart từng realtime node; trước mỗi node phải còn một node khác khỏe để nhận lại phòng.
6. Khi mọi dịch vụ đã khỏe: xóa release cũ trong `/opt/lotusgather/releases`, giữ `KEEP_RELEASES` bản deploy gần
   nhất (mặc định 5, tính cả bản đang chạy) và luôn giữ bản vừa bị thay để rollback. Mỗi release ~145 MB
   (`node_modules`), 4–5 lần deploy mỗi ngày nên không dọn thì đầy đĩa sau vài tuần. Thư mục staging bỏ dở quá 1 giờ
   cũng bị xóa; lỗi khi dọn không làm hỏng lần deploy.
7. Kiểm tra domain gốc, API và cả hai realtime endpoint từ bên ngoài.

Workflow `CI` có job `deploy-script` chạy `bash -n` + `shellcheck` cho `deploy.sh` (script chạy bằng root), nên script
lỗi thì không deploy.

### Cập nhật script deploy trên VPS

GitHub Actions gọi bản đã cài ở `/usr/local/sbin/lotusgather-deploy` (chủ root), không phải file trong release, nên
sửa `infra/production/deploy.sh` trong repo **chưa có tác dụng** cho tới khi quản trị cài lại bằng tay. Cố ý không
cho script tự cập nhật từ release: như vậy ai push được vào `main` cũng có quyền root trên VPS. Sau khi commit có
script mới đã deploy xong:

```bash
sudo install -m 0755 /opt/lotusgather/current/infra/production/deploy.sh /usr/local/sbin/lotusgather-deploy
sudo lotusgather-deploy prune --dry-run   # xem trước những release sẽ bị xóa
sudo lotusgather-deploy prune             # dọn ngay, không cần chờ lần deploy sau
```

`lotusgather-deploy prune` chỉ dọn (giữ bản đang chạy + `KEEP_RELEASES` bản gần nhất), không đụng tới dịch vụ hay
database. Muốn giữ nhiều / ít hơn thì thêm `KEEP_RELEASES=<số ≥ 2>` vào `/etc/lotusgather/deploy.conf`. Backup
SQLite ở `/var/backups/lotusgather/app-<commit>.db` (mỗi lần deploy một file) chưa được dọn tự động; xem dung lượng
bằng `sudo du -sh /var/backups/lotusgather`.

Script hiện dùng graceful SIGTERM: realtime chờ ván đang lắc / chốt tiền xong, ghi snapshot (gồm cả ván Lô Tô /
Bầu Cua / Tài Xỉu đang chơi), trả lease và client nối lại với jitter; máy nhận phòng chơi tiếp đúng ván đó. Kế hoạch
`addbot` được ghi vào `DATA_DIR/realtime-<NODE_ID>.json` và áp dụng lại khi node bật. Đây là rolling failover,
chưa phải drain chờ đúng 0 phòng; có thể có một lần reconnect ngắn khi node được cập nhật.

## 5. Phát hành lần đầu và rollback

Lần đầu chưa có `/opt/lotusgather/current`, hãy hoàn tất DNS, TLS, env và systemd trước rồi chạy workflow thủ công
từ tab **Actions → Deploy production → Run workflow**. Production thật chỉ nên chạy từ `main` đã được review.

Kiểm tra sau deploy:

```bash
curl -fsS https://lotusgather.online/
curl -fsS https://lotusgather.online/api/v1/meta
curl -fsS https://rt1.lotusgather.online/health
curl -fsS https://rt2.lotusgather.online/health
```

Nếu health check trong lúc deploy lỗi và đã có release cũ, script tự đổi symlink về release trước rồi restart dịch
vụ. Rollback thủ công cũng thực hiện bằng cách trỏ `/opt/lotusgather/current` về release cũ, sau đó restart API,
web và lần lượt từng realtime node. Không xóa release hoặc database trong lúc xử lý sự cố. Script chỉ giữ
`KEEP_RELEASES` bản gần nhất trên đĩa; cần quay về bản cũ hơn thì chạy lại workflow **Deploy production** với commit
đó (Run workflow trên `main` sau khi revert) thay vì trỏ symlink tay.
