import incomingOrderAlertUrl from '../assets/audio/new-order-alert.wav';

const MIN_PLAY_INTERVAL = 1300;
const UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'keydown', 'mousedown'];
const DEFAULT_AUDIO_VOLUME = 0.62;
const MIN_AUDIO_VOLUME = 0.35;
const MAX_AUDIO_VOLUME = 1;
const AUDIO_VOLUME_STEP = 0.05;
const AUDIO_VOLUME_STORAGE_KEY = 'west-order-audio-volume';

let audioElement = null;
let audioContext = null;
let unlocked = false;
let enabled = true;
let pendingPlay = false;
let unlockHandlersBound = false;
let lastPlayAt = 0;
let audioProfileKey = 'global';
let currentVolume = DEFAULT_AUDIO_VOLUME;

function clampVolume(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_AUDIO_VOLUME;
  return Math.min(MAX_AUDIO_VOLUME, Math.max(MIN_AUDIO_VOLUME, num));
}

function volumeStorageKey(profileKey = 'global') {
  const suffix = String(profileKey || 'global');
  return `${AUDIO_VOLUME_STORAGE_KEY}:${suffix}`;
}

function readStoredVolume(profileKey = 'global') {
  if (typeof window === 'undefined') return DEFAULT_AUDIO_VOLUME;
  try {
    const raw = window.localStorage.getItem(volumeStorageKey(profileKey));
    if (raw === null || raw === undefined || raw === '') {
      return DEFAULT_AUDIO_VOLUME;
    }
    return clampVolume(raw);
  } catch {
    return DEFAULT_AUDIO_VOLUME;
  }
}

function writeStoredVolume(profileKey, volume) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(volumeStorageKey(profileKey), String(clampVolume(volume)));
  } catch {
    // best-effort cache
  }
}

function applyCurrentVolumeToAudioElement() {
  const el = ensureAudioElement();
  if (!el) return;
  el.volume = clampVolume(currentVolume);
}

function ensureAudioElement() {
  if (typeof window === 'undefined') return null;
  if (audioElement) return audioElement;
  const el = new Audio(incomingOrderAlertUrl);
  el.preload = 'auto';
  el.volume = clampVolume(currentVolume);
  el.playsInline = true;
  el.setAttribute('playsinline', 'true');
  el.setAttribute('webkit-playsinline', 'true');
  audioElement = el;
  return audioElement;
}

function ensureAudioContext() {
  if (typeof window === 'undefined') return null;
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioContext = new Ctx();
  return audioContext;
}

function playSynthTone() {
  const ctx = ensureAudioContext();
  if (!ctx || ctx.state !== 'running') return false;

  try {
    const normalizedVolume = clampVolume(currentVolume);
    const masterPeak = 0.11 + normalizedVolume * 0.21;
    const noteScale = 0.72 + normalizedVolume * 0.52;
    const now = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(masterPeak, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
    master.connect(ctx.destination);

    const notes = [
      { freq: 783.99, delay: 0, duration: 0.32, gain: 0.13 },
      { freq: 987.77, delay: 0.16, duration: 0.36, gain: 0.15 },
      { freq: 1174.66, delay: 0.42, duration: 0.38, gain: 0.16 },
    ];

    notes.forEach((note) => {
      const startAt = now + note.delay;
      const stopAt = startAt + note.duration;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, startAt);
      osc.frequency.exponentialRampToValueAtTime(note.freq * 0.985, stopAt);

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(Math.min(note.gain * noteScale, 0.26), startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

      osc.connect(gain);
      gain.connect(master);
      osc.start(startAt);
      osc.stop(stopAt + 0.03);
    });
    return true;
  } catch {
    return false;
  }
}

function playAudioFileTone() {
  const el = ensureAudioElement();
  if (!el) return false;

  try {
    el.pause();
    el.currentTime = 0;
    el.volume = clampVolume(currentVolume);
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        unlocked = false;
        pendingPlay = true;
        bindUnlockListeners();
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function warmupAudio() {
  const el = ensureAudioElement();
  const ctx = ensureAudioContext();

  let elementReady = false;
  let contextReady = false;

  if (ctx) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      contextReady = ctx.state === 'running';
    } catch {
      contextReady = false;
    }
  }

  if (el) {
    try {
      el.muted = true;
      el.volume = clampVolume(currentVolume);
      el.currentTime = 0;
      await el.play();
      el.pause();
      el.currentTime = 0;
      el.muted = false;
      elementReady = true;
    } catch {
      el.muted = false;
      elementReady = false;
    }
  }

  unlocked = contextReady || elementReady;
  return unlocked;
}

function clearUnlockListeners() {
  if (!unlockHandlersBound || typeof window === 'undefined') return;
  unlockHandlersBound = false;
  UNLOCK_EVENTS.forEach((eventName) => {
    window.removeEventListener(eventName, unlockAudio, true);
  });
}

async function unlockAudio() {
  const ok = await warmupAudio();
  if (!ok) return;

  clearUnlockListeners();
  if (enabled && pendingPlay) {
    pendingPlay = false;
    playIncomingOrderTone();
  }
}

function bindUnlockListeners() {
  if (unlockHandlersBound || typeof window === 'undefined') return;
  unlockHandlersBound = true;
  UNLOCK_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, unlockAudio, true);
  });
}

function playIncomingOrderTone() {
  if (!enabled) return false;

  const nowMs = Date.now();
  if (nowMs - lastPlayAt < MIN_PLAY_INTERVAL) return false;

  if (unlocked && playAudioFileTone()) {
    lastPlayAt = nowMs;
    return true;
  }

  if (playSynthTone()) {
    lastPlayAt = nowMs;
    return true;
  }

  pendingPlay = true;
  bindUnlockListeners();
  return false;
}

export function setupIncomingOrderAudio(profileKey = '') {
  if (profileKey) {
    audioProfileKey = String(profileKey);
  }
  currentVolume = readStoredVolume(audioProfileKey);
  ensureAudioElement();
  applyCurrentVolumeToAudioElement();
  ensureAudioContext();
  enabled = true;
  bindUnlockListeners();
}

export async function enableIncomingOrderAudio() {
  enabled = true;
  applyCurrentVolumeToAudioElement();
  const ok = await warmupAudio();
  if (!ok) {
    bindUnlockListeners();
  } else {
    clearUnlockListeners();
  }
  return ok;
}

export function disableIncomingOrderAudio() {
  // Keep for backward compatibility; alert audio must stay enabled.
  enabled = true;
  pendingPlay = false;
}

export function isIncomingOrderAudioEnabled() {
  return true;
}

export function getIncomingOrderAudioVolume() {
  return clampVolume(currentVolume);
}

export function getIncomingOrderAudioVolumeRange() {
  return {
    min: MIN_AUDIO_VOLUME,
    max: MAX_AUDIO_VOLUME,
    step: AUDIO_VOLUME_STEP,
    default: DEFAULT_AUDIO_VOLUME,
  };
}

export function setIncomingOrderAudioVolume(volume, profileKey = '') {
  if (profileKey) {
    audioProfileKey = String(profileKey);
  }
  currentVolume = clampVolume(volume);
  writeStoredVolume(audioProfileKey, currentVolume);
  applyCurrentVolumeToAudioElement();
  return currentVolume;
}

export function notifyIncomingOrderByAudio() {
  if (!enabled) return false;
  const played = playIncomingOrderTone();
  if (played) return true;
  pendingPlay = true;
  bindUnlockListeners();
  return false;
}
