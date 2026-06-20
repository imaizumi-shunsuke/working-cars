// =====================================================================
// grid.js  —  セルグリッド / クラスタ / 重力 / 削り / 掘削（CLAUDE.md 5）
//
// 世界をセルサイズ CELL の格子で表す軽量シミュレーション。
//   描く   = 足す
//   落とす = 重力（クラスタ単位）
//   削る/掘る = 消す
// で「落下・積み重ね・削り・トンネル」を1モデルに統一する。
// =====================================================================

import { CFG } from './config.js';

export const EMPTY = 0;
export const STATIC = 1;

export class Grid {
  constructor() {
    this.cell = CFG.CELL;
    this.cols = 0;
    this.rows = 0;
    this.groundRow = 0;      // これ以上(下)の行は地面（常に固体）
    this.staticCells = new Map(); // key=index -> colorIndex(0..3)。確定済み障害物のみ保持
    this.topRow = null;      // 各列の「一番上の固体行」キャッシュ（=車が走る面）
    this.clusters = [];      // 落下中のかたまり
    this.cacheDirty = true;  // 障害物の見た目が変わったか（描画キャッシュ用）
  }

  // --- リサイズ（ビューポートに合わせて格子を張り直す）---
  resize(width, height) {
    const c = this.cell;
    this.cols = Math.ceil(width / c);
    this.rows = Math.ceil(height / c);
    // 地面の表面：画面下から約 90px の高さ
    const groundY = height - 90;
    this.groundRow = Math.max(1, Math.floor(groundY / c));
    this.staticCells.clear();
    this.clusters.length = 0;
    this.topRow = new Int32Array(this.cols).fill(this.groundRow);
    this.cacheDirty = true;
  }

  idx(c, r) { return c * this.rows + r; }
  inCols(c) { return c >= 0 && c < this.cols; }

  // 固体か？（地面 or 確定済み障害物）
  isSolid(c, r) {
    if (!this.inCols(c)) return true;       // 画面外の横は壁扱い
    if (r >= this.groundRow) return true;   // 地面より下
    if (r < 0) return false;
    return this.staticCells.has(this.idx(c, r));
  }

  // 列の表面（一番上の固体行）を再計算
  recomputeCol(c) {
    if (!this.inCols(c)) return;
    let r = 0;
    while (r < this.groundRow && !this.staticCells.has(this.idx(c, r))) r++;
    this.topRow[c] = r;
  }

  // x(px) における表面の y(px)。小さいほど高い。
  surfaceTopY(xpx) {
    let c = Math.floor(xpx / this.cell);
    if (c < 0) c = 0;
    if (c >= this.cols) c = this.cols - 1;
    return this.topRow[c] * this.cell;
  }

  // --- 列ごとの重力（落として隙間を埋める / ブロックを宙に浮かせない）---
  // 列 c の固体セルを、縦の順序と色を保ったまま地面側へ詰める。
  // セルを消したあとに呼ぶと、上のセルが落ちてくる。
  settleColumn(c) {
    if (!this.inCols(c)) return;
    const colors = [];
    for (let r = 0; r < this.groundRow; r++) {
      const k = this.idx(c, r);
      const col = this.staticCells.get(k);
      if (col !== undefined) {
        colors.push(col);
        this.staticCells.delete(k);
      }
    }
    let r = this.groundRow - 1;
    for (let i = colors.length - 1; i >= 0; i--, r--) {
      this.staticCells.set(this.idx(c, r), colors[i]);
    }
    this.topRow[c] = this.groundRow - colors.length;
    this.cacheDirty = true;
  }

  // セルを消すだけ（topRow 更新は settleColumn にまかせる）
  _del(c, r) {
    if (this.staticCells.delete(this.idx(c, r))) this.cacheDirty = true;
  }

  // --- 確定セルを置く / 消す（内部用）---
  _setStatic(c, r, colorIndex) {
    if (!this.inCols(c) || r < 0 || r >= this.groundRow) return;
    this.staticCells.set(this.idx(c, r), colorIndex);
    if (r < this.topRow[c]) this.topRow[c] = r;
    this.cacheDirty = true;
  }
  _clear(c, r) {
    if (this.staticCells.delete(this.idx(c, r))) {
      this.recomputeCol(c);
      this.cacheDirty = true;
    }
  }

  // --- ストロークの確定 → 落下クラスタを作る（5.2）---
  // cellsSet: Set of "c,r" 文字列
  commitStroke(cellsSet) {
    if (!cellsSet || cellsSet.size === 0) return;
    const items = [];
    for (const key of cellsSet) {
      const [c, r] = key.split(',').map(Number);
      if (!this.inCols(c) || r < 0 || r >= this.groundRow) continue;
      if (this.staticCells.has(this.idx(c, r))) continue;
      const color = ((c % 1000) + (r % 1000)) & 3; // 4色ローテ（位置で混色）
      items.push({ c, r, color });
    }
    if (items.length === 0) return;
    this.clusters.push({ items, subY: 0 });
  }

  // --- 毎フレーム：クラスタに重力（5.2）---
  update(step) {
    if (this.clusters.length === 0) return;
    const remaining = [];
    for (const cl of this.clusters) {
      cl.subY += CFG.GRAVITY * step;
      // セル単位で落とせるだけ落とす
      while (cl.subY >= this.cell) {
        if (this._canFall(cl)) {
          for (const it of cl.items) it.r += 1;
          cl.subY -= this.cell;
        } else {
          cl.subY = 0;
          this._freeze(cl);
          cl.frozen = true;
          break;
        }
      }
      if (!cl.frozen) remaining.push(cl);
    }
    this.clusters = remaining;
  }

  _cellSetOf(cl) {
    const s = new Set();
    for (const it of cl.items) s.add(this.idx(it.c, it.r));
    return s;
  }

  // クラスタ全体が1行下へ動けるか
  _canFall(cl) {
    const own = this._cellSetOf(cl);
    for (const it of cl.items) {
      const nr = it.r + 1;
      if (nr >= this.groundRow) return false;           // 地面に着地
      const below = this.idx(it.c, nr);
      if (this.staticCells.has(below) && !own.has(below)) return false; // 既存セルに着地
    }
    return true;
  }

  _freeze(cl) {
    const cols = new Set();
    for (const it of cl.items) {
      this._setStatic(it.c, it.r, it.color);
      cols.add(it.c);
    }
    // 着地した列を重力で詰める（宙に浮いたセルを残さない）
    for (const c of cols) this.settleColumn(c);
  }

  // --- 削る（グラインダー車＝「上を削る」のが得意）-----------------
  // 前方の柱の一番上のセルを count 個けずる。けずった後は重力で詰まる
  // ので、壁は上から少しずつ低くなる。消した位置の配列を返す（砂ぼこり）。
  grindTop(frontXpx, count) {
    const dust = [];
    const cols = [Math.floor(frontXpx / this.cell), Math.floor(frontXpx / this.cell) + 1];
    for (const c of cols) {
      if (!this.inCols(c)) continue;
      let removed = 0;
      for (let r = this.topRow[c]; r < this.groundRow && removed < count; r++) {
        if (this.staticCells.has(this.idx(c, r))) {
          this._del(c, r);
          dust.push({ x: c * this.cell + this.cell / 2, y: r * this.cell + this.cell / 2 });
          removed++;
        }
      }
      this.settleColumn(c);
    }
    return dust;
  }

  // --- 掘る（ドリル車＝「下を掘る」のが得意）-----------------------
  // 前方の柱の一番下のセルを count 個ほり取る。上のセルは重力で落ちて
  // くる（崩れ落ちる）ので壁全体が沈んでいく。消した位置の配列を返す。
  drillBottom(frontXpx, count) {
    const dust = [];
    const cols = [Math.floor(frontXpx / this.cell), Math.floor(frontXpx / this.cell) + 1];
    for (const c of cols) {
      if (!this.inCols(c)) continue;
      let removed = 0;
      for (let r = this.groundRow - 1; r >= 0 && removed < count; r--) {
        if (this.staticCells.has(this.idx(c, r))) {
          this._del(c, r);
          dust.push({ x: c * this.cell + this.cell / 2, y: r * this.cell + this.cell / 2 });
          removed++;
        }
      }
      this.settleColumn(c);
    }
    return dust;
  }

  // --- 全消去（2.4 / 障害物だけ消す。地面・車は残す）---
  clearAll() {
    this.staticCells.clear();
    this.clusters.length = 0;
    this.topRow.fill(this.groundRow);
    this.cacheDirty = true;
  }
}
