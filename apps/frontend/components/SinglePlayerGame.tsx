'use client';
import React, { useEffect, useRef, useState } from "react";
import shipImg from "../public/ship.png";

/**
 * Swarm.Company — Galcon-like Prototype (Obstacle Avoid + Cohesion + Chunked Swarms)
 * ----------------------------------------------------------------------------------
 * What this build includes:
 *  • Deterministic map, size-scaled production, fleets, capture
 *  • AI with periodic attacks, win/lose overlay
 *  • High-DPI canvas scaling, fixed-step loop, pause on tab hidden
 *  • Input model:
 *      - Left-click your planet → select that planet
 *      - Shift + Left-click your planet → toggle selection (multi-select)
 *      - Double Left-click your planet → select ALL your planets
 *      - Right-click ANY planet → dispatch set % from selected planet(s) to that target
 *      - Mouse wheel over canvas → adjust Send% in 5% steps (min 5%)
 *  • Fleets:
 *      - Chunked into multiple objects (caps at 65 ships per object)
 *      - Triangles size by ship count (1–5 small, 6–15 medium, 16–35 large, 36–65 larger)
 *      - Launch spread (angle fan + lateral offset) so ships don't overlap on exit
 *      - **Cohesion**: after a short burst, ships tighten into formation (no drifting apart)
 *      - **Obstacle avoidance**: ships curve around intervening planets; on target they **collide**, no orbiting
 *      - Fleets are selectable (like planets); Shift allows multi-select; RMB retargets in flight
 *  • HUD: totals for You/AI/Neutral + Send%
 *  • Built-in tests (Run Tests button)
 */

// ============================
// Types & Constants
// ============================

type Player = "NEUTRAL" | "HUMAN" | "AI";

interface Planet {
  id: number; x: number; y: number; r: number;
  owner: Player; ships: number; production: number;
}

interface Fleet {
  id: number; owner: Player; ships: number;
  x: number; y: number; targetPlanetId: number; fromPlanetId: number;
  speed: number; vx: number; vy: number;
  // Movement shaping
  heading: number;     // initial launch heading (radians)
  cohere: number;      // seconds left to cohere (tighten formation)
  offset: number;      // initial lateral offset used for launch spread (px)
  // Obstacle avoidance
  avoidPlanetId?: number | null;
  avoidUntil?: number; // seconds remaining to stay in tangent motion around obstacle
  avoidClockwise?: boolean; // true if circling obstacle clockwise
}

interface GameConfig {
  seed: number; planetCount: number; mapPadding: number;
  minR: number; maxR: number; fleetSpeed: number;
  productionScale: number; aiThinkInterval: number;
}

interface GameRefs {
  lastTime: number; acc: number; playing: boolean;
  frameReq: number | null; hidden: boolean; aiTimer: number;
}

const COLORS = {
  bg: "#0b0e1a", grid: "#111523", neutral: "#8b8fa5",
  human: "#35e0ff", ai: "#ff6a3d", text: "#e7e9ee", selection: "#7ef7c7",
};
const OWNER_COLOR = (p: Player) => (p === "HUMAN" ? COLORS.human : p === "AI" ? COLORS.ai : COLORS.neutral);
const FIXED_DT = 1 / 60; // seconds

// Fleet size tiers (ships carried → draw size px)
const FLEET_SIZE_TABLE = [
  { max: 5,   px: 6 },   // small
  { max: 15,  px: 9 },   // medium
  { max: 35,  px: 12 },  // large
  { max: 65,  px: 16 },  // larger (cap)
];

// Avoidance
const AVOID_BUFFER = 10;        // px beyond planet radius to trigger avoidance
const AVOID_CLEAR = 14;         // px beyond planet radius to consider cleared
const AVOID_TIME_MIN = 0.18;    // s
const AVOID_TIME_MAX = 0.36;    // s

// Cohesion
const COHERE_TIME = 0.35;       // s to blend back to tight formation
const COHERE_BLEND = 0.15;      // per-second factor when blending toward target direction

// Launch spread
const SPREAD_STEP = 0.12;       // radians between chunks (~6.9°)
const SPREAD_JITTER = 0.06;     // ±3.4°
const LANE_SPACING = 4;         // px lateral spacing between chunks

// ============================
// PRNG
// ============================
function mulberry32(seed: number) { let t = seed >>> 0; return function () { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
function randRange(rand: () => number, a: number, b: number) { return a + (b - a) * rand(); }

// ============================
// Component
// ============================
export default function SinglePlayerGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sendPercent, setSendPercent] = useState<number>(0.5); // 50%
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [level, setLevel] = useState<number>(1);
  const [testLog, setTestLog] = useState<string[]>([]);

  // Game state
  const planetsRef = useRef<Planet[]>([]);
  const fleetsRef = useRef<Fleet[]>([]);
  const selectionRef = useRef<{ planets: Set<number>; fleets: Set<number> }>({ planets: new Set(), fleets: new Set() });
  const shipImgRef = useRef<HTMLImageElement | null>(null);

  const configRef = useRef<GameConfig>({
    seed: Math.floor(Math.random() * 1e9), planetCount: 22, mapPadding: 64,
    minR: 18, maxR: 34, fleetSpeed: 120, productionScale: 1.0, aiThinkInterval: 1.5,
  });

  const refs = useRef<GameRefs>({ lastTime: 0, acc: 0, playing: true, frameReq: null, hidden: false, aiTimer: 0 });

  // ============================
  // Setup & teardown
  // ============================
  useEffect(() => {
    const canvas = canvasRef.current!;

    const onResize = () => resizeCanvas(canvas);
    window.addEventListener("resize", onResize);

    const onVisibility = () => { refs.current.hidden = document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") restart(level);
      if (e.key === "Escape") { selectionRef.current.planets.clear(); selectionRef.current.fleets.clear(); }
      if (/^[0-9]$/.test(e.key)) { const d = parseInt(e.key, 10); const pct = d === 0 ? 1.0 : d / 10; setSendPercent(Math.max(0.05, pct)); }
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

  useEffect(() => {
    const img = new Image();
    img.src = shipImg.src;
    shipImgRef.current = img;
  }, []);

  useEffect(() => { restart(level); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [level]);

  // ============================
  // Mouse: select planets/fleets, dispatch/redirect, wheel adjusts Send%
  // ============================
  useEffect(() => {
    const canvas = canvasRef.current!;

    const getMouse = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
      return { x: (ev.clientX - rect.left) * dpr, y: (ev.clientY - rect.top) * dpr };
    };

    const onClick = (ev: MouseEvent) => {
      if (status !== "playing") return;
      const { x, y } = getMouse(ev); const p = hitPlanet(planetsRef.current, x, y); const f = hitFleet(fleetsRef.current, x, y);
      if (ev.button === 0) { // LMB
        if (ev.shiftKey) {
          if (p && p.owner === "HUMAN") { if (selectionRef.current.planets.has(p.id)) selectionRef.current.planets.delete(p.id); else selectionRef.current.planets.add(p.id); }
          if (f && f.owner === "HUMAN") { if (selectionRef.current.fleets.has(f.id)) selectionRef.current.fleets.delete(f.id); else selectionRef.current.fleets.add(f.id); }
        } else {
          selectionRef.current.planets.clear(); selectionRef.current.fleets.clear();
          if (p && p.owner === "HUMAN") selectionRef.current.planets.add(p.id);
          else if (f && f.owner === "HUMAN") selectionRef.current.fleets.add(f.id);
        }
      }
    };

    const onDbl = (ev: MouseEvent) => {
      if (status !== "playing") return; const { x, y } = getMouse(ev); const p = hitPlanet(planetsRef.current, x, y);
      if (p && p.owner === "HUMAN") { selectionRef.current.planets.clear(); planetsRef.current.forEach(pp => { if (pp.owner === "HUMAN") selectionRef.current.planets.add(pp.id); }); }
    };

    const onCtx = (ev: MouseEvent) => {
      ev.preventDefault(); if (status !== "playing") return; const { x, y } = getMouse(ev); const t = hitPlanet(planetsRef.current, x, y); if (!t) return;
      if (selectionRef.current.planets.size > 0) { issueOrders(selectionRef.current.planets, t.id, sendPercent); }
      if (selectionRef.current.fleets.size > 0) { redirectFleets(selectionRef.current.fleets, t.id); }
    };

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault(); const dir = ev.deltaY > 0 ? -1 : 1;
      setSendPercent(prev => { const step = 0.05; return clamp(Math.round((prev + dir * step) * 20) / 20, 0.05, 1); });
    };

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("dblclick", onDbl);
    canvas.addEventListener("contextmenu", onCtx);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("dblclick", onDbl);
      canvas.removeEventListener("contextmenu", onCtx);
      canvas.removeEventListener("wheel", onWheel as any);
    };
  }, [status, sendPercent]);

  // ============================
  // Init / Restart / Core logic
  // ============================
  function restart(newLevel: number) { stopLoop(); initLevel(newLevel); setStatus("playing"); startLoop(); }

  function initLevel(l: number) {
    const c = canvasRef.current!; resizeCanvas(c);
    const cfg = configRef.current; const rand = mulberry32(cfg.seed + l * 1337);
    const W = c.width, H = c.height; const ps: Planet[] = [];

    const count = Math.max(16, cfg.planetCount + (l - 1) * 2); let attempts = 0;
    while (ps.length < count && attempts < 6000) {
      attempts++; const r = randRange(rand, cfg.minR, cfg.maxR);
      const x = randRange(rand, cfg.mapPadding + r, W - cfg.mapPadding - r);
      const y = randRange(rand, cfg.mapPadding + r, H - cfg.mapPadding - r);
      const prod = Math.pow(r / cfg.maxR, 1.2) * (0.8 + rand() * 0.4) * cfg.productionScale; // size scaled
      const cand: Planet = { id: ps.length, x, y, r, owner: "NEUTRAL", ships: Math.round(r * randRange(rand, 1.0, 2.2)), production: prod };
      if (ps.every(p => dist(p.x, p.y, x, y) > p.r + r + 16)) ps.push(cand);
    }

    if (ps.length >= 2) {
      let a = 0, b = 1, d = -1;
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const dd = dist(ps[i].x, ps[i].y, ps[j].x, ps[j].y); if (dd > d) { d = dd; a = i; b = j; }
      }
      ps[a].owner = "HUMAN"; ps[a].ships = Math.max(40, ps[a].r * 2.2);
      ps[b].owner = "AI";    ps[b].ships = Math.max(40, ps[b].r * 2.2);
    }

    planetsRef.current = ps; fleetsRef.current = []; selectionRef.current.planets.clear(); selectionRef.current.fleets.clear();
    refs.current.lastTime = performance.now(); refs.current.acc = 0; refs.current.playing = true; refs.current.aiTimer = 0;
  }

  function issueOrders(sel: Set<number>, tid: number, pct: number) {
    const t = planetsRef.current.find(p => p.id === tid); if (!t) return;
    sel.forEach(id => {
      const from = planetsRef.current.find(p => p.id === id); if (!from || from.owner !== "HUMAN" || from.id === tid) return;
      const amt = Math.floor(from.ships * pct); if (amt <= 0) return; from.ships -= amt;
      const chunks = splitIntoChunks(amt);
      for (let i = 0; i < chunks.length; i++) createFleet(from, t, "HUMAN", chunks[i], i, chunks.length);
    });
  }

  function redirectFleets(fsel: Set<number>, tid: number) {
    const t = planetsRef.current.find(p => p.id === tid); if (!t) return;
    fleetsRef.current.forEach(f => {
      if (fsel.has(f.id)) {
        const ang = Math.atan2(t.y - f.y, t.x - f.x);
        f.vx = Math.cos(ang) * f.speed; f.vy = Math.sin(ang) * f.speed;
        f.heading = ang; f.cohere = COHERE_TIME * 0.6; // retarget → tighten again a bit
        f.targetPlanetId = t.id; f.avoidPlanetId = null; f.avoidUntil = 0; f.avoidClockwise = true;
      }
    });
  }

  // Split dispatched ships into chunks: 65-ship cap, then remainder
  function splitIntoChunks(n: number) { const out: number[] = []; let r = n; while (r > 65) { out.push(65); r -= 65; } if (r > 0) out.push(r); return out; }

  // Launch spread + store heading/offset/cohesion
  function createFleet(from: Planet, to: Planet, owner: Player, ships: number, idx: number = 0, total: number = 1) {
    const base = Math.atan2(to.y - from.y, to.x - from.x);
    const angle = base + (idx - (total - 1) / 2) * SPREAD_STEP + (Math.random() - 0.5) * SPREAD_JITTER;

    const nx = -Math.sin(angle), ny = Math.cos(angle);
    const offset = (idx - (total - 1) / 2) * LANE_SPACING; // px between lanes
    const sx = from.x + Math.cos(angle) * (from.r + 6) + nx * offset;
    const sy = from.y + Math.sin(angle) * (from.r + 6) + ny * offset;

    const speed = configRef.current.fleetSpeed;
    const vx = Math.cos(angle) * speed; const vy = Math.sin(angle) * speed;
    const id = (fleetsRef.current.at(-1)?.id ?? 0) + 1;
    fleetsRef.current.push({ id, owner, ships, x: sx, y: sy, targetPlanetId: to.id, fromPlanetId: from.id, speed, vx, vy, heading: base, cohere: COHERE_TIME, offset, avoidPlanetId: null, avoidUntil: 0, avoidClockwise: true });
  }

  function resolveArrival(f: Fleet, p: Planet) {
    if (f.owner === p.owner) p.ships += f.ships; else { const rem = p.ships - f.ships; if (rem < 0) { p.owner = f.owner; p.ships = Math.abs(rem); } else p.ships = rem; }
  }

  // ============================
  // Loop
  // ============================
  function startLoop() { if (refs.current.frameReq != null) return; refs.current.frameReq = requestAnimationFrame(tick); }
  function stopLoop()  { if (refs.current.frameReq != null) cancelAnimationFrame(refs.current.frameReq); refs.current.frameReq = null; }

  function tick(ts: number) {
    const r = refs.current; if (!r.playing) return; const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    const dms = ts - r.lastTime; r.lastTime = ts;
    if (!r.hidden) { r.acc += Math.min(0.25, dms / 1000); while (r.acc >= FIXED_DT) { update(FIXED_DT); r.acc -= FIXED_DT; } }
    render(ctx); refs.current.frameReq = requestAnimationFrame(tick);
  }

  function ownerHasAssets(o: Player) { return planetsRef.current.some(p => p.owner === o) || fleetsRef.current.some(f => f.owner === o); }

  function update(dt: number) {
    // Production
    for (const p of planetsRef.current) if (p.owner !== "NEUTRAL") p.ships += p.production * dt;

    // Fleets (travel + avoidance + cohesion)
    for (const f of fleetsRef.current) {
      const target = planetsRef.current[f.targetPlanetId]; if (!target) continue;

      // If currently avoiding a planet, keep tangent motion until clear or timer up
      if (f.avoidPlanetId != null && f.avoidPlanetId !== undefined && (f.avoidUntil ?? 0) > 0) {
        const ap = planetsRef.current.find(p => p.id === f.avoidPlanetId);
        f.avoidUntil! -= dt;
        if (ap) {
          const rx = f.x - ap.x, ry = f.y - ap.y; const rad = Math.max(1, Math.hypot(rx, ry));
          const dir = f.avoidClockwise ? 1 : -1;
          const tx =  dir * ry / rad, ty = -dir * rx / rad; // tangent around obstacle
          f.vx = tx * f.speed; f.vy = ty * f.speed;
          f.x += f.vx * dt; f.y += f.vy * dt;
          if (Math.hypot(f.x - ap.x, f.y - ap.y) > ap.r + AVOID_CLEAR || (f.avoidUntil ?? 0) <= 0) {
            f.avoidPlanetId = null; f.avoidUntil = 0; f.avoidClockwise = true;
          }
          continue;
        } else {
          // Obstacle vanished (shouldn't happen) → clear
          f.avoidPlanetId = null; f.avoidUntil = 0; f.avoidClockwise = true;
        }
      }

      // Normal travel step
      f.x += f.vx * dt; f.y += f.vy * dt;

      // Cohesion: blend velocity toward ideal direction to the target for a short time
      if (f.cohere > 0) {
        f.cohere -= dt;
        const dx = target.x - f.x, dy = target.y - f.y; const len = Math.max(1e-6, Math.hypot(dx, dy));
        const dirx = dx / len, diry = dy / len;               // toward target
        const curLen = Math.max(1e-6, Math.hypot(f.vx, f.vy));
        let vx = f.vx / curLen, vy = f.vy / curLen;           // current unit
        const blend = 1 - Math.exp(-COHERE_BLEND * (dt * 60) / 60); // frame-rate stable
        vx = vx * (1 - blend) + dirx * blend; vy = vy * (1 - blend) + diry * blend;
        const nlen = Math.max(1e-6, Math.hypot(vx, vy));
        f.vx = (vx / nlen) * f.speed; f.vy = (vy / nlen) * f.speed;
      }

      // Collision with target → resolve immediately (no orbiting at target)
      if (dist(f.x, f.y, target.x, target.y) <= target.r) { resolveArrival(f, target); f.ships = 0; continue; }

      // Obstacle detection (other planets) → enter avoidance
      for (const p of planetsRef.current) {
        if (p.id === target.id || p.id === f.fromPlanetId) continue; // ignore origin and target
        const d = dist(f.x, f.y, p.x, p.y);
        if (d <= p.r + AVOID_BUFFER) {
          f.avoidPlanetId = p.id;
          const thetaF = Math.atan2(f.y - p.y, f.x - p.x);
          const thetaT = Math.atan2(target.y - p.y, target.x - p.x);
          const cw = (thetaF - thetaT + Math.PI * 2) % (Math.PI * 2);
          const ccw = (thetaT - thetaF + Math.PI * 2) % (Math.PI * 2);
          const orbitR = p.r + AVOID_CLEAR;
          if (cw <= ccw) {
            f.avoidClockwise = true;
            const arc = orbitR * cw;
            f.avoidUntil = Math.min(AVOID_TIME_MAX, Math.max(AVOID_TIME_MIN, arc / f.speed));
          } else {
            f.avoidClockwise = false;
            const arc = orbitR * ccw;
            f.avoidUntil = Math.min(AVOID_TIME_MAX, Math.max(AVOID_TIME_MIN, arc / f.speed));
          }
          break;
        }
      }

      // Keep velocity aimed broadly at target after avoidance/cohesion
      const dx = target.x - f.x, dy = target.y - f.y; const len = Math.max(1e-6, Math.hypot(dx, dy));
      const aimx = dx / len, aimy = dy / len;
      const speed = f.speed;
      // Light steering toward target to keep formation coherent
      f.vx = f.vx * 0.9 + aimx * 0.1 * speed; f.vy = f.vy * 0.9 + aimy * 0.1 * speed;
      const vlen = Math.max(1e-6, Math.hypot(f.vx, f.vy)); f.vx = (f.vx / vlen) * speed; f.vy = (f.vy / vlen) * speed;
    }
    fleetsRef.current = fleetsRef.current.filter(f => f.ships > 0);

    // AI
    refs.current.aiTimer += dt; if (refs.current.aiTimer >= configRef.current.aiThinkInterval) { refs.current.aiTimer = 0; aiThink(); }

    // Victory/defeat: require NO planets & NO fleets
    if (!ownerHasAssets("HUMAN") && status === "playing") { setStatus("lost"); refs.current.playing = false; }
    if (!ownerHasAssets("AI")    && status === "playing") { setStatus("won");  refs.current.playing = false; }
  }

  function aiThink() {
    const aiPs = planetsRef.current.filter(p => p.owner === "AI"); if (aiPs.length === 0) return;
    const s = aiPs.reduce((a, b) => (a.ships > b.ships ? a : b)); if (s.ships < 10) return;
    const cands = planetsRef.current.filter(p => p.owner !== "AI"); if (cands.length === 0) return;
    let best: Planet | null = null; let bestScore = Infinity;
    for (const c of cands) {
      const d = dist(s.x, s.y, c.x, c.y); const t = d / configRef.current.fleetSpeed;
      const def = c.ships + (c.owner === "NEUTRAL" ? 0 : c.production * t * 0.5);
      const sc = def * (c.owner === "HUMAN" ? 0.9 : 1.0) + t * 2;
      if (sc < bestScore) { bestScore = sc; best = c; }
    }
    if (best) {
      const send = Math.floor(s.ships * (best.owner === "HUMAN" ? 0.65 : 0.5));
      if (send > 0) { s.ships -= send; const chunks = splitIntoChunks(send); for (let i = 0; i < chunks.length; i++) createFleet(s, best, "AI", chunks[i], i, chunks.length); }
    }
  }

  // ============================
  // Rendering
  // ============================
  function render(ctx: CanvasRenderingContext2D) {
    const c = ctx.canvas; // BG
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, c.width, c.height);
    // Grid
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1; const step = 64 * (window.devicePixelRatio || 1);
    ctx.beginPath(); for (let x = 0; x < c.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, c.height); }
    for (let y = 0; y < c.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(c.width, y); } ctx.stroke();

    // Fleets then Planets
    for (const f of fleetsRef.current) drawFleet(ctx, f, selectionRef.current.fleets.has(f.id));
    for (const p of planetsRef.current) drawPlanet(ctx, p, selectionRef.current.planets.has(p.id));

    // Multi-select hulls around selected planets (visual)
    if (selectionRef.current.planets.size > 1) {
      ctx.strokeStyle = COLORS.selection; ctx.lineWidth = 1;
      selectionRef.current.planets.forEach((pid) => { const p = planetsRef.current.find(q => q.id === pid); if (!p) return; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2); ctx.stroke(); });
    }

    // HUD totals + Send%
    const totals = countTotals();
    ctx.fillStyle = COLORS.text; ctx.font = `${14 * (window.devicePixelRatio || 1)}px ui-sans-serif,system-ui`;
    ctx.textAlign = "left"; ctx.fillText(
      `You: ${Math.round(totals.human)}   AI: ${Math.round(totals.ai)}   Neutral: ${Math.round(totals.neutral)}   Send%: ${Math.round(sendPercent * 100)}%`,
      16 * (window.devicePixelRatio || 1), 24 * (window.devicePixelRatio || 1)
    );
  }

  function drawPlanet(ctx: CanvasRenderingContext2D, p: Planet, sel: boolean) {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(p.x, p.y, p.r * 0.2, p.x, p.y, p.r); const oc = OWNER_COLOR(p.owner);
    g.addColorStop(0, shade(oc, 0.6)); g.addColorStop(1, shade(oc, -0.2)); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = sel ? 4 : 2; ctx.strokeStyle = sel ? COLORS.selection : shade(oc, -0.4); ctx.stroke();
    ctx.fillStyle = COLORS.text; ctx.font = `${Math.max(12, Math.floor(p.r))}px ui-sans-serif,system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(`${Math.round(p.ships)}`, p.x, p.y);
  }

  function drawFleet(ctx: CanvasRenderingContext2D, f: Fleet, sel: boolean) {
    const color = OWNER_COLOR(f.owner); const ang = Math.atan2(f.vy, f.vx);
    let size = 6; for (const tier of FLEET_SIZE_TABLE) { if (f.ships <= tier.max) { size = tier.px; break; } }
    if (sel) size += 3;
    const img = shipImgRef.current;
    if (img && img.complete) {
      const scale = (size * 2) / img.width;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(ang + Math.PI / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = color;
      ctx.fillRect(-img.width / 2, -img.height / 2, img.width, img.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    } else {
      const x = f.x, y = f.y; ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * size, y + Math.sin(ang) * size);
      ctx.lineTo(x + Math.cos(ang + 2.5) * size, y + Math.sin(ang + 2.5) * size);
      ctx.lineTo(x + Math.cos(ang - 2.5) * size, y + Math.sin(ang - 2.5) * size);
      ctx.closePath(); ctx.fill();
    }
  }

  // ============================
  // Helpers
  // ============================
  function countTotals() {
    let human = 0, ai = 0, neutral = 0;
    for (const p of planetsRef.current) { if (p.owner === "HUMAN") human += p.ships; else if (p.owner === "AI") ai += p.ships; else neutral += p.ships; }
    for (const f of fleetsRef.current) { if (f.owner === "HUMAN") human += f.ships; else if (f.owner === "AI") ai += f.ships; else neutral += f.ships; }
    return { human, ai, neutral };
  }

  function hitPlanet(planets: Planet[], x: number, y: number): Planet | null { for (let i = planets.length - 1; i >= 0; i--) { const p = planets[i]; if (dist(x, y, p.x, p.y) <= p.r) return p; } return null; }

  function hitFleet(fleets: Fleet[], x: number, y: number): Fleet | null {
    for (let i = fleets.length - 1; i >= 0; i--) { // clickable radius scales with rendered size
      const f = fleets[i]; let size = 6; for (const tier of FLEET_SIZE_TABLE) { if (f.ships <= tier.max) { size = tier.px; break; } }
      const radius = size * 1.2; if (dist(x, y, f.x, f.y) <= radius) return f;
    }
    return null;
  }

  function dist(x1: number, y1: number, x2: number, y2: number) { const dx = x2 - x1, dy = y2 - y1; return Math.hypot(dx, dy); }

  function shade(hex: string, lum: number) { let c = hex.replace(/#/g, ""); if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]; let result = "#"; for (let i = 0; i < 3; i++) { const val = parseInt(c.substr(i * 2, 2), 16); const v = Math.max(0, Math.min(255, Math.floor(val + val * lum))); result += ("00" + v.toString(16)).slice(-2); } return result; }

  function clamp(v: number, min = 0, max = 1) { return Math.max(min, Math.min(max, v)); }

  function resizeCanvas(canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1; const width = Math.max(800, Math.floor(window.innerWidth * 0.9)); const height = Math.max(600, Math.floor(window.innerHeight * 0.75));
    canvas.style.width = width + "px"; canvas.style.height = height + "px"; canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
  }

  // ============================
  // Tests (manual trigger)
  // ============================
  function runTests() {
    const logs: string[] = []; const ok = (n: string, c: boolean) => logs.push(`${c ? "PASS" : "FAIL"} - ${n}`);
    const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

    // PRNG determinism
    const r1 = mulberry32(123), r2 = mulberry32(123); ok("PRNG determinism", near(r1(), r2()) && near(r1(), r2()));

    // chunking sums & caps
    const total = 300; const chunks = splitIntoChunks(total); ok("chunk sum == total", chunks.reduce((a,b)=>a+b,0) === total); ok("chunk cap <= 65", chunks.every(x=>x<=65));

    // fleet size tier mapping
    const tierPx = (n:number)=>{ let s=6; for(const t of FLEET_SIZE_TABLE){ if(n<=t.max){ s=t.px; break;} } return s; };
    ok("tier 5→small", tierPx(5) === 6);
    ok("tier 10→medium", tierPx(10) === 9);
    ok("tier 25→large", tierPx(25) === 12);
    ok("tier 60→larger", tierPx(60) === 16);

    // send% clamp & step (simulate wheel)
    let sp = 0.5; const step=0.05; sp = clamp(Math.round((sp + step) * 20)/20, 0.05, 1); ok("send% +5%", near(sp, 0.55));
    sp = clamp(Math.round((sp - step) * 20)/20, 0.05, 1); ok("send% -5%", near(sp, 0.5));

    console.log("SWARM TESTS", logs); setTestLog(logs);
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
            min={5}
            max={100}
            step={5}
            value={Math.round(sendPercent * 100)}
            className="w-48"
            onChange={(e) => setSendPercent(Math.max(0.05, parseInt(e.target.value) / 100))}
            title="Send percentage (wheel adjusts ±5%; 1–9 keys; 0 = 100%)"
          />
          <div className="text-sm tabular-nums">{Math.round(sendPercent * 100)}%</div>
          <button className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40" onClick={() => restart(level)} title="Restart (R)">Restart</button>
          <button className="px-3 py-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/40" onClick={() => setLevel((l) => l + 1)} title="Next level (harder)">Next Level</button>
          <button className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40" onClick={runTests} title="Run built-in tests">Run Tests</button>
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
                <button className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40" onClick={() => restart(level)}>Restart</button>
                {status === "won" && (
                  <button className="px-3 py-1.5 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-400/40" onClick={() => setLevel((l) => l + 1)}>Next Level</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {testLog.length > 0 && (
        <div className="mt-3 w-full max-w-5xl px-4">
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="font-semibold mb-1">Test Results</div>
            <ul className="list-disc list-inside text-xs opacity-90">
              {testLog.map((t, i) => (<li key={i}>{t}</li>))}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-4 text-sm opacity-70 max-w-5xl px-4 leading-relaxed">
        <p className="mb-1">
          Controls: <b>Left-click</b> planet to select. <b>Shift + Left-click</b> toggles planets. <b>Double Left-click</b> selects <b>all</b> your planets. <b>Right-click</b> any planet to send from selected planet(s), or redirect selected fleet(s) in flight. <b>Mouse wheel</b> adjusts Send% by 5% (min 5%). Esc clears selection. R restarts. Digits 1–9 set 10–90%, 0 sets 100%.
        </p>
      </div>
    </div>
  );
}
