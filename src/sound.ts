class SoundFX {
  private ctx: AudioContext | null = null;
  private vibrationEnabled = true;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setVibrationEnabled(enabled: boolean): void {
    this.vibrationEnabled = enabled;
  }

  public isVibrationEnabled(): boolean {
    return this.vibrationEnabled;
  }

  public vibrate(
    strongMagnitude: number,
    weakMagnitude: number,
    durationMs: number,
    gp?: Gamepad | null
  ): void {
    if (!this.vibrationEnabled || typeof navigator === "undefined") return;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const target: (Gamepad & {
      vibrationActuator?: {
        playEffect?: (
          type: "dual-rumble",
          params: {
            startDelay: number;
            duration: number;
            weakMagnitude: number;
            strongMagnitude: number;
          }
        ) => Promise<unknown>;
      };
      hapticActuators?: Array<{
        pulse?: (value: number, duration: number) => Promise<unknown>;
      }>;
    }) | null =
      (gp && gp.connected ? gp : null) ||
      (Array.from(pads).find((p): p is Gamepad => Boolean(p && p.connected)) as Gamepad | null);

    if (!target) return;

    const strong = Math.max(0, Math.min(1, strongMagnitude));
    const weak = Math.max(0, Math.min(1, weakMagnitude));
    const duration = Math.max(10, Math.min(5000, durationMs));

    if (target.vibrationActuator && typeof target.vibrationActuator.playEffect === "function") {
      target.vibrationActuator
        .playEffect("dual-rumble", {
          startDelay: 0,
          duration,
          weakMagnitude: weak,
          strongMagnitude: strong,
        })
        .catch(() => {});
      return;
    }

    if (Array.isArray(target.hapticActuators) && typeof target.hapticActuators[0]?.pulse === "function") {
      const intensity = Math.max(strong, weak);
      target.hapticActuators[0].pulse(intensity, duration).catch(() => {});
    }
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType = "sine",
    gainPeak = 0.12
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public playCollect(combo = 1): void {
    const pitchBoost = Math.min(12, combo - 1) * 35;
    this.playTone(520 + pitchBoost, 880 + pitchBoost, 0.11, "triangle", 0.12);
  }

  public playPowerUp(): void {
    this.playTone(440, 660, 0.09, "sine", 0.12);
    setTimeout(() => this.playTone(660, 990, 0.13, "triangle", 0.12), 70);
  }

  public playDash(): void {
    this.playTone(280, 120, 0.1, "sawtooth", 0.08);
  }

  public playShieldBreak(): void {
    this.playTone(340, 95, 0.22, "square", 0.11);
  }

  public playCrash(): void {
    this.playTone(190, 42, 0.34, "sawtooth", 0.15);
  }
}

export const soundFX = new SoundFX();