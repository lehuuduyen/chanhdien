# Mô hình nhân vật gốc (chưa nén)

Bản gốc nặng (Meshy AI, ~50 MB) không đưa lên web. `build-chibi.py` (Blender) quay mặt về −z, đưa về cao 1.1,
giảm còn ~10k tam giác, trải UV mới rồi bake màu từ bản gốc, tách thân trên / đùi / cẳng chân (mô hình không có khung xương) và chỉ giữ texture màu;
sau đó nén bằng `gltf-transform optimize` (lệnh ở đầu script). Bản nén: `apps/web/public/models/characters/`.

| Hình | Gốc | Bản nén |
| --- | --- | --- |
| Nữ (`woman`) | `nhanvat/chibigirl.glb` | `chibi-girl.glb` (~310 KB, 10k tam giác) |
