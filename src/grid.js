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

  // 帯 [rowTop..rowBot] の中で一番上にある固体の行を返す（なければ -1）。
  // 車の「体の高さ」の範囲だけを見るのに使う（頭上のセル＝天井は無視できる）。
  topSolidInBand(col, rowTop, rowBot) {
    if (!this.inCols(col)) return Math.max(0, rowTop); // 画面外は壁
    const start = Math.max(0, rowTop);
    for (let r = start; r <= rowBot; r++) {
      if (r >= this.groundRow) return r;                  // 地面
      if (this.staticCells.has(this.idx(col, r))) return r;
    }
    return -1;
  }

  // fromRow から下方向で最初の固体行（=足場の上面の行）を返す。
  floorBelow(col, fromRow) {
    if (!this.inCols(col)) return this.groundRow;
    for (let r = Math.max(0, fromRow); r < this.groundRow; r++) {
      if (this.staticCells.has(this.idx(col, r))) return r;
    }
    return this.groundRow;
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
    for (const it of cl.items) this._setStatic(it.c, it.r, it.color);
  }

  // --- 削る（5.4 / グラインダー車）---------------------------------
  // 「車の届く範囲だけ」削る：頭上の行(headRow)から、乗り越えられる高さ
  // (targetTopRow)までの段差上部だけを GRIND_RATE 個消す。これより上の
  // セル（天井・高所）は触らないので不自然に上方が消えない。
  // 消した位置の配列（px中心）を返す → 砂ぼこり用。
  grindFront(frontXpx, headRow, targetTopRow) {
    const dust = [];
    let removed = 0;
    const cols = [Math.floor(frontXpx / this.cell), Math.floor(frontXpx / this.cell) + 1];
    for (const c of cols) {
      if (!this.inCols(c)) continue;
      let r = Math.max(0, headRow);
      while (r < targetTopRow && r < this.groundRow && removed < CFG.GRIND_RATE) {
        if (this.staticCells.has(this.idx(c, r))) {
          this._clear(c, r);
          dust.push({ x: c * this.cell + this.cell / 2, y: r * this.cell + this.cell / 2 });
          removed++;
        }
        r++;
      }
    }
    return dust;
  }

  // --- 掘る（5.4 / トンネル車）-------------------------------------
  // 車高ぶんの帯(rowTop..rowBot)を正面方向に消す。上の STATIC は残す（=天井）。
  // 消した位置の配列を返す。
  digBand(frontXpx, rowTop, rowBot) {
    const dust = [];
    const cols = [Math.floor(frontXpx / this.cell), Math.floor(frontXpx / this.cell) + 1];
    for (const c of cols) {
      if (!this.inCols(c)) continue;
      for (let r = rowTop; r <= rowBot; r++) {
        if (r < 0 || r >= this.groundRow) continue;
        if (this.staticCells.has(this.idx(c, r))) {
          this._clear(c, r);
          dust.push({ x: c * this.cell + this.cell / 2, y: r * this.cell + this.cell / 2 });
        }
      }
    }
    return dust;
  }

  // 帯の前方にまだ固体があるか（掘り続けるべきか判定）
  bandBlocked(frontXpx, rowTop, rowBot) {
    const c = Math.floor(frontXpx / this.cell);
    if (!this.inCols(c)) return false;
    for (let r = rowTop; r <= rowBot; r++) {
      if (r >= 0 && r < this.groundRow && this.staticCells.has(this.idx(c, r))) return true;
    }
    return false;
  }

  // --- 全消去（2.4 / 障害物だけ消す。地面・車は残す）---
  clearAll() {
    this.staticCells.clear();
    this.clusters.length = 0;
    this.topRow.fill(this.groundRow);
    this.cacheDirty = true;
  }
}
