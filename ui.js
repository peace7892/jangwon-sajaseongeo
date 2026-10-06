/* 장원급제 사자성어: 화면 그리기, 소리, 입력, 저장 */
(function () {
  'use strict';
  var D = window.DATA, L = window.Logic;
  var KEY = 'jangwon-sajaseongeo-v1';
  var CARD = {}, GROUP = {};
  D.CARDS.forEach(function (c) { CARD[c.id] = c; });
  D.GROUPS.forEach(function (g) { GROUP[g.id] = g; });

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
  function meaningPhrase(m) {
    var core = m.split('뜻으로, ').pop();   // "~다는 뜻으로, ~" 이면 "뜻"이 겹치지 않게 뒷부분만
    return '“' + core + '”' + (hasBatchim(core) ? '이라는' : '라는') + ' 뜻이에요.';
  }

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
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { if (!storageError) storageError = (e && e.name) || '읽기 실패'; }
    if (!raw) {
      var copy = tabCopy(), fromTab = copy && parseState(copy);
      if (fromTab && fromTab.name) { recoveredFromTab = true; return fromTab; }
      return L.emptyState();
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
  if (recoveredFromTab) save();
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
  // 효과음은 WAV로 만들어 data: 주소로 일반 오디오(<audio>)에 넣는다. 아이패드 Safari는 blob: 주소 오디오를
  // NotSupportedError로 거절해서 data: 주소를 쓴다. 그래도 일반 오디오가 안 되면 Web Audio로 재생한다.
  // 아이패드는 오디오를 첫 터치 때 한 번 "깨워야" 나중에 재생할 수 있어서, 두 방식 모두 첫 터치 때 깨워 둔다.
  var players = {}, unlocked = false, lastPlay = null, useWebAudio = false, ac = null, buffers = {};
  function clipSamples(name) { return window.Sound.renderClip(window.Sound.CLIPS[name], window.Sound.RATE); }
  function wavDataURL(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return 'data:audio/wav;base64,' + btoa(bin);
  }
  function player(name) {
    if (!players[name]) {
      var a = new Audio();
      a.preload = 'auto';
      a.src = wavDataURL(window.Sound.encodeWav(clipSamples(name), window.Sound.RATE));
      a.addEventListener('ended', function () { a.busy = false; });
      players[name] = a;
    }
    return players[name];
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
    audioContext();   // 대신 쓸 Web Audio도 이 터치 안에서 깨워 둔다
    var probe = document.createElement('audio');
    if (!probe.canPlayType || !probe.canPlayType('audio/wav')) { useWebAudio = true; return; }
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
          if (err && err.name === 'NotSupportedError') useWebAudio = true;
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
    if (useWebAudio) {
      var ok = webAudioPlay(name);
      lastPlay = { ok: ok, via: 2, why: ok ? '' : 'Web Audio' };
      return;
    }
    var a = player(name);
    a.busy = true;
    a.muted = false;
    try { a.currentTime = 0; } catch (e) { /* 아직 불러오는 중이면 처음부터 재생된다 */ }
    var p = a.play();
    if (p && p.then) {
      p.then(function () { lastPlay = { ok: true, via: 1 }; }, function (err) {
        a.busy = false;
        var why = (err && err.name) || '알 수 없음';
        if (why === 'NotSupportedError') {
          useWebAudio = true;
          var ok2 = webAudioPlay(name);
          lastPlay = { ok: ok2, via: 2, why: ok2 ? '' : why };
        } else {
          lastPlay = { ok: false, via: 1, why: why };
        }
      });
    }
  }
  function soundStatus() {
    if (!state.sound) return '앱 소리가 꺼져 있어요. 홈 화면 오른쪽 위 “소리 끔”을 눌러 켜 주세요.';
    if (!lastPlay) return '소리를 아직 재생하지 못했어요. 한 번 더 눌러 주세요.';
    if (lastPlay.ok) {
      return '소리를 재생했어요 (방식 ' + lastPlay.via + '). 그래도 안 들리면 아이패드 볼륨 버튼으로 소리를 키우고, 무음 모드가 아닌지 확인해 주세요.';
    }
    return '소리 재생이 막혔어요 (' + lastPlay.why + ', 방식 ' + lastPlay.via + '). 이 문구를 Claude에게 알려 주세요.';
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
  var VIEWS = ['name', 'home', 'card', 'quiz', 'sticker', 'prize', 'hong', 'parent'];
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
    S = null;
    renderStorageWarn();
    if (!state.name) { show('name'); return; }
    renderHome();
    show('home');
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-go="home"]')) goHome();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    if (syncFromStorage()) {
      if (S) toast('다른 창에서 한 공부를 불러왔어요.');
      goHome();
    } else if (!S && !$('v-home').hidden) {
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
      next.textContent = '모든 카드를 외웠어요. 장원이에요!';
    }
    renderStorageWarn();
    $('inAppWarn').hidden = !IN_APP;
    var left = L.daysUntil(t, D.EXAM_DATE);
    $('dday').hidden = left < 0;
    $('dday').textContent = left > 0 ? '대회까지 ' + left + '일' : '오늘이 대회 날! 힘내요';

    renderStart(t);
    var learned = renderTiles();
    $('practiceBtn').hidden = learned === 0;
    $('examPracticeBtn').hidden = learned < D.CARDS.length;
    renderBoard(t);
  }

  function mainCount() { return state.stickers.filter(function (s) { return s.k !== 'review'; }).length; }
  function renderStart(t) {
    var finished = mainCount() >= L.LAST_DAY, done = L.doneToday(state, t), act = L.activeSession(state, t);
    var review = L.canReview(state, t);
    if (!act && (finished || (done && !review))) {
      $('startBtn').hidden = true;
      $('doneBanner').hidden = false;
      if (finished) {
        $('doneMain').textContent = L.LAST_DAY + '일을 모두 마쳤어요!';
        $('doneSub').textContent = state.prize
          ? '선물: ' + state.prize.item + ' · 대회 날까지 연습 문제로 복습해요.'
          : '스티커판의 🎁를 눌러 선물 룰렛을 돌려요!';
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
      $('startMain').textContent = act.kind === 'exam' ? '과거 시험 이어서 보기'
        : act.kind === 'review' ? '두 번째 공부 이어서 하기' : '이어서 하기';
      $('startSub').textContent = cardsLeft
        ? '새 카드 ' + cardsLeft + '장 남았어요'
        : '문제 ' + (qDone + 1) + ' / ' + qTotal + '부터';
      return;
    }
    if (review) {
      var rq = L.buildReview(state, t, D, Math.random).steps.length;
      $('startMain').textContent = '두 번째 공부 시작';
      $('startSub').textContent = '오늘 배운 카드 다시 쓰기 + 복습 · ' + rq + '문제';
      return;
    }
    if (L.isExamDay(state, t)) {
      $('startMain').textContent = '과거 시험 보러 가기';
      $('startSub').textContent = L.LAST_DAY + '일째 · ' + D.CARDS.length + '문제 · 홍패를 받아요';
      return;
    }
    var preview = L.buildSession(state, t, D, Math.random);
    var reviews = preview.steps.filter(function (s) { return isQ(s) && s.q.mode === 'review'; }).length;
    var cards = preview.steps.filter(isCard).length;
    var parts = [L.studyDay(state, t) + '일째'];
    if (reviews) parts.push('복습 ' + reviews + '문제');
    if (cards) parts.push('새 카드 ' + cards + '장');
    if (!reviews && !cards) parts.push('연습 ' + preview.steps.filter(isQ).length + '문제');
    $('startMain').textContent = '오늘의 공부 시작';
    $('startSub').textContent = parts.join(' · ');
  }

  // 스티커판: 날마다 한 칸씩, 위 칸은 첫 번째 공부, 아래 칸은 두 번째 공부(복습). 마지막 날은 홍패와 🎁 선물
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
  function cellFor(d, kind, isToday) {
    var sticker = state.stickers.filter(function (s) { return (s.k === 'review') === (kind === 'review') && s.day === d; })[0];
    var isFinal = kind === 'main' && d === L.LAST_DAY;
    var clickable = isFinal && !!state.exam;
    var c = el(clickable ? 'button' : 'div', 'cell' + (kind === 'review' ? ' rev' : ''));
    if (clickable) {
      c.type = 'button';
      c.addEventListener('click', function () { showHong(false); });
    }
    if (sticker) {
      c.classList.add('filled');
      var s = el('span', 'stk', sticker.e);
      var r = ROT[(d * 2 + (kind === 'review' ? 1 : 0)) % 7];
      s.style.setProperty('--r', r + 'deg');
      s.style.transform = 'rotate(' + r + 'deg)';
      c.appendChild(s);
      if (justStuckKey === kind + d) c.classList.add('just-stuck');
    } else if (isFinal) {
      c.classList.add('locked');
      c.appendChild(el('span', 'stk', '📜'));
    } else {
      c.textContent = isToday ? '오늘' : kind === 'review' ? '복습' : '';
    }
    if (!sticker && isToday) c.classList.add('today');
    if (isFinal) {
      c.classList.add('final');
      c.appendChild(el('span', 'tag', '홍패'));
    }
    c.setAttribute('aria-label', d + '일째 ' + (kind === 'review' ? '두 번째 공부' : isFinal ? '과거 시험' : '첫 번째 공부') + (sticker ? ' 스티커' : ''));
    return c;
  }
  function giftCell() {
    var open = !!state.exam;
    var c = el(open ? 'button' : 'div', 'cell gift' + (open ? (state.prize ? '' : ' ready') : ' locked'));
    if (open) {
      c.type = 'button';
      c.addEventListener('click', showPrize);
    }
    c.appendChild(el('span', 'stk', '🎁'));
    c.appendChild(el('span', 'tag', state.prize ? '받았음' : open ? '열기!' : '선물'));
    c.setAttribute('aria-label', '선물 룰렛' + (open ? '' : ', 과거 시험을 마치면 열려요'));
    return c;
  }

  function renderTiles() {
    var box = $('tiles'), learned = 0;
    box.innerHTML = '';
    D.GROUPS.forEach(function (g) {
      g.ids.forEach(function (id) {
        var cs = state.cards[id], c = CARD[id];
        if (!cs) {
          var lock = el('div', 'tile lock', '?');
          lock.appendChild(el('span', 'st', ' '));
          lock.setAttribute('aria-label', '아직 못 얻은 카드');
          box.appendChild(lock);
          return;
        }
        learned++;
        var b = el('button', 'tile s' + cs.s, c.w);
        b.type = 'button';
        b.appendChild(el('span', 'st', starText(cs.s)));
        b.setAttribute('aria-label', c.w + ', 별 ' + cs.s + '개, 카드 보기');
        b.addEventListener('click', function () { showDogamCard(id); });
        box.appendChild(b);
      });
    });
    $('dogamCount').textContent = learned + ' / ' + D.CARDS.length + '장';
    return learned;
  }

  $('soundBtn').addEventListener('click', function () {
    setState(withChanges({ sound: !state.sound }));
    $('soundBtn').setAttribute('aria-pressed', String(state.sound));
    $('soundBtn').textContent = state.sound ? '소리 켬' : '소리 끔';
    sfx.pop();
  });
  $('startBtn').addEventListener('click', function () {
    var t = today(), act = L.activeSession(state, t);
    if (act) { beginSession(act); return; }
    var built;
    if (L.canReview(state, t)) built = L.buildReview(state, t, D, Math.random);
    else if (!L.doneToday(state, t)) built = L.buildSession(state, t, D, Math.random);
    else { renderHome(); return; }
    if (!built.steps.length) { renderHome(); return; }
    setState(L.startSession(state, built, t));
    beginSession(state.session);
  });
  $('practiceBtn').addEventListener('click', function () { startPractice(10, false); });
  $('examPracticeBtn').addEventListener('click', function () { startPractice(20, true); });
  $('parentLink').addEventListener('click', showParent);

  // ---------- 공부 진행 ----------
  // 오늘의 공부와 과거 시험은 기록(state.session)에 진행 위치를 저장해서, 나갔다 와도 이어서 한다.
  // 연습 문제는 저장하지 않는다.
  function beginSession(saved) {
    if (!saved.steps.length) { toast('먼저 오늘의 공부로 카드를 얻어 보세요.'); return; }
    S = {
      kind: saved.kind, steps: saved.steps, i: saved.i || 0, combo: 0, right: saved.right || 0,
      qn: saved.steps.slice(0, saved.i || 0).filter(isQ).length,
      total: saved.steps.filter(isQ).length,
      newCards: saved.newCards != null ? saved.newCards : saved.steps.filter(isCard).length,
      starsBefore: saved.starsBefore != null ? saved.starsBefore : L.totalStars(state),
      persist: saved.kind !== 'practice'
    };
    $('combo').hidden = true;
    runStep();
  }
  function startPractice(n, all) {
    beginSession({ kind: 'practice', steps: L.buildPractice(state, D, n, Math.random, all) });
  }
  // 카드 한 장이나 문제 하나를 마칠 때마다 부른다. 마지막 단계면 그 자리에서 오늘을 마친 것으로 기록한다
  function stepDone(correct) {
    if (!S.persist) return;
    setState(L.advanceSession(state, correct));
    if (S.i + 1 < S.steps.length) return;
    var t = today();
    if (S.kind === 'exam') setState(L.endSession(L.recordExam(state, S.right, S.total, t)));
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
    return next.t === 'card' ? '새 카드 보러 가기' : '다음 문제';
  }

  // ---------- 카드 ----------
  var cardMode = 'learn';
  function cardBackHTML(card, stars) {
    var html = '<div class="sc-top"><span class="sc-group">' + esc(GROUP[card.g].name) + '</span>' +
      '<span class="sc-stars" aria-label="별 ' + (stars || 0) + '개">' + starText(stars || 0) + '</span></div>' +
      '<div><p class="sc-word">' + esc(card.w) + '</p><p class="sc-hanja">' + esc(card.h) + '</p></div>' +
      '<dl class="sc-chars" style="grid-template-columns: repeat(' + card.c.length + ', minmax(0, 1fr))">' +
      card.c.map(function (x) { return '<div><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>'; }).join('') +
      '</dl><p class="sc-mean">' + esc(card.m) + '</p>';
    if (card.st) html += '<div class="sc-row"><b>이야기</b><p>' + esc(card.st) + '</p></div>';
    html += '<div class="sc-row"><b>예문</b><p>' + esc(card.ex) + '</p></div>';
    if (card.tip) html += '<div class="sc-row sc-tip"><b>기억 팁</b><p>' + esc(card.tip) + '</p></div>';
    if (card.cf) html += '<div class="sc-row sc-warn"><b>헷갈리는 짝 · ' + esc(CARD[card.cf.id].w) + '</b><p>' + esc(card.cf.d) + '</p></div>';
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
    var c = CARD[id], cardSteps = S.steps.filter(isCard), k = 0;
    cardSteps.forEach(function (s, i) { if (s.id === id) k = i + 1; });
    cardMode = 'learn';
    $('cardEyebrow').textContent = '오늘의 새 카드 ' + k + ' / ' + cardSteps.length + ' · ' + GROUP[c.g].name;
    $('cardBack').innerHTML = cardBackHTML(c, 0);
    $('flipFront').hidden = false;
    resetFlip(false);
    $('cardNext').hidden = true;
    $('cardNext').textContent = nextLabel() === '다음 문제' ? '문제 풀러 가기' : nextLabel() === '새 카드 보러 가기' ? '다음 카드' : '결과 보기';
    show('card');
  }
  function showDogamCard(id) {
    var c = CARD[id];
    cardMode = 'dogam';
    $('cardEyebrow').textContent = '사자성어 도감 · ' + GROUP[c.g].name;
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
  var TYPE_LABEL = { w2m: '성어 보고 뜻 고르기', m2w: '뜻 보고 성어 고르기', write: '직접 쓰기' };
  var MODE_LABEL = { review: '복습', learn: '새 카드', practice: '연습', exam: '과거 시험' };
  var HELP = { w2m: '알맞은 뜻을 고르세요.', m2w: '이 뜻을 가진 사자성어를 고르세요.', write: '이 뜻을 가진 사자성어를 쓰세요.' };
  var answered = false, copyMode = false;

  function showQuestion(q) {
    S.qn++;
    answered = false;
    copyMode = false;
    $('qCount').textContent = '문제 ' + S.qn + ' / ' + S.total;
    $('progressFill').style.width = Math.round((S.qn - 1) / S.total * 100) + '%';
    $('qType').textContent = MODE_LABEL[q.mode] + ' · ' + TYPE_LABEL[q.type];
    $('qText').textContent = q.prompt;
    $('qText').className = 'q-text' + (q.type === 'w2m' ? ' big' : '');
    $('qHelp').textContent = HELP[q.type];
    $('feedback').hidden = true;
    $('stamp').hidden = true;
    $('nextBtn').hidden = true;
    $('result').hidden = true;
    $('qCard').hidden = false;
    $('qCard').classList.remove('shake', 'thud');
    var body = $('qBody');
    body.innerHTML = '';
    if (q.type === 'write') {
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
      input.placeholder = '여기에 쓰기';
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
      var list = el('div', 'choices');
      q.choices.forEach(function (ch) {
        var b = el('button', 'choice' + (q.type === 'm2w' ? ' word' : ''), ch.text);
        b.type = 'button';
        b.dataset.id = ch.id;
        b.addEventListener('click', function () { pick(b, ch.id); });
        list.appendChild(b);
      });
      body.appendChild(list);
    }
    show('quiz');
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
  function setFeedback(ok, starGained, text) {
    var fb = $('feedback');
    fb.className = 'feedback ' + (ok ? 'ok' : 'no');
    fb.textContent = '';
    if (starGained) fb.appendChild(el('span', 'star-gain', '★ 별 +1'));
    fb.appendChild(document.createTextNode(text));
    fb.hidden = false;
  }
  function wrongNote(q, chosenId) {
    var c = CARD[q.id], lines = [];
    if (q.type === 'write') {
      lines.push('괜찮아요! 정답은 ' + quoted(c.w, '이에요.', '예요.') + ' 한 번 따라 써 볼까요?');
      if (c.tip) lines.push(c.tip);
      return lines.join('\n');
    }
    var o = CARD[chosenId];
    if (q.type === 'w2m') {
      lines.push('괜찮아요! ' + quoted(c.w, '은', '는') + ' ' + meaningPhrase(c.m));
      lines.push('고른 뜻은 ' + quoted(o.w, '이에요.', '예요.'));
    } else {
      lines.push('괜찮아요! 정답은 ' + quoted(c.w, '이에요.', '예요.'));
      lines.push('고른 ' + quoted(o.w, '은', '는') + ' ' + meaningPhrase(o.m));
    }
    if (c.cf && c.cf.id === o.id) lines.push(c.cf.d);
    else if (o.cf && o.cf.id === c.id) lines.push(o.cf.d);
    return lines.join('\n');
  }
  function answer(correct, chosenId) {
    var q = S.steps[S.i].q, c = CARD[q.id];
    var before = state.cards[q.id] ? state.cards[q.id].s : null;
    setState(L.recordAnswer(state, q, correct, today()));
    var gained = before !== null && state.cards[q.id].s > before;
    if (correct) {
      S.right++;
      S.combo++;
      landStamp(q.type === 'write');
      if (q.type === 'write') sfx.gold(); else sfx.stamp(S.combo);
      setFeedback(true, gained, c.w + ': ' + c.m);
    } else {
      S.combo = 0;
      var card = $('qCard');
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      sfx.wrong();
      setFeedback(false, false, wrongNote(q, chosenId));
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
    $('qBody').querySelectorAll('.choice').forEach(function (b) {
      b.disabled = true;
      if (Number(b.dataset.id) === q.id) b.classList.add('right');
    });
    if (!ok) btn.classList.add('wrong');
    answer(ok, id);
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
        err.textContent = quoted(q.answer, '을', '를') + ' 그대로 따라 써 보세요.';
      }
      return;
    }
    if (answered) return;
    answered = true;
    var ok = L.checkWrite(q, typed);
    answer(ok, null);
    if (ok) {
      input.disabled = true;
      $('wBtn').disabled = true;
      showNext();
    } else {
      copyMode = true;
      input.value = '';
      input.placeholder = q.answer + ' 따라 쓰기';
    }
  }
  $('nextBtn').addEventListener('click', function () { if (S) advance(); });

  // ---------- 결과 ----------
  var resultAction = 'home';
  // 기록은 마지막 문제를 풀 때 이미 저장했다(stepDone). 여기서는 결과만 보여 준다
  function finish() {
    $('progressFill').style.width = '100%';
    if (S.kind === 'exam') {
      S = null;
      showHong(true);
      return;
    }
    $('qCard').hidden = true;
    $('nextBtn').hidden = true;
    $('combo').hidden = true;
    $('qCount').textContent = '끝!';
    $('resultTitle').textContent = S.kind === 'daily' ? '오늘의 첫 번째 공부 끝!'
      : S.kind === 'review' ? '두 번째 공부 끝!' : '연습 끝!';
    $('score').textContent = S.right + ' / ' + S.total;
    var gainedStars = L.totalStars(state) - S.starsBefore, gain = [];
    if (gainedStars > 0) gain.push('별 +' + gainedStars);
    if (S.newCards) gain.push('새 카드 ' + S.newCards + '장');
    $('resultGain').textContent = gain.join(' · ');
    $('resultGain').hidden = !gain.length;
    var needSticker = S.kind === 'daily' || S.kind === 'review';
    $('resultNote').textContent = !needSticker
      ? '연습 문제는 별과 스티커에 들어가지 않지만, 실력은 쑥쑥 늘어요.'
      : S.kind === 'daily'
        ? '⭐ 스티커가 붙었어요. 조금 쉬었다가 두 번째 공부(복습)도 해요!'
        : '오늘 두 번째 칸에도 ⭐가 붙었어요. 마음에 드는 스티커로 바꿔 볼까요?';
    $('resultNote').hidden = !$('resultNote').textContent;
    resultAction = needSticker ? 'sticker' : 'home';
    $('resultBtn').textContent = needSticker ? '스티커 고르러 가기' : '홈으로';
    $('result').hidden = false;
    S = null;
    sfx.fanfare();
    show('quiz');
  }
  $('resultBtn').addEventListener('click', function () {
    if (resultAction === 'sticker') showSticker();
    else goHome();
  });

  // ---------- 스티커 ----------
  var chosenSticker = null;
  function lastSticker() { return state.stickers[state.stickers.length - 1]; }
  function showSticker() {
    var last = lastSticker();
    chosenSticker = null;
    $('stickerErr').textContent = '';
    var sub = last.day + '일째 ' + (last.k === 'review' ? '아래' : '위') + ' 칸의 ⭐를 원하는 스티커로 바꿔요.';
    if (last.k === 'review' && last.day + 1 === L.LAST_DAY) sub += ' 다음은 과거 시험이에요!';
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
    else if (last.day + 1 === L.LAST_DAY) msg += ' 다음은 과거 시험이에요!';
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
    if (!state.exam) { toast('과거 시험을 마치면 선물 룰렛을 돌릴 수 있어요.'); return; }
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
    if (spinning || state.prize || !state.exam) return;
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
  function showHong(fresh) {
    var e = state.exam;
    if (!e) return;
    $('hongTitle').textContent = '사자성어 과거 시험 ' + L.examTitle(e.score, e.total);
    $('hongName').textContent = state.name;
    $('hongScore').textContent = e.total + '문제 중 ' + e.score + '문제 정답';
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
    $('pRestoreInfo').textContent = (dec.name || '이름 없음') + '의 기록이에요. 스티커 ' + dec.stickers.length + '장, 카드 ' +
      Object.keys(dec.cards).length + '장, 별 ' + L.totalStars(dec) + '개. 지금 기록 대신 이 기록을 쓸까요?';
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

  goHome();
})();
