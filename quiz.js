/* 장원급제 한자 7급: 문제와 하루 공부 만들기 (브라우저: window.Quiz, Node: module.exports) */
(function (root) {
  'use strict';
  var L = typeof module === 'object' && module.exports ? require('./logic.js') : root.Logic;

  var MIN_NEW = 5;              // 새 한자 날 하루 최소 글자 수
  var CHUNK = 5;                // 새 글자는 다섯 자씩: 카드 → 고르기 → 쓰기 → 읽기
  var MIN_QUESTIONS = 10;
  var DAY_REVIEW_CAP = 15;      // 새 한자 날 첫 번째 공부의 복습 수
  var DOK_DAY_READS = 20;       // 11~15일째 독음 문제 수
  var REVIEW_SESSION_SIZE = 15; // 두 번째 공부 문제 수
  var REVIEW_SESSION_MAX = 20;
  var TASTE = 5;                // 진단 날 아는 글자가 적으면 미리 맛보는 새 글자 수
  var LIGHT_SIZE = 15;          // 시험 전날 약한 글자 수
  // 실제 시험 70문항 순서: 독음 32 · 훈음 30 · 반의어 2 · 완성형 2 · 뜻풀이 2 · 필순 2
  var MOCK = { dok: 32, hun: 30, opp: 2, idiom: 2, mean: 2, stroke: 2 };
  var ORDINALS = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

  // ---------- 도움 ----------
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function charOf(data, id) { return data.CHARS[id - 1]; }
  function hunOf(data, id) { var c = charOf(data, id); return c.h + ' ' + c.hun; }
  function wordsWith(data, id) { return data.WORDS.filter(function (w) { return w.c.indexOf(id) >= 0; }); }
  // 그 글자가 든 한자어 하나: 두 글자 낱말을 먼저
  function wordFor(data, id, rng) {
    var all = wordsWith(data, id);
    var short = all.filter(function (w) { return w.c.length === 2; });
    var pool = short.length ? short : all;
    return pool[Math.floor(rng() * pool.length)];
  }
  function starsOf(state, id) { return state.cards[id] ? state.cards[id].s : 0; }
  function weakestFirst(ids, state, rng) {
    return ids
      .map(function (id) { return { id: id, s: starsOf(state, id), r: rng() }; })
      .sort(function (a, b) { return (a.s - b.s) || (a.r - b.r); })
      .map(function (x) { return x.id; });
  }
  function unknownIds(state, data) {
    return data.CHARS.map(function (c) { return c.id; }).filter(function (id) { return !state.cards[id]; });
  }
  function charExplain(c) { return c.h + ' = ' + c.hun + (c.tip ? '\n' + c.tip : ''); }
  function step(q) { return { t: 'q', q: q }; }

  // ---------- 문제 ----------
  function makeHunPick(c, data, rng, mode) {
    var seen = {}, texts = {}, picks = [c];
    seen[c.id] = true; texts[c.hun] = true;
    function take(x) {
      if (picks.length < 4 && !seen[x.id] && !texts[x.hun]) { seen[x.id] = true; texts[x.hun] = true; picks.push(x); }
    }
    shuffle(data.CHARS.filter(function (x) { return x.g === c.g; }), rng).forEach(take);
    shuffle(data.CHARS, rng).forEach(take);
    var q = { id: c.id, type: 'hun-pick', mode: mode, ask: '훈(뜻)과 음(소리)을 고르세요', show: c.h, big: true,
      key: c.id, answer: c.hun, explain: charExplain(c),
      choices: shuffle(picks, rng).map(function (x) { return { id: x.id, text: x.hun }; }) };
    if (mode === 'diag') q.skip = true;
    return q;
  }
  function makeHunWrite(c, mode) {
    return { id: c.id, type: 'hun-write', mode: mode, ask: '훈과 음을 쓰세요', show: c.h, big: true,
      help: mode === 'learn' ? '예: 水 → 물 수' : '', answers: c.answers.slice(), answer: c.hun, explain: charExplain(c) };
  }
  function makeDokWrite(w, id, data, mode) {
    var parts = w.c.map(function (cid) { return hunOf(data, cid); }).join(' · ');
    return { id: id, type: 'dok-write', mode: mode, ask: '한자어를 읽는 소리를 쓰세요', show: w.w, big: true,
      help: mode === 'learn' ? parts : '', answers: [w.r], answer: w.r,
      explain: w.w + '(' + w.r + ') — ' + w.m + '\n' + parts };
  }
  function partnersOf(data, id) {
    return data.PAIRS.filter(function (p) { return p.indexOf(id) >= 0; })
      .map(function (p) { return p[0] === id ? p[1] : p[0]; });
  }
  function makeOpp(pair, side, data, rng, mode) {
    var from = pair[side], to = pair[1 - side], avoid = partnersOf(data, from).concat([from]);
    var pool = [];
    data.PAIRS.forEach(function (p) { p.forEach(function (id) { if (avoid.indexOf(id) < 0 && pool.indexOf(id) < 0) pool.push(id); }); });
    var picks = [to].concat(shuffle(pool, rng).slice(0, 3));
    return { id: from, type: 'opp', mode: mode, ask: '뜻이 반대(상대)되는 한자를 고르세요', show: charOf(data, from).h, big: true,
      key: to, answer: charOf(data, to).h, explain: hunOf(data, from) + ' ↔ ' + hunOf(data, to),
      choices: shuffle(picks, rng).map(function (id) { return { id: id, text: charOf(data, id).h }; }) };
  }
  function makeIdiom(it, pos, data, rng, mode) {
    var hs = it.w.split(''), missing = hs[pos];
    var miss = data.CHARS.filter(function (c) { return c.h === missing; })[0];
    var others = data.CHARS.filter(function (c) { return it.w.indexOf(c.h) < 0; });
    var picks = [miss].concat(shuffle(others, rng).slice(0, 3));
    var shown = hs.slice(); shown[pos] = '□';
    return { id: miss.id, type: 'idiom', mode: mode, ask: '□에 들어갈 한자를 고르세요', show: shown.join(''), big: true,
      help: it.m, key: miss.id, answer: miss.h,
      explain: it.w + '(' + it.r + ') — ' + it.m + '\n' + hunOf(data, miss.id),
      choices: shuffle(picks, rng).map(function (c) { return { id: c.id, text: c.h }; }) };
  }
  function makeMean(w, data, rng, mode) {
    var seen = {}, means = {}, picks = [w];
    seen[w.id] = true; means[w.m] = true;
    function take(x) {
      if (picks.length < 4 && !seen[x.id] && !means[x.m]) { seen[x.id] = true; means[x.m] = true; picks.push(x); }
    }
    // 같은 글자가 든 낱말을 먼저 보기로 (헷갈리기 쉬운 것)
    shuffle(data.WORDS.filter(function (x) { return x.c.some(function (id) { return w.c.indexOf(id) >= 0; }); }), rng).forEach(take);
    shuffle(data.WORDS, rng).forEach(take);
    return { id: w.c[0], type: 'mean', mode: mode, ask: '뜻에 알맞은 한자어를 고르세요', show: w.m, big: false,
      key: w.id, answer: w.w, explain: w.w + '(' + w.r + ') — ' + w.m,
      choices: shuffle(picks, rng).map(function (x) { return { id: x.id, text: x.w }; }) };
  }
  // 필순: 진하게 표시한 n번째 획이 몇 번째로 쓰는 획인지 고른다 (보기는 획 수만큼, 열 번째까지)
  function makeStroke(c, n, mode) {
    var choices = [];
    for (var i = 1; i <= Math.min(10, c.strokes); i++) choices.push({ id: i, text: ORDINALS[i - 1] + ' 번째' });
    return { id: c.id, type: 'stroke', mode: mode, ask: '진하게 표시한 획은 몇 번째로 쓰나요?', show: c.h, big: true, n: n,
      key: n, answer: ORDINALS[n - 1] + ' 번째', explain: c.h + '(' + c.hun + ')의 진한 획은 ' + ORDINALS[n - 1] + ' 번째로 써요. 모두 ' + c.strokes + '획이에요.' +
        (c.tip && c.tip.indexOf('필순') >= 0 ? '\n' + c.tip : ''), choices: choices };
  }
  function strokeQuestions(n, data, rng, mode) {
    var hs = shuffle(data.STROKE_ORDER.split(''), rng).slice(0, n);
    return hs.map(function (h) {
      var c = data.CHARS.filter(function (x) { return x.h === h; })[0];
      return makeStroke(c, 1 + Math.floor(rng() * Math.min(10, c.strokes)), mode);
    });
  }
  // 별이 많을수록 어려운 문제: 고르기 → 쓰기 → 한자어 읽기
  function reviewQuestion(state, id, data, rng, mode) {
    var s = starsOf(state, id), c = charOf(data, id);
    if (s <= 0) return makeHunPick(c, data, rng, mode);
    if (s === 1 || (s >= 3 && rng() < 0.5)) return makeHunWrite(c, mode);
    return makeDokWrite(wordFor(data, id, rng), id, data, mode);
  }
  function oppQuestions(n, data, rng, mode) {
    return shuffle(data.PAIRS, rng).slice(0, n).map(function (p) { return makeOpp(p, rng() < 0.5 ? 0 : 1, data, rng, mode); });
  }
  function idiomQuestions(n, data, rng, mode) {
    return shuffle(data.IDIOMS, rng).slice(0, n).map(function (it) { return makeIdiom(it, Math.floor(rng() * 4), data, rng, mode); });
  }
  function meanQuestions(n, data, rng, mode) {
    return shuffle(data.WORDS, rng).slice(0, n).map(function (w) { return makeMean(w, data, rng, mode); });
  }

  // ---------- 하루 공부 ----------
  function planType(day, data) { return data.PLAN[Math.max(0, Math.min(data.PLAN.length, day) - 1)]; }
  // 오늘 할 공부: MOCK_FROM부터는 날짜로(실전 시험 날 · 그 사이 보강 · 시험 전날 가볍게),
  // 그 전에는 공부한 날 수로 계획을 따르되 실전·가볍게는 아직 하지 않고 유형 공부를 한다
  function dayType(state, today, data) {
    if (today >= data.MOCK_FROM) {
      if (data.MOCK_DAYS.indexOf(today) >= 0) return 'mock';
      return today >= L.addDays(data.EXAM_DATE, -1) ? 'light' : 'dok';
    }
    var type = planType(L.studyDay(state, today), data);
    return type === 'mock' || type === 'light' ? 'dok' : type;
  }
  // 오늘 새로 배울 글자 수: 모르는 글자를 남은 새 한자 날에 나눠서(최소 5자). 새 한자 날이 지나면 빠진 글자를 따라잡는다
  function newPerDay(state, day, data) {
    var unknown = unknownIds(state, data).length;
    var left = data.PLAN.slice(day - 1).filter(function (t) { return t === 'new'; }).length;
    if (planType(day, data) !== 'new') return day > data.PLAN.lastIndexOf('new') + 1 ? Math.min(unknown, 20) : 0;
    if (left <= 1) return unknown;
    return Math.min(unknown, Math.max(MIN_NEW, Math.ceil(unknown / left)));
  }
  function learnSteps(ids, data, rng) {
    var steps = [];
    for (var i = 0; i < ids.length; i += CHUNK) {
      var part = ids.slice(i, i + CHUNK);
      part.forEach(function (id) { steps.push({ t: 'card', id: id }); });
      part.forEach(function (id) { steps.push(step(makeHunPick(charOf(data, id), data, rng, 'learn'))); });
      part.forEach(function (id) { steps.push(step(makeHunWrite(charOf(data, id), 'learn'))); });
      part.forEach(function (id) { steps.push(step(makeDokWrite(wordFor(data, id, rng), id, data, 'learn'))); });
    }
    return steps;
  }
  function buildPractice(state, data, n, rng) {
    return weakestFirst(L.learnedIds(state), state, rng).slice(0, n).map(function (id) {
      var r = rng(), c = charOf(data, id);
      var q = r < 0.34 ? makeHunPick(c, data, rng, 'practice') : r < 0.67 ? makeHunWrite(c, 'practice')
        : makeDokWrite(wordFor(data, id, rng), id, data, 'practice');
      return step(q);
    });
  }
  function buildMock(state, data, rng) {
    var steps = [];
    shuffle(data.WORDS, rng).slice(0, MOCK.dok).forEach(function (w) {
      var weakest = w.c.slice().sort(function (a, b) { return starsOf(state, a) - starsOf(state, b); })[0];
      steps.push(step(makeDokWrite(w, weakest, data, 'exam')));
    });
    shuffle(data.CHARS, rng).slice(0, MOCK.hun).forEach(function (c) { steps.push(step(makeHunWrite(c, 'exam'))); });
    oppQuestions(MOCK.opp, data, rng, 'exam').concat(idiomQuestions(MOCK.idiom, data, rng, 'exam'),
      meanQuestions(MOCK.mean, data, rng, 'exam'), strokeQuestions(MOCK.stroke, data, rng, 'exam')).forEach(function (q) { steps.push(step(q)); });
    return steps;
  }
  function buildDay(state, today, data, rng) {
    var day = L.studyDay(state, today), type = dayType(state, today, data);
    if (L.doneToday(state, today) || L.allDone(state)) {
      return { kind: 'daily', day: day, steps: buildPractice(state, data, MIN_QUESTIONS, rng) };
    }
    if (type === 'diag') {
      return { kind: 'diag', day: day, steps: unknownIds(state, data).map(function (id) {
        return step(makeHunPick(charOf(data, id), data, rng, 'diag'));
      }) };
    }
    if (type === 'mock') return { kind: 'mock', day: day, minutes: data.EXAM_MINUTES, steps: buildMock(state, data, rng) };

    var steps = [], used = {};
    if (type === 'light') {
      weakestFirst(L.learnedIds(state), state, rng).slice(0, LIGHT_SIZE).forEach(function (id) {
        steps.push(step(reviewQuestion(state, id, data, rng, 'review')));
      });
      strokeQuestions(2, data, rng, 'practice').forEach(function (q) { steps.push(step(q)); });
      return { kind: 'daily', day: day, steps: steps };
    }
    L.dueIds(state, today, type === 'new' ? DAY_REVIEW_CAP : L.REVIEW_CAP).forEach(function (id) {
      used[id] = true;
      steps.push(step(reviewQuestion(state, id, data, rng, 'review')));
    });
    var fresh = unknownIds(state, data).slice(0, newPerDay(state, day, data));
    steps = steps.concat(learnSteps(fresh, data, rng));

    if (type === 'dok') {
      var reads = steps.filter(function (s) { return s.t === 'q' && s.q.type === 'dok-write'; }).length;
      var shown = {};
      steps.forEach(function (s) { if (s.t === 'q') shown[s.q.show] = true; });
      weakestFirst(L.learnedIds(state), state, rng).forEach(function (id) {
        if (reads >= DOK_DAY_READS) return;
        var w = wordFor(data, id, rng);
        if (shown[w.w]) return;
        shown[w.w] = true; reads++;
        steps.push(step(makeDokWrite(w, id, data, 'practice')));
      });
      oppQuestions(2, data, rng, 'practice').concat(idiomQuestions(2, data, rng, 'practice'),
        meanQuestions(2, data, rng, 'practice'), strokeQuestions(2, data, rng, 'practice')).forEach(function (q) { steps.push(step(q)); });
    }
    var count = steps.filter(function (s) { return s.t === 'q'; }).length;
    if (count < MIN_QUESTIONS) {
      var pool = L.learnedIds(state).filter(function (id) { return !used[id] && fresh.indexOf(id) < 0; });
      steps = steps.concat(buildPractice({ cards: pick(state.cards, pool) }, data, MIN_QUESTIONS - count, rng));
    }
    return { kind: 'daily', day: day, steps: steps };
  }
  function pick(cards, ids) {
    var out = {};
    ids.forEach(function (id) { out[id] = cards[id]; });
    return out;
  }
  // 하루 두 번째 공부: 오늘 배운(진단 날에는 안다고 한) 글자를 쓰기로, 이어서 복습할 때가 된 글자와 약한 글자
  function buildReview(state, today, data, rng) {
    var day = L.studyDay(state, today), steps = [], used = {};
    function add(id, q) { used[id] = true; steps.push(step(q)); }
    var todays = L.learnedIds(state).filter(function (id) { return state.cards[id].at === today; });
    shuffle(todays, rng).slice(0, REVIEW_SESSION_SIZE).forEach(function (id) { add(id, makeHunWrite(charOf(data, id), 'review')); });
    L.dueIds(state, today, L.REVIEW_CAP + REVIEW_SESSION_MAX).forEach(function (id) {
      if (!used[id] && steps.length < REVIEW_SESSION_MAX) add(id, reviewQuestion(state, id, data, rng, 'review'));
    });
    if (steps.length < REVIEW_SESSION_SIZE) {
      var pool = L.learnedIds(state).filter(function (id) { return !used[id]; });
      weakestFirst(pool, state, rng).slice(0, REVIEW_SESSION_SIZE - steps.length).forEach(function (id) {
        add(id, reviewQuestion(state, id, data, rng, 'review'));
      });
    }
    if (planType(day, data) === 'diag' && steps.length < REVIEW_SESSION_SIZE) {
      steps = steps.concat(learnSteps(unknownIds(state, data).slice(0, TASTE), data, rng).filter(function (s) {
        return s.t === 'card' || s.q.type !== 'dok-write';
      }));
    }
    return { kind: 'review', day: day, steps: steps };
  }

  var Quiz = {
    makeHunPick: makeHunPick, makeHunWrite: makeHunWrite, makeDokWrite: makeDokWrite,
    makeOpp: makeOpp, makeIdiom: makeIdiom, makeMean: makeMean, makeStroke: makeStroke, strokeQuestions: strokeQuestions,
    reviewQuestion: reviewQuestion,
    planType: planType, dayType: dayType, newPerDay: newPerDay, wordsWith: wordsWith,
    buildDay: buildDay, buildReview: buildReview, buildMock: buildMock, buildPractice: buildPractice
  };
  if (typeof module === 'object' && module.exports) module.exports = Quiz;
  else root.Quiz = Quiz;
})(this);
