import { drawGrid, drawShip } from "./renderer";
import { soundFX } from "./sound";
import {
  CANVAS_H,
  CANVAS_W,
  GRID_SIZE,
  GridPoint,
  Particle,
  ShipColor,
  ShipShape,
  SnakeSession,
} from "./types";

const COLS = Math.floor(CANVAS_W / GRID_SIZE);
const ROWS = Math.floor(CANVAS_H / GRID_SIZE);

function randomFreeCell(occupied: GridPoint[]): GridPoint {
  for (let i = 0; i < 120; i++) {
    const col = 1 + Math.floor(Math.random() * (COLS - 2));
    const row = 1 + Math.floor(Math.random() * (ROWS - 2));
    const taken = occupied.some((seg) => seg.col === col && seg.row === row);
    if (!taken) return { col, row };
  }
  return { col: Math.floor(COLS / 2), row: Math.floor(ROWS / 2) };
}

export function createSnakeSession(): SnakeSession {
  const midRow = Math.floor(ROWS / 2);
  const startCol = 6;
  const segments: GridPoint[] = [
    { col: startCol, row: midRow },
    { col: startCol - 1, row: midRow },
    { col: startCol - 2, row: midRow },
  ];
  return {
    segments,
    dir: { dx: 1, dy: 0 },
    food: randomFreeCell(segments),
    stepTimer: 0,
    score: 0,
    combo: 1,
    comboTimer: 0,
    speedBoostTimer: 0,
    particles: [],
  };
}

function addSnakeBurst(session: SnakeSession, col: number, row: number, hex: string, count: number) {
  const cx = col * GRID_SIZE + GRID_SIZE / 2;
  const cy = row * GRID_SIZE + GRID_SIZE / 2;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 200;
    session.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 0,
      maxLife: 0.35 + Math.random() * 0.25,
      color: hex,
      size: 2.5 + Math.random() * 3,
    });
  }
}

export interface SnakeStepResult {
  died: boolean;
  score: number;
  combo: number;
}

export function updateSnakeSession(
  session: SnakeSession,
  dt: number,
  inputX: number,
  inputY: number,
  boostPressed: boolean,
  color: ShipColor,
  onCrash: () => void
): SnakeStepResult {
  const reqX = Math.abs(inputX) >= Math.abs(inputY) ? Math.sign(inputX) : 0;
  const reqY = Math.abs(inputY) > Math.abs(inputX) ? Math.sign(inputY) : 0;

  if (reqX !== 0 || reqY !== 0) {
    const notReverse = !(reqX === -session.dir.dx && reqY === -session.dir.dy);
    if (notReverse) {
      session.dir = { dx: reqX, dy: reqY };
    }
  }

  if (session.comboTimer > 0) {
    session.comboTimer = Math.max(0, session.comboTimer - dt);
    if (session.comboTimer === 0 && session.combo > 1) {
      session.combo = 1;
    }
  }

  if (session.speedBoostTimer > 0) {
    session.speedBoostTimer = Math.max(0, session.speedBoostTimer - dt);
  }

  if (boostPressed && session.speedBoostTimer <= 0) {
    session.speedBoostTimer = 0.22;
    soundFX.playDash();
    soundFX.vibrate(0.22, 0.08, 90);
  }

  const baseInterval = Math.max(0.068, 0.145 - session.score * 0.0022);
  const stepInterval = session.speedBoostTimer > 0 ? baseInterval * 0.55 : baseInterval;

  session.stepTimer += dt;
  while (session.stepTimer >= stepInterval) {
    session.stepTimer -= stepInterval;

    const head = session.segments[0];
    const nextCol = head.col + session.dir.dx;
    const nextRow = head.row + session.dir.dy;

    const hitWall = nextCol < 0 || nextCol >= COLS || nextRow < 0 || nextRow >= ROWS;
    const willEat = nextCol === session.food.col && nextRow === session.food.row;
    const bodyToCheck = willEat ? session.segments : session.segments.slice(0, -1);
    const hitSelf = bodyToCheck.some((seg) => seg.col === nextCol && seg.row === nextRow);

    if (hitWall || hitSelf) {
      addSnakeBurst(session, head.col, head.row, color.hex, 28);
      onCrash();
      return { died: true, score: session.score, combo: session.combo };
    }

    const newHead: GridPoint = { col: nextCol, row: nextRow };
    session.segments.unshift(newHead);

    if (willEat) {
      session.score += session.combo;
      session.combo = Math.min(8, session.combo + 1);
      session.comboTimer = 4.5;
      soundFX.playCollect(session.combo);
      soundFX.vibrate(0.15, 0.05, 70);
      addSnakeBurst(session, nextCol, nextRow, "#4ade80", 14);
      session.food = randomFreeCell(session.segments);
    } else {
      session.segments.pop();
    }
  }

  session.particles = session.particles.filter((p) => {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    return p.life < p.maxLife;
  });

  return { died: false, score: session.score, combo: session.combo };
}

export function drawSnakeScene(
  ctx: CanvasRenderingContext2D,
  session: SnakeSession,
  color: ShipColor,
  shape: ShipShape,
  nowMs: number
) {
  ctx.fillStyle = "#050811";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawGrid(ctx, CANVAS_W, CANVAS_H, GRID_SIZE);

  // Tehlikeli duvar sınırı
  ctx.save();
  ctx.shadowColor = "#fb7185";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "rgba(251, 113, 133, 0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, CANVAS_W - 3, CANVAS_H - 3);
  ctx.restore();

  // Yem
  const fx = session.food.col * GRID_SIZE + GRID_SIZE / 2;
  const fy = session.food.row * GRID_SIZE + GRID_SIZE / 2;
  const pulse = 9 + Math.sin(nowMs * 0.008) * 2;
  ctx.save();
  ctx.shadowColor = "#4ade80";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#4ade80";
  ctx.beginPath();
  ctx.arc(fx, fy, pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Kuyruk gövdesi
  for (let i = session.segments.length - 1; i >= 1; i--) {
    const seg = session.segments[i];
    const sx = seg.col * GRID_SIZE + GRID_SIZE / 2;
    const sy = seg.row * GRID_SIZE + GRID_SIZE / 2;
    const ratio = 1 - (i / Math.max(1, session.segments.length)) * 0.55;

    ctx.save();
    ctx.globalAlpha = Math.max(0.32, ratio);
    ctx.shadowColor = color.hex;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color.hex;
    ctx.beginPath();
    ctx.roundRect(sx - 13, sy - 13, 26, 26, 7);
    ctx.fill();
    ctx.restore();
  }

  // Yılan başı (seçili gemi gövdesi ile)
  const head = session.segments[0];
  const hx = head.col * GRID_SIZE + GRID_SIZE / 2;
  const hy = head.row * GRID_SIZE + GRID_SIZE / 2;
  const angle = Math.atan2(session.dir.dy, session.dir.dx);
  drawShip(ctx, hx, hy, angle, color, shape, 1.05);

  // Parçacıklar
  for (const p of session.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}