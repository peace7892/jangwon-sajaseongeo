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
  var storageOk = true;
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; return L.emptyState(); }
    if (!raw) return L.emptyState();
    var parsed = null;
    try { parsed = L.sanitize(JSON.parse(raw)); } catch (e) { parsed = null; }
    if (!parsed) {
      try { localStorage.setItem(KEY + '-broken', raw); } catch (e) { /* 저장 불가는 아래 안내로 알린다 */ }
      return L.emptyState();
    }
    return parsed;
  }
  var state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; } catch (e) { storageOk = false; }
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
  var ac = null;
  function audio() {
    if (!state.sound) return null;
    if (!ac) {
      // 아이패드는 웹 효과음을 무음 모드에서 꺼 버리는 채널로 보낸다. 음악처럼 '재생' 채널로 보내 달라고 한다 (Safari 17+)
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 지원하지 않는 브라우저 */ }
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    // 앱을 오가거나 화면이 꺼졌다 켜지면 'interrupted'가 되므로, 'running'이 아니면 다시 켠다
    if (ac.state !== 'running' && ac.resume) ac.resume().catch(function () { /* 다음 터치에서 다시 시도 */ });
    return ac;
  }
  function soundStatus() {
    if (!state.sound) return '앱 소리가 꺼져 있어요. 홈 화면 오른쪽 위 “소리 끔”을 눌러 켜 주세요.';
    var session = navigator.audioSession ? navigator.audioSession.type : '지원 안 함';
    return '소리 장치: ' + (ac ? ac.state : '없음') + ' · 재생 채널: ' + session;
  }
  function tone(freq, at, dur, type, vol) {
    var a = audio();
    if (!a) return;
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function arpeggio(notes, gap, type, vol) {
    notes.forEach(function (f, i) { tone(f, i * gap, 0.45, type, vol); });
  }
  var sfx = {
    stamp: function (combo) {
      tone(90, 0, 0.18, 'triangle', 0.35);
      tone(1046, 0.09, 0.25);
      tone(1568, 0.19, 0.35);
      if (combo >= 2) tone(2093, 0.3, 0.4, 'sine', 0.12);
    },
    gold: function () {
      tone(90, 0, 0.18, 'triangle', 0.35);
      [1046, 1318, 1568, 2093].forEach(function (f, i) { tone(f, 0.08 + i * 0.09, 0.4, 'sine', 0.15); });
    },
    wrong: function () { tone(262, 0, 0.18, 'sine', 0.12); tone(220, 0.16, 0.28, 'sine', 0.12); },
    pop: function () { tone(660, 0, 0.08, 'square', 0.06); tone(990, 0.05, 0.12, 'sine', 0.12); },
    flip: function () { arpeggio([784, 1046, 1318], 0.06, 'triangle', 0.1); },
    fanfare: function () { arpeggio([523, 659, 784, 1046, 1318, 1568], 0.07, 'triangle', 0.12); }
  };

  // ---------- 공통 ----------
  var VIEWS = ['name', 'home', 'card', 'quiz', 'sticker', 'chest', 'hong', 'parent'];
  var S = null;          // 진행 중인 공부·연습
  var justStuck = 0;     // 방금 붙인 스티커 칸 (한 번만 움직임)
  function show(name) {
    VIEWS.forEach(function (v) { $('v-' + v).hidden = v !== name; });
    window.scrollTo(0, 0);
  }
  function goHome() {
    S = null;
    if (!state.name) { show('name'); return; }
    renderHome();
    show('home');
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-go="home"]')) goHome();
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !S && !$('v-home').hidden) renderHome();
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
    $('storageWarn').hidden = storageOk;

    renderStart(t);
    var learned = renderTiles();
    $('practiceBtn').hidden = learned === 0;
    $('examPracticeBtn').hidden = learned < D.CARDS.length;
    renderBoard(t);
  }

  function renderStart(t) {
    var n = state.stickers.length, done = L.doneToday(state, t);
    if (n >= 21 || done) {
      $('startBtn').hidden = true;
      $('doneBanner').hidden = false;
      $('doneMain').textContent = n >= 21 ? '21일을 모두 마쳤어요!' : '오늘 공부 끝!';
      $('doneSub').textContent = n >= 21
        ? '대회 날까지 연습 문제로 복습해요.'
        : '내일 또 만나요. 더 하고 싶으면 아래 연습 문제를 풀어요.';
      return;
    }
    $('startBtn').hidden = false;
    $('doneBanner').hidden = true;
    if (L.isExamDay(state, t)) {
      $('startMain').textContent = '과거 시험 보러 가기';
      $('startSub').textContent = '21일째 · 20문제 · 홍패를 받아요';
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

  var ROT = [-8, 6, -4, 9, -6, 5, -9];
  function renderBoard(t) {
    var board = $('board'), n = state.stickers.length, done = L.doneToday(state, t);
    board.innerHTML = '';
    $('boardCount').textContent = n + ' / 21일';
    for (var w = 0; w < 3; w++) {
      var row = el('div', 'week');
      row.appendChild(el('span', 'wk', (w + 1) + '주'));
      var cells = el('div', 'cells');
      for (var d = w * 7 + 1; d <= w * 7 + 7; d++) cells.appendChild(cellFor(d, n, done));
      row.appendChild(cells);
      board.appendChild(row);
    }
    justStuck = 0;
  }
  function cellFor(d, n, done) {
    var sticker = state.stickers[d - 1];
    var isChest = d === 7 || d === 14, isFinal = d === 21;
    var chest = isChest ? L.chestState(state, d) : null;
    var clickable = (isChest && chest !== 'locked') || (isFinal && !!state.exam);
    var c = el(clickable ? 'button' : 'div', 'cell');
    if (clickable) {
      c.type = 'button';
      c.addEventListener('click', isFinal ? function () { showHong(false); } : function () { openChestView(d); });
    }
    if (sticker) {
      c.classList.add('filled');
      var s = el('span', 'stk', sticker.e);
      s.style.setProperty('--r', ROT[d % 7] + 'deg');
      s.style.transform = 'rotate(' + ROT[d % 7] + 'deg)';
      c.appendChild(s);
      if (d === justStuck) c.classList.add('just-stuck');
    } else if (isChest) {
      c.classList.add('locked');
      c.appendChild(el('span', 'stk', '🎁'));
    } else if (isFinal) {
      c.classList.add('locked');
      c.appendChild(el('span', 'stk', '📜'));
    } else {
      c.textContent = !done && d === n + 1 ? '오늘' : String(d);
    }
    if (!sticker && !done && d === n + 1) c.classList.add('today');
    if (isChest) {
      c.classList.add('chest');
      if (chest === 'ready') c.classList.add('ready');
      c.appendChild(el('span', 'tag', chest === 'ready' ? '열기!' : chest === 'opened' ? '열었음' : '보물'));
    }
    if (isFinal) {
      c.classList.add('final');
      c.appendChild(el('span', 'tag', '홍패'));
    }
    var label = d + '일째' + (sticker ? ' 스티커' : '') + (isChest ? ' 보물상자' : '') + (isFinal ? ' 과거 시험' : '');
    c.setAttribute('aria-label', label);
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
    var t = today();
    if (L.doneToday(state, t)) { renderHome(); return; }
    var built = L.buildSession(state, t, D, Math.random);
    beginSession(built.kind, built.steps);
  });
  $('practiceBtn').addEventListener('click', function () { startPractice(10, false); });
  $('examPracticeBtn').addEventListener('click', function () { startPractice(20, true); });
  $('parentLink').addEventListener('click', showParent);

  // ---------- 공부 진행 ----------
  function beginSession(kind, steps) {
    if (!steps.length) { toast('먼저 오늘의 공부로 카드를 얻어 보세요.'); return; }
    S = {
      kind: kind, steps: steps, i: 0, qn: 0, combo: 0, right: 0,
      total: steps.filter(isQ).length,
      newCards: steps.filter(isCard).length,
      starsBefore: L.totalStars(state)
    };
    $('combo').hidden = true;
    runStep();
  }
  function startPractice(n, all) {
    beginSession('practice', L.buildPractice(state, D, n, Math.random, all));
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
  function finish() {
    var t = today();
    $('progressFill').style.width = '100%';
    if (S.kind === 'exam') {
      setState(L.recordExam(state, S.right, S.total, t));
      justStuck = 21;
      S = null;
      showHong(true);
      return;
    }
    $('qCard').hidden = true;
    $('nextBtn').hidden = true;
    $('combo').hidden = true;
    $('qCount').textContent = '끝!';
    $('resultTitle').textContent = S.kind === 'daily' ? '오늘의 공부 끝!' : '연습 끝!';
    $('score').textContent = S.right + ' / ' + S.total;
    var gainedStars = L.totalStars(state) - S.starsBefore, gain = [];
    if (gainedStars > 0) gain.push('별 +' + gainedStars);
    if (S.newCards) gain.push('새 카드 ' + S.newCards + '장');
    $('resultGain').textContent = gain.join(' · ');
    $('resultGain').hidden = !gain.length;
    var needSticker = S.kind === 'daily' && !L.doneToday(state, t);
    $('resultNote').textContent = needSticker
      ? '이제 오늘의 스티커를 붙여요!'
      : S.kind === 'practice' ? '연습 문제는 별과 스티커에 들어가지 않지만, 실력은 쑥쑥 늘어요.' : '';
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
  function showSticker() {
    var day = state.stickers.length + 1;
    chosenSticker = null;
    $('stickerErr').textContent = '';
    var sub = day + '일째 칸에 붙어요.';
    if (day === 7 || day === 14) sub += ' 붙이면 보물상자가 열려요!';
    else if (day + 1 === 7 || day + 1 === 14) sub += ' 다음 칸은 보물상자예요!';
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
    var day = state.stickers.length + 1;
    setState(L.addSticker(state, chosenSticker, today()));
    if (state.stickers.length !== day) { goHome(); return; }
    justStuck = day;
    sfx.stamp(1);
    if ((day === 7 || day === 14) && L.chestState(state, day) === 'ready') {
      openChestView(day);
      return;
    }
    goHome();
    var msg = day + '일째 스티커를 붙였어요!';
    if (day + 1 === 7 || day + 1 === 14) msg += ' 다음 칸은 보물상자예요.';
    else if (day + 1 === 21) msg += ' 다음은 과거 시험이에요!';
    toast(msg);
  });

  // ---------- 보물상자 ----------
  var chestDay = 7, chestOpening = false;
  function addCoupon(day) {
    var slot = $('couponSlot');
    slot.innerHTML = '';
    var cp = el('div', 'coupon');
    cp.appendChild(el('p', 'k', '보상 쿠폰'));
    cp.appendChild(el('p', 'v', D.REWARDS[day]));
    cp.appendChild(el('p', 'n', '부모님께 이 화면을 보여 주세요'));
    slot.appendChild(cp);
  }
  function openChestView(day) {
    var st = L.chestState(state, day);
    if (st === 'locked') { toast(day + '번째 스티커를 붙이면 열 수 있어요.'); return; }
    chestDay = day;
    chestOpening = false;
    $('couponSlot').innerHTML = '';
    $('chestBtn').classList.remove('wiggle');
    $('chestTitle').textContent = day + '일째 보물상자';
    if (st === 'opened') {
      $('chestBtn').hidden = true;
      addCoupon(day);
      $('chestHint').textContent = shortDate(state.chests[day]) + '에 열었어요';
      $('chestHome').hidden = false;
    } else {
      $('chestBtn').hidden = false;
      $('chestHint').textContent = '눌러서 열어 보세요';
      $('chestHome').hidden = true;
    }
    show('chest');
  }
  $('chestBtn').addEventListener('click', function () {
    if (chestOpening || L.chestState(state, chestDay) !== 'ready') return;
    chestOpening = true;
    var btn = $('chestBtn');
    btn.classList.add('wiggle');
    tone(300, 0, 0.1, 'triangle', 0.1);
    tone(340, 0.3, 0.1, 'triangle', 0.1);
    tone(380, 0.6, 0.1, 'triangle', 0.1);
    setTimeout(function () {
      setState(L.openChest(state, chestDay, today()));
      btn.hidden = true;
      sfx.fanfare();
      $('chestTitle').textContent = chestDay + '일 동안 정말 잘했어요!';
      addCoupon(chestDay);
      $('chestHint').textContent = '';
      $('chestHome').hidden = false;
      confetti($('chestStage'));
    }, 900);
  });

  // ---------- 홍패 ----------
  function showHong(fresh) {
    var e = state.exam;
    if (!e) return;
    $('hongTitle').textContent = '사자성어 과거 시험 ' + L.examTitle(e.score, e.total);
    $('hongName').textContent = state.name;
    $('hongScore').textContent = e.total + '문제 중 ' + e.score + '문제 정답';
    $('hongDate').textContent = longDate(e.d);
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
    ['pNameMsg', 'pSoundMsg', 'pCopyMsg', 'pRestoreMsg', 'pResetMsg'].forEach(function (id) { msg(id, ''); });
    show('parent');
  }
  $('pSoundBtn').addEventListener('click', function () {
    sfx.fanfare();
    msg('pSoundMsg', '확인하는 중이에요');
    setTimeout(function () { msg('pSoundMsg', soundStatus()); }, 400);
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
