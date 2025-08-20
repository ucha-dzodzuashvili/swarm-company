import uWS from "uWebSockets.js";
import { decodeClient, encodeServer } from "./protocol.js";
import { Room } from "./room.js";

const TICK_HZ = 30;
const DELTA_HZ = 15;

class RoomManager {
  rooms = new Map<number, Room>();
  cfg = {
    width: 1600,
    height: 900,
    seed: 13371337,
    planetCount: 24,
    minR: 18,
    maxR: 34,
    fleetSpeed: 120,
    tickRate: TICK_HZ,
    deltaHz: DELTA_HZ,
    numPlayers: 2,
  };

  get(roomId: number) {
    let r = this.rooms.get(roomId);
    if (!r) {
      r = new Room(roomId, this.cfg);
      this.rooms.set(roomId, r);
    }
    return r;
  }

  tick(dt: number, now: number) {
    for (const r of this.rooms.values()) r.tick(dt, now);
  }
}

const manager = new RoomManager();

const app = uWS.App();

app.ws("/*", {
  maxBackpressure: 1024 * 1024,
  idleTimeout: 30,
  compression: uWS.SHARED_COMPRESSOR,

  upgrade: (res, req, context) => {
    const url = req.getUrl();
    const query = req.getQuery();
    const params = new URLSearchParams(query);
    const roomId = Number(params.get("room")) || 1;
    res.upgrade({ roomId }, req.getHeader("sec-websocket-key"), req.getHeader("sec-websocket-protocol"), req.getHeader("sec-websocket-extensions"), context);
  },

  open: (ws) => {
    const data = ws.getUserData() as any;
    const room = manager.get(data.roomId);
    room.join(ws as any);
  },

  message: (ws, message, isBinary) => {
    try {
      const env = decodeClient(isBinary ? message : message as ArrayBuffer);
      const data = ws.getUserData() as any;
      const room = manager.get(data.roomId);
      if (env.issue_orders) {
        const { from_ids, target_id, pct } = env.issue_orders;
        room.issueOrdersFrom(ws as any, from_ids || [], Number(target_id), Math.max(0, Math.min(1, Number(pct))));
      } else if (env.request_snapshot) {
        room.join(ws as any);
      } else if (env.ping) {
        const pong = { pong: { server_time_ms: Date.now(), seq: env.ping.seq || 0 } };
        (ws as any).send(encodeServer(pong), true);
      }
    } catch (e) {
      // ignore
    }
  },

  close: (ws) => {
    const data = ws.getUserData() as any;
    const room = manager.rooms.get(data.roomId);
    room?.leave(ws as any);
  }
});

const PORT = Number(process.env.PORT || 8081);
app.listen(PORT, (token) => {
  if (token) console.log(`Game worker listening on ws://localhost:${PORT}`);
});

const dt = 1 / TICK_HZ;
setInterval(() => {
  const now = Date.now();
  manager.tick(dt, now);
}, Math.floor(1000 / TICK_HZ));
