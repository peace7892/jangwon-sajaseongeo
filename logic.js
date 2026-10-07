/* 장원급제 사자성어: 화면과 상관없는 계산 (브라우저: window.Logic, Node: module.exports) */
(function (root) {
  'use strict';

  // 6일 계획: 지금 별 개수에 따라, 맞혔을 때 다음 복습까지의 날 수 (다음 날 → 이틀 뒤 → 이틀 뒤)
  var REVIEW_GAP = [1, 2, 2, 2];
  var REVIEW_CAP = 20;
  var MIN_QUESTIONS = 10;       // 새 카드가 있는 날 최소 문제 수
  var REVIEW_DAY_SIZE = 20;     // 새 카드가 없는 복습 날 문제 수
  var REVIEW_SESSION_SIZE = 15; // 하루 두 번째 공부(복습) 문제 수
  var REVIEW_SESSION_MAX = 20;
  var CARD_COUNT = 43;
  var LAST_DAY = 6;             // 6일째 = 과거 시험
  var TYPES = ['write', 'm2w', 'w2m'];
  var MODES = { review: 1, learn: 1, practice: 1, exam: 1 };
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
  function isCorrectWrite(input, answer) {
    var n = normalize(input);
    return n.length > 0 && n === normalize(answer);
  }

  // ---------- 별과 복습 ----------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function learnedIds(state) { return Object.keys(state.cards).map(Number); }
  function reviewTypeFor(stars) { return stars <= 0 ? 'w2m' : stars === 1 ? 'm2w' : 'write'; }
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

  // ---------- 문제 ----------
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  var lookups = typeof WeakMap === 'function' ? new WeakMap() : null;
  function byId(data) {
    var map = lookups && lookups.get(data);
    if (!map) {
      map = {};
      data.CARDS.forEach(function (c) { map[c.id] = c; });
      if (lookups) lookups.set(data, map);
    }
    return map;
  }
  function pickDistractors(card, data, rng, n) {
    n = n || 3;
    var map = byId(data), seen = {}, out = [];
    seen[card.id] = true;
    function take(c) {
      if (c && !seen[c.id] && out.length < n) { seen[c.id] = true; out.push(c); }
    }
    if (card.cf) take(map[card.cf.id]);
    shuffle(data.CARDS.filter(function (c) { return c.cf && c.cf.id === card.id; }), rng).forEach(take);
    shuffle(data.CARDS.filter(function (c) { return c.g === card.g; }), rng).forEach(take);
    shuffle(data.CARDS, rng).forEach(take);
    return out;
  }
  function makeQuestion(card, type, data, rng, mode) {
    var q = { id: card.id, type: type, mode: mode, prompt: type === 'w2m' ? card.w : card.m, answer: card.w };
    if (type !== 'write') {
      q.choices = shuffle([card].concat(pickDistractors(card, data, rng)), rng).map(function (c) {
        return { id: c.id, text: type === 'w2m' ? c.m : c.w };
      });
    }
    return q;
  }
  function checkChoice(q, id) { return id === q.id; }
  function checkWrite(q, input) { return isCorrectWrite(input, q.answer); }

  // ---------- 세션 ----------
  // 계획상 오늘까지 얻었어야 하는데 아직 못 얻은 카드 (빠진 날이 있으면 따라잡는다)
  function freshIds(state, day, data) {
    var ids = [];
    data.PLAN.slice(0, day).forEach(function (gids) {
      gids.forEach(function (gid) {
        data.GROUPS.filter(function (g) { return g.id === gid; })[0].ids.forEach(function (id) {
          if (!state.cards[id]) ids.push(id);
        });
      });
    });
    return ids;
  }
  function weakestFirst(ids, state, rng) {
    return ids
      .map(function (id) { return { id: id, s: state.cards[id] ? state.cards[id].s : 0, r: rng() }; })
      .sort(function (a, b) { return (a.s - b.s) || (a.r - b.r); })
      .map(function (x) { return x.id; });
  }
  function buildPractice(state, data, n, rng, allCards) {
    var map = byId(data);
    var pool = allCards ? data.CARDS.map(function (c) { return c.id; }) : learnedIds(state);
    return weakestFirst(pool, state, rng).slice(0, n).map(function (id) {
      return { t: 'q', q: makeQuestion(map[id], TYPES[Math.floor(rng() * TYPES.length)], data, rng, 'practice') };
    });
  }
  function buildExam(data, rng, n) {
    var map = byId(data);
    var ids = shuffle(data.CARDS.map(function (c) { return c.id; }), rng).slice(0, n || data.CARDS.length);
    return ids.map(function (id, i) {
      return { t: 'q', q: makeQuestion(map[id], TYPES[i % TYPES.length], data, rng, 'exam') };
    });
  }
  function buildSession(state, today, data, rng) {
    var day = studyDay(state, today);
    if (isExamDay(state, today)) return { kind: 'exam', day: day, steps: buildExam(data, rng) };
    var map = byId(data), steps = [], used = {};
    dueIds(state, today).forEach(function (id) {
      used[id] = true;
      steps.push({ t: 'q', q: makeQuestion(map[id], reviewTypeFor(state.cards[id].s), data, rng, 'review') });
    });

    var fresh = freshIds(state, day, data);
    fresh.forEach(function (id) { used[id] = true; steps.push({ t: 'card', id: id }); });
    fresh.forEach(function (id) { steps.push({ t: 'q', q: makeQuestion(map[id], 'm2w', data, rng, 'learn') }); });
    fresh.forEach(function (id) { steps.push({ t: 'q', q: makeQuestion(map[id], 'write', data, rng, 'learn') }); });

    // 계획에 새 묶음이 없는 날(5일째)은 직접 쓰기 위주로 20문제를 채운다
    var reviewDay = !data.PLAN[day - 1] || data.PLAN[day - 1].length === 0;
    var target = reviewDay ? REVIEW_DAY_SIZE : MIN_QUESTIONS;
    var count = steps.filter(function (s) { return s.t === 'q'; }).length;
    if (count < target) {
      var pool = learnedIds(state).filter(function (id) { return !used[id]; });
      weakestFirst(pool, state, rng).slice(0, target - count).forEach(function (id) {
        var type = reviewDay ? 'write' : rng() < 0.5 ? 'w2m' : 'm2w';
        steps.push({ t: 'q', q: makeQuestion(map[id], type, data, rng, 'practice') });
      });
    }
    return { kind: 'daily', day: day, steps: steps };
  }
  // 하루 두 번째 공부: 오늘 얻은 카드를 직접 쓰기로 먼저, 이어서 복습할 때가 된 카드와 약한 카드로 15문제쯤
  function buildReview(state, today, data, rng) {
    var map = byId(data), steps = [], used = {};
    function add(id, type) {
      used[id] = true;
      steps.push({ t: 'q', q: makeQuestion(map[id], type, data, rng, 'review') });
    }
    var todays = learnedIds(state).filter(function (id) { return state.cards[id].at === today; });
    shuffle(todays, rng).forEach(function (id) { add(id, 'write'); });
    dueIds(state, today).forEach(function (id) { if (!used[id]) add(id, reviewTypeFor(state.cards[id].s)); });
    if (steps.length < REVIEW_SESSION_SIZE) {
      var pool = learnedIds(state).filter(function (id) { return !used[id]; });
      weakestFirst(pool, state, rng).slice(0, REVIEW_SESSION_SIZE - steps.length).forEach(function (id) {
        add(id, state.cards[id].s >= 1 ? 'write' : 'm2w');
      });
    }
    return { kind: 'review', day: studyDay(state, today), steps: steps.slice(0, REVIEW_SESSION_MAX) };
  }
  function recordAnswer(state, q, correct, today) {
    var cs = state.cards[q.id];
    if (!cs) return state;
    // 새 카드를 얻은 날 직접 쓰기로 맞히면 첫 별
    if (q.mode === 'learn') {
      if (!correct || q.type !== 'write' || cs.s > 0) return state;
      var learned = clone(state);
      learned.cards[q.id] = { s: 1, due: cs.due, at: cs.at };
      return learned;
    }
    if (q.mode !== 'review') return state;
    var next = clone(state);
    next.cards[q.id] = applyReview(cs, correct, today);
    return next;
  }

  // ---------- 이어서 하기 ----------
  function startSession(state, built, today) {
    var next = clone(state);
    next.session = {
      d: today, kind: built.kind, day: built.day, steps: built.steps, i: 0, right: 0,
      newCards: built.steps.filter(function (s) { return s.t === 'card'; }).length,
      starsBefore: totalStars(state)
    };
    return next;
  }
  function advanceSession(state, correct) {
    if (!state.session) return state;
    var next = clone(state);
    next.session.i += 1;
    if (correct) next.session.right += 1;
    return next;
  }
  function activeSession(state, today) {
    var s = state.session;
    return s && s.d === today && s.i < s.steps.length ? s : null;
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

  // ---------- 스티커 · 하루 두 번 · 과거 시험 ----------
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
  function isExamDay(state, today) {
    return !doneToday(state, today) && mains(state).length === LAST_DAY - 1;
  }
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
  function examTitle(score, total) { return score >= Math.ceil(total * 0.9) ? '장원급제' : '급제'; }
  function recordExam(state, score, total, today) {
    var next = clone(addSticker(state, '📜', today, 'main'));
    next.exam = { score: score, total: total, d: today };
    return next;
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
  // 과거 시험을 마친 뒤 선물 룰렛을 한 번만 돌린다
  function pickPrize(state, prizes, rng, today) {
    if (state.prize || !state.exam) return state;
    var i = Math.min(prizes.length - 1, Math.floor(rng() * prizes.length));
    var next = clone(state);
    next.prize = { i: i, item: prizes[i], d: today };
    return next;
  }

  // ---------- 기록 ----------
  function emptyState() {
    return { v: 1, name: '', cards: {}, stickers: [], exam: null, prize: null, sound: true, session: null };
  }
  function validId(id) { return typeof id === 'number' && id >= 1 && id <= CARD_COUNT; }
  function validStep(st) {
    if (!st) return false;
    if (st.t === 'card') return validId(st.id);
    var q = st.t === 'q' && st.q;
    if (!q || !validId(q.id) || TYPES.indexOf(q.type) < 0 || !MODES[q.mode]) return false;
    if (typeof q.prompt !== 'string' || typeof q.answer !== 'string') return false;
    if (q.type === 'write') return q.choices === undefined;
    return Array.isArray(q.choices) && q.choices.length >= 2 &&
      q.choices.every(function (c) { return c && validId(c.id) && typeof c.text === 'string'; });
  }
  function sanitizeSession(x) {
    if (!x || !DATE_RE.test(x.d) || ['daily', 'review', 'exam'].indexOf(x.kind) < 0) return null;
    if (!Array.isArray(x.steps) || !x.steps.length || x.steps.length > 200 || !x.steps.every(validStep)) return null;
    var i = Number(x.i), right = Number(x.right);
    if (!(i >= 0 && i <= x.steps.length) || !(right >= 0 && right <= i)) return null;
    return {
      d: x.d, kind: x.kind, day: Number(x.day) || 1, steps: x.steps, i: i, right: right,
      newCards: Number(x.newCards) || 0, starsBefore: Number(x.starsBefore) || 0
    };
  }
  function sanitize(obj) {
    if (!obj || typeof obj !== 'object' || obj.v !== 1) return null;
    var s = emptyState();
    if (typeof obj.name === 'string') s.name = obj.name.slice(0, 12);
    if (obj.cards && typeof obj.cards === 'object') {
      Object.keys(obj.cards).forEach(function (k) {
        var id = Number(k), c = obj.cards[k];
        if (id >= 1 && id <= CARD_COUNT && c && [0, 1, 2, 3].indexOf(c.s) >= 0 && DATE_RE.test(c.due) && DATE_RE.test(c.at)) {
          s.cards[id] = { s: c.s, due: c.due, at: c.at };
        }
      });
    }
    if (Array.isArray(obj.stickers)) {
      var n = 0;   // 예전 기록의 스티커(종류 없음)는 첫 번째 공부 스티커로 본다
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
    var e = obj.exam;
    if (e && typeof e.score === 'number' && typeof e.total === 'number' && DATE_RE.test(e.d)) {
      s.exam = { score: e.score, total: e.total, d: e.d };
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
    LAST_DAY: LAST_DAY,
    dateKey: dateKey, addDays: addDays, daysUntil: daysUntil,
    normalize: normalize, isCorrectWrite: isCorrectWrite,
    reviewTypeFor: reviewTypeFor, newCardState: newCardState, applyReview: applyReview,
    dueIds: dueIds, totalStars: totalStars, rankOf: rankOf,
    pickDistractors: pickDistractors, makeQuestion: makeQuestion, checkChoice: checkChoice, checkWrite: checkWrite,
    buildSession: buildSession, buildReview: buildReview, buildPractice: buildPractice, buildExam: buildExam,
    recordAnswer: recordAnswer, learnCard: learnCard,
    startSession: startSession, advanceSession: advanceSession, activeSession: activeSession, endSession: endSession,
    doneToday: doneToday, reviewDoneToday: reviewDoneToday, canReview: canReview,
    studyDay: studyDay, isExamDay: isExamDay, addSticker: addSticker,
    finishDaily: finishDaily, finishReview: finishReview, setTodaySticker: setTodaySticker,
    examTitle: examTitle, recordExam: recordExam, pickPrize: pickPrize,
    restorableSlots: restorableSlots, restoreSticker: restoreSticker, pinHash: pinHash, checkPin: checkPin,
    emptyState: emptyState, sanitize: sanitize, encodeBackup: encodeBackup, decodeBackup: decodeBackup
  };
  if (typeof module === 'object' && module.exports) module.exports = Logic;
  else root.Logic = Logic;
})(this);
