import {
  CANVAS_H,
  CANVAS_W,
  GRID_SIZE,
  LaserBeam,
  MoveMode,
  Orb,
  Particle,
  PlayerState,
  PowerUpItem,
  ShipColor,
  ShipShape,
} from "./types";

export function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, step = 40) {
  ctx.strokeStyle = "rgba(56, 189, 248, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawActiveCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  colorHex: string
) {
  const col = Math.max(
    0,
    Math.min(Math.floor(CANVAS_W / GRID_SIZE) - 1, Math.floor(px / GRID_SIZE))
  );
  const row = Math.max(
    0,
    Math.min(Math.floor(CANVAS_H / GRID_SIZE) - 1, Math.floor(py / GRID_SIZE))
  );
  const cellX = col * GRID_SIZE;
  const cellY = row * GRID_SIZE;

  ctx.save();
  ctx.fillStyle = "rgba(56, 189, 248, 0.08)";
  ctx.fillRect(cellX + 1, cellY + 1, GRID_SIZE - 2, GRID_SIZE - 2);

  ctx.strokeStyle = colorHex;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cellX + 2, cellY + 2, GRID_SIZE - 4, GRID_SIZE - 4);
  ctx.restore();
}

function drawArenaWalls(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.shadowColor = "#fb7185";
  ctx.shadowBlur = 12;
  ctx.strokeStyle = "rgba(251, 113, 133, 0.65)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, CANVAS_W - 3, CANVAS_H - 3);
  ctx.restore();
}

export function drawShip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: ShipColor,
  shape: ShipShape,
  scale = 1
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  ctx.shadowColor = color.hex;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = color.hex;
  ctx.fillStyle = "#060a14";
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  if (shape === "delta") {
    ctx.moveTo(18, 0);
    ctx.lineTo(-14, -12);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-14, 12);
    ctx.closePath();
  } else if (shape === "vanguard") {
    ctx.moveTo(20, 0);
    ctx.lineTo(-6, -15);
    ctx.lineTo(-15, -8);
    ctx.lineTo(-11, 0);
    ctx.lineTo(-15, 8);
    ctx.lineTo(-6, 15);
    ctx.closePath();
  } else {
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = color.hex;
  ctx.beginPath();
  ctx.arc(shape === "orb" ? 0 : 2, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  corePulse: number,
  beams: LaserBeam[],
  orb: Orb,
  powerUp: PowerUpItem | null,
  player: PlayerState,
  particles: Particle[],
  color: ShipColor,
  shape: ShipShape,
  moveMode: MoveMode,
  spawnShield: number,
  shakeX: number,
  shakeY: number
) {
  ctx.save();
  ctx.fillStyle = "#050811";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.translate(shakeX, shakeY);
  drawGrid(ctx, CANVAS_W, CANVAS_H, GRID_SIZE);

  if (moveMode === "grid") {
    drawActiveCell(ctx, player.targetX, player.targetY, color.hex);
    drawArenaWalls(ctx);
  }

  if (player.slowTimer > 0) {
    ctx.fillStyle = "rgba(168, 85, 247, 0.08)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  const beamColor = player.slowTimer > 0 ? "#c084fc" : "#fb7185";
  const beamGlow = player.slowTimer > 0 ? "#a855f7" : "#f43f5e";

  for (const b of beams) {
    const bx = center.x + Math.cos(b.angle) * b.length;
    const by = center.y + Math.sin(b.angle) * b.length;

    ctx.save();
    ctx.shadowColor = beamGlow;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = beamColor;
    ctx.lineWidth = b.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
  }

  const coreRadius = 15 + Math.sin(corePulse) * 2.5;
  ctx.save();
  ctx.shadowColor = beamGlow;
  ctx.shadowBlur = 20;
  ctx.fillStyle = player.slowTimer > 0 ? "#9333ea" : "#e11d48";
  ctx.beginPath();
  ctx.arc(center.x, center.y, coreRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const pulseR = orb.r + Math.sin(orb.pulse) * 2;
  ctx.save();
  ctx.shadowColor = "#facc15";
  ctx.shadowBlur = 15;
  ctx.fillStyle = "#fde047";
  ctx.beginPath();
  ctx.arc(orb.x, orb.y, pulseR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (powerUp) {
    const pColor = powerUp.type === "shield" ? "#22d3ee" : "#c084fc";
    const pr = powerUp.r + Math.sin(powerUp.pulse) * 2.5;
    ctx.save();
    ctx.shadowColor = pColor;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = pColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(powerUp.x, powerUp.y, pr, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = pColor;
    ctx.beginPath();
    ctx.arc(powerUp.x, powerUp.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (let i = 0; i < player.trail.length; i++) {
    const pt = player.trail[i];
    ctx.save();
    ctx.globalAlpha = ((i + 1) / player.trail.length) * 0.25;
    ctx.fillStyle = color.hex;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const dashRatio = 1 - player.dashCooldown / player.dashMaxCooldown;
  ctx.save();
  ctx.strokeStyle =
    dashRatio >= 1 ? "rgba(74, 222, 128, 0.55)" : "rgba(148, 163, 184, 0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(
    player.x,
    player.y,
    21,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, dashRatio))
  );
  ctx.stroke();
  ctx.restore();

  if (player.hasShield) {
    ctx.save();
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const blinkSkip = spawnShield > 0 && Math.floor(spawnShield * 16) % 2 === 0;
  if (!blinkSkip) {
    drawShip(ctx, player.x, player.y, player.angle, color, shape, 1);
  }

  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}