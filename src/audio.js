// =====================================================================
// audio.js  —  効果音（任意 / CLAUDE.md 8）
//
// 依存なしの WebAudio で、やさしい短い音を鳴らす。最初のユーザー操作で
// AudioContext を起動（自動再生制限への対応）。失敗しても無音で続行。
// =====================================================================

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    const resume = () => this._ensure();
    window.addEventListener('pointerdown', resume, { once: true });
  }

  _ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.enabled = false;
    }
  }

  _tone(freq, dur, type = 'sine', gain = 0.06) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  goal() { this._tone(880, 0.18, 'triangle', 0.05); setTimeout(() => this._tone(1180, 0.16, 'triangle', 0.05), 90); }
  clear() { this._tone(520, 0.25, 'sawtooth', 0.04); }
  drop() { this._tone(300, 0.1, 'sine', 0.04); }
}
