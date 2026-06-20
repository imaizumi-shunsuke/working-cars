// =====================================================================
// ui.js  —  全消去ボタン（CLAUDE.md 2.4 / 4.4 / 7）
//
// 画面右上。押すと障害物セルを全消去（車は残す）。
// 押したとき気持ちいい「シュワッ」エフェクトを発生させる。
// =====================================================================

export class UI {
  constructor(grid, onClear) {
    this.grid = grid;
    this.onClear = onClear;     // 「シュワッ」演出を出すコールバック
    this.w = 138;
    this.h = 44;
    this.margin = 16;
    this.x = 0;                 // 左上x（resizeで更新）
    this.y = this.margin;
    this.pressT = 0;           // 押下アニメ(0..1)
  }

  resize(width) {
    this.x = width - this.w - this.margin;
    this.y = this.margin;
  }

  hitTest(px, py) {
    return px >= this.x && px <= this.x + this.w &&
           py >= this.y && py <= this.y + this.h;
  }

  press() {
    this.grid.clearAll();
    this.pressT = 1;
    // ボタン中心からシュワッ
    if (this.onClear) {
      this.onClear(this.x + this.w / 2, this.y + this.h / 2);
    }
  }

  update(step) {
    if (this.pressT > 0) this.pressT = Math.max(0, this.pressT - 0.08 * step);
  }
}
