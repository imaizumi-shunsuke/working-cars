// =====================================================================
// render.js  —  Canvas 描画（CLAUDE.md 4 / 12）
//
// 案A「クレヨン絵本」: 茶色の輪郭線・微小ジッター・重ね塗り・紙ノイズ。
// 確定済み障害物はオフスクリーンにキャッシュし、変化時だけ再描画（軽量化）。
// =====================================================================

import { CFG, COLORS } from './config.js';
import { TYPE } from './cars.js';

// ---- 小さなユーティリティ -------------------------------------------
const jit = (a) => (Math.random() * 2 - 1) * a;

function roundRectPath(ctx, x, y, w, h, r, j = 0) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r + jit(j), y + jit(j));
  ctx.lineTo(x + w - r + jit(j), y + jit(j));
  ctx.quadraticCurveTo(x + w + jit(j), y + jit(j), x + w + jit(j), y + r + jit(j));
  ctx.lineTo(x + w + jit(j), y + h - r + jit(j));
  ctx.quadraticCurveTo(x + w + jit(j), y + h + jit(j), x + w - r + jit(j), y + h + jit(j));
  ctx.lineTo(x + r + jit(j), y + h + jit(j));
  ctx.quadraticCurveTo(x + jit(j), y + h + jit(j), x + jit(j), y + h - r + jit(j));
  ctx.lineTo(x + jit(j), y + r + jit(j));
  ctx.quadraticCurveTo(x + jit(j), y + jit(j), x + r + jit(j), y + jit(j));
  ctx.closePath();
}

// クレヨン風 角丸四角：塗り→輪郭を少しずらして2回（重ね塗り感）
function crayonRect(ctx, x, y, w, h, r, fill, { stroke = COLORS.ink, strokeW = CFG.OUTLINE_W, j = CFG.JITTER, outline = true } = {}) {
  if (fill) {
    roundRectPath(ctx, x, y, w, h, r, 0);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (outline && stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeW;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    roundRectPath(ctx, x, y, w, h, r, j);
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(jit(0.7), jit(0.7));
    roundRectPath(ctx, x, y, w, h, r, j);
    ctx.stroke();
    ctx.restore();
  }
}

function crayonCircle(ctx, cx, cy, rad, fill, { stroke = COLORS.ink, strokeW = CFG.OUTLINE_W, outline = true } = {}) {
  if (fill) {
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (outline && stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeW;
    ctx.beginPath();
    ctx.arc(cx + jit(0.4), cy + jit(0.4), rad, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---- レンダラ本体 ---------------------------------------------------
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.paper = null;     // 紙ノイズ（起動時/リサイズ時に1度だけ生成）
    this.cache = document.createElement('canvas'); // 障害物キャッシュ
    this.cacheCtx = this.cache.getContext('2d');
  }

  resize(width, height, dpr) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    // メインキャンバス
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 障害物キャッシュ
    this.cache.width = Math.round(width * dpr);
    this.cache.height = Math.round(height * dpr);
    this.cacheCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 紙ノイズ再生成
    this.paper = this._makePaper(width, height);
  }

  // 紙の質感：薄いノイズを1度だけ生成（毎フレーム再生成しない）
  _makePaper(width, height) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const cx = c.getContext('2d');
    const img = cx.createImageData(width, height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 235 + (Math.random() * 40 - 20);
      d[i] = v; d[i + 1] = v - 6; d[i + 2] = v - 24;
      d[i + 3] = Math.random() < 0.5 ? Math.random() * 40 : 0;
    }
    cx.putImageData(img, 0, 0);
    return c;
  }

  // ---- 背景：空・雲・丘・地面・草（案Aの色）-------------------------
  drawBackground(grid, t) {
    const ctx = this.ctx;
    const W = this.width, H = this.height;
    // 紙ベース → 空
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(0, 0, W, H);
    const groundY = grid.groundRow * grid.cell;
    ctx.fillStyle = COLORS.sky;
    ctx.fillRect(0, 0, W, groundY + 8);

    // 雲（ゆっくり流れる）
    this._cloud(ctx, (t * 0.006) % (W + 120) - 60, H * 0.16, 1);
    this._cloud(ctx, (t * 0.004 + W * 0.5) % (W + 160) - 80, H * 0.1, 0.8);
    this._cloud(ctx, (t * 0.005 + W * 0.78) % (W + 160) - 80, H * 0.22, 0.7);

    // 丘（2枚）
    ctx.fillStyle = COLORS.hillBack;
    this._hill(ctx, groundY - 26, 0.0, W, H, 110);
    ctx.fillStyle = COLORS.hillFront;
    this._hill(ctx, groundY - 8, 0.6, W, H, 150);

    // 地面
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(-2, groundY + 8, W + 4, H - groundY);
    // 草（波打つ縁）
    ctx.fillStyle = COLORS.grass;
    ctx.beginPath();
    ctx.moveTo(-2, groundY + 8);
    const seg = 28;
    for (let x = -2; x <= W + seg; x += seg) {
      ctx.quadraticCurveTo(x + seg / 2, groundY + 1, x + seg, groundY + 8);
    }
    ctx.lineTo(W + 2, groundY + 18);
    ctx.lineTo(-2, groundY + 18);
    ctx.closePath();
    ctx.fill();
  }

  _cloud(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = COLORS.white;
    ctx.globalAlpha = 0.95;
    for (const [cx, cy, r] of [[0, 0, 18], [18, 4, 14], [-16, 5, 13]]) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(-24, 2, 48, 10);
    ctx.restore();
  }

  _hill(ctx, baseY, phase, W, H, amp) {
    const span = W + 40;
    ctx.beginPath();
    ctx.moveTo(-20, baseY);
    for (let x = -20; x <= W + 20; x += 4) {
      ctx.lineTo(x, baseY - Math.sin((x / span) * Math.PI * 2 + phase * 6) * (amp * 0.16) - 10);
    }
    ctx.lineTo(W + 20, H);
    ctx.lineTo(-20, H);
    ctx.closePath();
    ctx.fill();
  }

  // ---- 障害物：キャッシュへ描画 ＆ 落下クラスタは生描画 -------------
  drawObstacles(grid) {
    if (grid.cacheDirty) {
      this._renderObstacleCache(grid);
      grid.cacheDirty = false;
    }
    // キャッシュ（確定セル）をblit
    this.ctx.drawImage(this.cache, 0, 0, this.width, this.height);
    // 落下中クラスタ
    const cell = grid.cell;
    for (const cl of grid.clusters) {
      for (const it of cl.items) {
        this._block(this.ctx, it.c * cell, it.r * cell + cl.subY, cell, COLORS.obstacles[it.color]);
      }
    }
  }

  _renderObstacleCache(grid) {
    const ctx = this.cacheCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    const cell = grid.cell;
    const rows = grid.rows;
    for (const [index, color] of grid.staticCells) {
      const c = Math.floor(index / rows);
      const r = index % rows;
      this._block(ctx, c * cell, r * cell, cell, COLORS.obstacles[color]);
    }
  }

  _block(ctx, x, y, size, color) {
    // セルが小さいので輪郭・角丸・ゆらぎをサイズに合わせて控えめに
    const r = Math.min(size * 0.32, 3);
    const sw = Math.max(1.1, size * 0.22);
    crayonRect(ctx, x + 0.4, y + 0.4, size - 0.8, size - 0.8, r, color, { strokeW: sw, j: 0.3 });
    // つや（ハイライト）
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = COLORS.white;
    ctx.beginPath();
    ctx.ellipse(x + size * 0.38, y + size * 0.32, size * 0.22, size * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- 描画中ストローク（クレヨン風に光らせる）---------------------
  drawStroke(input, grid) {
    if (!input.drawing || input.stroke.size === 0) return;
    const ctx = this.ctx;
    const cell = grid.cell;
    ctx.save();
    for (const key of input.stroke) {
      const [c, r] = key.split(',').map(Number);
      this._block(ctx, c * cell, r * cell, cell, COLORS.obstacles[((c + r) & 3)]);
    }
    // 先端のキラッ
    ctx.globalCompositeOperation = 'lighter';
    const last = input.trail[input.trail.length - 1];
    if (last) {
      const g = ctx.createRadialGradient(last.x, last.y, 0, last.x, last.y, 26);
      g.addColorStop(0, 'rgba(255,250,210,0.55)');
      g.addColorStop(1, 'rgba(255,250,210,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- 車 -----------------------------------------------------------
  drawCar(car) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(car.x + (car.shake || 0), car.y);
    ctx.rotate(car.angle);
    if (car.state === 'goal') {
      const s = 1 + car.goalT * 0.4;
      ctx.globalAlpha = 1 - car.goalT;
      ctx.scale(s, s);
    }
    const w = car.w, h = car.h;
    const body = car.color;
    const v = car.variant;
    const isBus = !!(v && v.long);

    // タイヤ（バスは3つ）
    const wheelXs = isBus ? [-w * 0.32, 0, w * 0.32] : [-w * 0.28, w * 0.28];
    for (const wx of wheelXs) {
      ctx.save();
      ctx.translate(wx, h * 0.42);
      crayonCircle(ctx, 0, 0, 9, COLORS.tire, { strokeW: 2.4 });
      ctx.rotate(car.wheelSpin);
      crayonCircle(ctx, 0, 0, 4, COLORS.hub, { outline: false });
      ctx.strokeStyle = COLORS.tire;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-4, 0); ctx.lineTo(4, 0);
      ctx.moveTo(0, -4); ctx.lineTo(0, 4);
      ctx.stroke();
      ctx.restore();
    }

    if (isBus) {
      // バス：背の高い箱型ボディ＋窓いっぱい
      crayonRect(ctx, -w * 0.5, -h * 0.7, w, h * 1.14, CFG.RADIUS, body);
      const n = v.windows || 3;
      const gap = w * 0.86 / n;
      for (let i = 0; i < n; i++) {
        crayonRect(ctx, -w * 0.43 + i * gap, -h * 0.52, gap - 5, h * 0.4,
          Math.max(3, CFG.RADIUS - 3), COLORS.window, { strokeW: 2 });
      }
    } else {
      // 運転席のふくらみ（キャビン）＋ 窓
      crayonRect(ctx, -w * 0.18, -h * 0.62, w * 0.5, h * 0.55, CFG.RADIUS, body);
      crayonRect(ctx, -w * 0.10, -h * 0.50, w * 0.34, h * 0.34,
        Math.max(3, CFG.RADIUS - 3), COLORS.window, { strokeW: 2 });
      // ボディ
      crayonRect(ctx, -w * 0.5, -h * 0.18, w, h * 0.62, CFG.RADIUS, body);
    }

    if (car.type === TYPE.NORMAL) {
      this._vehicleParts(ctx, car);
      this._face(ctx, isBus ? -w * 0.02 : w * 0.06, isBus ? h * 0.18 : h * 0.06);
    } else {
      this._factoryParts(ctx, car);
      this._face(ctx, -w * 0.04, h * 0.06);
    }

    ctx.restore();
  }

  // 車種ごとの飾り（救急車・消防車・パトカー・タクシー・バス）
  _vehicleParts(ctx, car) {
    const w = car.w, h = car.h;
    const v = car.variant;
    if (!v) return;

    // 二色（パトカーの下半分）
    if (v.lower) {
      ctx.save();
      crayonRect(ctx, -w * 0.5, h * 0.04, w, h * 0.4, CFG.RADIUS, v.lower, { outline: false });
      ctx.restore();
    }
    // 横帯（救急車・消防車）
    if (v.stripe) {
      ctx.save();
      ctx.fillStyle = v.stripe;
      ctx.globalAlpha = 0.95;
      ctx.fillRect(-w * 0.5, h * 0.02, w, 6);
      ctx.restore();
    }
    // 赤十字（救急車）
    if (v.cross) {
      ctx.save();
      ctx.fillStyle = '#e2574f';
      const s = 7, cx = -w * 0.24, cy = h * 0.16;
      ctx.fillRect(cx - s / 2, cy - 2, s, 4);
      ctx.fillRect(cx - 2, cy - s / 2, 4, s);
      ctx.restore();
    }
    // チェッカー（タクシー）
    if (v.checker) {
      ctx.save();
      ctx.fillStyle = COLORS.ink;
      const cs = 5;
      for (let i = 0; i < Math.floor(w / cs); i++) {
        if (i % 2 === 0) ctx.fillRect(-w * 0.5 + i * cs, h * 0.06, cs, cs);
      }
      ctx.restore();
    }
    // 屋根サイン（タクシー）
    if (v.sign) {
      crayonRect(ctx, -w * 0.1, -h * 0.86, w * 0.22, h * 0.2, 3, '#fff3c4', { strokeW: 2 });
    }
    // はしご（消防車）
    if (v.ladder) {
      ctx.save();
      ctx.strokeStyle = '#e7e1d0';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-w * 0.32, -h * 0.66); ctx.lineTo(w * 0.18, -h * 0.66);
      ctx.moveTo(-w * 0.32, -h * 0.56); ctx.lineTo(w * 0.18, -h * 0.56);
      ctx.stroke();
      ctx.lineWidth = 1.4;
      for (let i = 0; i <= 6; i++) {
        const lx = -w * 0.32 + i * (w * 0.5 / 6);
        ctx.beginPath(); ctx.moveTo(lx, -h * 0.66); ctx.lineTo(lx, -h * 0.56); ctx.stroke();
      }
      ctx.restore();
    }
    // サイレン（点滅）
    if (v.siren) {
      const blink = Math.floor(car.wheelSpin * 2) % 2;
      const lx = -w * 0.1, ly = -h * (v.long ? 0.86 : 0.74);
      crayonRect(ctx, lx, ly, w * 0.2, 6, 2, '#3a3142', { strokeW: 1.6, j: 0.2 });
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = v.siren[blink];
      ctx.beginPath(); ctx.arc(lx + w * 0.05, ly + 3, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = v.siren[1 - blink];
      ctx.beginPath(); ctx.arc(lx + w * 0.15, ly + 3, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  _factoryParts(ctx, car) {
    const w = car.w, h = car.h;
    // 白い帯
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = COLORS.white;
    ctx.fillRect(-w * 0.5, h * 0.1, w, 5);
    ctx.restore();
    // ハザードランプ
    crayonCircle(ctx, -w * 0.05, -h * 0.78, 3.4, '#ffd24a', { strokeW: 2 });

    // ショベルカーはバケットアーム（車体座標で描く）
    if (car.type === TYPE.SHOVEL) { this._shovelArm(ctx, car); return; }

    // 前方の工具
    ctx.save();
    ctx.translate(w * 0.5, h * 0.06);
    if (car.type === TYPE.GRINDER) {
      // 研削ディスク（回転）
      ctx.save();
      ctx.rotate(car.wheelSpin * 1.8);
      crayonCircle(ctx, 6, 0, 9, '#d8d8e0', { strokeW: 2.2 });
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.4;
      for (let a = 0; a < 6; a++) {
        ctx.save();
        ctx.rotate((a / 6) * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(6, -9); ctx.lineTo(6, -5);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    } else {
      // トンネル用ドリル（横向き三角＋ハイライト）
      ctx.fillStyle = '#d8d8e0';
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(18, 0); ctx.lineTo(0, 8); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.7;
      for (const yy of [-4, 0, 4]) {
        ctx.beginPath();
        ctx.moveTo(3, yy * 0.6); ctx.lineTo(13, yy * 0.3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _shovelArm(ctx, car) {
    const w = car.w, h = car.h;
    // すくう動き：肘とバケットが上下する
    const dig = (Math.sin(car.wheelSpin * 4) * 0.5 + 0.5); // 0..1
    const sx = w * 0.06, sy = -h * 0.55;        // 肩（キャビン上）
    const ex = w * 0.42, ey = -h * 0.18;        // 肘
    const tx = w * 0.6, ty = h * 0.12 + dig * h * 0.34; // バケット先端（下げる）

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // アーム（太い茶の腕）
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.strokeStyle = COLORS.factory;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(tx, ty);
    ctx.stroke();
    // 関節ピン
    crayonCircle(ctx, ex, ey, 2.2, '#ffd24a', { strokeW: 1.4 });

    // バケット（すくうお椀＋歯）
    ctx.save();
    ctx.translate(tx, ty);
    ctx.fillStyle = '#d8c08a';
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.lineTo(8, -4);
    ctx.quadraticCurveTo(10, 4, 4, 8);
    ctx.lineTo(-3, 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 歯
    ctx.lineWidth = 1.4;
    for (const bx of [-1, 2, 5]) {
      ctx.beginPath(); ctx.moveTo(bx, 7); ctx.lineTo(bx, 10); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  _face(ctx, cx, cy) {
    // 白目＋茶の瞳
    crayonCircle(ctx, cx - 6, cy, 3.2, COLORS.white, { outline: false });
    crayonCircle(ctx, cx + 6, cy, 3.2, COLORS.white, { outline: false });
    ctx.fillStyle = COLORS.ink;
    ctx.beginPath(); ctx.arc(cx - 5, cy + 0.6, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 7, cy + 0.6, 1.6, 0, Math.PI * 2); ctx.fill();
    // にっこり口
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + 6);
    ctx.quadraticCurveTo(cx + 1, cy + 10, cx + 7, cy + 6);
    ctx.stroke();
    // 頬の赤み
    ctx.fillStyle = COLORS.cheek;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(cx - 11, cy + 4, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 13, cy + 4, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---- パーティクル ------------------------------------------------
  drawParticles(particles) {
    const ctx = this.ctx;
    for (const p of particles) {
      const life = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, life);
      if (p.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = COLORS.spark;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * life, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'ring') {
        ctx.strokeStyle = p.color || COLORS.cheek;
        ctx.lineWidth = 3 * life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 - life) + 4, 0, Math.PI * 2);
        ctx.stroke();
      } else { // dust / bit
        ctx.fillStyle = p.color || COLORS.dust;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---- ボタン（右上）-----------------------------------------------
  drawButton(ui) {
    const ctx = this.ctx;
    const press = ui.pressT;
    const x = ui.x, y = ui.y + press * 2, w = ui.w, h = ui.h;
    ctx.save();
    // やわらかい影
    ctx.save();
    ctx.globalAlpha = 0.18;
    crayonRect(ctx, x + 2, y + 5, w, h, 15, '#7a5a9a', { outline: false });
    ctx.restore();
    // 本体
    crayonRect(ctx, x, y, w, h, 15, COLORS.btnBg, { stroke: COLORS.btnBorder, strokeW: 2.4, j: 0.5 });

    // ほうき/キラッ アイコン
    const ix = x + 22, iy = y + h / 2;
    ctx.strokeStyle = COLORS.btnText;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ix - 6, iy - 7); ctx.lineTo(ix + 1, iy);
    ctx.stroke();
    ctx.fillStyle = COLORS.btnText;
    ctx.beginPath();
    ctx.moveTo(ix + 1, iy - 1); ctx.lineTo(ix + 8, iy + 6);
    ctx.lineTo(ix + 2, iy + 9); ctx.lineTo(ix - 2, iy + 4);
    ctx.closePath();
    ctx.fill();
    // キラッ
    ctx.beginPath();
    ctx.moveTo(ix + 7, iy - 9); ctx.lineTo(ix + 7, iy - 5);
    ctx.moveTo(ix + 5, iy - 7); ctx.lineTo(ix + 9, iy - 7);
    ctx.stroke();

    // ラベル
    ctx.fillStyle = COLORS.btnText;
    ctx.font = "700 16px 'Zen Maru Gothic', system-ui, sans-serif";
    ctx.textBaseline = 'middle';
    ctx.fillText('ぜんぶけす', x + 42, y + h / 2 + 1);
    ctx.restore();
  }

  // ---- 紙ノイズを全面に重ねる（最後に1枚）-------------------------
  drawPaper() {
    if (!this.paper) return;
    this.ctx.save();
    this.ctx.globalAlpha = CFG.PAPER_NOISE_ALPHA;
    this.ctx.drawImage(this.paper, 0, 0, this.width, this.height);
    this.ctx.restore();
  }
}
