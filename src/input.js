// =====================================================================
// input.js  —  ポインタ/タッチ → セル配置（ブラシ）（CLAUDE.md 7）
//
// 1本指描画を基本（マウス/タッチ両対応）。なぞった軌跡を BRUSH_RADIUS の
// 円としてセルに置く。離したら grid.commitStroke() で落下クラスタにする。
// =====================================================================

import { CFG } from './config.js';

export class InputManager {
  constructor(canvas, grid, ui) {
    this.canvas = canvas;
    this.grid = grid;
    this.ui = ui;
    this.drawing = false;
    this.stroke = new Set();      // "c,r" の集合（描画中プレビュー）
    this.trail = [];              // クレヨン光らせ用の最近の点(px)
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    c.addEventListener('pointerup',   (e) => this._up(e));
    c.addEventListener('pointercancel', (e) => this._up(e));
    c.addEventListener('pointerleave', (e) => this._up(e));
  }

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _down(e) {
    const p = this._pos(e);
    // ボタンを押したら描画ではなくボタン処理
    if (this.ui && this.ui.hitTest(p.x, p.y)) {
      this.ui.press();
      return;
    }
    this.drawing = true;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.stroke.clear();
    this.trail.length = 0;
    this._paint(p);
  }

  _move(e) {
    if (!this.drawing) return;
    // 連続性のため、前回点との間を補間して塗る
    const p = this._pos(e);
    this._paint(p);
  }

  _up() {
    if (!this.drawing) return;
    this.drawing = false;
    this.grid.commitStroke(this.stroke);
    this.stroke = new Set();
    this.trail.length = 0;
  }

  _paint(p) {
    const cell = this.grid.cell;
    const cc = Math.floor(p.x / cell);
    const cr = Math.floor(p.y / cell);
    const R = CFG.BRUSH_RADIUS;
    for (let dc = -R; dc <= R; dc++) {
      for (let dr = -R; dr <= R; dr++) {
        if (dc * dc + dr * dr > R * R + 1) continue; // 円形ブラシ
        const c = cc + dc, r = cr + dr;
        if (!this.grid.inCols(c)) continue;
        if (r < 0 || r >= this.grid.groundRow) continue;
        if (this.grid.staticCells.has(this.grid.idx(c, r))) continue;
        this.stroke.add(c + ',' + r);
      }
    }
    this.trail.push({ x: p.x, y: p.y, t: performance.now() });
    if (this.trail.length > 24) this.trail.shift();
  }
}
