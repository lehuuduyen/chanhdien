// Lời nói của bot do AI viết (Groq, gói miễn phí, API kiểu OpenAI). AI chỉ viết câu; khi nào bot bắt chuyện, khiêu
// chiến hay mời sang phòng game do Room quyết định. Không có khóa, hết hạn mức, lỗi mạng, hoặc câu AI viết bị bộ lọc
// chặn / có link thì dùng câu mẫu bên dưới, nên bot vẫn nói được khi không có AI.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Qwen viết tiếng Việt tự nhiên hơn gpt-oss; tắt phần suy nghĩ để mỗi câu chỉ tốn ~100 token (hạn mức token/phút).
export const BOT_AI_MODEL = 'qwen/qwen3.8-27b';
const LINE_MAX = 200;
const LANG_NAMES = { vi: 'tiếng Việt', en: 'English', zh: '中文', es: 'español' };
const GAME_NAMES = {
  vi: { loto: 'Lô Tô', 'tai-xiu': 'Tài Xỉu', 'bau-cua': 'Bầu Cua' },
  en: { loto: 'Lô Tô bingo', 'tai-xiu': 'Tài Xỉu dice', 'bau-cua': 'Bầu Cua dice' },
  zh: { loto: '樂透賓果', 'tai-xiu': '大小骰', 'bau-cua': '魚蝦蟹' },
  es: { loto: 'Lô Tô (bingo)', 'tai-xiu': 'Tài Xỉu (dados)', 'bau-cua': 'Bầu Cua (dados)' },
};

// Câu mẫu: {name} tên người được nói tới, {game} tên phòng game.
const TEMPLATES = {
  vi: {
    greet: ['Chào {name} 🙏 hôm nay bạn đi lễ chùa à?', '{name} ơi, chúc bạn một ngày an lạc nhé 🙏', 'A Di Đà Phật, {name} đi dạo sân chùa với mình không?'],
    challenge: ['{name} ơi, làm một ván oẳn tù tì cho vui không? ✊✋✌️', 'Chào {name} 🙏 mình thách bạn một ván kéo búa bao nè!', '{name} chơi oẳn tù tì với mình một ván nhé, ai thua thì niệm Phật 3 câu 😄'],
    invite: ['{name} ơi, qua phòng {game} chơi với mọi người không? Xu ảo thôi, cho vui 🎲', 'Bên {game} đang thiếu người, {name} vào chơi cùng mình nhé!', 'Chào {name} 🙏 rảnh thì sang {game} làm một ván cho vui nha'],
    reply: ['Dạ, mình nghe rồi nè {name} 🙏', 'A Di Đà Phật, cảm ơn {name} đã hỏi thăm 🙏', 'Hay quá {name}, chúc bạn tu tập tinh tấn nhé!'],
  },
  en: {
    greet: ['Hi {name} 🙏 visiting the temple today?', 'Wishing you a peaceful day, {name} 🙏', 'Namo Amitabha! Care for a walk around the courtyard, {name}?'],
    challenge: ['{name}, fancy a round of rock-paper-scissors? ✊✋✌️', 'Hi {name} 🙏 I challenge you to rock-paper-scissors!', 'One quick game of rock-paper-scissors, {name}? 😄'],
    invite: ['{name}, want to join us at {game}? Just play coins, for fun 🎲', '{game} needs one more player, come join, {name}!', 'Hi {name} 🙏 if you are free, come play a round of {game}'],
    reply: ['I hear you, {name} 🙏', 'Thank you for saying hi, {name} 🙏', 'Lovely, {name}! May your practice go well.'],
  },
  zh: {
    greet: ['{name}你好 🙏 今天來寺院參拜嗎？', '祝{name}今天平安喜樂 🙏', '阿彌陀佛，{name}要一起在院子裡走走嗎？'],
    challenge: ['{name}，來一局剪刀石頭布嗎？✊✋✌️', '{name}你好 🙏 我想跟你猜拳一局！', '{name}，猜拳一局好嗎？😄'],
    invite: ['{name}，要不要來{game}一起玩？只是虛擬幣，好玩而已 🎲', '{game}還差一個人，{name}來一起玩吧！', '{name}你好 🙏 有空來{game}玩一局吧'],
    reply: ['好的，我聽到了，{name} 🙏', '阿彌陀佛，謝謝{name}的問候 🙏', '真好，{name}，祝你精進修行！'],
  },
  es: {
    greet: ['Hola {name} 🙏 ¿visitas el templo hoy?', 'Que tengas un día en paz, {name} 🙏', 'Namo Amitabha, ¿paseamos por el patio, {name}?'],
    challenge: ['{name}, ¿una partida de piedra, papel o tijera? ✊✋✌️', 'Hola {name} 🙏 ¡te reto a piedra, papel o tijera!', '¿Jugamos una ronda rápida, {name}? 😄'],
    invite: ['{name}, ¿vienes a jugar {game}? Solo monedas virtuales, por diversión 🎲', 'En {game} falta un jugador, ¡ven, {name}!', 'Hola {name} 🙏 si tienes tiempo, juega una ronda de {game}'],
    reply: ['Te escucho, {name} 🙏', 'Gracias por saludar, {name} 🙏', '¡Qué bien, {name}! Que tu práctica vaya bien.'],
  },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
export const gameName = (game, lang = 'vi') => (GAME_NAMES[lang] || GAME_NAMES.vi)[game] || game;

// Đoán ngôn ngữ người chơi từ câu họ vừa gõ (cho câu mẫu). Không chắc thì null (dùng ngôn ngữ phòng).
export function guessLang(text) {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return null;
  if (/[\u3400-\u9fff]/.test(value)) return 'zh';
  if (/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/.test(value)) return 'vi';
  if (/[ñ¿¡]|\b(hola|gracias|quieres|jugar|eres|qué|cómo|amigo)\b/.test(value)) return 'es';
  if (/^[\x20-\x7e]+$/.test(value) && /\b(hi|hello|hey|you|are|what|how|play|the|thanks)\b/.test(value)) return 'en';
  return null;
}

export function templateLine(kind, { lang = 'vi', toName = '', game } = {}) {
  const lines = (TEMPLATES[lang] || TEMPLATES.vi)[kind] || TEMPLATES.vi.greet;
  return fill(pick(lines), { name: toName, game: gameName(game, lang) });
}

// Câu AI trả về: bỏ phần suy nghĩ (<think>), ngoặc kép bao ngoài, xuống dòng; cắt độ dài.
export function cleanLine(text) {
  let line = String(text || '').replace(/<think>[\s\S]*?(<\/think>|$)/gi, ' ').replace(/\s+/g, ' ').trim();
  line = line.replace(/^["“”'«»]+|["“”'«»]+$/g, '').trim();
  if (line.length > LINE_MAX) line = `${line.slice(0, LINE_MAX - 1).replace(/\s+\S*$/, '')}…`;
  return line;
}

function instructions(kind, { lang, botName, toName, game, sample }) {
  const rules = [
    `Bạn là "${botName}", một Phật tử ảo (là bot do máy điều khiển, không phải người thật) trong trò chơi Chánh Điện Online: chánh điện chùa và sân chùa 3D, có phòng game Lô Tô, Tài Xỉu, Bầu Cua chơi bằng xu ảo.`,
    'Nói như một bạn đạo hiền hòa, vui vẻ: tối đa 2 câu, dưới 150 ký tự, có thể thêm 1 emoji. Tôn trọng Phật pháp.',
    'Không nói tục, không bàn chính trị, tôn giáo khác hay chuyện người lớn; không hỏi hay hứa tiền, quà, số điện thoại, địa chỉ; không gửi link; không hẹn gặp ngoài đời.',
    'Nếu được hỏi có phải người thật không thì nói thật mình là bot, rồi vẫn trả lời các ý khác của câu hỏi. Có thể kể mình hay tụng kinh, đi dạo, ngồi thiền ở chùa này; không bịa chuyện đời thật.',
    'Câu phải tự nhiên như người Việt nói chuyện hằng ngày, đúng ngữ pháp.',
    // Người chơi gõ ngôn ngữ khác ngôn ngữ phòng (người nước ngoài vào phòng tiếng Việt…): nói theo ngôn ngữ của họ.
    sample
      ? `${toName} vừa viết: "${sample}". BẮT BUỘC viết toàn bộ câu bằng đúng ngôn ngữ của câu đó (tiếng Nhật thì toàn tiếng Nhật…), không trộn ngôn ngữ khác; chỉ khi không rõ mới dùng ${LANG_NAMES[lang] || LANG_NAMES.vi}.`
      : `Viết bằng ${LANG_NAMES[lang] || LANG_NAMES.vi}.`,
    'Chỉ trả về đúng câu nói, không ngoặc kép, không giải thích.',
  ];
  const tasks = {
    greet: `Chào ${toName} (gọi đúng tên này) một câu ngắn, hỏi thăm nhẹ nhàng.`,
    challenge: `Rủ ${toName} chơi một ván oẳn tù tì (kéo búa bao) với mình cho vui.`,
    invite: `Rủ ${toName} sang phòng ${gameName(game, lang)} chơi cùng mọi người (xu ảo, chỉ để vui).`,
    reply: `Trả lời tin nhắn mới nhất của ${toName}. Nếu họ muốn chơi oẳn tù tì hoặc vào phòng game thì vui vẻ đồng ý.`,
  };
  return `${rules.join('\n')}\nViệc cần làm: ${tasks[kind] || tasks.greet}`;
}

// Hạn mức trong bộ nhớ mỗi máy realtime (gói miễn phí Groq ~30 lượt/phút, ~1.000 lượt/ngày mỗi model).
export function createBotAi({
  apiKey = '', model = BOT_AI_MODEL, fetcher = fetch, now = Date.now,
  perMinute = 6, perDay = 300, timeoutMs = 6_000, screen = null,
} = {}) {
  const minute = [];
  let day = { key: '', count: 0 };
  let pausedUntil = 0;
  function take() {
    const at = now();
    if (at < pausedUntil) return false;
    while (minute.length && minute[0] <= at - 60_000) minute.shift();
    const key = new Date(at).toISOString().slice(0, 10);
    if (day.key !== key) day = { key, count: 0 };
    if (minute.length >= perMinute || day.count >= perDay) return false;
    minute.push(at);
    day.count += 1;
    return true;
  }

  async function ask(kind, context) {
    const messages = [{ role: 'system', content: instructions(kind, context) }];
    for (const turn of context.history || []) messages.push({ role: turn.bot ? 'assistant' : 'user', content: turn.text });
    // Bắt chuyện: đưa câu người kia vừa nói với cả phòng làm tin cuối để AI nói theo ngôn ngữ đó.
    if (kind !== 'reply') messages.push({ role: 'user', content: context.sample || `(${context.toName} đang đứng gần bạn ở sân chùa)` });
    const response = await fetcher(GROQ_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.9, max_completion_tokens: 120, reasoning_effort: model.startsWith('qwen/') ? 'none' : 'low' }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 429) {
      const wait = Number(response.headers.get('retry-after'));
      pausedUntil = now() + (Number.isFinite(wait) && wait > 0 ? Math.min(wait, 3_600) * 1_000 : 60_000);
      return null;
    }
    if (!response.ok) return null;
    const data = await response.json();
    return cleanLine(data?.choices?.[0]?.message?.content);
  }

  return {
    enabled: Boolean(apiKey),
    // Một câu cho bot nói. kind: greet | challenge | invite | reply. Không bao giờ ném lỗi.
    async line(kind, context) {
      const fallback = () => templateLine(kind, { ...context, lang: guessLang(context.sample) || context.lang });
      if (!apiKey || !take()) return fallback();
      try {
        const line = await ask(kind, context);
        if (!line || (screen && !screen(line))) return fallback();
        return line;
      } catch {
        return fallback();
      }
    },
    usage: () => ({ minute: minute.length, day: day.count, pausedUntil }),
  };
}
