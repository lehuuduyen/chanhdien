// Âm thanh chánh điện: nhạc nền mp3 (chuyển bài có crossfade, hạ nhỏ khi đọc), chuông, mõ và tiếng lễ vật
// tổng hợp bằng Web Audio, lời đọc tiếng Việt xếp hàng. Mõ và chuông canh theo giờ server nên cả phòng nghe cùng nhịp.
const TRACKS = [
  { src: '/thien/assets/music/music1.mp3', name: 'Trăng trên rừng trúc' },
  { src: '/thien/assets/music/music2.mp3', name: 'Hơi thở ban mai' },
];
export const MO_PERIOD_MS = 1_150;
export const BELL_PERIOD_MS = 45_000;
const TTS_MAX_PENDING = 3;
const hasSpeech = 'speechSynthesis' in window;

export function createTempleAudio({ serverNow, onTrack, onVoice, onSpeaking }) {
  let context = null;
  let master = null;
  let musicGain = null;
  let musicEls = [];
  let trackIndex = 0;
  let muted = false;
  let moTimer = null;
  let bellTimer = null;
  let voice = null;
  let ttsLang = 'vi-VN';
  let lectureOn = false;
  let reciting = 0;
  let speechUnlocked = false;
  // Giữ tham chiếu câu đang đọc: iOS/Chrome Android có lúc thu hồi utterance và không bao giờ báo đọc xong.
  const speaking = new Set();

  // Giọng đúng ngôn ngữ phòng: người dùng đã chọn (nhớ theo ngôn ngữ) thì dùng, không thì giọng tốt nhất của
  // ngôn ngữ đó. Không gán giọng thì nhiều máy (Android) đọc bằng giọng mặc định hệ thống, thường là tiếng Anh.
  const voicePrefix = () => ttsLang.slice(0, 2).toLowerCase();
  function voicesForLang() {
    try {
      return speechSynthesis.getVoices().filter((item) => item.lang.toLowerCase().replace('_', '-').startsWith(voicePrefix()));
    } catch {
      return [];
    }
  }
  function pickVoice() {
    const voices = voicesForLang();
    let saved = null;
    try { saved = localStorage.getItem(`thien-voice-${voicePrefix()}`); } catch {}
    // Ưu tiên giọng có sẵn trong máy: giọng qua mạng (Google, "Online/Natural") phải tải từng câu nên giữa các câu
    // bị ngắt vài giây. Trong cùng loại thì giọng tự nhiên hơn đứng trước.
    const rank = (item) => (item.localService ? 10 : 0) + (/natural|neural|enhanced|premium/i.test(item.name) ? 2 : 0) + (/hoaimy|namminh|linh/i.test(item.name) ? 1 : 0);
    voice = voices.find((item) => item.name === saved) || voices.sort((a, b) => rank(b) - rank(a))[0] || null;
    onVoice?.(voice?.name || null);
  }
  if (hasSpeech) {
    pickVoice();
    speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
    // Một số điện thoại không phát voiceschanged: hỏi lại vài lần sau khi tải trang.
    for (const delay of [500, 1_500, 4_000]) setTimeout(() => { if (!voice) pickVoice(); }, delay);
  }

  // iPhone chỉ cho đọc sau khi câu đọc đầu tiên được gọi ngay trong lúc chạm màn hình (touchend/click, không phải
  // pointerdown); lời đọc khi người khác dâng lễ đến qua mạng sẽ bị chặn nếu chưa mở khóa. Mở khóa bằng một câu
  // ngắn có chữ (câu chỉ có khoảng trắng không mở khóa được), âm lượng 0; chỉ coi là xong khi máy báo đã bắt đầu đọc.
  // Chỉ thử một lần mỗi lần chạm hợp lệ và không bao giờ hủy câu đang đọc (trước đây mỗi lần chạm, kể cả kéo cần
  // điều khiển để đi, đều hủy hàng đọc nên đi lại là mất tiếng). Đang có câu trong hàng thì câu đó đã mở khóa.
  function unlockSpeech() {
    if (!hasSpeech || speechUnlocked) return;
    speechUnlocked = true;
    if (current || queue.length) return;
    try {
      const silent = new SpeechSynthesisUtterance('.');
      silent.volume = 0;
      silent.rate = 2;
      silent.lang = ttsLang;
      speechSynthesis.speak(silent);
    } catch {}
  }

  function resume(event) {
    if (event?.type !== 'pointerdown') unlockSpeech();
    // Chrome Android tự tạm dừng giọng đọc sau một lúc; gọi resume để chạy tiếp.
    if (hasSpeech && speechSynthesis.paused) speechSynthesis.resume();
    // Đang đọc: không đánh thức nhạc nền. Điện thoại tạm dừng nhạc khi giọng đọc phát; chạm màn hình mà bật lại nhạc
    // thì hệ điều hành chuyển âm thanh sang nhạc và cắt giọng đọc. Đọc xong sẽ tự bật lại (resumeMedia).
    if (isSpeaking()) return;
    resumeMedia();
  }
  function resumeMedia() {
    if (context && context.state !== 'running' && context.state !== 'closed') context.resume().catch(() => {});
    for (const item of musicEls) if (item.el.paused) item.el.play().catch(() => {});
  }
  function isSpeaking() {
    if (current || queue.length) return true;
    try { return hasSpeech && speechSynthesis.speaking; } catch { return false; }
  }
  // iPhone tính "thao tác người dùng" cho giọng đọc ở touchend/click, không phải pointerdown.
  for (const type of ['pointerdown', 'touchend', 'click']) document.addEventListener(type, resume, { passive: true });
  document.addEventListener('keydown', resume);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });

  function playTrack(index) {
    trackIndex = (index + TRACKS.length) % TRACKS.length;
    const track = TRACKS[trackIndex];
    const el = new Audio(track.src);
    el.preload = 'auto';
    const source = context.createMediaElementSource(el);
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(musicGain);
    const now = context.currentTime;
    gain.gain.linearRampToValueAtTime(1, now + 4);
    for (const old of musicEls) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + 4);
      setTimeout(() => old.el.pause(), 4_200);
    }
    musicEls = [{ el, gain }];
    el.addEventListener('timeupdate', () => {
      if (el.duration && el.duration - el.currentTime < 4 && !el.nextQueued) {
        el.nextQueued = true;
        playTrack(trackIndex + 1);
      }
    });
    el.addEventListener('error', () => {
      if (!el.nextQueued) {
        el.nextQueued = true;
        setTimeout(() => playTrack(trackIndex + 1), 2_000);
      }
    });
    el.play().catch(() => {});
    onTrack?.(track.name);
  }

  function duck(on) {
    if (!musicGain) return;
    const t = context.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(lectureOn ? 0 : on ? 0.18 : 0.55, t + 0.4);
  }

  function bell(big = false) {
    if (!context || muted) return;
    const t = context.currentTime;
    const k = big ? 1.6 : 1;
    for (const [frequency, amplitude, decay] of [[432, 0.5, 6], [1296, 0.18, 3.5], [2160, 0.08, 2.2]]) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency / (big ? 2 : 1);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(amplitude * k, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + decay * k);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(t);
      oscillator.stop(t + decay * k + 0.1);
    }
  }

  function knock(t, frequency, level = 0.18) {
    const oscillator = context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, t);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.48, t + 0.03);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 4;
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    oscillator.start(t);
    oscillator.stop(t + 0.12);
  }

  function chime(frequencies, level, decay) {
    const t = context.currentTime;
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const gain = context.createGain();
      const start = t + index * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0005, start + decay);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + decay + 0.05);
    });
  }

  // Hẹn nhịp kế tiếp theo giờ server: mọi máy cùng gõ mõ, cùng thỉnh chuông dù vào phòng lúc nào.
  function scheduleAligned(periodMs, run, setTimer) {
    const now = serverNow();
    const wait = periodMs - (now % periodMs);
    setTimer(setTimeout(() => {
      run();
      scheduleAligned(periodMs, run, setTimer);
    }, wait));
  }

  // ---- Hàng chờ giọng đọc: tự đọc từng câu một thay vì dồn vào hàng chờ của trình duyệt ----
  // iPhone / Chrome Android hay kẹt: một câu nằm chờ mãi không bắt đầu, các câu sau không bao giờ phát. Mỗi câu có
  // 2,5 giây để bắt đầu; quá hạn thì xóa hàng của trình duyệt và đọc lại câu đó một lần.
  const queue = [];
  let current = null;

  function dropCurrent() {
    if (!current) return;
    const entry = current;
    current = null;
    entry.dead = true;
    clearTimeout(entry.startTimer);
    clearTimeout(entry.endTimer);
    speaking.delete(entry.utterance);
    try { speechSynthesis.cancel(); } catch {}
  }

  // ---- Tụng kinh: đọc từng câu, mõ gõ đều (0,7 giây một tiếng) trên máy người tụng ----
  const CHANT_BEAT_MS = 700;
  let chantState = null;
  let chantTimer = null;
  function startWoodfish() {
    clearInterval(chantTimer);
    chantTimer = setInterval(() => {
      if (context && !muted && !document.hidden) knock(context.currentTime, 760, 0.3);
    }, CHANT_BEAT_MS);
  }
  function feedChant(state) {
    const items = state.lines.map((text, index) => ({
      text, rate: 0.9, pitch: 0.88, chant: true,
      onDone: index === state.lines.length - 1 ? () => {
        if (chantState !== state) return;
        if (state.repeat) feedChant(state);
        else {
          stopChant();
          state.onEnd?.();
        }
      } : null,
    }));
    queue.push(...items);
    pump();
  }
  function stopChant() {
    clearInterval(chantTimer);
    chantTimer = null;
    if (!chantState) return;
    chantState = null;
    for (let index = queue.length - 1; index >= 0; index -= 1) if (queue[index].chant) queue.splice(index, 1);
    if (current?.item.chant) {
      dropCurrent();
      if (!queue.length) {
        duck(false);
        setSpeaking(false);
      }
      pump();
    }
  }

  let speakingNow = false;
  function setSpeaking(on) {
    if (on === speakingNow) return;
    speakingNow = on;
    onSpeaking?.(on);
    // Đọc xong: bật lại nhạc nền nếu điện thoại đã tạm dừng nó trong lúc đọc.
    if (!on) setTimeout(() => { if (!isSpeaking()) resumeMedia(); }, 300);
  }

  function clearSpeech() {
    queue.length = 0;
    setSpeaking(false);
    dropCurrent();
    try { speechSynthesis.cancel(); } catch {}
    duck(false);
  }

  function pump() {
    if (current || !queue.length || muted || !hasSpeech) return;
    const item = queue.shift();
    const utterance = new SpeechSynthesisUtterance(item.text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || ttsLang;
    utterance.rate = item.rate;
    utterance.pitch = item.pitch;
    const entry = { item, utterance, started: false, dead: false };
    current = entry;
    speaking.add(utterance);
    const finish = () => {
      if (entry.dead || current !== entry) return;
      entry.dead = true;
      clearTimeout(entry.startTimer);
      clearTimeout(entry.endTimer);
      speaking.delete(utterance);
      current = null;
      item.onDone?.();
      if (!queue.length) {
        duck(false);
        setSpeaking(false);
      }
      pump();
    };
    utterance.onstart = () => {
      if (entry.dead) return;
      setSpeaking(true);
      entry.started = true;
      duck(true);
      clearTimeout(entry.startTimer);
      // Máy không báo đọc xong thì tự qua câu sau sau thời gian ước lượng.
      entry.endTimer = setTimeout(finish, 4_000 + (item.text.length * 200) / item.rate);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    entry.startTimer = setTimeout(() => {
      if (entry.dead || entry.started) return;
      // Nhiều điện thoại báo "bắt đầu đọc" rất trễ hoặc không báo: trình duyệt đang đọc thì coi như đã bắt đầu,
      // không hủy (trước đây hủy nhầm làm câu bị cắt giữa chừng).
      let busy = false;
      try { busy = speechSynthesis.speaking && !speechSynthesis.pending; } catch {}
      if (busy) {
        utterance.onstart();
        return;
      }
      dropCurrent();
      if (!item.retried) {
        item.retried = true;
        queue.unshift(item);
      } else item.onDone?.();
      pump();
    }, 2_500);
    try {
      if (speechSynthesis.paused) speechSynthesis.resume();
      speechSynthesis.speak(utterance);
    } catch {
      finish();
    }
  }

  return {
    // Gọi trong thao tác của người dùng (bấm "Vào chánh điện") để trình duyệt cho phát tiếng.
    start() {
      unlockSpeech();
      if (context) return;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
      context = new (window.AudioContext || window.webkitAudioContext)();
      if (context.state !== 'running') context.resume().catch(() => {});
      master = context.createGain();
      master.gain.value = 0.8;
      master.connect(context.destination);
      musicGain = context.createGain();
      musicGain.gain.value = 0.55;
      musicGain.connect(master);
      playTrack(Math.floor(Math.random() * TRACKS.length));
      bell();
      scheduleAligned(MO_PERIOD_MS, () => { if (!muted && !lectureOn && !document.hidden) knock(context.currentTime, 880); }, (timer) => { moTimer = timer; });
      scheduleAligned(BELL_PERIOD_MS, () => bell(), (timer) => { bellTimer = timer; });
    },
    stop() {
      clearTimeout(moTimer);
      clearTimeout(bellTimer);
      for (const item of musicEls) item.el.pause();
      musicEls = [];
      context?.close();
      context = null;
    },
    nextTrack() {
      if (context) playTrack(trackIndex + 1);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.8;
      if (muted && hasSpeech) clearSpeech();
      return muted;
    },
    offering(kind, big) {
      if (!context || muted) return;
      resume();
      if (big || kind === 'bell') bell(true);
      else if (kind === 'petal') chime([1320, 1760], 0.12, 1.2);
      else if (kind === 'incense') {
        const t = context.currentTime;
        knock(t, 760, 0.32);
        knock(t + 0.22, 760, 0.32);
        knock(t + 0.44, 620, 0.32);
        chime([528], 0.16, 2.4);
      } else if (kind === 'lotus') chime([660, 880, 1320], 0.16, 2.2);
    },
    // Thầy đọc sớ: chuông mở đầu rồi đọc từng câu, giọng trầm và chậm; chỉ phát trên máy này. onDone khi đọc xong.
    // Đi trước các lời đang chờ (bỏ qua giới hạn hàng chờ); lời thường của người khác nhường trong lúc đọc.
    recite(sentences, onDone) {
      if (!hasSpeech || muted || !sentences.length) {
        onDone?.();
        return false;
      }
      if (context) bell();
      reciting += 1;
      // Gộp câu thành đoạn ~220 ký tự: mỗi chỗ chuyển câu là một lần máy chuẩn bị giọng (giọng qua mạng còn phải tải),
      // ít chỗ chuyển thì ít chỗ ngắt.
      const chunks = [];
      for (const sentence of sentences) {
        const last = chunks.length - 1;
        if (last >= 0 && chunks[last].length + sentence.length < 220) chunks[last] = `${chunks[last]} ${sentence}`;
        else chunks.push(sentence);
      }
      const items = chunks.map((text, index) => ({
        text, rate: 0.86, pitch: 0.8,
        onDone: index === chunks.length - 1 ? () => {
          reciting = Math.max(0, reciting - 1);
          onDone?.();
        } : null,
      }));
      queue.unshift(...items);
      pump();
      return true;
    },
    // Nút "Thử giọng đọc": xóa hàng chờ (kể cả câu kẹt) rồi đọc ngay trong lúc chạm.
    testVoice(text) {
      if (!hasSpeech) return { ok: false, reason: 'unsupported' };
      if (muted) return { ok: false, reason: 'muted' };
      clearSpeech();
      queue.push({ text, rate: 0.95, pitch: 0.95 });
      pump();
      speechUnlocked = true;
      return { ok: true, voice: voice?.name || null, voices: speechSynthesis.getVoices().length };
    },
    // Lần một hạt tràng hạt: tiếng gỗ nhỏ, khẽ.
    bead() {
      if (!context || muted) return;
      knock(context.currentTime, 1250, 0.1);
    },
    // Tụng kinh (lines: các câu; repeat: niệm liên tục). onEnd khi tụng xong cả bài.
    chant(lines, { repeat = false, onEnd } = {}) {
      stopChant();
      startWoodfish();
      if (!hasSpeech || muted || !lines.length) return false;
      chantState = { lines, repeat, onEnd };
      feedChant(chantState);
      return true;
    },
    // Chỉ gõ mõ, không đọc.
    woodfish() {
      stopChant();
      startWoodfish();
    },
    stopChant,
    // Danh sách giọng của ngôn ngữ phòng cho mục chọn giọng; chọn xong nhớ theo ngôn ngữ.
    voices() {
      return voicesForLang().map((item) => ({ name: item.name, lang: item.lang, online: !item.localService, selected: item === voice }));
    },
    setVoice(name) {
      try { localStorage.setItem(`thien-voice-${voicePrefix()}`, name); } catch {}
      pickVoice();
      return voice?.name || null;
    },
    get voiceName() {
      return voice?.name || null;
    },
    // Ngôn ngữ đọc theo phòng (vi-VN, en-US, zh-CN, es-US).
    setLang(next) {
      if (next === ttsLang) return;
      ttsLang = next;
      if (hasSpeech) pickVoice();
    },
    // Đang nghe bài giảng: tắt nhạc nền và mõ để nghe rõ lời giảng.
    setLecture(on) {
      lectureOn = on;
      if (musicGain && context) {
        const t = context.currentTime;
        musicGain.gain.cancelScheduledValues(t);
        musicGain.gain.setValueAtTime(musicGain.gain.value, t);
        musicGain.gain.linearRampToValueAtTime(on ? 0 : 0.55, t + 1.5);
      }
    },
    // Lời đọc xếp hàng (đọc từng câu một); quá nhiều câu đang chờ thì bỏ câu không ưu tiên.
    // now = đang trong lúc chạm (lời của chính mình): câu đang kẹt thì bỏ để đọc câu này ngay khi điện thoại còn cho.
    // Chưa thấy giọng của ngôn ngữ phòng trong danh sách (điện thoại hay tải trễ) thì vẫn đọc với lang để máy tự chọn.
    speak(text, priority = false, { now = false } = {}) {
      if (muted || !hasSpeech) return false;
      // Có lời thật được đọc (nhất là trong lúc chạm) cũng là đã mở khóa giọng đọc.
      speechUnlocked = true;
      // Thầy đang đọc sớ / mình đang tụng kinh: lời đọc thường của người khác nhường, chỉ giữ lời ưu tiên.
      if ((reciting || chantState) && !priority) return false;
      const waiting = queue.length + (current ? 1 : 0);
      if (waiting >= (priority ? TTS_MAX_PENDING * 2 : TTS_MAX_PENDING)) return false;
      const item = { text, rate: 0.95, pitch: 0.95 };
      let browserBusy = false;
      try { browserBusy = speechSynthesis.speaking && !speechSynthesis.pending; } catch {}
      if (now && current && !current.started && !browserBusy) {
        dropCurrent();
        queue.unshift(item);
      } else if (now) queue.unshift(item);
      else queue.push(item);
      pump();
      return true;
    },
  };
}
