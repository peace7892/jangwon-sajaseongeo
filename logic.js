/* 장원급제 한자 6급: 화면과 상관없는 계산 — 기록·별·간격·세션·스티커·실전 시험·백업 (브라우저: window.Logic, Node: module.exports) */
(function (root) {
  'use strict';

  // 맞혔을 때 다음 복습까지의 날 수: 별 0→1은 1일, 1→2는 3일, 2→3은 7일, 3에서는 14일마다.
  // 한 번이라도 틀린 적 있는 글자(miss ≥ 1)는 간격을 반으로(올림, 최소 1일) — 틀린 글자가 더 자주 나온다
  var REVIEW_GAP = [1, 3, 7, 14];
  var REVIEW_CAP = 20;
  var CHAR_COUNT = 300;
  var WRITE_COUNT = 150;        // 쓰기 범위: 7급까지 150자(id 1~150)
  var LAST_DAY = 80;            // 일요일을 뺀 공부일 (11/26에 시작하면 2/26까지 80일)
  var PASS_RATE = 0.7;          // 어문회 2급~8급 합격 기준 70% (6급 90문항 중 63, 7급 70문항 중 49)
  var TYPES = { 'hun-pick': 1, 'hun-write': 1, 'dok-write': 1, opp: 1, idiom: 1, mean: 1, stroke: 1, syn: 1, hom: 1,
    'write-trace': 1, 'write-hun': 1, 'write-word': 1 };
  var MODES = { review: 1, learn: 1, practice: 1, exam: 1, diag: 1, retry: 1 };
  var KINDS = ['diag', 'daily', 'review', 'mock', 'write'];
  var TOPIC_RE = /^[A-Za-z0-9_-]{12,64}$/;
  // 7급 기록을 가져올 때 별에 따라 첫 복습을 며칠 뒤로 나눌지 (한꺼번에 몰리지 않게)
  var CARRY = { 3: [7, 27], 2: [3, 13], 1: [1, 6], 0: [1, 2] };
  var BACKUP_PREFIX = 'JW1.';
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // ---------- 날짜 ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(key, n) {
    var p = key.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }
  function daysUntil(today, target) {
    function midnight(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getTime(); }
    return Math.round((midnight(target) - midnight(today)) / 86400000);
  }

  // ---------- 정답 판정 ----------
  function normalize(s) { return String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ''); }
  function matchesAny(input, answers) {
    var n = normalize(input);
    return n.length > 0 && (answers || []).some(function (a) { return normalize(a) === n; });
  }
  // 훈음 쓰기: 공식 훈음이 여럿이면(밥/먹을 식, 쇠 금 · 성 김, 오를/오른(쪽) 우) 하나만 써도, 함께 써도 정답.
  // 띄어쓰기·쉼표·빗금·가운뎃점·괄호는 무시하고, 쓴 순서도 따지지 않는다. 훈과 음을 엇갈려 쓰면(쇠 김) 틀린다
  var HUN_SEPARATORS = /[\s,\/·・、.()]+/g;
  function orderings(items) {   // 하나 이상 고른 모든 순서
    var out = [];
    (function grow(prefix, rest) {
      rest.forEach(function (x, i) {
        var next = prefix.concat([x]);
        out.push(next);
        grow(next, rest.slice(0, i).concat(rest.slice(i + 1)));
      });
    })([], items);
    return out;
  }
  function hunForms(answers) {
    var byEum = {}, eums = [], forms = Object.create(null);
    answers.forEach(function (a) {
      var s = a.normalize('NFC'), sp = s.lastIndexOf(' '), hun = s.slice(0, sp), eum = s.slice(sp + 1);
      if (!byEum[eum]) { byEum[eum] = []; eums.push(eum); }
      byEum[eum].push(hun);
    });
    // 음 하나마다: 그 음의 훈을 하나 이상 + 음 (밥먹을식), 또는 훈마다 음을 붙여서 (밥식먹을식)
    var perReading = eums.map(function (e) {
      var ways = [];
      orderings(byEum[e]).forEach(function (hs) {
        ways.push(hs.join('') + e);
        if (hs.length > 1) ways.push(hs.map(function (h) { return h + e; }).join(''));
      });
      return ways;
    });
    // 음이 여럿이면 함께 써도 된다 (쇠금성김)
    orderings(eums.map(function (_, i) { return i; })).forEach(function (idx) {
      var acc = [''];
      idx.forEach(function (i) {
        var next = [];
        acc.forEach(function (p) { perReading[i].forEach(function (f) { next.push(p + f); }); });
        acc = next;
      });
      acc.forEach(function (f) { forms[f.replace(HUN_SEPARATORS, '')] = true; });
    });
    // 훈이 같은 음들은 훈 한 번에 음을 이어 써도 된다 (수레 거/차)
    var shared = {};
    eums.forEach(function (e) { byEum[e].forEach(function (h) { (shared[h] = shared[h] || []).push(e); }); });
    Object.keys(shared).forEach(function (h) {
      if (shared[h].length > 1) orderings(shared[h]).forEach(function (es) { forms[(h + es.join('')).replace(HUN_SEPARATORS, '')] = true; });
    });
    return forms;
  }
  function matchesHun(input, answers) {
    var n = String(input == null ? '' : input).normalize('NFC').replace(HUN_SEPARATORS, '');
    return n.length > 0 && hunForms(answers || [])[n] === true;
  }
  function checkChoice(q, id) { return id === q.key; }
  function checkWrite(q, input) { return q.type === 'hun-write' ? matchesHun(input, q.answers) : matchesAny(input, q.answers); }

  // ---------- 별과 복습 ----------
  // 읽기 기록은 state.cards(300자), 쓰기 기록은 state.writes(150자). 문제의 track이 'write'면 쓰기 기록을 바꾼다
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function mapName(which) { return which === 'write' ? 'writes' : 'cards'; }
  function learnedIds(state, which) { return Object.keys(state[mapName(which)] || {}).map(Number); }
  function newCardState(today) { return { s: 0, due: addDays(today, 1), at: today }; }
  function gapFor(s, miss) { var g = REVIEW_GAP[s]; return miss > 0 ? Math.max(1, Math.ceil(g / 2)) : g; }
  // 맞히면 별 +1, 간격만큼 뒤로. 틀리면 별 −1, 다음 날 두 문제(two), 7일 뒤 다시 확인(wk)
  function applyReview(cs, correct, today) {
    var miss = cs.miss || 0, out;
    if (correct) {
      out = { s: Math.min(3, cs.s + 1), due: addDays(today, gapFor(cs.s, miss)), at: cs.at, miss: miss };
      if (cs.wk && cs.wk > today) out.wk = cs.wk;     // 다음 주 확인 날이 아직이면 남긴다
    } else {
      out = { s: Math.max(0, cs.s - 1), due: addDays(today, 1), at: cs.at, miss: miss + 1, wk: addDays(today, 7), two: true };
    }
    if (cs.k) out.k = 1;
    return out;
  }
  function dueAt(c) { return c.wk && c.wk < c.due ? c.wk : c.due; }
  // 복습 순서: ① 어제 틀린 글자(two) ② 다음 주 확인 날이 된 글자(wk) ③ 나머지는 오래 밀린 것·별이 적은 것부터.
  // 하루쯤 빠뜨려 복습이 쌓여도 틀린 글자 확인은 밀리지 않는다
  function dueIds(state, today, cap, which) {
    cap = cap == null ? REVIEW_CAP : cap;
    var map = state[mapName(which)] || {};
    function rank(c) { return c.two && c.due <= today ? 0 : c.wk && c.wk <= today ? 1 : 2; }
    return Object.keys(map).map(Number)
      .filter(function (id) { return dueAt(map[id]) <= today; })
      .sort(function (a, b) {
        var A = map[a], B = map[b];
        if (rank(A) !== rank(B)) return rank(A) - rank(B);
        if (dueAt(A) !== dueAt(B)) return dueAt(A) < dueAt(B) ? -1 : 1;
        return (A.s - B.s) || (a - b);
      })
      .slice(0, cap);
  }
  function totalStars(state) {
    function sum(map) { return Object.keys(map || {}).reduce(function (t, id) { return t + map[id].s; }, 0); }
    return sum(state.cards) + sum(state.writes);
  }
  function rankOf(stars, ranks) {
    var index = 0;
    ranks.forEach(function (r, i) { if (stars >= r.min) index = i; });
    var next = ranks[index + 1];
    return { index: index, name: ranks[index].name, next: next ? { name: next.name, need: next.min - stars } : null };
  }
  // 1일째 진단에서 맞힌 글자: 이미 아는 글자로 별 2개, 복습은 2~5일 뒤로 나눠서
  function markKnown(state, ids, today) {
    var next = clone(state), i = 0;
    ids.forEach(function (id) {
      if (next.cards[id]) return;
      next.cards[id] = { s: 2, due: addDays(today, 2 + (i++ % 4)), at: today, k: 1 };
    });
    return next;
  }
  function recordAnswer(state, q, correct, today) {
    var map = q.track === 'write' ? 'writes' : 'cards', cs = (state[map] || {})[q.id], next;
    // 진단: 모르던 글자를 맞히면 아는 글자로. 이미 배운 글자(7급)를 틀리면 별을 내리고 다음 날·다음 주에 다시
    if (q.mode === 'diag') {
      if (!cs) return correct && map === 'cards' ? markKnown(state, [q.id], today) : state;
      if (correct) return state;
      next = clone(state);
      next[map][q.id] = applyReview(cs, false, today);
      return next;
    }
    if (!cs) return state;
    // 새 글자를 배운 날: 훈음 쓰기(읽기)나 보고 쓰기(쓰기)를 맞히면 첫 별
    if (q.mode === 'learn') {
      if (!correct || cs.s > 0 || q.type !== (map === 'writes' ? 'write-hun' : 'hun-write')) return state;
      next = clone(state);
      next[map][q.id].s = 1;
      return next;
    }
    // 실전 시험에서 틀린 글자는 별 하나 내리고 오늘 두 번째 공부와 다음 주에 다시
    if (q.mode === 'exam') {
      if (correct) return state;
      next = clone(state);
      next[map][q.id] = applyReview(cs, false, today);
      next[map][q.id].due = today;
      delete next[map][q.id].two;
      return next;
    }
    if (q.mode !== 'review') return state;    // 연습·다시 풀기는 기록을 바꾸지 않는다
    next = clone(state);
    next[map][q.id] = applyReview(cs, correct, today);
    return next;
  }
  // 쓰기를 처음 배울 때(따라 쓰기) 쓰기 기록을 만든다
  function learnWrite(state, id, today) {
    if ((state.writes || {})[id]) return state;
    var next = clone(state);
    next.writes = next.writes || {};
    next.writes[id] = { s: 0, due: addDays(today, 1), at: today, miss: 0 };
    return next;
  }
  // 일요일은 쉬는 날
  function isRestDay(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]).getDay() === 0;
  }
  // 7급 기록에서 이름·소리·알림 코드·150자 읽기 별을 가져온다. 첫 복습은 별에 따라 며칠에 걸쳐 나눈다
  function importFromSeven(old, today) {
    var s = emptyState();
    if (!old || typeof old !== 'object') return s;
    if (typeof old.name === 'string') s.name = old.name.slice(0, 12);
    if (typeof old.sound === 'boolean') s.sound = old.sound;
    if (typeof old.notify === 'string' && TOPIC_RE.test(old.notify)) s.notify = old.notify;
    var counts = { 0: 0, 1: 0, 2: 0, 3: 0 }, cards = old.cards && typeof old.cards === 'object' ? old.cards : {};
    Object.keys(cards).map(Number).filter(function (id) { return id >= 1 && id <= WRITE_COUNT && id % 1 === 0; })
      .sort(function (a, b) { return a - b; })
      .forEach(function (id) {
        var c = cards[id];
        if (!c || [0, 1, 2, 3].indexOf(c.s) < 0) return;
        var r = CARRY[c.s], n = counts[c.s]++;
        s.cards[id] = { s: c.s, due: addDays(today, r[0] + n % (r[1] - r[0] + 1)), at: DATE_RE.test(c.at) ? c.at : today, miss: 0 };
        if (c.k === 1) s.cards[id].k = 1;
      });
    return s;
  }

  // ---------- 이어서 하기 ----------
  // 시간 제한이 있는 공부(실전 시험)는 시작한 순간부터 시계가 흐른다. 앱을 나가도 멈추지 않는다
  function startSession(state, built, today, now) {
    var next = clone(state);
    next.session = {
      d: today, kind: built.kind, day: built.day, steps: built.steps, i: 0, right: 0,
      newCards: built.steps.filter(function (s) { return s.t === 'card'; }).length,
      starsBefore: totalStars(state)
    };
    next.session.miss = [];
    if (now != null) next.session.started = now;   // 걸린 시간을 부모님 알림에 쓴다
    if (built.minutes) next.session.ends = now + built.minutes * 60000;
    return next;
  }
  // 틀리거나 넘긴 문제와 아이가 쓴 답을 남긴다: 공부 끝에 다시 풀기, 실전 시험 결과의 틀린 문제 목록
  function advanceSession(state, correct, given) {
    if (!state.session) return state;
    var next = clone(state), cur = next.session.steps[next.session.i];
    var retry = cur && cur.t === 'q' && cur.q.mode === 'retry';   // 다시 풀기는 점수와 틀린 문제 목록에 넣지 않는다
    if (!correct && !retry) (next.session.miss = next.session.miss || []).push({ i: next.session.i, a: String(given == null ? '' : given) });
    next.session.i += 1;
    if (correct && !retry) next.session.right += 1;
    return next;
  }
  // 공부 끝에 그날 틀린 문제를 한 번 더(별·점수에는 들어가지 않는다). 실전 시험과 진단에는 없다
  function addRetry(state) {
    var s = state.session;
    if (!s || s.retried || s.kind === 'mock' || s.kind === 'diag' || !s.miss || !s.miss.length) return state;
    var next = clone(state), seen = {};
    s.miss.forEach(function (m) {
      var st = s.steps[m.i];
      if (!st || st.t !== 'q' || st.q.mode === 'retry' || seen[m.i]) return;
      seen[m.i] = true;
      next.session.steps.push({ t: 'q', q: Object.assign({}, st.q, { mode: 'retry' }) });
    });
    next.session.retried = true;
    return next;
  }
  function timeLeft(state, now) {
    var s = state.session;
    return s && s.ends ? Math.max(0, s.ends - now) : null;
  }
  function activeSession(state, today, now) {
    var s = state.session;
    if (s && s.ends && now != null && now >= s.ends) return null;
    return s && s.d === today && s.i < s.steps.length ? s : null;
  }
  // 시간이 다 된 실전 시험은 거기서 채점한다. 못 푼 문제는 틀린 것. 시험 본 날짜로 기록한다
  function closeExpiredMock(state, now) {
    var s = state.session;
    if (!s || s.kind !== 'mock' || !s.ends || now < s.ends) return state;
    var total = s.steps.filter(function (x) { return x.t === 'q'; }).length;
    return endSession(recordMock(state, s.right, total, s.d));
  }
  function endSession(state) {
    if (!state.session) return state;
    var next = clone(state);
    next.session = null;
    return next;
  }
  function learnCard(state, id, today) {
    if (state.cards[id]) return state;
    var next = clone(state);
    next.cards[id] = newCardState(today);
    return next;
  }

  // ---------- 스티커 · 하루 두 번 · 모의고사 ----------
  // 스티커는 { d: 날짜, e: 모양, k: 'main'(그날 첫 번째 공부) | 'review'(두 번째 공부), day: 몇째 날 }
  function mains(state) { return state.stickers.filter(function (s) { return s.k !== 'review'; }); }
  function doneToday(state, today) { return mains(state).some(function (s) { return s.d === today; }); }
  function reviewDoneToday(state, today) {
    return state.stickers.some(function (s) { return s.k === 'review' && s.d === today; });
  }
  function studyDay(state, today) {
    var n = mains(state).length;
    return doneToday(state, today) ? n : Math.min(LAST_DAY, n + 1);
  }
  function allDone(state) { return mains(state).length >= LAST_DAY; }
  function canReview(state, today) {
    return doneToday(state, today) && !reviewDoneToday(state, today) && mains(state).length < LAST_DAY;
  }
  function addSticker(state, emoji, today, kind) {
    kind = kind || 'main';
    var n = mains(state).length;
    if (kind === 'main' && (doneToday(state, today) || n >= LAST_DAY)) return state;
    if (kind === 'review' && !canReview(state, today)) return state;
    var next = clone(state);
    next.stickers.push({ d: today, e: emoji, k: kind, day: kind === 'main' ? n + 1 : n });
    return next;
  }
  // 마지막 문제를 풀면 바로 ⭐ 스티커로 마친 것으로 기록한다. 스티커 고르기는 모양만 바꾼다
  function finishDaily(state, today) { return addSticker(state, '⭐', today, 'main'); }
  function finishReview(state, today) { return addSticker(state, '⭐', today, 'review'); }
  function setTodaySticker(state, emoji, today) {
    var last = state.stickers[state.stickers.length - 1];
    if (!last || last.d !== today) return state;
    var next = clone(state);
    next.stickers[next.stickers.length - 1].e = emoji;
    return next;
  }
  function passMark(total) { return Math.ceil(total * PASS_RATE - 1e-9); }
  function examTitle(score, total) {
    if (score >= Math.ceil(total * 0.9)) return '장원급제';
    return score >= passMark(total) ? '급제' : '';
  }
  // 모의고사를 마치면 그날 첫 번째 공부를 마친 것으로 하고 점수를 남긴다
  function recordMock(state, score, total, today) {
    var next = clone(addSticker(state, '📜', today, 'main'));
    next.mocks = next.mocks.concat([{ d: today, score: score, total: total }]).slice(-20);
    return next;
  }
  function bestMock(state) {
    return state.mocks.reduce(function (best, m) {
      return !best || m.score / m.total > best.score / best.total ? m : best;
    }, null);
  }
  function passedMock(state) {
    return state.mocks.some(function (m) { return m.score >= passMark(m.total); });
  }
  // 부모님이 사라진 스티커를 되돌려 붙일 수 있는 칸: 다음 첫 번째 공부 칸 하나 + 비어 있는 두 번째 공부 칸들
  function restorableSlots(state, today) {
    var n = mains(state).length, slots = [];
    for (var d = 1; d <= n && d < LAST_DAY; d++) {
      if (!state.stickers.some(function (s) { return s.k === 'review' && s.day === d; })) slots.push({ kind: 'review', day: d });
    }
    if (n + 1 < LAST_DAY) slots.push({ kind: 'main', day: n + 1 });
    return slots;
  }
  function restoreSticker(state, kind, day, emoji, date, today) {
    var ok = restorableSlots(state, today).some(function (s) { return s.kind === kind && s.day === day; });
    if (!ok || !DATE_RE.test(date)) return state;
    if (date === today && (kind === 'main' ? doneToday(state, today) : reviewDoneToday(state, today))) return state;
    var next = clone(state);
    next.stickers.push({ d: date, e: emoji, k: kind, day: day });
    return next;
  }
  // 부모님 메뉴 비밀번호: 번호를 그대로 두지 않고 해시(FNV-1a 32비트)로만 비교한다.
  // 호기심에 눌러 보는 아이를 막는 용도라 암호학적 강도는 필요 없다
  function pinHash(pin) {
    var s = 'jangwon-parent:' + String(pin), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function checkPin(pin, hash) { return /^\d{4}$/.test(String(pin)) && pinHash(pin) === hash; }
  // 모의고사에 한 번이라도 합격하면 선물 룰렛을 한 번만 돌린다
  function pickPrize(state, prizes, rng, today) {
    if (state.prize || !passedMock(state)) return state;
    var i = Math.min(prizes.length - 1, Math.floor(rng() * prizes.length));
    var next = clone(state);
    next.prize = { i: i, item: prizes[i], d: today };
    return next;
  }

  // ---------- 기록 ----------
  function emptyState() {
    return { v: 1, name: '', cards: {}, writes: {}, stickers: [], mocks: [], prize: null, sound: true, session: null, notify: '' };
  }
  function isNum(x, lo, hi) { return typeof x === 'number' && x >= lo && x <= hi; }
  function validId(id) { return isNum(id, 1, CHAR_COUNT) && id % 1 === 0; }
  function strs(a) { return Array.isArray(a) && a.length > 0 && a.every(function (x) { return typeof x === 'string'; }); }
  function validStep(st) {
    if (!st) return false;
    if (st.t === 'card') return validId(st.id);
    var q = st.t === 'q' && st.q;
    if (!q || !validId(q.id) || !TYPES[q.type] || !MODES[q.mode]) return false;
    if (typeof q.show !== 'string' || typeof q.answer !== 'string') return false;
    if (/^write-/.test(q.type)) return true;          // 쓰기 문제는 화면에서 획으로 채점한다
    if (q.choices === undefined) return strs(q.answers);
    return Array.isArray(q.choices) && q.choices.length >= 2 && isNum(q.key, 1, 1000) &&
      q.choices.every(function (c) { return c && isNum(c.id, 1, 1000) && typeof c.text === 'string'; });
  }
  function sanitizeSession(x) {
    if (!x || !DATE_RE.test(x.d) || KINDS.indexOf(x.kind) < 0) return null;
    if (!Array.isArray(x.steps) || !x.steps.length || x.steps.length > 300 || !x.steps.every(validStep)) return null;
    var i = Number(x.i), right = Number(x.right);
    if (!(i >= 0 && i <= x.steps.length) || !(right >= 0 && right <= i)) return null;
    var out = {
      d: x.d, kind: x.kind, day: Number(x.day) || 1, steps: x.steps, i: i, right: right,
      newCards: Number(x.newCards) || 0, starsBefore: Number(x.starsBefore) || 0
    };
    out.miss = (Array.isArray(x.miss) ? x.miss : []).filter(function (m) {
      return m && isNum(m.i, 0, x.steps.length - 1) && typeof m.a === 'string';
    }).map(function (m) { return { i: m.i, a: m.a.slice(0, 40) }; });
    if (typeof x.started === 'number' && isFinite(x.started)) out.started = x.started;
    if (typeof x.ends === 'number' && isFinite(x.ends)) out.ends = x.ends;
    if (x.retried === true) out.retried = true;
    return out;
  }
  function sanitize(obj) {
    if (!obj || typeof obj !== 'object' || obj.v !== 1) return null;
    var s = emptyState();
    if (typeof obj.name === 'string') s.name = obj.name.slice(0, 12);
    // 읽기 기록(300자)과 쓰기 기록(150자): 별, 다음 복습 날, 배운 날, 틀린 횟수, 다음 주 확인 날, 다음 날 두 문제
    function cleanMap(src, max) {
      var out = {};
      if (!src || typeof src !== 'object') return out;
      Object.keys(src).forEach(function (k) {
        var id = Number(k), c = src[k];
        if (!(isNum(id, 1, max) && id % 1 === 0) || !c || [0, 1, 2, 3].indexOf(c.s) < 0 || !DATE_RE.test(c.due) || !DATE_RE.test(c.at)) return;
        var o = out[id] = { s: c.s, due: c.due, at: c.at };
        if (c.k === 1) o.k = 1;
        if (isNum(c.miss, 0, 999) && c.miss % 1 === 0) o.miss = c.miss;
        if (DATE_RE.test(c.wk)) o.wk = c.wk;
        if (c.two === true) o.two = true;
      });
      return out;
    }
    s.cards = cleanMap(obj.cards, CHAR_COUNT);
    s.writes = cleanMap(obj.writes, WRITE_COUNT);
    if (Array.isArray(obj.stickers)) {
      var n = 0;
      obj.stickers.forEach(function (x) {
        if (!x || !DATE_RE.test(x.d) || typeof x.e !== 'string' || !x.e.length) return;
        if (x.k === 'review') {
          if (n < 1) return;
          var day = Math.max(1, Math.min(n, Number(x.day) || n));
          s.stickers.push({ d: x.d, e: x.e.slice(0, 8), k: 'review', day: day });
        } else if (n < LAST_DAY) {
          n += 1;
          s.stickers.push({ d: x.d, e: x.e.slice(0, 8), k: 'main', day: n });
        }
      });
    }
    if (Array.isArray(obj.mocks)) {
      obj.mocks.forEach(function (m) {
        if (m && DATE_RE.test(m.d) && isNum(m.total, 1, 100) && isNum(m.score, 0, m.total)) {
          s.mocks.push({ d: m.d, score: m.score, total: m.total });
        }
      });
      s.mocks = s.mocks.slice(-20);
    }
    var p = obj.prize;
    if (p && typeof p.i === 'number' && p.i >= 0 && p.i < 10 && typeof p.item === 'string' && DATE_RE.test(p.d)) {
      s.prize = { i: p.i, item: p.item.slice(0, 30), d: p.d };
    }
    if (typeof obj.sound === 'boolean') s.sound = obj.sound;
    // 부모님 알림 코드(ntfy 토픽)
    if (typeof obj.notify === 'string' && TOPIC_RE.test(obj.notify)) s.notify = obj.notify;
    s.session = sanitizeSession(obj.session);
    return s;
  }
  function toBase64(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function fromBase64(b64) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function encodeBackup(state) { return BACKUP_PREFIX + toBase64(JSON.stringify(state)); }
  function decodeBackup(code) {
    try {
      var c = normalize(code);
      if (c.indexOf(BACKUP_PREFIX) !== 0) return null;
      return sanitize(JSON.parse(fromBase64(c.slice(BACKUP_PREFIX.length))));
    } catch (e) {
      return null;
    }
  }

  var Logic = {
    LAST_DAY: LAST_DAY, REVIEW_CAP: REVIEW_CAP,
    dateKey: dateKey, addDays: addDays, daysUntil: daysUntil,
    normalize: normalize, matchesAny: matchesAny, checkChoice: checkChoice, checkWrite: checkWrite,
    newCardState: newCardState, applyReview: applyReview, learnedIds: learnedIds,
    dueIds: dueIds, totalStars: totalStars, rankOf: rankOf, markKnown: markKnown,
    recordAnswer: recordAnswer, learnCard: learnCard, learnWrite: learnWrite, isRestDay: isRestDay, importFromSeven: importFromSeven,
    addRetry: addRetry,
    startSession: startSession, advanceSession: advanceSession, activeSession: activeSession, endSession: endSession,
    timeLeft: timeLeft, closeExpiredMock: closeExpiredMock,
    doneToday: doneToday, reviewDoneToday: reviewDoneToday, canReview: canReview, allDone: allDone,
    studyDay: studyDay, addSticker: addSticker,
    finishDaily: finishDaily, finishReview: finishReview, setTodaySticker: setTodaySticker,
    passMark: passMark, examTitle: examTitle, recordMock: recordMock, bestMock: bestMock, passedMock: passedMock,
    pickPrize: pickPrize,
    restorableSlots: restorableSlots, restoreSticker: restoreSticker, pinHash: pinHash, checkPin: checkPin,
    emptyState: emptyState, sanitize: sanitize, encodeBackup: encodeBackup, decodeBackup: decodeBackup
  };
  if (typeof module === 'object' && module.exports) module.exports = Logic;
  else root.Logic = Logic;
})(this);
