// Springy "boing, boing" sound for the jelly letters, made with the Web Audio API.
// pitch: 0..1, so letters further along the title boing a little higher.
let boingAudio = null;

// A real spring rings with a few slightly out-of-tune overtones, which makes it sound metallic
const SPRING_PARTIALS = [
  { mult: 1, amp: 1 },
  { mult: 2.02, amp: 0.25 },
  { mult: 2.76, amp: 0.12 },
];

function boingOnce(start, freq, loud) {
  const a = boingAudio;
  const len = 0.6;

  // Soft overall: gentle volume and a low-pass filter to take the edge off
  const vol = a.createGain();
  const soften = a.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = freq * 6;
  vol.connect(soften).connect(a.destination);

  vol.gain.setValueAtTime(0.0001, start);
  vol.gain.exponentialRampToValueAtTime(0.12 * loud, start + 0.008);
  vol.gain.setTargetAtTime(0.0001, start + 0.008, 0.12);   // ring out like a real spring

  // The wobble starts fast and slows down as the spring settles
  const wobble = a.createOscillator();
  wobble.frequency.setValueAtTime(18, start);
  wobble.frequency.exponentialRampToValueAtTime(9, start + len);
  wobble.start(start);
  wobble.stop(start + len);

  for (const p of SPRING_PARTIALS) {
    const f = freq * p.mult;
    const osc = a.createOscillator();
    osc.type = "sine";
    // "bo-ING": swoops up fast, then sags a little as it rings
    osc.frequency.setValueAtTime(f * 0.7, start);
    osc.frequency.exponentialRampToValueAtTime(f, start + 0.06);
    osc.frequency.exponentialRampToValueAtTime(f * 0.92, start + len);

    const depth = a.createGain();
    depth.gain.setValueAtTime(f * 0.18, start);
    depth.gain.exponentialRampToValueAtTime(f * 0.01, start + len);
    wobble.connect(depth).connect(osc.frequency);

    const amp = a.createGain();
    amp.gain.value = p.amp / 1.4;
    osc.connect(amp).connect(vol);
    osc.start(start);
    osc.stop(start + len);
  }

  // Tiny "pluck" click at the start, like the spring being flicked
  const click = a.createBufferSource();
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * 0.02), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  click.buffer = buf;
  const band = a.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = freq * 4;
  const clickVol = a.createGain();
  clickVol.gain.value = 0.05 * loud;
  click.connect(band).connect(clickVol).connect(a.destination);
  click.start(start);
}

function boing(pitch = 0.5) {
  try {
    boingAudio = boingAudio || new (window.AudioContext || window.webkitAudioContext)();
    if (boingAudio.state === "suspended") boingAudio.resume();
    const t = boingAudio.currentTime;
    const freq = 180 + pitch * 200;
    boingOnce(t, freq, 1);                 // boing,
    boingOnce(t + 0.34, freq * 1.06, 0.6); // boing — a smaller second bounce
  } catch (e) {}   // no sound support: the letters still bounce
}
