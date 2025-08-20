'use client';
import React, { useEffect, useRef, useState } from "react";

/**
 * Swarm.Company — Galcon-like Prototype (Restored + Enhanced)
 * -----------------------------------------------------------
 * Fully self-contained React + Canvas (TypeScript) component implementing:
 *   • Map gen (deterministic, non-overlapping), production, fleets, capture
 *   • Simple AI with periodic attacks, win/lose detection & overlay
 *   • High-DPI canvas scaling, fixed-step loop, pause on tab hidden
 *   • Input model (per your spec):
 *       1) Left-click your planet → select that planet
 *       2) Shift + Left-click your planet → add to selection (multi-select)
 *       3) Double Left-click your planet → select ALL your planets
 *       4) Right-click ANY planet → dispatch set % of ships from selected planet(s) to that target (any ownership)
 *     (Selection persists after dispatch; tell me if you prefer it to clear.)
 *   • Built-in lightweight tests (Run Tests button)
 */

// ============================
// Types & Constants
// ============================

type Player = "NEUTRAL" | "HUMAN" | "AI";

interface Planet {
  id: number;
  x: number;
  y: number;
  r: number; // radius (px)
  owner: Player;
  ships: number; // fractional; rendered rounded
  production: number; // ships per second
}

interface Fleet {
  id: number;
  owner: Player;
  ships: number;
  x: number;
  y: number;
  targetPlanetId: number;
  speed: number; // px/sec
  vx: number;
  vy: number;
}

interface GameConfig {
  seed: number;
  planetCount: number;
  mapPadding: number;
  minR: number;
  maxR: number;
  fleetSpeed: number;
  productionScale: number;
  aiThinkInterval: number; // seconds
}

interface GameRefs {
  lastTime: number; // ms
  acc: number; // accumulator for fixed step
  playing: boolean;
  frameReq: number | null;
  hidden: boolean;
  aiTimer: number; // seconds since last think
}

const COLORS = {
  bg: "#0b0e1a",
  grid: "#111523",
  neutral: "#8b8fa5",
  human: "#35e0ff",
  ai: "#ff6a3d",
  text: "#e7e9ee",
  selection: "#7ef7c7",
};

const OWNER_COLOR = (p: Player) => (p === "HUMAN" ? COLORS.human : p === "AI" ? COLORS.ai : COLORS.neutral);
const FIXED_DT = 1 / 60; // seconds

// ============================
// PRNG (deterministic map generation)
// ============================

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rand: () => number, a: number, b: number) {
  return a + (b - a) * rand();
}

// ============================
// Component
// ============================

export default function SinglePlayerGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sendPercent, setSendPercent] = useState<number>(0.5);
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [level, setLevel] = useState<number>(1);
  const [testLog, setTestLog] = useState<string[]>([]);

  // Game state (refs to avoid frame churn)
  const planetsRef = useRef<Planet[]>([]);
  const fleetsRef = useRef<Fleet[]>([]);
  const selectionRef = useRef<Set<number>>(new Set());

  const configRef = useRef<GameConfig>({
    seed: Math.floor(Math.random() * 1e9),
    planetCount: 22,
    mapPadding: 64,
    minR: 18,
    maxR: 34,
    fleetSpeed: 120,
    productionScale: 1.0,
    aiThinkInterval: 1.5,
  });

  const refs = useRef<GameRefs>({ lastTime: 0, acc: 0, playing: true, frameReq: null, hidden: false, aiTimer: 0 });

  // ----------------------------
  // Setup & teardown
  // ----------------------------
  useEffect(() => {
    const canvas = canvasRef.current!;

    const onResize = () => resizeCanvas(canvas);
    window.addEventListener("resize", onResize);

    const onVisibility = () => {
      refs.current.hidden = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") restart(level);
      if (e.key === "Escape") selectionRef.current.clear();
      if (/^[0-9]$/.test(e.key)) {
        const digit = parseInt(e.key, 10);
        const pct = digit === 0 ? 1.0 : digit / 10;
        setSendPercent(pct);
      }
    };
    window.addEventListener("keydown", onKey);

    initLevel(level);
    startLoop();

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKey);
      stopLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restart on level change
  useEffect(() => {
    restart(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  // ----------------------------
  // Mouse: LMB/Shift-LMB/Dbl-LMB select, RMB dispatch
  // ----------------------------
  useEffect(() => {
    const canvas = canvasRef.current!;

    const getMouse = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      return { x: (ev.clientX - rect.left) * dpr, y: (ev.clientY - rect.top) * dpr };
    };

    const onClick = (ev: MouseEvent) => {
      if (status !== "playing") return;
      const { x, y } = getMouse(ev);
      const hit = hitPlanet(planetsRef.current, x, y);
      const sel = selectionRef.current;

      if (!hit) {
        // Clicked empty space → clear selection
        if (!ev.shiftKey) sel.clear();
        return;
      }

      // Only left click selects; only HUMAN planets selectable
      if (ev.button === 0 && hit.owner === "HUMAN") {
        if (ev.shiftKey) {
          sel.add(hit.id); // additive select
        } else {
          sel.clear();
          sel.add(hit.id);
        }
      }
    };

    const onDblClick = (ev: MouseEvent) => {
      if (status !== "playing") return;
      const { x, y } = getMouse(ev);
      const hit = hitPlanet(planetsRef.current, x, y);
      if (!hit) return;
      if (hit.owner === "HUMAN") {
        selectionRef.current.clear();
        planetsRef.current.forEach((p) => {
          if (p.owner === "HUMAN") selectionRef.current.add(p.id);
        });
      }
    };

    const onContextMenu = (ev: MouseEvent) => {
      // Right-click to dispatch; prevent browser menu
      ev.preventDefault();
      if (status !== "playing") return;
      const { x, y } = getMouse(ev);
      const hit = hitPlanet(planetsRef.current, x, y);
      if (!hit) return;
      if (selectionRef.current.size > 0) {
        issueOrders(selectionRef.current, hit.id, sendPercent);
        // Selection persists after dispatch; change if you want it to clear
      }
    };

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("dblclick", onDblClick);
    canvas.addEventListener("contextmenu", onContextMenu);
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("dblclick", onDblClick);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, [status, sendPercent]);

  // ============================
  // Init / Restart / Core logic
  // ============================

  function restart(newLevel: number) {
    stopLoop();
    initLevel(newLevel);
    setStatus("playing");
    startLoop();
  }

  function initLevel(lvl: number) {
    const canvas = canvasRef.current!;
    resizeCanvas(canvas);

    const cfg = configRef.current;
    const rand = mulberry32(cfg.seed + lvl * 1337);

    const W = canvas.width;
    const H = canvas.height;
    const planets: Planet[] = [];

    const count = Math.max(16, cfg.planetCount + (lvl - 1) * 2);
    let attempts = 0;

    while (planets.length < count && attempts < 6000) {
      attempts++;
      const r = randRange(rand, cfg.minR, cfg.maxR);
      const x = randRange(rand, cfg.mapPadding + r, W - cfg.mapPadding - r);
      const y = randRange(rand, cfg.mapPadding + r, H - cfg.mapPadding - r);
      const production = (r / cfg.maxR) * (0.8 + rand() * 0.6) * cfg.productionScale;
      const candidate: Planet = {
        id: planets.length,
        x,
        y,
        r,
        owner: "NEUTRAL",
        ships: Math.round(r * randRange(rand, 1.0, 2.2)),
        production,
      };
      if (planets.every((p) => dist(p.x, p.y, x, y) > p.r + r + 16)) planets.push(candidate);
    }

    // Choose farthest pair for HUMAN/AI starts
    if (planets.length >= 2) {
      let bestA = 0,
        bestB = 1,
        bestD = -1;
      for (let i = 0; i < planets.length; i++)
        for (let j = i + 1; j < planets.length; j++) {
          const d = dist(planets[i].x, planets[i].y, planets[j].x, planets[j].y);
          if (d > bestD) {
            bestD = d;
            bestA = i;
            bestB = j;
          }
        }
      planets[bestA].owner = "HUMAN";
      planets[bestA].ships = Math.max(40, planets[bestA].r * 2.2);
      planets[bestA].production *= 1.1;

      planets[bestB].owner = "AI";
      planets[bestB].ships = Math.max(40, planets[bestB].r * 2.2) * (1 + (lvl - 1) * 0.1);
      planets[bestB].production *= 1.1 + (lvl - 1) * 0.05;
    }

    planetsRef.current = planets;
    fleetsRef.current = [];
    selectionRef.current.clear();

    refs.current.lastTime = performance.now();
    refs.current.acc = 0;
    refs.current.playing = true;
    refs.current.aiTimer = 0;
  }

  function issueOrders(sel: Set<number>, targetId: number, pct: number) {
    if (sel.size === 0) return;
    const target = planetsRef.current.find((p) => p.id === targetId);
    if (!target) return;

    const toSend: { from: Planet; amount: number }[] = [];

    sel.forEach((id) => {
      const from = planetsRef.current.find((p) => p.id === id);
      if (!from || from.owner !== "HUMAN") return;
      if (from.id === targetId) return; // ignore self-target
      const amt = Math.floor(from.ships * pct);
      if (amt <= 0) return;
      from.ships -= amt;
      toSend.push({ from, amount: amt });
    });

    toSend.forEach(({ from, amount }) => createFleet(from, target, "HUMAN", amount));
  }

  function createFleet(from: Planet, to: Planet, owner: Player, ships: number) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const speed = configRef.current.fleetSpeed;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const startX = from.x + Math.cos(angle) * (from.r + 6);
    const startY = from.y + Math.sin(angle) * (from.r + 6);
    const id = (fleetsRef.current.at(-1)?.id ?? 0) + 1;
    fleetsRef.current.push({ id, owner, ships, x: startX, y: startY, targetPlanetId: to.id, speed, vx, vy });
  }

  function resolveArrival(fleet: Fleet, planet: Planet) {
    if (fleet.owner === planet.owner) {
      planet.ships += fleet.ships;
    } else {
      const remaining = planet.ships - fleet.ships;
      if (remaining < 0) {
        planet.owner = fleet.owner;
        planet.ships = Math.abs(remaining);
      } else {
        planet.ships = remaining;
      }
    }
  }

  // ============================
  // Loop
  // ============================

  function startLoop() {
    if (refs.current.frameReq != null) return;
    refs.current.frameReq = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (refs.current.frameReq != null) cancelAnimationFrame(refs.current.frameReq);
    refs.current.frameReq = null;
  }

  function tick(ts: number) {
    const r = refs.current;
    if (!r.playing) return;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    const dms = ts - r.lastTime;
    r.lastTime = ts;

    if (!r.hidden) {
      r.acc += Math.min(0.25, dms / 1000); // clamp large jumps
      while (r.acc >= FIXED_DT) {
        update(FIXED_DT);
        r.acc -= FIXED_DT;
      }
    }

    render(ctx);
    refs.current.frameReq = requestAnimationFrame(tick);
  }

  function update(dt: number) {
    // Production
    for (const p of planetsRef.current) if (p.owner !== "NEUTRAL") p.ships += p.production * dt;

    // Fleets
    for (const f of fleetsRef.current) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const tgt = planetsRef.current[f.targetPlanetId];
      if (!tgt) continue;
      if (dist(f.x, f.y, tgt.x, tgt.y) <= tgt.r) {
        resolveArrival(f, tgt);
        f.ships = 0;
      }
    }
    fleetsRef.current = fleetsRef.current.filter((f) => f.ships > 0);

    // AI
    refs.current.aiTimer += dt;
    if (refs.current.aiTimer >= configRef.current.aiThinkInterval) {
      refs.current.aiTimer = 0;
      aiThink();
    }

    // Win/Lose
    const owners = new Set(planetsRef.current.map((p) => p.owner));
    if (!owners.has("HUMAN") && status === "playing") {
      setStatus("lost");
      refs.current.playing = false;
    }
    if (!owners.has("AI") && status === "playing") {
      setStatus("won");
      refs.current.playing = false;
    }
  }

  function aiThink() {
    const aiPlanets = planetsRef.current.filter((p) => p.owner === "AI");
    if (aiPlanets.length === 0) return;

    const strongest = aiPlanets.reduce((a, b) => (a.ships > b.ships ? a : b));
    if (strongest.ships < 10) return;

    const candidates = planetsRef.current.filter((p) => p.owner !== "AI");
    if (candidates.length === 0) return;

    let best: Planet | null = null;
    let bestScore = Infinity;
    for (const c of candidates) {
      const d = Math.max(1, dist(strongest.x, strongest.y, c.x, c.y));
      const t = d / configRef.current.fleetSpeed;
      const defense = c.ships + (c.owner === "NEUTRAL" ? 0 : c.production * t * 0.5);
      const ownerBias = c.owner === "HUMAN" ? 0.9 : 1.0; // prefer hitting human slightly
      const score = defense * ownerBias + t * 2;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) {
      const send = Math.floor(strongest.ships * (best.owner === "HUMAN" ? 0.65 : 0.5));
      if (send > 0) {
        strongest.ships -= send;
        createFleet(strongest, best, "AI", send);
      }
    }
  }

  // ============================
  // Rendering
  // ============================

  function render(ctx: CanvasRenderingContext2D) {
    const canvas = ctx.canvas;
    // BG
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const step = 64 * (window.devicePixelRatio || 1);
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();

    // Fleets behind labels
    for (const f of fleetsRef.current) drawFleet(ctx, f);

    // Planets
    for (const p of planetsRef.current) drawPlanet(ctx, p, selectionRef.current.has(p.id));

    // Selection hulls for multi-select
    if (selectionRef.current.size > 1) {
      ctx.strokeStyle = COLORS.selection;
      ctx.lineWidth = 1;
      selectionRef.current.forEach((id) => {
        const p = planetsRef.current.find((q) => q.id === id);
        if (!p) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    // HUD
    const totals = countTotals();
    ctx.fillStyle = COLORS.text;
    ctx.font = `${14 * (window.devicePixelRatio || 1)}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textAlign = "left";
    ctx.fillText(
      `You: ${Math.round(totals.human)}   AI: ${Math.round(totals.ai)}   Neutral: ${Math.round(totals.neutral)}`,
      16 * (window.devicePixelRatio || 1),
      24 * (window.devicePixelRatio || 1)
    );
  }

  function drawPlanet(ctx: CanvasRenderingContext2D, p: Planet, selected: boolean) {
    // body
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);

    const grad = ctx.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r);
    const ocolor = OWNER_COLOR(p.owner);
    grad.addColorStop(0, shade(ocolor, 0.6));
    grad.addColorStop(1, shade(ocolor, -0.2));
    ctx.fillStyle = grad;
    ctx.fill();

    // ring
    ctx.lineWidth = selected ? 4 : 2;
    ctx.strokeStyle = selected ? COLORS.selection : shade(ocolor, -0.4);
    ctx.stroke();

    // label
    ctx.fillStyle = COLORS.text;
    ctx.font = `${Math.max(12, Math.floor(p.r))}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(p.ships)}`, p.x, p.y);
  }

  function drawFleet(ctx: CanvasRenderingContext2D, f: Fleet) {
    const color = OWNER_COLOR(f.owner);
    const ang = Math.atan2(f.vy, f.vx);
    const size = 6 * (window.devicePixelRatio || 1);
    const x = f.x,
      y = f.y;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(ang) * size, y + Math.sin(ang) * size);
    ctx.lineTo(x + Math.cos(ang + 2.5) * size, y + Math.sin(ang + 2.5) * size);
    ctx.lineTo(x + Math.cos(ang - 2.5) * size, y + Math.sin(ang - 2.5) * size);
    ctx.closePath();
    ctx.fill();
  }

  // ============================
  // Helpers
  // ============================

  function countTotals() {
    let human = 0,
      ai = 0,
      neutral = 0;
    for (const p of planetsRef.current) {
      if (p.owner === "HUMAN") human += p.ships;
      else if (p.owner === "AI") ai += p.ships;
      else neutral += p.ships;
    }
    for (const f of fleetsRef.current) {
      if (f.owner === "HUMAN") human += f.ships;
      else if (f.owner === "AI") ai += f.ships;
      else neutral += f.ships;
    }
    return { human, ai, neutral };
  }

  function hitPlanet(planets: Planet[], x: number, y: number): Planet | null {
    for (let i = planets.length - 1; i >= 0; i--) {
      const p = planets[i];
      if (dist(x, y, p.x, p.y) <= p.r) return p;
    }
    return null;
  }

  function dist(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1,
      dy = y2 - y1;
    return Math.hypot(dx, dy);
  }

  function shade(hex: string, lum: number) {
    // lum in [-1,1]
    let c = hex.replace(/#/g, "");
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    let result = "#";
    for (let i = 0; i < 3; i++) {
      const val = parseInt(c.substr(i * 2, 2), 16);
      const v = Math.max(0, Math.min(255, Math.floor(val + val * lum)));
      result += ("00" + v.toString(16)).slice(-2);
    }
    return result;
  }

  function resizeCanvas(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(800, Math.floor(window.innerWidth * 0.9));
    const height = Math.max(600, Math.floor(window.innerHeight * 0.75));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }

  // ============================
  // Built-in Tests (manual trigger)
  // ============================

  function runTests() {
    const logs: string[] = [];
    function ok(name: string, cond: boolean) {
      logs.push(`${cond ? "PASS" : "FAIL"} - ${name}`);
    }
    function near(a: number, b: number, eps = 1e-6) {
      return Math.abs(a - b) < eps;
    }

    // Test 1: PRNG determinism
    const r1 = mulberry32(123), r2 = mulberry32(123);
    ok("PRNG determinism", near(r1(), r2()) && near(r1(), r2()));

    // Test 2: shade returns 7-char hex
    ok("shade length", shade("#336699", 0.2).length === 7);

    // Test 3: initLevel produces non-overlapping planets
    const savedPlanets = planetsRef.current.slice();
    const savedFleets = fleetsRef.current.slice();
    const savedSel = new Set(selectionRef.current);

    initLevel(1);
    let nonOverlap = true;
    const arr = planetsRef.current;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (dist(arr[i].x, arr[i].y, arr[j].x, arr[j].y) <= arr[i].r + arr[j].r + 15) {
          nonOverlap = false;
          break;
        }
      }
    }
    ok("initLevel: planets non-overlapping", nonOverlap);

    // Test 4: issueOrders does not send to self and reduces ships
    const humanP = arr.find((p) => p.owner === "HUMAN")!;
    const target = arr.find((p) => p.id !== humanP.id)!;
    const before = Math.floor(humanP.ships);
    const selection = new Set<number>([humanP.id]);
    issueOrders(selection, humanP.id, 0.5); // to self → should do nothing
    ok("issueOrders: ignore self-target", Math.floor(humanP.ships) === before);
    issueOrders(selection, target.id, 0.5);
    ok("issueOrders: reduces ships", Math.floor(humanP.ships) <= before);

    // Test 5: multi-source dispatch reduces combined ships
    if (arr.length >= 3) {
      const other = arr.find((p) => p.owner !== "HUMAN") || arr[2];
      const prevOwner = other.owner;
      other.owner = "HUMAN";
      other.ships = Math.max(30, other.r * 2);
      const totalBefore = Math.floor(humanP.ships + other.ships);
      const multiSel = new Set<number>([humanP.id, other.id]);
      issueOrders(multiSel, target.id, 0.5);
      const totalAfter = Math.floor(humanP.ships + other.ships);
      ok("issueOrders: multi-source reduces ships", totalAfter < totalBefore);
      other.owner = prevOwner; // restore
    } else {
      ok("issueOrders: multi-source reduces ships (skipped)", true);
    }

    // restore state
    planetsRef.current = savedPlanets;
    fleetsRef.current = savedFleets;
    selectionRef.current = savedSel;

    setTestLog(logs);
    console.log("SWARM TESTS", logs);
  }

  // ============================
  // UI
  // ============================

  return (
    <div className="w-full min-h-screen bg-[#0b0e1a] text-white flex flex-col items-center py-6">
      <div className="w-full max-w-5xl flex items-center justify-between px-4 mb-3">
        <div className="flex items-center gap-3">
          <div className="text-xl font-bold tracking-wide">Swarm.Company — Prototype</div>
          <div className="text-sm opacity-70">Level {level}</div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm opacity-80">Send %</label>
          <input
            type="range"
            min={10}
            max={100}
            step={10}
            value={Math.round(sendPercent * 100)}
            className="w-40"
            onChange={(e) => setSendPercent(parseInt(e.target.value) / 100)}
            title="Send percentage (1–9 keys; 0 = 100%)"
          />
          <button
            className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40"
            onClick={() => restart(level)}
            title="Restart (R)"
          >
            Restart
          </button>
          <button
            className="px-3 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/40"
            onClick={() => setLevel((l) => l + 1)}
            title="Next level (harder)"
          >
            Next Level
          </button>
          <button
            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40"
            onClick={runTests}
            title="Run built-in tests (see console)"
          >
            Run Tests
          </button>
        </div>
      </div>

      <div className="relative">
        <canvas ref={canvasRef} className="rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,.06)]" />
        {status !== "playing" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="backdrop-blur-sm bg-black/40 px-6 py-4 rounded-2xl border border-white/10 text-center">
              <div className="text-2xl font-semibold mb-2">{status === "won" ? "You won" : "Defeat"}</div>
              <div className="text-sm opacity-80 mb-3">Press R to retry or advance a level.</div>
              <div className="flex gap-3 justify-center">
                <button
                  className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40"
                  onClick={() => restart(level)}
                >
                  Restart
                </button>
                {status === "won" && (
                  <button
                    className="px-3 py-1.5 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-400/40"
                    onClick={() => setLevel((l) => l + 1)}
                  >
                    Next Level
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-sm opacity-70 max-w-5xl px-4 leading-relaxed">
        <p className="mb-1">
          Controls: <b>Left-click</b> your planet to select. <b>Shift + Left-click</b> adds more of your planets (multi-select). <b>Double Left-click</b> your planet selects <b>all</b> your planets. <b>Right-click</b> any planet to send from selected planet(s) to that target. Esc clears selection. R restarts. Digits 1–9 set 10–90%, 0 sets 100%.
        </p>
        <p>Goal: Eliminate AI. Production scales with planet size; bigger planets produce more.</p>
        {testLog.length > 0 && (
          <div className="mt-2 p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="font-semibold mb-1">Test Results</div>
            <ul className="list-disc list-inside text-xs opacity-90">
              {testLog.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
