// Springy "boing boing" sound for the jelly letters, made with the Web Audio API.
// pitch: 0..1, so letters further along the title boing a little higher.
let boingAudio = null;

function boingOnce(start, freq) {
  const a = boingAudio;
  const osc = a.createOscillator();
  const vol = a.createGain();
  const wobble = a.createOscillator();   // wiggles the pitch like a spring
  const depth = a.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq * 0.6, start);
  osc.frequency.exponentialRampToValueAtTime(freq, start + 0.08);

  wobble.frequency.value = 14;
  depth.gain.setValueAtTime(freq * 0.35, start);
  depth.gain.exponentialRampToValueAtTime(1, start + 0.45);
  wobble.connect(depth).connect(osc.frequency);

  vol.gain.setValueAtTime(0.0001, start);
  vol.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
  vol.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
  osc.connect(vol).connect(a.destination);

  osc.start(start);
  wobble.start(start);
  osc.stop(start + 0.5);
  wobble.stop(start + 0.5);
}

function boing(pitch = 0.5) {
  try {
    boingAudio = boingAudio || new (window.AudioContext || window.webkitAudioContext)();
    if (boingAudio.state === "suspended") boingAudio.resume();
    const t = boingAudio.currentTime;
    const freq = 200 + pitch * 250;
    boingOnce(t, freq);               // boing
    boingOnce(t + 0.22, freq * 1.25); // boing!
  } catch (e) {}   // no sound support: the letters still bounce
}
