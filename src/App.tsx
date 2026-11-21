import React, { useEffect, useRef, useState } from "react";
import "./style.css";
import {
  createFourPlayerGame,
  FourPlayerController,
  isFourPlayerGameId,
} from "./fourPlayerGames";
import {
  formatConnectedPadsSummary,
  readControllerState,
  snapshotButtons,
} from "./gamepad";
import { createMiniGame, MiniGameController } from "./miniGames";
import { RemotePadInput, roomClient, RoomSnapshot } from "./netRoom";
import { drawGrid, drawScene, drawShip } from "./renderer";
import { createSnakeSession, drawSnakeScene, updateSnakeSession } from "./snakeGame";
import { soundFX } from "./sound";
import { createTwoPlayerGame, isTwoPlayerGameId, TwoPlayerController } from "./twoPlayerGames";
import {
  CANVAS_H,
  CANVAS_W,
  Difficulty,
  GameId,
  GAMES_CATALOG,
  GRID_SIZE,
  LaserBeam,
  MoveMode,
  Orb,
  Particle,
  PlayerState,
  PlayerTab,
  PongMode,
  PowerUpItem,
  SHIP_COLORS,
  Screen,
  ShipShape,
  STORAGE_KEYS,
} from "./types";

const COLS = Math.floor(CANVAS_W / GRID_SIZE);
const ROWS = Math.floor(CANVAS_H / GRID_SIZE);
const TAB_ORDER: PlayerTab[] = ["1p", "2p", "4p"];

function getDifficultySpeedMult(diff: Difficulty): number {
  if (diff === "easy") return 0.82;
  if (diff === "hard") return 1.25;
  return 1;
}

function cellToCenter(col: number, row: number): { x: number; y: number } {
  return {
    x: col * GRID_SIZE + GRID_SIZE / 2,
    y: row * GRID_SIZE + GRID_SIZE / 2,
  };
}

function spawnOrb(): Orb {
  const col = 1 + Math.floor(Math.random() * (COLS - 2));
  const row = 1 + Math.floor(Math.random() * (ROWS - 2));
  const pos = cellToCenter(col, row);
  return {
    x: pos.x,
    y: pos.y,
    r: 9,
    pulse: Math.random() * Math.PI * 2,
  };
}

function spawnPowerUp(): PowerUpItem {
  const col = 1 + Math.floor(Math.random() * (COLS - 2));
  const row = 1 + Math.floor(Math.random() * (ROWS - 2));
  const pos = cellToCenter(col, row);
  return {
    x: pos.x,
    y: pos.y,
    r: 11,
    type: Math.random() < 0.55 ? "shield" : "slow",
    pulse: 0,
    ttl: 9,
  };
}

function createInitialBeams(): LaserBeam[] {
  return [
    { angle: 0, speed: 0.85, length: 145, width: 7 },
    { angle: Math.PI, speed: -0.85, length: 145, width: 7 },
  ];
}

function createInitialPlayer(mode: MoveMode): PlayerState {
  if (mode === "grid") {
    const pos = cellToCenter(3, ROWS - 4);
    return {
      x: pos.x,
      y: pos.y,
      targetX: pos.x,
      targetY: pos.y,
      angle: 0,
      speed: 325,
      radius: 10,
      dashCooldown: 0,
      dashMaxCooldown: 0.85,
      dashTimer: 0,
      moveCooldown: 0,
      hasShield: false,
      slowTimer: 0,
      trail: [],
    };
  }

  return {
    x: 130,
    y: CANVAS_H - 120,
    targetX: 130,
    targetY: CANVAS_H - 120,
    angle: 0,
    speed: 325,
    radius: 10,
    dashCooldown: 0,
    dashMaxCooldown: 0.85,
    dashTimer: 0,
    moveCooldown: 0,
    hasShield: false,
    slowTimer: 0,
    trail: [],
  };
}

function distToBeam(
  px: number,
  py: number,
  cx: number,
  cy: number,
  beam: LaserBeam
): number {
  const bx = cx + Math.cos(beam.angle) * beam.length;
  const by = cy + Math.sin(beam.angle) * beam.length;
  const vx = bx - cx;
  const vy = by - cy;
  const wx = px - cx;
  const wy = py - cy;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return Math.hypot(px - cx, py - cy);
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
  const projX = cx + t * vx;
  const projY = cy + t * vy;
  return Math.hypot(px - projX, py - projY);
}

function loadBestScores(): Record<GameId, number> {
  const defaults: Record<GameId, number> = {
    orbit: 0,
    snake: 0,
    pong: 0,
    breakout: 0,
    asteroids: 0,
    invaders: 0,
    runner: 0,
    meteor: 0,
    duel_snake: 0,
    tank_duel: 0,
    turbo_race: 0,
    core_collector: 0,
    neon_hockey: 0,
    laser_tag_2p: 0,
    arena_royale_4p: 0,
    quad_pong_4p: 0,
    squad_snake_4p: 0,
    bumper_quad_4p: 0,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.bestMap);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<GameId, number>>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function App() {
  const [activeTab, setActiveTab] = useState<PlayerTab>("1p");
  const [activeGame, setActiveGame] = useState<GameId>("orbit");
  const [screen, setScreen] = useState<Screen>("library");
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(1);
  const [hasShield, setHasShield] = useState<boolean>(false);
  const [slowActive, setSlowActive] = useState<boolean>(false);
  const [focusActive, setFocusActive] = useState<boolean>(false);
  const [menuCursor, setMenuCursor] = useState<number>(0);

  const [roomState, setRoomState] = useState<RoomSnapshot | null>(null);
  const [mySlot, setMySlot] = useState<1 | 2 | 3 | 4>(1);
  const [joinCodeInput, setJoinCodeInput] = useState<string>("");
  const [roomNotice, setRoomNotice] = useState<string>("");

  const [difficulty, setDifficulty] = useState<Difficulty>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.difficulty);
    return saved === "easy" || saved === "hard" ? saved : "normal";
  });

  const [pongMode, setPongMode] = useState<PongMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.pongMode);
    return saved === "2p" ? "2p" : "ai";
  });

  const [moveMode, setMoveMode] = useState<MoveMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.moveMode);
    return saved === "grid" ? "grid" : "free";
  });

  const [bestScores, setBestScores] = useState<Record<GameId, number>>(loadBestScores);

  const [colorIdx, setColorIdx] = useState<number>(() => {
    const val = Number(localStorage.getItem(STORAGE_KEYS.colorIdx) || "0");
    return val >= 0 && val < SHIP_COLORS.length ? val : 0;
  });

  const [shipShape, setShipShape] = useState<ShipShape>(() => {
    const val = localStorage.getItem(STORAGE_KEYS.shape);
    return val === "vanguard" || val === "orb" ? val : "delta";
  });

  const [gamepadInfo, setGamepadInfo] = useState<string>("");

  const stageRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const activeTabRef = useRef<PlayerTab>(activeTab);
  const activeGameRef = useRef<GameId>(activeGame);
  const screenRef = useRef<Screen>(screen);
  const menuCursorRef = useRef<number>(menuCursor);
  const difficultyRef = useRef<Difficulty>(difficulty);
  const pongModeRef = useRef<PongMode>(pongMode);
  const moveModeRef = useRef<MoveMode>(moveMode);
  const colorIdxRef = useRef<number>(colorIdx);
  const shapeRef = useRef<ShipShape>(shipShape);
  const gameSessionRef = useRef<number>(0);
  const mySlotRef = useRef<1 | 2 | 3 | 4>(mySlot);
  const remoteInputsRef = useRef<Record<1 | 2 | 3 | 4, RemotePadInput>>({
    1: { x: 0, y: 0, action: false },
    2: { x: 0, y: 0, action: false },
    3: { x: 0, y: 0, action: false },
    4: { x: 0, y: 0, action: false },
  });

  useEffect(() => {
    mySlotRef.current = mySlot;
  }, [mySlot]);

  useEffect(() => {
    return roomClient.subscribe((ev) => {
      if (ev.type === "room_state") {
        setRoomState(ev.state);
        setMySlot(ev.mySlot);
      } else if (ev.type === "match_started") {
        setActiveGame(ev.gameId);
        activeGameRef.current = ev.gameId;
        setDifficulty(ev.difficulty);
        difficultyRef.current = ev.difficulty;
        gameSessionRef.current += 1;
        setScore(0);
        setCombo(1);
        setScreen("game");
      } else if (ev.type === "player_input") {
        remoteInputsRef.current[ev.slot] = ev.input;
      } else if (ev.type === "error" || ev.type === "status") {
        setRoomNotice(ev.message);
      }
    });
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
    setMenuCursor(0);
  }, [activeTab]);

  useEffect(() => {
    activeGameRef.current = activeGame;
    if (roomState) {
      void roomClient.updateRoomSettings(activeGame, difficultyRef.current);
    }
  }, [activeGame]);

  useEffect(() => {
    screenRef.current = screen;
    setMenuCursor(0);
  }, [screen]);

  useEffect(() => {
    menuCursorRef.current = menuCursor;
  }, [menuCursor]);

  useEffect(() => {
    difficultyRef.current = difficulty;
    localStorage.setItem(STORAGE_KEYS.difficulty, difficulty);
    if (roomState) {
      void roomClient.updateRoomSettings(activeGameRef.current, difficulty);
    }
  }, [difficulty]);

  useEffect(() => {
    pongModeRef.current = pongMode;
    localStorage.setItem(STORAGE_KEYS.pongMode, pongMode);
  }, [pongMode]);

  useEffect(() => {
    moveModeRef.current = moveMode;
    localStorage.setItem(STORAGE_KEYS.moveMode, moveMode);
  }, [moveMode]);

  useEffect(() => {
    colorIdxRef.current = colorIdx;
    localStorage.setItem(STORAGE_KEYS.colorIdx, String(colorIdx));
  }, [colorIdx]);

  useEffect(() => {
    shapeRef.current = shipShape;
    localStorage.setItem(STORAGE_KEYS.shape, shipShape);
  }, [shipShape]);

  const openGameMenu = (game: GameId) => {
    setActiveGame(game);
    setScreen("menu");
  };

  const startNewGame = (gameOverride?: GameId) => {
    const targetGame = gameOverride || activeGameRef.current;
    if (gameOverride) {
      setActiveGame(gameOverride);
      activeGameRef.current = gameOverride;
    }
    if (roomState) {
      void roomClient.updateRoomSettings(targetGame, difficultyRef.current);
      void roomClient.startMatch();
      return;
    }
    gameSessionRef.current += 1;
    setScore(0);
    setCombo(1);
    setHasShield(false);
    setSlowActive(false);
    setFocusActive(false);
    setScreen("game");
  };

  const handleCreateRoom = () => {
    void roomClient.createRoom(activeGameRef.current, difficultyRef.current);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    void roomClient.joinRoom(joinCodeInput);
  };

  const handleLeaveRoom = () => {
    void roomClient.leaveRoom();
    setRoomState(null);
    setMySlot(1);
  };

  const toggleStageFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (!document.fullscreenElement && typeof el.requestFullscreen === "function") {
      el.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    if (screen !== "hangar") return;
    let rafId = 0;

    const renderPreview = (t: number) => {
      const canvas = previewRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.fillStyle = "#050811";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawGrid(ctx, canvas.width, canvas.height, 26);

        const y = canvas.height / 2 + Math.sin(t * 0.004) * 5;
        const rot = Math.sin(t * 0.002) * 0.25;
        drawShip(ctx, canvas.width / 2, y, rot, SHIP_COLORS[colorIdx], shipShape, 2.1);
      }
      rafId = requestAnimationFrame(renderPreview);
    };

    rafId = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(rafId);
  }, [screen, colorIdx, shipShape]);

  useEffect(() => {
    const keys: Record<string, boolean> = {};
    let prevUp = false;
    let prevButtons: Record<number, boolean> = {};
    let navCooldown = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const k = e.key.toLowerCase();
      keys[k] = true;
      if (k === "f") {
        e.preventDefault();
        toggleStageFullscreen();
        return;
      }
      if (
        (k === "enter" || k === " ") &&
        (screenRef.current === "menu" || screenRef.current === "gameover")
      ) {
        e.preventDefault();
        startNewGame();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
    };

    const detectGamepads = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const connectedPads = Array.from(pads).filter((p): p is Gamepad => Boolean(p && p.connected));
      setGamepadInfo(formatConnectedPadsSummary(connectedPads));
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("gamepadconnected", detectGamepads);
    window.addEventListener("gamepaddisconnected", detectGamepads);

    const baseCenter = { x: CANVAS_W / 2, y: CANVAS_H / 2 };
    const center = { x: baseCenter.x, y: baseCenter.y };
    let activeSession = -1;

    let player: PlayerState = createInitialPlayer(moveModeRef.current);
    let snakeDir = { dx: 1, dy: 0 };
    let orb = spawnOrb();
    let powerUp: PowerUpItem | null = null;
    let powerUpSpawnTimer = 6;
    let beams = createInitialBeams();
    let particles: Particle[] = [];
    let snakeSession = createSnakeSession();
    let miniGame: MiniGameController | null = null;
    let twoPlayerGame: TwoPlayerController | null = null;
    let fourPlayerGame: FourPlayerController | null = null;

    let currentScore = 0;
    let currentCombo = 1;
    let comboTimer = 0;
    let spawnShield = 1.25;
    let corePulse = 0;
    let shakeTime = 0;
    let shakeIntensity = 0;

    const triggerShake = (duration: number, intensity: number) => {
      shakeTime = Math.max(shakeTime, duration);
      shakeIntensity = Math.max(shakeIntensity, intensity);
    };

    const addParticles = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 220;
        particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0,
          maxLife: 0.35 + Math.random() * 0.3,
          color,
          size: 2 + Math.random() * 3,
        });
      }
    };

    const finishRun = (finalScore: number, gameType: GameId) => {
      setBestScores((prev) => {
        const nextVal = Math.max(prev[gameType] || 0, finalScore);
        const updated = { ...prev, [gameType]: nextVal };
        localStorage.setItem(STORAGE_KEYS.bestMap, JSON.stringify(updated));
        return updated;
      });
      setScreen("gameover");
    };

    const triggerOrbitCrash = (activeColorHex: string) => {
      soundFX.playCrash();
      soundFX.vibrate(0.9, 1.0, 320);
      triggerShake(0.35, 11);
      addParticles(player.x, player.y, activeColorHex, 32);
      finishRun(currentScore, "orbit");
    };

    const resetSessionState = () => {
      const g = activeGameRef.current;
      player = createInitialPlayer(moveModeRef.current);
      snakeDir = { dx: 1, dy: 0 };
      orb = spawnOrb();
      powerUp = null;
      powerUpSpawnTimer = 5.5;
      beams = createInitialBeams();
      particles = [];
      snakeSession = createSnakeSession();

      miniGame = null;
      twoPlayerGame = null;
      fourPlayerGame = null;

      if (isFourPlayerGameId(g)) {
        fourPlayerGame = createFourPlayerGame(g, difficultyRef.current);
      } else if (isTwoPlayerGameId(g)) {
        twoPlayerGame = createTwoPlayerGame(g, difficultyRef.current);
      } else if (g !== "orbit" && g !== "snake") {
        miniGame = createMiniGame(g, {
          difficulty: difficultyRef.current,
          pongMode: pongModeRef.current,
        });
      }

      currentScore = 0;
      currentCombo = 1;
      comboTimer = 0;
      spawnShield = 1.25;
      corePulse = 0;
      shakeTime = 0;
      shakeIntensity = 0;
      center.x = baseCenter.x;
      center.y = baseCenter.y;
    };

    let lastTime = performance.now();
    let rafId = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      if (navCooldown > 0) navCooldown = Math.max(0, navCooldown - dt);

      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const connectedPads = Array.from(pads).filter((p): p is Gamepad => Boolean(p && p.connected));
      const pad = connectedPads[0];
      const pad2 = connectedPads[1];
      const pad3 = connectedPads[2];
      const pad4 = connectedPads[3];

      if (connectedPads.length > 0) {
        setGamepadInfo(formatConnectedPadsSummary(connectedPads));
      }

      const gCurrent = activeGameRef.current;
      const multiKeyGame = isTwoPlayerGameId(gCurrent) || isFourPlayerGameId(gCurrent);
      const isInGame = screenRef.current === "game";

      const c1 = readControllerState(pad, prevButtons, isInGame);
      const c2 = readControllerState(pad2, {}, isInGame);
      const c3 = readControllerState(pad3, {}, isInGame);
      const c4 = readControllerState(pad4, {}, isInGame);

      let mx = 0;
      let my = 0;
      if (keys["a"] || (!multiKeyGame && keys["arrowleft"])) mx -= 1;
      if (keys["d"] || (!multiKeyGame && keys["arrowright"])) mx += 1;
      if (keys["w"] || (!multiKeyGame && keys["arrowup"])) my -= 1;
      if (keys["s"] || (!multiKeyGame && keys["arrowdown"])) my += 1;

      let p2x = 0;
      let p2y = 0;
      if (keys["arrowleft"]) p2x -= 1;
      if (keys["arrowright"]) p2x += 1;
      if (keys["arrowup"]) p2y -= 1;
      if (keys["arrowdown"]) p2y += 1;
      let p2Action = Boolean(keys["enter"] || keys["/"]);

      let p3x = 0;
      let p3y = 0;
      if (keys["j"]) p3x -= 1;
      if (keys["l"]) p3x += 1;
      if (keys["i"]) p3y -= 1;
      if (keys["k"]) p3y += 1;
      let p3Action = Boolean(keys["u"]);

      let p4x = 0;
      let p4y = 0;
      if (keys["numpad4"]) p4x -= 1;
      if (keys["numpad6"]) p4x += 1;
      if (keys["numpad8"]) p4y -= 1;
      if (keys["numpad5"] || keys["numpad2"]) p4y += 1;
      let p4Action = Boolean(keys["numpad0"]);

      let actionPressed = Boolean(keys["shift"] || keys[" "]);
      let focusHeld = Boolean(keys["control"] || keys["alt"]);
      let downHeld = Boolean(keys["s"] || keys["arrowdown"]);
      let upHeld = Boolean(keys["w"] || keys["arrowup"]);

      if (c2.connected) {
        if (Math.hypot(c2.x, c2.y) > 0.05) {
          p2x = c2.x;
          p2y = c2.y;
        }
        if (c2.actionHeld) p2Action = true;
      }

      if (c3.connected) {
        if (Math.hypot(c3.x, c3.y) > 0.05) {
          p3x = c3.x;
          p3y = c3.y;
        }
        if (c3.actionHeld) p3Action = true;
      }

      if (c4.connected) {
        if (Math.hypot(c4.x, c4.y) > 0.05) {
          p4x = c4.x;
          p4y = c4.y;
        }
        if (c4.actionHeld) p4Action = true;
      }

      if (c1.connected) {
        mx += c1.x;
        my += c1.y;
        if (c1.focusHeld) focusHeld = true;
        if (c1.actionHeld) actionPressed = true;
        if (c1.downHeld) downHeld = true;
        if (c1.upHeld) upHeld = true;

        const scr = screenRef.current;

        if (c1.pauseOrLibPressed && scr === "game") {
          setScreen("library");
        }

        if (c1.hangarPressed && (scr === "menu" || scr === "gameover")) {
          setScreen("hangar");
        }

        if (scr === "library") {
          if (c1.prevTabPressed) {
            const idx = TAB_ORDER.indexOf(activeTabRef.current);
            setActiveTab(TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length]);
          } else if (c1.nextTabPressed) {
            const idx = TAB_ORDER.indexOf(activeTabRef.current);
            setActiveTab(TAB_ORDER[(idx + 1) % TAB_ORDER.length]);
          }
        }

        if (scr !== "game") {
          const navH = c1.x;
          const navV = c1.y;

          if (navCooldown <= 0 && (Math.abs(navH) > 0.55 || Math.abs(navV) > 0.55)) {
            navCooldown = 0.18;
            if (scr === "library") {
              const visibleGames = GAMES_CATALOG.filter((g) => g.tab === activeTabRef.current);
              const total = visibleGames.length;
              if (total > 0) {
                const step =
                  Math.abs(navV) > Math.abs(navH) ? (navV > 0 ? 4 : -4) : navH > 0 ? 1 : -1;
                setMenuCursor((c) => (c + step + total) % total);
              }
            } else if (scr === "menu") {
              setMenuCursor((c) => (c + 1) % 3);
            } else if (scr === "gameover") {
              const dir = navH > 0 || navV > 0 ? 1 : -1;
              setMenuCursor((c) => (c + dir + 3) % 3);
            } else if (scr === "hangar") {
              if (Math.abs(navH) > Math.abs(navV)) {
                const dir = navH > 0 ? 1 : -1;
                setColorIdx((i) => (i + dir + SHIP_COLORS.length) % SHIP_COLORS.length);
              } else {
                const shapes: ShipShape[] = ["delta", "vanguard", "orb"];
                const dir = navV > 0 ? 1 : -1;
                setShipShape(
                  (s) => shapes[(shapes.indexOf(s) + dir + shapes.length) % shapes.length]
                );
              }
            }
          }

          if (c1.confirmPressed) {
            if (scr === "library") {
              const visibleGames = GAMES_CATALOG.filter((g) => g.tab === activeTabRef.current);
              const chosen = visibleGames[menuCursorRef.current] || visibleGames[0];
              if (chosen) openGameMenu(chosen.id);
            } else if (scr === "menu") {
              if (menuCursorRef.current === 0) startNewGame();
              else if (menuCursorRef.current === 1) setScreen("hangar");
              else setScreen("library");
            } else if (scr === "gameover") {
              if (menuCursorRef.current === 0) startNewGame();
              else if (menuCursorRef.current === 1) setScreen("hangar");
              else setScreen("library");
            } else if (scr === "hangar") {
              startNewGame();
            }
          }

          if (c1.backPressed) {
            if (scr === "menu" || scr === "hangar") setScreen("library");
            else if (scr === "gameover") setScreen("menu");
          }
        }

        prevButtons = snapshotButtons(pad);
      }

      const upPressed = upHeld && !prevUp;
      prevUp = upHeld;

      const normalize = (x: number, y: number) => {
        const m = Math.hypot(x, y);
        return m > 1 ? { x: x / m, y: y / m } : { x, y };
      };

      const n1 = normalize(mx, my);
      mx = n1.x;
      my = n1.y;
      let n2 = normalize(p2x, p2y);
      let n3 = normalize(p3x, p3y);
      let n4 = normalize(p4x, p4y);

      if (isInGame) {
        const slot = mySlotRef.current;
        roomClient.sendInput({ x: mx, y: my, action: actionPressed });

        const r2 = remoteInputsRef.current[2];
        const r3 = remoteInputsRef.current[3];
        const r4 = remoteInputsRef.current[4];
        const r1 = remoteInputsRef.current[1];

        if (slot !== 2 && (Math.abs(r2.x) > 0.02 || Math.abs(r2.y) > 0.02 || r2.action)) {
          n2 = { x: r2.x, y: r2.y };
          if (r2.action) p2Action = true;
        }
        if (slot !== 3 && (Math.abs(r3.x) > 0.02 || Math.abs(r3.y) > 0.02 || r3.action)) {
          n3 = { x: r3.x, y: r3.y };
          if (r3.action) p3Action = true;
        }
        if (slot !== 4 && (Math.abs(r4.x) > 0.02 || Math.abs(r4.y) > 0.02 || r4.action)) {
          n4 = { x: r4.x, y: r4.y };
          if (r4.action) p4Action = true;
        }
        if (slot !== 1 && (Math.abs(r1.x) > 0.02 || Math.abs(r1.y) > 0.02 || r1.action)) {
          mx = r1.x;
          my = r1.y;
          if (r1.action) actionPressed = true;
        }
      }

      if (screenRef.current === "game") {
        if (activeSession !== gameSessionRef.current) {
          activeSession = gameSessionRef.current;
          resetSessionState();
        }

        const activeColor = SHIP_COLORS[colorIdxRef.current] || SHIP_COLORS[0];
        const activeShape = shapeRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        const g = activeGameRef.current;
        const diffMult = getDifficultySpeedMult(difficultyRef.current);

        if (fourPlayerGame) {
          setFocusActive(false);
          const res = fourPlayerGame.update(dt, {
            p1: { x: mx, y: my, action: actionPressed },
            p2: { x: n2.x, y: n2.y, action: p2Action },
            p3: { x: n3.x, y: n3.y, action: p3Action },
            p4: { x: n4.x, y: n4.y, action: p4Action },
          });
          setScore(res.score);
          setCombo(res.combo);

          if (canvas && ctx) {
            fourPlayerGame.draw(ctx, activeColor, activeShape, now);
          }
          if (res.over) {
            finishRun(res.score, g);
          }
        } else if (twoPlayerGame) {
          setFocusActive(false);
          const res = twoPlayerGame.update(dt, {
            p1x: mx,
            p1y: my,
            p1Action: actionPressed,
            p2x: n2.x,
            p2y: n2.y,
            p2Action,
          });
          setScore(res.score);
          setCombo(res.combo);

          if (canvas && ctx) {
            twoPlayerGame.draw(ctx, activeColor, activeShape, now);
          }
          if (res.over) {
            finishRun(res.score, g);
          }
        } else if (g === "snake") {
          setFocusActive(false);
          const res = updateSnakeSession(
            snakeSession,
            dt * diffMult,
            mx,
            my,
            actionPressed,
            activeColor,
            () => {
              soundFX.playCrash();
              soundFX.vibrate(0.9, 1.0, 320);
              triggerShake(0.32, 10);
              finishRun(snakeSession.score, "snake");
            }
          );
          setScore(res.score);
          setCombo(res.combo);

          if (canvas && ctx) {
            drawSnakeScene(ctx, snakeSession, activeColor, activeShape, now);
          }
        } else if (g !== "orbit" && miniGame) {
          setFocusActive(false);
          const res = miniGame.update(dt, {
            mx,
            my,
            p2y: n2.y,
            action: actionPressed,
            upPressed,
            downHeld,
          });
          setScore(res.score);
          setCombo(res.combo);

          if (canvas && ctx) {
            miniGame.draw(ctx, activeColor, activeShape, now);
          }
          if (res.over) {
            finishRun(res.score, g);
          }
        } else {
          setFocusActive(focusHeld);
          const activeMode = moveModeRef.current;

          if (spawnShield > 0) spawnShield = Math.max(0, spawnShield - dt);
          if (player.dashCooldown > 0) player.dashCooldown = Math.max(0, player.dashCooldown - dt);
          if (player.dashTimer > 0) player.dashTimer = Math.max(0, player.dashTimer - dt);
          if (player.moveCooldown > 0) player.moveCooldown = Math.max(0, player.moveCooldown - dt);
          if (player.slowTimer > 0) {
            player.slowTimer = Math.max(0, player.slowTimer - dt);
            if (player.slowTimer === 0) setSlowActive(false);
          }

          if (comboTimer > 0) {
            comboTimer = Math.max(0, comboTimer - dt);
            if (comboTimer === 0 && currentCombo > 1) {
              currentCombo = 1;
              setCombo(1);
            }
          }

          if (activeMode === "free") {
            const mag = Math.hypot(mx, my);
            if (actionPressed && player.dashCooldown <= 0 && mag > 0.05) {
              player.dashTimer = 0.15;
              player.dashCooldown = player.dashMaxCooldown;
              soundFX.playDash();
              soundFX.vibrate(0.28, 0.12, 110);
              triggerShake(0.08, 3);
              addParticles(player.x, player.y, activeColor.hex, 12);
            }

            const speedMultiplier = player.dashTimer > 0 ? 2.55 : focusHeld ? 0.62 : 1;
            const currentSpeed = player.speed * speedMultiplier;
            player.x += mx * currentSpeed * dt;
            player.y += my * currentSpeed * dt;
            player.x = Math.max(
              player.radius + 10,
              Math.min(CANVAS_W - player.radius - 10, player.x)
            );
            player.y = Math.max(
              player.radius + 10,
              Math.min(CANVAS_H - player.radius - 10, player.y)
            );
            player.targetX = player.x;
            player.targetY = player.y;

            if (mag > 0.05) {
              player.angle = Math.atan2(my, mx);
            }
          } else {
            const reqX = Math.abs(mx) >= Math.abs(my) ? Math.sign(mx) : 0;
            const reqY = Math.abs(my) > Math.abs(mx) ? Math.sign(my) : 0;

            if (reqX !== 0 || reqY !== 0) {
              const isOpposite = reqX === -snakeDir.dx && reqY === -snakeDir.dy;
              if (!isOpposite) {
                snakeDir = { dx: reqX, dy: reqY };
                player.angle = Math.atan2(snakeDir.dy, snakeDir.dx);
              }
            }

            if (player.moveCooldown <= 0) {
              const canDashJump = actionPressed && player.dashCooldown <= 0;
              const steps = canDashJump ? 2 : 1;

              const curCol = Math.floor(player.targetX / GRID_SIZE);
              const curRow = Math.floor(player.targetY / GRID_SIZE);
              const nextCol = curCol + snakeDir.dx * steps;
              const nextRow = curRow + snakeDir.dy * steps;

              const hitWall = nextCol < 0 || nextCol >= COLS || nextRow < 0 || nextRow >= ROWS;
              const baseStepInterval =
                Math.max(0.075, 0.145 - currentScore * 0.0018) / diffMult;
              player.moveCooldown = focusHeld ? baseStepInterval * 1.45 : baseStepInterval;

              if (canDashJump) {
                player.dashTimer = 0.15;
                player.dashCooldown = player.dashMaxCooldown;
                soundFX.playDash();
                soundFX.vibrate(0.28, 0.12, 110);
                triggerShake(0.08, 3);
                addParticles(player.x, player.y, activeColor.hex, 12);
              }

              if (hitWall) {
                if (player.hasShield) {
                  player.hasShield = false;
                  setHasShield(false);
                  spawnShield = 0.85;
                  const bounceCol = Math.max(1, Math.min(COLS - 2, nextCol));
                  const bounceRow = Math.max(1, Math.min(ROWS - 2, nextRow));
                  const bouncePos = cellToCenter(bounceCol, bounceRow);
                  player.targetX = bouncePos.x;
                  player.targetY = bouncePos.y;
                  snakeDir = { dx: -snakeDir.dx, dy: -snakeDir.dy };
                  player.angle = Math.atan2(snakeDir.dy, snakeDir.dx);
                  soundFX.playShieldBreak();
                  soundFX.vibrate(0.55, 0.75, 200);
                  triggerShake(0.2, 7);
                  addParticles(player.x, player.y, "#22d3ee", 24);
                } else {
                  triggerOrbitCrash(activeColor.hex);
                }
              } else {
                const nextPos = cellToCenter(nextCol, nextRow);
                player.targetX = nextPos.x;
                player.targetY = nextPos.y;
              }
            }

            const lerpSpeed = focusHeld ? 16 : 26;
            const t = Math.min(1, lerpSpeed * dt);
            player.x += (player.targetX - player.x) * t;
            player.y += (player.targetY - player.y) * t;
          }

          player.trail.push({ x: player.x, y: player.y });
          if (player.trail.length > 14) player.trail.shift();

          corePulse += dt * (4 + currentScore * 0.08) * diffMult;
          if (currentScore >= 12) {
            const orbitAmp = Math.min(65, (currentScore - 11) * 3.2);
            center.x = baseCenter.x + Math.cos(corePulse * 0.25) * orbitAmp;
            center.y = baseCenter.y + Math.sin(corePulse * 0.32) * (orbitAmp * 0.65);
          }

          const slowFactor = player.slowTimer > 0 ? 0.45 : 1;
          const speedScale = (1 + currentScore * 0.022) * slowFactor * diffMult;
          for (const b of beams) {
            b.angle += b.speed * speedScale * dt;
          }
          if (currentScore >= 10 && beams.length < 3) {
            beams.push({ angle: Math.PI / 2, speed: 0.95, length: 145, width: 7 });
          }
          if (currentScore >= 24 && beams.length < 4) {
            beams.push({ angle: -Math.PI / 2, speed: -1.0, length: 145, width: 7 });
          }

          orb.pulse += dt * 5;
          if (Math.hypot(player.x - orb.x, player.y - orb.y) < player.radius + orb.r + 4) {
            currentScore += currentCombo;
            setScore(currentScore);
            soundFX.playCollect(currentCombo);
            addParticles(orb.x, orb.y, "#fde047", 15);

            currentCombo = Math.min(8, currentCombo + 1);
            comboTimer = 4.2;
            setCombo(currentCombo);

            orb = spawnOrb();
          }

          if (!powerUp) {
            powerUpSpawnTimer -= dt;
            if (powerUpSpawnTimer <= 0) {
              powerUp = spawnPowerUp();
              powerUpSpawnTimer = 8 + Math.random() * 4;
            }
          } else {
            powerUp.pulse += dt * 6;
            powerUp.ttl -= dt;
            if (powerUp.ttl <= 0) {
              powerUp = null;
            } else if (
              Math.hypot(player.x - powerUp.x, player.y - powerUp.y) <
              player.radius + powerUp.r + 4
            ) {
              soundFX.playPowerUp();
              soundFX.vibrate(0.2, 0.05, 90);
              if (powerUp.type === "shield") {
                player.hasShield = true;
                setHasShield(true);
                addParticles(powerUp.x, powerUp.y, "#22d3ee", 18);
              } else {
                player.slowTimer = 3.5;
                setSlowActive(true);
                addParticles(powerUp.x, powerUp.y, "#c084fc", 18);
              }
              powerUp = null;
            }
          }

          const isInvulnerable = player.dashTimer > 0 || spawnShield > 0;
          if (!isInvulnerable) {
            const hit = beams.some(
              (b) =>
                distToBeam(player.x, player.y, center.x, center.y, b) <
                player.radius + b.width * 0.35
            );
            if (hit) {
              if (player.hasShield) {
                player.hasShield = false;
                setHasShield(false);
                spawnShield = 0.85;
                soundFX.playShieldBreak();
                soundFX.vibrate(0.55, 0.75, 200);
                triggerShake(0.2, 7);
                addParticles(player.x, player.y, "#22d3ee", 24);
              } else {
                triggerOrbitCrash(activeColor.hex);
              }
            }
          }

          particles = particles.filter((p) => {
            p.life += dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.95;
            p.vy *= 0.95;
            return p.life < p.maxLife;
          });

          let shakeX = 0;
          let shakeY = 0;
          if (shakeTime > 0) {
            shakeTime = Math.max(0, shakeTime - dt);
            shakeX = (Math.random() - 0.5) * 2 * shakeIntensity;
            shakeY = (Math.random() - 0.5) * 2 * shakeIntensity;
          }

          if (canvas && ctx) {
            drawScene(
              ctx,
              center,
              corePulse,
              beams,
              orb,
              powerUp,
              player,
              particles,
              activeColor,
              activeShape,
              activeMode,
              spawnShield,
              shakeX,
              shakeY
            );
          }
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("gamepadconnected", detectGamepads);
      window.removeEventListener("gamepaddisconnected", detectGamepads);
    };
  }, []);

  const currentColor = SHIP_COLORS[colorIdx] || SHIP_COLORS[0];
  const currentMeta = GAMES_CATALOG.find((g) => g.id === activeGame) || GAMES_CATALOG[0];
  const currentBest = bestScores[activeGame] || 0;
  const diffLabel =
    difficulty === "easy" ? "Kolay" : difficulty === "hard" ? "Zor" : "Normal";
  const tabGames = GAMES_CATALOG.filter((g) => g.tab === activeTab);

  return (
    <div className="app-shell">
      <header className="hud-bar">
        <div className="hud-group">
          <span className="brand-title">ARCADE HUB</span>
          {roomState && (
            <span className="mode-pill">
              ODA: {roomState.roomCode} (P{mySlot})
            </span>
          )}
          {screen !== "library" && <span className="mode-pill">{currentMeta.title}</span>}
          {screen !== "library" && <span className="mode-pill">{diffLabel}</span>}
          {screen !== "library" && <span className="best-pill">Rekor: {currentBest}</span>}
          {screen === "game" && combo > 1 && <span className="combo-badge">x{combo} KOMBO</span>}
        </div>
        <div className="hud-group">
          {screen !== "library" && (
            <button className="btn btn-chip" onClick={() => setScreen("library")}>
              Kütüphane (18 Oyun)
            </button>
          )}
          {screen === "game" && activeGame === "orbit" && hasShield && (
            <span className="status-tag shield">KALKAN</span>
          )}
          {screen === "game" && activeGame === "orbit" && slowActive && (
            <span className="status-tag slow">YAVAŞLATMA</span>
          )}
          {screen === "game" && activeGame === "orbit" && focusActive && (
            <span className="status-tag focus">ODAK</span>
          )}
          {screen === "game" && <span className="score-pill">Skor: {score}</span>}
          <button className="btn btn-chip" onClick={toggleStageFullscreen}>
            Tam Ekran (F)
          </button>
          <span className={`pad-badge ${gamepadInfo ? "connected" : ""}`}>
            {gamepadInfo || "Klavye Modu"}
          </span>
        </div>
      </header>

      <main ref={stageRef} className="stage-box">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className={`game-canvas ${screen !== "game" ? "dimmed" : ""}`}
        />

        {screen === "library" && (
          <section className="overlay-screen">
            <div className="kicker">18 Oyunluk Neon Koleksiyon</div>
            <h1 className="hero-title" style={{ fontSize: 30 }}>
              ARCADE KÜTÜPHANESİ
            </h1>

            <div className="option-block" style={{ textAlign: "center", marginBottom: 10 }}>
              {!roomState ? (
                <form
                  onSubmit={handleJoinRoom}
                  className="btn-row"
                  style={{ gap: 8, flexWrap: "wrap" }}
                >
                  <button type="button" className="btn btn-primary" onClick={handleCreateRoom}>
                    Oda Kur
                  </button>
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="ODA KODU"
                    maxLength={6}
                    style={{
                      width: 120,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #334155",
                      background: "#0f172a",
                      color: "#f8fafc",
                      fontWeight: 700,
                      textAlign: "center",
                      letterSpacing: 1.5,
                    }}
                  />
                  <button type="submit" className="btn btn-secondary">
                    Kodla Katıl
                  </button>
                </form>
              ) : (
                <div className="btn-row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className="mode-pill">
                    Kod: <strong>{roomState.roomCode}</strong>
                  </span>
                  <span className="best-pill">Sen: P{mySlot}</span>
                  <span className="mode-pill">
                    Oyuncular: {roomState.players.map((p) => `P${p.slot}`).join(", ")}
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void roomClient.startMatch()}
                  >
                    Odayı Başlat
                  </button>
                  <button
                    type="button"
                    className="btn btn-chip"
                    onClick={handleLeaveRoom}
                  >
                    Ayrıl
                  </button>
                </div>
              )}
              {roomNotice && (
                <p className="hint-text" style={{ marginTop: 6 }}>
                  {roomNotice}
                </p>
              )}
            </div>

            <div className="tab-bar">
              {(
                [
                  ["1p", "1 Kişilik (8)"],
                  ["2p", "2 Kişilik (6)"],
                  ["4p", "4 Kişilik (4)"],
                ] as const
              ).map(([tabId, label]) => (
                <button
                  key={tabId}
                  className={`tab-btn ${activeTab === tabId ? "active" : ""}`}
                  onClick={() => setActiveTab(tabId)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="library-grid">
              {tabGames.map((item, idx) => (
                <button
                  key={item.id}
                  className={`game-card ${gamepadInfo && menuCursor === idx ? "pad-focus" : ""}`}
                  onClick={() => openGameMenu(item.id)}
                >
                  <div className="card-tag">{item.tag}</div>
                  <h2 className="card-title">{item.title}</h2>
                  <p className="card-desc">{item.desc}</p>
                  <div className="card-meta">Rekor: {bestScores[item.id] || 0}</div>
                </button>
              ))}
            </div>

            <p className="hint-text" style={{ marginTop: 6 }}>
              PS4 / PS5 / Xbox: Sol Analog veya D-Pad • L1-R1 / LB-RB Sekme • X / A Seç • F Tam Ekran
            </p>
          </section>
        )}

        {screen === "menu" && (
          <section className="overlay-screen">
            <div className="kicker">{currentMeta.tag}</div>
            <h1 className="hero-title">{currentMeta.title}</h1>
            <p className="desc-text">{currentMeta.desc}</p>

            <div className="option-block" style={{ textAlign: "center" }}>
              <div className="option-label">Zorluk Seviyesi</div>
              <div className="btn-row">
                {(
                  [
                    ["easy", "Kolay"],
                    ["normal", "Normal"],
                    ["hard", "Zor"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    className={`btn btn-chip ${difficulty === id ? "active" : ""}`}
                    onClick={() => setDifficulty(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {activeGame === "orbit" && (
              <div className="option-block" style={{ textAlign: "center" }}>
                <div className="option-label">Hareket Modu</div>
                <div className="btn-row">
                  <button
                    className={`btn btn-chip ${moveMode === "free" ? "active" : ""}`}
                    onClick={() => setMoveMode("free")}
                  >
                    Serbest Hareket
                  </button>
                  <button
                    className={`btn btn-chip ${moveMode === "grid" ? "active" : ""}`}
                    onClick={() => setMoveMode("grid")}
                  >
                    Karelerde Hareket
                  </button>
                </div>
              </div>
            )}

            {activeGame === "pong" && (
              <div className="option-block" style={{ textAlign: "center" }}>
                <div className="option-label">Oyuncu Modu</div>
                <div className="btn-row">
                  <button
                    className={`btn btn-chip ${pongMode === "ai" ? "active" : ""}`}
                    onClick={() => setPongMode("ai")}
                  >
                    1P vs Yapay Zeka
                  </button>
                  <button
                    className={`btn btn-chip ${pongMode === "2p" ? "active" : ""}`}
                    onClick={() => setPongMode("2p")}
                  >
                    2P Yerel (2. Kol / Oklar)
                  </button>
                </div>
              </div>
            )}

            <div className="btn-row">
              <button
                className={`btn btn-primary ${gamepadInfo && menuCursor === 0 ? "pad-focus" : ""}`}
                onClick={() => startNewGame()}
              >
                Oyuna Başla (X / A)
              </button>
              <button
                className={`btn btn-secondary ${gamepadInfo && menuCursor === 1 ? "pad-focus" : ""}`}
                onClick={() => setScreen("hangar")}
              >
                Hangar (△ / Y)
              </button>
              <button
                className={`btn btn-secondary ${gamepadInfo && menuCursor === 2 ? "pad-focus" : ""}`}
                onClick={() => setScreen("library")}
              >
                Kütüphane (○ / B)
              </button>
            </div>
            <p className="hint-text">{currentMeta.controls}</p>
          </section>
        )}

        {screen === "hangar" && (
          <section className="overlay-screen">
            <h2 className="hero-title" style={{ fontSize: 30 }}>
              HANGAR
            </h2>
            <div className="hangar-grid">
              <div className="preview-wrap">
                <canvas ref={previewRef} width={250} height={170} className="preview-canvas" />
                <span style={{ fontSize: 13, color: "#cbd5e1" }}>{currentColor.name}</span>
              </div>

              <div>
                <div className="option-block">
                  <div className="option-label">Renk (Sol/Sağ)</div>
                  <div className="btn-row" style={{ justifyContent: "flex-start" }}>
                    {SHIP_COLORS.map((c, i) => (
                      <button
                        key={c.name}
                        className={`btn btn-chip ${i === colorIdx ? "active" : ""}`}
                        onClick={() => setColorIdx(i)}
                      >
                        <span className="color-dot" style={{ backgroundColor: c.hex }} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="option-block">
                  <div className="option-label">Gövde Şekli (Yukarı/Aşağı)</div>
                  <div className="btn-row" style={{ justifyContent: "flex-start" }}>
                    {(
                      [
                        ["delta", "Delta"],
                        ["vanguard", "Vanguard"],
                        ["orb", "Küre"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        className={`btn btn-chip ${shipShape === id ? "active" : ""}`}
                        onClick={() => setShipShape(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="btn-row">
              <button className="btn btn-secondary" onClick={() => setScreen("menu")}>
                Geri (○ / B)
              </button>
              <button className="btn btn-primary" onClick={() => startNewGame()}>
                Başla (X / A)
              </button>
            </div>
          </section>
        )}

        {screen === "gameover" && (
          <section className="overlay-screen">
            <div className="kicker" style={{ color: "#fb7185" }}>
              {currentMeta.title}
            </div>
            <h2 className="hero-title">OYUN BİTTİ</h2>
            <div className="stats-box">
              <div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Skor</div>
                <div className="stat-value" style={{ color: "#4ade80" }}>
                  {score}
                </div>
              </div>
              <div className="stat-divider" />
              <div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Rekor</div>
                <div className="stat-value" style={{ color: "#fde047" }}>
                  {currentBest}
                </div>
              </div>
            </div>
            <div className="btn-row">
              <button
                className={`btn btn-primary ${gamepadInfo && menuCursor === 0 ? "pad-focus" : ""}`}
                onClick={() => startNewGame()}
              >
                Tekrar Oyna (X / A)
              </button>
              <button
                className={`btn btn-secondary ${gamepadInfo && menuCursor === 1 ? "pad-focus" : ""}`}
                onClick={() => setScreen("hangar")}
              >
                Hangar (△ / Y)
              </button>
              <button
                className={`btn btn-secondary ${gamepadInfo && menuCursor === 2 ? "pad-focus" : ""}`}
                onClick={() => setScreen("library")}
              >
                Kütüphane (○ / B)
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;