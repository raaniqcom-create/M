'use client';

// In-app alert tone. Web push cannot carry a custom sound — that is a platform
// limitation, not a gap here — so this covers the case the platform does allow:
// the app is open and something the user cares about just changed.
const MUTE_KEY = 'alert-muted';
const TONE_KEY = 'alert-tone';
const MIN_GAP_MS = 15_000;

export const TONES = ['1', '2', '3'] as const;
export type Tone = (typeof TONES)[number];

/** Tone 2 is the default: it carries better on a phone speaker in a car,
 *  which is where this is heard. Tone 1 is sharper, tone 3 deliberately
 *  softer — a user asked for one that does not startle.
 *
 *  Validated against TONES rather than compared against a single id. The old
 *  form was `v === '1' ? '1' : '2'`, which silently answered "2" for every
 *  value it did not recognise — so the moment a third tone existed, choosing
 *  it appeared to work and then reverted on the next read, with nothing
 *  anywhere reporting a problem. */
export function getTone(): Tone {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(TONE_KEY) : null;
  return (TONES as readonly string[]).includes(v ?? '') ? (v as Tone) : '2';
}

/** Swapping the tone drops the cached element so the next play picks up the
 *  new file instead of the one loaded at startup. */
export function setTone(tone: Tone): void {
  localStorage.setItem(TONE_KEY, tone);
  audio = null;
}

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
    audio = new Audio(`/sounds/alert-${getTone()}.mp3`);
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

/** Plays the tone regardless of mute or the rate limit — for the settings
 *  screen, where the whole point of the tap is to hear it. */
export function previewTone(tone: Tone): void {
  new Audio(`/sounds/alert-${tone}.mp3`).play().catch(() => {});
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
