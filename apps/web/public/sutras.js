// Kinh văn cho chức năng tụng kinh (giọng đọc trên máy người tụng, mõ gõ theo nhịp).
//
// QUAN TRỌNG: kinh văn phải đúng từng chữ. Ở đây chỉ đưa trọn những bài ngắn, phổ biến, phiên âm Hán Việt và
// nguyên văn chữ Hán là văn bản cổ (Bát Nhã Tâm Kinh, câu niệm Phật). Các kinh dài (A Di Đà, Phổ Môn, Dược Sư,
// Vu Lan) mới có khung: kệ khai kinh, tên kinh, câu niệm/thần chú ngắn quen dùng, hồi hướng. Nhà chùa dán toàn văn
// bản chuẩn (bản được phép dùng) vào mảng `body` của từng kinh: mỗi phần tử là một câu hoặc một đoạn ngắn.
//
// Mỗi bài: { id, title: { vi, en, zh, es }, repeat?, body: { vi, zh } }. Ngôn ngữ khác (en, es) chưa có bản dịch
// được phép dùng thì tụng phần Hán Việt / tiếng Phạn quen thuộc (`fallback`).

const OPEN_VI = [
  'Khai kinh kệ.',
  'Vô thượng thậm thâm vi diệu pháp, Bách thiên vạn kiếp nan tao ngộ, Ngã kim kiến văn đắc thọ trì, Nguyện giải Như Lai chân thật nghĩa.',
];
const OPEN_ZH = ['開經偈。', '無上甚深微妙法，百千萬劫難遭遇，我今見聞得受持，願解如來真實義。'];
const CLOSE_VI = ['Nguyện đem công đức này, hướng về khắp tất cả, đệ tử và chúng sanh, đều trọn thành Phật đạo.'];
const CLOSE_ZH = ['願以此功德，普及於一切，我等與眾生，皆共成佛道。'];

export const SUTRAS = [
  {
    id: 'niem-phat',
    title: { vi: 'Niệm A Di Đà Phật', en: 'Recite Amitabha Buddha', zh: '念阿彌陀佛', es: 'Recitar a Buda Amitabha' },
    // Niệm liên tục cho tới khi bấm Đứng hoặc đi.
    repeat: true,
    body: { vi: ['Nam mô A Di Đà Phật.'], zh: ['南無阿彌陀佛。'] },
    fallback: ['Namo Amitabha Buddha.'],
  },
  {
    id: 'a-di-da',
    title: { vi: 'Kinh A Di Đà', en: 'Amitabha Sutra', zh: '阿彌陀經', es: 'Sutra de Amitabha' },
    body: {
      vi: [
        ...OPEN_VI,
        'Phật thuyết A Di Đà Kinh.',
        // TODO(nhà chùa): dán toàn văn Kinh A Di Đà (bản chuẩn) vào đây, mỗi câu một phần tử.
        'Vãng sanh Tịnh độ thần chú.',
        'Nam mô a di đa bà dạ, đa tha già đa dạ, đa điệt dạ tha, a di rị đô bà tỳ, a di rị đa tất đam bà tỳ, a di rị đa tỳ ca lan đế, a di rị đa tỳ ca lan đa, già di nị, già già na, chỉ đa ca lệ, ta bà ha.',
        'Nam mô A Di Đà Phật.',
        ...CLOSE_VI,
      ],
      zh: [...OPEN_ZH, '佛說阿彌陀經。', '南無阿彌陀佛。', ...CLOSE_ZH],
    },
    fallback: ['Namo Amitabha Buddha.'],
  },
  {
    id: 'pho-mon',
    title: { vi: 'Kinh Phổ Môn', en: 'Universal Gate Sutra', zh: '普門品', es: 'Sutra de la Puerta Universal' },
    body: {
      vi: [
        ...OPEN_VI,
        'Diệu Pháp Liên Hoa Kinh, Quán Thế Âm Bồ Tát Phổ Môn phẩm.',
        // TODO(nhà chùa): dán toàn văn phẩm Phổ Môn (bản chuẩn) vào đây.
        'Nam mô Đại Từ Đại Bi Tầm Thanh Cứu Khổ Cứu Nạn Linh Cảm Quán Thế Âm Bồ Tát.',
        ...CLOSE_VI,
      ],
      zh: [...OPEN_ZH, '妙法蓮華經觀世音菩薩普門品。', '南無大慈大悲救苦救難廣大靈感觀世音菩薩。', ...CLOSE_ZH],
    },
    fallback: ['Namo Avalokiteshvara Bodhisattva.'],
  },
  {
    id: 'duoc-su',
    title: { vi: 'Kinh Dược Sư', en: 'Medicine Buddha Sutra', zh: '藥師經', es: 'Sutra del Buda de la Medicina' },
    body: {
      vi: [
        ...OPEN_VI,
        'Dược Sư Lưu Ly Quang Như Lai Bổn Nguyện Công Đức Kinh.',
        // TODO(nhà chùa): dán toàn văn Kinh Dược Sư (bản chuẩn) vào đây.
        'Dược Sư quán đảnh chơn ngôn.',
        'Nam mô bạc già phạt đế, bệ sát xã, lụ lô thích lưu ly, bát lặc bà, hắc ra xà dã, đát tha yết đa da, a ra hắt đế, tam miệu tam bột đà da. Đát điệt tha. Án, bệ sát thệ, bệ sát thệ, bệ sát xã, tam một yết đế tóa ha.',
        'Nam mô Dược Sư Lưu Ly Quang Vương Phật.',
        ...CLOSE_VI,
      ],
      zh: [...OPEN_ZH, '藥師琉璃光如來本願功德經。', '南無藥師琉璃光如來。', ...CLOSE_ZH],
    },
    fallback: ['Namo Medicine Buddha.'],
  },
  {
    id: 'vu-lan',
    title: { vi: 'Kinh Vu Lan Báo Hiếu', en: 'Ullambana Sutra', zh: '盂蘭盆經', es: 'Sutra Ullambana' },
    body: {
      vi: [
        ...OPEN_VI,
        'Phật thuyết Vu Lan Bồn Kinh.',
        // TODO(nhà chùa): dán toàn văn Kinh Vu Lan (bản chuẩn) vào đây.
        'Nam mô Đại Hiếu Mục Kiền Liên Bồ Tát.',
        ...CLOSE_VI,
      ],
      zh: [...OPEN_ZH, '佛說盂蘭盆經。', '南無大孝目犍連菩薩。', ...CLOSE_ZH],
    },
    fallback: ['Namo Maudgalyayana Bodhisattva.'],
  },
  {
    id: 'bat-nha',
    title: { vi: 'Bát Nhã Tâm Kinh', en: 'Heart Sutra', zh: '般若波羅蜜多心經', es: 'Sutra del Corazón' },
    body: {
      vi: [
        ...OPEN_VI,
        'Ma Ha Bát Nhã Ba La Mật Đa Tâm Kinh.',
        'Quán Tự Tại Bồ Tát hành thâm Bát Nhã Ba La Mật Đa thời, chiếu kiến ngũ uẩn giai không, độ nhất thiết khổ ách.',
        'Xá Lợi Tử, sắc bất dị không, không bất dị sắc, sắc tức thị không, không tức thị sắc, thọ tưởng hành thức diệc phục như thị.',
        'Xá Lợi Tử, thị chư pháp không tướng, bất sanh bất diệt, bất cấu bất tịnh, bất tăng bất giảm.',
        'Thị cố không trung vô sắc, vô thọ tưởng hành thức, vô nhãn nhĩ tỷ thiệt thân ý, vô sắc thanh hương vị xúc pháp, vô nhãn giới nãi chí vô ý thức giới.',
        'Vô vô minh diệc vô vô minh tận, nãi chí vô lão tử diệc vô lão tử tận, vô khổ tập diệt đạo, vô trí diệc vô đắc.',
        'Dĩ vô sở đắc cố, Bồ Đề Tát Đõa y Bát Nhã Ba La Mật Đa cố, tâm vô quái ngại, vô quái ngại cố, vô hữu khủng bố, viễn ly điên đảo mộng tưởng, cứu cánh Niết Bàn.',
        'Tam thế chư Phật y Bát Nhã Ba La Mật Đa cố, đắc A Nậu Đa La Tam Miệu Tam Bồ Đề.',
        'Cố tri Bát Nhã Ba La Mật Đa thị đại thần chú, thị đại minh chú, thị vô thượng chú, thị vô đẳng đẳng chú, năng trừ nhất thiết khổ, chân thật bất hư.',
        'Cố thuyết Bát Nhã Ba La Mật Đa chú, tức thuyết chú viết:',
        'Yết đế yết đế, ba la yết đế, ba la tăng yết đế, bồ đề tát bà ha.',
        'Yết đế yết đế, ba la yết đế, ba la tăng yết đế, bồ đề tát bà ha.',
        'Yết đế yết đế, ba la yết đế, ba la tăng yết đế, bồ đề tát bà ha.',
        ...CLOSE_VI,
      ],
      zh: [
        ...OPEN_ZH,
        '般若波羅蜜多心經。',
        '觀自在菩薩，行深般若波羅蜜多時，照見五蘊皆空，度一切苦厄。',
        '舍利子，色不異空，空不異色，色即是空，空即是色，受想行識，亦復如是。',
        '舍利子，是諸法空相，不生不滅，不垢不淨，不增不減。',
        '是故空中無色，無受想行識，無眼耳鼻舌身意，無色聲香味觸法，無眼界，乃至無意識界。',
        '無無明，亦無無明盡，乃至無老死，亦無老死盡，無苦集滅道，無智亦無得。',
        '以無所得故，菩提薩埵，依般若波羅蜜多故，心無罣礙，無罣礙故，無有恐怖，遠離顛倒夢想，究竟涅槃。',
        '三世諸佛，依般若波羅蜜多故，得阿耨多羅三藐三菩提。',
        '故知般若波羅蜜多，是大神咒，是大明咒，是無上咒，是無等等咒，能除一切苦，真實不虛。',
        '故說般若波羅蜜多咒，即說咒曰：',
        '揭諦揭諦，波羅揭諦，波羅僧揭諦，菩提薩婆訶。',
        ...CLOSE_ZH,
      ],
    },
    fallback: ['Gate gate paragate parasamgate bodhi svaha.', 'Gate gate paragate parasamgate bodhi svaha.', 'Gate gate paragate parasamgate bodhi svaha.'],
  },
];

export const sutraById = (id) => SUTRAS.find((item) => item.id === id) || null;

// Câu để tụng theo ngôn ngữ phòng: vi, zh dùng bản riêng; en, es tụng phần Phạn/Hán Việt quen dùng.
export function sutraLines(sutra, lang) {
  return sutra.body[lang] || sutra.fallback || sutra.body.vi;
}

export function sutraTitle(sutra, lang) {
  return sutra.title[lang] || sutra.title.vi;
}
