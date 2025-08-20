import express from "express";
import Redis from "ioredis";

const PORT = Number(process.env.PORT || 8080);
const WS_URL = process.env.WS_URL || "ws://localhost:8081";
const redisUrl = process.env.REDIS_URL || "redis://redis:6379";
const redis = new Redis(redisUrl);

const app = express();

app.get("/join", async (_req: any, res: any) => {
  const n = await redis.incr("join_counter");
  const roomId = Math.ceil(n / 2);
  res.json({ roomId, wsUrl: WS_URL });
});

app.listen(PORT, () => {
  console.log(`Matchmaker listening on http://localhost:${PORT}`);
});
