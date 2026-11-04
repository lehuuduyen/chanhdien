// Bài thầy đọc khi nhận sớ: cầu an (peace) hoặc cầu siêu (memorial), ghép tên từng người trong sớ theo ngôn ngữ
// phòng. Chỉ phát trên máy người dâng sớ (tên, năm sinh trong sớ không gửi cho người khác trong phòng).
// Trả về danh sách câu ngắn: đọc từng câu để trình duyệt không cắt ngang câu dài (Chrome dừng sau ~15 giây).

function personLine(person, kind, lang) {
  const dharma = person.dharmaName;
  if (lang === 'en') {
    return kind === 'peace'
      ? `${person.name}${dharma ? `, Dharma name ${dharma}` : ''}, born in ${person.birthYear}`
      : `the departed ${person.name}${dharma ? `, Dharma name ${dharma}` : ''}`;
  }
  if (lang === 'zh') {
    return kind === 'peace'
      ? `${person.name}${dharma ? `，法名${dharma}` : ''}，${person.birthYear}年生`
      : `往生者${person.name}${dharma ? `，法名${dharma}` : ''}`;
  }
  if (lang === 'es') {
    return kind === 'peace'
      ? `${person.name}${dharma ? `, nombre del Dharma ${dharma}` : ''}, nacido en ${person.birthYear}`
      : `el difunto ${person.name}${dharma ? `, nombre del Dharma ${dharma}` : ''}`;
  }
  return kind === 'peace'
    ? `${person.name}${dharma ? `, pháp danh ${dharma}` : ''}, sinh năm ${person.birthYear}`
    : `hương linh ${person.name}${dharma ? `, pháp danh ${dharma}` : ''}`;
}

const TEXT = {
  vi: {
    peace: (requester) => [
      'Nam mô Bổn Sư Thích Ca Mâu Ni Phật.',
      `Hôm nay, Phật tử ${requester} thành tâm dâng sớ cầu an, nguyện cầu cho:`,
    ],
    peaceEnd: [
      'Nguyện nhờ oai đức Tam Bảo gia hộ cho quý vị thân tâm an lạc, bệnh tật tiêu trừ, tai qua nạn khỏi, gia đạo bình an, mọi sự cát tường như ý.',
      'Nam mô Dược Sư Lưu Ly Quang Vương Phật.',
    ],
    memorial: (requester) => [
      'Nam mô A Di Đà Phật.',
      `Hôm nay, Phật tử ${requester} thành tâm dâng sớ cầu siêu cho:`,
    ],
    memorialEnd: [
      'Nguyện hương linh nương nhờ ánh sáng từ bi của chư Phật, buông bỏ mọi phiền não, siêu sinh về cảnh giới an lành, vãng sanh Cực Lạc quốc.',
      'Nam mô Tiếp Dẫn Đạo Sư A Di Đà Phật.',
    ],
    note: (note) => `Lời khấn nguyện: ${note}.`,
  },
  en: {
    peace: (requester) => ['Namo Shakyamuni Buddha.', `Today, ${requester} sincerely offers a prayer for peace and well-being for:`],
    peaceEnd: [
      'May the Three Jewels protect them, so that body and mind are at peace, illness is healed, misfortune passes, and their families are safe and well.',
      'Namo Medicine Buddha.',
    ],
    memorial: (requester) => ['Namo Amitabha Buddha.', `Today, ${requester} sincerely offers a memorial prayer for:`],
    memorialEnd: [
      'May they rest in the compassionate light of the Buddhas, let go of all suffering, and be reborn in a peaceful realm, the Pure Land.',
      'Namo Amitabha Buddha.',
    ],
    note: (note) => `Prayer: ${note}.`,
  },
  zh: {
    peace: (requester) => ['南無本師釋迦牟尼佛。', `今日，佛弟子${requester}至誠呈上祈福疏，為以下諸位祈求平安：`],
    peaceEnd: ['仰仗三寶加持，願諸位身心安樂，病苦消除，災難遠離，闔家平安，吉祥如意。', '南無消災延壽藥師佛。'],
    memorial: (requester) => ['南無阿彌陀佛。', `今日，佛弟子${requester}至誠呈上超度疏，為以下亡者祈求超生：`],
    memorialEnd: ['願亡者仰承諸佛慈光，放下一切煩惱，超生善道，往生西方極樂世界。', '南無接引導師阿彌陀佛。'],
    note: (note) => `祈願：${note}。`,
  },
  es: {
    peace: (requester) => ['Namo Buda Shakyamuni.', `Hoy, ${requester} ofrece con sinceridad una oración por la paz y la salud de:`],
    peaceEnd: [
      'Que las Tres Joyas los protejan, que su cuerpo y su mente estén en paz, que sanen sus enfermedades, que pasen las desgracias y que sus familias vivan en armonía.',
      'Namo Buda de la Medicina.',
    ],
    memorial: (requester) => ['Namo Buda Amitabha.', `Hoy, ${requester} ofrece con sinceridad una oración por el difunto:`],
    memorialEnd: [
      'Que descansen en la luz compasiva de los Budas, se liberen de todo sufrimiento y renazcan en un reino de paz, la Tierra Pura.',
      'Namo Buda Amitabha.',
    ],
    note: (note) => `Oración: ${note}.`,
  },
};

export function buildRecitation({ kind, lang, requester, people, note }) {
  const text = TEXT[lang] || TEXT.vi;
  const sentences = [...(kind === 'memorial' ? text.memorial(requester) : text.peace(requester))];
  for (const person of people) sentences.push(`${personLine(person, kind, lang)}.`);
  if (note) sentences.push(text.note(note.replace(/[.。]+$/, '')));
  sentences.push(...(kind === 'memorial' ? text.memorialEnd : text.peaceEnd));
  return sentences;
}
