// Giao diện chế độ nhập vai ở chánh điện 3D: cần điều khiển ảo (màn cảm ứng), thanh động tác (đứng, quỳ, lạy 3,
// lạy 108), gửi vị trí lên server và đưa vị trí/động tác của mọi người vào bộ vẽ. Chữ theo ngôn ngữ phòng.
import { createExplorePlugin } from '/engine/explore3d.mjs';
import { lang, onLangChange, t } from '/thien-i18n.js';
import { SUTRAS, sutraById, sutraTitle } from '/sutras.js';


export function createExploreUI({ stage, session, showToast, extraButtons = [], onWalkerTap, onSpiritTap, onGardenTap, onMemorialTap, onGuideTap, onMeritBoardTap, onPlaceChange, gardenLabel, travelHost = stage, exits = [] }) {
  // Luống vườn mới nhất (đưa lại cho bộ vẽ khi bộ vẽ được tạo sau).
  const gardenPlots = new Map();
  const memorialGraves = new Map();
  // Vào lại phòng (vd: vừa đăng nhập): xuất hiện lại đúng chỗ đang đứng thay vì ở cửa chánh điện.
  let resumePose = null;
  let arrival = null;
  let api = null;
  let lastState = [];
  let spawnSentFor = null;
  // Khóa đi lại: phòng đủ người đi lại (xem như khán giả) hoặc đang chơi trốn tìm (đứng yên theo pha).
  let walkersFull = false;
  let gameLock = false;
  let hiddenDecor = [];
  let roleMarks = {};

  const benchPoint = (bench, localX, localZ) => {
    const scale = bench.scale || 1;
    const ry = bench.ry || 0;
    return {
      x: bench.x + (localX * Math.cos(ry) + localZ * Math.sin(ry)) * scale,
      z: bench.z + (-localX * Math.sin(ry) + localZ * Math.cos(ry)) * scale,
    };
  };
  function benchPose(person) {
    if (!person.benchId || !person.benchSpot) return null;
    const bench = renderer?.scene?.world?.courtyard?.benches?.find((item) => item.id === person.benchId);
    if (!bench) return null;
    const side = person.benchSpot === 1 ? -1 : 1;
    // Xích đu / cầu tuột: engine tự tính dáng theo thời gian; đây chỉ là gốc (ghế xích đu bên trái/phải, tâm cầu tuột).
    if (bench.kind) {
      return {
        ...benchPoint(bench, bench.kind === 'swing' ? side * 0.75 : 0, 0),
        ry: Math.atan2(Math.sin((bench.ry || 0) + Math.PI), Math.cos((bench.ry || 0) + Math.PI)),
        benchY: 0,
      };
    }
    return {
      ...benchPoint(bench, side * 0.48, 0),
      ry: Math.atan2(Math.sin((bench.ry || 0) + Math.PI), Math.cos((bench.ry || 0) + Math.PI)),
      benchY: 0.71 * (bench.scale || 1),
    };
  }
  function sitOnBench(bench) {
    const mine = lastState.find((person) => person.id === session.participantId);
    if (mine?.benchId === bench.id) return;
    const occupied = lastState.filter((person) => person.benchId === bench.id).length;
    if (occupied >= (bench.seats || 2)) {
      showToast(t(bench.kind ? 'park.full' : 'err.BENCH_FULL'));
      return;
    }
    // Đi tới trước ghế (xích đu / cầu tuột: điểm chờ approach) rồi mới xin chỗ; server quyết định spot 1/2 để chống
    // hai người bấm cùng lúc.
    const [approachX, approachZ] = Array.isArray(bench.approach) ? bench.approach : [0, 0.95];
    const approach = benchPoint(bench, approachX, approachZ);
    api?.walkTo(approach, () => session.send({
      type: 'bench.select', requestId: `bench-${crypto.randomUUID()}`, benchId: bench.id,
    }));
  }

  // ---- Thanh động tác: Đứng, Quỳ, ▾ (bấm xổ ra: Lạy ▸, Tụng kinh ▸, các nút thêm như Tràng hạt, Viết sớ) ----
  const bar = document.createElement('div');
  bar.className = 'emote-bar';
  bar.hidden = true;
  const makeButton = (kind, className = 'chip', sutra = null) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    if (kind) button.dataset.emote = kind;
    if (sutra) button.dataset.sutra = sutra;
    return button;
  };
  // Nhóm trong menu: bấm tên nhóm để mở/đóng danh sách con (chỉ mở một nhóm một lúc).
  const groups = [];
  function group(options) {
    const wrap = document.createElement('div');
    wrap.className = 'more-group';
    const head = makeButton(null, 'option more-head');
    head.setAttribute('aria-expanded', 'false');
    const list = document.createElement('div');
    list.className = 'more-list';
    list.hidden = true;
    list.append(...options);
    wrap.append(head, list);
    const item = {
      wrap, head, options,
      open(next) {
        list.hidden = !next;
        head.setAttribute('aria-expanded', String(next));
        if (next) for (const other of groups) if (other !== item) other.open(false);
      },
    };
    head.addEventListener('click', () => item.open(list.hidden));
    groups.push(item);
    return item;
  }
  const stand = makeButton('stand');
  const kneel = makeButton('kneel');
  // ✨ Tương tác (ngoài sân, thay cho nút Nhún nhảy cũ): mỗi lần bấm chạy ngẫu nhiên một động tác trong file nhân vật
  // hoặc một kiểu nhún nhảy bằng code, không lặp lại động tác vừa làm.
  const act = makeButton('act');
  const bows = group([makeButton('bow3', 'option'), makeButton('bow108', 'option')]);
  const chants = group([makeButton('woodfish', 'option'), ...SUTRAS.map((sutra) => makeButton('chant', 'option', sutra.id))]);
  const more = document.createElement('div');
  more.className = 'emote-menu';
  const moreToggle = makeButton(null, 'chip more-toggle');
  moreToggle.setAttribute('aria-haspopup', 'menu');
  moreToggle.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.className = 'emote-options more-panel';
  panel.setAttribute('role', 'menu');
  panel.hidden = true;
  // Nút thêm (Tràng hạt, Viết sớ…) được chuyển vào menu nguyên vẹn, giữ sự kiện đã gắn. Nút vốn có chỗ trên trang
  // (Viết sớ) trả về chỗ cũ khi không ở chế độ nhập vai (2D), để vẫn dùng được.
  const homes = extraButtons.map((button) => ({ button, parent: button.parentNode, next: button.nextSibling }));
  panel.append(bows.wrap, chants.wrap);
  function placeExtras(inMenu) {
    for (const { button, parent, next } of homes) {
      if (inMenu || !parent) {
        button.classList.add('more-extra');
        panel.append(button);
      } else if (button.parentNode !== parent) {
        button.classList.remove('more-extra');
        parent.insertBefore(button, next?.parentNode === parent ? next : null);
      }
    }
  }
  more.append(panel, moreToggle);
  bar.append(stand, kneel, act, more);
  function openMore(next) {
    panel.hidden = !next;
    moreToggle.setAttribute('aria-expanded', String(next));
    moreToggle.textContent = next ? '▴' : '▾';
    if (!next) for (const item of groups) item.open(false);
  }
  moreToggle.addEventListener('click', () => openMore(panel.hidden));
  const label = () => {
    for (const button of [stand, kneel, ...bows.options, chants.options[0]]) button.textContent = t(`emote.${button.dataset.emote}`);
    act.textContent = `✨ ${t('emote.act')}`;
    for (const button of chants.options.slice(1)) button.textContent = sutraTitle(sutraById(button.dataset.sutra), lang());
    bows.head.textContent = `🙇 ${t('emote.bow')} ▸`;
    chants.head.textContent = `📿 ${t('emote.chant')} ▸`;
    moreToggle.title = t('emote.more');
    moreToggle.setAttribute('aria-label', t('emote.more'));
  };
  label();
  openMore(false);
  onLangChange(label);
  document.addEventListener('pointerdown', (event) => { if (!more.contains(event.target)) openMore(false); });
  bar.addEventListener('click', (event) => {
    if (event.target.closest('.more-extra')) {
      openMore(false);
      return;
    }
    const button = event.target.closest('button[data-emote]');
    if (!button) return;
    openMore(false);
    const { emote: kind, sutra } = button.dataset;
    session.send({ type: 'emote', requestId: `emote-${crypto.randomUUID()}`, kind, ...(sutra ? { sutra } : {}) });
  });

  // ---- Cần điều khiển ảo: kéo trong vòng tròn, buông là dừng ----
  const pad = document.createElement('div');
  pad.className = 'joystick';
  pad.hidden = true;
  const knob = document.createElement('i');
  pad.append(knob);
  let padPointer = null;
  function padMove(event) {
    const rect = pad.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = (event.clientX - rect.left - radius) / radius;
    let dy = (event.clientY - rect.top - radius) / radius;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    knob.style.transform = `translate(${dx * radius * 0.55}px, ${dy * radius * 0.55}px)`;
    api?.setJoystick(dx, -dy);
  }
  pad.addEventListener('pointerdown', (event) => {
    padPointer = event.pointerId;
    pad.setPointerCapture(event.pointerId);
    padMove(event);
  });
  pad.addEventListener('pointermove', (event) => { if (event.pointerId === padPointer) padMove(event); });
  const release = (event) => {
    if (event.pointerId !== padPointer) return;
    padPointer = null;
    knob.style.transform = '';
    api?.setJoystick(0, 0);
  };
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);

  // Khi lại gần bồ đoàn / ghế đá còn chỗ, engine báo target gần nhất và UI mới hiện nút này.
  // Không gửi message chọn chỗ chỉ vì người dùng chạm vật từ xa.
  const sitNearby = document.createElement('button');
  sitNearby.type = 'button';
  sitNearby.className = 'near-sit';
  sitNearby.hidden = true;
  // Gần xích đu / cầu tuột thì nút ghi "Đu xích đu" / "Chơi cầu tuột".
  const labelSitNearby = () => {
    const play = sitNearby.dataset.play;
    sitNearby.textContent = t(play === 'swing' ? 'park.swing' : play === 'slide' ? 'park.slide' : 'explore.sitDown');
  };
  labelSitNearby();
  sitNearby.addEventListener('click', () => api?.activateNearby?.());
  onLangChange(labelSitNearby);

  // Công việc chỉ hiện khi nhân vật đã đứng trong bán kính của điểm việc. Snapshot từ server quyết định tiến độ
  // và danh sách người đang làm; client không tự cộng để nhiều máy luôn nhìn cùng một kết quả.
  const choreButton = document.createElement('button');
  choreButton.type = 'button';
  choreButton.className = 'temple-chore';
  choreButton.hidden = true;
  let nearbyChore = null;
  let choreStates = new Map();
  let lastCompletedAt = 0;
  const choreIcons = { sweep: '🧹', water: '🚿', light: '🏮', feed: '🐟', clean: '🧽', tea: '🍵' };
  function renderChore() {
    const state = nearbyChore && choreStates.get(nearbyChore.id);
    const mine = Boolean(state?.workers?.includes(session.participantId));
    choreButton.hidden = !nearbyChore;
    if (!nearbyChore) return;
    const percent = Math.round((state?.progress || 0) / 10);
    const count = state?.workers?.length || 0;
    const title = t(`chore.${nearbyChore.kind}`);
    choreButton.textContent = `${choreIcons[nearbyChore.kind] || '✨'} ${mine ? t('chore.stop') : title} · ${percent}%${count > 1 ? ` · ${t('chore.together', { n: count })}` : ''}`;
    choreButton.classList.toggle('working', mine);
    choreButton.setAttribute('aria-pressed', String(mine));
    choreButton.style.setProperty('--chore-progress', `${percent}%`);
  }
  choreButton.addEventListener('click', () => {
    if (!nearbyChore) return;
    const state = choreStates.get(nearbyChore.id);
    const mine = Boolean(state?.workers?.includes(session.participantId));
    session.send({
      type: mine ? 'chore.stop' : 'chore.start',
      requestId: `chore-${crypto.randomUUID()}`,
      choreId: nearbyChore.id,
    });
  });
  onLangChange(renderChore);

  // Lại gần một chó/mèo mới hiện bảng tương tác. Client chỉ chọn thú và hành động; server xác nhận người chơi
  // đang ở trong khu, giới hạn spam rồi phát một pet.interaction để mọi máy cùng chạy hiệu ứng.
  const petActions = document.createElement('div');
  petActions.className = 'pet-actions';
  petActions.hidden = true;
  const petName = document.createElement('strong');
  // Biểu tượng theo loài; nút có lời riêng từng loài (pet.<loài>.<hành động>), thiếu thì dùng lời chung.
  const petIcons = { dog: '🐕', cat: '🐈', rabbit: '🐇', duck: '🦆', goat: '🐐', pig: '🐖', deer: '🦌', pony: '🐴' };
  const petLabel = (type, action) => {
    const own = t(`pet.${type}.${action}`);
    return own === `pet.${type}.${action}` ? t(`pet.${action}`) : own;
  };
  const petButtons = ['pet', 'feed', 'play', 'trick'].map((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.petAction = action;
    petActions.append(button);
    return button;
  });
  petActions.prepend(petName);
  let nearbyPet = null;
  function renderPet() {
    petActions.hidden = !nearbyPet;
    if (!nearbyPet) return;
    petName.textContent = `${petIcons[nearbyPet.type] || '🐾'} ${nearbyPet.name}`;
    petButtons.forEach((button) => { button.textContent = petLabel(nearbyPet.type, button.dataset.petAction); });
  }
  petActions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-pet-action]');
    if (!button || !nearbyPet) return;
    session.send({
      type: 'pet.interact', requestId: `pet-${crypto.randomUUID()}`, petId: nearbyPet.id, action: button.dataset.petAction,
    });
  });
  onLangChange(renderPet);

  // Đi nhanh tới trước các khu chính. Server giữ tọa độ thật; trình duyệt chỉ gửi tên đích để không thể sửa lệnh
  // thành dịch chuyển xuyên vật thể. Nút nằm cùng thanh tên phòng nên luôn dễ thấy mà không che cảnh.
  const travel = document.createElement('div');
  travel.className = 'quick-travel';
  travel.hidden = true;
  const travelToggle = document.createElement('button');
  travelToggle.type = 'button';
  travelToggle.className = 'chip quick-travel-toggle';
  travelToggle.setAttribute('aria-haspopup', 'menu');
  const travelPanel = document.createElement('div');
  travelPanel.className = 'quick-travel-panel';
  travelPanel.setAttribute('role', 'menu');
  travelPanel.hidden = true;
  // exits: map khác (vd: rạp phim) — { id, icon, go() }; bấm vào thì trang tự chuyển, không gửi travel.go.
  const travelIcons = { hall: '🛕', courtyard: '🌳', park: '🛝', flowers: '🌸', garden: '🌱', pets: '🐾', farm: '🐐', memorial: '🪦', ...Object.fromEntries(exits.map((exit) => [exit.id, exit.icon])) };
  const travelButtons = ['hall', 'courtyard', 'park', 'flowers', 'garden', 'pets', 'farm', 'memorial', ...exits.map((exit) => exit.id)].map((destination) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.destination = destination;
    button.setAttribute('role', 'menuitem');
    travelPanel.append(button);
    return button;
  });
  let currentPlace = null;
  function openTravel(next) {
    travelPanel.hidden = !next;
    travelToggle.setAttribute('aria-expanded', String(next));
  }
  function labelTravel() {
    travelToggle.textContent = `📍 ${t('travel.quick')} ▾`;
    travelToggle.setAttribute('aria-label', t('travel.quick'));
    travelButtons.forEach((button) => {
      const { destination } = button.dataset;
      button.textContent = `${travelIcons[destination]} ${t(`travel.${destination}`)}`;
      button.setAttribute('aria-current', String(destination === currentPlace));
    });
  }
  function setPlace(place) {
    currentPlace = place;
    labelTravel();
    onPlaceChange?.(place);
  }
  labelTravel();
  onLangChange(labelTravel);
  travelToggle.addEventListener('click', () => openTravel(travelPanel.hidden));
  function goTo(destination) {
    if (!travelButtons.some((button) => button.dataset.destination === destination)) return false;
    if (destination === currentPlace) {
      openTravel(false);
      return true;
    }
    const exit = exits.find((item) => item.id === destination);
    if (exit) {
      openTravel(false);
      exit.go();
      return true;
    }
    const sent = session.send({
      type: 'travel.go', requestId: `travel-${crypto.randomUUID()}`, destination,
    });
    if (!sent) showToast(t('toast.reconnecting'));
    openTravel(false);
    return sent;
  }
  travelPanel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-destination]');
    if (!button) {
      openTravel(false);
      return;
    }
    goTo(button.dataset.destination);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!travel.contains(event.target) && !travelPanel.contains(event.target)) openTravel(false);
  });
  travel.append(travelToggle);
  // Đặt trước đồng hồ bài giảng: khi YouTube đang mở, iframe ở dưới không được phép bị HUD phủ lên và cũng
  // không được che mất nút đi nhanh.
  const lectureChip = travelHost.querySelector?.('#eventChip');
  travelHost.insertBefore(travel, lectureChip || null);
  stage.append(travelPanel);

  stage.append(bar, pad, sitNearby, choreButton, petActions);

  // Đặt thanh động tác và cần điều khiển ngay trên dải lễ vật (dải này cao thấp tùy nút đang có).
  const controls = document.getElementById('controls');
  function place() {
    if (!controls || controls.hidden) return;
    const gap = stage.getBoundingClientRect().bottom - controls.getBoundingClientRect().top + 8;
    bar.style.bottom = `${gap}px`;
    pad.style.bottom = `${gap + bar.offsetHeight + 10}px`;
    sitNearby.style.bottom = `${gap + bar.offsetHeight + 18}px`;
    choreButton.style.bottom = `${gap + bar.offsetHeight + 18}px`;
    petActions.style.bottom = `${gap + bar.offsetHeight + 18}px`;
  }
  if (controls) new ResizeObserver(place).observe(controls);
  new ResizeObserver(place).observe(stage);

  function showControls(on) {
    bar.hidden = !on;
    travel.hidden = !on;
    if (!on) openTravel(false);
    placeExtras(on);
    pad.hidden = !on || !matchMedia('(pointer: coarse)').matches;
    if (!on) sitNearby.hidden = true;
    if (!on) choreButton.hidden = true;
    if (!on) petActions.hidden = true;
    if (on) requestAnimationFrame(place);
  }

  // Người đang đứng/đi (không ngồi bồ đoàn) do bộ nhập vai vẽ; người ngồi do bộ vẽ chánh điện vẽ như cũ.
  function push() {
    if (!api || !session.participantId) return;
    // Chỗ đã có người (bồ đoàn, ghế đá): vòng sáng chỉ hiện ở chỗ còn trống.
    const benches = {};
    for (const person of lastState) if (person.benchId) benches[person.benchId] = (benches[person.benchId] || 0) + 1;
    api.setOccupancy?.({ seats: lastState.map((person) => person.seatId).filter(Boolean), benches });
    const meId = session.participantId;
    const me = lastState.find((person) => person.id === meId);
    // Người rớt mạng (đang trong thời gian giữ chỗ) không hiện thành nhân vật đi lại.
    const list = lastState.filter((person) => !person.seatId && person.connected !== false && (person.pos || person.benchId || person.id === meId)).map((person) => {
      const seated = benchPose(person);
      return {
        id: person.id,
        name: person.displayName,
        skin: `c_${person.skin || 'man'}`,
        me: person.id === meId,
        pos: seated || person.pos || (person.id === meId ? resumePose : null) || null,
        benchId: person.benchId || null,
        benchSpot: person.benchSpot || null,
        benchY: seated?.benchY || 0,
        emote: person.emote || null,
        status: statusOf(person.emote, person.sutra),
        handWith: person.handWith || null,
        handLead: Boolean(person.handLead),
        // Linh thú đang dẫn theo: engine tự vẽ đi theo sau lưng.
        pet: person.pet || null,
      };
    });
    // Vừa từ map khác về (vd: rạp phim → "Khu vườn"): xin server đặt mình ở khu đã chọn thay vì cửa chánh điện.
    if (me && arrival) {
      spawnSentFor = meId;
      session.send({ type: 'travel.go', requestId: `travel-${crypto.randomUUID()}`, destination: arrival });
      arrival = null;
    } else if (me && !me.pos && !me.seatId && !me.benchId && spawnSentFor !== meId) {
      // Mới vào: báo chỗ xuất hiện (cửa chánh điện) để người khác thấy mình ngay, không phải đợi mình bước đi.
      spawnSentFor = meId;
      const spawn = resumePose || api.spawn;
      resumePose = null;
      session.send({ type: 'move', x: spawn.x, z: spawn.z, ry: spawn.ry ?? 0, moving: false });
    }
    // Mình đang ngồi: vẫn giữ nhân vật (ẩn) ở chỗ bồ đoàn để bấm đi là đứng dậy tại đó.
    const seatedSelf = Boolean(me?.seatId);
    if (seatedSelf) {
      const seat = api && renderer?.scene?.world?.seats?.find((item) => item.id === me.seatId);
      list.push({ id: meId, name: me.displayName, skin: `c_${me.skin || 'man'}`, me: true, pos: seat ? { x: seat.x, z: seat.z + 0.45, ry: 0 } : null });
    }
    api.setWalkers(list, { seatedSelf });
  }

  // Nhãn trên đầu khi tụng kinh / gõ mõ.
  function statusOf(kind, sutraId) {
    if (kind === 'woodfish') return `🪘 ${t('emote.woodfish')}`;
    const sutra = kind === 'chant' && sutraById(sutraId);
    if (!sutra) return null;
    return `📿 ${sutra.repeat ? t('chant.niem') : t('chant.status', { title: sutraTitle(sutra, lang()) })}`;
  }

  let renderer = null;
  return {
    // Gắn vào createTempleRenderer3D({ plugin }); sau khi tạo bộ vẽ gọi attach(renderer).
    plugin: createExplorePlugin({
      onMove: (position) => session.send({ type: 'move', ...position }),
      // Người đi theo tự điều khiển nhân vật: buông tay (server báo hand.state cho cả hai).
      onHandBreak: () => session.send({ type: 'hand.release', requestId: `social-${crypto.randomUUID()}` }),
      onWalkerTap: (id) => onWalkerTap?.(id),
      onSpiritTap: (target) => onSpiritTap?.(target),
      // Chó mèo đã có bảng hành động riêng khi lại gần nên không thêm chữ.
      hintText: (kind) => (kind === 'pet' ? '' : t({ plot: 'garden.hintPlot', shop: 'garden.hintShop', grave: 'memorial.hint', guide: 'explore.hintGuide', merit: 'explore.hintMerit', swing: 'park.hintSwing', slide: 'park.hintSlide' }[kind] || 'explore.tapToSit')),
      onGardenTap: (target) => onGardenTap?.(target),
      onMemorialTap: (target) => onMemorialTap?.(target),
      onGuideTap: (place) => onGuideTap?.(place),
      onMeritBoardTap: () => onMeritBoardTap?.(),
      onPetTap: (target) => {
        nearbyPet = target;
        renderPet();
        requestAnimationFrame(place);
      },
      gardenLabel: (plot) => gardenLabel?.(plot) || '',
      onBenchTap: sitOnBench,
      onNearbyChange: (target) => {
        sitNearby.hidden = !target;
        sitNearby.dataset.kind = target?.kind || '';
        sitNearby.dataset.play = target?.play || '';
        labelSitNearby();
        if (target) requestAnimationFrame(place);
      },
      onNearbyChoreChange: (target) => {
        nearbyChore = target;
        renderChore();
        if (target) requestAnimationFrame(place);
      },
      onNearbyPetChange: (target) => {
        nearbyPet = target;
        renderPet();
        if (target) requestAnimationFrame(place);
      },
      onPlaceChange: setPlace,
    }),
    attach(next) {
      renderer = next;
      api = next?.plugin || null;
      // Kiểm tra khi phát triển: localStorage 'debug-explore' = '1' thì window.chanhDienExplore là api.
      try { if (localStorage.getItem('debug-explore') === '1') Object.assign(window, { chanhDienExplore: api, chanhDienRenderer: next }); } catch {}
      showControls(Boolean(api) && Boolean(session.participantId));
      push();
      if (gardenPlots.size) api?.setGarden?.([...gardenPlots.values()]);
      api?.setMemorial?.([...memorialGraves.values()], { full: true });
      if (choreStates.size) api?.setChores?.([...choreStates.values()]);
      api?.setSpectator(walkersFull || gameLock);
      api?.setHiddenDecor?.(hiddenDecor);
      api?.setRoleMarks?.(roleMarks);
    },
    detach() {
      renderer = null;
      api = null;
      sitNearby.hidden = true;
      setPlace(null);
      showControls(false);
    },
    get active() {
      return Boolean(api);
    },
    // Bấm vào phòng: camera đứng sẵn ở chỗ sẽ xuất hiện trong lúc chờ server.
    previewSpawn() {
      api?.previewSpawn?.(resumePose || api.spawn);
    },
    // Vào phòng xong thì đi thẳng tới khu này, dùng khi quay về từ map khác.
    arriveAt(destination) {
      if (['hall', 'courtyard', 'park', 'flowers', 'garden', 'pets', 'farm', 'memorial'].includes(destination)) arrival = destination;
    },
    // Đi bộ tới một điểm (Tới chỗ bạn). Trả false khi chưa ở chế độ đi lại.
    walkTo(point, then) {
      return api?.walkTo?.(point, then) || false;
    },
    // Gọi trước khi rời phòng để vào lại ngay (đổi tài khoản): nhớ chỗ đang đứng.
    keepPosition() {
      resumePose = api?.selfPose?.() || null;
    },
    setGarden(list) {
      for (const plot of list) gardenPlots.set(plot.id, plot);
      api?.setGarden?.(list);
    },
    // Khu tưởng niệm: nhớ mộ để vẽ lại khi bộ vẽ 3D gắn lại.
    setMemorial(list, { full = false } = {}) {
      if (full) memorialGraves.clear();
      for (const item of list) {
        if (item.grave) memorialGraves.set(item.slot, item);
        else memorialGraves.delete(item.slot);
      }
      api?.setMemorial?.(list, { full });
    },
    gardenEffect(plotId, kind, plantType) {
      api?.gardenEffect?.(plotId, kind, plantType);
    },
    relabelGarden(list) {
      api?.relabelGarden?.(list);
    },
    onChores(message) {
      choreStates = new Map(message.chores.map((item) => [item.id, item]));
      api?.setChores?.(message.chores);
      renderChore();
      const completed = message.chores.find((item) => item.completedAt && item.completedAt > lastCompletedAt);
      if (completed) {
        lastCompletedAt = completed.completedAt;
        showToast(t('chore.complete', { task: t(`chore.${completed.kind}`) }));
      }
    },
    onChoreReward(message) {
      showToast(message.reward > 0
        ? t('chore.reward', { n: message.reward, count: message.count, limit: message.limit })
        : t('chore.rewardLimit', { limit: message.limit }));
    },
    onPetInteraction(message) {
      const pet = api?.petInteraction?.(message.petId, message.action);
      if (pet && message.participantId === session.participantId) {
        showToast(t('pet.done', { action: petLabel(pet.type, message.action), name: pet.name }));
      }
    },
    // Dùng lại đi nhanh an toàn cho nút hướng dẫn nhiệm vụ; chỉ nhận các đích đã có trong menu.
    goTo,
    onState(participants) {
      lastState = participants;
      showControls(Boolean(api) && Boolean(session.participantId));
      push();
    },
    onMoves(message) {
      api?.applyMoves(message.moves);
    },
    onEmote(message) {
      api?.emote(message.participantId, message.kind, message.at);
      api?.setStatus(message.participantId, statusOf(message.kind, message.sutra));
    },
    onError(message) {
      if (['INVALID_MESSAGE', 'UNKNOWN_MESSAGE_TYPE'].includes(message.code)
        && (message.requestId?.startsWith('bench-') || message.requestId?.startsWith('travel-') || message.requestId?.startsWith('chore-') || message.requestId?.startsWith('pet-'))) {
        showToast(t('err.SERVER_RESTART_REQUIRED'));
        return true;
      }
      if (message.requestId?.startsWith('chore-')) {
        showToast(t(`chore.err.${message.code}`));
        return true;
      }
      if (message.requestId?.startsWith('pet-')) {
        showToast(t(`pet.err.${message.code}`));
        return true;
      }
      if (message.code !== 'WALKERS_FULL') return false;
      walkersFull = true;
      api?.setSpectator(true);
      showToast(t('explore.full'));
      return true;
    },
    say(participantId, text) {
      return api?.say(participantId, text) || false;
    },
    // ---- Trốn tìm (hide-seek-ui.js) ----
    setGameLock(on) {
      gameLock = Boolean(on);
      api?.setSpectator(walkersFull || gameLock);
    },
    // Camera xem người id (null = về mình); trả false nếu người đó không có trong cảnh.
    setCameraFollow(id) {
      return api?.setCameraFollow?.(id) || false;
    },
    setHiddenDecor(ids) {
      hiddenDecor = [...ids];
      api?.setHiddenDecor?.(hiddenDecor);
    },
    // Trốn tìm: { id: 'seeker' } tô đỏ người đi tìm.
    setRoleMarks(marks) {
      roleMarks = { ...marks };
      api?.setRoleMarks?.(roleMarks);
    },
    // Những người đang có trong cảnh của mình (server đã lọc theo vai).
    visibleIds() {
      return lastState.map((person) => person.id);
    },
    // Chạm bồ đoàn: đi tới bồ đoàn rồi mới ngồi.
    sitAt(seat, sit) {
      const target = renderer?.scene?.world?.seats?.find((item) => item.id === seat.id);
      if (!api || !target) return sit();
      if (!api.walkTo({ x: target.x, z: target.z + 0.45 }, sit)) sit();
    },
    leave() {
      lastState = [];
      spawnSentFor = null;
      showControls(false);
      api?.setWalkers([]);
      nearbyChore = null;
      nearbyPet = null;
      choreStates.clear();
      choreButton.hidden = true;
      petActions.hidden = true;
    },
  };
}
