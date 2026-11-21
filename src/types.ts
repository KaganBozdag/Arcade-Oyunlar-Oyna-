export type GameId =
  | "orbit"
  | "snake"
  | "pong"
  | "breakout"
  | "asteroids"
  | "invaders"
  | "runner"
  | "meteor"
  | "duel_snake"
  | "tank_duel"
  | "turbo_race"
  | "core_collector"
  | "neon_hockey"
  | "laser_tag_2p"
  | "arena_royale_4p"
  | "quad_pong_4p"
  | "squad_snake_4p"
  | "bumper_quad_4p";

export type PlayerTab = "1p" | "2p" | "4p";
export type Screen = "library" | "menu" | "hangar" | "game" | "gameover";
export type ShipShape = "delta" | "vanguard" | "orb";
export type PowerUpType = "shield" | "slow";
export type MoveMode = "free" | "grid";
export type Difficulty = "easy" | "normal" | "hard";
export type PongMode = "ai" | "2p";

export interface GameMeta {
  id: GameId;
  tag: string;
  title: string;
  desc: string;
  controls: string;
  tab: PlayerTab;
}

export interface ShipColor {
  name: string;
  hex: string;
}

export interface PlayerState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  angle: number;
  speed: number;
  radius: number;
  dashCooldown: number;
  dashMaxCooldown: number;
  dashTimer: number;
  moveCooldown: number;
  hasShield: boolean;
  slowTimer: number;
  trail: { x: number; y: number }[];
}

export interface Orb {
  x: number;
  y: number;
  r: number;
  pulse: number;
}

export interface PowerUpItem {
  x: number;
  y: number;
  r: number;
  type: PowerUpType;
  pulse: number;
  ttl: number;
}

export interface LaserBeam {
  angle: number;
  speed: number;
  length: number;
  width: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface GridPoint {
  col: number;
  row: number;
}

export interface SnakeSession {
  segments: GridPoint[];
  dir: { dx: number; dy: number };
  food: GridPoint;
  stepTimer: number;
  score: number;
  combo: number;
  comboTimer: number;
  speedBoostTimer: number;
  particles: Particle[];
}

export const CANVAS_W = 960;
export const CANVAS_H = 560;
export const GRID_SIZE = 40;

export const GAMES_CATALOG: GameMeta[] = [
  // 1 KİŞİLİK (8 OYUN)
  {
    id: "orbit",
    tag: "1 Kişilik • Dönen Lazer",
    title: "LASER DODGE: ORBIT",
    desc: "Çekirdek lazerlerinden kaç, güç küreleri kap; serbest veya karelerde hareket modunu seç.",
    controls: "Hareket: WASD/Analog • Atılma: Shift/X/RB/RT • Odak: LT",
    tab: "1p",
  },
  {
    id: "snake",
    tag: "1 Kişilik • Klasik Arcade",
    title: "NEON SNAKE",
    desc: "Karelerde sürekli ilerleyen yılanla yeşil yemleri topla, duvara ve kuyruğuna çarpmadan rekor kır.",
    controls: "Yön: WASD/D-Pad/Analog • Hızlan: Shift/X/RB/RT",
    tab: "1p",
  },
  {
    id: "pong",
    tag: "1 Kişilik / 2P • Masa Tenisi",
    title: "CYBER PONG",
    desc: "Hızlanan plazma topunu rakip kaleye gönder; 7 puana ilk ulaşan kazanır.",
    controls: "P1: W-S / 1. Kol • P2: Yukarı-Aşağı / 2. Kol • Hız: Shift/X/RT",
    tab: "1p",
  },
  {
    id: "breakout",
    tag: "1 Kişilik • Tuğla Kırma",
    title: "PRISM BREAKER",
    desc: "Neon enerji bloklarını parçala, topları düşürmeden tüm dalgaları temizle.",
    controls: "Sağ/Sol: A-D / Sol Analog • Hız: Shift/X/RT",
    tab: "1p",
  },
  {
    id: "asteroids",
    tag: "1 Kişilik • 360° Uzay",
    title: "ASTEROID BELT",
    desc: "360° dönen geminle dev asteroitleri lazerle parçala ve enkazdan sıyrıl.",
    controls: "Dön: A-D • İtki: W • Ateş: Space/Shift/A/X/RT",
    tab: "1p",
  },
  {
    id: "invaders",
    tag: "1 Kişilik • Dalga Savunması",
    title: "STAR DEFENDER",
    desc: "Üstten inen uzaylı filosunu lazer atışlarıyla durdur, ateşlerinden kaç.",
    controls: "Sağ/Sol: A-D / Analog • Ateş: Space/Shift/A/X/RT",
    tab: "1p",
  },
  {
    id: "runner",
    tag: "1 Kişilik • Sonsuz Koşu",
    title: "VOID RUNNER",
    desc: "Hızlanan siber hatta lazer bariyerlerin üzerinden zıpla, yüksek engellerin altından eğil.",
    controls: "Zıpla: W/Space/A • Eğil: S/Aşağı/B",
    tab: "1p",
  },
  {
    id: "meteor",
    tag: "1 Kişilik • Hayatta Kalma",
    title: "METEOR RAIN",
    desc: "Gökyüzünden yağan ateş meteorlarından kaçarken altın enerji çekirdeklerini topla.",
    controls: "Sağ/Sol: A-D / Analog • Atılma: Shift/X/RB/RT",
    tab: "1p",
  },

  // 2 KİŞİLİK (6 OYUN)
  {
    id: "duel_snake",
    tag: "2 Kişilik • Yılan Düellosu",
    title: "DUEL SNAKE 2P",
    desc: "İki yılan aynı arenada yem kapar; duvara, kendine veya rakibe çarpan kaybeder.",
    controls: "P1: WASD / 1. Kol • P2: Ok Tuşları / 2. Kol",
    tab: "2p",
  },
  {
    id: "tank_duel",
    tag: "2 Kişilik • Tank Kapışması",
    title: "TANK DUEL 2P",
    desc: "Siper blokları arasında dönüp nişan al ve rakibini 5 kez vurarak kazan.",
    controls: "P1: WASD + Shift/1.Kol • P2: Oklar + Enter/2.Kol",
    tab: "2p",
  },
  {
    id: "turbo_race",
    tag: "2 Kişilik • Siber Yarış",
    title: "TURBO RACE 2P",
    desc: "Hızlanan siber yolda engellerden sıyrıl; çarpmadan en yüksek puanı yapan kazanır.",
    controls: "P1: WASD + Shift/1.Kol • P2: Oklar + Enter/2.Kol",
    tab: "2p",
  },
  {
    id: "core_collector",
    tag: "2 Kişilik • Çekirdek Kapmaca",
    title: "CORE COLLECTOR 2P",
    desc: "Altın çekirdekleri rakibinden önce kap ve atılma ile avantaj sağla; 10 puana ilk ulaşan kazanır.",
    controls: "P1: WASD + Shift/1.Kol • P2: Oklar + Enter/2.Kol",
    tab: "2p",
  },
  {
    id: "neon_hockey",
    tag: "2 Kişilik • Hava Hokeyi",
    title: "NEON HOCKEY 2P",
    desc: "Hızlı neon diski rakip kaleye gönder; 7 gole ilk ulaşan maçı alır.",
    controls: "P1: WASD + Shift/1.Kol • P2: Oklar + Enter/2.Kol",
    tab: "2p",
  },
  {
    id: "laser_tag_2p",
    tag: "2 Kişilik • Lazer Arena",
    title: "LASER TAG 2P",
    desc: "Serbest arenada atılma ile lazerlerden kaç, rakibine isabet ettir; 5 isabete ulaşan kazanır.",
    controls: "P1: WASD + Shift/1.Kol • P2: Oklar + Enter/2.Kol",
    tab: "2p",
  },

  // 4 KİŞİLİK (4 OYUN)
  {
    id: "arena_royale_4p",
    tag: "4 Kişilik • Parti Arenası",
    title: "ARENA ROYALE 4P",
    desc: "4 oyuncu altın çekirdekleri kapmak için yarışır; 12 puana ulaşan şampiyon olur.",
    controls: "P1: WASD/Kol1 • P2: Oklar/Kol2 • P3: IJKL/Kol3 • P4: Numpad8456/Kol4",
    tab: "4p",
  },
  {
    id: "quad_pong_4p",
    tag: "4 Kişilik • 4 Yönlü Pong",
    title: "QUAD PONG 4P",
    desc: "Dört kenar raketiyle topu merkezde tut; yüksek ralli ve skor hedefiyle kapış.",
    controls: "P1 Sol: W-S • P2 Sağ: Yukarı-Aşağı • P3 Üst: J-L • P4 Alt: Numpad1-3",
    tab: "4p",
  },
  {
    id: "squad_snake_4p",
    tag: "4 Kişilik • 4 Yılan",
    title: "SQUAD SNAKE 4P",
    desc: "Dört yılan aynı ızgarada yem toplar; çarpışmalardan sıyrılıp en yüksek skoru yap.",
    controls: "P1: WASD • P2: Oklar • P3: IJKL • P4: Numpad8456 / Gamepadler",
    tab: "4p",
  },
  {
    id: "bumper_quad_4p",
    tag: "4 Kişilik • Çarpışma Arenası",
    title: "BUMPER QUAD 4P",
    desc: "Atılma (Dash) ile rakiplere çarpıp puan kap ve dönen merkez halkasından uzak dur.",
    controls: "P1: WASD+Shift • P2: Oklar+Enter • P3: IJKL+U • P4: Numpad8456+Numpad0",
    tab: "4p",
  },
];

export const SHIP_COLORS: ShipColor[] = [
  { name: "Siber Mavi", hex: "#38bdf8" },
  { name: "Neon Yeşil", hex: "#4ade80" },
  { name: "Plazma Mor", hex: "#c084fc" },
  { name: "Güneş Turuncu", hex: "#fb923c" },
];

export const STORAGE_KEYS = {
  bestMap: "arcade_hub_best_v4",
  colorIdx: "ldo_ship_color_v8",
  shape: "ldo_ship_shape_v8",
  moveMode: "ldo_move_mode_v8",
  difficulty: "arcade_hub_diff_v3",
  pongMode: "arcade_hub_pong_mode_v3",
};