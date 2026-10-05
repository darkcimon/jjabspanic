// sfx.js — 효과음 + 햅틱.
//
// 음원 파일 없이 WebAudio 오실레이터로 즉석 합성한다 (빌드 스텝/에셋 추가 없음,
// 오프라인에서도 동작). 브라우저 자동재생 정책 때문에 AudioContext는 첫 사용자
// 입력(pointerdown) 시점에 생성·resume 한다.
//
// 사용법:
//   import { sfx, isMuted, setMuted } from './sfx.js';
//   sfx('capture');            // 이름은 아래 SOUNDS 참고
//   sfx('capture', { size }); // 일부 효과음은 옵션으로 음높이가 바뀐다

const MUTE_KEY = 'kn_sfx_muted';

let ctx = null;
let master = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* 저장소 차단 환경 무시 */ }

function ensureCtx() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}
// 첫 터치에서 오디오 잠금 해제 (iOS/Android WebView 공통).
window.addEventListener('pointerdown', ensureCtx, { capture: true, passive: true });

// 앱이 백그라운드로 가면 소리를 멈추고, 돌아오면 재개한다.
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else ctx.resume().catch(() => {});
});

function tone({ freq = 440, to = null, type = 'sine', dur = 0.12, vol = 1, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.2, vol = 0.6, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = vol;
  src.buffer = buf; src.connect(g); g.connect(master);
  src.start(t0);
}

const SOUNDS = {
  tap:      () => tone({ freq: 660, type: 'triangle', dur: 0.05, vol: 0.4 }),
  // 점령 — 넓게 먹을수록 음이 높아져 "크게 먹었다"는 손맛을 준다.
  capture:  ({ size = 0 } = {}) => {
    const base = 520 + Math.min(size, 200) * 2.5;
    tone({ freq: base, to: base * 1.5, type: 'triangle', dur: 0.14, vol: 0.7 });
    if (size > 50) tone({ freq: base * 1.5, to: base * 2, type: 'sine', dur: 0.18, vol: 0.5, delay: 0.08 });
  },
  item:     () => { tone({ freq: 880, type: 'square', dur: 0.06, vol: 0.3 }); tone({ freq: 1320, type: 'square', dur: 0.08, vol: 0.3, delay: 0.06 }); },
  hit:      () => { noise({ dur: 0.25, vol: 0.7 }); tone({ freq: 220, to: 70, type: 'sawtooth', dur: 0.3, vol: 0.5 }); },
  shield:   () => tone({ freq: 300, to: 900, type: 'sine', dur: 0.2, vol: 0.5 }),
  clear:    () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.6, delay: i * 0.09 })),
  gameOver: () => [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.28, vol: 0.35, delay: i * 0.14 })),
  reward:   () => [784, 988, 1175, 1568].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.18, vol: 0.5, delay: i * 0.07 })),
};

const HAPTICS = {
  capture: 15, item: 20, hit: [40, 30, 60], clear: [30, 40, 30, 40, 60], gameOver: 200, reward: [20, 30, 20],
};

export function sfx(name, opts) {
  if (muted) return;
  const h = HAPTICS[name];
  if (h && navigator.vibrate) { try { navigator.vibrate(h); } catch { /* 진동 미지원 기기 무시 */ } }
  if (!ensureCtx() || !SOUNDS[name]) return;
  try { SOUNDS[name](opts); } catch { /* 오디오 실패가 게임을 멈추지 않도록 */ }
}

export function isMuted() { return muted; }
export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* 무시 */ }
}
