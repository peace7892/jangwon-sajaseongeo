/* 장원급제 한자 7급: 화면 그리기, 소리, 입력, 저장 */
(function () {
  'use strict';
  var D = window.DATA, L = window.Logic, Q = window.Quiz;
  var KEY = 'jangwon-hanja-v1';
  var OLD_KEY = 'jangwon-sajaseongeo-v1';   // 사자성어 때 기록: 이름만 가져온다
  var APP_VERSION = '10.28-1';   // 아이패드가 최신 파일로 열렸는지 확인하는 표시 (홈 맨 아래)
  var CHAR = {}, GROUP = {}, WORD = {};
  D.CHARS.forEach(function (c) { CHAR[c.id] = c; });
  D.GROUPS.forEach(function (g) { GROUP[g.id] = g; });
  D.WORDS.forEach(function (w) { WORD[w.id] = w; });

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function today() { return L.dateKey(new Date()); }
  function isQ(s) { return s.t === 'q'; }
  function isCard(s) { return s.t === 'card'; }
  function starText(s) { return '★★★'.slice(0, s) + '☆☆☆'.slice(0, 3 - s); }
  function shortDate(key) { var p = key.split('-'); return Number(p[1]) + '월 ' + Number(p[2]) + '일'; }
  function longDate(key) { return key.split('-')[0] + '년 ' + shortDate(key); }

  // ---------- 한국어 조사 ----------
  function hasBatchim(word) {
    var code = word.charCodeAt(word.length - 1) - 0xAC00;
    return code >= 0 && code <= 11171 && code % 28 !== 0;
  }
  function quoted(word, withBatchim, without) { return '“' + word + '”' + (hasBatchim(word) ? withBatchim : without); }

  // ---------- 저장 ----------
  // 카카오톡·네이버 같은 앱 안의 브라우저는 앱을 닫으면 기록을 지울 수 있어서 Safari로 열도록 안내한다
  var IN_APP = /KAKAOTALK|NAVER\(inapp|Line\/|Instagram|FBAN|FBAV|DaumApps/i.test(navigator.userAgent || '');
  var IS_KAKAO = /KAKAOTALK/i.test(navigator.userAgent || '');
  // 브라우저에게 이 사이트 기록을 오래 보관해 달라고 요청한다 (지원하는 브라우저만)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* 거절돼도 평소처럼 저장된다 */ }); } catch (e) { /* 미지원 */ }
  // 시작할 때 이 브라우저가 기록을 저장할 수 있는지 시험한다. Safari의 '모든 쿠키 차단'이 켜져 있으면
  // 기록 저장이 막혀서 새로고침할 때마다 이름부터 다시 시작된다.
  var storageError = '', recoveredFromTab = false, lastRaw = null;
  try {
    localStorage.setItem(KEY + '-test', '1');
    if (localStorage.getItem(KEY + '-test') !== '1') storageError = '읽기 실패';
    localStorage.removeItem(KEY + '-test');
  } catch (e) {
    storageError = (e && e.name) || '알 수 없음';
  }
  if (!storageError && navigator.cookieEnabled === false) storageError = '쿠키 차단';
  // 이 탭 안의 복사본(sessionStorage). 새로고침했는데 브라우저가 기록을 지웠으면 이것으로 되살린다
  function tabCopy(raw) {
    try {
      if (raw === undefined) return sessionStorage.getItem(KEY + '-tab');
      sessionStorage.setItem(KEY + '-tab', raw);
    } catch (e) { /* 이 탭 복사본도 막혀 있으면 위의 안내로 알린다 */ }
    return null;
  }
  function parseState(raw) {
    try { return L.sanitize(JSON.parse(raw)); } catch (e) { return null; }
  }
  // 한자 기록이 아직 없으면 사자성어 때 쓴 이름(과 소리 설정)만 가져온다
  function fromOldApp() {
    var s = L.emptyState();
    try {
      var old = JSON.parse(localStorage.getItem(OLD_KEY));
      if (old && typeof old.name === 'string') s.name = old.name.slice(0, 8);
      if (old && typeof old.sound === 'boolean') s.sound = old.sound;
    } catch (e) { /* 예전 기록이 없거나 망가졌으면 처음부터 */ }
    return s;
  }
  var importedName = false;
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { if (!storageError) storageError = (e && e.name) || '읽기 실패'; }
    if (!raw) {
      var copy = tabCopy(), fromTab = copy && parseState(copy);
      if (fromTab && fromTab.name) { recoveredFromTab = true; return fromTab; }
      var fresh = fromOldApp();
      importedName = !!fresh.name;
      return fresh;
    }
    lastRaw = raw;
    var parsed = parseState(raw);
    if (!parsed) {
      try { localStorage.setItem(KEY + '-broken', raw); } catch (e) { /* 저장 불가는 아래 안내로 알린다 */ }
      return L.emptyState();
    }
    return parsed;
  }
  var state = load();
  if (recoveredFromTab || importedName) save();
  function save() {
    var raw = JSON.stringify(state);
    tabCopy(raw);
    try {
      localStorage.setItem(KEY, raw);
      lastRaw = raw;
    } catch (e) {
      if (!storageError) storageError = (e && e.name) || '저장 실패';
    }
  }
  // 다른 탭(또는 예전에 열어 둔 탭)이 그사이 기록을 바꿨으면, 오래된 기록으로 덮어쓰지 않도록 새 기록을 불러온다
  function syncFromStorage() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return false; }
    if (!raw || raw === lastRaw) return false;
    var parsed = parseState(raw);
    if (!parsed) return false;
    state = parsed;
    lastRaw = raw;
    tabCopy(raw);
    return true;
  }
  function storageWarnText() {
    var how = '부모님이 아이패드 설정 → 앱 → Safari(아이패드OS 17 이하는 설정 → Safari)에서 ‘모든 쿠키 차단’을 꺼 주세요. ' +
      '검은 주소창(개인정보 보호 브라우징)이면 일반 탭으로 열고, 아이패드 저장 공간이 꽉 차 있지 않은지도 확인해 주세요.';
    if (storageError) return '이 아이패드의 Safari가 기록 저장을 막고 있어요. 그래서 새로고침하면 이름부터 다시 시작돼요. ' + how + ' (원인: ' + storageError + ')';
    if (recoveredFromTab) return '새로고침할 때 이 아이패드가 기록을 지웠어요. 이번에는 되살렸지만 Safari를 닫으면 사라질 수 있어요. ' + how;
    return '';
  }
  function setState(next) {
    if (next === state) return;
    state = next;
    save();
  }
  function withChanges(changes) {
    var next = JSON.parse(JSON.stringify(state));
    Object.keys(changes).forEach(function (k) { next[k] = changes[k]; });
    return next;
  }

  // ---------- 소리 ----------
  // 효과음은 세 가지 방식을 차례로 시도한다. 하나가 NotSupportedError로 막히면 다음 방식으로 넘어간다.
  //   방식 1: AAC 파일(sounds/*.m4a) — 아이패드 기본 형식. 차단 모드(Lockdown Mode)에서도 막히지 않는다
  //   방식 2: WAV(data: 주소) — 아이패드 Safari는 blob: 주소 오디오를 거절해서 data: 주소를 쓴다
  //   방식 3: Web Audio — 차단 모드에서는 꺼져 있다
  // 아이패드는 오디오를 첫 터치 때 한 번 "깨워야" 나중에 재생할 수 있어서, 첫 터치 때 깨워 둔다.
  var SOUND_MODES = ['aac', 'wav', 'webaudio'], soundMode = 0;
  var players = { aac: {}, wav: {} }, unlocked = false, lastPlay = null, ac = null, buffers = {};
  function clipSamples(name) { return window.Sound.renderClip(window.Sound.CLIPS[name], window.Sound.RATE); }
  function wavDataURL(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  function player(name) {
    var kind = SOUND_MODES[soundMode], bag = players[kind];
    if (!bag[name]) {
      var a = new Audio();
      a.preload = 'auto';
      a.src = kind === 'aac' ? 'sounds/' + name + '.m4a?v=' + APP_VERSION : wavDataURL(window.Sound.encodeWav(clipSamples(name), window.Sound.RATE));
      a.addEventListener('ended', function () { a.busy = false; });
      bag[name] = a;
    }
    return bag[name];
  }
  // 지금 방식이 막혔을 때만 다음 방식으로 (여러 효과음이 동시에 실패해도 한 칸만 넘어간다)
  function nextSoundMode(from) {
    if (soundMode === from && soundMode < SOUND_MODES.length - 1) soundMode += 1;
  }
  function audioContext() {
    if (!ac) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 미지원 */ }
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (ac.state !== 'running' && ac.resume) ac.resume().catch(function () { /* 다음 터치에서 다시 시도 */ });
    return ac;
  }
  function webAudioPlay(name) {
    var c = audioContext();
    if (!c) return false;
    try {
      if (!buffers[name]) {
        var s = clipSamples(name), b = c.createBuffer(1, s.length, window.Sound.RATE);
        b.getChannelData(0).set(s);
        buffers[name] = b;
      }
      var src = c.createBufferSource();
      src.buffer = buffers[name];
      src.connect(c.destination);
      src.start();
      return true;
    } catch (e) {
      return false;
    }
  }
  function unlockAudio() {
    if (unlocked) return;
    unlocked = true;
    var probe = document.createElement('audio');
    if (probe.canPlayType && !probe.canPlayType('audio/mp4')) nextSoundMode(0);
    if (soundMode === 1 && probe.canPlayType && !probe.canPlayType('audio/wav')) nextSoundMode(1);
    // Web Audio는 마지막 방식일 때만 만든다. 필요 없을 때 만들면 아이패드의 오디오 설정을 바꿔 일반 오디오에 끼어들 수 있다
    if (SOUND_MODES[soundMode] === 'webaudio') { audioContext(); return; }
    var mode = soundMode;
    Object.keys(window.Sound.CLIPS).forEach(function (name) {
      var a = player(name);
      if (a.busy) return;
      a.muted = true;
      var settle = function () {
        if (!a.busy) { a.pause(); a.currentTime = 0; }
        a.muted = false;
      };
      var p = a.play();
      if (p && p.then) {
        p.then(settle, function (err) {
          a.muted = false;
          if (err && err.name === 'NotSupportedError') nextSoundMode(mode);
          else unlocked = false;
        });
      } else {
        settle();
      }
    });
  }
  document.addEventListener('touchend', unlockAudio, true);
  document.addEventListener('click', unlockAudio, true);
  function playClip(name) {
    if (!state.sound) return;
    var mode = soundMode;
    if (SOUND_MODES[mode] === 'webaudio') {
      var ok = webAudioPlay(name);
      lastPlay = { ok: ok, via: mode + 1, why: ok ? '' : 'Web Audio 없음' };
      return;
    }
    var a = player(name);
    a.busy = true;
    a.muted = false;
    try { a.currentTime = 0; } catch (e) { /* 아직 불러오는 중이면 처음부터 재생된다 */ }
    var p = a.play();
    if (p && p.then) {
      p.then(function () { lastPlay = { ok: true, via: mode + 1 }; }, function (err) {
        a.busy = false;
        var why = (err && err.name) || '알 수 없음';
        lastPlay = { ok: false, via: mode + 1, why: why };
        if (why === 'NotSupportedError') {
          nextSoundMode(mode);
          if (soundMode !== mode) playClip(name);
        }
      });
    }
  }
  var SOUND_LABEL = ['AAC 파일', 'WAV', 'Web Audio'];
  function soundStatus() {
    if (!state.sound) return '앱 소리가 꺼져 있어요. 홈 화면 오른쪽 위 “소리 끔”을 눌러 켜 주세요.';
    if (!lastPlay) return '소리를 아직 재생하지 못했어요. 한 번 더 눌러 주세요.';
    var how = '방식 ' + lastPlay.via + ' · ' + SOUND_LABEL[lastPlay.via - 1];
    if (lastPlay.ok) {
      return '소리를 재생했어요 (' + how + '). 그래도 안 들리면 아이패드 볼륨 버튼으로 소리를 키우고, 무음 모드가 아닌지 확인해 주세요.';
    }
    return '소리 재생이 막혔어요 (' + lastPlay.why + ', ' + how + '). 한 번 더 눌러 보고, 그래도 막히면 이 문구를 Claude에게 알려 주세요.';
  }
  var sfx = {
    stamp: function (combo) { playClip(combo >= 2 ? 'combo' : 'stamp'); },
    gold: function () { playClip('gold'); },
    wrong: function () { playClip('wrong'); },
    pop: function () { playClip('pop'); },
    flip: function () { playClip('flip'); },
    fanfare: function () { playClip('fanfare'); },
    rattle: function () { playClip('rattle'); }
  };

  // ---------- 공통 ----------
  var VIEWS = ['name', 'home', 'card', 'quiz', 'sticker', 'prize', 'hong', 'lock', 'parent'];
  var S = null;          // 진행 중인 공부·연습
  function show(name) {
    VIEWS.forEach(function (v) { $('v-' + v).hidden = v !== name; });
    window.scrollTo(0, 0);
  }
  function renderStorageWarn() {
    var text = storageWarnText();
    ['storageWarn', 'nameStorageWarn'].forEach(function (id) {
      $(id).textContent = text;
      $(id).hidden = !text;
    });
  }
  function goHome() {
    var leftExam = S && S.kind === 'mock' && !$('v-quiz').hidden && $('result').hidden;
    stopClock();
    S = null;
    renderStorageWarn();
    if (!state.name) { show('name'); return; }
    if (showExpiredExam()) return;
    renderHome();
    show('home');
    if (leftExam) toast('실전 시험 시간은 계속 흘러요. “이어서 보기”로 돌아가요.');
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-go="home"]')) goHome();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    if (syncFromStorage()) {
      if (S) toast('다른 창에서 한 공부를 불러왔어요.');
      goHome();
    } else if (S && S.ends) {
      renderClock();
    } else if (!S && !$('v-home').hidden && !showExpiredExam()) {
      renderHome();
    }
  });
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && !document.hidden && syncFromStorage()) goHome();
  });
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && syncFromStorage()) goHome();
  });
  function toast(msg) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = el('div', 'toast', msg);
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
  }
  function confetti(stage) {
    var colors = ['#E9A20C', '#D63C2A', '#7FCDBC', '#FFFFFF', '#25366E'];
    for (var i = 0; i < 28; i++) {
      var c = el('span', 'confetti');
      c.style.left = Math.round(Math.random() * 100) + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
      stage.appendChild(c);
    }
    setTimeout(function () {
      stage.querySelectorAll('.confetti').forEach(function (n) { n.remove(); });
    }, 2600);
  }
  function onEnter(input, fn) {
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      fn();
    });
  }

  // ---------- 처음 화면 ----------
  function submitName() {
    var v = $('nameInput').value.trim();
    if (!v) { $('nameErr').textContent = '이름을 써 주세요.'; return; }
    setState(withChanges({ name: v.slice(0, 8) }));
    sfx.pop();
    goHome();
  }
  // 카카오톡 안에서 열렸으면 Safari(기본 브라우저)로 다시 연다
  document.querySelectorAll('.open-safari').forEach(function (b) {
    b.hidden = !IS_KAKAO;
    b.addEventListener('click', function () {
      location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
    });
  });
  $('nameInAppWarn').hidden = !IN_APP;
  $('nameBtn').addEventListener('click', submitName);
  onEnter($('nameInput'), submitName);
  $('nameInput').addEventListener('input', function () { $('nameErr').textContent = ''; });

  // ---------- 홈 ----------
  function renderHome() {
    var t = today(), stars = L.totalStars(state), rank = L.rankOf(stars, D.RANKS);
    $('avatar').textContent = Array.from(state.name)[0] || '';
    $('hName').textContent = state.name;
    $('rankBadge').textContent = rank.name;
    $('starCount').textContent = '별 ' + stars + '개';
    $('soundBtn').setAttribute('aria-pressed', String(state.sound));
    $('soundBtn').textContent = state.sound ? '소리 켬' : '소리 끔';

    var strip = $('ranks');
    strip.innerHTML = '';
    D.RANKS.forEach(function (r, i) {
      strip.appendChild(el('span', i < rank.index ? 'done' : i === rank.index ? 'now' : '', r.name));
    });
    var next = $('rankNext');
    next.textContent = '';
    if (rank.next) {
      next.appendChild(el('b', null, rank.next.name));
      next.appendChild(document.createTextNode('까지 별 ' + rank.next.need + '개 남았어요'));
    } else {
      next.textContent = '모든 한자를 외웠어요. 장원이에요!';
    }
    renderStorageWarn();
    $('inAppWarn').hidden = !IN_APP;
    var left = L.daysUntil(t, D.EXAM_DATE);
    $('dday').hidden = left < 0;
    $('dday').textContent = left > 0 ? '한자 7급 시험까지 ' + left + '일' : '오늘이 시험 날! 힘내요';

    renderStart(t);
    var learned = renderTiles();
    $('practiceBtn').hidden = learned === 0;
    $('hongBtn').hidden = !L.passedMock(state);
    renderBoard(t);
  }

  function renderStart(t) {
    var finished = L.allDone(state), done = L.doneToday(state, t), act = L.activeSession(state, t, Date.now());
    var review = L.canReview(state, t);
    if (!act && (finished || (done && !review))) {
      $('startBtn').hidden = true;
      $('doneBanner').hidden = false;
      if (finished) {
        $('doneMain').textContent = L.LAST_DAY + '일을 모두 마쳤어요!';
        $('doneSub').textContent = state.prize
          ? '선물: ' + state.prize.item + ' · 시험 날까지 연습 문제로 복습해요.'
          : L.passedMock(state) ? '스티커판의 🎁를 눌러 선물 룰렛을 돌려요!' : '시험 날까지 연습 문제로 복습해요. 힘내요!';
      } else {
        $('doneMain').textContent = '오늘 두 번 다 했어요!';
        $('doneSub').textContent = '내일 또 만나요. 더 하고 싶으면 아래 연습 문제를 풀어요.';
      }
      return;
    }
    $('startBtn').hidden = false;
    $('doneBanner').hidden = true;
    if (act) {
      var qTotal = act.steps.filter(isQ).length;
      var qDone = act.steps.slice(0, act.i).filter(isQ).length;
      var cardsLeft = act.steps.slice(act.i).filter(isCard).length;
      $('startMain').textContent = act.kind === 'mock' ? '실전 시험 이어서 보기' : act.kind === 'diag' ? '실력 진단 이어서 하기'
        : act.kind === 'review' ? '두 번째 공부 이어서 하기' : '이어서 하기';
      $('startSub').textContent = cardsLeft
        ? '새 한자 ' + cardsLeft + '자 남았어요'
        : (act.ends ? '남은 시간 ' + clockText(L.timeLeft(state, Date.now())) + ' · ' : '') + '문제 ' + (qDone + 1) + ' / ' + qTotal + '부터';
      return;
    }
    var day = L.studyDay(state, t);
    if (review) {
      var rq = Q.buildReview(state, t, D, Math.random).steps.filter(isQ).length;
      $('startMain').textContent = '두 번째 공부 시작';
      $('startSub').textContent = { diag: '안다고 고른 한자 써 보기', mock: '실전 시험에서 틀린 한자 + 복습' }[Q.dayType(state, t, D)] ||
        '오늘 배운 한자 다시 쓰기 + 복습';
      $('startSub').textContent += ' · ' + rq + '문제';
      return;
    }
    var preview = Q.buildDay(state, t, D, Math.random);
    var total = preview.steps.filter(isQ).length;
    if (preview.kind === 'diag') {
      $('startMain').textContent = '실력 진단 시작';
      $('startSub').textContent = '1일째 · ' + total + '자 훈음 고르기 · 이미 아는 한자를 찾아요';
      return;
    }
    if (preview.kind === 'mock') {
      $('startMain').textContent = '실전 시험 보러 가기';
      $('startSub').textContent = '기출 형식 ' + total + '문제 · ' + D.EXAM_MINUTES + '분 · ' + L.passMark(total) + '문제 이상 맞히면 합격!';
      return;
    }
    if (Q.dayType(state, t, D) === 'light') {
      $('startMain').textContent = '시험 전날, 가볍게 공부';
      $('startSub').textContent = '약한 한자와 필순 ' + total + '문제 · 끝나면 푹 쉬어요!';
      return;
    }
    var reviews = preview.steps.filter(function (s) { return isQ(s) && s.q.mode === 'review'; }).length;
    var cards = preview.steps.filter(isCard).length;
    var parts = [day + '일째' + (t >= D.MOCK_FROM ? ' 보강' : '')];
    if (reviews) parts.push('복습 ' + reviews + '문제');
    if (cards) parts.push('새 한자 ' + cards + '자');
    if (total - reviews - cards * 3 > 0 && !cards) parts.push((Q.dayType(state, t, D) === 'dok' ? '한자어 읽기·유형 ' : '연습 ') + (total - reviews) + '문제');
    $('startMain').textContent = '오늘의 공부 시작';
    $('startSub').textContent = parts.join(' · ');
  }

  // 스티커판: 27일 × 2칸(한 줄에 일주일), 위 칸은 첫 번째 공부, 아래 칸은 두 번째 공부(복습). 마지막 날 아래 칸은 🎁 선물
  var ROT = [-8, 6, -4, 9, -6, 5, -9];
  var justStuckKey = '';
  function renderBoard(t) {
    var board = $('board'), day = L.studyDay(state, t), done = L.doneToday(state, t), review = L.canReview(state, t);
    board.innerHTML = '';
    $('boardCount').textContent = state.stickers.length + ' / ' + (L.LAST_DAY * 2 - 1) + '칸';
    var cells = el('div', 'cells');
    for (var d = 1; d <= L.LAST_DAY; d++) {
      var col = el('div', 'daycol');
      col.appendChild(el('span', 'daylbl', d + '일'));
      col.appendChild(cellFor(d, 'main', !done && d === day));
      col.appendChild(d === L.LAST_DAY ? giftCell() : cellFor(d, 'review', review && d === day));
      cells.appendChild(col);
    }
    board.appendChild(cells);
    justStuckKey = '';
  }
  var DAY_TAG = { diag: '진단', mock: '실전', light: '전날' };
  function cellFor(d, kind, isToday) {
    var sticker = state.stickers.filter(function (s) { return (s.k === 'review') === (kind === 'review') && s.day === d; })[0];
    var type = Q.planType(d, D), tag = kind === 'main' && DAY_TAG[type];
    var c = el('div', 'cell' + (kind === 'review' ? ' rev' : '') + (tag ? ' ' + type : ''));
    if (sticker) {
      c.classList.add('filled');
      var s = el('span', 'stk', sticker.e);
      var r = ROT[(d * 2 + (kind === 'review' ? 1 : 0)) % 7];
      s.style.setProperty('--r', r + 'deg');
      s.style.transform = 'rotate(' + r + 'deg)';
      c.appendChild(s);
      if (justStuckKey === kind + d) c.classList.add('just-stuck');
    } else {
      c.textContent = isToday ? '오늘' : kind === 'review' ? '복습' : '';
    }
    if (!sticker && isToday) c.classList.add('today');
    if (tag) c.appendChild(el('span', 'tag', tag));
    c.setAttribute('aria-label', d + '일째 ' + (kind === 'review' ? '두 번째 공부' : type === 'mock' ? '실전 시험' : '첫 번째 공부') + (sticker ? ' 스티커' : ''));
    return c;
  }
  function giftCell() {
    var open = L.passedMock(state);
    var c = el(open ? 'button' : 'div', 'cell gift' + (open ? (state.prize ? '' : ' ready') : ' locked'));
    if (open) {
      c.type = 'button';
      c.addEventListener('click', showPrize);
    }
    c.appendChild(el('span', 'stk', '🎁'));
    c.appendChild(el('span', 'tag', state.prize ? '받았음' : open ? '열기!' : '선물'));
    c.setAttribute('aria-label', '선물 룰렛' + (open ? '' : ', 실전 시험에 합격하면 열려요'));
    return c;
  }

  // 한자 도감: 묶음마다 15칸
  function renderTiles() {
    var box = $('tiles'), learned = 0;
    box.innerHTML = '';
    D.GROUPS.forEach(function (g) {
      var sec = el('div', 'tile-group'), grid = el('div', 'tile-grid');
      sec.appendChild(el('p', 'tile-name', g.name));
      g.ids.forEach(function (id) {
        var cs = state.cards[id], c = CHAR[id];
        if (!cs) {
          var lock = el('div', 'tile lock', '?');
          lock.appendChild(el('span', 'st', ' '));
          lock.setAttribute('aria-label', '아직 안 배운 한자');
          grid.appendChild(lock);
          return;
        }
        learned++;
        var b = el('button', 'tile s' + cs.s, c.h);
        b.type = 'button';
        b.appendChild(el('span', 'st', starText(cs.s)));
        b.setAttribute('aria-label', c.h + ' ' + c.hun + ', 별 ' + cs.s + '개, 카드 보기');
        b.addEventListener('click', function () { showDogamCard(id); });
        grid.appendChild(b);
      });
      sec.appendChild(grid);
      box.appendChild(sec);
    });
    $('dogamCount').textContent = learned + ' / ' + D.CHARS.length + '자';
    return learned;
  }

  $('soundBtn').addEventListener('click', function () {
    setState(withChanges({ sound: !state.sound }));
    $('soundBtn').setAttribute('aria-pressed', String(state.sound));
    $('soundBtn').textContent = state.sound ? '소리 켬' : '소리 끔';
    sfx.pop();
  });
  $('startBtn').addEventListener('click', function () {
    if (showExpiredExam()) return;
    var t = today(), act = L.activeSession(state, t, Date.now());
    if (act) { beginSession(act); return; }
    var built;
    if (L.canReview(state, t)) built = Q.buildReview(state, t, D, Math.random);
    else if (!L.doneToday(state, t) && !L.allDone(state)) built = Q.buildDay(state, t, D, Math.random);
    else { renderHome(); return; }
    if (!built.steps.length) { renderHome(); return; }
    setState(L.startSession(state, built, t, Date.now()));
    beginSession(state.session);
  });
  $('practiceBtn').addEventListener('click', function () { startPractice(10); });
  $('hongBtn').addEventListener('click', function () { showHong(false); });
  $('parentLink').addEventListener('click', showLock);

  // ---------- 공부 진행 ----------
  // 오늘의 공부·진단·실전 시험은 기록(state.session)에 진행 위치를 저장해서, 나갔다 와도 이어서 한다.
  // 연습 문제는 저장하지 않는다.
  function beginSession(saved) {
    if (!saved.steps.length) { toast('먼저 오늘의 공부로 한자를 배워 보세요.'); return; }
    S = {
      kind: saved.kind, steps: saved.steps, i: saved.i || 0, combo: 0, right: saved.right || 0,
      qn: saved.steps.slice(0, saved.i || 0).filter(isQ).length,
      total: saved.steps.filter(isQ).length,
      newCards: saved.newCards != null ? saved.newCards : saved.steps.filter(isCard).length,
      starsBefore: saved.starsBefore != null ? saved.starsBefore : L.totalStars(state),
      persist: saved.kind !== 'practice',
      ends: saved.ends || null, miss: (saved.miss || []).slice(), warned: {}
    };
    $('combo').hidden = true;
    startClock();
    if (S) runStep();
  }
  // ---------- 실전 시험 시계 ----------
  // 오른쪽 위 동그라미가 50분 동안 줄어든다. 시간은 기록의 끝나는 시각(ends)으로 계산해서 앱을 나갔다 와도 맞다
  var clockTimer = null;
  function clockText(ms) {
    var sec = Math.ceil(ms / 1000), r = sec % 60;
    return Math.floor(sec / 60) + ':' + (r < 10 ? '0' : '') + r;
  }
  function stopClock() { clearInterval(clockTimer); clockTimer = null; }
  function startClock() {
    stopClock();
    $('timer').hidden = !S.ends;
    if (!S.ends) return;
    renderClock();
    if (S) clockTimer = setInterval(renderClock, 1000);
  }
  function renderClock() {
    if (!S || !S.ends) return;
    var full = D.EXAM_MINUTES * 60000, left = Math.max(0, S.ends - Date.now()), min = left / 60000, fresh = 0;
    $('timer').style.setProperty('--p', (left / full).toFixed(4));
    $('timer').className = 'timer' + (min <= 5 ? ' danger' : min <= 10 ? ' warn' : '');
    $('timerText').textContent = clockText(left);
    $('timer').setAttribute('aria-label', '남은 시간 ' + Math.ceil(min) + '분');
    if (left <= 0) { timeUp(); return; }
    [10, 5, 1].forEach(function (m) {
      if (min <= m && !S.warned[m]) { S.warned[m] = true; fresh = m; }
    });
    if (fresh) { toast(fresh + '분 남았어요!'); sfx.pop(); }
  }
  // 50분이 다 되면 더 풀 수 없고 그 자리에서 채점한다
  function timeUp() {
    stopClock();
    clearTimeout(autoNext);
    if (answered) S.i++;      // 방금 답한 문제는 푼 문제로 센다
    S.timedOut = true;
    setState(L.closeExpiredMock(state, Date.now()));
    toast('시간이 끝났어요! 채점할게요.');
    finish();
  }
  // 시험 중에 나갔다가 시간이 다 지난 뒤 돌아오면 바로 채점 결과를 보여 준다
  function showExpiredExam() {
    var s = state.session, now = Date.now();
    if (!s || s.kind !== 'mock' || !s.ends || now < s.ends) return false;
    S = { kind: 'mock', steps: s.steps, i: s.i, right: s.right, total: s.steps.filter(isQ).length, qn: 0, combo: 0,
      newCards: 0, starsBefore: s.starsBefore, persist: true, ends: s.ends, miss: (s.miss || []).slice(), warned: {}, timedOut: true };
    setState(L.closeExpiredMock(state, now));
    finish();
    return true;
  }

  function startPractice(n) {
    beginSession({ kind: 'practice', steps: Q.buildPractice(state, D, n, Math.random) });
  }
  // 카드 한 장이나 문제 하나를 마칠 때마다 부른다. 마지막 단계면 그 자리에서 오늘을 마친 것으로 기록한다
  function stepDone(correct, given) {
    if (!S.persist) return;
    if (S.ends && !correct) S.miss.push({ i: S.i, a: String(given == null ? '' : given) });
    setState(L.advanceSession(state, correct, given));
    if (S.i + 1 < S.steps.length) return;
    var t = today();
    if (S.kind === 'mock') setState(L.endSession(L.recordMock(state, S.right, S.total, state.session.d)));
    else if (S.kind === 'review') setState(L.endSession(L.finishReview(state, t)));
    else setState(L.endSession(L.finishDaily(state, t)));
  }
  function runStep() {
    if (S.i >= S.steps.length) { finish(); return; }
    var step = S.steps[S.i];
    if (step.t === 'card') showLearnCard(step.id);
    else showQuestion(step.q);
  }
  function advance() {
    S.i++;
    runStep();
  }
  function nextLabel() {
    var next = S.steps[S.i + 1];
    if (!next) return '결과 보기';
    return next.t === 'card' ? '새 한자 보러 가기' : '다음 문제';
  }

  // ---------- 필순 그림 ----------
  // mark번째(0부터) 획을 진하게. steps가 참이면 그 앞 획은 회색으로 이미 쓴 것처럼, 뒤 획은 아주 연하게 (한 획씩 늘어나는 그림)
  function strokeSvgHTML(h, mark, steps, cls) {
    var paths = (window.STROKES || {})[h];
    if (!paths) return '';
    return '<svg class="stroke-svg ' + cls + '" viewBox="0 0 1024 1024" aria-hidden="true"><g transform="scale(1,-1) translate(0,-900)">' +
      paths.map(function (d, i) {
        return '<path class="' + (i === mark ? 'on' : steps && i < mark ? 'done' : '') + '" d="' + d + '"/>';
      }).join('') + '</g></svg>';
  }
  function strokeStripHTML(h) {
    var paths = (window.STROKES || {})[h];
    if (!paths) return '';
    return '<div class="sc-row"><b>필순 (빨간 획이 그 차례에 쓰는 획)</b><ol class="stroke-strip">' + paths.map(function (d, i) {
      return '<li>' + strokeSvgHTML(h, i, true, 'mini') + '<span>' + (i + 1) + '</span></li>';
    }).join('') + '</ol></div>';
  }

  // ---------- 카드 ----------
  var cardMode = 'learn';
  var GRADE_NAME = { 8: '8급', 7.2: '7급Ⅱ', 7: '7급' };
  function partnersOf(id) {
    return D.PAIRS.filter(function (p) { return p.indexOf(id) >= 0; }).map(function (p) { return p[0] === id ? p[1] : p[0]; });
  }
  function cardBackHTML(c, stars) {
    var html = '<div class="sc-top"><span class="sc-group">' + esc(GROUP[c.g].name) + ' · ' + GRADE_NAME[c.grade] + '</span>' +
      '<span class="sc-stars" aria-label="별 ' + (stars || 0) + '개">' + starText(stars || 0) + '</span></div>' +
      '<div class="sc-char"><p class="sc-big" lang="zh-Hant">' + esc(c.h) + '</p><div><p class="sc-hun">' + esc(c.hun) + '</p>' +
      '<p class="sc-strokes">총 ' + c.strokes + '획</p></div></div>';
    if (c.tip) html += '<div class="sc-row sc-tip"><b>기억 팁</b><p>' + esc(c.tip) + '</p></div>';
    html += strokeStripHTML(c.h);
    var words = Q.wordsWith(D, c.id).slice().sort(function (x, y) { return x.c.length - y.c.length; }).slice(0, 3);
    if (words.length) {
      html += '<div class="sc-row"><b>이 한자가 든 낱말</b><ul class="sc-words">' + words.map(function (w) {
        return '<li><span class="hj">' + esc(w.w) + '</span> <b>' + esc(w.r) + '</b> <span>' + esc(w.m) + '</span></li>';
      }).join('') + '</ul></div>';
    }
    var opp = partnersOf(c.id);
    if (opp.length) {
      html += '<div class="sc-row sc-warn"><b>반대(상대) 한자</b><p>' + opp.map(function (id) {
        return '<span class="hj">' + esc(c.h) + '</span> ↔ <span class="hj">' + esc(CHAR[id].h) + '</span> ' + esc(CHAR[id].hun);
      }).join('<br>') + '</p></div>';
    }
    return html;
  }
  function resetFlip(flipped) {
    var inner = $('flipInner');
    inner.classList.add('instant');
    inner.classList.toggle('flipped', flipped);
    void inner.offsetWidth;
    inner.classList.remove('instant');
  }
  function showLearnCard(id) {
    var c = CHAR[id], cardSteps = S.steps.filter(isCard), k = 0;
    cardSteps.forEach(function (s, i) { if (s.id === id) k = i + 1; });
    cardMode = 'learn';
    $('cardEyebrow').textContent = '오늘의 새 한자 ' + k + ' / ' + cardSteps.length + ' · ' + GROUP[c.g].name;
    $('cardBack').innerHTML = cardBackHTML(c, 0);
    $('flipFront').hidden = false;
    resetFlip(false);
    $('cardNext').hidden = true;
    $('cardNext').textContent = nextLabel() === '다음 문제' ? '문제 풀러 가기' : nextLabel() === '새 한자 보러 가기' ? '다음 한자' : '결과 보기';
    show('card');
  }
  function showDogamCard(id) {
    var c = CHAR[id];
    cardMode = 'dogam';
    $('cardEyebrow').textContent = '한자 도감 · ' + GROUP[c.g].name;
    $('cardBack').innerHTML = cardBackHTML(c, state.cards[id] ? state.cards[id].s : 0);
    $('flipFront').hidden = true;
    resetFlip(true);
    $('cardNext').textContent = '도감으로 돌아가기';
    $('cardNext').hidden = false;
    show('card');
  }
  $('flipFront').addEventListener('click', function () {
    var inner = $('flipInner');
    if (cardMode !== 'learn' || !S || inner.classList.contains('flipped')) return;
    inner.classList.add('flipped');
    sfx.flip();
    setState(L.learnCard(state, S.steps[S.i].id, today()));
    stepDone(false);
    $('cardNext').hidden = false;
  });
  $('cardNext').addEventListener('click', function () {
    if (cardMode === 'learn' && S) advance();
    else goHome();
  });

  // ---------- 문제 ----------
  var TYPE_LABEL = { 'hun-pick': '훈음 고르기', 'hun-write': '훈음 쓰기', 'dok-write': '한자어 읽기', opp: '반대 한자', idiom: '성어 완성', mean: '뜻풀이', stroke: '필순' };
  var MODE_LABEL = { review: '복습', learn: '새 한자', practice: '연습', exam: '실전 시험', diag: '실력 진단' };
  var HANJA_CHOICE = { opp: 1, idiom: 1, mean: 1 };
  var answered = false, copyMode = false, autoNext = null;

  function showQuestion(q) {
    clearTimeout(autoNext);
    S.qn++;
    answered = false;
    copyMode = false;
    $('qCount').textContent = '문제 ' + S.qn + ' / ' + S.total;
    $('progressFill').style.width = Math.round((S.qn - 1) / S.total * 100) + '%';
    $('qType').textContent = MODE_LABEL[q.mode] + ' · ' + TYPE_LABEL[q.type];
    if (q.type === 'stroke') {
      $('qText').innerHTML = strokeSvgHTML(q.show, q.n - 1, false, 'q-stroke');
      $('qText').className = 'q-text stroke';
      $('qText').setAttribute('aria-label', q.show + ' 글자에서 진하게 표시한 획');
    } else {
      $('qText').textContent = q.show;
      $('qText').className = 'q-text' + (q.big ? ' big hj' : '');
      $('qText').removeAttribute('aria-label');
    }
    $('qHelp').textContent = q.ask + (q.help ? '\n' + q.help : '');
    $('feedback').hidden = true;
    $('stamp').hidden = true;
    $('nextBtn').hidden = true;
    $('result').hidden = true;
    $('qCard').hidden = false;
    $('qCard').classList.remove('shake', 'thud');
    var body = $('qBody');
    body.innerHTML = '';
    if (!q.choices) {
      var row = el('div', 'write-row');
      var input = el('input');
      input.id = 'wInput';
      input.type = 'text';
      input.setAttribute('lang', 'ko');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('spellcheck', 'false');
      input.setAttribute('enterkeyhint', 'done');
      input.setAttribute('aria-label', '답 쓰기');
      input.placeholder = q.type === 'hun-write' ? '훈과 음 (예: 물 수)' : '읽는 소리';
      var btn = el('button', null, '확인');
      btn.id = 'wBtn';
      btn.type = 'button';
      row.appendChild(input);
      row.appendChild(btn);
      body.appendChild(row);
      var err = el('p', 'err');
      err.id = 'wErr';
      err.setAttribute('aria-live', 'polite');
      body.appendChild(err);
      btn.addEventListener('click', submitWrite);
      onEnter(input, submitWrite);
      input.addEventListener('input', function () { err.textContent = ''; });
    } else {
      var list = el('div', 'choices' + (HANJA_CHOICE[q.type] ? ' hanja' : q.type === 'stroke' ? ' nums' : ''));
      q.choices.forEach(function (ch) {
        var b = el('button', 'choice word' + (HANJA_CHOICE[q.type] ? ' hj' : ''), ch.text);
        b.type = 'button';
        b.dataset.id = ch.id;
        b.addEventListener('click', function () { pick(b, ch.id); });
        list.appendChild(b);
      });
      body.appendChild(list);
      if (q.skip) {
        var skip = el('button', 'choice skip', '잘 모르겠어요');
        skip.type = 'button';
        skip.dataset.id = '0';
        skip.addEventListener('click', function () { pick(skip, 0); });
        body.appendChild(skip);
      }
    }
    if (q.mode === 'exam') {
      var pass = el('button', 'choice skip', '넘어가기');
      pass.type = 'button';
      pass.addEventListener('click', function () {
        if (answered) return;
        answered = true;
        examNext(pass, false, '', false);
      });
      body.appendChild(pass);
    }
    show('quiz');
    if (q.mode === 'exam' && !q.choices) $('wInput').focus();
  }
  // 실전 시험: 시험처럼 맞았는지 알려 주지 않고 바로 다음 문제로. 틀린 문제는 끝나고 한꺼번에 보여 준다
  function examNext(btn, ok, given, wait) {
    var q = S.steps[S.i].q;
    if (btn) btn.classList.add('picked');
    $('qBody').querySelectorAll('button, input').forEach(function (x) { x.disabled = true; });
    setState(L.recordAnswer(state, q, ok, today()));
    if (ok) S.right++;
    sfx.pop();
    stepDone(ok, given);
    if (!wait) { advance(); return; }
    var at = S.i;
    autoNext = setTimeout(function () { if (S && S.i === at) advance(); }, 250);
  }

  function landStamp(gold) {
    var stamp = $('stamp');
    stamp.innerHTML = gold ? '<span class="hj">壯元</span><span>장원!</span>' : '<span>참</span><span>잘했어요</span>';
    stamp.className = 'stamp' + (gold ? ' gold' : '');
    stamp.hidden = false;
    void stamp.offsetWidth;
    stamp.classList.add('land');
    setTimeout(function () {
      var card = $('qCard');
      card.classList.remove('thud');
      void card.offsetWidth;
      card.classList.add('thud');
    }, 250);
  }
  function showCombo() {
    var combo = $('combo');
    if (S.combo >= 2) {
      combo.textContent = S.combo + '연속 정답!';
      combo.hidden = false;
      combo.classList.remove('pop');
      void combo.offsetWidth;
      combo.classList.add('pop');
    } else {
      combo.hidden = true;
    }
  }
  function setFeedback(kind, starGained, text) {
    var fb = $('feedback');
    fb.className = 'feedback ' + kind;
    fb.textContent = '';
    if (starGained) fb.appendChild(el('span', 'star-gain', '★ 별 +1'));
    fb.appendChild(document.createTextNode(text));
    fb.hidden = false;
  }
  function wrongNote(q, chosenId) {
    var right = quoted(q.answer, '이에요.', '예요.');
    if (q.mode === 'diag') return '정답은 ' + right + ' 내일부터 배워요!';
    var lines = ['괜찮아요! 정답은 ' + right];
    if (chosenId && q.type === 'mean') {
      var w = WORD[chosenId];
      lines.push('고른 ' + w.w + '(' + w.r + ')' + (hasBatchim(w.r) ? '은' : '는') + ' “' + w.m + '”이에요.');
    } else if (chosenId && q.type === 'hun-pick') {
      lines.push('고른 ' + quoted(CHAR[chosenId].hun, '은', '는') + ' ' + CHAR[chosenId].h + '의 훈음이에요.');
    } else if (chosenId && q.type !== 'stroke') {
      lines.push('고른 한자: ' + CHAR[chosenId].h + ' ' + CHAR[chosenId].hun);
    }
    lines.push(q.explain);
    if (!q.choices && q.mode !== 'exam') lines.push('한 번 따라 써 볼까요?');
    return lines.join('\n');
  }
  function answer(correct, chosenId) {
    var q = S.steps[S.i].q, quick = q.mode === 'diag';
    var before = state.cards[q.id] ? state.cards[q.id].s : null;
    setState(L.recordAnswer(state, q, correct, today()));
    var gained = before !== null && state.cards[q.id].s > before;
    if (correct) {
      S.right++;
      S.combo++;
      landStamp(!q.choices);
      if (!q.choices) sfx.gold(); else sfx.stamp(S.combo);
      setFeedback('ok', gained, quick ? q.show + ' = ' + q.answer : q.explain);
    } else {
      S.combo = 0;
      // 진단에서 모르는 한자는 당연하니까 틀린 소리·흔들기 없이 정답만 보여 준다
      if (!quick) {
        var card = $('qCard');
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
        sfx.wrong();
      }
      setFeedback(quick ? 'info' : 'no', false, wrongNote(q, chosenId));
    }
    showCombo();
    stepDone(correct);
  }
  function showNext() {
    $('nextBtn').textContent = nextLabel();
    $('nextBtn').hidden = false;
  }
  function pick(btn, id) {
    if (answered) return;
    answered = true;
    var q = S.steps[S.i].q, ok = L.checkChoice(q, id);
    if (q.mode === 'exam') {
      examNext(btn, ok, q.choices.filter(function (c) { return c.id === id; })[0].text, true);
      return;
    }
    $('qBody').querySelectorAll('.choice').forEach(function (b) {
      b.disabled = true;
      if (Number(b.dataset.id) === q.key) b.classList.add('right');
    });
    if (!ok && id) btn.classList.add('wrong');
    answer(ok, id);
    if (q.mode === 'diag') {
      // 진단은 150문제라서 저절로 다음 문제로 넘어간다
      var at = S.i;
      autoNext = setTimeout(function () { if (S && S.i === at) advance(); }, ok ? 700 : 1400);
      return;
    }
    showNext();
  }
  function submitWrite() {
    var q = S.steps[S.i].q, input = $('wInput'), err = $('wErr');
    var typed = L.normalize(input.value);
    if (!typed) { err.textContent = '먼저 답을 써 주세요.'; return; }
    if (copyMode) {
      if (L.checkWrite(q, typed)) {
        copyMode = false;
        input.disabled = true;
        $('wBtn').disabled = true;
        $('feedback').appendChild(document.createTextNode('\n잘 따라 썼어요. 다음에 또 나올 거예요.'));
        sfx.pop();
        showNext();
      } else {
        err.textContent = quoted(q.answers[0], '을', '를') + ' 그대로 따라 써 보세요.';
      }
      return;
    }
    if (answered) return;
    answered = true;
    var ok = L.checkWrite(q, typed);
    if (q.mode === 'exam') { examNext(null, ok, input.value.trim(), false); return; }
    answer(ok, null);
    if (ok) {
      input.disabled = true;
      $('wBtn').disabled = true;
      showNext();
    } else {
      copyMode = true;
      input.value = '';
      input.placeholder = q.answers[0] + ' 따라 쓰기';
    }
  }
  $('nextBtn').addEventListener('click', function () { if (S) advance(); });

  // ---------- 결과 ----------
  var resultAction = 'home';
  var RESULT_TITLE = { daily: '오늘의 첫 번째 공부 끝!', review: '두 번째 공부 끝!', diag: '실력 진단 끝!', mock: '실전 시험 끝!' };
  // 기록은 마지막 문제를 풀 때 이미 저장했다(stepDone). 여기서는 결과만 보여 준다
  function finish() {
    clearTimeout(autoNext);
    stopClock();
    $('timer').hidden = true;
    $('progressFill').style.width = '100%';
    $('qCard').hidden = true;
    $('nextBtn').hidden = true;
    $('combo').hidden = true;
    $('qCount').textContent = '끝!';
    var kind = S.kind;
    $('resultTitle').textContent = S.timedOut ? '시간 끝! 채점했어요' : RESULT_TITLE[kind] || '연습 끝!';
    $('score').textContent = S.right + ' / ' + S.total;
    var gainedStars = L.totalStars(state) - S.starsBefore, gain = [];
    var known = Object.keys(state.cards).filter(function (id) { return state.cards[id].k; }).length;
    if (kind === 'diag') gain.push('아는 한자 ' + known + '자');
    if (gainedStars > 0) gain.push('별 +' + gainedStars);
    if (S.newCards) gain.push('새 한자 ' + S.newCards + '자');
    $('resultGain').textContent = gain.join(' · ');
    $('resultGain').hidden = !gain.length;
    var pm = L.passMark(S.total), passedNow = kind === 'mock' && S.right >= pm;
    var note = {
      practice: '연습 문제는 별과 스티커에 들어가지 않지만, 실력은 쑥쑥 늘어요.',
      diag: '벌써 아는 한자가 ' + known + '자! 남은 ' + (D.CHARS.length - Object.keys(state.cards).length) +
        '자는 내일부터 9일 동안 나눠서 배워요. ⭐ 스티커가 붙었어요. 조금 쉬었다가 두 번째 공부도 해요!',
      daily: L.allDone(state) ? L.LAST_DAY + '일 공부를 모두 마쳤어요! 시험도 장원급제예요!'
        : '⭐ 스티커가 붙었어요. 조금 쉬었다가 두 번째 공부(복습)도 해요!',
      review: '오늘 두 번째 칸에도 ⭐가 붙었어요. 마음에 드는 스티커로 바꿔 볼까요?',
      mock: passedNow ? '합격 점수(' + pm + '문제 이상)를 받았어요! 홍패를 받아요.'
        : '합격까지 ' + (pm - S.right) + '문제 더! 틀린 한자는 오늘 두 번째 공부에서 다시 나와요.'
    }[kind] || '';
    $('resultNote').textContent = note;
    $('resultNote').hidden = !note;
    resultAction = kind === 'practice' ? 'home' : kind === 'mock' ? (passedNow ? 'hong' : 'home') : 'sticker';
    $('resultBtn').textContent = { sticker: '스티커 고르러 가기', hong: '홍패 받으러 가기', home: '홈으로' }[resultAction];
    if (kind === 'mock') renderMissList(S);
    else $('resultList').hidden = true;
    $('result').hidden = false;
    S = null;
    sfx.fanfare();
    show('quiz');
  }
  // 실전 시험 결과: 걸린 시간, 틀린 문제(문제 · 내 답 · 정답), 시간이 끝나 못 푼 문제 수
  function renderMissList(X) {
    var box = $('resultList'), solved = X.steps.slice(0, X.i).filter(isQ).length;
    var used = Math.min(Date.now(), X.ends) - (X.ends - D.EXAM_MINUTES * 60000);
    box.innerHTML = '';
    box.appendChild(el('p', 'miss-time', '걸린 시간 ' + Math.floor(used / 60000) + '분 ' + (Math.floor(used / 1000) % 60) + '초' +
      (X.total > solved ? ' · 시간이 끝나서 못 푼 문제 ' + (X.total - solved) + '개' : '')));
    if (X.miss.length) {
      box.appendChild(el('h3', null, '틀린 문제 ' + X.miss.length + '개'));
      X.miss.forEach(function (m) {
        var q = X.steps[m.i].q, row = el('div', 'miss');
        var cell = el('span', 'miss-q' + (q.big ? ' hj' : ''), q.type === 'stroke' ? null : q.show);
        if (q.type === 'stroke') cell.innerHTML = strokeSvgHTML(q.show, q.n - 1, false, 'tiny');
        row.appendChild(cell);
        var info = el('span', 'miss-a');
        info.appendChild(el('small', null, TYPE_LABEL[q.type]));
        info.appendChild(el('span', null, '내 답: ' + (m.a || '(넘김)')));
        info.appendChild(el('b', null, '정답: ' + q.answer));
        row.appendChild(info);
        box.appendChild(row);
      });
    }
    box.hidden = false;
  }
  $('resultBtn').addEventListener('click', function () {
    if (resultAction === 'sticker') showSticker();
    else if (resultAction === 'hong') showHong(true);
    else goHome();
  });

  // ---------- 스티커 ----------
  var chosenSticker = null;
  // 내일 할 공부 미리 알려 주기 (11/10부터는 날짜로 정해진다)
  function nextDayHint(day) {
    var tomorrow = L.addDays(today(), 1), next = Q.dayType(state, tomorrow, D);
    if (day >= L.LAST_DAY || tomorrow >= D.EXAM_DATE) return '';
    if (next === 'mock') return ' 내일은 ' + D.EXAM_MINUTES + '분 실전 시험이에요!';
    if (next === 'light') return ' 내일은 시험 전날, 가볍게만 해요.';
    if (next === 'dok' && tomorrow >= D.MOCK_FROM) return ' 내일은 틀린 한자를 보강하는 날이에요.';
    if (next === 'dok' && Q.planType(day, D) === 'new') return ' 150자를 다 배웠어요! 다음 날부터는 한자어 읽기 집중이에요.';
    return '';
  }
  function lastSticker() { return state.stickers[state.stickers.length - 1]; }
  function showSticker() {
    var last = lastSticker();
    chosenSticker = null;
    $('stickerErr').textContent = '';
    var sub = last.day + '일째 ' + (last.k === 'review' ? '아래' : '위') + ' 칸의 ⭐를 원하는 스티커로 바꿔요.';
    if (last.k === 'review') sub += nextDayHint(last.day);
    $('stickerSub').textContent = sub;
    var box = $('stickers');
    box.innerHTML = '';
    D.STICKERS.forEach(function (s) {
      var b = el('button', null, s);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', s + ' 스티커');
      b.addEventListener('click', function () {
        chosenSticker = s;
        sfx.pop();
        $('stickerErr').textContent = '';
        box.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
      box.appendChild(b);
    });
    show('sticker');
  }
  $('stickBtn').addEventListener('click', function () {
    if (!chosenSticker) { $('stickerErr').textContent = '스티커를 먼저 골라 주세요.'; return; }
    var last = lastSticker();
    setState(L.setTodaySticker(state, chosenSticker, today()));
    justStuckKey = last.k + last.day;
    sfx.stamp(1);
    goHome();
    var msg = last.day + '일째 ' + (last.k === 'review' ? '두 번째' : '첫 번째') + ' 스티커를 붙였어요!';
    if (last.k === 'main') msg += ' 조금 쉬었다가 두 번째 공부도 해요.';
    else msg += nextDayHint(last.day);
    toast(msg);
  });

  // ---------- 선물 룰렛 ----------
  var WHEEL_COLORS = ['#F2B53A', '#CFEDE6', '#FBE2DC', '#C9D3F0', '#7FCDBC'];
  var SLICE = 360 / D.PRIZES.length;
  var spinning = false;
  function buildWheel() {
    var wheel = $('wheel');
    wheel.innerHTML = '';
    wheel.style.background = 'conic-gradient(' + D.PRIZES.map(function (p, i) {
      return WHEEL_COLORS[i % WHEEL_COLORS.length] + ' ' + (i * SLICE) + 'deg ' + ((i + 1) * SLICE) + 'deg';
    }).join(', ') + ')';
    D.PRIZES.forEach(function (p, i) {
      var seg = el('div', 'seg');
      seg.style.transform = 'rotate(' + (i * SLICE + SLICE / 2) + 'deg)';
      seg.appendChild(el('span', null, p));
      wheel.appendChild(seg);
    });
    wheel.appendChild(el('div', 'hub', '🎁'));
  }
  function showPrizeCoupon(fresh) {
    var slot = $('prizeSlot');
    slot.innerHTML = '';
    var cp = el('div', 'coupon');
    cp.appendChild(el('p', 'k', '선물 쿠폰'));
    cp.appendChild(el('p', 'v', state.prize.item));
    cp.appendChild(el('p', 'n', '부모님께 이 화면을 보여 주세요'));
    slot.appendChild(cp);
    $('spinBtn').hidden = true;
    $('prizeHome').hidden = false;
    $('prizeHint').textContent = fresh ? '축하해요!' : shortDate(state.prize.d) + '에 룰렛을 돌렸어요';
  }
  function setWheel(deg, animate) {
    var wheel = $('wheel');
    wheel.classList.toggle('instant', !animate);
    wheel.style.transform = 'rotate(' + deg + 'deg)';
  }
  function showPrize() {
    if (!L.passedMock(state)) { toast('실전 시험에서 합격 점수를 받으면 선물 룰렛을 돌릴 수 있어요.'); return; }
    buildWheel();
    spinning = false;
    $('prizeSlot').innerHTML = '';
    if (state.prize) {
      setWheel(-(state.prize.i * SLICE + SLICE / 2), false);
      showPrizeCoupon(false);
    } else {
      setWheel(0, false);
      $('spinBtn').hidden = false;
      $('prizeHome').hidden = true;
      $('prizeHint').textContent = '한 번만 돌릴 수 있어요. 무엇이 나올까요?';
    }
    show('prize');
  }
  function spin() {
    if (spinning || state.prize || !L.passedMock(state)) return;
    spinning = true;
    // 결과를 먼저 저장해서, 돌리는 중에 화면을 닫아도 다시 돌릴 수 없게 한다
    setState(L.pickPrize(state, D.PRIZES, Math.random, today()));
    var jitter = (Math.random() - 0.5) * SLICE * 0.6;
    var target = 360 * 6 - (state.prize.i * SLICE + SLICE / 2) + jitter;
    $('spinBtn').hidden = true;
    $('prizeHint').textContent = '빙글빙글…';
    sfx.rattle();
    setTimeout(sfx.rattle, 1300);
    setTimeout(sfx.rattle, 2700);
    void $('wheel').offsetWidth;
    setWheel(target, true);
    setTimeout(function () {
      spinning = false;
      sfx.fanfare();
      showPrizeCoupon(true);
      confetti($('prizeStage'));
    }, 4800);
  }
  $('spinBtn').addEventListener('click', spin);
  $('wheel').addEventListener('click', spin);

  $('hongGift').addEventListener('click', showPrize);

  // ---------- 홍패 ----------
  // 홍패에는 가장 잘 본 실전 시험 점수를 쓴다
  function showHong(fresh) {
    var e = L.bestMock(state);
    if (!e || !L.passedMock(state)) return;
    $('hongTitle').textContent = '한자 7급 실전 시험 ' + (L.examTitle(e.score, e.total) || '합격');
    $('hongName').textContent = state.name;
    $('hongScore').textContent = e.total + '문제 중 ' + e.score + '문제 정답 (합격 ' + L.passMark(e.total) + '문제)';
    $('hongDate').textContent = longDate(e.d);
    $('hongCoupon').hidden = !state.prize;
    $('hongReward').textContent = state.prize ? state.prize.item : '';
    $('hongGift').hidden = !!state.prize;
    show('hong');
    if (fresh) {
      sfx.fanfare();
      confetti($('hongStage'));
    }
  }

  // ---------- 부모님 메뉴 잠금 ----------
  // 4자리 비밀번호를 해시로만 비교한다. 3번 틀리면 30초 동안 막는다. 메뉴에 들어갈 때마다 다시 묻는다
  var PIN_TRIES = 3, PIN_WAIT_MS = 30000;
  var pinEntry = '', pinFails = 0, pinLockedUntil = 0, pinTimer = null;
  function pinWaitLeft() { return Math.max(0, Math.ceil((pinLockedUntil - Date.now()) / 1000)); }
  function renderPin() {
    $('pinDots').querySelectorAll('span').forEach(function (d, i) { d.classList.toggle('on', i < pinEntry.length); });
  }
  function renderLockMsg() {
    clearTimeout(pinTimer);
    var m = $('lockMsg'), left = pinWaitLeft();
    if (left > 0) {
      m.textContent = '여러 번 틀렸어요. ' + left + '초 뒤에 다시 해 주세요. 부모님께 여쭤보세요.';
      m.className = 'help bad';
      pinTimer = setTimeout(renderLockMsg, 1000);
    } else if (pinFails > 0) {
      m.textContent = '비밀번호가 틀렸어요. ' + (PIN_TRIES - pinFails) + '번 더 해 볼 수 있어요.';
      m.className = 'help bad';
    } else {
      m.textContent = '부모님 비밀번호 4자리를 눌러 주세요.';
      m.className = 'help';
    }
  }
  function showLock() {
    pinEntry = '';
    renderPin();
    renderLockMsg();
    show('lock');
  }
  function pressPin(key) {
    if (pinWaitLeft() > 0) return;
    if (key === 'del') { pinEntry = pinEntry.slice(0, -1); renderPin(); return; }
    if (pinEntry.length >= 4) return;
    pinEntry += key;
    renderPin();
    if (pinEntry.length < 4) return;
    if (L.checkPin(pinEntry, D.PARENT_PIN_HASH)) {
      pinFails = 0;
      pinEntry = '';
      showParent();
      return;
    }
    pinFails += 1;
    if (pinFails >= PIN_TRIES) { pinFails = 0; pinLockedUntil = Date.now() + PIN_WAIT_MS; }
    var dots = $('pinDots');
    dots.classList.remove('shake');
    void dots.offsetWidth;
    dots.classList.add('shake');
    sfx.wrong();
    pinEntry = '';                       // 바로 비워서 이어서 누르는 숫자도 받는다
    setTimeout(renderPin, 350);          // 흔들리는 동안만 점 4개를 보여 준다
    renderLockMsg();
  }
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].forEach(function (k) {
    if (!k) { $('keypad').appendChild(el('span', 'gap')); return; }
    var b = el('button', k === 'del' ? 'small' : null, k === 'del' ? '지우기' : k);
    b.type = 'button';
    b.setAttribute('aria-label', k === 'del' ? '한 글자 지우기' : '숫자 ' + k);
    b.addEventListener('click', function () { pressPin(k); });
    $('keypad').appendChild(b);
  });
  document.addEventListener('keydown', function (e) {
    if ($('v-lock').hidden) return;
    if (/^[0-9]$/.test(e.key)) pressPin(e.key);
    else if (e.key === 'Backspace') pressPin('del');
  });

  // ---------- 부모님 메뉴 ----------
  var pendingRestore = null;
  function msg(id, text, kind) {
    var m = $(id);
    m.textContent = text;
    m.className = 'msg' + (kind ? ' ' + kind : '');
  }
  function showParent() {
    $('pName').value = state.name;
    $('pCode').value = L.encodeBackup(state);
    $('pRestore').value = '';
    $('pReset').value = '';
    $('pRestoreConfirm').hidden = true;
    pendingRestore = null;
    ['pNameMsg', 'pSoundMsg', 'pStickerMsg', 'pCopyMsg', 'pRestoreMsg', 'pResetMsg'].forEach(function (id) { msg(id, ''); });
    $('pToday').checked = false;
    renderStickerRestore();
    show('parent');
  }

  // 스티커 되돌려 주기: 공부한 걸 부모님이 확인했는데 스티커가 사라졌을 때, 앞 칸부터 순서대로 다시 붙인다
  var restoreEmoji = '🌸';
  function renderStickerRestore() {
    var sel = $('pSlot'), slots = L.restorableSlots(state, today());
    sel.innerHTML = '';
    slots.forEach(function (s) {
      var o = el('option', null, s.day + '일째 ' + (s.kind === 'main' ? '위 칸 (첫 번째 공부)' : '아래 칸 (두 번째 공부·복습)'));
      o.value = s.kind + ':' + s.day;
      sel.appendChild(o);
    });
    var mainAt = slots.map(function (s) { return s.kind; }).indexOf('main');
    if (mainAt >= 0) sel.selectedIndex = mainAt;
    sel.disabled = !slots.length;
    $('pStickerBtn').hidden = !slots.length;
    if (!slots.length) msg('pStickerMsg', '되돌릴 칸이 없어요.');
    var box = $('pStickers');
    box.innerHTML = '';
    D.STICKERS.forEach(function (e) {
      var b = el('button', null, e);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(e === restoreEmoji));
      b.setAttribute('aria-label', e + ' 스티커');
      b.addEventListener('click', function () {
        restoreEmoji = e;
        box.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
      box.appendChild(b);
    });
  }
  $('pStickerBtn').addEventListener('click', function () {
    var v = $('pSlot').value;
    if (!v) return;
    var kind = v.split(':')[0], day = Number(v.split(':')[1]), t = today();
    var date = $('pToday').checked ? t : L.addDays(t, -1);
    var next = L.restoreSticker(state, kind, day, restoreEmoji, date, t);
    if (next === state) {
      msg('pStickerMsg', '오늘 한 같은 공부 스티커가 이미 있어요. “오늘 한 공부예요”를 끄고 붙여 주세요.', 'bad');
      return;
    }
    setState(next);
    $('pCode').value = L.encodeBackup(state);
    var done = day + '일째 ' + (kind === 'main' ? '위' : '아래') + ' 칸에 ' + restoreEmoji + ' 스티커를 붙였어요.';
    renderStickerRestore();
    msg('pStickerMsg', done, 'ok');
  });
  $('pSoundBtn').addEventListener('click', function () {
    sfx.fanfare();
    msg('pSoundMsg', '확인하는 중이에요');
    setTimeout(function () { msg('pSoundMsg', soundStatus()); }, 600);
  });
  $('pNameBtn').addEventListener('click', function () {
    var v = $('pName').value.trim();
    if (!v) { msg('pNameMsg', '이름을 써 주세요.', 'bad'); return; }
    setState(withChanges({ name: v.slice(0, 8) }));
    $('pCode').value = L.encodeBackup(state);
    msg('pNameMsg', '이름을 바꿨어요.', 'ok');
  });
  $('pCopyBtn').addEventListener('click', function () {
    var box = $('pCode');
    function fallback() {
      box.focus();
      box.select();
      msg('pCopyMsg', '코드를 길게 눌러 복사해 주세요.', 'bad');
    }
    try {
      navigator.clipboard.writeText(box.value).then(function () {
        msg('pCopyMsg', '복사했어요. 메모나 메시지에 붙여 두세요.', 'ok');
      }, fallback);
    } catch (e) {
      fallback();
    }
  });
  $('pRestoreBtn').addEventListener('click', function () {
    var dec = L.decodeBackup($('pRestore').value);
    $('pRestoreConfirm').hidden = true;
    if (!dec) {
      msg('pRestoreMsg', '코드가 올바르지 않아요. JW1.부터 끝까지 빠짐없이 붙여 넣었는지 확인해 주세요.', 'bad');
      return;
    }
    pendingRestore = dec;
    msg('pRestoreMsg', '');
    $('pRestoreInfo').textContent = (dec.name || '이름 없음') + '의 기록이에요. 스티커 ' + dec.stickers.length + '장, 한자 ' +
      Object.keys(dec.cards).length + '자, 별 ' + L.totalStars(dec) + '개. 지금 기록 대신 이 기록을 쓸까요?';
    $('pRestoreConfirm').hidden = false;
  });
  $('pRestoreYes').addEventListener('click', function () {
    if (!pendingRestore) return;
    setState(pendingRestore);
    pendingRestore = null;
    goHome();
    toast('기록을 되살렸어요.');
  });
  $('pRestoreNo').addEventListener('click', function () {
    pendingRestore = null;
    $('pRestoreConfirm').hidden = true;
  });
  $('pResetBtn').addEventListener('click', function () {
    if ($('pReset').value.trim() !== '지우기') {
      msg('pResetMsg', '“지우기”라고 써야 기록이 지워져요.', 'bad');
      return;
    }
    var fresh = L.emptyState();
    fresh.sound = state.sound;
    setState(fresh);
    $('nameInput').value = '';
    goHome();
  });

  $('appVersion').textContent = '버전 ' + APP_VERSION;
  goHome();
})();
