// Nhãn chữ dùng chung cho các cảnh 3D (chánh điện, rạp phim): tên, bong bóng chat vẽ lên canvas rồi làm sprite.
import * as THREE from 'three';

export function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

// Nhãn chữ (tên, bong bóng) vẽ lên canvas rồi làm sprite; cỡ theo mét để to nhỏ đúng phối cảnh.
export function textSprite(text, { background, color, height = 0.16, bold = false, tail = false }) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 44;
  const font = `${bold ? 700 : 500} ${fontSize}px system-ui, sans-serif`;
  ctx.font = font;
  const padding = 22;
  const width = Math.min(900, Math.ceil(ctx.measureText(text).width) + padding * 2);
  const boxHeight = fontSize + 26;
  canvas.width = width;
  canvas.height = boxHeight + (tail ? 18 : 0);
  ctx.font = font;
  ctx.fillStyle = background;
  roundRect(ctx, 0, 0, width, boxHeight, boxHeight / 2);
  ctx.fill();
  if (tail) {
    ctx.beginPath();
    ctx.moveTo(width / 2 - 14, boxHeight - 1);
    ctx.lineTo(width / 2 + 14, boxHeight - 1);
    ctx.lineTo(width / 2, canvas.height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, boxHeight / 2 + 2, width - padding);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  const worldHeight = height * (canvas.height / boxHeight);
  sprite.scale.set(worldHeight * (canvas.width / canvas.height), worldHeight, 1);
  sprite.center.set(0.5, 0);
  return sprite;
}

export function disposeSprite(sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
