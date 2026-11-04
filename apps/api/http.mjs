// Tiện ích HTTP dùng chung của API: CORS cho dev local, trả JSON, đọc body có giới hạn.
const BODY_LIMIT = 16 * 1_024;
const LOCAL_ORIGINS = new Set(['http://127.0.0.1:3000', 'http://localhost:3000']);

export function corsHeaders(req) {
  const origin = req.headers?.origin;
  return origin && LOCAL_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

export function json(req, res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders(req),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

export async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error('BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('INVALID_JSON');
  }
}
