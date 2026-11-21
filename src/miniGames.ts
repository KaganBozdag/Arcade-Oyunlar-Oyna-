import { drawGrid, drawShip } from "./renderer";
import { soundFX } from "./sound";
import {
  CANVAS_H,
  CANVAS_W,
  Difficulty,
  GameId,
  Particle,
  PongMode,
  ShipColor,
  ShipShape,
} from "./types";

export interface MiniGameInput {
  mx: number;
  my: number;
  p2y: number;
  action: boolean;
  upPressed: boolean;
  downHeld: boolean;
}

export interface MiniGameResult {
  over: boolean;
  score: number;
  combo: number;
}

export interface MiniGameController {
  update: (dt: number, input: MiniGameInput) => MiniGameResult;
  draw: (ctx: CanvasRenderingContext2D, color: ShipColor, shape: ShipShape, nowMs: number) => void;
}

export interface MiniGameOptions {
  difficulty: Difficulty;
  pongMode: PongMode;
}

function getDiffMult(diff: Difficulty): number {
  if (diff === "easy") return 0.82;
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

/* ==================== 3. CYBER PONG (1P AI & 2P YEREL) ==================== */
function createPongGame(opts: MiniGameOptions): MiniGameController {
  const mult = getDiffMult(opts.difficulty);
  const isTwoPlayer = opts.pongMode === "2p";

  let p1Y = CANVAS_H / 2;
  let p2Y = CANVAS_H / 2;
  const padW = 14;
  const padH = 96;
  let ballX = CANVAS_W / 2;
  let ballY = CANVAS_H / 2;
  let ballVx = 380 * mult;
  let ballVy = 190 * mult;
  let p1Score = 0;
  let p2Score = 0;
  let rally = 1;
  let particles: Particle[] = [];

  const resetBall = (dir: number) => {
    ballX = CANVAS_W / 2;
    ballY = CANVAS_H / 2;
    ballVx = 380 * mult * dir;
    ballVy = (Math.random() * 2 - 1) * 240 * mult;
    rally = 1;
  };

  return {
    update(dt, input) {
      const spd = input.action ? 630 : 460;
      p1Y += input.my * spd * dt;
      p1Y = Math.max(padH / 2 + 12, Math.min(CANVAS_H - padH / 2 - 12, p1Y));

      if (isTwoPlayer) {
        p2Y += input.p2y * spd * dt;
      } else {
        const aiTarget = ballVx > 0 ? ballY : CANVAS_H / 2;
        const aiDiff = aiTarget - p2Y;
        const aiMaxSpd = 320 * mult;
        p2Y += Math.sign(aiDiff) * Math.min(Math.abs(aiDiff), aiMaxSpd * dt);
      }
      p2Y = Math.max(padH / 2 + 12, Math.min(CANVAS_H - padH / 2 - 12, p2Y));

      ballX += ballVx * dt;
      ballY += ballVy * dt;

      if (ballY < 14) {
        ballY = 14;
        ballVy = Math.abs(ballVy);
      } else if (ballY > CANVAS_H - 14) {
        ballY = CANVAS_H - 14;
        ballVy = -Math.abs(ballVy);
      }

      if (
        ballVx < 0 &&
        ballX - 9 <= 38 + padW / 2 &&
        ballX + 9 >= 38 - padW / 2 &&
        Math.abs(ballY - p1Y) <= padH / 2 + 8
      ) {
        const offset = (ballY - p1Y) / (padH / 2);
        const boost = input.action ? 1.15 : 1.05;
        ballVx = Math.min(840, Math.abs(ballVx) * boost);
        ballVy = offset * 420;
        rally = Math.min(8, rally + 1);
        soundFX.playCollect(rally);
        soundFX.vibrate(0.2, 0.08, 70);
        spawnBurst(particles, ballX, ballY, "#38bdf8", 12);
      }

      if (
        ballVx > 0 &&
        ballX + 9 >= CANVAS_W - 38 - padW / 2 &&
        ballX - 9 <= CANVAS_W - 38 + padW / 2 &&
        Math.abs(ballY - p2Y) <= padH / 2 + 8
      ) {
        const offset = (ballY - p2Y) / (padH / 2);
        ballVx = -Math.min(840, Math.abs(ballVx) * 1.04);
        ballVy = offset * 400;
        soundFX.playDash();
        soundFX.vibrate(0.2, 0.08, 70);
        spawnBurst(particles, ballX, ballY, "#fb7185", 12);
      }

      if (ballX < 0) {
        p2Score += 1;
        soundFX.playShieldBreak();
        soundFX.vibrate(0.5, 0.6, 160);
        spawnBurst(particles, 24, ballY, "#fb7185", 22);
        if (p2Score >= 7) return { over: true, score: p1Score, combo: 1 };
        resetBall(1);
      } else if (ballX > CANVAS_W) {
        p1Score += 1;
        soundFX.playPowerUp();
        soundFX.vibrate(0.25, 0.1, 100);
        spawnBurst(particles, CANVAS_W - 24, ballY, "#4ade80", 22);
        if (p1Score >= 7) return { over: true, score: p1Score + 5, combo: rally };
        resetBall(-1);
      }

      particles = tickParticles(particles, dt);
      return { over: false, score: p1Score, combo: rally };
    },
    draw(ctx, color) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      ctx.save();
      ctx.setLineDash([10, 12]);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CANVAS_W / 2, 0);
      ctx.lineTo(CANVAS_W / 2, CANVAS_H);
      ctx.stroke();
      ctx.restore();

      ctx.font = "800 44px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
      ctx.fillText(String(p1Score), CANVAS_W / 2 - 70, 64);
      ctx.fillStyle = "rgba(251, 113, 133, 0.35)";
      ctx.fillText(String(p2Score), CANVAS_W / 2 + 70, 64);

      ctx.save();
      ctx.shadowColor = color.hex;
      ctx.shadowBlur = 14;
      ctx.fillStyle = color.hex;
      ctx.beginPath();
      ctx.roundRect(38 - padW / 2, p1Y - padH / 2, padW, padH, 7);
      ctx.fill();
      ctx.restore();

      const p2Hex = isTwoPlayer ? "#4ade80" : "#fb7185";
      ctx.save();
      ctx.shadowColor = p2Hex;
      ctx.shadowBlur = 14;
      ctx.fillStyle = p2Hex;
      ctx.beginPath();
      ctx.roundRect(CANVAS_W - 38 - padW / 2, p2Y - padH / 2, padW, padH, 7);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 16;
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(ballX, ballY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 4. PRISM BREAKER ==================== */
function createBreakoutGame(opts: MiniGameOptions): MiniGameController {
  const mult = getDiffMult(opts.difficulty);
  let paddleX = CANVAS_W / 2;
  const paddleY = CANVAS_H - 36;
  const paddleW = opts.difficulty === "easy" ? 148 : opts.difficulty === "hard" ? 108 : 128;
  const paddleH = 14;
  let ballX = CANVAS_W / 2;
  let ballY = paddleY - 18;
  let ballVx = 270 * mult;
  let ballVy = -340 * mult;
  let lives = opts.difficulty === "easy" ? 4 : 3;
  let score = 0;
  let combo = 1;
  let particles: Particle[] = [];

  interface Brick {
    x: number;
    y: number;
    w: number;
    h: number;
    hp: number;
    color: string;
  }

  const rowColors = ["#fb7185", "#fb923c", "#fde047", "#4ade80", "#38bdf8"];
  let bricks: Brick[] = [];

  const buildBricks = () => {
    bricks = [];
    const cols = 10;
    const rows = 5;
    const gap = 8;
    const marginX = 48;
    const bw = (CANVAS_W - marginX * 2 - gap * (cols - 1)) / cols;
    const bh = 22;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        bricks.push({
          x: marginX + c * (bw + gap),
          y: 58 + r * (bh + gap),
          w: bw,
          h: bh,
          hp: r === 0 ? 2 : 1,
          color: rowColors[r % rowColors.length],
        });
      }
    }
  };

  buildBricks();

  return {
    update(dt, input) {
      const spd = input.action ? 720 : 510;
      paddleX += input.mx * spd * dt;
      paddleX = Math.max(paddleW / 2 + 12, Math.min(CANVAS_W - paddleW / 2 - 12, paddleX));

      ballX += ballVx * dt;
      ballY += ballVy * dt;

      if (ballX < 10) {
        ballX = 10;
        ballVx = Math.abs(ballVx);
      } else if (ballX > CANVAS_W - 10) {
        ballX = CANVAS_W - 10;
        ballVx = -Math.abs(ballVx);
      }
      if (ballY < 10) {
        ballY = 10;
        ballVy = Math.abs(ballVy);
      }

      if (
        ballVy > 0 &&
        ballY + 8 >= paddleY - paddleH / 2 &&
        ballY - 8 <= paddleY + paddleH / 2 &&
        Math.abs(ballX - paddleX) <= paddleW / 2 + 8
      ) {
        const offset = (ballX - paddleX) / (paddleW / 2);
        const speedMag = Math.min(680, Math.hypot(ballVx, ballVy) * 1.02);
        const angle = -Math.PI / 2 + offset * 1.05;
        ballVx = Math.cos(angle) * speedMag;
        ballVy = Math.sin(angle) * speedMag;
        combo = 1;
        soundFX.playDash();
        soundFX.vibrate(0.15, 0.05, 60);
      }

      for (let i = bricks.length - 1; i >= 0; i--) {
        const b = bricks[i];
        if (
          ballX + 8 > b.x &&
          ballX - 8 < b.x + b.w &&
          ballY + 8 > b.y &&
          ballY - 8 < b.y + b.h
        ) {
          ballVy = -ballVy;
          b.hp -= 1;
          spawnBurst(particles, ballX, ballY, b.color, 12);
          if (b.hp <= 0) {
            bricks.splice(i, 1);
            score += combo;
            combo = Math.min(8, combo + 1);
            soundFX.playCollect(combo);
            soundFX.vibrate(0.18, 0.06, 65);
          } else {
            soundFX.playDash();
          }
          break;
        }
      }

      if (bricks.length === 0) {
        score += 15;
        soundFX.playPowerUp();
        buildBricks();
      }

      if (ballY > CANVAS_H + 16) {
        lives -= 1;
        combo = 1;
        if (lives <= 0) {
          soundFX.playCrash();
          soundFX.vibrate(0.9, 1.0, 300);
          return { over: true, score, combo: 1 };
        }
        soundFX.playShieldBreak();
        soundFX.vibrate(0.5, 0.6, 180);
        ballX = paddleX;
        ballY = paddleY - 22;
        ballVx = 250 * mult * (Math.random() < 0.5 ? 1 : -1);
        ballVy = -340 * mult;
      }

      particles = tickParticles(particles, dt);
      return { over: false, score, combo };
    },
    draw(ctx, color) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      for (const b of bricks) {
        ctx.save();
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = b.color;
        ctx.globalAlpha = b.hp > 1 ? 1 : 0.82;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, 5);
        ctx.fill();
        ctx.restore();
      }

      for (let i = 0; i < lives; i++) {
        ctx.fillStyle = "#4ade80";
        ctx.beginPath();
        ctx.arc(24 + i * 20, 24, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.shadowColor = color.hex;
      ctx.shadowBlur = 14;
      ctx.fillStyle = color.hex;
      ctx.beginPath();
      ctx.roundRect(paddleX - paddleW / 2, paddleY - paddleH / 2, paddleW, paddleH, 7);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(ballX, ballY, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 5. ASTEROID BELT ==================== */
function createAsteroidsGame(opts: MiniGameOptions): MiniGameController {
  const mult = getDiffMult(opts.difficulty);
  let sx = CANVAS_W / 2;
  let sy = CANVAS_H / 2;
  let svx = 0;
  let svy = 0;
  let angle = -Math.PI / 2;
  let fireCd = 0;
  let invuln = 1.5;
  let score = 0;
  let combo = 1;
  let particles: Particle[] = [];

  interface Bullet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ttl: number;
  }

  interface Rock {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    tier: number;
  }

  const bullets: Bullet[] = [];
  const rocks: Rock[] = [];

  const spawnRock = (tier: number, x?: number, y?: number) => {
    let rx = x ?? Math.random() * CANVAS_W;
    let ry = y ?? Math.random() * CANVAS_H;
    if (x === undefined && Math.hypot(rx - sx, ry - sy) < 160) {
      rx = (rx + 260) % CANVAS_W;
    }
    const a = Math.random() * Math.PI * 2;
    const spd = ((4 - tier) * 45 + 45) * mult;
    rocks.push({
      x: rx,
      y: ry,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      r: tier === 3 ? 34 : tier === 2 ? 21 : 12,
      tier,
    });
  };

  const initialCount = opts.difficulty === "hard" ? 7 : opts.difficulty === "easy" ? 4 : 5;
  for (let i = 0; i < initialCount; i++) spawnRock(3);

  return {
    update(dt, input) {
      if (invuln > 0) invuln = Math.max(0, invuln - dt);
      if (fireCd > 0) fireCd = Math.max(0, fireCd - dt);

      angle += input.mx * 3.8 * dt;
      const thrust = Math.max(0, -input.my);
      if (thrust > 0.1) {
        svx += Math.cos(angle) * 380 * thrust * dt;
        svy += Math.sin(angle) * 380 * thrust * dt;
      }
      svx *= 0.985;
      svy *= 0.985;
      sx = (sx + svx * dt + CANVAS_W) % CANVAS_W;
      sy = (sy + svy * dt + CANVAS_H) % CANVAS_H;

      if (input.action && fireCd <= 0) {
        fireCd = 0.2;
        bullets.push({
          x: sx + Math.cos(angle) * 18,
          y: sy + Math.sin(angle) * 18,
          vx: Math.cos(angle) * 620 + svx * 0.3,
          vy: Math.sin(angle) * 620 + svy * 0.3,
          ttl: 1.1,
        });
        soundFX.playDash();
      }

      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x = (b.x + b.vx * dt + CANVAS_W) % CANVAS_W;
        b.y = (b.y + b.vy * dt + CANVAS_H) % CANVAS_H;
        b.ttl -= dt;
        if (b.ttl <= 0) bullets.splice(i, 1);
      }

      for (const r of rocks) {
        r.x = (r.x + r.vx * dt + CANVAS_W) % CANVAS_W;
        r.y = (r.y + r.vy * dt + CANVAS_H) % CANVAS_H;
      }

      for (let bi = bullets.length - 1; bi >= 0; bi--) {
        const b = bullets[bi];
        for (let ri = rocks.length - 1; ri >= 0; ri--) {
          const r = rocks[ri];
          if (Math.hypot(b.x - r.x, b.y - r.y) < r.r + 4) {
            bullets.splice(bi, 1);
            rocks.splice(ri, 1);
            score += combo;
            combo = Math.min(8, combo + 1);
            soundFX.playCollect(combo);
            soundFX.vibrate(0.2, 0.08, 70);
            spawnBurst(particles, r.x, r.y, "#fb923c", 14);
            if (r.tier > 1) {
              spawnRock(r.tier - 1, r.x, r.y);
              spawnRock(r.tier - 1, r.x, r.y);
            }
            break;
          }
        }
      }

      if (rocks.length < 4) {
        spawnRock(3);
      }

      if (invuln <= 0) {
        const hit = rocks.some((r) => Math.hypot(sx - r.x, sy - r.y) < r.r + 10);
        if (hit) {
          soundFX.playCrash();
          soundFX.vibrate(0.9, 1.0, 320);
          return { over: true, score, combo: 1 };
        }
      }

      particles = tickParticles(particles, dt);
      return { over: false, score, combo };
    },
    draw(ctx, color, shape) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      for (const r of rocks) {
        ctx.save();
        ctx.shadowColor = "#fb923c";
        ctx.shadowBlur = 12;
        ctx.strokeStyle = "#fb923c";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (const b of bullets) {
        ctx.fillStyle = "#fde047";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      const blink = invuln > 0 && Math.floor(invuln * 16) % 2 === 0;
      if (!blink) {
        drawShip(ctx, sx, sy, angle, color, shape, 1);
      }

      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 6. STAR DEFENDER ==================== */
function createInvadersGame(opts: MiniGameOptions): MiniGameController {
  const mult = getDiffMult(opts.difficulty);
  let px = CANVAS_W / 2;
  const py = CANVAS_H - 44;
  let fireCd = 0;
  let enemyFireCd = 1.1 / mult;
  let dir = 1;
  let score = 0;
  let combo = 1;
  let particles: Particle[] = [];

  interface Shot {
    x: number;
    y: number;
    vy: number;
    fromPlayer: boolean;
  }

  interface Alien {
    x: number;
    y: number;
    r: number;
    color: string;
  }

  const shots: Shot[] = [];
  let aliens: Alien[] = [];

  const spawnWave = () => {
    aliens = [];
    const colors = ["#fb7185", "#c084fc", "#38bdf8", "#4ade80"];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 10; c++) {
        aliens.push({
          x: 130 + c * 74,
          y: 65 + r * 44,
          r: 15,
          color: colors[r % colors.length],
        });
      }
    }
  };

  spawnWave();

  return {
    update(dt, input) {
      if (fireCd > 0) fireCd = Math.max(0, fireCd - dt);
      enemyFireCd -= dt;

      px += input.mx * 460 * dt;
      px = Math.max(32, Math.min(CANVAS_W - 32, px));

      if (input.action && fireCd <= 0) {
        fireCd = 0.24;
        shots.push({ x: px, y: py - 18, vy: -580, fromPlayer: true });
        soundFX.playDash();
      }

      let hitEdge = false;
      const moveSpd = (65 + score * 1.4) * mult;
      for (const a of aliens) {
        a.x += dir * moveSpd * dt;
        if (a.x < 42 || a.x > CANVAS_W - 42) hitEdge = true;
      }
      if (hitEdge) {
        dir = -dir;
        for (const a of aliens) a.y += 18;
      }

      if (enemyFireCd <= 0 && aliens.length > 0) {
        enemyFireCd = Math.max(0.42, (1.2 - score * 0.01) / mult);
        const shooter = aliens[Math.floor(Math.random() * aliens.length)];
        shots.push({ x: shooter.x, y: shooter.y + 14, vy: 320 * mult, fromPlayer: false });
      }

      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.y += s.vy * dt;
        if (s.y < -10 || s.y > CANVAS_H + 10) {
          shots.splice(i, 1);
          continue;
        }

        if (s.fromPlayer) {
          for (let ai = aliens.length - 1; ai >= 0; ai--) {
            const a = aliens[ai];
            if (Math.hypot(s.x - a.x, s.y - a.y) < a.r + 5) {
              shots.splice(i, 1);
              aliens.splice(ai, 1);
              score += combo;
              combo = Math.min(8, combo + 1);
              soundFX.playCollect(combo);
              soundFX.vibrate(0.16, 0.06, 65);
              spawnBurst(particles, a.x, a.y, a.color, 14);
              break;
            }
          }
        } else if (Math.hypot(s.x - px, s.y - py) < 15) {
          soundFX.playCrash();
          soundFX.vibrate(0.9, 1.0, 320);
          return { over: true, score, combo: 1 };
        }
      }

      if (aliens.some((a) => a.y > py - 24)) {
        soundFX.playCrash();
        return { over: true, score, combo: 1 };
      }

      if (aliens.length === 0) {
        score += 10;
        soundFX.playPowerUp();
        spawnWave();
      }

      particles = tickParticles(particles, dt);
      return { over: false, score, combo };
    },
    draw(ctx, color, shape) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      for (const a of aliens) {
        ctx.save();
        ctx.shadowColor = a.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = a.color;
        ctx.beginPath();
        ctx.roundRect(a.x - 14, a.y - 11, 28, 22, 6);
        ctx.fill();
        ctx.restore();
      }

      for (const s of shots) {
        ctx.fillStyle = s.fromPlayer ? "#fde047" : "#fb7185";
        ctx.fillRect(s.x - 2.5, s.y - 8, 5, 16);
      }

      drawShip(ctx, px, py, -Math.PI / 2, color, shape, 1);
      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 7. VOID RUNNER ==================== */
function createRunnerGame(opts: MiniGameOptions): MiniGameController {
  const mult = getDiffMult(opts.difficulty);
  const groundY = CANVAS_H - 95;
  const px = 170;
  let py = groundY;
  let vy = 0;
  let scoreTimer = 0;
  let score = 0;
  let spawnTimer = 1.1;
  let particles: Particle[] = [];

  interface Obstacle {
    x: number;
    y: number;
    w: number;
    h: number;
    high: boolean;
  }

  const obstacles: Obstacle[] = [];

  return {
    update(dt, input) {
      const onGround = py >= groundY - 0.5;
      if ((input.upPressed || input.action) && onGround) {
        vy = -690;
        soundFX.playDash();
        soundFX.vibrate(0.18, 0.06, 70);
      }

      const gravity = input.downHeld && !onGround ? 2600 : 1750;
      vy += gravity * dt;
      py = Math.min(groundY, py + vy * dt);
      if (py >= groundY) vy = 0;

      const ducking = onGround && input.downHeld;
      const hitH = ducking ? 16 : 30;
      const shipCenterY = py - hitH / 2;

      const runSpeed = (420 + score * 4.5) * mult;
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        const high = Math.random() < 0.35;
        obstacles.push({
          x: CANVAS_W + 30,
          y: high ? groundY - 64 : groundY - 34,
          w: 24,
          h: 34,
          high,
        });
        spawnTimer = (Math.max(0.62, 1.32 - score * 0.008) + Math.random() * 0.42) / mult;
      }

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.x -= runSpeed * dt;
        if (o.x + o.w < -20) {
          obstacles.splice(i, 1);
          continue;
        }

        const pTop = shipCenterY - hitH / 2;
        const pBot = shipCenterY + hitH / 2;
        if (
          px + 14 > o.x &&
          px - 14 < o.x + o.w &&
          pBot > o.y &&
          pTop < o.y + o.h
        ) {
          soundFX.playCrash();
          soundFX.vibrate(0.9, 1.0, 320);
          return { over: true, score, combo: 1 };
        }
      }

      scoreTimer += dt;
      if (scoreTimer >= 0.35) {
        scoreTimer -= 0.35;
        score += 1;
      }

      particles = tickParticles(particles, dt);
      return { over: false, score, combo: 1 };
    },
    draw(ctx, color, shape) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      ctx.save();
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, groundY + 2);
      ctx.lineTo(CANVAS_W, groundY + 2);
      ctx.stroke();
      ctx.restore();

      for (const o of obstacles) {
        ctx.save();
        ctx.shadowColor = o.high ? "#c084fc" : "#fb7185";
        ctx.shadowBlur = 12;
        ctx.fillStyle = o.high ? "#c084fc" : "#fb7185";
        ctx.beginPath();
        ctx.roundRect(o.x, o.y, o.w, o.h, 6);
        ctx.fill();
        ctx.restore();
      }

      const ducking = py >= groundY - 0.5 && vy === 0;
      drawShip(ctx, px, py - 15, 0, color, shape, ducking ? 0.95 : 1);
      renderParticles(ctx, particles);
    },
  };
}

/* ==================== 8. METEOR RAIN ==================== */
function createMeteorGame(opts: MiniGameOptions): MiniGameController {
  const mult = getDiffMult(opts.difficulty);
  let px = CANVAS_W / 2;
  const py = CANVAS_H - 52;
  let dashCd = 0;
  let dashTimer = 0;
  let spawnTimer = 0.4;
  let score = 0;
  let combo = 1;
  let particles: Particle[] = [];

  interface FallingItem {
    x: number;
    y: number;
    vy: number;
    r: number;
    isGem: boolean;
  }

  const items: FallingItem[] = [];

  return {
    update(dt, input) {
      if (dashCd > 0) dashCd = Math.max(0, dashCd - dt);
      if (dashTimer > 0) dashTimer = Math.max(0, dashTimer - dt);

      if (input.action && dashCd <= 0 && Math.abs(input.mx) > 0.1) {
        dashTimer = 0.14;
        dashCd = 0.8;
        soundFX.playDash();
        soundFX.vibrate(0.25, 0.1, 100);
        spawnBurst(particles, px, py, "#38bdf8", 12);
      }

      const spd = dashTimer > 0 ? 920 : 470;
      px += input.mx * spd * dt;
      px = Math.max(28, Math.min(CANVAS_W - 28, px));

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        const isGem = Math.random() < 0.28;
        items.push({
          x: 34 + Math.random() * (CANVAS_W - 68),
          y: -24,
          vy: ((isGem ? 260 : 300) + score * 3.2 + Math.random() * 90) * mult,
          r: isGem ? 10 : 15 + Math.random() * 10,
          isGem,
        });
        spawnTimer = Math.max(0.13, (0.36 - score * 0.0025) / mult);
      }

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.y += it.vy * dt;
        if (it.y > CANVAS_H + 30) {
          items.splice(i, 1);
          continue;
        }

        if (Math.hypot(px - it.x, py - it.y) < it.r + 12) {
          if (it.isGem) {
            items.splice(i, 1);
            score += combo;
            combo = Math.min(8, combo + 1);
            soundFX.playCollect(combo);
            soundFX.vibrate(0.16, 0.05, 65);
            spawnBurst(particles, it.x, it.y, "#fde047", 14);
          } else if (dashTimer <= 0) {
            soundFX.playCrash();
            soundFX.vibrate(0.9, 1.0, 320);
            return { over: true, score, combo: 1 };
          }
        }
      }

      particles = tickParticles(particles, dt);
      return { over: false, score, combo };
    },
    draw(ctx, color, shape) {
      ctx.fillStyle = "#050811";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawGrid(ctx, CANVAS_W, CANVAS_H, 40);

      for (const it of items) {
        ctx.save();
        ctx.shadowColor = it.isGem ? "#fde047" : "#fb7185";
        ctx.shadowBlur = 14;
        ctx.fillStyle = it.isGem ? "#fde047" : "#fb7185";
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      drawShip(ctx, px, py, -Math.PI / 2, color, shape, 1);
      renderParticles(ctx, particles);
    },
  };
}

export function createMiniGame(id: GameId, opts: MiniGameOptions): MiniGameController {
  switch (id) {
    case "pong":
      return createPongGame(opts);
    case "breakout":
      return createBreakoutGame(opts);
    case "asteroids":
      return createAsteroidsGame(opts);
    case "invaders":
      return createInvadersGame(opts);
    case "runner":
      return createRunnerGame(opts);
    case "meteor":
    default:
      return createMeteorGame(opts);
  }
}