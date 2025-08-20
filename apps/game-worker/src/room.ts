import { SimState, SimConfig } from "./sim";
import { encodeServer, Owner } from "./protocol";

type WS = import("uWebSockets.js").WebSocket<unknown>;

export class Room {
  id: number;
  sim: SimState;
  clients: Set<WS> = new Set();
  players: Map<WS, Owner> = new Map();
  private lastDeltaSent = 0;
  private changedPlanets = new Set<number>();
  private movedFleets: Map<number, { x: number; y: number }> = new Map();
  private newFleets: any[] = [];

  constructor(id: number, cfg: SimConfig) {
    this.id = id;
    this.sim = new SimState(cfg);
  }

  join(ws: WS): Owner {
    this.clients.add(ws);
    const owner = this.assignOwner();
    this.players.set(ws, owner);
    const layout = { planets: this.sim.planets.map(p => ({ id: p.id, x: p.x, y: p.y, r: p.r, production: p.production })) };
    const snapshot = {
      tick: this.sim.tick,
      planets: this.sim.planets.map(p => ({ id: p.id, owner: p.owner, ships: Math.round(p.ships) })),
      fleets: Array.from(this.sim.fleets.values()).map(f => ({
        id: f.id, owner: f.owner, from_id: f.fromId, to_id: f.toId,
        x: f.x, y: f.y, vx: f.vx, vy: f.vy, ships: f.ships
      }))
    };
    const welcome = {
      welcome: {
        room_id: this.id,
        tick_rate: this.sim.cfg.tickRate,
        delta_hz: this.sim.cfg.deltaHz,
        player_id: owner,
        layout,
        snapshot
      }
    };
    ws.send(encodeServer(welcome), true);
    return owner;
  }

  leave(ws: WS) {
    this.clients.delete(ws);
    this.players.delete(ws);
  }

  private assignOwner(): Owner {
    const used = new Set(this.players.values());
    if (!used.has(Owner.PLAYER1)) return Owner.PLAYER1;
    if (!used.has(Owner.PLAYER2)) return Owner.PLAYER2;
    if (!used.has(Owner.PLAYER3)) return Owner.PLAYER3;
    if (!used.has(Owner.PLAYER4)) return Owner.PLAYER4;
    return Owner.NEUTRAL;
  }

  issueOrdersFrom(ws: WS, fromIds: number[], targetId: number, pct: number) {
    const owner = this.players.get(ws);
    if (owner == null || owner === Owner.NEUTRAL) return;
    const created = this.sim.issueOrders(owner, fromIds, targetId, pct);
    for (const f of created) {
      this.newFleets.push({
        id: f.id, owner: f.owner, from_id: f.fromId, to_id: f.toId,
        x: f.x, y: f.y, vx: f.vx, vy: f.vy, ships: f.ships
      });
    }
    for (const id of fromIds) this.changedPlanets.add(id);
    if (targetId != null) this.changedPlanets.add(targetId);
  }

  tick(dt: number, nowMs: number) {
    const { removed } = this.sim.step(dt);
    for (const p of this.sim.planets) {
      if (this.sim.tick % 4 === 0) this.changedPlanets.add(p.id);
    }
    for (const f of this.sim.fleets.values()) this.movedFleets.set(f.id, { x: f.x, y: f.y });

    const minInterval = 1000 / this.sim.cfg.deltaHz;
    if (nowMs - this.lastDeltaSent >= minInterval) {
      this.lastDeltaSent = nowMs;
      const delta = {
        tick: this.sim.tick,
        planets: Array.from(this.changedPlanets).map(id => {
          const p = this.sim.planets[id];
          return { id, owner: p.owner, ships: Math.round(p.ships) };
        }),
        fleets: Array.from(this.movedFleets.entries()).map(([id, pos]) => ({ id, x: pos.x, y: pos.y })),
        remove_fleets: removed,
        new_fleets: this.newFleets
      };
      const bytes = encodeServer({ delta });
      this.broadcast(bytes);
      this.changedPlanets.clear();
      this.movedFleets.clear();
      this.newFleets = [];
    }
  }

  private broadcast(bytes: Uint8Array) {
    for (const ws of this.clients) ws.send(bytes, true);
  }
}
