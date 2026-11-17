// Phước Điền (nông trại riêng, KE_HOACH_NONG_TRAI.md) ở trang chánh điện: thanh nông trại khi đứng trong khu, thẻ ô đất
// (chọn cây, gieo, tưới, nhổ cỏ / bắt sâu, thu hoạch, mở ô), thẻ chuồng gà / chuồng bò (cho ăn, nhặt trứng, vắt sữa, mua
// con, nâng chuồng), bảng chợ (giá hôm nay, hạn mức, bán, dâng, mua cỏ khô, mở rộng). Mọi số liệu do server quyết định;
// mỗi thao tác một Idempotency-Key (mạng lỗi thì gửi lại đúng khóa đó). Khách thấy ruộng mẫu và lời mời đăng nhập.
import { lang, onLangChange } from '/thien-i18n.js';

const ICONS = {
  spinach: '🥬', tomato: '🍅', corn: '🌽', rice: '🌾', carrot: '🥕', grass: '🌿', pumpkin: '🎃', watermelon: '🍉', dragonfruit: '🐉',
  egg: '🥚', milk: '🥛', hay: '🟫', chicken: '🐔', chick: '🐥', cow: '🐄', calf: '🐮',
};
const FEED_ITEMS = ['corn', 'rice', 'grass', 'hay'];
const MINUTE = 60_000;

const DICT = {
  vi: {
    title: 'Phước Điền', level: 'Cấp {n}', marketLeft: 'Chợ còn thu {n} xu', storage: 'Kho {used}/{cap}', market: 'Chợ',
    signIn: 'Đăng nhập để nhận một mảnh Phước Điền của riêng bạn: trồng rau, nuôi gà lấy trứng, nuôi bò lấy sữa, đem ra chợ bán lấy xu.',
    signInButton: 'Đăng nhập', demo: 'Ruộng mẫu',
    plot: 'Ô {n}', empty: 'Đất trống', pickCrop: 'Chọn cây để gieo (trả tiền hạt lúc gieo, đất ẩm sẵn):',
    cropLine: '⏱ {time} · hạt {seed} xu · thu {yield} × {price} xu', feedLine: '⏱ {time} · hạt {seed} xu · thu {yield} làm thức ăn',
    needLevel: 'Cấp {n}', plantOne: 'Gieo {crop}', plantAll: 'Gieo cả {n} ô trống',
    'stage.seed': 'Mới gieo', 'stage.sprout': 'Nảy mầm', 'stage.growing': 'Đang lớn', 'stage.ripe': 'Đã chín',
    ripeIn: 'Chín sau {time}', dryNow: 'Đất khô: tưới để cây lớn tiếp (cây không chết).', dryIn: 'Còn ẩm {time}, sau đó cần tưới để chín.',
    weed: 'Có cỏ', pest: 'Có sâu', issuesHint: 'Để nguyên tới lúc thu thì mỗi thứ bớt 10 % sản lượng.',
    water: 'Tưới nước', waterAll: 'Tưới cả {n} ô khô', tend: 'Nhổ cỏ, bắt sâu', harvest: 'Thu hoạch', harvestAll: 'Thu cả {n} ô chín',
    harvestsLeft: 'Cây lâu năm: còn {n} lứa', locked: 'Chưa mở', openAt: 'Mở ở cấp {level} · {price} xu', expand: 'Mở ô này ({price} xu)',
    expandFirst: 'Mở lần lượt từ ô gần lối: ô {n} trước.',
    coop: 'Chuồng gà', barn: 'Chuồng bò', slots: '{n}/{max} chỗ', hen: 'Gà mái', chick: 'Gà con', cow: 'Bò sữa', calf: 'Bê',
    fullUntil: 'no thêm {time}', hungry: 'đang đói', growsIn: 'ăn no thêm {time} là lớn', nest: 'ổ {n}/{cap}', pail: 'thùng {n}/{cap}',
    feed: 'Cho ăn', foodChicken: 'Ngô / thóc trong kho: {n}', foodCow: 'Cỏ voi / cỏ khô trong kho: {n}',
    collectEggs: 'Nhặt trứng ({n})', milk: 'Vắt sữa ({n})', buyChick: 'Mua gà con · {price} xu', buyCalf: 'Mua bê · {price} xu',
    upgrade: 'Nâng chuồng: {slots} chỗ · cấp {level} · {price} xu', buyHay: 'Mua 4 bó cỏ khô · {price} xu',
    unlockAt: 'Mở ở cấp {n}. Lên cấp bằng gieo, thu, chăm cây.', noAnimals: 'Chưa có con nào.', penHint: 'Con non được ăn no thì lớn, con lớn còn no thì cho trứng / sữa; ổ / thùng đầy thì ngừng. Đói thì ngừng, không chết.',
    marketTitle: 'Chợ Phước Điền', marketNote: 'Hôm nay chợ thu đủ giá {full}/{cap} xu. Vượt hạn mức chợ chỉ trả {over} %. Giá đổi mỗi ngày.',
    stock: 'Kho ({used}/{cap})', emptyStock: 'Kho trống. Thu hoạch, nhặt trứng, vắt sữa rồi đem ra đây bán.', priceToday: '{price} xu/món hôm nay',
    keepFeed: 'Thức ăn cho gà / bò', sell1: 'Bán 1', sellAll: 'Bán hết', offer: 'Dâng 1', more: 'Mở rộng',
    expandRow: 'Mở ô {n}: cấp {level} · {price} xu', storageRow: 'Nâng kho lên {cap}: cấp {level} · {price} xu', maxed: 'Đã tối đa',
    xp: '{xp}/{next} kinh nghiệm', coins: '{n} xu', close: 'Đóng', working: 'Đang làm…',
    'toast.plant': 'Đã gieo {crop} · {n} ô 🌱', 'toast.water': 'Đã tưới {n} ô 💧', 'toast.tend': 'Đã dọn cỏ, bắt sâu 🌿', 'toast.harvest': 'Thu được {items}',
    'toast.feed': 'Đã cho {n} con ăn', 'toast.collect': 'Được {items}', 'toast.sell': 'Bán được {paid} xu', 'toast.over': ' (vượt hạn mức chợ nên phần dư chỉ {over} %)',
    'toast.offer': 'Đã dâng {item} lên Tam Bảo 🙏', 'toast.buyAnimal': 'Đã mua {thing}', 'toast.buy': 'Đã mua {thing}', 'toast.expand': 'Đã mở ô {n}',
    'toast.upgrade': 'Đã nâng cấp', levelUp: '🎉 Lên cấp {n}!',
    'err.LOCKED': 'Chưa đủ cấp', 'err.PLOT_TAKEN': 'Ô đã có cây', 'err.NOT_DRY': 'Đất còn ẩm, chưa cần tưới', 'err.NOTHING_TO_TEND': 'Không có cỏ / sâu',
    'err.NOT_RIPE': 'Chưa chín', 'err.STORAGE_FULL': 'Kho đầy: đem bán hoặc nâng kho', 'err.PEN_FULL': 'Chuồng hết chỗ', 'err.NOT_HUNGRY': 'Chưa đói',
    'err.NO_FOOD': 'Hết thức ăn trong kho', 'err.NOTHING_TO_COLLECT': 'Chưa có gì để lấy', 'err.NOT_ENOUGH': 'Không đủ trong kho', 'err.MAXED': 'Đã tối đa',
    'err.INSUFFICIENT_COINS': 'Không đủ xu', 'err.RATE_LIMITED': 'Chậm lại một chút', 'err.NETWORK': 'Mạng lỗi, thử lại', 'err.GENERIC': 'Chưa làm được, thử lại',
    hours: '{h} giờ {m} phút', minutes: '{m} phút', hoursOnly: '{h} giờ',
    'item.spinach': 'Rau muống', 'item.tomato': 'Cà chua', 'item.corn': 'Ngô', 'item.rice': 'Lúa', 'item.carrot': 'Cà rốt', 'item.grass': 'Cỏ voi',
    'item.pumpkin': 'Bí đỏ', 'item.watermelon': 'Dưa hấu', 'item.dragonfruit': 'Thanh long', 'item.egg': 'Trứng gà', 'item.milk': 'Sữa bò', 'item.hay': 'Cỏ khô',
  },
  en: {
    title: 'My farm', level: 'Level {n}', marketLeft: 'Market buys {n} more', storage: 'Barn {used}/{cap}', market: 'Market',
    signIn: 'Sign in to get your own farm plot: grow vegetables, keep hens for eggs and cows for milk, and sell at the market for coins.',
    signInButton: 'Sign in', demo: 'Sample farm',
    plot: 'Plot {n}', empty: 'Empty soil', pickCrop: 'Pick a crop to sow (seed is paid when sowing, soil starts moist):',
    cropLine: '⏱ {time} · seed {seed} · yields {yield} × {price}', feedLine: '⏱ {time} · seed {seed} · yields {yield} animal feed',
    needLevel: 'Level {n}', plantOne: 'Sow {crop}', plantAll: 'Sow all {n} empty plots',
    'stage.seed': 'Just sown', 'stage.sprout': 'Sprouting', 'stage.growing': 'Growing', 'stage.ripe': 'Ripe',
    ripeIn: 'Ripe in {time}', dryNow: 'Soil is dry: water it so it keeps growing (it will not die).', dryIn: 'Moist for {time}, then needs water to ripen.',
    weed: 'Weeds', pest: 'Pests', issuesHint: 'Left until harvest, each one cuts the yield by 10%.',
    water: 'Water', waterAll: 'Water all {n} dry plots', tend: 'Weed & remove pests', harvest: 'Harvest', harvestAll: 'Harvest all {n} ripe plots',
    harvestsLeft: 'Perennial: {n} harvests left', locked: 'Locked', openAt: 'Opens at level {level} · {price} coins', expand: 'Open this plot ({price} coins)',
    expandFirst: 'Plots open in order: plot {n} first.',
    coop: 'Hen house', barn: 'Cow barn', slots: '{n}/{max} spots', hen: 'Hen', chick: 'Chick', cow: 'Dairy cow', calf: 'Calf',
    fullUntil: 'full for {time}', hungry: 'hungry', growsIn: 'grows up after {time} more well fed', nest: 'nest {n}/{cap}', pail: 'pail {n}/{cap}',
    feed: 'Feed', foodChicken: 'Corn / rice in store: {n}', foodCow: 'Napier grass / hay in store: {n}',
    collectEggs: 'Collect eggs ({n})', milk: 'Milk ({n})', buyChick: 'Buy a chick · {price} coins', buyCalf: 'Buy a calf · {price} coins',
    upgrade: 'Expand: {slots} spots · level {level} · {price} coins', buyHay: 'Buy 4 bales of hay · {price} coins',
    unlockAt: 'Opens at level {n}. Level up by sowing, harvesting and tending.', noAnimals: 'No animals yet.', penHint: 'Young ones grow while fed; grown ones lay eggs / give milk while fed, until the nest / pail is full. Hungry animals just pause.',
    marketTitle: 'Farm market', marketNote: 'Today the market pays full price for {full}/{cap} coins. Beyond that it pays only {over}%. Prices change daily.',
    stock: 'Storage ({used}/{cap})', emptyStock: 'Storage is empty. Harvest, collect eggs or milk, then sell here.', priceToday: '{price} coins each today',
    keepFeed: 'Feed for hens / cows', sell1: 'Sell 1', sellAll: 'Sell all', offer: 'Offer 1', more: 'Expand',
    expandRow: 'Open plot {n}: level {level} · {price} coins', storageRow: 'Storage to {cap}: level {level} · {price} coins', maxed: 'Maxed out',
    xp: '{xp}/{next} XP', coins: '{n} coins', close: 'Close', working: 'Working…',
    'toast.plant': 'Sowed {crop} · {n} plots 🌱', 'toast.water': 'Watered {n} plots 💧', 'toast.tend': 'Weeds and pests cleared 🌿', 'toast.harvest': 'Harvested {items}',
    'toast.feed': 'Fed {n} animals', 'toast.collect': 'Got {items}', 'toast.sell': 'Sold for {paid} coins', 'toast.over': ' (over the market limit, extra paid at {over}%)',
    'toast.offer': 'Offered {item} to the Three Jewels 🙏', 'toast.buyAnimal': 'Bought {thing}', 'toast.buy': 'Bought {thing}', 'toast.expand': 'Opened plot {n}',
    'toast.upgrade': 'Upgraded', levelUp: '🎉 Level {n}!',
    'err.LOCKED': 'Level too low', 'err.PLOT_TAKEN': 'Plot already planted', 'err.NOT_DRY': 'Soil is still moist', 'err.NOTHING_TO_TEND': 'No weeds or pests',
    'err.NOT_RIPE': 'Not ripe yet', 'err.STORAGE_FULL': 'Storage full: sell or upgrade', 'err.PEN_FULL': 'No free spot', 'err.NOT_HUNGRY': 'Not hungry',
    'err.NO_FOOD': 'No feed in storage', 'err.NOTHING_TO_COLLECT': 'Nothing to collect yet', 'err.NOT_ENOUGH': 'Not enough in storage', 'err.MAXED': 'Maxed out',
    'err.INSUFFICIENT_COINS': 'Not enough coins', 'err.RATE_LIMITED': 'Slow down a little', 'err.NETWORK': 'Network error, try again', 'err.GENERIC': 'Could not do that, try again',
    hours: '{h} h {m} min', minutes: '{m} min', hoursOnly: '{h} h',
    'item.spinach': 'Water spinach', 'item.tomato': 'Tomato', 'item.corn': 'Corn', 'item.rice': 'Rice', 'item.carrot': 'Carrot', 'item.grass': 'Napier grass',
    'item.pumpkin': 'Pumpkin', 'item.watermelon': 'Watermelon', 'item.dragonfruit': 'Dragon fruit', 'item.egg': 'Egg', 'item.milk': 'Milk', 'item.hay': 'Hay',
  },
  zh: {
    title: '福田農場', level: '{n} 級', marketLeft: '市集還收 {n} 幣', storage: '倉庫 {used}/{cap}', market: '市集',
    signIn: '登入即可擁有自己的一塊福田：種菜、養雞取蛋、養牛取奶，拿到市集賣錢幣。',
    signInButton: '登入', demo: '示範農場',
    plot: '第 {n} 塊', empty: '空地', pickCrop: '選擇要播種的作物（播種時付種子錢，土壤已濕潤）：',
    cropLine: '⏱ {time} · 種子 {seed} · 收 {yield} × {price}', feedLine: '⏱ {time} · 種子 {seed} · 收 {yield} 份飼料',
    needLevel: '{n} 級', plantOne: '播種{crop}', plantAll: '播滿 {n} 塊空地',
    'stage.seed': '剛播種', 'stage.sprout': '發芽', 'stage.growing': '生長中', 'stage.ripe': '成熟',
    ripeIn: '{time} 後成熟', dryNow: '土壤乾了：澆水才會繼續長（不會枯死）。', dryIn: '還濕潤 {time}，之後要澆水才會成熟。',
    weed: '有雜草', pest: '有害蟲', issuesHint: '留到收成時，每種各減產 10%。',
    water: '澆水', waterAll: '澆 {n} 塊乾地', tend: '除草、抓蟲', harvest: '收成', harvestAll: '收 {n} 塊成熟的',
    harvestsLeft: '多年生：還可收 {n} 次', locked: '未開放', openAt: '{level} 級開放 · {price} 幣', expand: '開這塊地（{price} 幣）',
    expandFirst: '依序開地：先開第 {n} 塊。',
    coop: '雞舍', barn: '牛棚', slots: '{n}/{max} 位', hen: '母雞', chick: '小雞', cow: '乳牛', calf: '小牛',
    fullUntil: '還飽 {time}', hungry: '餓了', growsIn: '再吃飽 {time} 就長大', nest: '窩 {n}/{cap}', pail: '桶 {n}/{cap}',
    feed: '餵食', foodChicken: '倉庫玉米 / 稻穀：{n}', foodCow: '倉庫象草 / 乾草：{n}',
    collectEggs: '撿蛋（{n}）', milk: '擠奶（{n}）', buyChick: '買小雞 · {price} 幣', buyCalf: '買小牛 · {price} 幣',
    upgrade: '擴建：{slots} 位 · {level} 級 · {price} 幣', buyHay: '買 4 捆乾草 · {price} 幣',
    unlockAt: '{n} 級開放。播種、收成、照顧作物可升級。', noAnimals: '還沒有動物。', penHint: '幼崽吃飽才會長大；成年的吃飽會下蛋 / 產奶，窩 / 桶滿就停。餓了只是暫停，不會死。',
    marketTitle: '福田市集', marketNote: '今天市集全價收購 {full}/{cap} 幣，超過只付 {over}%。價格每天變動。',
    stock: '倉庫（{used}/{cap}）', emptyStock: '倉庫是空的。收成、撿蛋、擠奶後拿來這裡賣。', priceToday: '今天每份 {price} 幣',
    keepFeed: '雞 / 牛的飼料', sell1: '賣 1', sellAll: '全賣', offer: '供 1', more: '擴建',
    expandRow: '開第 {n} 塊：{level} 級 · {price} 幣', storageRow: '倉庫擴到 {cap}：{level} 級 · {price} 幣', maxed: '已到上限',
    xp: '經驗 {xp}/{next}', coins: '{n} 幣', close: '關閉', working: '處理中…',
    'toast.plant': '已播種{crop} · {n} 塊 🌱', 'toast.water': '已澆 {n} 塊 💧', 'toast.tend': '已除草抓蟲 🌿', 'toast.harvest': '收到 {items}',
    'toast.feed': '已餵 {n} 隻', 'toast.collect': '得到 {items}', 'toast.sell': '賣得 {paid} 幣', 'toast.over': '（超過市集上限，多出部分只付 {over}%）',
    'toast.offer': '已將{item}供養三寶 🙏', 'toast.buyAnimal': '已買{thing}', 'toast.buy': '已買{thing}', 'toast.expand': '已開第 {n} 塊',
    'toast.upgrade': '已升級', levelUp: '🎉 升到 {n} 級！',
    'err.LOCKED': '等級不夠', 'err.PLOT_TAKEN': '這塊已種', 'err.NOT_DRY': '土壤還濕', 'err.NOTHING_TO_TEND': '沒有雜草或害蟲',
    'err.NOT_RIPE': '還沒熟', 'err.STORAGE_FULL': '倉庫滿了：先賣或擴建', 'err.PEN_FULL': '沒有空位', 'err.NOT_HUNGRY': '還不餓',
    'err.NO_FOOD': '倉庫沒有飼料', 'err.NOTHING_TO_COLLECT': '還沒有可收的', 'err.NOT_ENOUGH': '倉庫不夠', 'err.MAXED': '已到上限',
    'err.INSUFFICIENT_COINS': '錢幣不夠', 'err.RATE_LIMITED': '請慢一點', 'err.NETWORK': '網路錯誤，請再試', 'err.GENERIC': '沒有成功，請再試',
    hours: '{h} 小時 {m} 分', minutes: '{m} 分', hoursOnly: '{h} 小時',
    'item.spinach': '空心菜', 'item.tomato': '番茄', 'item.corn': '玉米', 'item.rice': '稻穀', 'item.carrot': '紅蘿蔔', 'item.grass': '象草',
    'item.pumpkin': '南瓜', 'item.watermelon': '西瓜', 'item.dragonfruit': '火龍果', 'item.egg': '雞蛋', 'item.milk': '牛奶', 'item.hay': '乾草',
  },
  es: {
    title: 'Mi granja', level: 'Nivel {n}', marketLeft: 'El mercado compra {n} más', storage: 'Granero {used}/{cap}', market: 'Mercado',
    signIn: 'Inicia sesión para tener tu propia parcela: cultiva verduras, cría gallinas para huevos y vacas para leche, y vende en el mercado por monedas.',
    signInButton: 'Iniciar sesión', demo: 'Granja de ejemplo',
    plot: 'Parcela {n}', empty: 'Tierra vacía', pickCrop: 'Elige qué sembrar (la semilla se paga al sembrar, la tierra empieza húmeda):',
    cropLine: '⏱ {time} · semilla {seed} · da {yield} × {price}', feedLine: '⏱ {time} · semilla {seed} · da {yield} de alimento',
    needLevel: 'Nivel {n}', plantOne: 'Sembrar {crop}', plantAll: 'Sembrar las {n} vacías',
    'stage.seed': 'Recién sembrado', 'stage.sprout': 'Brotando', 'stage.growing': 'Creciendo', 'stage.ripe': 'Maduro',
    ripeIn: 'Madura en {time}', dryNow: 'Tierra seca: riégala para que siga creciendo (no se muere).', dryIn: 'Húmeda {time} más; luego necesita agua para madurar.',
    weed: 'Maleza', pest: 'Plagas', issuesHint: 'Si quedan hasta la cosecha, cada una quita un 10 % del rendimiento.',
    water: 'Regar', waterAll: 'Regar las {n} secas', tend: 'Quitar maleza y plagas', harvest: 'Cosechar', harvestAll: 'Cosechar las {n} maduras',
    harvestsLeft: 'Perenne: quedan {n} cosechas', locked: 'Cerrada', openAt: 'Se abre en nivel {level} · {price} monedas', expand: 'Abrir esta parcela ({price} monedas)',
    expandFirst: 'Las parcelas se abren en orden: primero la {n}.',
    coop: 'Gallinero', barn: 'Establo', slots: '{n}/{max} lugares', hen: 'Gallina', chick: 'Pollito', cow: 'Vaca lechera', calf: 'Ternero',
    fullUntil: 'llena por {time}', hungry: 'con hambre', growsIn: 'crece tras {time} más bien alimentado', nest: 'nido {n}/{cap}', pail: 'cubo {n}/{cap}',
    feed: 'Alimentar', foodChicken: 'Maíz / arroz en el granero: {n}', foodCow: 'Pasto / heno en el granero: {n}',
    collectEggs: 'Recoger huevos ({n})', milk: 'Ordeñar ({n})', buyChick: 'Comprar pollito · {price} monedas', buyCalf: 'Comprar ternero · {price} monedas',
    upgrade: 'Ampliar: {slots} lugares · nivel {level} · {price} monedas', buyHay: 'Comprar 4 pacas de heno · {price} monedas',
    unlockAt: 'Se abre en nivel {n}. Sube de nivel sembrando, cosechando y cuidando.', noAnimals: 'Aún no hay animales.', penHint: 'Las crías crecen si comen; los adultos ponen huevos / dan leche mientras estén llenos, hasta que el nido / cubo se llena. Con hambre solo se detienen.',
    marketTitle: 'Mercado de la granja', marketNote: 'Hoy el mercado paga precio completo por {full}/{cap} monedas. Por encima solo paga el {over} %. Los precios cambian cada día.',
    stock: 'Granero ({used}/{cap})', emptyStock: 'El granero está vacío. Cosecha, recoge huevos u ordeña y vende aquí.', priceToday: '{price} monedas c/u hoy',
    keepFeed: 'Alimento para gallinas / vacas', sell1: 'Vender 1', sellAll: 'Vender todo', offer: 'Ofrendar 1', more: 'Ampliar',
    expandRow: 'Abrir parcela {n}: nivel {level} · {price} monedas', storageRow: 'Granero a {cap}: nivel {level} · {price} monedas', maxed: 'Al máximo',
    xp: '{xp}/{next} XP', coins: '{n} monedas', close: 'Cerrar', working: 'Trabajando…',
    'toast.plant': 'Sembrado {crop} · {n} parcelas 🌱', 'toast.water': 'Regadas {n} parcelas 💧', 'toast.tend': 'Maleza y plagas fuera 🌿', 'toast.harvest': 'Cosechaste {items}',
    'toast.feed': 'Alimentaste {n} animales', 'toast.collect': 'Obtuviste {items}', 'toast.sell': 'Vendido por {paid} monedas', 'toast.over': ' (sobre el límite del mercado, lo extra al {over} %)',
    'toast.offer': 'Ofrendaste {item} a las Tres Joyas 🙏', 'toast.buyAnimal': 'Compraste {thing}', 'toast.buy': 'Compraste {thing}', 'toast.expand': 'Abriste la parcela {n}',
    'toast.upgrade': 'Mejorado', levelUp: '🎉 ¡Nivel {n}!',
    'err.LOCKED': 'Nivel insuficiente', 'err.PLOT_TAKEN': 'La parcela ya está sembrada', 'err.NOT_DRY': 'La tierra sigue húmeda', 'err.NOTHING_TO_TEND': 'No hay maleza ni plagas',
    'err.NOT_RIPE': 'Aún no madura', 'err.STORAGE_FULL': 'Granero lleno: vende o amplía', 'err.PEN_FULL': 'No hay lugar libre', 'err.NOT_HUNGRY': 'No tiene hambre',
    'err.NO_FOOD': 'No hay alimento en el granero', 'err.NOTHING_TO_COLLECT': 'Aún no hay nada', 'err.NOT_ENOUGH': 'No alcanza en el granero', 'err.MAXED': 'Al máximo',
    'err.INSUFFICIENT_COINS': 'No tienes monedas suficientes', 'err.RATE_LIMITED': 'Más despacio', 'err.NETWORK': 'Error de red, intenta otra vez', 'err.GENERIC': 'No se pudo, intenta otra vez',
    hours: '{h} h {m} min', minutes: '{m} min', hoursOnly: '{h} h',
    'item.spinach': 'Espinaca de agua', 'item.tomato': 'Tomate', 'item.corn': 'Maíz', 'item.rice': 'Arroz', 'item.carrot': 'Zanahoria', 'item.grass': 'Pasto elefante',
    'item.pumpkin': 'Calabaza', 'item.watermelon': 'Sandía', 'item.dragonfruit': 'Pitahaya', 'item.egg': 'Huevo', 'item.milk': 'Leche', 'item.hay': 'Heno',
  },
};
// Hàng xóm (giai đoạn 4): thăm ruộng bạn, giúp, rổ chia sẻ, tặng quà, sổ ghé thăm, lời nhắc khi mở app. Không ghi chữ
// "bot" nào (bạn bot hiện như bạn người).
const SOCIAL_DICT = {
  vi: {
    neighbors: 'Hàng xóm', neighborsNote: 'Ghé ruộng bạn bè: tưới đất khô, nhổ cỏ, bắt sâu, cho gà bò đang đói ăn — tối đa {help} việc mỗi ruộng mỗi ngày, mỗi việc +1 kinh nghiệm và +1 xu (bạn từ 24 giờ trở lên, tối đa {cap} xu/ngày). Rổ chia sẻ ở cổng: lấy tối đa {take} món mỗi ruộng mỗi ngày.',
    noNeighbors: 'Chưa có hàng xóm. Kết bạn trong chùa rồi quay lại đây để ghé ruộng của nhau.', visit: 'Thăm', gift: 'Tặng',
    today: 'Hôm nay ở ruộng bạn', noVisitors: 'Hôm nay chưa ai ghé.', blessings: '🙏 Điểm phước: {n}', allGood: 'Không cần giúp', basketHas: '🧺 lấy được {n}',
    'log.water': '{name} tưới giúp {n} ô', 'log.tend': '{name} nhổ cỏ, bắt sâu {n} ô', 'log.feed': '{name} cho {n} con ăn', 'log.take': '{name} lấy {item} ×{n} ở rổ', 'log.gift': '{name} tặng bạn {item} ×{n}',
    visitTitle: '🏡 Ruộng của {name}', goHome: '‹ Về ruộng mình', visitNote: '🤝 Giúp {done}/{max} · 🧺 Lấy được {left}',
    helpLeft: 'Còn giúp được {n} việc ở ruộng này hôm nay.', helpDone: 'Hôm nay bạn đã giúp đủ ở ruộng này.',
    waterHelp: 'Tưới giúp', waterHelpAll: 'Tưới giúp cả {n} ô khô', tendHelp: 'Nhổ cỏ, bắt sâu giúp', feedHelp: 'Cho ăn giúp', feedHelpNote: 'Thức ăn lấy trong kho của chủ ruộng.',
    plotFine: 'Ô này đang ổn, không cần giúp.', penFine: 'Đang no, chưa cần cho ăn.', marketVisit: 'Chỉ chủ ruộng bán được ở chợ này.',
    basketTitle: 'Rổ chia sẻ', basketOf: 'Rổ của {name}', basketNote: 'Bỏ nông sản, trứng, sữa vào rổ để hàng xóm ghé lấy (mỗi người {take} món mỗi ngày). Mỗi món người khác nhận, bạn được 1 điểm phước 🙏.',
    basketVisitNote: 'Lấy tối đa {take} món mỗi ruộng mỗi ngày; món lấy vào kho của bạn.', inBasket: 'Trong rổ ({used}/{max})', emptyBasket: 'Rổ đang trống.',
    putIn: 'Bỏ vào rổ', put: 'Bỏ {n}', takeBack: 'Lấy lại', take: 'Lấy {n}',
    giftTitle: '🎁 Tặng {name}', giftNote: 'Món tặng vào thẳng kho của bạn ấy. Mỗi ngày tặng {n} lần, mỗi lần tối đa {max} món.', give: 'Tặng {n}', backNeighbors: '‹ Hàng xóm',
    'toast.help': 'Đã giúp {n} việc · +{xp} kinh nghiệm', 'toast.helpCoins': ' · +{n} xu', 'toast.take': 'Đã lấy {items} vào kho 🧺', 'toast.gift': 'Đã tặng {items} cho {name} 🎁',
    'toast.share': 'Đã bỏ {items} vào rổ', 'toast.unshare': 'Đã lấy lại {items}',
    'err.HELP_LIMIT': 'Hôm nay đã giúp đủ ở ruộng này', 'err.TAKE_LIMIT': 'Hôm nay đã lấy đủ phần ở rổ này', 'err.GIFT_LIMIT': 'Hôm nay đã tặng đủ số lần',
    'err.RECEIVER_FULL': 'Kho của bạn ấy đã đầy', 'err.BASKET_FULL': 'Rổ đã đầy', 'err.NOT_NEIGHBOR': 'Chỉ ghé được ruộng của bạn bè',
    hudHide: 'Thu gọn thanh nông trại', hudShow: 'Mở thanh nông trại',
    remind: '🌾 Phước Điền: {list}', 'remind.ripe': '{n} ô đã chín', 'remind.eggs': '{n} trứng chờ nhặt', 'remind.milk': '{n} xô sữa chờ lấy', 'remind.visitors': '{n} lượt hàng xóm ghé',
  },
  en: {
    neighbors: 'Neighbors', neighborsNote: "Visit your friends' farms: water dry soil, pull weeds, remove pests, feed hungry hens and cows — up to {help} tasks per farm per day, each +1 XP and +1 coin (friends for 24 h or more, up to {cap} coins a day). Sharing basket at the gate: take up to {take} items per farm per day.",
    noNeighbors: 'No neighbors yet. Make friends at the temple, then come back to visit each other.', visit: 'Visit', gift: 'Gift',
    today: 'Today on your farm', noVisitors: 'No visitors yet today.', blessings: '🙏 Blessings: {n}', allGood: 'Nothing to help with', basketHas: '🧺 {n} to take',
    'log.water': '{name} watered {n} plots', 'log.tend': '{name} weeded {n} plots', 'log.feed': '{name} fed {n} animals', 'log.take': '{name} took {item} ×{n} from the basket', 'log.gift': '{name} gave you {item} ×{n}',
    visitTitle: "🏡 {name}'s farm", goHome: '‹ Back to my farm', visitNote: '🤝 Helped {done}/{max} · 🧺 Can take {left}',
    helpLeft: 'You can do {n} more tasks here today.', helpDone: "You've helped enough here today.",
    waterHelp: 'Water for them', waterHelpAll: 'Water all {n} dry plots', tendHelp: 'Weed & remove pests', feedHelp: 'Feed for them', feedHelpNote: "Feed comes from the owner's storage.",
    plotFine: 'This plot is fine, nothing to do.', penFine: 'Full for now, no need to feed.', marketVisit: 'Only the owner can sell at this market.',
    basketTitle: 'Sharing basket', basketOf: "{name}'s basket", basketNote: 'Put crops, eggs or milk in the basket for neighbors to take ({take} items per person per day). Each item someone takes gives you 1 blessing 🙏.',
    basketVisitNote: 'Take up to {take} items per farm per day; they go to your storage.', inBasket: 'In the basket ({used}/{max})', emptyBasket: 'The basket is empty.',
    putIn: 'Put in the basket', put: 'Put {n}', takeBack: 'Take back', take: 'Take {n}',
    giftTitle: '🎁 Gift to {name}', giftNote: "Gifts go straight to their storage. {n} gifts a day, up to {max} items each.", give: 'Give {n}', backNeighbors: '‹ Neighbors',
    'toast.help': 'Helped with {n} tasks · +{xp} XP', 'toast.helpCoins': ' · +{n} coins', 'toast.take': 'Took {items} to storage 🧺', 'toast.gift': 'Gave {items} to {name} 🎁',
    'toast.share': 'Put {items} in the basket', 'toast.unshare': 'Took back {items}',
    'err.HELP_LIMIT': "You've helped enough here today", 'err.TAKE_LIMIT': "You've taken your share here today", 'err.GIFT_LIMIT': 'No gifts left today',
    'err.RECEIVER_FULL': 'Their storage is full', 'err.BASKET_FULL': 'The basket is full', 'err.NOT_NEIGHBOR': "You can only visit friends' farms",
    hudHide: 'Collapse farm panel', hudShow: 'Open farm panel',
    remind: '🌾 Farm: {list}', 'remind.ripe': '{n} plots ripe', 'remind.eggs': '{n} eggs to collect', 'remind.milk': '{n} pails of milk', 'remind.visitors': '{n} neighbor visits',
  },
  zh: {
    neighbors: '鄰居', neighborsNote: '去朋友的田裡幫忙：給乾地澆水、除草、抓蟲、餵餓了的雞牛——每塊田每天最多 {help} 件，每件 +1 經驗、+1 幣（成為朋友滿 24 小時，每天最多 {cap} 幣）。門口的分享籃：每塊田每天最多拿 {take} 樣。',
    noNeighbors: '還沒有鄰居。在寺裡交朋友後再回來互相串門。', visit: '拜訪', gift: '送禮',
    today: '今天來過你田裡的人', noVisitors: '今天還沒有人來。', blessings: '🙏 福報點：{n}', allGood: '不需要幫忙', basketHas: '🧺 可拿 {n}',
    'log.water': '{name} 幫你澆了 {n} 塊', 'log.tend': '{name} 幫你除草抓蟲 {n} 塊', 'log.feed': '{name} 餵了 {n} 隻', 'log.take': '{name} 從籃子拿了{item} ×{n}', 'log.gift': '{name} 送你{item} ×{n}',
    visitTitle: '🏡 {name}的田', goHome: '‹ 回我的田', visitNote: '🤝 幫忙 {done}/{max} · 🧺 可拿 {left}',
    helpLeft: '今天在這塊田還能幫 {n} 件。', helpDone: '今天在這塊田已經幫夠了。',
    waterHelp: '幫忙澆水', waterHelpAll: '幫忙澆 {n} 塊乾地', tendHelp: '幫忙除草抓蟲', feedHelp: '幫忙餵食', feedHelpNote: '飼料取自主人的倉庫。',
    plotFine: '這塊很好，不用幫忙。', penFine: '還飽，不用餵。', marketVisit: '只有主人能在這個市集賣東西。',
    basketTitle: '分享籃', basketOf: '{name}的籃子', basketNote: '把農產、雞蛋、牛奶放進籃子讓鄰居來拿（每人每天 {take} 樣）。別人每拿一樣，你得 1 福報點 🙏。',
    basketVisitNote: '每塊田每天最多拿 {take} 樣，拿的東西放進你的倉庫。', inBasket: '籃子裡（{used}/{max}）', emptyBasket: '籃子是空的。',
    putIn: '放進籃子', put: '放 {n}', takeBack: '拿回', take: '拿 {n}',
    giftTitle: '🎁 送給{name}', giftNote: '禮物直接放進對方倉庫。每天可送 {n} 次，每次最多 {max} 樣。', give: '送 {n}', backNeighbors: '‹ 鄰居',
    'toast.help': '幫了 {n} 件 · +{xp} 經驗', 'toast.helpCoins': ' · +{n} 幣', 'toast.take': '已拿 {items} 進倉庫 🧺', 'toast.gift': '已送 {items} 給{name} 🎁',
    'toast.share': '已放 {items} 進籃子', 'toast.unshare': '已拿回 {items}',
    'err.HELP_LIMIT': '今天在這塊田已經幫夠了', 'err.TAKE_LIMIT': '今天在這個籃子已經拿夠了', 'err.GIFT_LIMIT': '今天的送禮次數用完了',
    'err.RECEIVER_FULL': '對方的倉庫滿了', 'err.BASKET_FULL': '籃子滿了', 'err.NOT_NEIGHBOR': '只能拜訪朋友的田',
    hudHide: '收起農場面板', hudShow: '打開農場面板',
    remind: '🌾 福田：{list}', 'remind.ripe': '{n} 塊成熟了', 'remind.eggs': '{n} 顆蛋待撿', 'remind.milk': '{n} 桶奶待取', 'remind.visitors': '鄰居來過 {n} 次',
  },
  es: {
    neighbors: 'Vecinos', neighborsNote: 'Visita las granjas de tus amigos: riega la tierra seca, quita maleza y plagas, alimenta gallinas y vacas con hambre — hasta {help} tareas por granja al día, cada una +1 XP y +1 moneda (amigos desde hace 24 h o más, hasta {cap} monedas al día). Canasta compartida en la entrada: toma hasta {take} cosas por granja al día.',
    noNeighbors: 'Aún no tienes vecinos. Haz amigos en el templo y vuelve para visitarse.', visit: 'Visitar', gift: 'Regalar',
    today: 'Hoy en tu granja', noVisitors: 'Hoy aún no vino nadie.', blessings: '🙏 Bendiciones: {n}', allGood: 'No necesita ayuda', basketHas: '🧺 puedes tomar {n}',
    'log.water': '{name} regó {n} parcelas', 'log.tend': '{name} limpió {n} parcelas', 'log.feed': '{name} alimentó {n} animales', 'log.take': '{name} tomó {item} ×{n} de la canasta', 'log.gift': '{name} te regaló {item} ×{n}',
    visitTitle: '🏡 Granja de {name}', goHome: '‹ Volver a mi granja', visitNote: '🤝 Ayuda {done}/{max} · 🧺 Puedes tomar {left}',
    helpLeft: 'Puedes hacer {n} tareas más aquí hoy.', helpDone: 'Ya ayudaste lo suficiente aquí hoy.',
    waterHelp: 'Regar', waterHelpAll: 'Regar las {n} secas', tendHelp: 'Quitar maleza y plagas', feedHelp: 'Alimentar', feedHelpNote: 'El alimento sale del granero del dueño.',
    plotFine: 'Esta parcela está bien, no hace falta ayuda.', penFine: 'Están llenos, no hace falta alimentar.', marketVisit: 'Solo el dueño puede vender en este mercado.',
    basketTitle: 'Canasta compartida', basketOf: 'Canasta de {name}', basketNote: 'Pon cosechas, huevos o leche en la canasta para que los vecinos tomen ({take} por persona al día). Cada cosa que alguien toma te da 1 bendición 🙏.',
    basketVisitNote: 'Toma hasta {take} cosas por granja al día; van a tu granero.', inBasket: 'En la canasta ({used}/{max})', emptyBasket: 'La canasta está vacía.',
    putIn: 'Poner en la canasta', put: 'Poner {n}', takeBack: 'Recuperar', take: 'Tomar {n}',
    giftTitle: '🎁 Regalar a {name}', giftNote: 'Los regalos van directo a su granero. {n} regalos al día, hasta {max} cosas cada uno.', give: 'Regalar {n}', backNeighbors: '‹ Vecinos',
    'toast.help': 'Ayudaste en {n} tareas · +{xp} XP', 'toast.helpCoins': ' · +{n} monedas', 'toast.take': 'Tomaste {items} a tu granero 🧺', 'toast.gift': 'Regalaste {items} a {name} 🎁',
    'toast.share': 'Pusiste {items} en la canasta', 'toast.unshare': 'Recuperaste {items}',
    'err.HELP_LIMIT': 'Ya ayudaste lo suficiente aquí hoy', 'err.TAKE_LIMIT': 'Ya tomaste tu parte de esta canasta hoy', 'err.GIFT_LIMIT': 'No te quedan regalos hoy',
    'err.RECEIVER_FULL': 'Su granero está lleno', 'err.BASKET_FULL': 'La canasta está llena', 'err.NOT_NEIGHBOR': 'Solo puedes visitar granjas de amigos',
    hudHide: 'Ocultar panel de la granja', hudShow: 'Abrir panel de la granja',
    remind: '🌾 Granja: {list}', 'remind.ripe': '{n} parcelas maduras', 'remind.eggs': '{n} huevos por recoger', 'remind.milk': '{n} cubos de leche', 'remind.visitors': '{n} visitas de vecinos',
  },
};
for (const [code, words] of Object.entries(SOCIAL_DICT)) Object.assign(DICT[code], words);
export const FARM_DICT = DICT;
// Giới hạn hàng xóm (khớp FARM_HELP_PER_FARM / FARM_TAKE_PER_FARM / FARM_GIFT_* ở @chanh-dien/garden; server vẫn kiểm tra).
const HELP_PER_FARM = 5;
const TAKE_PER_FARM = 2;
const GIFT_PER_DAY = 3;
const GIFT_MAX = 10;
const SHAREABLE = ['spinach', 'tomato', 'corn', 'rice', 'carrot', 'pumpkin', 'watermelon', 'dragonfruit', 'egg', 'milk'];

function tr(key, vars = {}) {
  const value = DICT[lang()]?.[key] ?? DICT.vi[key] ?? key;
  return value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] ?? match));
}
const itemName = (item) => `${ICONS[item] || ''} ${tr(`item.${item}`)}`.trim();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(className, text, onClick, disabled = false) {
  const node = el('button', className, text);
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', onClick);
  return node;
}

// Ruộng mẫu cho khách (chỉ để nhìn; bấm vào thì mời đăng nhập).
const DEMO = {
  demo: true, plotsOpen: 6,
  plots: [
    { slot: 1, crop: 'tomato', stage: 'ripe', issues: [] }, { slot: 2, crop: 'corn', stage: 'growing', issues: [] },
    { slot: 3, crop: 'spinach', stage: 'sprout', issues: [] }, { slot: 4, crop: 'rice', stage: 'growing', issues: ['weed'] },
    { slot: 5, crop: 'carrot', stage: 'seed', issues: [] },
  ],
  animals: [{ id: -1, kind: 'chicken', adult: true, stored: 2, hungry: false }, { id: -2, kind: 'chicken', adult: false, stored: 0, hungry: false }, { id: -3, kind: 'cow', adult: true, stored: 1, hungry: false }],
};

export function createFarmUI({ stage, showToast, explore, account, openSignIn, onCoins, locale = () => undefined }) {
  let farm = null;
  let skew = 0;
  let place = null;
  let busy = false;
  let open = null;
  let chosenCrop = null;
  let refreshTimer = null;
  let tickTimer = null;
  // Đang thăm ruộng hàng xóm: { owner: { name, accountId | bot }, visit: { farm, needs, helps, takes, coins } }.
  let visiting = null;
  let neighbors = null;
  let neighborCap = 10;
  let reminded = false;
  const now = () => Date.now() + skew;
  const SOCIAL = ['help', 'take', 'gift'];
  const ownerRef = () => (visiting?.owner.bot ? { bot: visiting.owner.bot } : { friend: visiting?.owner.accountId });
  // Mốc đã xem sổ ghé thăm (để biết có lượt ghé mới); lỗi bộ nhớ trình duyệt thì coi như chưa xem.
  const SEEN_KEY = 'farm-visitors-seen';
  const seenAt = () => {
    try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; }
  };
  const markSeen = () => {
    const latest = Math.max(0, ...(farm?.visitors || []).map((row) => row.at));
    try { if (latest) localStorage.setItem(SEEN_KEY, String(latest)); } catch {}
  };

  const hud = el('div', 'farm-hud');
  hud.hidden = true;
  // Thu gọn thanh nông trại thành một viên nhỏ (đỡ che cảnh trên điện thoại); nhớ trên máy, lỗi bộ nhớ thì mở như mặc định.
  const COLLAPSED_KEY = 'farm-hud-collapsed';
  let collapsed = (() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  })();
  const toggleHud = () => {
    collapsed = !collapsed;
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch {}
    renderHud();
  };
  const hideButton = () => {
    const node = button('farm-hud-toggle', '▴', toggleHud);
    node.title = tr('hudHide');
    node.setAttribute('aria-label', tr('hudHide'));
    return node;
  };
  const card = el('section', 'garden-card farm-card');
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  const sheet = el('section', 'garden-sheet farm-sheet');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  stage.append(hud, card, sheet);

  const duration = (ms) => {
    const minutes = Math.max(1, Math.ceil(Math.max(0, ms) / MINUTE));
    const hours = Math.floor(minutes / 60);
    if (!hours) return tr('minutes', { m: minutes });
    return minutes % 60 ? tr('hours', { h: hours, m: minutes % 60 }) : tr('hoursOnly', { h: hours });
  };
  const crops = () => farm?.catalog?.crops || [];
  const cropOf = (id) => crops().find((crop) => crop.id === id);

  // Đặt dữ liệu cho bộ vẽ: kèm chữ trên biển ô kế tiếp (mở ô).
  function draw() {
    if (visiting) {
      explore.setFarm?.({ ...visiting.visit.farm, expand: null });
      return;
    }
    if (!account()) {
      explore.setFarm?.(DEMO);
      return;
    }
    if (!farm) {
      explore.setFarm?.(null);
      return;
    }
    explore.setFarm?.({ ...farm, expand: farm.expand ? { ...farm.expand, label: farm.expand.ready ? tr('coins', { n: farm.expand.price }) : tr('needLevel', { n: farm.expand.level }) } : null });
  }

  function apply(next) {
    if (!next) return;
    farm = next;
    skew = next.at - Date.now();
    draw();
    renderHud();
    renderOpen();
    schedule();
  }

  async function load() {
    if (!account()) {
      farm = null;
      draw();
      renderHud();
      return;
    }
    try {
      const response = await fetch('/api/v1/farm', { credentials: 'same-origin' });
      if (response.ok) {
        apply((await response.json()).farm);
        remind();
      }
    } catch {}
  }

  // Lần đầu tải trong phiên mà không đứng ở Phước Điền: nhắc ô chín, trứng / sữa chờ lấy, lượt hàng xóm ghé mới.
  function remind() {
    if (reminded || !farm) return;
    reminded = true;
    const ripe = farm.plots.filter((plot) => stageOf(plot) === 'ripe').length;
    const stored = (kind) => farm.animals.filter((item) => item.kind === kind).reduce((sum, item) => sum + item.stored, 0);
    const fresh = (farm.visitors || []).filter((row) => row.at > seenAt()).length;
    const list = [
      ripe ? tr('remind.ripe', { n: ripe }) : '',
      stored('chicken') ? tr('remind.eggs', { n: stored('chicken') }) : '',
      stored('cow') ? tr('remind.milk', { n: stored('cow') }) : '',
      fresh ? tr('remind.visitors', { n: fresh }) : '',
    ].filter(Boolean);
    if (list.length) setTimeout(() => { if (place !== 'myfarm') showToast(tr('remind', { list: list.join(' · ') })); }, 5_000);
  }

  // ---- Hàng xóm ----
  async function loadNeighbors() {
    try {
      const response = await fetch('/api/v1/farm/neighbors', { credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      neighbors = data.neighbors || [];
      neighborCap = data.coins?.cap ?? neighborCap;
      if (open?.type === 'neighbors') renderOpen();
    } catch {}
  }
  async function fetchVisit(owner) {
    const query = owner.bot ? `bot=${encodeURIComponent(owner.bot)}` : `friend=${encodeURIComponent(owner.accountId)}`;
    const response = await fetch(`/api/v1/farm/visit?${query}`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(response.status === 403 ? 'NOT_NEIGHBOR' : 'NETWORK');
    return response.json();
  }
  async function visitNeighbor(item) {
    try {
      const data = await fetchVisit(item);
      visiting = { owner: { name: data.owner.name, ...(item.bot ? { bot: item.bot } : { accountId: item.accountId }) }, visit: data.visit };
      clearTimeout(refreshTimer);
      close();
      draw();
      renderHud();
    } catch (error) {
      showToast(tr(error.message === 'NOT_NEIGHBOR' ? 'err.NOT_NEIGHBOR' : 'err.NETWORK'));
    }
  }
  // Tải lại ruộng đang thăm (khi chạm vào ô / chuồng) để thấy việc mới.
  async function refreshVisit() {
    if (!visiting) return;
    const owner = visiting.owner;
    try {
      const data = await fetchVisit(owner);
      if (visiting?.owner === owner) {
        visiting.visit = data.visit;
        draw();
        renderHud();
        renderOpen();
      }
    } catch {}
  }
  function goHome() {
    if (!visiting) return;
    visiting = null;
    close();
    draw();
    renderHud();
    load();
  }

  // Tải lại vào lúc có việc mới (ô chín, đất khô, ổ đầy, con đói) khi đang ở trong khu: 5–60 giây.
  function schedule() {
    clearTimeout(refreshTimer);
    if (place !== 'myfarm' || !farm || visiting) return;
    const times = [
      ...farm.plots.flatMap((plot) => [plot.ripeAt, plot.dryAt]),
      ...farm.animals.flatMap((item) => [item.nextAt, item.fedUntil]),
    ].filter((value) => Number.isFinite(value) && value > now());
    const next = times.length ? Math.min(...times) - now() + 1_000 : 60_000;
    refreshTimer = setTimeout(() => { if (!document.hidden) load(); else schedule(); }, Math.max(5_000, Math.min(60_000, next)));
  }

  async function act(action, input, effect) {
    if (busy) return null;
    if (!account()) {
      openSignIn?.();
      return null;
    }
    busy = true;
    renderOpen();
    const key = crypto.randomUUID();
    let result = null;
    for (let attempt = 0; attempt < 2 && !result; attempt += 1) {
      try {
        const response = await fetch(`/api/v1/farm/${action}`, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'idempotency-key': key },
          body: JSON.stringify(SOCIAL.includes(action) && action !== 'gift' ? { ...ownerRef(), ...input } : input),
        });
        result = await response.json();
      } catch {}
    }
    busy = false;
    if (!result) showToast(tr('err.NETWORK'));
    else {
      if (result.visit && visiting) visiting.visit = result.visit;
      if (result.farm) apply(result.farm);
      if (!result.ok) {
        const known = DICT.vi[`err.${result.code}`];
        showToast(known ? tr(`err.${result.code}`) : tr('err.GENERIC'));
      } else {
        if (effect) explore.farmEffect?.(effect.kind, effect.target);
        const message = toastFor(action, result, input);
        showToast(result.levelUp ? `${tr('levelUp', { n: result.levelUp })} ${message}` : message);
        onCoins?.();
      }
    }
    renderOpen();
    return result;
  }

  const itemsText = (items) => Object.entries(items || {}).map(([item, n]) => `${ICONS[item] || ''}×${n}`).join(' ');
  const visitorLine = (row) => tr(`log.${row.kind}`, { name: row.name, n: row.count, item: row.item && row.kind !== 'feed' ? itemName(row.item) : '' });
  function toastFor(action, result, input) {
    if (action === 'plant') return tr('toast.plant', { crop: tr(`item.${input.crop}`), n: result.slots?.length || 1 });
    if (action === 'water') return tr('toast.water', { n: result.slots?.length || 1 });
    if (action === 'harvest' || action === 'collect') return tr(`toast.${action}`, { items: itemsText(result.items) });
    if (action === 'feed') return tr('toast.feed', { n: result.animals?.length || 1 });
    if (action === 'sell') return tr('toast.sell', { paid: result.sold.paid }) + (result.sold.over ? tr('toast.over', { over: farm?.market?.overPercent ?? 20 }) : '');
    if (action === 'offer') return tr('toast.offer', { item: tr(`item.${input.item}`) });
    if (action === 'buyAnimal') return tr('toast.buyAnimal', { thing: tr(input.kind === 'chicken' ? 'chick' : 'calf') });
    if (action === 'buy') return tr('toast.buy', { thing: `${tr('item.hay')} ×${input.quantity}` });
    if (action === 'expand') return tr('toast.expand', { n: result.slot });
    if (action === 'help') return tr('toast.help', { n: result.helped.count, xp: result.xpGained }) + (result.helped.coins ? tr('toast.helpCoins', { n: result.helped.coins }) : '');
    if (action === 'take') return tr('toast.take', { items: itemsText({ [result.taken.item]: result.taken.quantity }) });
    if (action === 'gift') return tr('toast.gift', { items: itemsText({ [result.gifted.item]: result.gifted.quantity }), name: open?.friend?.name || '' });
    if (action === 'share' || action === 'unshare') {
      const done = result.shared || result.unshared;
      return tr(`toast.${action}`, { items: itemsText({ [done.item]: done.quantity }) });
    }
    return tr(`toast.${action}`);
  }

  // ---- Thanh nông trại (khi đứng trong khu) ----
  function renderHud() {
    hud.hidden = place !== 'myfarm';
    if (hud.hidden) return;
    hud.classList.toggle('collapsed', collapsed);
    const fresh = farm && !visiting ? (farm.visitors || []).find((row) => row.at > seenAt()) : null;
    if (collapsed) {
      // Viên thu gọn: biểu tượng + cấp (ruộng mình) hoặc tên chủ ruộng đang thăm, 📬 khi có lượt ghé mới.
      const label = !account() ? `🌾 ${tr('title')}`
        : visiting ? `🏡 ${visiting.owner.name}`
          : farm ? `🌾 ${tr('level', { n: farm.level })}${fresh ? ' · 📬' : ''}` : `🌾 ${tr('title')}`;
      const pill = button('farm-hud-pill', `${label} ▾`, toggleHud);
      pill.title = tr('hudShow');
      pill.setAttribute('aria-label', `${label} · ${tr('hudShow')}`);
      hud.replaceChildren(pill);
      return;
    }
    const parts = [];
    if (!account()) {
      const top = el('div', 'farm-hud-row');
      top.append(el('b', 'farm-hud-title', `🌾 ${tr('title')} · ${tr('demo')}`), hideButton());
      parts.push(top, el('span', 'farm-hud-note', tr('signIn')), button('chip primary', tr('signInButton'), () => openSignIn?.()));
      hud.replaceChildren(...parts);
      return;
    }
    if (visiting) {
      const v = visiting.visit;
      const top = el('div', 'farm-hud-row');
      top.append(el('b', '', tr('visitTitle', { name: visiting.owner.name })), hideButton());
      parts.push(top, el('span', 'farm-hud-note', `${tr('level', { n: v.farm.level })} · ${tr('visitNote', { done: v.helps.done, max: v.helps.max, left: v.takes.left })}`), button('chip primary', tr('goHome'), goHome));
      hud.replaceChildren(...parts);
      return;
    }
    if (!farm) {
      const top = el('div', 'farm-hud-row');
      top.append(el('b', 'farm-hud-title', `🌾 ${tr('title')}`), hideButton());
      hud.replaceChildren(top);
      return;
    }
    const bar = el('span', 'farm-xp');
    const fill = el('i');
    const span = farm.xpNext ? (farm.xp - farm.xpFloor) / (farm.xpNext - farm.xpFloor) : 1;
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, span)) * 100)}%`;
    bar.append(fill);
    const top = el('div', 'farm-hud-row');
    const actions = el('span', 'farm-hud-actions');
    actions.append(button('chip', `🧺 ${tr('market')}`, openMarket), hideButton());
    top.append(el('b', '', `🌾 ${tr('level', { n: farm.level })}`), actions);
    const left = Math.max(0, farm.market.cap - farm.market.full);
    parts.push(top, bar, el('span', 'farm-hud-note', `🛒 ${tr('marketLeft', { n: left })}`), button('chip', `🏡 ${tr('neighbors')}`, openNeighbors));
    // Lượt hàng xóm ghé mới nhất chưa xem: chạm để mở sổ.
    if (fresh) parts.push(button('farm-hud-link', `📬 ${visitorLine(fresh)}`, openNeighbors));
    hud.replaceChildren(...parts);
  }

  // ---- Thẻ (ô đất / chuồng) ----
  const closeButton = () => {
    const node = button('social-close', '✕', close);
    node.setAttribute('aria-label', tr('close'));
    return node;
  };
  const head = (badge, title) => {
    const node = el('div', 'garden-head');
    node.append(el('span', 'garden-badge', badge), el('b', 'garden-title', title));
    return node;
  };
  const main = (text, onClick, disabled = false) => button('garden-main', busy ? tr('working') : text, onClick, disabled || busy);
  const secondary = (text, onClick, disabled = false) => button('farm-secondary', text, onClick, disabled || busy);
  const plotState = (slot) => farm?.plots.find((plot) => plot.slot === slot) || null;
  const stageOf = (plot) => {
    if (!plot) return null;
    if (plot.stage !== 'ripe' && plot.ripeAt && now() >= plot.ripeAt) return 'ripe';
    return plot.stage;
  };

  // Ruộng hàng xóm: chỉ xem + giúp (tưới ô khô, nhổ cỏ / bắt sâu, cho con đói ăn).
  const helpNote = () => {
    const left = visiting.visit.helps.max - visiting.visit.helps.done;
    return el('p', 'garden-hint', left > 0 ? `🤝 ${tr('helpLeft', { n: left })}` : `🤝 ${tr('helpDone')}`);
  };
  function renderVisitPlot(slot) {
    const parts = [closeButton()];
    const { farm: other, needs, helps } = visiting.visit;
    const left = helps.max - helps.done;
    if (slot > other.plotsOpen) return [...parts, head(tr('plot', { n: slot }), `🔒 ${tr('locked')}`)];
    const plot = other.plots.find((item) => item.slot === slot);
    if (!plot) return [...parts, head(tr('plot', { n: slot }), tr('empty')), helpNote()];
    const target = { kind: 'plot', slot };
    parts.push(head(tr('plot', { n: slot }), itemName(plot.crop)));
    const progress = el('div', 'farm-progress');
    const fill = el('i');
    fill.style.width = `${Math.round((plot.stage === 'ripe' ? 1 : plot.progress) * 100)}%`;
    progress.append(fill);
    parts.push(el('p', 'garden-sub', tr(`stage.${plot.stage}`)), progress);
    if (plot.dry) {
      parts.push(el('p', 'farm-alert', `💧 ${tr('dryNow')}`));
      parts.push(main(`💧 ${tr('waterHelp')}`, () => act('help', { task: 'water', slots: [slot] }, { kind: 'water', target }), left <= 0));
      if (needs.water.length > 1 && left > 1) parts.push(secondary(tr('waterHelpAll', { n: Math.min(needs.water.length, left) }), () => act('help', { task: 'water', slots: needs.water }, { kind: 'water', target })));
    }
    if (plot.issues.length) {
      parts.push(el('p', 'farm-alert', plot.issues.map((kind) => `${kind === 'weed' ? '🌿' : '🐛'} ${tr(kind)}`).join(' · ')));
      parts.push(main(`🌿 ${tr('tendHelp')}`, () => act('help', { task: 'tend', slots: [slot] }, { kind: 'tend', target }), left <= 0));
    }
    if (!plot.dry && !plot.issues.length) parts.push(el('p', 'garden-sub', tr('plotFine')));
    parts.push(helpNote());
    return parts;
  }
  function renderVisitPen(kind) {
    const animal = kind === 'coop' ? 'chicken' : 'cow';
    const list = visiting.visit.farm.animals.filter((item) => item.kind === animal);
    const parts = [closeButton(), head(ICONS[animal], tr(kind))];
    const rows = el('div', 'farm-animals');
    if (!list.length) rows.append(el('p', 'garden-hint', tr('noAnimals')));
    for (const item of list) {
      const name = item.adult ? tr(animal === 'chicken' ? 'hen' : 'cow') : tr(animal === 'chicken' ? 'chick' : 'calf');
      const icon = item.adult ? ICONS[animal] : ICONS[animal === 'chicken' ? 'chick' : 'calf'];
      const bits = [item.hungry ? tr('hungry') : '', item.adult ? tr(animal === 'chicken' ? 'nest' : 'pail', { n: item.stored, cap: item.cap }) : ''].filter(Boolean);
      const row = el('div', `farm-animal${item.hungry ? ' hungry' : ''}`);
      row.append(el('span', 'farm-animal-icon', icon), el('b', '', name), el('small', '', bits.join(' · ')));
      rows.append(row);
    }
    parts.push(rows);
    if (list.some((item) => item.hungry)) {
      const left = visiting.visit.helps.max - visiting.visit.helps.done;
      parts.push(main(`${animal === 'chicken' ? '🌽' : '🌿'} ${tr('feedHelp')}`, () => act('help', { task: 'feed', kind: animal }, { kind: 'feed', target: { kind } }), left <= 0));
      parts.push(el('p', 'garden-hint', tr('feedHelpNote')));
    } else if (list.length) parts.push(el('p', 'garden-sub', tr('penFine')));
    parts.push(helpNote());
    return parts;
  }

  function renderPlot(slot) {
    if (visiting) return renderVisitPlot(slot);
    const parts = [closeButton()];
    if (!account()) {
      parts.push(head(tr('plot', { n: slot }), tr('title')), el('p', 'garden-sub', tr('signIn')), main(tr('signInButton'), () => { close(); openSignIn?.(); }));
      return parts;
    }
    if (!farm) return parts;
    if (slot > farm.plotsOpen) {
      parts.push(head(tr('plot', { n: slot }), `🔒 ${tr('locked')}`));
      const next = farm.expand;
      if (next && next.slot === slot) {
        parts.push(el('p', 'garden-sub', tr('openAt', { level: next.level, price: next.price })));
        parts.push(main(`🔓 ${tr('expand', { price: next.price })}`, () => act('expand', {}), !next.ready || farm.coins < next.price));
      } else parts.push(el('p', 'garden-sub', tr('expandFirst', { n: farm.plotsOpen + 1 })));
      return parts;
    }
    const plot = plotState(slot);
    const target = { kind: 'plot', slot };
    if (!plot) {
      parts.push(head(tr('plot', { n: slot }), tr('empty')), el('p', 'garden-hint', tr('pickCrop')));
      const grid = el('div', 'farm-crops');
      const unlocked = crops().filter((crop) => crop.unlocked);
      if (!chosenCrop || !unlocked.some((crop) => crop.id === chosenCrop)) chosenCrop = unlocked[1]?.id || unlocked[0]?.id || null;
      for (const crop of crops()) {
        const option = button(`farm-crop${chosenCrop === crop.id ? ' chosen' : ''}`, '', () => {
          chosenCrop = crop.id;
          renderOpen();
        }, !crop.unlocked);
        option.append(el('span', 'farm-crop-icon', ICONS[crop.id] || '🌱'), el('b', '', tr(`item.${crop.id}`)));
        option.append(el('small', '', crop.unlocked
          ? tr(crop.price ? 'cropLine' : 'feedLine', { time: duration(crop.growMs), seed: crop.seed, yield: crop.yield, price: farm.market.prices[crop.id] ?? crop.price })
          : tr('needLevel', { n: crop.level })));
        grid.append(option);
      }
      parts.push(grid);
      const crop = cropOf(chosenCrop);
      const empties = Array.from({ length: farm.plotsOpen }, (_, index) => index + 1).filter((id) => !plotState(id));
      if (crop) {
        parts.push(main(`🌱 ${tr('plantOne', { crop: tr(`item.${crop.id}`) })} · ${tr('coins', { n: crop.seed })}`, () => act('plant', { slot, crop: crop.id }, { kind: 'plant', target }), farm.coins < crop.seed));
        if (empties.length > 1) parts.push(secondary(`${tr('plantAll', { n: empties.length })} · ${tr('coins', { n: crop.seed * empties.length })}`, () => act('plant', { slots: empties, crop: crop.id }, { kind: 'plant', target }), farm.coins < crop.seed * empties.length));
      }
      return parts;
    }
    const crop = cropOf(plot.crop);
    const stageName = stageOf(plot);
    parts.push(head(tr('plot', { n: slot }), itemName(plot.crop)));
    const progress = el('div', 'farm-progress');
    const fill = el('i');
    fill.style.width = `${Math.round((stageName === 'ripe' ? 1 : plot.progress) * 100)}%`;
    progress.append(fill);
    parts.push(el('p', 'garden-sub', tr(`stage.${stageName}`) + (plot.harvestsLeft ? ` · ${tr('harvestsLeft', { n: plot.harvestsLeft })}` : '')), progress);
    if (stageName !== 'ripe') {
      if (plot.dry || (plot.dryAt && now() >= plot.dryAt)) parts.push(el('p', 'farm-alert', `💧 ${tr('dryNow')}`));
      else if (plot.ripeAt) parts.push(el('p', 'garden-sub', `⏱ ${tr('ripeIn', { time: duration(plot.ripeAt - now()) })}`));
      else if (plot.dryAt) parts.push(el('p', 'garden-sub', `⏱ ${tr('dryIn', { time: duration(plot.dryAt - now()) })}`));
    }
    if (plot.issues.length) parts.push(el('p', 'farm-alert', `${plot.issues.map((kind) => `${kind === 'weed' ? '🌿' : '🐛'} ${tr(kind)}`).join(' · ')} — ${tr('issuesHint')}`));
    const ripe = farm.plots.filter((item) => stageOf(item) === 'ripe').map((item) => item.slot);
    const dry = farm.plots.filter((item) => stageOf(item) !== 'ripe' && (item.dry || (item.dryAt && item.dryAt - now() < farm.catalog.moistMs / 2))).map((item) => item.slot);
    if (stageName === 'ripe') {
      parts.push(main(`🧺 ${tr('harvest')} (${crop?.yield ?? ''})`, () => act('harvest', { slot }, { kind: 'harvest', target })));
      if (ripe.length > 1) parts.push(secondary(tr('harvestAll', { n: ripe.length }), () => act('harvest', { slots: ripe }, { kind: 'harvest', target })));
    }
    if (plot.issues.length) parts.push(main(`🌿 ${tr('tend')}`, () => act('tend', { slot }, { kind: 'tend', target })));
    if (dry.includes(slot)) {
      parts.push(main(`💧 ${tr('water')}`, () => act('water', { slot }, { kind: 'water', target })));
      if (dry.length > 1) parts.push(secondary(tr('waterAll', { n: dry.length }), () => act('water', { slots: dry }, { kind: 'water', target })));
    }
    return parts;
  }

  function renderPen(kind) {
    if (visiting) return renderVisitPen(kind);
    const animal = kind === 'coop' ? 'chicken' : 'cow';
    const parts = [closeButton()];
    const penName = tr(kind);
    if (!account()) {
      parts.push(head(ICONS[animal], penName), el('p', 'garden-sub', tr('signIn')), main(tr('signInButton'), () => { close(); openSignIn?.(); }));
      return parts;
    }
    if (!farm) return parts;
    const def = farm.catalog.animals.find((item) => item.id === animal);
    const pen = farm[kind];
    const list = farm.animals.filter((item) => item.kind === animal);
    parts.push(head(ICONS[animal], `${penName} · ${tr('slots', { n: list.length, max: pen.slots })}`));
    if (!def.unlocked) {
      parts.push(el('p', 'garden-sub', tr('unlockAt', { n: def.level })));
      return parts;
    }
    const rows = el('div', 'farm-animals');
    if (!list.length) rows.append(el('p', 'garden-hint', tr('noAnimals')));
    for (const item of list) {
      const name = item.adult ? tr(animal === 'chicken' ? 'hen' : 'cow') : tr(animal === 'chicken' ? 'chick' : 'calf');
      const icon = item.adult ? ICONS[animal] : ICONS[animal === 'chicken' ? 'chick' : 'calf'];
      const fed = item.fedUntil > now();
      const bits = [fed ? tr('fullUntil', { time: duration(item.fedUntil - now()) }) : tr('hungry')];
      if (!item.adult) bits.push(tr('growsIn', { time: duration(item.growLeftMs) }));
      else bits.push(tr(animal === 'chicken' ? 'nest' : 'pail', { n: item.stored, cap: item.cap }));
      const row = el('div', `farm-animal${fed ? '' : ' hungry'}`);
      row.append(el('span', 'farm-animal-icon', icon), el('b', '', name), el('small', '', bits.join(' · ')));
      rows.append(row);
    }
    parts.push(rows);
    const target = { kind };
    const stored = list.reduce((sum, item) => sum + item.stored, 0);
    const food = def.food.reduce((sum, item) => sum + (farm.items[item] || 0), 0);
    if (stored) parts.push(main(animal === 'chicken' ? `🧺 ${tr('collectEggs', { n: stored })}` : `🥛 ${tr('milk', { n: stored })}`, () => act('collect', { kind: animal }, { kind: 'collect', target })));
    if (list.some((item) => item.fedUntil - now() <= 30 * MINUTE)) {
      parts.push(main(`${animal === 'chicken' ? '🌽' : '🌿'} ${tr('feed')}`, () => act('feed', { kind: animal }, { kind: 'feed', target }), food < def.eat));
    }
    parts.push(el('p', 'garden-hint', tr(animal === 'chicken' ? 'foodChicken' : 'foodCow', { n: food })));
    if (animal === 'cow') parts.push(secondary(tr('buyHay', { price: farm.catalog.hayPrice * 4 }), () => act('buy', { item: 'hay', quantity: 4 }), farm.coins < farm.catalog.hayPrice * 4));
    if (list.length < pen.slots) parts.push(secondary(tr(animal === 'chicken' ? 'buyChick' : 'buyCalf', { price: def.price }), () => act('buyAnimal', { kind: animal }, { kind: 'feed', target }), farm.coins < def.price));
    else if (pen.next) parts.push(secondary(tr('upgrade', { slots: pen.next.slots, level: pen.next.level, price: pen.next.price }), () => act('upgrade', { target: kind }), !pen.next.ready || farm.coins < pen.next.price));
    parts.push(el('p', 'garden-hint', tr('penHint')));
    return parts;
  }

  // ---- Chợ: kho, giá hôm nay, bán / dâng, mua cỏ khô, mở rộng ----
  function renderMarket() {
    const back = button('mala-back', `‹ ${tr('close')}`, close);
    const parts = [back, el('h2', '', `🧺 ${tr('marketTitle')}`)];
    if (!account() || !farm) {
      parts.push(el('p', 'social-note', tr('signIn')), button('garden-main', tr('signInButton'), () => { close(); openSignIn?.(); }));
      sheet.replaceChildren(...parts);
      return;
    }
    const wallet = el('div', 'garden-wallet');
    wallet.append(el('span', 'garden-coin', '🪙'), el('b', '', tr('coins', { n: farm.coins.toLocaleString(locale()) })), el('small', '', `${tr('level', { n: farm.level })} · ${farm.xpNext ? tr('xp', { xp: farm.xp, next: farm.xpNext }) : ''}`));
    parts.push(wallet, el('p', 'social-note', tr('marketNote', { full: farm.market.full, cap: farm.market.cap, over: farm.market.overPercent })));
    parts.push(el('h3', '', tr('stock', { used: farm.storage.used, cap: farm.storage.capacity })));
    const items = Object.entries(farm.items).filter(([, n]) => n > 0);
    if (!items.length) parts.push(el('p', 'social-note', tr('emptyStock')));
    const sellable = items.filter(([item]) => farm.market.prices[item]);
    const feed = items.filter(([item]) => FEED_ITEMS.includes(item) && !farm.market.prices[item]);
    for (const [item, count] of sellable) {
      const row = el('div', 'garden-shop-row');
      const text = el('div', 'friend-text');
      text.append(el('b', '', `${itemName(item)} ×${count}`), el('span', 'friend-sub', tr('priceToday', { price: farm.market.prices[item] })));
      row.append(
        text,
        button('chip', tr('sell1'), () => act('sell', { item, quantity: 1 }), busy),
        button('chip', tr('sellAll'), () => act('sell', { item, quantity: count }), busy),
      );
      if (item !== 'egg') row.append(button('chip primary', `🙏 ${tr('offer')}`, () => act('offer', { item, quantity: 1 }), busy));
      parts.push(row);
    }
    if (feed.length) {
      parts.push(el('h3', '', tr('keepFeed')));
      const line = el('p', 'social-note', feed.map(([item, n]) => `${itemName(item)} ×${n}`).join(' · '));
      parts.push(line);
    }
    parts.push(el('h3', '', tr('more')));
    const upgrades = [];
    if (farm.expand) upgrades.push([tr('expandRow', { n: farm.expand.slot, level: farm.expand.level, price: farm.expand.price }), () => act('expand', {}), !farm.expand.ready || farm.coins < farm.expand.price]);
    const storage = farm.storage.next;
    upgrades.push(storage
      ? [tr('storageRow', { cap: storage.capacity, level: storage.level, price: storage.price }), () => act('upgrade', { target: 'storage' }), !storage.ready || farm.coins < storage.price]
      : [`${tr('stock', { used: farm.storage.used, cap: farm.storage.capacity })} · ${tr('maxed')}`, null, true]);
    for (const [label, onClick, disabled] of upgrades) parts.push(button('farm-secondary', label, onClick || (() => {}), disabled || busy));
    sheet.replaceChildren(...parts);
  }

  // ---- Hàng xóm: sổ ghé thăm hôm nay, điểm phước, danh sách ruộng bạn (thăm / tặng) ----
  const shopRow = (title, sub, ...buttons) => {
    const row = el('div', 'garden-shop-row');
    const text = el('div', 'friend-text');
    text.append(el('b', '', title));
    if (sub) text.append(el('span', 'friend-sub', sub));
    row.append(text, ...buttons);
    return row;
  };
  const time = (at) => new Date(at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  function renderNeighbors() {
    const parts = [button('mala-back', `‹ ${tr('close')}`, close), el('h2', '', `🏡 ${tr('neighbors')}`)];
    if (!account() || !farm) {
      parts.push(el('p', 'social-note', tr('signIn')), button('garden-main', tr('signInButton'), () => { close(); openSignIn?.(); }));
      sheet.replaceChildren(...parts);
      return;
    }
    parts.push(el('p', 'social-note', tr('neighborsNote', { help: HELP_PER_FARM, cap: neighborCap, take: TAKE_PER_FARM })));
    parts.push(el('h3', '', tr('today')));
    const visitors = farm.visitors || [];
    if (!visitors.length) parts.push(el('p', 'social-note', tr('noVisitors')));
    for (const row of visitors.slice(0, 12)) parts.push(el('p', 'farm-log', `${time(row.at)} · ${visitorLine(row)}`));
    parts.push(el('p', 'farm-blessings', tr('blessings', { n: farm.blessings || 0 })));
    parts.push(el('h3', '', tr('neighbors')));
    if (!neighbors) parts.push(el('p', 'social-note', tr('working')));
    else if (!neighbors.length) parts.push(el('p', 'social-note', tr('noNeighbors')));
    for (const item of neighbors || []) {
      const needs = [item.needs.water ? `💧${item.needs.water}` : '', item.needs.tend ? `🌿${item.needs.tend}` : '', item.needs.feed ? '🌽' : ''].filter(Boolean).join(' ');
      const sub = [tr('level', { n: item.level }), needs || tr('allGood'), item.basket ? tr('basketHas', { n: item.basket }) : '', `🤝 ${item.helped}/${item.helpMax}`, `🙏 ${item.blessings}`].filter(Boolean).join(' · ');
      parts.push(shopRow(item.name, sub,
        button('chip primary', `🏡 ${tr('visit')}`, () => visitNeighbor(item), busy),
        button('chip', `🎁 ${tr('gift')}`, () => show({ type: 'gift', friend: item }), busy)));
    }
    sheet.replaceChildren(...parts);
  }
  function renderGift() {
    const friend = open.friend;
    const parts = [button('mala-back', tr('backNeighbors'), openNeighbors), el('h2', '', tr('giftTitle', { name: friend.name })), el('p', 'social-note', tr('giftNote', { n: GIFT_PER_DAY, max: GIFT_MAX }))];
    const items = Object.entries(farm?.items || {}).filter(([item, count]) => count > 0 && SHAREABLE.includes(item));
    if (!items.length) parts.push(el('p', 'social-note', tr('emptyStock')));
    const to = friend.bot ? { bot: friend.bot } : { friend: friend.accountId };
    for (const [item, count] of items) {
      const buttons = [button('chip primary', `🎁 ${tr('give', { n: 1 })}`, () => act('gift', { ...to, item, quantity: 1 }), busy)];
      if (count > 1) buttons.push(button('chip', tr('give', { n: Math.min(count, GIFT_MAX) }), () => act('gift', { ...to, item, quantity: Math.min(count, GIFT_MAX) }), busy));
      parts.push(shopRow(`${itemName(item)} ×${count}`, '', ...buttons));
    }
    sheet.replaceChildren(...parts);
  }
  // Rổ chia sẻ: ruộng mình thì bỏ vào / lấy lại; ruộng hàng xóm thì lấy (tối đa 2 món mỗi ngày).
  function renderBasket() {
    const parts = [button('mala-back', `‹ ${tr('close')}`, close)];
    const target = { kind: 'basket' };
    if (visiting) {
      const { farm: other, takes } = visiting.visit;
      parts.push(el('h2', '', `🧺 ${tr('basketOf', { name: visiting.owner.name })}`), el('p', 'social-note', tr('basketVisitNote', { take: TAKE_PER_FARM })));
      parts.push(el('p', 'farm-blessings', tr('visitNote', { done: visiting.visit.helps.done, max: visiting.visit.helps.max, left: takes.left })));
      const entries = Object.entries(other.basket || {}).filter(([, count]) => count > 0);
      if (!entries.length) parts.push(el('p', 'social-note', tr('emptyBasket')));
      for (const [item, count] of entries) parts.push(shopRow(`${itemName(item)} ×${count}`, '', button('chip primary', `🧺 ${tr('take', { n: 1 })}`, () => act('take', { item, quantity: 1 }, { kind: 'collect', target }), busy || takes.left < 1)));
      sheet.replaceChildren(...parts);
      return;
    }
    parts.push(el('h2', '', `🧺 ${tr('basketTitle')}`));
    if (!account() || !farm) {
      parts.push(el('p', 'social-note', tr('signIn')), button('garden-main', tr('signInButton'), () => { close(); openSignIn?.(); }));
      sheet.replaceChildren(...parts);
      return;
    }
    const inside = Object.entries(farm.basket?.items || {}).filter(([, count]) => count > 0);
    const used = inside.reduce((sum, [, count]) => sum + count, 0);
    const max = farm.basket?.max || 20;
    parts.push(el('p', 'social-note', tr('basketNote', { take: TAKE_PER_FARM })), el('p', 'farm-blessings', tr('blessings', { n: farm.blessings || 0 })));
    parts.push(el('h3', '', tr('inBasket', { used, max })));
    if (!inside.length) parts.push(el('p', 'social-note', tr('emptyBasket')));
    for (const [item, count] of inside) {
      parts.push(shopRow(`${itemName(item)} ×${count}`, '', button('chip', `${tr('takeBack')} 1`, () => act('unshare', { item, quantity: 1 }), busy),
        ...(count > 1 ? [button('chip', `${tr('takeBack')} ${count}`, () => act('unshare', { item, quantity: count }), busy)] : [])));
    }
    parts.push(el('h3', '', tr('putIn')));
    const stock = Object.entries(farm.items).filter(([item, count]) => count > 0 && SHAREABLE.includes(item));
    if (!stock.length) parts.push(el('p', 'social-note', tr('emptyStock')));
    const room = max - used;
    for (const [item, count] of stock) {
      const many = Math.min(count, room, 5);
      parts.push(shopRow(`${itemName(item)} ×${count}`, farm.market.prices[item] ? tr('priceToday', { price: farm.market.prices[item] }) : '',
        button('chip primary', tr('put', { n: 1 }), () => act('share', { item, quantity: 1 }, { kind: 'collect', target }), busy || room < 1),
        ...(many > 1 ? [button('chip', tr('put', { n: many }), () => act('share', { item, quantity: many }, { kind: 'collect', target }), busy)] : [])));
    }
    sheet.replaceChildren(...parts);
  }

  const SHEETS = { market: () => renderMarket(), neighbors: () => renderNeighbors(), gift: () => renderGift(), basket: () => renderBasket() };
  function renderOpen() {
    if (!open) return;
    if (SHEETS[open.type]) {
      const scroll = sheet.scrollTop;
      SHEETS[open.type]();
      sheet.scrollTop = scroll;
      return;
    }
    const scroll = card.scrollTop;
    card.replaceChildren(...(open.type === 'plot' ? renderPlot(open.slot) : renderPen(open.type)));
    card.scrollTop = scroll;
  }
  function show(next) {
    open = next;
    card.hidden = Boolean(SHEETS[next.type]);
    sheet.hidden = !SHEETS[next.type];
    renderOpen();
    clearInterval(tickTimer);
    tickTimer = setInterval(() => { if (!busy && open && !SHEETS[open.type]) renderOpen(); }, 1_000);
  }
  function openMarket() {
    show({ type: 'market' });
    load();
  }
  function openNeighbors() {
    show({ type: 'neighbors' });
    markSeen();
    renderHud();
    loadNeighbors();
  }
  function close() {
    open = null;
    card.hidden = true;
    sheet.hidden = true;
    clearInterval(tickTimer);
  }

  onLangChange(() => {
    draw();
    renderHud();
    renderOpen();
  });

  return {
    // Chạm vào ô / chuồng / quầy trong cảnh.
    onTap(target) {
      if (visiting && target.kind === 'market') {
        showToast(tr('marketVisit'));
        return;
      }
      if (target.kind === 'plot') show({ type: 'plot', slot: target.slot });
      else if (target.kind === 'coop' || target.kind === 'barn') show({ type: target.kind });
      else if (target.kind === 'market') show({ type: 'market' });
      else if (target.kind === 'basket') show({ type: 'basket' });
      if (visiting) refreshVisit();
      else if (!farm && account()) load();
    },
    // Khu nhân vật đang đứng (explore báo): vào Phước Điền thì tải nông trại, hiện thanh nông trại.
    setPlace(next) {
      place = next;
      if (place === 'myfarm') load();
      else {
        clearTimeout(refreshTimer);
        if (open) close();
        // Ra khỏi khu là thôi thăm: lần sau vào thấy lại ruộng mình.
        if (visiting) {
          visiting = null;
          draw();
        }
      }
      renderHud();
    },
    start() {
      draw();
      load();
    },
    accountChanged() {
      farm = null;
      visiting = null;
      neighbors = null;
      draw();
      load();
      renderHud();
      renderOpen();
    },
    refresh: load,
    // Chỉ để kiểm tra / quay video: dữ liệu đang vẽ.
    debug: () => ({ farm, place, open, visiting, neighbors }),
    // Chỉ để kiểm tra: mở bảng Hàng xóm / thăm một hàng xóm trong danh sách.
    openNeighbors,
    visit: (item) => visitNeighbor(item),
  };
}
