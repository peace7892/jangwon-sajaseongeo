/* 장원급제 한자 6급: 문제와 하루 공부 만들기 (브라우저: window.Quiz, Node: module.exports) */
(function (root) {
  'use strict';
  var L = typeof module === 'object' && module.exports ? require('./logic.js') : root.Logic;

  var MIN_NEW = 3;              // 새 한자 날 하루 최소 글자 수
  var DIAG_OLD = 30;            // 진단에서 다시 확인하는 7급 글자 수
  var CHUNK = 5;                // 새 글자는 다섯 자씩: 카드 → 고르기 → 쓰기 → 읽기
  var MIN_QUESTIONS = 10;
  var DAY_REVIEW_CAP = 15;      // 새 한자 날 첫 번째 공부의 복습 수
  var DOK_DAY_READS = 20;       // 11~15일째 독음 문제 수
  var REVIEW_SESSION_SIZE = 15; // 두 번째 공부 문제 수
  var REVIEW_SESSION_MAX = 20;
  var TASTE = 5;                // 진단 날 아는 글자가 적으면 미리 맛보는 새 글자 수
  var LIGHT_SIZE = 15;          // 시험 전날 약한 글자 수
  var TASTE_WRITES = 3;         // 1일째 쓰기 맛보기(따라 쓰기) 글자 수
  var WRITE_REVIEW_NEW = 6;     // 새 한자 날 쓰기 복습 글자 수 (새 쓰기 글자 4~5자와 합쳐 10분쯤)
  var WRITE_REVIEW_CAP = 8;     // 그 밖의 날 쓰기 복습 글자 수
  var WORD_WRITES = 8;          // 한자어 쓰기 날의 문제 수 (복습 포함)
  // 7급 실제 시험 70문항 순서: 독음 32 · 훈음 30 · 반의어 2 · 완성형 2 · 뜻풀이 2 · 필순 2 (6급 90문항은 3단계에서)
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
  // 그 글자가 든 한자어 하나: 두 글자 낱말을 먼저. 성으로만 쓰는 글자(李·朴)처럼 한자어가 없으면 undefined
  function wordFor(data, id, rng) {
    var all = wordsWith(data, id);
    var short = all.filter(function (w) { return w.c.length === 2; });
    var pool = short.length ? short : all;
    return pool.length ? pool[Math.floor(rng() * pool.length)] : undefined;
  }
  function recOf(state, id, which) { return (state[which === 'write' ? 'writes' : 'cards'] || {})[id]; }
  function starsOf(state, id, which) { var c = recOf(state, id, which); return c ? c.s : 0; }
  function missOf(state, id, which) { var c = recOf(state, id, which); return c ? c.miss || 0 : 0; }
  // 많이 틀린 글자 → 별이 낮은 글자 → 무작위 순서 (which가 'write'면 쓰기 기록으로)
  function weakestFirst(ids, state, rng, which) {
    return ids
      .map(function (id) { return { id: id, m: missOf(state, id, which), s: starsOf(state, id, which), r: rng() }; })
      .sort(function (a, b) { return (b.m - a.m) || (a.s - b.s) || (a.r - b.r); })
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
    var many = c.answers.length > 1
      ? '\n(' + c.answers.map(function (a) { return '“' + a + '”'; }).join(', ') + ' 중 하나만 써도 되고, 함께 써도 돼요)' : '';
    return { id: c.id, type: 'hun-write', mode: mode, ask: '훈과 음을 쓰세요', show: c.h, big: true,
      help: mode === 'learn' ? '예: 水 → 물 수' : '', answers: c.answers.slice(), answer: c.hun, explain: charExplain(c) + many };
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
  // ---------- 쓰기 문제 (화면에 직접 쓰고 획으로 채점) ----------
  function isSelf(data, h) { return (data.WRITE_SELF || '').indexOf(h) >= 0; }
  // 글자 하나 쓰기: 'trace' 흐린 글자 따라 쓰기(처음 배울 때) · 'hun' 훈음을 보고 쓰기
  function makeWrite(c, kind, mode, data) {
    data = data || root.DATA || (typeof module === 'object' && module.exports ? require('./data.js') : {});
    var q = { id: c.id, type: kind === 'trace' ? 'write-trace' : 'write-hun', track: 'write', mode: mode,
      ask: kind === 'trace' ? '흐린 글자 위에 한 획씩 따라 쓰세요' : '훈과 음에 맞는 한자를 쓰세요',
      show: c.hun, chars: [c.h], answer: c.h, explain: charExplain(c) + '\n모두 ' + c.strokes + '획이에요.' };
    if (isSelf(data, c.h)) q.self = true;
    return q;
  }
  // 한자어 쓰기(시험 형식): 읽는 소리와 뜻을 보고 글자를 차례로 쓴다. id는 기록할 글자
  function makeWriteWord(w, id, data, mode) {
    var chars = w.c.map(function (cid) { return charOf(data, cid).h; });
    var q = { id: id, type: 'write-word', track: 'write', mode: mode, ask: '한자어를 한자로 쓰세요', show: w.r, help: w.m,
      chars: chars, answer: w.w,
      explain: w.w + '(' + w.r + ') — ' + w.m + '\n' + w.c.map(function (cid) { return hunOf(data, cid); }).join(' · ') };
    if (chars.some(function (h) { return isSelf(data, h); })) q.self = true;
    return q;
  }
  function writableWord(w, data) { return w.c.every(function (cid) { return cid <= data.WRITE_MAX_ID; }); }
  // 그 글자가 든, 쓰기 범위 글자로만 된 한자어 하나 (두 글자 낱말을 먼저)
  function writeWordFor(data, id, rng, avoid) {
    var all = wordsWith(data, id).filter(function (w) { return writableWord(w, data) && !(avoid && avoid[w.w]); });
    var short = all.filter(function (w) { return w.c.length === 2; });
    var pool = short.length ? short : all;
    return pool.length ? pool[Math.floor(rng() * pool.length)] : undefined;
  }
  // 쓰기 복습: 어제 틀린 글자는 보고 쓰기 + 한자어 쓰기, 별 0~1은 보고 쓰기, 별 2~3은 한자어 쓰기
  function writeReviewSteps(state, id, data, rng, shown) {
    var cs = state.writes[id], c = charOf(data, id), w = writeWordFor(data, id, rng, shown);
    if (w) shown[w.w] = true;
    if (cs.two) return w ? [makeWrite(c, 'hun', 'review', data), makeWriteWord(w, id, data, 'review')]
      : [makeWrite(c, 'hun', 'review', data)];
    if (cs.s <= 1 || !w) return [makeWrite(c, 'hun', 'review', data)];
    return [makeWriteWord(w, id, data, 'review')];
  }

  // 별이 많을수록 어려운 문제: 고르기 → 쓰기 → 한자어 읽기
  function reviewQuestion(state, id, data, rng, mode) {
    var s = starsOf(state, id), c = charOf(data, id), w = wordFor(data, id, rng);
    if (s <= 0) return makeHunPick(c, data, rng, mode);
    if (s === 1 || !w || (s >= 3 && rng() < 0.5)) return makeHunWrite(c, mode);
    return makeDokWrite(w, id, data, mode);
  }
  // 복습할 글자의 문제: 어제 틀린 글자(two)는 두 문제(훈음 쓰기 + 한자어 읽기), 그 밖에는 별에 맞는 한 문제
  function reviewSteps(state, id, data, rng) {
    var cs = state.cards[id], c = charOf(data, id);
    if (!cs || !cs.two) return [reviewQuestion(state, id, data, rng, 'review')];
    var w = wordFor(data, id, rng);
    return [makeHunWrite(c, 'review'), w ? makeDokWrite(w, id, data, 'review') : makeHunPick(c, data, rng, 'review')];
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
    if (L.isRestDay(today)) return 'rest';      // 일요일은 쉰다
    if (today >= data.MOCK_FROM) {
      if (data.MOCK_DAYS.indexOf(today) >= 0) return 'mock';
      return today >= L.addDays(data.EXAM_DATE, -1) ? 'light' : 'dok';
    }
    var type = planType(L.studyDay(state, today), data);
    return type === 'mock' || type === 'light' ? 'dok' : type;
  }
  // 오늘 새로 배울 글자 수: 모르는 글자를 남은 새 한자 날에 나눠서(최소 3자). 새 한자 날이 지나면 빠진 글자를 따라잡는다
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
      part.forEach(function (id) {
        var w = wordFor(data, id, rng);
        if (w) steps.push(step(makeDokWrite(w, id, data, 'learn')));
      });
    }
    return steps;
  }
  function buildPractice(state, data, n, rng) {
    return weakestFirst(L.learnedIds(state), state, rng).slice(0, n).map(function (id) {
      var r = rng(), c = charOf(data, id), w = wordFor(data, id, rng);
      var q = r < 0.34 ? makeHunPick(c, data, rng, 'practice') : r < 0.67 || !w ? makeHunWrite(c, 'practice')
        : makeDokWrite(w, id, data, 'practice');
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
    if (type === 'rest') return { kind: 'rest', day: day, steps: [] };
    if (L.doneToday(state, today) || L.allDone(state)) {
      return { kind: 'daily', day: day, steps: buildPractice(state, data, MIN_QUESTIONS, rng) };
    }
    // 실력 진단: 이미 배운 7급 글자 30자(약한 것부터)로 몸풀기, 이어서 아직 모르는 글자 모두(보통 6급 150자)
    if (type === 'diag') {
      var old = weakestFirst(L.learnedIds(state).filter(function (id) { return id < data.NEW_FROM_ID; }), state, rng).slice(0, DIAG_OLD);
      return { kind: 'diag', day: day, steps: old.concat(unknownIds(state, data)).map(function (id) {
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
      reviewSteps(state, id, data, rng).forEach(function (q) { steps.push(step(q)); });
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
        if (!w || shown[w.w]) return;
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
      if (used[id] || steps.length >= REVIEW_SESSION_MAX) return;
      reviewSteps(state, id, data, rng).forEach(function (q) { add(id, q); });
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

  // 하루 두 번째 공부: 한자 쓰기 (쓰기 범위 = 7급까지 150자)
  //  1일째: 따라 쓰기 3자로 맛보기 · 새 한자 날(2~37일째): 쓰기 복습 + 새 쓰기 글자(따라 쓰기 → 보고 쓰기)
  //  그 뒤: 쓰기 복습 + 한자어 쓰기(시험 형식)로 8문제 · 일요일과 시험 전날은 없음
  function writeIds(data) { return data.CHARS.filter(function (c) { return c.id <= data.WRITE_MAX_ID; }).map(function (c) { return c.id; }); }
  function newWritesPerDay(state, day, data) {
    var unknown = writeIds(data).filter(function (id) { return !(state.writes || {})[id]; }).length;
    if (planType(day, data) !== 'new') return Math.min(unknown, MIN_NEW);   // 새 한자 날이 지나면 하루 3자씩 따라잡기
    var left = data.PLAN.slice(day - 1).filter(function (t) { return t === 'new'; }).length;
    if (left <= 1) return unknown;
    return Math.min(unknown, Math.max(MIN_NEW, Math.ceil(unknown / left)));
  }
  function buildWriting(state, today, data, rng) {
    var day = L.studyDay(state, today), type = dayType(state, today, data), steps = [], used = {}, shown = {};
    var out = { kind: 'write', day: day, steps: steps };
    if (type === 'rest' || type === 'light') return out;
    function add(q) { steps.push(step(q)); }
    if (type === 'diag') {
      var easy = writeIds(data).filter(function (id) { return !isSelf(data, charOf(data, id).h); });
      shuffle(easy.slice(0, 50), rng).slice(0, TASTE_WRITES).forEach(function (id) { add(makeWrite(charOf(data, id), 'trace', 'practice', data)); });
      return out;
    }
    state = Object.assign({}, state, { writes: state.writes || {} });
    L.dueIds(state, today, type === 'new' ? WRITE_REVIEW_NEW : WRITE_REVIEW_CAP, 'write').forEach(function (id) {
      used[id] = true;
      writeReviewSteps(state, id, data, rng, shown).forEach(add);
    });
    var fresh = writeIds(data).filter(function (id) { return !state.writes[id]; }).slice(0, newWritesPerDay(state, day, data));
    fresh.forEach(function (id) { used[id] = true; add(makeWrite(charOf(data, id), 'trace', 'learn', data)); });
    fresh.forEach(function (id) { add(makeWrite(charOf(data, id), 'hun', 'learn', data)); });
    if (type !== 'new') {
      var pool = weakestFirst(writeIds(data).filter(function (id) { return !used[id] && state.writes[id]; }), state, rng, 'write');
      for (var i = 0; i < pool.length && steps.length < WORD_WRITES; i++) {
        var w = writeWordFor(data, pool[i], rng, shown);
        if (!w) continue;
        shown[w.w] = true;
        add(makeWriteWord(w, pool[i], data, 'practice'));
      }
    }
    return out;
  }

  var Quiz = {
    makeHunPick: makeHunPick, makeHunWrite: makeHunWrite, makeDokWrite: makeDokWrite,
    makeOpp: makeOpp, makeIdiom: makeIdiom, makeMean: makeMean, makeStroke: makeStroke, strokeQuestions: strokeQuestions,
    reviewQuestion: reviewQuestion, reviewSteps: reviewSteps,
    makeWrite: makeWrite, makeWriteWord: makeWriteWord, buildWriting: buildWriting,
    planType: planType, dayType: dayType, newPerDay: newPerDay, wordsWith: wordsWith,
    buildDay: buildDay, buildReview: buildReview, buildMock: buildMock, buildPractice: buildPractice
  };
  if (typeof module === 'object' && module.exports) module.exports = Quiz;
  else root.Quiz = Quiz;
})(this);
