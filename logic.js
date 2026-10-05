/* 장원급제 사자성어: 화면과 상관없는 계산 (브라우저: window.Logic, Node: module.exports) */
(function (root) {
  'use strict';

  var REVIEW_GAP = [3, 7, 7, 7];   // 지금 별 개수에 따라, 맞혔을 때 다음 복습까지의 날 수
  var REVIEW_CAP = 20;
  var MIN_QUESTIONS = 10;
  var EXAM_SIZE = 20;
  var CARD_COUNT = 43;
  var LAST_DAY = 21;
  var CHEST_DAYS = [7, 14];
  var TYPES = ['write', 'm2w', 'w2m'];
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
  function nextGroup(state, data) {
    for (var i = 0; i < data.GROUPS.length; i++) {
      var g = data.GROUPS[i];
      if (g.ids.some(function (id) { return !state.cards[id]; })) return g;
    }
    return null;
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
    var ids = shuffle(data.CARDS.map(function (c) { return c.id; }), rng).slice(0, n || EXAM_SIZE);
    return ids.map(function (id, i) {
      return { t: 'q', q: makeQuestion(map[id], TYPES[i % TYPES.length], data, rng, 'exam') };
    });
  }
  function buildSession(state, today, data, rng) {
    if (isExamDay(state, today)) return { kind: 'exam', group: null, steps: buildExam(data, rng, EXAM_SIZE) };
    var map = byId(data), steps = [], used = {};
    dueIds(state, today).forEach(function (id) {
      used[id] = true;
      steps.push({ t: 'q', q: makeQuestion(map[id], reviewTypeFor(state.cards[id].s), data, rng, 'review') });
    });

    // 하루에 한 묶음만: 오늘 이미 카드를 얻었다면, 그 묶음을 마저 채울 때만 새 카드를 준다
    var group = nextGroup(state, data);
    var learnedToday = learnedIds(state).filter(function (id) { return state.cards[id].at === today; });
    if (group && learnedToday.length && !learnedToday.some(function (id) { return map[id].g === group.id; })) group = null;
    var fresh = group ? group.ids.filter(function (id) { return !state.cards[id]; }) : [];
    fresh.forEach(function (id) { used[id] = true; steps.push({ t: 'card', id: id }); });
    fresh.forEach(function (id) { steps.push({ t: 'q', q: makeQuestion(map[id], 'm2w', data, rng, 'learn') }); });
    fresh.forEach(function (id) { steps.push({ t: 'q', q: makeQuestion(map[id], 'write', data, rng, 'learn') }); });

    var count = steps.filter(function (s) { return s.t === 'q'; }).length;
    if (count < MIN_QUESTIONS) {
      var pool = learnedIds(state).filter(function (id) { return !used[id]; });
      weakestFirst(pool, state, rng).slice(0, MIN_QUESTIONS - count).forEach(function (id) {
        var type = rng() < 0.5 ? 'w2m' : 'm2w';
        steps.push({ t: 'q', q: makeQuestion(map[id], type, data, rng, 'practice') });
      });
    }
    return { kind: 'daily', group: group, steps: steps };
  }
  function recordAnswer(state, q, correct, today) {
    if (q.mode !== 'review' || !state.cards[q.id]) return state;
    var next = clone(state);
    next.cards[q.id] = applyReview(state.cards[q.id], correct, today);
    return next;
  }
  function learnCard(state, id, today) {
    if (state.cards[id]) return state;
    var next = clone(state);
    next.cards[id] = newCardState(today);
    return next;
  }

  // ---------- 스티커 · 보물상자 · 과거 시험 ----------
  function doneToday(state, today) {
    var s = state.stickers;
    return s.length > 0 && s[s.length - 1].d === today;
  }
  function studyDay(state, today) {
    return doneToday(state, today) ? state.stickers.length : Math.min(LAST_DAY, state.stickers.length + 1);
  }
  function isExamDay(state, today) {
    return !doneToday(state, today) && state.stickers.length === LAST_DAY - 1;
  }
  function addSticker(state, emoji, today) {
    if (doneToday(state, today) || state.stickers.length >= LAST_DAY) return state;
    var next = clone(state);
    next.stickers.push({ d: today, e: emoji });
    return next;
  }
  function chestState(state, day) {
    if (state.chests[day]) return 'opened';
    return state.stickers.length >= day ? 'ready' : 'locked';
  }
  function openChest(state, day, today) {
    if (chestState(state, day) !== 'ready') return state;
    var next = clone(state);
    next.chests[day] = today;
    return next;
  }
  function examTitle(score, total) { return score >= Math.ceil(total * 0.9) ? '장원급제' : '급제'; }
  function recordExam(state, score, total, today) {
    var next = clone(addSticker(state, '📜', today));
    next.exam = { score: score, total: total, d: today };
    return next;
  }

  // ---------- 기록 ----------
  function emptyState() {
    return { v: 1, name: '', cards: {}, stickers: [], chests: {}, exam: null, sound: true };
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
      s.stickers = obj.stickers
        .filter(function (x) { return x && DATE_RE.test(x.d) && typeof x.e === 'string' && x.e.length > 0; })
        .slice(0, LAST_DAY)
        .map(function (x) { return { d: x.d, e: x.e.slice(0, 8) }; });
    }
    if (obj.chests && typeof obj.chests === 'object') {
      CHEST_DAYS.forEach(function (d) { if (DATE_RE.test(obj.chests[d])) s.chests[d] = obj.chests[d]; });
    }
    var e = obj.exam;
    if (e && typeof e.score === 'number' && typeof e.total === 'number' && DATE_RE.test(e.d)) {
      s.exam = { score: e.score, total: e.total, d: e.d };
    }
    if (typeof obj.sound === 'boolean') s.sound = obj.sound;
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
    dateKey: dateKey, addDays: addDays,
    normalize: normalize, isCorrectWrite: isCorrectWrite,
    reviewTypeFor: reviewTypeFor, newCardState: newCardState, applyReview: applyReview,
    dueIds: dueIds, totalStars: totalStars, rankOf: rankOf,
    pickDistractors: pickDistractors, makeQuestion: makeQuestion, checkChoice: checkChoice, checkWrite: checkWrite,
    nextGroup: nextGroup, buildSession: buildSession, buildPractice: buildPractice, buildExam: buildExam,
    recordAnswer: recordAnswer, learnCard: learnCard,
    doneToday: doneToday, studyDay: studyDay, isExamDay: isExamDay, addSticker: addSticker,
    chestState: chestState, openChest: openChest, examTitle: examTitle, recordExam: recordExam,
    emptyState: emptyState, sanitize: sanitize, encodeBackup: encodeBackup, decodeBackup: decodeBackup
  };
  if (typeof module === 'object' && module.exports) module.exports = Logic;
  else root.Logic = Logic;
})(this);
