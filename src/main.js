// =====================================================================
// main.js  —  起動とゲームループ（CLAUDE.md 10）
//
// 全画面 Canvas（DPR対応）＋ requestAnimationFrame ループ。
// grid / cars / input / render / ui / audio を束ねる。
// =====================================================================

import { CFG, FRAME_MS, COLORS } from './config.js';
import { Grid } from './grid.js';
import { Renderer } from './render.js';
import { InputManager } from './input.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { spawnCar, updateCar, placeOnGround } from './cars.js';

const canvas = document.getElementById('game');

const grid = new Grid();
const renderer = new Renderer(canvas);
const audio = new Audio();

const game = {
  cars: [],
  particles: [],
  spawnTimer: 0,
};

const ui = new UI(grid, (x, y) => {
  // 「シュワッ」演出
  audio.clear();
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 3;
    game.particles.push({
      kind: 'spark', x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
      r: 2 + Math.random() * 3, life: 1, maxLife: 1, color: COLORS.spark,
    });
  }
});

const input = new InputManager(canvas, grid, ui);

// --- リサイズ -------------------------------------------------------
function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  grid.resize(width, height);
  renderer.resize(width, height, dpr);
  ui.resize(width);
}
window.addEventListener('resize', resize);
resize();

// --- パーティクル ----------------------------------------------------
function updateParticles(step) {
  const out = [];
  for (const p of game.particles) {
    p.x += p.vx * step;
    p.y += p.vy * step;
    if (p.kind === 'dust' || p.kind === 'bit') p.vy += 0.25 * step;
    if (p.kind === 'spark') p.vy += 0.05 * step;
    p.life -= (p.decay || 0.04) * step;
    if (p.life > 0) out.push(p);
  }
  game.particles = out;
}

function spawnDust(list, color) {
  for (const d of list) {
    game.particles.push({
      kind: 'dust', x: d.x, y: d.y,
      vx: (Math.random() - 0.3) * 2, vy: -Math.random() * 2,
      r: 1.5 + Math.random() * 2.5, life: 1, maxLife: 1,
      decay: 0.05, color: COLORS.dust,
    });
  }
}
function spawnSparks(list) {
  for (const d of list) {
    if (Math.random() < 0.5) continue;
    game.particles.push({
      kind: 'spark', x: d.x, y: d.y,
      vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 2 - 0.5,
      r: 1.5 + Math.random() * 2, life: 1, maxLife: 1, decay: 0.06,
    });
  }
}
function spawnGoal(car) {
  audio.goal();
  game.particles.push({ kind: 'ring', x: car.x, y: car.y, r: 40, life: 1, maxLife: 1, decay: 0.05, color: COLORS.cheek });
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 3;
    game.particles.push({
      kind: 'bit', x: car.x, y: car.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
      r: 2 + Math.random() * 2, life: 1, maxLife: 1, decay: 0.04,
      color: COLORS.obstacles[i & 3],
    });
  }
}

// --- スポーン --------------------------------------------------------
function trySpawn(dtMs) {
  game.spawnTimer += dtMs;
  if (game.spawnTimer >= CFG.SPAWN_INTERVAL && game.cars.length < CFG.MAX_CARS) {
    game.spawnTimer = 0;
    const car = spawnCar();
    placeOnGround(car, grid);
    game.cars.push(car);
  }
}

// --- メインループ ----------------------------------------------------
let last = performance.now();
function loop(now) {
  let dt = now - last;
  last = now;
  if (dt > 60) dt = 60; // タブ復帰などの大ジャンプを抑制
  const step = dt / FRAME_MS;

  // 更新
  grid.update(step);
  ui.update(step);
  trySpawn(dt);

  for (const car of game.cars) {
    const fx = updateCar(car, grid, step, renderer.width);
    if (fx.dust.length) spawnDust(fx.dust);
    if (fx.sparks.length) spawnSparks(fx.sparks);
    if (fx.goal) spawnGoal(car);
  }
  game.cars = game.cars.filter((c) => !c.dead);
  updateParticles(step);

  // 描画
  renderer.drawBackground(grid, now);
  renderer.drawObstacles(grid);
  renderer.drawStroke(input, grid);
  for (const car of game.cars) renderer.drawCar(car);
  renderer.drawParticles(game.particles);
  renderer.drawButton(ui);
  renderer.drawPaper();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
