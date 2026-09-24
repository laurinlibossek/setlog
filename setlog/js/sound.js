// Rest-timer signal via Web Audio. iOS only allows audio after a user gesture,
// so the context is created/resumed on the first tap and reused afterwards.
let ctx = null;

export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  } catch (e) { /* audio unavailable */ }
}

export function beep() {
  try {
    if (!ctx) unlockAudio();
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    if (ctx) {
      const t0 = ctx.currentTime + 0.02;
      [0, 0.22, 0.44].forEach((d, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = i === 2 ? 1320 : 880;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(0.45, t0 + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.17);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t0 + d);
        o.stop(t0 + d + 0.2);
      });
    }
  } catch (e) { /* ignore */ }
  try { if (navigator.vibrate) navigator.vibrate([150, 80, 150]); } catch (e) { /* ignore */ }
}
