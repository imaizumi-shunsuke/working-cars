// =====================================================================
// config.js  —  調整用の定数とカラートークン（4.1）を集約
// すべてのモジュールはここを参照する。実機で触って気持ちよく調整する。
// =====================================================================

// --- カラートークン（CLAUDE.md 4.1 をそのまま使う / 案A クレヨン絵本）---
export const COLORS = {
  paper:     '#fbf3e2', // 背景（紙）base
  sky:       '#cfeafa', // 空
  hillBack:  '#c3e6a8', // 丘 奥
  hillFront: '#a9d98c', // 丘 手前
  ground:    '#e9c98f', // 地面
  grass:     '#9ed16f', // 草

  // 車（3色ローテ）
  cars: ['#f4a3a3', '#97c4ef', '#ffd887'],
  // 工場車両
  factory: '#f4b95e',
  // 障害物ブロック（4色ローテ）
  obstacles: ['#c7a2e0', '#f3b4cf', '#bcd98e', '#9fd6e6'],

  tire: '#5a4029',   // タイヤ
  hub:  '#f5e7cf',   // ホイール芯
  ink:  '#6b4f34',   // 線・顔のインク

  cheek:  '#ff9bb0', // 頬の赤み
  window: '#eaf7ff', // 車の窓

  // 全消去ボタン（4.4）
  btnBg:     '#fffaf0',
  btnBorder: '#6b4f34',
  btnText:   '#6b4f34',

  white: '#ffffff',
  dust:  '#efe2c4', // 削り砂ぼこり
  spark: '#fff4c2', // キラキラ
};

// --- 調整パラメータ（CLAUDE.md 11 の目安）---
export const CFG = {
  CELL: 14,            // セルの大きさ(px)
  GRAVITY: 8,          // 落下速度(px/frame)
  BRUSH_RADIUS: 2,     // 描画ブラシ半径(セル数)
  CAR_SPEED: 1.2,      // 車の速度(px/frame)
  MAX_CLIMB_STEP: 2,   // 乗り越えられる段差 = CELL * この値
  SPAWN_INTERVAL: 1500,// 車のスポーン間隔(ms)
  FACTORY_RATIO: 0.25, // 工場車両の出現割合
  GRIND_RATE: 2,       // 1フレームで削るセル数
  MAX_CARS: 24,        // 同時に走る車の上限
  RADIUS: 7,           // 角丸半径(px) ≒ 7（やわらかく）

  // 描画・質感
  OUTLINE_W: 2.8,      // 輪郭線の太さ（約2.5〜3px）
  JITTER: 0.9,         // クレヨンのゆらぎ(±px)
  PAPER_NOISE_ALPHA: 0.08, // 紙ノイズの不透明度(6〜10%)
};

// 1フレームを 60fps 基準にしたときの想定 dt(ms)
export const FRAME_MS = 1000 / 60;
