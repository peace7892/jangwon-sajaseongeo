/* 장원급제 사자성어: 효과음 만들기 (브라우저: window.Sound, Node: module.exports)
 * 아이패드에서는 Web Audio가 멈춘 채 시작하거나 iOS 버전에 따라 소리가 안 나는 일이 있어서,
 * 효과음을 WAV 파일로 직접 만들어 일반 오디오(<audio>)로 재생한다. */
(function (root) {
  'use strict';

  var RATE = 22050;
  var PEAK = 0.95;    // 효과음마다 가장 큰 소리를 여기에 맞춘다 (처음엔 너무 작아서 아이패드에서 안 들렸다)

  function wave(type, phase) {
    if (type === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(phase));
    if (type === 'square') return Math.sin(phase) >= 0 ? 1 : -1;
    return Math.sin(phase);
  }

  // notes: [{ f: 주파수, at: 시작(초), dur: 길이(초), type?: 'sine'|'triangle'|'square', vol: 크기 }]
  function renderClip(notes, rate) {
    var end = 0;
    notes.forEach(function (n) { end = Math.max(end, n.at + n.dur); });
    var out = new Float32Array(Math.ceil((end + 0.05) * rate));
    notes.forEach(function (n) {
      var start = Math.round(n.at * rate), len = Math.round(n.dur * rate);
      for (var i = 0; i < len && start + i < out.length; i++) {
        var t = i / rate;
        var env = Math.min(1, t / 0.012) * Math.exp(-7 * t / n.dur);   // 짧게 올라갔다가 부드럽게 줄어든다
        out[start + i] += wave(n.type, 2 * Math.PI * n.f * t) * env * n.vol;
      }
    });
    var peak = 0;
    for (var j = 0; j < out.length; j++) peak = Math.max(peak, Math.abs(out[j]));
    var gain = peak > 0 ? PEAK / peak : 1;
    for (var k = 0; k < out.length; k++) out[k] = Math.max(-1, Math.min(1, out[k] * gain));
    return out;
  }

  function encodeWav(samples, rate) {
    var bytes = new Uint8Array(44 + samples.length * 2), v = new DataView(bytes.buffer);
    function text(o, s) { for (var i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); }
    text(0, 'RIFF');
    v.setUint32(4, 36 + samples.length * 2, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);              // PCM
    v.setUint16(22, 1, true);              // 모노
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    text(36, 'data');
    v.setUint32(40, samples.length * 2, true);
    for (var i = 0; i < samples.length; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
    }
    return bytes;
  }

  function notes(list, type, vol, gap, dur, from) {
    return list.map(function (f, i) { return { f: f, at: (from || 0) + i * gap, dur: dur, type: type, vol: vol }; });
  }
  var THUD = { f: 220, at: 0, dur: 0.14, type: 'triangle', vol: 0.25 };   // 도장 '쾅' (아이패드 스피커가 낼 수 있는 높이)
  var CLIPS = {
    stamp: [THUD, { f: 1046, at: 0.09, dur: 0.25, vol: 0.18 }, { f: 1568, at: 0.19, dur: 0.35, vol: 0.18 }],
    combo: [THUD, { f: 1046, at: 0.09, dur: 0.25, vol: 0.18 }, { f: 1568, at: 0.19, dur: 0.35, vol: 0.18 },
      { f: 2093, at: 0.3, dur: 0.4, vol: 0.12 }],
    gold: [THUD].concat(notes([1046, 1318, 1568, 2093], 'sine', 0.15, 0.09, 0.4, 0.08)),
    wrong: [{ f: 262, at: 0, dur: 0.18, vol: 0.12 }, { f: 220, at: 0.16, dur: 0.28, vol: 0.12 }],
    pop: [{ f: 660, at: 0, dur: 0.08, type: 'square', vol: 0.06 }, { f: 990, at: 0.05, dur: 0.12, vol: 0.12 }],
    flip: notes([784, 1046, 1318], 'triangle', 0.1, 0.06, 0.45),
    fanfare: notes([523, 659, 784, 1046, 1318, 1568], 'triangle', 0.12, 0.07, 0.45),
    rattle: notes([300, 340, 380], 'triangle', 0.1, 0.25, 0.22)
  };

  var Sound = { RATE: RATE, renderClip: renderClip, encodeWav: encodeWav, CLIPS: CLIPS };
  if (typeof module === 'object' && module.exports) module.exports = Sound;
  else root.Sound = Sound;
})(this);
