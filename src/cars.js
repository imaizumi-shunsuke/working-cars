// =====================================================================
// cars.js  —  車の種類・スポーン・地面追従・特殊行動（CLAUDE.md 6）
//
//   ふつうの車 / 救急車 / 消防車 / パトカー / タクシー / バス … 見た目いろいろ
//   グラインダー車 : 詰まりを「届く範囲だけ」削ってなめらかにして通す
//   トンネル車     : 障害物に横穴を掘ってバイパスを作る（普通車も通れる）
//
// 地面追従は「車の体の高さ(帯)」で判定するので、頭上に天井（トンネルの上）が
// あっても潜って通れる。坂は乗り越え、急な壁では詰まる/特殊行動する。
// =====================================================================

import { CFG, COLORS } from './config.js';

export const TYPE = { NORMAL: 'normal', GRINDER: 'grinder', TUNNEL: 'tunnel' };

// ふつうの車のバリエーション（色＋飾り）。見た目だけ変える。
export const VEHICLES = [
  { id: 'car',       body: '#f4a3a3', w: 56 },
  { id: 'car',       body: '#97c4ef', w: 56 },
  { id: 'car',       body: '#ffd887', w: 56 },
  { id: 'car',       body: '#bcd98e', w: 56 },
  { id: 'ambulance', body: '#fdf8f0', stripe: '#ff8497', cross: true,  siren: ['#ff6b6b', '#7fb4ff'], w: 64 },
  { id: 'fire',      body: '#ef6a5a', stripe: '#ffd24a', ladder: true,  siren: ['#ffd24a', '#ff6b6b'], w: 66 },
  { id: 'police',    body: '#f2f4f8', lower:  '#586f93',                siren: ['#ff6b6b', '#6ba8ff'], w: 60 },
  { id: 'taxi',      body: '#ffce4a', checker: true, sign: true,                                       w: 58 },
  { id: 'bus',       body: '#8ed1a0', windows: 3, long: true,                                          w: 90 },
];

let _vehIndex = 0;

export class Car {
  constructor(type, variant, x, w, h) {
    this.type = type;
    this.variant = variant;  // VEHICLES の要素（NORMALのみ）。工場車両は null
    this.x = x;
    this.y = 0;
    this.w = w;
    this.h = h;
    this.angle = 0;
    this.state = 'run';      // 'run' | 'goal'
    this.stuck = 0;
    this.shake = 0;
    this.digging = false;
    this.wheelSpin = 0;
    this.goalT = 0;
    this.dead = false;
  }

  get color() {
    return this.type === TYPE.NORMAL ? this.variant.body : COLORS.factory;
  }
}

// --- スポーン ---------------------------------------------------------
export function spawnCar() {
  const h = 34;
  if (Math.random() < CFG.FACTORY_RATIO) {
    const type = Math.random() < 0.5 ? TYPE.GRINDER : TYPE.TUNNEL;
    return new Car(type, null, -64, 62, h);
  }
  // ふつうの車：バリエーションを順番に＋少しランダムに
  const v = VEHICLES[(_vehIndex + (Math.random() * 2 | 0)) % VEHICLES.length];
  _vehIndex = (_vehIndex + 1) % VEHICLES.length;
  return new Car(TYPE.NORMAL, v, -v.w, v.w, h);
}

// --- 1フレーム更新 ----------------------------------------------------
// 戻り値: { dust:[], sparks:[], goal:false }
export function updateCar(car, grid, step, width) {
  const fx = { dust: [], sparks: [], goal: false };
  car.wheelSpin += 0.25 * step;

  if (car.state === 'goal') {
    car.goalT += 0.06 * step;
    if (car.goalT >= 1) car.dead = true;
    return fx;
  }

  const cell = grid.cell;
  const speed = CFG.CAR_SPEED * step;
  const maxStep = cell * CFG.MAX_CLIMB_STEP;

  const front = car.x + car.w * 0.45;
  const back = car.x - car.w * 0.45;
  const run = front - back;
  const feetY = car.y + car.h * 0.5;
  const feetRow = Math.floor(feetY / cell);
  const headRow = Math.floor((car.y - car.h * 0.5) / cell);
  const frontCol = Math.floor(front / cell);

  // --- トンネル車：掘削中 ---
  if (car.digging) {
    const rowTop = Math.floor((car.y - car.h * 0.5 - cell) / cell); // 天井に少し余裕
    const rowBot = Math.floor((car.y + car.h * 0.5) / cell);
    fx.dust.push(...grid.digBand(car.x + car.w * 0.5, rowTop, rowBot));
    car.x += speed * 0.6;
    if (!grid.bandBlocked(car.x + car.w * 0.5, rowTop, rowBot)) car.digging = false;
    return _checkGoal(car, fx, width);
  }

  // --- 体の高さ(帯)の中に前方の障害があるか ---
  const obsRow = grid.topSolidInBand(frontCol, headRow, feetRow);
  let floorTop;
  let blocked = false;

  if (obsRow >= 0) {
    const stepUp = feetY - obsRow * cell; // 足元より何px高いか
    if (stepUp <= maxStep) {
      floorTop = obsRow * cell;           // ゆるい段差 → 乗り越える
    } else {
      blocked = true;                     // 急な壁 → 詰まり/特殊行動
    }
  } else {
    // 帯に障害なし（平地・下り・トンネル内）→ 足元の下の足場へ
    floorTop = grid.floorBelow(frontCol, feetRow) * cell;
  }

  if (blocked) {
    car.stuck += step;
    if (car.type === TYPE.GRINDER) {
      // 「届く範囲だけ」削る：乗り越えられる高さまで段差上部を削る。
      // targetTopRow より上(=頭に近い側)のセルだけ消すので、削った後に
      // ちょうど乗り越えられる段差になる（頭上の天井や高所は触らない）。
      const targetTopRow = Math.ceil((feetY - maxStep) / cell);
      const dust = grid.grindFront(front, headRow, targetTopRow);
      fx.dust.push(...dust);
      fx.sparks.push(...dust);
      car.shake = Math.sin(car.stuck * 0.8) * 1.0;
      return fx;
    }
    if (car.type === TYPE.TUNNEL) {
      car.digging = true;
      return fx;
    }
    car.shake = Math.sin(car.stuck * 0.9) * 1.6; // 普通車：ぷるぷる
    return fx;
  }

  // --- 通常走行 ---
  car.stuck = 0;
  car.shake = 0;
  car.x += speed;

  const targetY = floorTop - car.h * 0.5;
  car.y += (targetY - car.y) * Math.min(1, 0.2 * step);

  // 傾き：前後の足場の高さ差から
  const backTop = grid.floorBelow(Math.floor(back / cell), feetRow) * cell;
  const targetAngle = Math.atan2(floorTop - backTop, run);
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
  car.y = grid.surfaceTopY(car.x) - car.h * 0.5;
}
