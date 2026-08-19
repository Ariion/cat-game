// Sons générés à la volée (Web Audio API), aucun fichier audio à charger.
// Le contexte audio doit démarrer sur un geste utilisateur (politique des
// navigateurs mobiles) : on l'initialise au premier tap sur "Jouer".
let audioCtx = null;

function initAudio(){
  if(audioCtx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if(!Ctx) return;
  audioCtx = new Ctx();
}

function tone(freq, start, duration, type, peakGain){
  if(!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noiseBurst(start, duration, peakGain, filterFreq){
  if(!audioCtx) return;
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++){ data[i] = (Math.random()*2-1) * (1 - i/bufferSize); }
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq, start);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(peakGain, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  src.start(start);
}

const sfx = {
  croquette(){
    if(!audioCtx) return;
    const t = audioCtx.currentTime;
    tone(660, t, 0.12, 'triangle', 0.18);
    tone(880, t+0.06, 0.16, 'triangle', 0.18);
  },
  water(){
    if(!audioCtx) return;
    const t = audioCtx.currentTime;
    tone(220, t, 0.18, 'sawtooth', 0.1);
    noiseBurst(t, 0.22, 0.12, 1200);
  },
  bossAppear(){
    if(!audioCtx) return;
    const t = audioCtx.currentTime;
    tone(90, t, 0.5, 'sawtooth', 0.14);
    tone(70, t+0.1, 0.6, 'sawtooth', 0.1);
  },
  win(){
    if(!audioCtx) return;
    const t = audioCtx.currentTime;
    [523, 659, 784, 1046].forEach((f,i)=> tone(f, t + i*0.1, 0.22, 'triangle', 0.16));
  },
  lose(){
    if(!audioCtx) return;
    const t = audioCtx.currentTime;
    [392, 349, 294, 220].forEach((f,i)=> tone(f, t + i*0.13, 0.28, 'sawtooth', 0.13));
  },
  lane(){
    if(!audioCtx) return;
    tone(440, audioCtx.currentTime, 0.05, 'sine', 0.05);
  }
};

function vibrate(pattern){
  if(navigator.vibrate){ navigator.vibrate(pattern); }
}
