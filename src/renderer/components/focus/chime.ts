/**
 * The chime focus mode plays when time runs out: two soft sine tones, a fifth apart, made with
 * Web Audio (no sound file to bundle). Does nothing where Web Audio is missing (tests) and never
 * throws.
 */

/** Notes (Hz) and when each starts (s) */
const TONES = [
  { frequency: 659.25, at: 0 }, // E5
  { frequency: 987.77, at: 0.32 } // B5
];
const PEAK_GAIN = 0.16;
const ATTACK_S = 0.02;
const DECAY_S = 1.4;

type AudioContextConstructor = new () => AudioContext;

export function playFocusChime(): void {
  if (typeof window === 'undefined') return;
  const audioWindow = window as Window & {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  const Context = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (typeof Context !== 'function') return;

  try {
    const context = new Context();
    // A context made without a recent click can start suspended
    void context.resume?.().catch(() => {});
    const start = context.currentTime + 0.05;
    for (const tone of TONES) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = tone.frequency;
      const at = start + tone.at;
      // Exponential ramps can't start from 0
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, at + ATTACK_S);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + ATTACK_S + DECAY_S);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + ATTACK_S + DECAY_S + 0.05);
    }
    const lastEnd = TONES[TONES.length - 1].at + ATTACK_S + DECAY_S + 0.3;
    setTimeout(() => {
      void context.close?.().catch(() => {});
    }, lastEnd * 1000);
  } catch {
    // No audio device, or the context was refused
  }
}
