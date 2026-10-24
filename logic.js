/* 장원급제 한자 7급: 화면과 상관없는 계산 — 기록·별·세션·스티커·모의고사·백업 (브라우저: window.Logic, Node: module.exports) */
(function (root) {
  'use strict';

  // 지금 별 개수에 따라, 맞혔을 때 다음 복습까지의 날 수 (다음 날 → 이틀 뒤 → 사흘 뒤 → 나흘마다)
  var REVIEW_GAP = [1, 2, 3, 4];
  var REVIEW_CAP = 20;
  var CHAR_COUNT = 150;
  var LAST_DAY = 21;            // 21일째 = 시험 전날, 가볍게
  var PASS_RATE = 49 / 70;      // 어문회 7급 합격 기준 70문항 중 49문항
  var TYPES = { 'hun-pick': 1, 'hun-write': 1, 'dok-write': 1, opp: 1, idiom: 1, mean: 1, stroke: 1 };
  var MODES = { review: 1, learn: 1, practice: 1, exam: 1, diag: 1 };
  var KINDS = ['diag', 'daily', 'review', 'mock'];
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
  function checkChoice(q, id) { return id === q.key; }
  function checkWrite(q, input) { return matchesAny(input, q.answers); }

  // ---------- 별과 복습 ----------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function learnedIds(state) { return Object.keys(state.cards).map(Number); }
  function newCardState(today) { return { s: 0, due: addDays(today, 1), at: today }; }
  function applyReview(cs, correct, today) {
    if (correct) return { s: Math.min(3, cs.s + 1), due: addDays(today, REVIEW_GAP[cs.s]), at: cs.at };
    return { s: Math.max(0, cs.s - 1), due: addDays(today, 1), at: cs.at };
  }
  function dueIds(state, today, cap) {
    cap = cap == null ? REVIEW_CAP : cap;
    return learnedIds(state)
      .filter(function (id) { return state.cards[id].due <= today; })
      .sort(function (a, b) {
        var A = state.cards[a], B = state.cards[b];
        if (A.due !== B.due) return A.due < B.due ? -1 : 1;
        return (A.s - B.s) || (a - b);
      })
      .slice(0, cap);
  }
  function totalStars(state) {
    return learnedIds(state).reduce(function (sum, id) { return sum + state.cards[id].s; }, 0);
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
    var cs = state.cards[q.id];
    if (q.mode === 'diag') return correct && !cs ? markKnown(state, [q.id], today) : state;
    if (!cs) return state;
    var next;
    // 새 글자를 배운 날 훈음 쓰기로 맞히면 첫 별
    if (q.mode === 'learn') {
      if (!correct || q.type !== 'hun-write' || cs.s > 0) return state;
      next = clone(state);
      next.cards[q.id].s = 1;
      return next;
    }
    // 모의고사에서 틀린 글자는 별 하나 내리고 오늘 두 번째 공부에서 다시
    if (q.mode === 'exam') {
      if (correct) return state;
      next = clone(state);
      next.cards[q.id].s = Math.max(0, cs.s - 1);
      next.cards[q.id].due = today;
      return next;
    }
    if (q.mode !== 'review') return state;
    next = clone(state);
    next.cards[q.id] = Object.assign(applyReview(cs, correct, today), cs.k ? { k: 1 } : {});
    return next;
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
    if (built.minutes) {
      next.session.ends = now + built.minutes * 60000;
      next.session.miss = [];
    }
    return next;
  }
  // 시간 제한이 있으면 틀리거나 넘긴 문제와 아이가 쓴 답을 남겨 결과에서 보여 준다
  function advanceSession(state, correct, given) {
    if (!state.session) return state;
    var next = clone(state);
    if (next.session.miss && !correct) next.session.miss.push({ i: next.session.i, a: String(given == null ? '' : given) });
    next.session.i += 1;
    if (correct) next.session.right += 1;
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
    return { v: 1, name: '', cards: {}, stickers: [], mocks: [], prize: null, sound: true, session: null };
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
    if (typeof x.ends === 'number' && isFinite(x.ends)) {
      out.ends = x.ends;
      out.miss = (Array.isArray(x.miss) ? x.miss : []).filter(function (m) {
        return m && isNum(m.i, 0, x.steps.length - 1) && typeof m.a === 'string';
      }).map(function (m) { return { i: m.i, a: m.a.slice(0, 40) }; });
    }
    return out;
  }
  function sanitize(obj) {
    if (!obj || typeof obj !== 'object' || obj.v !== 1) return null;
    var s = emptyState();
    if (typeof obj.name === 'string') s.name = obj.name.slice(0, 12);
    if (obj.cards && typeof obj.cards === 'object') {
      Object.keys(obj.cards).forEach(function (k) {
        var id = Number(k), c = obj.cards[k];
        if (validId(id) && c && [0, 1, 2, 3].indexOf(c.s) >= 0 && DATE_RE.test(c.due) && DATE_RE.test(c.at)) {
          s.cards[id] = { s: c.s, due: c.due, at: c.at };
          if (c.k === 1) s.cards[id].k = 1;
        }
      });
    }
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
    recordAnswer: recordAnswer, learnCard: learnCard,
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
