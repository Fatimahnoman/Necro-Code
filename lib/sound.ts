/**
 * One-shot ambient effects synthesized with the Web Audio API.
 * No audio assets; every sound is generated on demand and gated by the
 * studio's `3D AUDIO FX` toggle.
 */

let ctx: AudioContext | null = null;
let lastFlutter = -Infinity;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/**
 * Brief eerie wing-flutter swoosh for the exorcism bat swarm.
 * A band-passed noise buffer with a flapping amplitude envelope sweeps from
 * low to high and back while the stereo field pans across the altar.
 */
export function playBatSwarmFlutter(fxEnabled: boolean): void {
  if (!fxEnabled) return;
  const audio = audioContext();
  if (!audio) return;

  const now = audio.currentTime;
  // Avoid stacking swooshes if a run and a stage change fire close together.
  if (now - lastFlutter < 1.6) return;
  lastFlutter = now;
  if (audio.state === "suspended") void audio.resume();

  const duration = 0.85;
  const buffer = audio.createBuffer(
    1,
    Math.ceil(audio.sampleRate * duration),
    audio.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    const p = i / samples.length;
    const flap = 0.55 + 0.45 * Math.sin(p * Math.PI * 14);
    samples[i] = (Math.random() * 2 - 1) * flap;
  }

  const source = audio.createBufferSource();
  source.buffer = buffer;

  const band = audio.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 1.1;
  band.frequency.setValueAtTime(420, now);
  band.frequency.exponentialRampToValueAtTime(1300, now + 0.35);
  band.frequency.exponentialRampToValueAtTime(260, now + duration);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(band).connect(gain);
  if (typeof audio.createStereoPanner === "function") {
    const panner = audio.createStereoPanner();
    panner.pan.setValueAtTime(-0.45, now);
    panner.pan.linearRampToValueAtTime(0.45, now + duration);
    gain.connect(panner).connect(audio.destination);
  } else {
    gain.connect(audio.destination);
  }

  source.start(now);
  source.stop(now + duration + 0.02);
}
