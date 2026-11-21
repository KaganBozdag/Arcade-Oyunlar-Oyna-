import { drawGrid, drawShip } from "./renderer";
import { soundFX } from "./sound";
import {
  CANVAS_H,
  CANVAS_W,
  Difficulty,
  GameId,
  GRID_SIZE,
  GridPoint,
  Particle,
  ShipColor,
  ShipShape,
} from "./types";
import { MiniGameController, MiniGameResult } from "./miniGames";

export interface TwoPlayerInput {
  p1x: number;
  p1y: number;
  p1Action: boolean;
  p2x: number;
  p2y: number;
  p2Action: boolean;
}

export interface TwoPlayerController {
  update: (dt: number, input: TwoPlayerInput) => MiniGameResult;
  draw: (ctx: CanvasRenderingContext2D, color: ShipColor, shape: ShipShape, nowMs: number) => void;
}

const COLS = Math.floor(CANVAS_W / GRID_SIZE);
const ROWS = Math.floor(CANVAS_H / GRID_SIZE);

function getDiffMult(diff: Difficulty): number {
  if (diff === "easy") return 0.85;
  if (diff === "hard") return 1.25;
  return 1;
}

function spawnBurst(particles: Particle[], x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 210;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 0,
      maxLife: 0.35 + Math.random() * 0.25,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

function tickParticles(particles: Particle[], dt: number): Particle[] {
  return particles.filter((p) => {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.95;
    p.vy *= 0.95;
    return p.life < p.maxLife;
  });
}

function renderParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/* ==================== 9. DUEL SNAKE 2P ==================== */
function createDuelSnakeGame(diff: Difficulty): TwoPlayerController {
  const mult = getDiffMult(diff);
  let s1: GridPoint[] = [
    { col: 5, row: 7 },
    { col: 4, row: 7 },
    { col: 3, row: 7 },
  ];
  let d1 = { dx: 1, dy: 0 };
  let score1 = 0;

  let s2: GridPoint[] = [
    { col: COLS - 6, row: ROWS - 8 },
    { col: COLS - 5, row: ROWS - 8 },
    { col: COLS - 4, row: ROWS - 8 },
  ];
  let d2 = { dx: -1, dy: 0 };
  let score2 = 0;

  const randCell = (): GridPoint => ({
    col: 1 + Math.floor(Math.random() * (COLS - 2)),
    row: 1 + Math.floor(Math.random() * (ROWS - 2)),
  });

  let food = randCell();
  let stepTimer = 0;
  let particles: Particle[] = [];

  return {
    update(dt, input) {
      const rx1 = Math.abs(input.p1x) >= Math.abs(input.p1y) ? Math.sign(input.p1x) : 0;
      const ry1 = Math.abs(input.p1y) > Math.abs(input.p1x) ? Math.sign(input.p1y) : 0;
      if ((rx1 !== 0 || ry1 !== 0) && !(rx1 === -d1.dx && ry1 === -d1.dy)) {
        d1 = { dx: rx1, dy: ry1 };
      }

      const rx2 = Math.abs(input.p2x) >= Math.abs(input.p2y) ? Math.sign(input.p2x) : 0;
      const ry2 = Math.abs(input.p2y) > Math.abs(input.p2x) ? Math.sign(input.p2y) : 0;
      if ((rx2 !== 0 || ry2 !== 0) && !(rx2 === -d2.dx && ry2 === -d2.dy)) {
        d2 = { dx: rx2, dy: ry2 };
      }

      const boost = input.p1Action || input.p2Action ? 1.45 : 1;
      const interval = Math.max(0.065, 0.13 / (mult * boost));
      stepTimer += dt;

      if (stepTimer >= interval) {
        stepTimer -= interval;

        const nh1: GridPoint = { col: s1[0].col + d1.dx, row: s1[0].row + d1.dy };
        const nh2: GridPoint = { col: s2[0].col + d2.dx, row: s2[0].row + d2.dy };

        const hitWall1 = nh1.col < 0 || nh1.col >= COLS || nh1.row < 0 || nh1.row >= ROWS;
        const hitWall2 = nh2.col < 0 || nh2.col >= COLS || nh2.row < 0 || nh2.row >= ROWS;

        const hitBody1 =
          s1.some((seg) => seg.col === nh1.col && seg.row === nh1.row) ||
          s2.some((seg) => seg.col === nh1.col && seg.row === nh1.row);
        const hitBody2 =
          s2.some((seg) => seg.col === nh2.col && seg.row === nh2.row) ||
          s1.some((seg) => seg.col === nh2.col && seg.row === nh2.row);

        if (hitWall1 || hitBody1 || hitWall2 || hitBody2) {
          soundFX.playCrash();
          soundFX.vibrate(0.9, 1.0, 300);
          if (hitWall1 || hitBody1) score2 += 3;
          if (hitWall2 || hitBody2) score1 += 3;
          return { over: true, score: Math.max(score1, score2), combo: 1 };
        }

        const eat1 = nh1.col === food.col && nh1.row === food.row;
        const eat2 = nh2.col === food.col && nh2.row === food.row;

        s1 = [nh1, ...s1];
        if (!eat1) s1.pop();
        else {
          score1 += 1;
          soundFX.playCollect(2);
          spawnBurst(particles, food.col * GRID_SIZE + 20, food.row * GRID_SIZE + 20, "#fde047", 14);
        }

        s2 = [nh2, ...s2];
        if (!eat2) s2.pop();
        else {
          score2 += 1;
          soundFX.playCollect(3);
          spawnBurst(particles, food.col * GRID_SIZE + 20, food.row * GRID_SIZE + 20, "#fde047", 14);
        }

        if (eat1 || eat2) {
          food = randCell();
        }
      }

      particles = tickParticles(particles, dt);
      return { over: false, score: Math.max(score1, score2), combo: 1 };
    },
    draw(ctx, color) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, GRID_SIZE);

      ctx.font = "800 18px system-ui, sans-serif";
      ctx.fillStyle = color.hex;
      ctx.textAlign = "left";
      ctx.fillText(`P1: ${score1}`, 18, 28);
      ctx.fillStyle = "#fb7185";
      ctx.textAlign = "right";
      ctx.fillText(`P2: ${score2}`, CANVAS_W - 18, 28);

      // Yem
      ctx.save();
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(food.col * GRID_SIZE + 20, food.row * GRID_SIZE + 20, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // P1 Yılan
      s1.forEach((seg, idx) => {
        ctx.fillStyle = idx === 0 ? "#e0f2fe" : color.hex;
        ctx.beginPath();
        ctx.roundRect(seg.col * GRID_SIZE + 4, seg.row * GRID_SIZE + 4, GRID_SIZE - 8, GRID_SIZE - 8, 7);
        ctx.fill();
      });

      // P2 Yılan
      s2.forEach((seg, idx) => {
        ctx.fillStyle = idx === 0 ? "#ffe4e6" : "#fb7185";
        ctx.beginPath();
        ctx.roundRect(seg.col * GRID_SIZE + 4, seg.row * GRID_SIZE + 4, GRID_SIZE - 8, GRID_SIZE - 8, 7);
        ctx.fill();
      });

      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 10. TANK DUEL 2P ==================== */
function createTankDuelGame(diff: Difficulty): TwoPlayerController {
  const mult = getDiffMult(diff);
  let t1x = 140;
  let t1y = CANVAS_H / 2;
  let t1a = 0;
  let cd1 = 0;
  let hp1 = 5;

  let t2x = CANVAS_W - 140;
  let t2y = CANVAS_H / 2;
  let t2a = Math.PI;
  let cd2 = 0;
  let hp2 = 5;

  interface Shell {
    x: number;
    y: number;
    vx: number;
    vy: number;
    owner: 1 | 2;
  }

  const shells: Shell[] = [];
  const walls = [
    { x: CANVAS_W / 2 - 22, y: 120, w: 44, h: 110 },
    { x: CANVAS_W / 2 - 22, y: CANVAS_H - 230, w: 44, h: 110 },
  ];
  let particles: Particle[] = [];

  const moveTank = (
    x: number,
    y: number,
    angle: number,
    ix: number,
    iy: number,
    dt: number
  ) => {
    let nextA = angle + ix * 3.4 * dt;
    const thrust = -iy;
    const spd = 250 * mult;
    let nx = x + Math.cos(nextA) * thrust * spd * dt;
    let ny = y + Math.sin(nextA) * thrust * spd * dt;
    nx = Math.max(24, Math.min(CANVAS_W - 24, nx));
    ny = Math.max(24, Math.min(CANVAS_H - 24, ny));
    for (const w of walls) {
      if (nx + 15 > w.x && nx - 15 < w.x + w.w && ny + 15 > w.y && ny - 15 < w.y + w.h) {
        nx = x;
        ny = y;
      }
    }
    return { x: nx, y: ny, angle: nextA };
  };

  return {
    update(dt, input) {
      if (cd1 > 0) cd1 = Math.max(0, cd1 - dt);
      if (cd2 > 0) cd2 = Math.max(0, cd2 - dt);

      const m1 = moveTank(t1x, t1y, t1a, input.p1x, input.p1y, dt);
      t1x = m1.x;
      t1y = m1.y;
      t1a = m1.angle;

      const m2 = moveTank(t2x, t2y, t2a, input.p2x, input.p2y, dt);
      t2x = m2.x;
      t2y = m2.y;
      t2a = m2.angle;

      if (input.p1Action && cd1 <= 0) {
        cd1 = 0.35;
        shells.push({
          x: t1x + Math.cos(t1a) * 20,
          y: t1y + Math.sin(t1a) * 20,
          vx: Math.cos(t1a) * 540 * mult,
          vy: Math.sin(t1a) * 540 * mult,
          owner: 1,
        });
        soundFX.playDash();
      }

      if (input.p2Action && cd2 <= 0) {
        cd2 = 0.35;
        shells.push({
          x: t2x + Math.cos(t2a) * 20,
          y: t2y + Math.sin(t2a) * 20,
          vx: Math.cos(t2a) * 540 * mult,
          vy: Math.sin(t2a) * 540 * mult,
          owner: 2,
        });
        soundFX.playDash();
      }

      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;

        if (s.x < 0 || s.x > CANVAS_W || s.y < 0 || s.y > CANVAS_H) {
          shells.splice(i, 1);
          continue;
        }

        const hitWall = walls.some(
          (w) => s.x > w.x && s.x < w.x + w.w && s.y > w.y && s.y < w.y + w.h
        );
        if (hitWall) {
          spawnBurst(particles, s.x, s.y, "#94a3b8", 8);
          shells.splice(i, 1);
          continue;
        }

        if (s.owner === 1 && Math.hypot(s.x - t2x, s.y - t2y) < 18) {
          hp2 -= 1;
          shells.splice(i, 1);
          soundFX.playCollect(3);
          soundFX.vibrate(0.4, 0.5, 160);
          spawnBurst(particles, t2x, t2y, "#fb7185", 20);
          if (hp2 <= 0) {
            soundFX.playCrash();
            return { over: true, score: 5, combo: 1 };
          }
        } else if (s.owner === 2 && Math.hypot(s.x - t1x, s.y - t1y) < 18) {
          hp1 -= 1;
          shells.splice(i, 1);
          soundFX.playCollect(3);
          soundFX.vibrate(0.4, 0.5, 160);
          spawnBurst(particles, t1x, t1y, "#38bdf8", 20);
          if (hp1 <= 0) {
            soundFX.playCrash();
            return { over: true, score: 5, combo: 1 };
          }
        }
      }

      particles = tickParticles(particles, dt);
      return { over: false, score: 5 - hp2, combo: 1 };
    },
    draw(ctx, color, shape) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      for (const w of walls) {
        ctx.fillStyle = "#1e293b";
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(w.x, w.y, w.w, w.h, 6);
        ctx.fill();
        ctx.stroke();
      }

      ctx.font = "800 18px system-ui, sans-serif";
      ctx.fillStyle = color.hex;
      ctx.textAlign = "left";
      ctx.fillText(`P1 Can: ${hp1}`, 18, 28);
      ctx.fillStyle = "#fb7185";
      ctx.textAlign = "right";
      ctx.fillText(`P2 Can: ${hp2}`, CANVAS_W - 18, 28);

      for (const s of shells) {
        ctx.fillStyle = s.owner === 1 ? "#fde047" : "#f472b6";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      drawShip(ctx, t1x, t1y, t1a, color, shape, 1);
      drawShip(ctx, t2x, t2y, t2a, { name: "P2", hex: "#fb7185" }, shape, 1);
      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 11. TURBO RACE 2P ==================== */
function createTurboRaceGame(diff: Difficulty): TwoPlayerController {
  const mult = getDiffMult(diff);
  const topLaneY = 175;
  const botLaneY = 385;

  let x1 = 130;
  let y1 = topLaneY;
  let d1 = 0;

  let x2 = 130;
  let y2 = botLaneY;
  let d2 = 0;

  let timer = 0;
  let score = 0;
  let spawnCd = 0.65;
  let particles: Particle[] = [];

  interface GateBlock {
    x: number;
    y: number;
    lane: 1 | 2;
  }

  const blocks: GateBlock[] = [];

  return {
    update(dt, input) {
      if (d1 > 0) d1 = Math.max(0, d1 - dt);
      if (d2 > 0) d2 = Math.max(0, d2 - dt);

      if (input.p1Action && d1 <= 0) {
        d1 = 0.16;
        soundFX.playDash();
      }
      if (input.p2Action && d2 <= 0) {
        d2 = 0.16;
        soundFX.playDash();
      }

      const spd1 = (d1 > 0 ? 520 : 300) * mult;
      const spd2 = (d2 > 0 ? 520 : 300) * mult;

      x1 = Math.max(40, Math.min(CANVAS_W - 50, x1 + input.p1x * spd1 * dt));
      y1 = Math.max(55, Math.min(CANVAS_H / 2 - 22, y1 + input.p1y * spd1 * dt));

      x2 = Math.max(40, Math.min(CANVAS_W - 50, x2 + input.p2x * spd2 * dt));
      y2 = Math.max(CANVAS_H / 2 + 22, Math.min(CANVAS_H - 55, y2 + input.p2y * spd2 * dt));

      const scrollSpd = (380 + score * 4) * mult;
      spawnCd -= dt;
      if (spawnCd <= 0) {
        blocks.push({
          x: CANVAS_W + 25,
          y: 65 + Math.random() * (CANVAS_H / 2 - 110),
          lane: 1,
        });
        blocks.push({
          x: CANVAS_W + 25,
          y: CANVAS_H / 2 + 45 + Math.random() * (CANVAS_H / 2 - 110),
          lane: 2,
        });
        spawnCd = Math.max(0.38, 0.72 / mult);
      }

      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        b.x -= scrollSpd * dt;
        if (b.x < -30) {
          blocks.splice(i, 1);
          continue;
        }

        if (b.lane === 1 && d1 <= 0 && Math.hypot(x1 - b.x, y1 - b.y) < 22) {
          soundFX.playCrash();
          soundFX.vibrate(0.9, 1.0, 300);
          return { over: true, score, combo: 1 };
        }
        if (b.lane === 2 && d2 <= 0 && Math.hypot(x2 - b.x, y2 - b.y) < 22) {
          soundFX.playCrash();
          soundFX.vibrate(0.9, 1.0, 300);
          return { over: true, score, combo: 1 };
        }
      }

      timer += dt;
      if (timer >= 0.3) {
        timer -= 0.3;
        score += 1;
      }

      particles = tickParticles(particles, dt);
      return { over: false, score, combo: 1 };
    },
    draw(ctx, color, shape) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      // Pist ayırıcı
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, CANVAS_H / 2);
      ctx.lineTo(CANVAS_W, CANVAS_H / 2);
      ctx.stroke();

      for (const b of blocks) {
        ctx.fillStyle = "#fb7185";
        ctx.beginPath();
        ctx.roundRect(b.x - 12, b.y - 12, 24, 24, 6);
        ctx.fill();
      }

      drawShip(ctx, x1, y1, 0, color, shape, 1);
      drawShip(ctx, x2, y2, 0, { name: "P2", hex: "#4ade80" }, shape, 1);
      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 12. CORE COLLECTOR 2P ==================== */
function createCoreCollectorGame(diff: Difficulty): TwoPlayerController {
  const mult = getDiffMult(diff);
  let x1 = 220;
  let y1 = CANVAS_H / 2;
  let d1 = 0;
  let cd1 = 0;
  let p1Pts = 0;

  let x2 = CANVAS_W - 220;
  let y2 = CANVAS_H / 2;
  let d2 = 0;
  let cd2 = 0;
  let p2Pts = 0;

  const randCore = () => ({
    x: 80 + Math.random() * (CANVAS_W - 160),
    y: 70 + Math.random() * (CANVAS_H - 140),
  });

  let core = randCore();
  let particles: Particle[] = [];

  return {
    update(dt, input) {
      if (d1 > 0) d1 = Math.max(0, d1 - dt);
      if (cd1 > 0) cd1 = Math.max(0, cd1 - dt);
      if (d2 > 0) d2 = Math.max(0, d2 - dt);
      if (cd2 > 0) cd2 = Math.max(0, cd2 - dt);

      if (input.p1Action && cd1 <= 0) {
        d1 = 0.15;
        cd1 = 0.85;
        soundFX.playDash();
      }
      if (input.p2Action && cd2 <= 0) {
        d2 = 0.15;
        cd2 = 0.85;
        soundFX.playDash();
      }

      const spd1 = (d1 > 0 ? 740 : 340) * mult;
      const spd2 = (d2 > 0 ? 740 : 340) * mult;

      x1 = Math.max(24, Math.min(CANVAS_W - 24, x1 + input.p1x * spd1 * dt));
      y1 = Math.max(24, Math.min(CANVAS_H - 24, y1 + input.p1y * spd1 * dt));

      x2 = Math.max(24, Math.min(CANVAS_W - 24, x2 + input.p2x * spd2 * dt));
      y2 = Math.max(24, Math.min(CANVAS_H - 24, y2 + input.p2y * spd2 * dt));

      if (Math.hypot(x1 - core.x, y1 - core.y) < 22) {
        p1Pts += 1;
        soundFX.playCollect(p1Pts);
        soundFX.vibrate(0.2, 0.08, 70);
        spawnBurst(particles, core.x, core.y, "#fde047", 16);
        core = randCore();
      } else if (Math.hypot(x2 - core.x, y2 - core.y) < 22) {
        p2Pts += 1;
        soundFX.playCollect(p2Pts);
        soundFX.vibrate(0.2, 0.08, 70);
        spawnBurst(particles, core.x, core.y, "#fde047", 16);
        core = randCore();
      }

      if (p1Pts >= 10 || p2Pts >= 10) {
        soundFX.playPowerUp();
        return { over: true, score: Math.max(p1Pts, p2Pts), combo: 1 };
      }

      particles = tickParticles(particles, dt);
      return { over: false, score: Math.max(p1Pts, p2Pts), combo: 1 };
    },
    draw(ctx, color, shape) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      ctx.font = "800 18px system-ui, sans-serif";
      ctx.fillStyle = color.hex;
      ctx.textAlign = "left";
      ctx.fillText(`P1: ${p1Pts}/10`, 18, 28);
      ctx.fillStyle = "#c084fc";
      ctx.textAlign = "right";
      ctx.fillText(`P2: ${p2Pts}/10`, CANVAS_W - 18, 28);

      ctx.save();
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 16;
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(core.x, core.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      drawShip(ctx, x1, y1, 0, color, shape, 1);
      drawShip(ctx, x2, y2, Math.PI, { name: "P2", hex: "#c084fc" }, shape, 1);
      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 13. NEON HOCKEY 2P ==================== */
function createNeonHockeyGame(diff: Difficulty): TwoPlayerController {
  const mult = getDiffMult(diff);
  let m1x = 160;
  let m1y = CANVAS_H / 2;
  let m2x = CANVAS_W - 160;
  let m2y = CANVAS_H / 2;

  let px = CANVAS_W / 2;
  let py = CANVAS_H / 2;
  let pvx = 300 * mult;
  let pvy = 160 * mult;

  let s1 = 0;
  let s2 = 0;
  let particles: Particle[] = [];

  const resetPuck = (dir: number) => {
    px = CANVAS_W / 2;
    py = CANVAS_H / 2;
    pvx = 310 * mult * dir;
    pvy = (Math.random() * 2 - 1) * 210 * mult;
  };

  return {
    update(dt, input) {
      const spd1 = input.p1Action ? 620 : 440;
      const spd2 = input.p2Action ? 620 : 440;

      m1x = Math.max(30, Math.min(CANVAS_W / 2 - 26, m1x + input.p1x * spd1 * dt));
      m1y = Math.max(30, Math.min(CANVAS_H - 30, m1y + input.p1y * spd1 * dt));

      m2x = Math.max(CANVAS_W / 2 + 26, Math.min(CANVAS_W - 30, m2x + input.p2x * spd2 * dt));
      m2y = Math.max(30, Math.min(CANVAS_H - 30, m2y + input.p2y * spd2 * dt));

      px += pvx * dt;
      py += pvy * dt;

      if (py < 14) {
        py = 14;
        pvy = Math.abs(pvy);
      } else if (py > CANVAS_H - 14) {
        py = CANVAS_H - 14;
        pvy = -Math.abs(pvy);
      }

      const hitMallet = (mx: number, my: number) => {
        const dx = px - mx;
        const dy = py - my;
        const dist = Math.hypot(dx, dy);
        if (dist < 32 && dist > 0.001) {
          const nx = dx / dist;
          const ny = dy / dist;
          const mag = Math.min(820, Math.hypot(pvx, pvy) * 1.08);
          pvx = nx * mag;
          pvy = ny * mag;
          px = mx + nx * 34;
          py = my + ny * 34;
          soundFX.playDash();
          soundFX.vibrate(0.2, 0.08, 65);
          spawnBurst(particles, px, py, "#38bdf8", 12);
        }
      };

      hitMallet(m1x, m1y);
      hitMallet(m2x, m2y);

      const inGoalY = Math.abs(py - CANVAS_H / 2) < 95;
      if (px < 12) {
        if (inGoalY) {
          s2 += 1;
          soundFX.playCollect(3);
          if (s2 >= 7) return { over: true, score: Math.max(s1, s2), combo: 1 };
          resetPuck(1);
        } else {
          px = 12;
          pvx = Math.abs(pvx);
        }
      } else if (px > CANVAS_W - 12) {
        if (inGoalY) {
          s1 += 1;
          soundFX.playCollect(3);
          if (s1 >= 7) return { over: true, score: Math.max(s1, s2), combo: 1 };
          resetPuck(-1);
        } else {
          px = CANVAS_W - 12;
          pvx = -Math.abs(pvx);
        }
      }

      particles = tickParticles(particles, dt);
      return { over: false, score: Math.max(s1, s2), combo: 1 };
    },
    draw(ctx, color) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      // Orta çizgi ve kaleler
      ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CANVAS_W / 2, 0);
      ctx.lineTo(CANVAS_W / 2, CANVAS_H);
      ctx.stroke();

      ctx.strokeStyle = color.hex;
      ctx.lineWidth = 4;
      ctx.strokeRect(4, CANVAS_H / 2 - 95, 10, 190);
      ctx.strokeStyle = "#fb7185";
      ctx.strokeRect(CANVAS_W - 14, CANVAS_H / 2 - 95, 10, 190);

      ctx.font = "800 38px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(56, 189, 248, 0.4)";
      ctx.fillText(String(s1), CANVAS_W / 2 - 60, 56);
      ctx.fillStyle = "rgba(251, 113, 133, 0.4)";
      ctx.fillText(String(s2), CANVAS_W / 2 + 60, 56);

      // Disk
      ctx.save();
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Tokmaklar
      ctx.fillStyle = color.hex;
      ctx.beginPath();
      ctx.arc(m1x, m1y, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fb7185";
      ctx.beginPath();
      ctx.arc(m2x, m2y, 20, 0, Math.PI * 2);
      ctx.fill();

      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 14. LASER TAG 2P ==================== */
function createLaserTag2PGame(diff: Difficulty): TwoPlayerController {
  const mult = getDiffMult(diff);
  let x1 = 160;
  let y1 = CANVAS_H / 2;
  let a1 = 0;
  let d1 = 0;
  let cd1 = 0;
  let fire1 = 0;
  let score1 = 0;

  let x2 = CANVAS_W - 160;
  let y2 = CANVAS_H / 2;
  let a2 = Math.PI;
  let d2 = 0;
  let cd2 = 0;
  let fire2 = 0;
  let score2 = 0;

  interface BeamShot {
    x: number;
    y: number;
    vx: number;
    vy: number;
    from: 1 | 2;
  }

  const shots: BeamShot[] = [];
  let particles: Particle[] = [];

  return {
    update(dt, input) {
      if (d1 > 0) d1 = Math.max(0, d1 - dt);
      if (cd1 > 0) cd1 = Math.max(0, cd1 - dt);
      if (fire1 > 0) fire1 = Math.max(0, fire1 - dt);

      if (d2 > 0) d2 = Math.max(0, d2 - dt);
      if (cd2 > 0) cd2 = Math.max(0, cd2 - dt);
      if (fire2 > 0) fire2 = Math.max(0, fire2 - dt);

      if (Math.hypot(input.p1x, input.p1y) > 0.1) {
        a1 = Math.atan2(input.p1y, input.p1x);
      }
      if (Math.hypot(input.p2x, input.p2y) > 0.1) {
        a2 = Math.atan2(input.p2y, input.p2x);
      }

      if (input.p1Action && cd1 <= 0) {
        d1 = 0.14;
        cd1 = 0.7;
        soundFX.playDash();
      }
      if (input.p2Action && cd2 <= 0) {
        d2 = 0.14;
        cd2 = 0.7;
        soundFX.playDash();
      }

      const spd1 = (d1 > 0 ? 780 : 340) * mult;
      const spd2 = (d2 > 0 ? 780 : 340) * mult;

      x1 = Math.max(24, Math.min(CANVAS_W - 24, x1 + input.p1x * spd1 * dt));
      y1 = Math.max(24, Math.min(CANVAS_H - 24, y1 + input.p1y * spd1 * dt));

      x2 = Math.max(24, Math.min(CANVAS_W - 24, x2 + input.p2x * spd2 * dt));
      y2 = Math.max(24, Math.min(CANVAS_H - 24, y2 + input.p2y * spd2 * dt));

      if (fire1 <= 0) {
        fire1 = 0.42 / mult;
        shots.push({
          x: x1 + Math.cos(a1) * 18,
          y: y1 + Math.sin(a1) * 18,
          vx: Math.cos(a1) * 620 * mult,
          vy: Math.sin(a1) * 620 * mult,
          from: 1,
        });
      }

      if (fire2 <= 0) {
        fire2 = 0.42 / mult;
        shots.push({
          x: x2 + Math.cos(a2) * 18,
          y: y2 + Math.sin(a2) * 18,
          vx: Math.cos(a2) * 620 * mult,
          vy: Math.sin(a2) * 620 * mult,
          from: 2,
        });
      }

      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;

        if (s.x < 0 || s.x > CANVAS_W || s.y < 0 || s.y > CANVAS_H) {
          shots.splice(i, 1);
          continue;
        }

        if (s.from === 1 && d2 <= 0 && Math.hypot(s.x - x2, s.y - y2) < 18) {
          score1 += 1;
          shots.splice(i, 1);
          soundFX.playCollect(score1);
          soundFX.vibrate(0.35, 0.45, 140);
          spawnBurst(particles, x2, y2, "#fb7185", 18);
          x2 = CANVAS_W - 120;
          y2 = 90 + Math.random() * (CANVAS_H - 180);
        } else if (s.from === 2 && d1 <= 0 && Math.hypot(s.x - x1, s.y - y1) < 18) {
          score2 += 1;
          shots.splice(i, 1);
          soundFX.playCollect(score2);
          soundFX.vibrate(0.35, 0.45, 140);
          spawnBurst(particles, x1, y1, "#38bdf8", 18);
          x1 = 120;
          y1 = 90 + Math.random() * (CANVAS_H - 180);
        }
      }

      if (score1 >= 5 || score2 >= 5) {
        soundFX.playPowerUp();
        return { over: true, score: Math.max(score1, score2), combo: 1 };
      }

      particles = tickParticles(particles, dt);
      return { over: false, score: Math.max(score1, score2), combo: 1 };
    },
    draw(ctx, color, shape) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      ctx.font = "800 18px system-ui, sans-serif";
      ctx.fillStyle = color.hex;
      ctx.textAlign = "left";
      ctx.fillText(`P1: ${score1}/5`, 18, 28);
      ctx.fillStyle = "#fb7185";
      ctx.textAlign = "right";
      ctx.fillText(`P2: ${score2}/5`, CANVAS_W - 18, 28);

      for (const s of shots) {
        ctx.fillStyle = s.from === 1 ? "#38bdf8" : "#fb7185";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      drawShip(ctx, x1, y1, a1, color, shape, 1);
      drawShip(ctx, x2, y2, a2, { name: "P2", hex: "#fb7185" }, shape, 1);
      renderParticles(ctx, particles);
    },
  };
}

export function isTwoPlayerGameId(id: GameId): boolean {
  return (
    id === "duel_snake" ||
    id === "tank_duel" ||
    id === "turbo_race" ||
    id === "core_collector" ||
    id === "neon_hockey" ||
    id === "laser_tag_2p"
  );
}

export function createTwoPlayerGame(id: GameId, diff: Difficulty): TwoPlayerController {
  switch (id) {
    case "duel_snake":
      return createDuelSnakeGame(diff);
    case "tank_duel":
      return createTankDuelGame(diff);
    case "turbo_race":
      return createTurboRaceGame(diff);
    case "core_collector":
      return createCoreCollectorGame(diff);
    case "neon_hockey":
      return createNeonHockeyGame(diff);
    case "laser_tag_2p":
    default:
      return createLaserTag2PGame(diff);
  }
}