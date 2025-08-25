'use client';
import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Types, Owner } from "../src/protocol";
import shipImg from "../public/ship.png";

const MATCHMAKER_URL = process.env.NEXT_PUBLIC_MATCHMAKER_URL || "http://localhost:8080";

type PlanetView = { id: number; x: number; y: number; r: number; owner: number; ships: number; production: number };
type FleetView = { id: number; x: number; y: number; owner: number; to_id: number; ships: number };

export default function MultiPlayerGame() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const playerIdRef = useRef<number>(Owner.NEUTRAL);

  const [sendPct, setSendPct] = useState(0.5);
  const selectionRef = useRef<Set<number>>(new Set());
  const planetsRef = useRef<Map<number, PlanetView>>(new Map());
  const fleetsRef = useRef<Map<number, FleetView>>(new Map());

  useEffect(() => {
    const el = containerRef.current!;
    const app = new PIXI.Application();
    appRef.current = app;
    app.init({ width: 1200, height: 800, background: "#0b0e1a", antialias: true }).then(() => {
      el.appendChild(app.canvas);
      connect();
      setupTicker();
      setupInput(app);
    });

    function setupTicker() {
      const gPlanets = new PIXI.Graphics();
      const labelContainer = new PIXI.Container();
      const fleetContainer = new PIXI.Container();
      const planetLabels = new Map<number, PIXI.Text>();
      const fleetSprites = new Map<number, PIXI.Sprite>();
      app.stage.addChild(gPlanets);
      app.stage.addChild(labelContainer);
      app.stage.addChild(fleetContainer);

      app.ticker.add(() => {
        fleetSprites.forEach((sprite, id) => {
          if (!fleetsRef.current.has(id)) {
            fleetContainer.removeChild(sprite);
            sprite.destroy();
            fleetSprites.delete(id);
          }
        });
        fleetsRef.current.forEach(f => {
          let sprite = fleetSprites.get(f.id);
          if (!sprite) {
            sprite = PIXI.Sprite.from(shipImg.src);
            sprite.anchor.set(0.5);
            sprite.scale.set(0.06);
            sprite.tint = ownerColor(f.owner);
            fleetContainer.addChild(sprite);
            fleetSprites.set(f.id, sprite);
          }
          sprite.position.set(f.x, f.y);
          sprite.tint = ownerColor(f.owner);
        });

        planetLabels.forEach((label, id) => {
          if (!planetsRef.current.has(id)) {
            labelContainer.removeChild(label);
            label.destroy();
            planetLabels.delete(id);
          }
        });

        gPlanets.clear();
        planetsRef.current.forEach(p => {
          const sel = selectionRef.current.has(p.id);
          const color = ownerColor(p.owner);
          gPlanets.fill({ color }).circle(p.x, p.y, p.r);
          gPlanets.stroke({ width: sel ? 4 : 2, color: sel ? 0x7ef7c7 : 0x22273a }).circle(p.x, p.y, p.r + 2);
          let label = planetLabels.get(p.id);
          if (!label) {
            label = new PIXI.Text({ text: String(p.ships), style: { fill: 0xe7e9ee, fontSize: Math.max(12, Math.floor(p.r)) }});
            label.anchor.set(0.5);
            labelContainer.addChild(label);
            planetLabels.set(p.id, label);
          } else {
            (label.style as any).fontSize = Math.max(12, Math.floor(p.r));
          }
          label.text = String(p.ships);
          label.position.set(p.x, p.y);
        });
      });
    }

    function ownerColor(o: number) {
      if (o === Owner.PLAYER1) return 0x35e0ff;
      if (o === Owner.PLAYER2) return 0xff6a3d;
      if (o === Owner.PLAYER3) return 0x00ff00;
      if (o === Owner.PLAYER4) return 0xffff00;
      return 0x8b8fa5;
    }

    async function connect() {
      const res = await fetch(`${MATCHMAKER_URL}/join`);
      const { wsUrl, roomId } = await res.json();
      const ws = new WebSocket(`${wsUrl}?room=${roomId}`);
      ws.binaryType = "arraybuffer";
      ws.addEventListener("message", (ev) => {
        const env = Types.ServerEnvelope.toObject(Types.ServerEnvelope.decode(new Uint8Array(ev.data)), { longs: String });
        if (env.welcome) {
          playerIdRef.current = env.welcome.player_id;
          planetsRef.current.clear();
          for (const pg of env.welcome.layout.planets || []) {
            planetsRef.current.set(pg.id, { id: pg.id, x: pg.x, y: pg.y, r: pg.r, production: pg.production, owner: Owner.NEUTRAL, ships: 0 });
          }
          applySnapshot(env.welcome.snapshot);
        } else if (env.snapshot) {
          applySnapshot(env.snapshot);
        } else if (env.delta) {
          applyDelta(env.delta);
        }
      });
      wsRef.current = ws;
    }

    function setupInput(app: PIXI.Application) {
      const hitPlanet = (x: number, y: number) => {
        for (const p of planetsRef.current.values()) {
          if (Math.hypot(x - p.x, y - p.y) <= p.r) return p;
        }
        return null;
      };
      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;
      let lastClick = 0;
      app.stage.on("pointerdown", (e: PIXI.FederatedPointerEvent) => {
        const x = e.global.x, y = e.global.y;
        const p = hitPlanet(x, y);
        if (e.button === 2) {
          if (p && selectionRef.current.size > 0) {
            const from_ids = Array.from(selectionRef.current);
            sendIssueOrders(from_ids, p.id, sendPct);
          }
          return;
        }
        if (!p) {
          if (!e.shiftKey) selectionRef.current.clear();
          return;
        }
        const now = performance.now();
        const isDouble = now - lastClick < 300;
        lastClick = now;
        if (isDouble && p.owner === playerIdRef.current) {
          selectionRef.current.clear();
          planetsRef.current.forEach(pp => { if (pp.owner === playerIdRef.current) selectionRef.current.add(pp.id); });
        } else {
          if (p.owner !== playerIdRef.current) return;
          if (e.shiftKey) selectionRef.current.add(p.id);
          else { selectionRef.current.clear(); selectionRef.current.add(p.id); }
        }
      });
      (app.view as any)?.addEventListener?.("contextmenu", (ev: Event) => ev.preventDefault());
    }

    function sendIssueOrders(from_ids: number[], target_id: number, pct: number) {
      const payload = { issue_orders: { client_time_ms: Date.now().toString(), from_ids, target_id, pct, input_seq: 0 } };
      const bytes = Types.ClientEnvelope.encode(Types.ClientEnvelope.fromObject(payload)).finish();
      wsRef.current?.send(bytes);
    }

    function applySnapshot(s: any) {
      for (const pd of s.planets || []) {
        const p = planetsRef.current.get(pd.id);
        if (p) { p.owner = pd.owner; p.ships = pd.ships; }
      }
      fleetsRef.current.clear();
      for (const f of s.fleets || []) {
        fleetsRef.current.set(f.id, { id: f.id, x: f.x, y: f.y, owner: f.owner, to_id: f.to_id, ships: f.ships });
      }
    }

    function applyDelta(d: any) {
      for (const pd of d.planets || []) {
        const p = planetsRef.current.get(pd.id);
        if (p) { p.owner = pd.owner; p.ships = pd.ships; }
      }
      for (const fd of d.fleets || []) {
        const f = fleetsRef.current.get(fd.id);
        if (f) { f.x = fd.x; f.y = fd.y; }
      }
      for (const id of d.remove_fleets || []) fleetsRef.current.delete(id);
      for (const nf of d.new_fleets || []) {
        fleetsRef.current.set(nf.id, { id: nf.id, x: nf.x, y: nf.y, owner: nf.owner, to_id: nf.to_id, ships: nf.ships });
      }
    }

    return () => {
      appRef.current?.destroy(true);
      wsRef.current?.close();
    };
  }, [sendPct]);

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ color: 'white', fontFamily: 'ui-sans-serif' }}>Swarm — Multiplayer</h2>
      <div style={{ color: '#aaa', marginBottom: 8 }}>LMB select, Shift+LMB multi, Double LMB select all yours, RMB send. Send % {Math.round(sendPct*100)}%</div>
      <input type="range" min={10} max={100} step={10} value={Math.round(sendPct*100)} onChange={e=>setSendPct(parseInt(e.target.value)/100)} />
      <div ref={containerRef} style={{ marginTop:12, border:"1px solid #223", width:1200, height:800 }} />
    </div>
  );
}
