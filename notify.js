/* 장원급제 한자 7급: 부모님 휴대폰 알림(ntfy) 문구와 보내지 못한 알림 보관함 (브라우저: window.Notify, Node: module.exports)
 * 부모님이 ntfy 앱에서 알림 코드(토픽)를 구독하면, 아이패드에서 공부를 마칠 때마다 알림이 간다.
 * 알림 코드는 앱 파일에 두지 않고 각 아이패드의 기록에만 저장한다(부모님 메뉴에서 넣는다). */
(function (root) {
  'use strict';

  var TOPIC_RE = /^[A-Za-z0-9_-]{12,64}$/;
  var OUTBOX_MAX = 30;
  var LATE_MS = 10 * 60000;       // 이보다 늦게 보내면 실제로 마친 시각을 함께 적는다
  var FAST_SECONDS = 3;           // 문제당 평균이 이보다 짧으면 대충 넘겼을 수 있다고 알린다
  var NTFY_URL = 'https://ntfy.sh/';

  function validTopic(code) { return TOPIC_RE.test(String(code == null ? '' : code)); }
  function title(name) { return '한자 공부 · ' + (name || '이름 없음'); }
  function minutesText(m) {
    if (m == null || !(m >= 0)) return '';
    return m < 1 ? '1분 안 걸림' : Math.round(m) + '분';
  }
  function join(parts) { return parts.filter(Boolean).join(' · '); }

  // ev = { name, kind: 'daily'|'review'|'diag'|'mock', day, right, total, minutes, passed, skipped, timedOut, unanswered }
  function finishMessage(ev) {
    var head, body;
    if (ev.kind === 'mock') {
      head = (ev.timedOut ? '⏰' : '📜') + ' 실전 시험 ' + ev.right + '/' + ev.total + ' ' + (ev.passed ? '합격' : '불합격');
      body = join([minutesText(ev.minutes), ev.skipped ? '넘긴 문제 ' + ev.skipped + '개' : '',
        ev.timedOut && ev.unanswered ? '시간이 끝나서 못 푼 문제 ' + ev.unanswered + '개' : '']);
    } else if (ev.kind === 'diag') {
      head = '✅ 실력 진단 끝';
      body = join(['아는 한자 ' + ev.right + '자 (' + ev.total + '자 중)', minutesText(ev.minutes)]);
    } else {
      head = '✅ ' + ev.day + '일째 ' + (ev.kind === 'review' ? '두 번째' : '첫 번째') + ' 공부 끝';
      body = join([ev.right + '/' + ev.total + ' 맞음', minutesText(ev.minutes)]);
    }
    var lines = [head, body];
    if (ev.minutes != null && ev.total >= 5) {
      var avg = ev.minutes * 60 / ev.total;
      if (avg < FAST_SECONDS) lines.push('⚠️ 문제당 평균 ' + Math.max(1, Math.round(avg)) + '초 — 대충 넘겼을 수 있어요');
    }
    return { title: title(ev.name), message: lines.filter(Boolean).join('\n') };
  }

  var PARENT = {
    sticker: '⚠️ 부모님 메뉴에서 스티커를 붙였어요',
    restore: '⚠️ 부모님 메뉴에서 백업 코드로 기록을 되살렸어요',
    reset: '⚠️ 부모님 메뉴에서 기록을 모두 지웠어요',
    test: '🔔 알림 시험 — 이 아이패드에서 알림이 잘 와요'
  };
  function parentMessage(name, what, detail) {
    return { title: title(name), message: [PARENT[what], detail].filter(Boolean).join('\n') };
  }

  // ---------- 보관함: 보내지 못한 알림을 두었다가 다음에 다시 보낸다 ----------
  function enqueue(box, msg, now) {
    var item = { id: now + '-' + Math.random().toString(36).slice(2, 8), at: now, title: msg.title, message: msg.message };
    return (box || []).concat([item]).slice(-OUTBOX_MAX);
  }
  function remove(box, id) { return (box || []).filter(function (x) { return x.id !== id; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clock(ms) {
    var d = new Date(ms), h = d.getHours();
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + (h < 12 ? '오전 ' : '오후 ') + ((h + 11) % 12 + 1) + ':' + pad(d.getMinutes());
  }
  function payload(topic, item, now) {
    var message = item.message;
    if (now - item.at > LATE_MS) message += '\n(아이패드 시각 ' + clock(item.at) + '에 마친 공부 — 인터넷이 끊겨 늦게 보냈어요)';
    return { topic: topic, title: item.title, message: message };
  }

  var Notify = {
    NTFY_URL: NTFY_URL, validTopic: validTopic, finishMessage: finishMessage, parentMessage: parentMessage,
    enqueue: enqueue, remove: remove, payload: payload
  };
  if (typeof module === 'object' && module.exports) module.exports = Notify;
  else root.Notify = Notify;
})(this);
