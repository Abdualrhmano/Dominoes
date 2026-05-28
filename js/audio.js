// js/audio.js
// WebAudio procedural synthesis manager (no external files).
// Exports default AudioManager class.

export default function AudioManager(){
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  let shuffleInterval = null;

  function now(){ return ctx.currentTime; }

  function resumeIfNeeded(){
    if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
  }

  // CLACK: crisp impact
  function playClack(opts = {}){
    resumeIfNeeded();
    const gainVal = opts.gain ?? 0.12;
    const pitch = opts.pitch ?? 1.0;
    const t = now();
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 120 * pitch;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 180 * pitch;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 800;
    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 6000;
    o1.connect(g); o2.connect(g); g.connect(hpf); hpf.connect(lpf); lpf.connect(master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gainVal, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o1.start(t); o2.start(t); o1.stop(t + 0.22); o2.stop(t + 0.22);

    // noise burst
    const bufferSize = Math.floor(ctx.sampleRate * 0.06);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const out = noiseBuffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++) out[i] = (Math.random()*2-1) * Math.exp(-i/(ctx.sampleRate*0.02));
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer;
    const ng = ctx.createGain(); ng.gain.value = gainVal * 0.6;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3000;
    noise.connect(nf); nf.connect(ng); ng.connect(master);
    noise.start(t); noise.stop(t + 0.12);
  }

  // SLIDE: frictional draw sound
  function playSlide(opts = {}){
    resumeIfNeeded();
    const gainVal = opts.gain ?? 0.08;
    const t = now();
    const len = Math.floor(ctx.sampleRate * 0.9);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<len;i++) data[i] = (Math.random()*2-1) * (1 - i/len) * 0.6;
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200;
    src.connect(bp); bp.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gainVal, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    src.start(t); src.stop(t + 1.0);
  }

  // SHUFFLE ambience: periodic clacks
  function startShuffle(opts = {}){
    resumeIfNeeded();
    const gainVal = opts.gain ?? 0.06;
    if(shuffleInterval) return;
    shuffleInterval = setInterval(()=> playClack({ gain: gainVal, pitch: 0.9 + Math.random()*0.2 }), 140);
  }
  function stopShuffle(){ if(shuffleInterval){ clearInterval(shuffleInterval); shuffleInterval = null; } }

  // FANFARE: celebratory chime
  function playFanfare(opts = {}){
    resumeIfNeeded();
    const gainVal = opts.gain ?? 0.18;
    const t = now() + 0.02;
    const notes = [880, 1100, 1320, 1760];
    notes.forEach((freq, i)=>{
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain(); g.gain.value = 0.0001;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 6000;
      o.frequency.setValueAtTime(freq, t + i*0.08);
      o.connect(f); f.connect(g); g.connect(master);
      g.gain.setValueAtTime(0.0001, t + i*0.08);
      g.gain.exponentialRampToValueAtTime(gainVal * (1 - i*0.12), t + i*0.08 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i*0.08 + 1.2);
      o.start(t + i*0.08); o.stop(t + i*0.08 + 1.2);
    });
    // bell overlay
    const bell = ctx.createOscillator(); bell.type = 'triangle'; bell.frequency.value = 1760;
    const bg = ctx.createGain(); bg.gain.value = 0.0001;
    const bf = ctx.createBiquadFilter(); bf.type = 'highpass'; bf.frequency.value = 800;
    bell.connect(bf); bf.connect(bg); bg.connect(master);
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(gainVal*0.6, t + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    bell.start(t); bell.stop(t + 1.6);
  }

  function playError(opts = {}){ playClack({ gain: opts.gain ?? 0.06, pitch: 0.6 }); }

  return {
    play(name, opts = {}){
      if(name === 'clack') playClack(opts);
      else if(name === 'slide') playSlide(opts);
      else if(name === 'shuffle') startShuffle(opts);
      else if(name === 'fanfare') playFanfare(opts);
      else if(name === 'error') playError(opts);
    },
    stop(name){
      if(name === 'shuffle') stopShuffle();
    },
    setMasterVolume(v){ master.gain.value = Math.max(0, Math.min(1, v)); },
    ctx
  };
}
