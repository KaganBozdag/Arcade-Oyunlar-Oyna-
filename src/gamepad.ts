export type ControllerFamily = "ps5" | "ps4" | "xbox" | "generic";

export interface ControllerState {
  connected: boolean;
  family: ControllerFamily;
  label: string;
  x: number;
  y: number;
  ax: number;
  ay: number;
  dLeft: number;
  dRight: number;
  dUp: number;
  dDown: number;
  actionHeld: boolean;
  focusHeld: boolean;
  downHeld: boolean;
  upHeld: boolean;
  confirmPressed: boolean; // A (Xbox) / X (PS4 & PS5)
  backPressed: boolean; // B (Xbox) / Circle (PS4 & PS5)
  hangarPressed: boolean; // Y (Xbox) / Triangle (PS4 & PS5)
  pauseOrLibPressed: boolean; // Menu / Options (index 9)
  prevTabPressed: boolean; // LB / L1 (index 4)
  nextTabPressed: boolean; // RB / R1 (index 5)
}

export function detectControllerFamily(gp?: Gamepad | null): ControllerFamily {
  if (!gp || !gp.connected) return "generic";
  const id = gp.id.toLowerCase();

  if (id.includes("dualsense") || id.includes("054c") && id.includes("0ce6")) {
    return "ps5";
  }
  if (
    id.includes("dualshock") ||
    id.includes("wireless controller") ||
    id.includes("054c")
  ) {
    return "ps4";
  }
  if (id.includes("xbox") || id.includes("045e") || id.includes("xinput")) {
    return "xbox";
  }
  return "generic";
}

export function formatConnectedPadsSummary(pads: Gamepad[]): string {
  if (pads.length === 0) return "";
  if (pads.length === 1) {
    const fam = detectControllerFamily(pads[0]);
    if (fam === "ps5") return "PS5 DualSense Bağlı";
    if (fam === "ps4") return "PS4 DualShock 4 Bağlı";
    if (fam === "xbox") return "Xbox One / Series Bağlı";
    return "Gamepad Bağlı";
  }

  const counts = { ps5: 0, ps4: 0, xbox: 0, generic: 0 };
  for (const p of pads) {
    counts[detectControllerFamily(p)] += 1;
  }

  const parts: string[] = [];
  if (counts.ps5 > 0) parts.push(`${counts.ps5}x PS5`);
  if (counts.ps4 > 0) parts.push(`${counts.ps4}x PS4`);
  if (counts.xbox > 0) parts.push(`${counts.xbox}x Xbox`);
  if (counts.generic > 0) parts.push(`${counts.generic}x Kol`);
  return `${pads.length} Kol (${parts.join(", ")})`;
}

export function readControllerState(
  gp: Gamepad | undefined | null,
  prevButtons: Record<number, boolean>,
  isInGame: boolean
): ControllerState {
  const family = detectControllerFamily(gp);
  if (!gp || !gp.connected) {
    return {
      connected: false,
      family,
      label: "",
      x: 0,
      y: 0,
      ax: 0,
      ay: 0,
      dLeft: 0,
      dRight: 0,
      dUp: 0,
      dDown: 0,
      actionHeld: false,
      focusHeld: false,
      downHeld: false,
      upHeld: false,
      confirmPressed: false,
      backPressed: false,
      hangarPressed: false,
      pauseOrLibPressed: false,
      prevTabPressed: false,
      nextTabPressed: false,
    };
  }

  const deadzone = 0.2;
  const rawAx = gp.axes[0] ?? 0;
  const rawAy = gp.axes[1] ?? 0;
  const ax = Math.abs(rawAx) > deadzone ? rawAx : 0;
  const ay = Math.abs(rawAy) > deadzone ? rawAy : 0;

  const isPressed = (idx: number): boolean => Boolean(gp.buttons[idx]?.pressed);
  const analogVal = (idx: number): number => gp.buttons[idx]?.value ?? 0;
  const justPressed = (idx: number): boolean => isPressed(idx) && !prevButtons[idx];

  const dUp = isPressed(12) ? -1 : 0;
  const dDown = isPressed(13) ? 1 : 0;
  const dLeft = isPressed(14) ? -1 : 0;
  const dRight = isPressed(15) ? 1 : 0;

  // Standart mapping:
  // 0: A (Xbox) / Cross (PS4, PS5)
  // 1: B (Xbox) / Circle (PS4, PS5)
  // 2: X (Xbox) / Square (PS4, PS5)
  // 3: Y (Xbox) / Triangle (PS4, PS5)
  // 4: LB / L1 | 5: RB / R1
  // 6: LT / L2 | 7: RT / R2
  // 9: Menu / Options
  const lTriggerOrBumper = analogVal(6) > 0.25 || isPressed(6) || isPressed(4);
  const rTriggerOrSquare =
    analogVal(7) > 0.35 || isPressed(7) || isPressed(2) || isPressed(5);

  const actionHeld = rTriggerOrSquare || (isInGame && isPressed(0));
  const focusHeld = lTriggerOrBumper;
  const downHeld = ay > 0.45 || dDown > 0 || (isInGame && isPressed(1));
  const upHeld = ay < -0.45 || dUp < 0;

  const label =
    family === "ps5"
      ? "PS5 DualSense"
      : family === "ps4"
      ? "PS4 DualShock 4"
      : family === "xbox"
      ? "Xbox One/Series"
      : "Gamepad";

  return {
    connected: true,
    family,
    label,
    x: ax + dLeft + dRight,
    y: ay + dUp + dDown,
    ax,
    ay,
    dLeft,
    dRight,
    dUp,
    dDown,
    actionHeld,
    focusHeld,
    downHeld,
    upHeld,
    confirmPressed: justPressed(0),
    backPressed: justPressed(1),
    hangarPressed: justPressed(3),
    pauseOrLibPressed: justPressed(9),
    prevTabPressed: justPressed(4),
    nextTabPressed: justPressed(5),
  };
}

export function snapshotButtons(gp?: Gamepad | null): Record<number, boolean> {
  const map: Record<number, boolean> = {};
  if (!gp || !gp.connected) return map;
  gp.buttons.forEach((b, idx) => {
    map[idx] = Boolean(b?.pressed);
  });
  return map;
}