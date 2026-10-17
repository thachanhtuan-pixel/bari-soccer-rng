// Âm thanh đơn giản tạo bằng WebAudio (không cần file mp3)
const Sound = (() => {
  let ctx = null;
  let muted = localStorage.getItem('bsr_muted') === '1';

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq = 440, to = null, dur = 0.12, type = 'sine', vol = 0.15, delay = 0 }) {
    if (muted) return;
    const c = ensure(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise({ dur = 0.15, vol = 0.1, delay = 0, hp = 800 }) {
    if (muted) return;
    const c = ensure(); if (!c) return;
    const t = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
  }

  return {
    isMuted: () => muted,
    toggle() { muted = !muted; localStorage.setItem('bsr_muted', muted ? '1' : '0'); if (!muted) this.click(); return muted; },
    unlock() { ensure(); },
    click() { tone({ freq: 620, to: 880, dur: 0.07, type: 'triangle', vol: 0.12 }); },
    // tiếng "tick" khi thẻ chạy; progress 0..1 càng gần cuối càng trầm và chậm
    tick(progress = 0) { tone({ freq: 900 - progress * 450, dur: 0.04, type: 'square', vol: 0.05 }); },
    land(tier = 0) {
      tone({ freq: 220, to: 120, dur: 0.18, type: 'sine', vol: 0.25 });
      if (tier >= 2) { tone({ freq: 880, dur: 0.25, type: 'triangle', vol: 0.12, delay: 0.05 }); tone({ freq: 1320, dur: 0.3, type: 'triangle', vol: 0.1, delay: 0.1 }); }
      if (tier >= 3) { tone({ freq: 1760, dur: 0.4, type: 'sawtooth', vol: 0.07, delay: 0.15 }); }
    },
    whoosh() { noise({ dur: 0.25, vol: 0.12, hp: 600 }); tone({ freq: 300, to: 900, dur: 0.25, type: 'sine', vol: 0.08 }); },
    select() { tone({ freq: 520, dur: 0.08, type: 'triangle', vol: 0.15 }); tone({ freq: 780, dur: 0.12, type: 'triangle', vol: 0.15, delay: 0.07 }); },
    place(kind) {
      noise({ dur: 0.08, vol: 0.18, hp: 200 });
      tone({ freq: 180, to: 90, dur: 0.15, type: 'sine', vol: 0.3 });
      if (kind === 'exact') tone({ freq: 988, dur: 0.15, type: 'triangle', vol: 0.12, delay: 0.08 });
      if (kind === 'bad') tone({ freq: 160, to: 110, dur: 0.25, type: 'sawtooth', vol: 0.1, delay: 0.08 });
    },
    done() { [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.15, delay: i * 0.12 })); },
    record() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'triangle', vol: 0.16, delay: i * 0.11 })); noise({ dur: 0.6, vol: 0.05, delay: 0.7, hp: 3000 }); },
    deny() { tone({ freq: 200, to: 120, dur: 0.15, type: 'square', vol: 0.08 }); },
  };
})();
