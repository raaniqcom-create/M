'use client';

// In-app alert tone. Web push cannot carry a custom sound — that is a platform
// limitation, not a gap here — so this covers the case the platform does allow:
// the app is open and something the user cares about just changed.
const SRC = '/sounds/alert-1.mp3';
const MUTE_KEY = 'alert-muted';
const MIN_GAP_MS = 15_000;

let audio: HTMLAudioElement | null = null;
let unlocked = false;
let lastPlayed = 0;

export function isMuted(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
}

export function setMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

function element(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(SRC);
    audio.preload = 'auto';
  }
  return audio;
}

/** Browsers refuse audio until the user has interacted with the page. Playing
 *  a muted zero-length pass on the first gesture buys permission for later. */
export function unlockAudio(): void {
  if (unlocked) return;
  unlocked = true;
  const el = element();
  const wasMuted = el.muted;
  el.muted = true;
  el.play()
    .then(() => {
      el.pause();
      el.currentTime = 0;
      el.muted = wasMuted;
    })
    .catch(() => {
      el.muted = wasMuted;
    });
}

export function playAlert(): void {
  if (isMuted()) return;
  // several products can flip at once — one tone is a signal, five is noise
  const now = Date.now();
  if (now - lastPlayed < MIN_GAP_MS) return;
  lastPlayed = now;

  const el = element();
  el.currentTime = 0;
  el.play().catch(() => {
    // autoplay still blocked: silence is the correct fallback, never an error
  });
}
