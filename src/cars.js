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
  const fx = { dust: [], sparks: [], goal: false, poof: false };
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

  // ブロックは重力で隙間なく地面に積もる（宙に浮かない）ので、
  // 各列の山の上面=surfaceTopY を見るだけで地面追従できる。
  const frontTop = grid.surfaceTopY(front);
  const backTop = grid.surfaceTopY(back);
  const surface = Math.min(frontTop, backTop); // 高い方の山に乗る
  const stepUp = feetY - frontTop;             // 前方の山が足元より何px高いか

  // --- 急な壁：詰まり / 特殊行動 ---
  if (stepUp > maxStep) {
    if (car.type === TYPE.GRINDER) {
      // グラインダー＝上を削る：山の天辺を少しずつ削って低くする
      const dust = grid.grindTop(front, CFG.GRIND_RATE);
      fx.dust.push(...dust);
      fx.sparks.push(...dust);
      if (dust.length) car.stuck = 0; else car.stuck += step;
      car.shake = Math.sin(car.stuck * 0.8) * 1.0;
      if (car.stuck > CFG.GIVE_UP_STUCK) { car.state = 'goal'; fx.poof = true; }
      return fx;
    }
    if (car.type === TYPE.TUNNEL) {
      // ドリル＝下を掘る：山の根元を掘ると上が崩れ落ちて全体が沈む
      const dust = grid.drillBottom(front, CFG.GRIND_RATE);
      fx.dust.push(...dust);
      if (dust.length) car.stuck = 0; else car.stuck += step;
      car.x += speed * 0.25;                  // ぐいぐい押し込む感じ
      car.shake = Math.sin(car.stuck * 0.7) * 0.8;
      if (car.stuck > CFG.GIVE_UP_STUCK) { car.state = 'goal'; fx.poof = true; }
      return fx;
    }
    // 普通車：止まってぷるぷる。長く詰まったら諦めてポンッと消える
    car.stuck += step;
    car.shake = Math.sin(car.stuck * 0.9) * 1.6;
    if (car.stuck > CFG.GIVE_UP_STUCK) { car.state = 'goal'; fx.poof = true; }
    return fx;
  }

  // --- 通常走行：山の上面に沿って進む ---
  car.stuck = 0;
  car.shake = 0;
  car.x += speed;

  const targetY = surface - car.h * 0.5;
  car.y += (targetY - car.y) * Math.min(1, 0.2 * step);

  const targetAngle = Math.atan2(frontTop - backTop, run); // 上り坂で前が上がる
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
