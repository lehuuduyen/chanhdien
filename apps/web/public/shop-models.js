// Nhân vật admin tải lên (shop-…): đọc danh mục shop rồi nạp mô hình vào engine trước khi dựng người trong cảnh.
// Trả về danh mục (món đang bán) để trang hiện tên / ô chọn hình. Lỗi mạng thì trả rỗng, cảnh dùng hình khối thay thế.
let loaded = null;

// refresh: đọc lại danh mục (admin vừa tải nhân vật mới); mô hình đã nạp thì không tải lại.
export function loadShopCharacters({ refresh = false } = {}) {
  if (refresh) loaded = null;
  loaded ||= (async () => {
    let shop = null;
    try {
      const response = await fetch('/api/v1/shop', { cache: 'no-store' });
      if (response.ok) shop = await response.json();
    } catch {}
    const { loadChibiModels } = await import('/engine/chibi3d.mjs');
    await loadChibiModels(shop?.models || []);
    return shop?.items || [];
  })();
  return loaded;
}
