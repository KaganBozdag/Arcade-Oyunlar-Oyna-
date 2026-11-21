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
import { MiniGameResult } from "./miniGames";

export interface PadAxisInput {
  x: number;
  y: number;
  action: boolean;
}

export interface FourPlayerInput {
  p1: PadAxisInput;
  p2: PadAxisInput;
  p3: PadAxisInput;
  p4: PadAxisInput;
}

export interface FourPlayerController {
  update: (dt: number, input: FourPlayerInput) => MiniGameResult;
  draw: (ctx: CanvasRenderingContext2D, color: ShipColor, shape: ShipShape, nowMs: number) => void;
}

const COLS = Math.floor(CANVAS_W / GRID_SIZE);
const ROWS = Math.floor(CANVAS_H / GRID_SIZE);
const P_COLORS = ["#38bdf8", "#fb7185", "#4ade80", "#c084fc"];

function getDiffMult(diff: Difficulty): number {
  if (diff === "easy") return 0.85;
  if (diff === "hard") return 1.25;
  return 1;
}

function spawnBurst(particles: Particle[], x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 200;
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

/* ==================== 15. ARENA ROYALE 4P ==================== */
function createArenaRoyale4P(diff: Difficulty): FourPlayerController {
  const mult = getDiffMult(diff);
  const players = [
    { x: 140, y: 120, angle: 0, score: 0, dash: 0, cd: 0 },
    { x: CANVAS_W - 140, y: 120, angle: Math.PI, score: 0, dash: 0, cd: 0 },
    { x: 140, y: CANVAS_H - 120, angle: 0, score: 0, dash: 0, cd: 0 },
    { x: CANVAS_W - 140, y: CANVAS_H - 120, angle: Math.PI, score: 0, dash: 0, cd: 0 },
  ];

  const randGem = () => ({
    x: 90 + Math.random() * (CANVAS_W - 180),
    y: 70 + Math.random() * (CANVAS_H - 140),
  });

  let gem = randGem();
  let particles: Particle[] = [];

  return {
    update(dt, input) {
      const inputs = [input.p1, input.p2, input.p3, input.p4];
      for (let i = 0; i < 4; i++) {
        const p = players[i];
        const inp = inputs[i];
        if (p.dash > 0) p.dash = Math.max(0, p.dash - dt);
        if (p.cd > 0) p.cd = Math.max(0, p.cd - dt);

        if (inp.action && p.cd <= 0) {
          p.dash = 0.14;
          p.cd = 0.85;
          soundFX.playDash();
        }

        const spd = (p.dash > 0 ? 680 : 320) * mult;
        p.x = Math.max(24, Math.min(CANVAS_W - 24, p.x + inp.x * spd * dt));
        p.y = Math.max(24, Math.min(CANVAS_H - 24, p.y + inp.y * spd * dt));
        if (Math.hypot(inp.x, inp.y) > 0.1) {
          p.angle = Math.atan2(inp.y, inp.x);
        }

        if (Math.hypot(p.x - gem.x, p.y - gem.y) < 22) {
          p.score += 1;
          soundFX.playCollect(p.score);
          soundFX.vibrate(0.2, 0.08, 65);
          spawnBurst(particles, gem.x, gem.y, "#fde047", 15);
          gem = randGem();
          if (p.score >= 12) {
            soundFX.playPowerUp();
            return { over: true, score: p.score, combo: 1 };
          }
        }
      }

      particles = tickParticles(particles, dt);
      const topScore = Math.max(...players.map((p) => p.score));
      return { over: false, score: topScore, combo: 1 };
    },
    draw(ctx, color, shape) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      ctx.font = "800 16px system-ui, sans-serif";
      ctx.textAlign = "left";
      players.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? color.hex : P_COLORS[i];
        ctx.fillText(`P${i + 1}: ${p.score}/12`, 18 + i * 115, 26);
      });

      ctx.save();
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 16;
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(gem.x, gem.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      players.forEach((p, i) => {
        const c = i === 0 ? color : { name: `P${i + 1}`, hex: P_COLORS[i] };
        drawShip(ctx, p.x, p.y, p.angle, c, shape, 0.95);
      });

      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 16. QUAD PONG 4P ==================== */
function createQuadPong4P(diff: Difficulty): FourPlayerController {
  const mult = getDiffMult(diff);
  const padLen = 92;
  const padThick = 12;

  let leftY = CANVAS_H / 2;
  let rightY = CANVAS_H / 2;
  let topX = CANVAS_W / 2;
  let botX = CANVAS_W / 2;

  let bx = CANVAS_W / 2;
  let by = CANVAS_H / 2;
  let bvx = 290 * mult;
  let bvy = 180 * mult;

  let rallyScore = 0;
  let particles: Particle[] = [];

  const resetBall = () => {
    bx = CANVAS_W / 2;
    by = CANVAS_H / 2;
    const ang = (Math.random() - 0.5) * Math.PI * 0.7;
    const dir = Math.random() < 0.5 ? 1 : -1;
    bvx = Math.cos(ang) * 300 * mult * dir;
    bvy = Math.sin(ang) * 300 * mult;
  };

  return {
    update(dt, input) {
      const spd = 480;
      leftY = Math.max(padLen / 2 + 12, Math.min(CANVAS_H - padLen / 2 - 12, leftY + input.p1.y * spd * dt));
      rightY = Math.max(padLen / 2 + 12, Math.min(CANVAS_H - padLen / 2 - 12, rightY + input.p2.y * spd * dt));
      topX = Math.max(padLen / 2 + 12, Math.min(CANVAS_W - padLen / 2 - 12, topX + input.p3.x * spd * dt));
      botX = Math.max(padLen / 2 + 12, Math.min(CANVAS_W - padLen / 2 - 12, botX + input.p4.x * spd * dt));

      bx += bvx * dt;
      by += bvy * dt;

      // Sol raket (P1)
      if (bvx < 0 && bx - 8 <= 36 + padThick / 2 && Math.abs(by - leftY) <= padLen / 2 + 8) {
        bvx = Math.min(720, Math.abs(bvx) * 1.05);
        bvy += ((by - leftY) / (padLen / 2)) * 220;
        rallyScore += 1;
        soundFX.playCollect(2);
        spawnBurst(particles, bx, by, "#38bdf8", 10);
      }

      // Sağ raket (P2)
      if (bvx > 0 && bx + 8 >= CANVAS_W - 36 - padThick / 2 && Math.abs(by - rightY) <= padLen / 2 + 8) {
        bvx = -Math.min(720, Math.abs(bvx) * 1.05);
        bvy += ((by - rightY) / (padLen / 2)) * 220;
        rallyScore += 1;
        soundFX.playCollect(2);
        spawnBurst(particles, bx, by, "#fb7185", 10);
      }

      // Üst raket (P3)
      if (bvy < 0 && by - 8 <= 36 + padThick / 2 && Math.abs(bx - topX) <= padLen / 2 + 8) {
        bvy = Math.min(720, Math.abs(bvy) * 1.05);
        bvx += ((bx - topX) / (padLen / 2)) * 220;
        rallyScore += 1;
        soundFX.playCollect(2);
        spawnBurst(particles, bx, by, "#4ade80", 10);
      }

      // Alt raket (P4)
      if (bvy > 0 && by + 8 >= CANVAS_H - 36 - padThick / 2 && Math.abs(bx - botX) <= padLen / 2 + 8) {
        bvy = -Math.min(720, Math.abs(bvy) * 1.05);
        bvx += ((bx - botX) / (padLen / 2)) * 220;
        rallyScore += 1;
        soundFX.playCollect(2);
        spawnBurst(particles, bx, by, "#c084fc", 10);
      }

      if (bx < 0 || bx > CANVAS_W || by < 0 || by > CANVAS_H) {
        soundFX.playShieldBreak();
        soundFX.vibrate(0.6, 0.7, 200);
        if (rallyScore >= 15) {
          return { over: true, score: rallyScore, combo: 1 };
        }
        rallyScore = Math.max(0, rallyScore - 2);
        resetBall();
      }

      particles = tickParticles(particles, dt);
      return { over: false, score: rallyScore, combo: 1 };
    },
    draw(ctx, color) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      // Sol (P1)
      ctx.fillStyle = color.hex;
      ctx.fillRect(36 - padThick / 2, leftY - padLen / 2, padThick, padLen);
      // Sağ (P2)
      ctx.fillStyle = "#fb7185";
      ctx.fillRect(CANVAS_W - 36 - padThick / 2, rightY - padLen / 2, padThick, padLen);
      // Üst (P3)
      ctx.fillStyle = "#4ade80";
      ctx.fillRect(topX - padLen / 2, 36 - padThick / 2, padLen, padThick);
      // Alt (P4)
      ctx.fillStyle = "#c084fc";
      ctx.fillRect(botX - padLen / 2, CANVAS_H - 36 - padThick / 2, padLen, padThick);

      // Top
      ctx.save();
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(bx, by, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 17. SQUAD SNAKE 4P ==================== */
function createSquadSnake4P(diff: Difficulty): FourPlayerController {
  const mult = getDiffMult(diff);
  interface BotSnake {
    segs: GridPoint[];
    dir: { dx: number; dy: number };
    alive: boolean;
    score: number;
  }

  const snakes: BotSnake[] = [
    { segs: [{ col: 4, row: 4 }, { col: 3, row: 4 }], dir: { dx: 1, dy: 0 }, alive: true, score: 0 },
    { segs: [{ col: COLS - 5, row: 4 }, { col: COLS - 4, row: 4 }], dir: { dx: -1, dy: 0 }, alive: true, score: 0 },
    { segs: [{ col: 4, row: ROWS - 5 }, { col: 3, row: ROWS - 5 }], dir: { dx: 1, dy: 0 }, alive: true, score: 0 },
    { segs: [{ col: COLS - 5, row: ROWS - 5 }, { col: COLS - 4, row: ROWS - 5 }], dir: { dx: -1, dy: 0 }, alive: true, score: 0 },
  ];

  const randFood = (): GridPoint => ({
    col: 1 + Math.floor(Math.random() * (COLS - 2)),
    row: 1 + Math.floor(Math.random() * (ROWS - 2)),
  });

  let food = randFood();
  let stepTimer = 0;
  let particles: Particle[] = [];

  return {
    update(dt, input) {
      const inputs = [input.p1, input.p2, input.p3, input.p4];
      for (let i = 0; i < 4; i++) {
        const s = snakes[i];
        const inp = inputs[i];
        if (!s.alive) continue;
        const rx = Math.abs(inp.x) >= Math.abs(inp.y) ? Math.sign(inp.x) : 0;
        const ry = Math.abs(inp.y) > Math.abs(inp.x) ? Math.sign(inp.y) : 0;
        if ((rx !== 0 || ry !== 0) && !(rx === -s.dir.dx && ry === -s.dir.dy)) {
          s.dir = { dx: rx, dy: ry };
        }
      }

      const interval = Math.max(0.08, 0.15 / mult);
      stepTimer += dt;
      if (stepTimer >= interval) {
        stepTimer -= interval;

        const occupied = new Set<string>();
        for (const s of snakes) {
          if (!s.alive) continue;
          for (const seg of s.segs) occupied.add(`${seg.col},${seg.row}`);
        }

        for (const s of snakes) {
          if (!s.alive) continue;
          const nh: GridPoint = { col: s.segs[0].col + s.dir.dx, row: s.segs[0].row + s.dir.dy };
          const hitWall = nh.col < 0 || nh.col >= COLS || nh.row < 0 || nh.row >= ROWS;
          const hitBody = occupied.has(`${nh.col},${nh.row}`);

          if (hitWall || hitBody) {
            s.alive = false;
            soundFX.playCrash();
            spawnBurst(particles, s.segs[0].col * GRID_SIZE + 20, s.segs[0].row * GRID_SIZE + 20, "#fb7185", 16);
            continue;
          }

          const ate = nh.col === food.col && nh.row === food.row;
          s.segs = [nh, ...s.segs];
          if (!ate) {
            s.segs.pop();
          } else {
            s.score += 1;
            soundFX.playCollect(2);
            spawnBurst(particles, food.col * GRID_SIZE + 20, food.row * GRID_SIZE + 20, "#fde047", 12);
            food = randFood();
          }
        }

        const aliveCount = snakes.filter((s) => s.alive).length;
        if (aliveCount <= 1) {
          return { over: true, score: Math.max(...snakes.map((s) => s.score)), combo: 1 };
        }
      }

      particles = tickParticles(particles, dt);
      return { over: false, score: Math.max(...snakes.map((s) => s.score)), combo: 1 };
    },
    draw(ctx, color) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, GRID_SIZE);

      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(food.col * GRID_SIZE + 20, food.row * GRID_SIZE + 20, 9, 0, Math.PI * 2);
      ctx.fill();

      snakes.forEach((s, i) => {
        if (!s.alive) return;
        const hex = i === 0 ? color.hex : P_COLORS[i];
        s.segs.forEach((seg, idx) => {
          ctx.fillStyle = idx === 0 ? "#ffffff" : hex;
          ctx.beginPath();
          ctx.roundRect(seg.col * GRID_SIZE + 4, seg.row * GRID_SIZE + 4, GRID_SIZE - 8, GRID_SIZE - 8, 6);
          ctx.fill();
        });
      });

      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 18. BUMPER QUAD 4P ==================== */
function createBumperQuad4P(diff: Difficulty): FourPlayerController {
  const mult = getDiffMult(diff);
  const fighters = [
    { x: 260, y: 180, vx: 0, vy: 0, angle: 0, score: 0, dash: 0, cd: 0 },
    { x: CANVAS_W - 260, y: 180, vx: 0, vy: 0, angle: Math.PI, score: 0, dash: 0, cd: 0 },
    { x: 260, y: CANVAS_H - 180, vx: 0, vy: 0, angle: 0, score: 0, dash: 0, cd: 0 },
    { x: CANVAS_W - 260, y: CANVAS_H - 180, vx: 0, vy: 0, angle: Math.PI, score: 0, dash: 0, cd: 0 },
  ];

  let particles: Particle[] = [];

  return {
    update(dt, input) {
      const inputs = [input.p1, input.p2, input.p3, input.p4];
      for (let i = 0; i < 4; i++) {
        const f = fighters[i];
        const inp = inputs[i];
        if (f.dash > 0) f.dash = Math.max(0, f.dash - dt);
        if (f.cd > 0) f.cd = Math.max(0, f.cd - dt);

        if (inp.action && f.cd <= 0) {
          f.dash = 0.16;
          f.cd = 0.75;
          f.vx += inp.x * 460;
          f.vy += inp.y * 460;
          soundFX.playDash();
        }

        const acc = (f.dash > 0 ? 1400 : 880) * mult;
        f.vx += inp.x * acc * dt;
        f.vy += inp.y * acc * dt;
        f.vx *= 0.92;
        f.vy *= 0.92;

        f.x += f.vx * dt;
        f.y += f.vy * dt;

        if (f.x < 24) { f.x = 24; f.vx = Math.abs(f.vx) * 0.7; }
        if (f.x > CANVAS_W - 24) { f.x = CANVAS_W - 24; f.vx = -Math.abs(f.vx) * 0.7; }
        if (f.y < 24) { f.y = 24; f.vy = Math.abs(f.vy) * 0.7; }
        if (f.y > CANVAS_H - 24) { f.y = CANVAS_H - 24; f.vy = -Math.abs(f.vy) * 0.7; }

        if (Math.hypot(inp.x, inp.y) > 0.1) {
          f.angle = Math.atan2(inp.y, inp.x);
        }
      }

      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const a = fighters[i];
          const b = fighters[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 28 && dist > 0.001) {
            const nx = dx / dist;
            const ny = dy / dist;
            b.vx += nx * 320;
            b.vy += ny * 320;
            a.vx -= nx * 320;
            a.vy -= ny * 320;
            a.x -= nx * 3;
            a.y -= ny * 3;
            b.x += nx * 3;
            b.y += ny * 3;

            if (a.dash > 0) {
              a.score += 1;
              soundFX.playCollect(a.score);
              spawnBurst(particles, b.x, b.y, P_COLORS[i], 14);
            }
            if (b.dash > 0) {
              b.score += 1;
              soundFX.playCollect(b.score);
              spawnBurst(particles, a.x, a.y, P_COLORS[j], 14);
            }
            if (a.score >= 10 || b.score >= 10) {
              return { over: true, score: Math.max(a.score, b.score), combo: 1 };
            }
          }
        }
      }

      particles = tickParticles(particles, dt);
      return { over: false, score: Math.max(...fighters.map((f) => f.score)), combo: 1 };
    },
    draw(ctx, color, shape) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      ctx.font = "800 16px system-ui, sans-serif";
      ctx.textAlign = "left";
      fighters.forEach((f, i) => {
        ctx.fillStyle = i === 0 ? color.hex : P_COLORS[i];
        ctx.fillText(`P${i + 1}: ${f.score}/10`, 18 + i * 115, 26);
      });

      fighters.forEach((f, i) => {
        const c = i === 0 ? color : { name: `P${i + 1}`, hex: P_COLORS[i] };
        drawShip(ctx, f.x, f.y, f.angle, c, shape, 0.95);
      });

      renderParticles(ctx, particles);
    },
  };
}

export function isFourPlayerGameId(id: GameId): boolean {
  return (
    id === "arena_royale_4p" ||
    id === "quad_pong_4p" ||
    id === "squad_snake_4p" ||
    id === "bumper_quad_4p"
  );
}

export function createFourPlayerGame(id: GameId, diff: Difficulty): FourPlayerController {
  switch (id) {
    case "arena_royale_4p":
      return createArenaRoyale4P(diff);
    case "quad_pong_4p":
      return createQuadPong4P(diff);
    case "squad_snake_4p":
      return createSquadSnake4P(diff);
    case "bumper_quad_4p":
    default:
      return createBumperQuad4P(diff);
  }
}