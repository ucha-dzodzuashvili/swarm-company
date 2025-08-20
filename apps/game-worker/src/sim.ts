import { Owner } from "./protocol";
import { dist, randSeeded } from "./util";

export interface Planet {
  id: number; x: number; y: number; r: number;
  owner: Owner; ships: number; production: number;
}
export interface Fleet {
  id: number; owner: Owner; ships: number;
  x: number; y: number; vx: number; vy: number;
  fromId: number; toId: number;
}

export interface SimConfig {
  width: number; height: number;
  seed: number;
  planetCount: number;
  minR: number; maxR: number;
  fleetSpeed: number;
  tickRate: number;
  deltaHz: number;
  numPlayers: number;
}

export class SimState {
  cfg: SimConfig;
  tick = 0;
  planets: Planet[] = [];
  fleets: Map<number, Fleet> = new Map();
  nextFleetId = 1;

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.initMap();
  }

  private initMap() {
    const { width, height, seed, planetCount, minR, maxR, numPlayers } = this.cfg;
    const rand = randSeeded(seed);
    const padding = 64;

    while (this.planets.length < planetCount) {
      const r = minR + (maxR - minR) * rand();
      const x = padding + r + (width - 2 * (padding + r)) * rand();
      const y = padding + r + (height - 2 * (padding + r)) * rand();
      const production = (r / maxR) * (0.7 + rand() * 0.6);
      const candidate: Planet = {
        id: this.planets.length, x, y, r,
        owner: Owner.NEUTRAL,
        ships: Math.round(r * (1.2 + rand())),
        production,
      };
      if (this.planets.every(p => dist(p.x, p.y, x, y) > p.r + r + 16)) {
        this.planets.push(candidate);
      }
      if (this.planets.length > 2000) break;
    }

    if (this.planets.length >= numPlayers) {
      // pick farthest pair for first two players
      let bestI = 0, bestJ = 1, bestD = -1;
      for (let i = 0; i < this.planets.length; i++)
        for (let j = i + 1; j < this.planets.length; j++) {
          const d = dist(this.planets[i].x, this.planets[i].y, this.planets[j].x, this.planets[j].y);
          if (d > bestD) { bestD = d; bestI = i; bestJ = j; }
        }
      this.planets[bestI].owner = Owner.PLAYER1;
      this.planets[bestI].ships = Math.max(40, this.planets[bestI].r * 2.2);
      this.planets[bestI].production *= 1.1;
      if (numPlayers >= 2) {
        this.planets[bestJ].owner = Owner.PLAYER2;
        this.planets[bestJ].ships = Math.max(40, this.planets[bestJ].r * 2.2);
        this.planets[bestJ].production *= 1.1;
      }
    }
  }

  issueOrders(owner: Owner, fromIds: number[], targetId: number, pct: number) {
    if (pct <= 0) return [] as Fleet[];
    const target = this.planets.find(p => p.id === targetId);
    if (!target) return [] as Fleet[];

    const created: Fleet[] = [];
    for (const id of fromIds) {
      const from = this.planets.find(p => p.id === id);
      if (!from || from.owner !== owner) continue;
      if (from.id === targetId) continue;
      const send = Math.floor(from.ships * Math.min(1, pct));
      if (send <= 0) continue;
      from.ships -= send;
      const ang = Math.atan2(target.y - from.y, target.x - from.x);
      const speed = this.cfg.fleetSpeed;
      const vx = Math.cos(ang) * speed, vy = Math.sin(ang) * speed;
      const fx = from.x + Math.cos(ang) * (from.r + 6);
      const fy = from.y + Math.sin(ang) * (from.r + 6);
      const f: Fleet = { id: this.nextFleetId++, owner, ships: send, x: fx, y: fy, vx, vy, fromId: from.id, toId: target.id };
      this.fleets.set(f.id, f);
      created.push(f);
    }
    return created;
  }

  step(dt: number) {
    for (const p of this.planets) if (p.owner !== Owner.NEUTRAL) p.ships += p.production * dt;

    const removed: number[] = [];
    for (const f of this.fleets.values()) {
      f.x += f.vx * dt; f.y += f.vy * dt;
      const tgt = this.planets[f.toId];
      if (tgt && dist(f.x, f.y, tgt.x, tgt.y) <= tgt.r) {
        if (f.owner === tgt.owner) {
          tgt.ships += f.ships;
        } else {
          const remaining = tgt.ships - f.ships;
          if (remaining < 0) { tgt.owner = f.owner; tgt.ships = Math.abs(remaining); }
          else { tgt.ships = remaining; }
        }
        removed.push(f.id);
      }
    }
    for (const id of removed) this.fleets.delete(id);
    this.tick++;
    return { removed };
  }
}
