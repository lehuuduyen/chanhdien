# @chanh-dien/moderation

Hàm thuần lọc chữ người dùng gõ (chat, lời nguyện, tên hiển thị, sớ): không I/O, dùng chung cho API và máy realtime
(import bằng đường dẫn tương đối như `packages/prayer-slip`).

- `checkText(text, list)` → `{ action: 'ok' | 'suspect' | 'block', words, suspects, masked }`. `masked` che từ vi phạm, chỉ
  giữ chữ đầu (`đ** m*`) — dùng cho tin Telegram / trang admin.
- `createWordList({ block, allow })`: danh sách mặc định + từ quản trị thêm (`/blockchattu`) − từ quản trị bỏ.
- Mục từ có dấu chỉ so với chữ có dấu; không dấu chỉ khớp chữ gõ không dấu (đ coi như d); đuôi `*` khớp tiền tố; chữ viết
  lách (`c4c`, `đ.m`, `đ m`, `lồnnn`) so bản bỏ dấu với mọi mục.
- `createCloneWatch()`: ≥ 3 người gửi cùng nội dung trong 2 phút, ≥ 2 người mới không phải người gửi đầu → trả những người
  mới đó. Câu niệm Phật / chào hỏi quen thuộc và tin ngắn không tính.
- `requestIp`, `isPublicIp`, `ipHash`: IP từ `X-Real-IP` / cuối `X-Forwarded-For`; chỉ lưu bản băm; IP nội bộ không khóa.

Test: `node --test packages/moderation/test/*.test.mjs`.
