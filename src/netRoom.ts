import { Difficulty, GameId } from "./types";

const FIREBASE_DB_URL =
  "https://arcade-hub-mp-default-rtdb.europe-west1.firebasedatabase.app";

export interface RoomPlayer {
  id: string;
  slot: 1 | 2 | 3 | 4;
  name: string;
  ready?: boolean;
  lastSeen?: number;
}

export interface RoomSnapshot {
  roomCode: string;
  hostId: string;
  gameId: GameId;
  difficulty: Difficulty;
  matchSeq?: number;
  players: RoomPlayer[];
}

export interface RemotePadInput {
  x: number;
  y: number;
  action: boolean;
}

export type RoomEvent =
  | { type: "room_state"; state: RoomSnapshot; mySlot: 1 | 2 | 3 | 4; myId: string }
  | { type: "match_started"; gameId: GameId; difficulty: Difficulty }
  | { type: "player_input"; slot: 1 | 2 | 3 | 4; input: RemotePadInput }
  | { type: "error"; message: string }
  | { type: "status"; message: string };

type Listener = (ev: RoomEvent) => void;

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function dbUrl(path: string): string {
  const base = FIREBASE_DB_URL.replace(/\/+$/, "");
  const clean = path.replace(/^\/+/, "");
  return `${base}/${clean}.json`;
}

function sseUrl(path: string): string {
  const base = FIREBASE_DB_URL.replace(/\/+$/, "");
  const clean = path.replace(/^\/+/, "");
  return `${base}/${clean}.json`;
}

class FirebaseRoomClient {
  private listeners = new Set<Listener>();
  private myId = `u_${Math.random().toString(36).slice(2, 8)}`;
  private mySlot: 1 | 2 | 3 | 4 = 1;
  private roomCode = "";
  private snapshot: RoomSnapshot | null = null;
  private lastMatchSeq = 0;

  private roomStream: EventSource | null = null;
  private inputsStream: EventSource | null = null;
  private pollTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private lastSentInputSig = "";
  private lastInputSendAt = 0;

  public subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    if (this.snapshot) {
      fn({
        type: "room_state",
        state: this.snapshot,
        mySlot: this.mySlot,
        myId: this.myId,
      });
    }
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(ev: RoomEvent): void {
    this.listeners.forEach((fn) => fn(ev));
  }

  private normalizeRoom(code: string, raw: unknown): RoomSnapshot | null {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    const rawPlayers = obj.players;

    let playersList: RoomPlayer[] = [];
    if (Array.isArray(rawPlayers)) {
      playersList = rawPlayers.filter((p): p is RoomPlayer => Boolean(p && typeof p === "object"));
    } else if (rawPlayers && typeof rawPlayers === "object") {
      playersList = Object.values(rawPlayers as Record<string, RoomPlayer>).filter(Boolean);
    }

    playersList.sort((a, b) => a.slot - b.slot);

    return {
      roomCode: code,
      hostId: typeof obj.hostId === "string" ? obj.hostId : playersList[0]?.id || this.myId,
      gameId: (obj.gameId as GameId) || "orbit",
      difficulty: (obj.difficulty as Difficulty) || "normal",
      matchSeq: typeof obj.matchSeq === "number" ? obj.matchSeq : 0,
      players: playersList,
    };
  }

  private async fetchRoom(code: string): Promise<RoomSnapshot | null> {
    try {
      const res = await fetch(dbUrl(`rooms/${code}`), { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return this.normalizeRoom(code, data);
    } catch {
      return null;
    }
  }

  private async putRoom(snap: RoomSnapshot): Promise<void> {
    const playersMap: Record<string, RoomPlayer> = {};
    for (const p of snap.players) {
      playersMap[p.id] = p;
    }

    await fetch(dbUrl(`rooms/${snap.roomCode}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomCode: snap.roomCode,
        hostId: snap.hostId,
        gameId: snap.gameId,
        difficulty: snap.difficulty,
        matchSeq: snap.matchSeq ?? 0,
        players: playersMap,
      }),
    });
  }

  private handleIncomingRoomData(code: string, raw: unknown): void {
    const snap = this.normalizeRoom(code, raw);
    if (!snap) return;

    this.snapshot = snap;
    const me = snap.players.find((p) => p.id === this.myId);
    if (me) {
      this.mySlot = me.slot;
    }

    this.emit({
      type: "room_state",
      state: snap,
      mySlot: this.mySlot,
      myId: this.myId,
    });

    if (typeof snap.matchSeq === "number" && snap.matchSeq > this.lastMatchSeq) {
      this.lastMatchSeq = snap.matchSeq;
      this.emit({
        type: "match_started",
        gameId: snap.gameId,
        difficulty: snap.difficulty,
      });
    }
  }

  private startListeners(code: string): void {
    this.stopListeners();

    if (typeof EventSource !== "undefined") {
      try {
        const esRoom = new EventSource(sseUrl(`rooms/${code}`));
        esRoom.addEventListener("put", (evt: MessageEvent) => {
          try {
            const parsed = JSON.parse(evt.data);
            if (parsed.path === "/") {
              this.handleIncomingRoomData(code, parsed.data);
            } else if (this.snapshot) {
              const updated = { ...this.snapshot };
              const seg = String(parsed.path || "").replace(/^\/+/, "");
              if (seg === "gameId") updated.gameId = parsed.data;
              else if (seg === "difficulty") updated.difficulty = parsed.data;
              else if (seg === "matchSeq") updated.matchSeq = parsed.data;
              else if (seg === "hostId") updated.hostId = parsed.data;
              this.handleIncomingRoomData(code, updated);
            }
          } catch {
            // ignore malformed sse frame
          }
        });
        esRoom.addEventListener("patch", (evt: MessageEvent) => {
          try {
            const parsed = JSON.parse(evt.data);
            if (this.snapshot && parsed.data && typeof parsed.data === "object") {
              const merged = { ...this.snapshot, ...parsed.data };
              this.handleIncomingRoomData(code, merged);
            }
          } catch {
            // ignore
          }
        });
        this.roomStream = esRoom;
      } catch {
        // fallback polling will keep it updated
      }

      try {
        const esInputs = new EventSource(sseUrl(`rooms/${code}/inputs`));
        const applySlotInput = (slotKey: string, val: unknown) => {
          const slotNum = Number(slotKey) as 1 | 2 | 3 | 4;
          if (![1, 2, 3, 4].includes(slotNum)) return;
          if (slotNum === this.mySlot) return;
          if (!val || typeof val !== "object") return;
          const v = val as Record<string, unknown>;
          if (v.senderId === this.myId) return;
          this.emit({
            type: "player_input",
            slot: slotNum,
            input: {
              x: Number(v.x) || 0,
              y: Number(v.y) || 0,
              action: Boolean(v.action),
            },
          });
        };

        esInputs.addEventListener("put", (evt: MessageEvent) => {
          try {
            const parsed = JSON.parse(evt.data);
            const path = String(parsed.path || "");
            if (path === "/" && parsed.data && typeof parsed.data === "object") {
              Object.entries(parsed.data as Record<string, unknown>).forEach(([k, v]) =>
                applySlotInput(k, v)
              );
            } else {
              const slotMatch = path.match(/^\/([1-4])(?:\/|$)/);
              if (slotMatch) {
                if (path === `/${slotMatch[1]}`) {
                  applySlotInput(slotMatch[1], parsed.data);
                } else {
                  applySlotInput(slotMatch[1], {
                    ...((parsed.data && typeof parsed.data === "object"
                      ? parsed.data
                      : {}) as Record<string, unknown>),
                  });
                }
              }
            }
          } catch {
            // ignore
          }
        });
        this.inputsStream = esInputs;
      } catch {
        // ignore
      }
    }

    this.pollTimer = window.setInterval(async () => {
      if (!this.roomCode) return;
      const latest = await this.fetchRoom(this.roomCode);
      if (latest) {
        this.handleIncomingRoomData(this.roomCode, latest);
      }

      try {
        const res = await fetch(dbUrl(`rooms/${this.roomCode}/inputs`), { cache: "no-store" });
        if (res.ok) {
          const map = await res.json();
          if (map && typeof map === "object") {
            ([1, 2, 3, 4] as const).forEach((s) => {
              if (s === this.mySlot) return;
              const entry = (map as Record<string, unknown>)[String(s)];
              if (entry && typeof entry === "object") {
                const e = entry as Record<string, unknown>;
                if (e.senderId && e.senderId !== this.myId) {
                  this.emit({
                    type: "player_input",
                    slot: s,
                    input: {
                      x: Number(e.x) || 0,
                      y: Number(e.y) || 0,
                      action: Boolean(e.action),
                    },
                  });
                }
              }
            });
          }
        }
      } catch {
        // ignore network hiccup
      }
    }, 180);

    this.heartbeatTimer = window.setInterval(async () => {
      if (!this.roomCode || !this.snapshot) return;
      try {
        await fetch(dbUrl(`rooms/${this.roomCode}/players/${this.myId}/lastSeen`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Date.now()),
        });
      } catch {
        // ignore
      }
    }, 3000);
  }

  private stopListeners(): void {
    if (this.roomStream) {
      this.roomStream.close();
      this.roomStream = null;
    }
    if (this.inputsStream) {
      this.inputsStream.close();
      this.inputsStream = null;
    }
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  public async createRoom(
    gameId: GameId,
    difficulty: Difficulty,
    name = "Oyuncu 1"
  ): Promise<void> {
    const code = generateCode();
    this.roomCode = code;
    this.mySlot = 1;
    this.lastMatchSeq = 0;

    const snap: RoomSnapshot = {
      roomCode: code,
      hostId: this.myId,
      gameId,
      difficulty,
      matchSeq: 0,
      players: [
        { id: this.myId, slot: 1, name, ready: true, lastSeen: Date.now() },
      ],
    };

    try {
      await this.putRoom(snap);
      this.snapshot = snap;
      this.startListeners(code);
      this.emit({ type: "status", message: `Bulut odası kuruldu: ${code}` });
      this.emit({ type: "room_state", state: snap, mySlot: 1, myId: this.myId });
    } catch {
      this.emit({
        type: "error",
        message: "Firebase'e bağlanılamadı. Realtime Database kurallarını kontrol et.",
      });
    }
  }

  public async joinRoom(rawCode: string, name?: string): Promise<void> {
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      this.emit({ type: "error", message: "Lütfen bir oda kodu gir." });
      return;
    }

    const existing = await this.fetchRoom(code);
    if (!existing) {
      this.emit({
        type: "error",
        message: `"${code}" odası bulunamadı. Kodu kontrol et.`,
      });
      return;
    }

    if (existing.players.length >= 4) {
      this.emit({ type: "error", message: "Bu oda dolu (en fazla 4 oyuncu)." });
      return;
    }

    const usedSlots = new Set(existing.players.map((p) => p.slot));
    const freeSlot = ([1, 2, 3, 4] as const).find((s) => !usedSlots.has(s));
    if (!freeSlot) {
      this.emit({ type: "error", message: "Boş oyuncu yuvası yok." });
      return;
    }

    this.roomCode = code;
    this.mySlot = freeSlot;
    this.lastMatchSeq = existing.matchSeq ?? 0;

    const newPlayer: RoomPlayer = {
      id: this.myId,
      slot: freeSlot,
      name: name?.trim() || `Oyuncu ${freeSlot}`,
      ready: true,
      lastSeen: Date.now(),
    };

    try {
      await fetch(dbUrl(`rooms/${code}/players/${this.myId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPlayer),
      });

      const updated = (await this.fetchRoom(code)) || {
        ...existing,
        players: [...existing.players, newPlayer],
      };

      this.snapshot = updated;
      this.startListeners(code);
      this.emit({
        type: "status",
        message: `${code} odasına P${freeSlot} olarak bağlandın.`,
      });
      this.emit({
        type: "room_state",
        state: updated,
        mySlot: this.mySlot,
        myId: this.myId,
      });
    } catch {
      this.emit({ type: "error", message: "Odaya katılırken ağ hatası oluştu." });
    }
  }

  public async updateRoomSettings(gameId: GameId, difficulty: Difficulty): Promise<void> {
    if (!this.snapshot || !this.roomCode) return;
    const updated: RoomSnapshot = {
      ...this.snapshot,
      gameId,
      difficulty,
    };
    this.snapshot = updated;
    try {
      await fetch(dbUrl(`rooms/${this.roomCode}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, difficulty }),
      });
    } catch {
      // ignore
    }
  }

  public async startMatch(): Promise<void> {
    if (!this.snapshot || !this.roomCode) return;
    const nextSeq = (this.snapshot.matchSeq ?? 0) + 1;
    this.lastMatchSeq = nextSeq;

    const updated: RoomSnapshot = {
      ...this.snapshot,
      matchSeq: nextSeq,
    };
    this.snapshot = updated;

    try {
      await fetch(dbUrl(`rooms/${this.roomCode}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: updated.gameId,
          difficulty: updated.difficulty,
          matchSeq: nextSeq,
        }),
      });
    } catch {
      // ignore
    }

    this.emit({
      type: "match_started",
      gameId: updated.gameId,
      difficulty: updated.difficulty,
    });
  }

  public sendInput(input: RemotePadInput): void {
    if (!this.roomCode) return;
    const rx = Math.round(input.x * 100) / 100;
    const ry = Math.round(input.y * 100) / 100;
    const act = Boolean(input.action);
    const sig = `${rx},${ry},${act ? 1 : 0}`;
    const now = performance.now();

    if (sig === this.lastSentInputSig && now - this.lastInputSendAt < 140) {
      return;
    }
    if (now - this.lastInputSendAt < 45) {
      return;
    }

    this.lastSentInputSig = sig;
    this.lastInputSendAt = now;

    fetch(dbUrl(`rooms/${this.roomCode}/inputs/${this.mySlot}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: this.myId,
        x: rx,
        y: ry,
        action: act,
        t: Date.now(),
      }),
    }).catch(() => {});
  }

  public async leaveRoom(): Promise<void> {
    const code = this.roomCode;
    const snap = this.snapshot;
    this.stopListeners();

    if (code && snap) {
      const remaining = snap.players.filter((p) => p.id !== this.myId);
      try {
        await fetch(dbUrl(`rooms/${code}/players/${this.myId}`), {
          method: "DELETE",
        });
        await fetch(dbUrl(`rooms/${code}/inputs/${this.mySlot}`), {
          method: "DELETE",
        });

        if (remaining.length === 0) {
          await fetch(dbUrl(`rooms/${code}`), { method: "DELETE" });
        } else if (snap.hostId === this.myId) {
          await fetch(dbUrl(`rooms/${code}/hostId`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(remaining[0].id),
          });
        }
      } catch {
        // ignore
      }
    }

    this.roomCode = "";
    this.snapshot = null;
    this.mySlot = 1;
    this.lastMatchSeq = 0;
    this.emit({ type: "status", message: "Odadan ayrıldın." });
  }
}

export const roomClient = new FirebaseRoomClient();