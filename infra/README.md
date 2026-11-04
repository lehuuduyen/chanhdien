# Infrastructure

Thư mục dành cho Docker, routing HTTP/WebSocket, Redis, Postgres, giám sát và quy trình deploy rút máy từ từ.

## Dev

`docker-compose.dev.yml` chạy Redis cho danh bạ phòng (lease, epoch, snapshot, danh sách máy realtime):

```bash
docker compose -f infra/docker-compose.dev.yml up -d redis
npm run dev:cluster   # web, API, realtime rt-1 (:4001), rt-2 (:4002) dùng REDIS_URL
```

Biến môi trường: `REDIS_URL`, `REDIS_PREFIX` (mặc định `cdo:`), `NODE_ID`, `REALTIME_PUBLIC_URL`, `SESSION_SECRET` (dùng chung cho API và mọi máy realtime).
