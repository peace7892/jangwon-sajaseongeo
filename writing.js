/* 장원급제 한자: 한자 쓰기 칸 (브라우저: window.Writing, Node: module.exports — 채점 규칙만 씀)
 * 획 채점은 hanzi-writer 3.7.2(MIT, app/vendor)가 한다: 한 획씩 모양·방향·순서를 맞춰 보고 틀린 획은 지운다.
 * 한 획을 3번 틀리면 그 획을 살짝 보여 주고(힌트), 그 글자는 틀린 것으로 센다. 힌트 없이 끝까지 쓰면 정답.
 * 획 데이터가 없거나 공식과 다른 「스스로 확인」 글자(DATA.WRITE_SELF)는 자유롭게 쓰고, 정답과 겹쳐 본 뒤 아이가 고른다. */
(function (root) {
  'use strict';

  var HINT_AFTER = 3;     // 한 획을 이만큼 틀리면 힌트, 그 글자는 틀림
  var LENIENCY = 1.5;     // 손가락으로 써도 되게 너그럽게 (두 아이 똑같이)
  var GIVE_AFTER = 6;     // 연습에서 한 획을 이만큼 틀리면 그 획은 대신 그어 준다 (막혀서 멈추지 않게)

  // mistakesPerStroke[k] = k번째 획을 틀린 횟수
  function result(per) {
    var mistakes = 0, hinted = false;
    (per || []).forEach(function (n) {
      n = n || 0;
      mistakes += n;
      if (n >= HINT_AFTER) hinted = true;
    });
    return { ok: !hinted, mistakes: mistakes, hinted: hinted };
  }
  // 한자어는 모든 글자를 맞게 써야 정답
  function wordOk(results) {
    return results.length > 0 && results.every(function (r) { return r.ok; });
  }

  // ---------- 화면 ----------
  var GRID = '<svg class="w-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
    '<rect x="0.5" y="0.5" width="99" height="99"/><line x1="50" y1="0" x2="50" y2="100"/><line x1="0" y1="50" x2="100" y2="50"/></svg>';
  var COLORS = { stroke: '#1B2430', outline: '#C9D6D2', drawing: '#13806F', hint: '#E9A20C' };

  function make(tag, cls, text) {
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text != null) x.textContent = text;
    return x;
  }
  // 田자 칸: 화면 폭 − 32px, 최대 520px (가로로 눕힌 아이패드에서도 칸이 화면 안에 들어오게 높이도 본다)
  function newBox(el) {
    var w = el.clientWidth || (root.innerWidth - 32);
    var size = Math.max(220, Math.min(520, Math.floor(w), (root.innerHeight || 900) - 300));
    var box = make('div', 'w-box');
    box.style.width = box.style.height = size + 'px';
    box.innerHTML = GRID;
    el.appendChild(box);
    return { box: box, size: size };
  }
  function writerFor(target, h, size, data, outline) {
    return root.HanziWriter.create(target, h, {
      width: size, height: size, padding: Math.round(size * 0.07),
      showCharacter: false, showOutline: !!outline,
      strokeColor: COLORS.stroke, outlineColor: COLORS.outline, drawingColor: COLORS.drawing, highlightColor: COLORS.hint,
      drawingWidth: Math.max(10, Math.round(size / 24)), strokeAnimationSpeed: 1, delayBetweenStrokes: 300,
      charDataLoader: function (ch, done) { done({ strokes: data.s, medians: data.m }); }
    });
  }

  // 앱이 채점하는 글자
  function mountWriter(el, h, data, opts) {
    var b = newBox(el), target = make('div', 'w-target');
    b.box.appendChild(target);
    var per = [], carried = [], done = false, writer = null;
    function finish(early) {
      if (done) return;
      done = true;
      if (early && writer) try { writer.cancelQuiz(); } catch (e) { /* 이미 끝난 쓰기 */ }
      var merged = per.slice();
      carried.forEach(function (n, k) { merged[k] = Math.max(n || 0, merged[k] || 0); });
      if (opts.onDone) opts.onDone(result(merged));
    }
    function start() {
      target.innerHTML = '';
      per = [];
      writer = writerFor(target, h, b.size, data, opts.outline);
      writer.quiz({
        leniency: LENIENCY,
        showHintAfterMisses: opts.exam ? false : HINT_AFTER,
        markStrokeCorrectAfterMisses: opts.exam ? false : GIVE_AFTER,
        onMistake: function (d) {
          per[d.strokeNum] = d.mistakesOnStroke;
          // 실전 시험에는 힌트가 없다: 한 획을 3번 틀리면 그 글자는 거기서 끝
          if (opts.exam && d.mistakesOnStroke >= HINT_AFTER) finish(true);
        },
        onComplete: function () { finish(false); }
      });
    }
    start();
    return {
      box: b.box,
      // 다시 쓰기: 처음부터 다시 쓰되, 이미 힌트를 본 획은 그대로 센다
      restart: function () {
        if (done) return;
        per.forEach(function (n, k) { carried[k] = Math.max(n || 0, carried[k] || 0); });
        try { writer.cancelQuiz(); } catch (e) { /* 이미 멈춘 쓰기 */ }
        start();
      },
      destroy: function () { done = true; try { writer && writer.cancelQuiz(); } catch (e) { /* 무시 */ } }
    };
  }

  // 스스로 확인하는 글자: 칸에 자유롭게 쓰고 → 정답 보기(겹쳐 보이기) → 맞게 썼어요 / 틀렸어요
  function mountSelf(el, h, opts) {
    var b = newBox(el), size = b.size, ratio = root.devicePixelRatio || 1;
    var cv = make('canvas', 'w-canvas');
    cv.width = cv.height = Math.round(size * ratio);
    cv.style.width = cv.style.height = size + 'px';
    b.box.appendChild(cv);
    var ghost = make('div', 'w-ghost hj', h);
    ghost.lang = 'zh-Hant';
    ghost.style.fontSize = Math.round(size * 0.78) + 'px';
    ghost.hidden = !opts.outline;
    if (opts.outline) ghost.classList.add('trace');
    b.box.appendChild(ghost);
    var g = cv.getContext('2d');
    g.scale(ratio, ratio);
    g.lineCap = g.lineJoin = 'round';
    g.lineWidth = Math.max(8, size / 26);
    g.strokeStyle = g.fillStyle = COLORS.drawing;
    var down = false, last = null, inked = false, revealed = false, done = false;
    function at(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    cv.addEventListener('pointerdown', function (e) {
      if (revealed) return;
      down = true; last = at(e); inked = true;
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* 오래된 브라우저 */ }
      g.beginPath(); g.arc(last[0], last[1], g.lineWidth / 2, 0, Math.PI * 2); g.fill();
      seeBtn.disabled = false;
      e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) {
      if (!down) return;
      var p = at(e);
      g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke();
      last = p;
      e.preventDefault();
    });
    ['pointerup', 'pointercancel'].forEach(function (t) { cv.addEventListener(t, function () { down = false; }); });

    var tools = make('div', 'w-self');
    var clearBtn = make('button', 'w-btn soft', '지우기');
    var seeBtn = make('button', 'w-btn', '다 썼어요 · 정답 보기');
    var note = make('p', 'w-note', '이 글자는 정답과 겹쳐 보고 스스로 확인해요.');
    var yes = make('button', 'w-btn ok', '⭕ 맞게 썼어요');
    var no = make('button', 'w-btn no', '❌ 틀렸어요');
    [clearBtn, seeBtn, yes, no].forEach(function (x) { x.type = 'button'; });
    seeBtn.disabled = true;
    yes.hidden = no.hidden = true;
    clearBtn.addEventListener('click', function () {
      if (revealed) return;
      g.clearRect(0, 0, size, size); inked = false; seeBtn.disabled = true;
    });
    seeBtn.addEventListener('click', function () {
      if (!inked) return;
      revealed = true;
      ghost.hidden = false;
      ghost.classList.remove('trace');
      ghost.classList.add('answer');
      clearBtn.hidden = seeBtn.hidden = true;
      yes.hidden = no.hidden = false;
      note.textContent = '빨간 정답과 내 글자를 비교해 보세요. 획이 빠지거나 더 있지 않나요?';
    });
    function pick(ok) {
      if (done) return;
      done = true;
      yes.disabled = no.disabled = true;
      if (opts.onDone) opts.onDone({ ok: ok, mistakes: 0, hinted: !ok, self: true });
    }
    yes.addEventListener('click', function () { pick(true); });
    no.addEventListener('click', function () { pick(false); });
    tools.appendChild(note);
    [clearBtn, seeBtn, yes, no].forEach(function (x) { tools.appendChild(x); });
    el.appendChild(tools);
    return { box: b.box, restart: function () { clearBtn.click(); }, destroy: function () { done = true; } };
  }

  // 글자 하나를 쓰는 칸을 el 안에 만든다. opts = { outline: 흐린 글자(따라 쓰기), exam: 힌트 없음, self: 스스로 확인, onDone({ ok, mistakes, hinted }) }
  function mount(el, h, opts) {
    opts = opts || {};
    var data = (root.STROKES || {})[h];
    if (opts.self || !data || !root.HanziWriter) return mountSelf(el, h, opts);
    return mountWriter(el, h, data, opts);
  }
  // 필순 보기: 글자들을 차례로 한 획씩 그려 보여 준다
  function animate(el, chars) {
    el.innerHTML = '';
    var list = chars.filter(function (h) { return (root.STROKES || {})[h] && root.HanziWriter; });
    var i = 0;
    function next() {
      if (i >= list.length) return;
      el.innerHTML = '';
      var b = newBox(el), target = make('div', 'w-target');
      b.box.appendChild(target);
      var w = writerFor(target, list[i], b.size, root.STROKES[list[i]], true);
      i++;
      w.animateCharacter({ onComplete: function () { setTimeout(next, 700); } });
    }
    next();
    return list.length > 0;
  }

  var Writing = { HINT_AFTER: HINT_AFTER, LENIENCY: LENIENCY, result: result, wordOk: wordOk, mount: mount, animate: animate };
  if (typeof module === 'object' && module.exports) module.exports = Writing;
  else root.Writing = Writing;
})(this);
