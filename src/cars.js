// =====================================================================
// cars.js  —  車の種類・スポーン・地面追従・特殊行動（CLAUDE.md 6）
//
//   普通車      : 地面に沿って右へ。急な壁で詰まり、ぷるぷる震える
//   グラインダー : 詰まりを削ってなめらかにして通す
//   トンネル車   : 障害物に横穴を掘ってバイパスを作る
// =====================================================================

import { CFG, COLORS } from './config.js';

export const TYPE = { NORMAL: 'normal', GRINDER: 'grinder', TUNNEL: 'tunnel' };

let _carColorIndex = 0;

export class Car {
  constructor(type, x, w, h, colorIndex) {
    this.type = type;
    this.x = x;            // 中心x(px)
    this.y = 0;            // 中心y(px)
    this.w = w;
    this.h = h;
    this.colorIndex = colorIndex;
    this.angle = 0;        // 車体の傾き(rad)
    this.state = 'run';    // 'run' | 'goal'
    this.stuck = 0;        // 詰まりフレーム数
    this.shake = 0;        // ぷるぷる用
    this.digging = false;  // トンネル車：掘削中
    this.wheelSpin = 0;    // タイヤ回転
    this.goalT = 0;        // ゴール演出の進み(0..1)
    this.dead = false;
  }

  get color() {
    return this.type === TYPE.NORMAL ? COLORS.cars[this.colorIndex] : COLORS.factory;
  }
}

// --- スポーン ---------------------------------------------------------
export function spawnCar() {
  let type = TYPE.NORMAL;
  if (Math.random() < CFG.FACTORY_RATIO) {
    type = Math.random() < 0.5 ? TYPE.GRINDER : TYPE.TUNNEL;
  }
  const w = type === TYPE.NORMAL ? 56 : 60;
  const h = 34;
  const colorIndex = _carColorIndex % COLORS.cars.length;
  _carColorIndex++;
  const car = new Car(type, -w, w, h, colorIndex);
  return car;
}

// --- 1フレーム更新 ----------------------------------------------------
// 戻り値: 発生したエフェクト { dust:[], goal:false, sparks:[] }
export function updateCar(car, grid, step, width) {
  const fx = { dust: [], sparks: [], goal: false };
  car.wheelSpin += 0.25 * step;

  // ゴール演出中
  if (car.state === 'goal') {
    car.goalT += 0.06 * step;
    if (car.goalT >= 1) car.dead = true;
    return fx;
  }

  const speed = CFG.CAR_SPEED * step;
  const front = car.x + car.w * 0.42;
  const back = car.x - car.w * 0.42;
  const run = front - back;

  const topF = grid.surfaceTopY(front);
  const topB = grid.surfaceTopY(back);
  const surface = Math.min(topF, topB);           // 高い方の面に乗る
  const rise = topB - topF;                        // >0 で前方が高い（壁）
  const maxStep = CFG.CELL * CFG.MAX_CLIMB_STEP;

  // --- トンネル車：掘削中の挙動 ---
  if (car.digging) {
    const rowTop = Math.floor((car.y - car.h * 0.5) / grid.cell);
    const rowBot = Math.floor((car.y + car.h * 0.45) / grid.cell);
    const digX = car.x + car.w * 0.5;
    const dust = grid.digBand(digX, rowTop, rowBot);
    fx.dust.push(...dust);
    car.x += speed * 0.6; // ゆっくり掘り進む
    // 前方の帯がもう塞がっていなければ掘削終了
    if (!grid.bandBlocked(car.x + car.w * 0.5, rowTop, rowBot)) {
      car.digging = false;
    }
    return _checkGoal(car, fx, width);
  }

  // --- 急な壁：詰まり / 特殊行動 ---
  if (rise > maxStep) {
    car.stuck += step;
    if (car.type === TYPE.GRINDER) {
      const dust = grid.grindFront(front, topB);
      fx.dust.push(...dust);
      if (dust.length) {
        for (const d of dust) fx.sparks.push(d);
      }
      // 少し進めるか毎フレーム再判定（削れたら次フレームで通る）
      car.shake = Math.sin(car.stuck * 0.8) * 1.2;
      return fx;
    }
    if (car.type === TYPE.TUNNEL) {
      // 掘削開始：いまの高さを基準に横穴を掘る
      car.digging = true;
      return fx;
    }
    // 普通車：停止してぷるぷる
    car.shake = Math.sin(car.stuck * 0.9) * 1.6;
    return fx;
  }

  // --- 通常走行：面に沿って進む ---
  car.stuck = 0;
  car.shake = 0;
  car.x += speed;

  const targetY = surface - car.h * 0.5;
  car.y += (targetY - car.y) * Math.min(1, 0.2 * step);
  const targetAngle = Math.atan2(topF - topB, run); // 上り坂で前が上がる
  car.angle += (targetAngle - car.angle) * Math.min(1, 0.2 * step);

  return _checkGoal(car, fx, width);
}

function _checkGoal(car, fx, width) {
  if (car.state === 'run' && car.x - car.w * 0.5 > width) {
    car.state = 'goal';
    fx.goal = true;
  }
  return fx;
}

// 初期配置：スポーン直後に地面の高さへ合わせる
export function placeOnGround(car, grid) {
  const top = grid.surfaceTopY(car.x);
  car.y = top - car.h * 0.5;
}
