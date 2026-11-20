export class DrivingAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private muted = false;
  private paused = false;
  private reverseBeepTimer = 0;
  private blinkerTickTimer = 0;

  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.35;
      master.connect(ctx.destination);

      // Smooth idling 4-cylinder test sedan engine
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const engGain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.value = 54;
      osc2.type = 'triangle';
      osc2.frequency.value = 108;

      filter.type = 'lowpass';
      filter.frequency.value = 180;
      filter.Q.value = 1.4;

      engGain.gain.value = 0.08;

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(engGain);
      engGain.connect(master);

      osc1.start();
      osc2.start();

      this.ctx = ctx;
      this.masterGain = master;
      this.engineOsc1 = osc1;
      this.engineOsc2 = osc2;
      this.engineFilter = filter;
      this.engineGain = engGain;
    } catch {
      // AudioContext unavailable in headless or restricted environments
    }
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    this.syncMasterGain();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.syncMasterGain();
  }

  private syncMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.muted || this.paused ? 0 : 0.35;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
  }

  public update(
    dt: number,
    speedMs: number,
    gear: 'P' | 'R' | 'D',
    turnSignalActive: boolean,
    isPlaying: boolean
  ): void {
    if (!this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter || !this.engineGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const absSpeed = Math.abs(speedMs);

    if (!isPlaying || this.paused || this.muted) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    const rpmRatio = Math.min(1, absSpeed / 7.0);
    const baseFreq = 52 + rpmRatio * 68;
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 2.01, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(160 + rpmRatio * 340, now, 0.06);
    this.engineGain.gain.setTargetAtTime(0.065 + rpmRatio * 0.075, now, 0.06);

    // Reverse sensor periodic chime when gear === 'R'
    if (gear === 'R') {
      this.reverseBeepTimer += dt;
      if (this.reverseBeepTimer >= 0.95) {
        this.reverseBeepTimer = 0;
        this.playTone(1046, 0.08, 'sine', 0.12);
      }
    } else {
      this.reverseBeepTimer = 0.7;
    }

    // Turn signal relay click-clack
    if (turnSignalActive) {
      this.blinkerTickTimer += dt;
      if (this.blinkerTickTimer >= 0.42) {
        this.blinkerTickTimer = 0;
        this.playTone(1450, 0.022, 'triangle', 0.14);
      }
    } else {
      this.blinkerTickTimer = 0.35;
    }
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delaySec = 0
  ): void {
    if (!this.ctx || !this.masterGain || this.muted || this.paused) return;
    const start = this.ctx.currentTime + delaySec;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  public playGearClick(): void {
    this.playTone(420, 0.045, 'triangle', 0.18, 0);
    this.playTone(620, 0.035, 'sine', 0.12, 0.03);
  }

  public playCurbWarning(): void {
    // Classic Korean test sensor buzzer ("삐—삐—")
    this.playTone(880, 0.16, 'sawtooth', 0.24, 0);
    this.playTone(880, 0.18, 'sawtooth', 0.24, 0.2);
  }

  public playSpeedWarning(): void {
    this.playTone(1180, 0.11, 'square', 0.16, 0);
    this.playTone(960, 0.14, 'square', 0.16, 0.14);
  }

  public playConfirmChime(): void {
    // Pleasant Korean "확인되었습니다!" 3-note chime
    this.playTone(523.25, 0.18, 'sine', 0.28, 0);
    this.playTone(659.25, 0.18, 'sine', 0.28, 0.14);
    this.playTone(783.99, 0.34, 'sine', 0.30, 0.28);
  }

  public playPassFanfare(): void {
    this.playTone(523.25, 0.16, 'triangle', 0.26, 0);
    this.playTone(659.25, 0.16, 'triangle', 0.26, 0.12);
    this.playTone(783.99, 0.18, 'triangle', 0.28, 0.24);
    this.playTone(1046.5, 0.45, 'triangle', 0.32, 0.38);
  }

  public playFailTone(): void {
    this.playTone(392.0, 0.22, 'sawtooth', 0.2, 0);
    this.playTone(311.13, 0.42, 'sawtooth', 0.22, 0.24);
  }

  public dispose(): void {
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      void this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.ctx = null;
    this.masterGain = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
  }
}
