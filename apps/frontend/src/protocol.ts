import * as pb from "protobufjs";

const PROTO = `
syntax = "proto3";
package swarm.v1;

enum Owner {
  NEUTRAL = 0;
  PLAYER1 = 1;
  PLAYER2 = 2;
  PLAYER3 = 3;
  PLAYER4 = 4;
}

message IssueOrders {
  uint64 client_time_ms = 1;
  repeated uint32 from_ids = 2;
  uint32 target_id = 3;
  float pct = 4;
  uint32 input_seq = 5;
}

message RequestSnapshot {}

message Ping {
  uint64 client_time_ms = 1;
  uint32 seq = 2;
}

message Pong {
  uint64 server_time_ms = 1;
  uint32 seq = 2;
}

message PlanetGeom {
  uint32 id = 1;
  float x = 2;
  float y = 3;
  float r = 4;
  float production = 5;
}

message Layout {
  repeated PlanetGeom planets = 1;
}

message PlanetDelta {
  uint32 id = 1;
  Owner owner = 2;
  uint32 ships = 3;
}

message NewFleet {
  uint32 id = 1;
  Owner owner = 2;
  uint32 from_id = 3;
  uint32 to_id = 4;
  float x = 5;
  float y = 6;
  float vx = 7;
  float vy = 8;
  uint32 ships = 9;
}

message FleetDelta {
  uint32 id = 1;
  float x = 2;
  float y = 3;
}

message Snapshot {
  uint32 tick = 1;
  repeated PlanetDelta planets = 2;
  repeated NewFleet fleets = 3;
}

message Delta {
  uint32 tick = 1;
  repeated PlanetDelta planets = 2;
  repeated FleetDelta fleets = 3;
  repeated uint32 remove_fleets = 4;
  repeated NewFleet new_fleets = 5;
}

message Welcome {
  uint32 room_id = 1;
  uint32 tick_rate = 2;
  uint32 delta_hz = 3;
  uint32 player_id = 4;
  Layout layout = 5;
  Snapshot snapshot = 6;
}

message RoomEnded {
  string reason = 1;
}

message ClientEnvelope {
  oneof payload {
    IssueOrders issue_orders = 1;
    RequestSnapshot request_snapshot = 2;
    Ping ping = 3;
  }
}

message ServerEnvelope {
  oneof payload {
    Welcome welcome = 1;
    Snapshot snapshot = 2;
    Delta delta = 3;
    Pong pong = 4;
    RoomEnded ended = 5;
  }
}
`;

const root = pb.parse(PROTO).root;

export const Types = {
  ClientEnvelope: root.lookupType("swarm.v1.ClientEnvelope"),
  ServerEnvelope: root.lookupType("swarm.v1.ServerEnvelope"),
};

export function encodeServer(obj: any): Uint8Array {
  const msg = Types.ServerEnvelope.fromObject(obj);
  return Types.ServerEnvelope.encode(msg).finish();
}

export function decodeClient(buf: ArrayBuffer | Uint8Array): any {
  const msg = Types.ClientEnvelope.decode(new Uint8Array(buf as any));
  return Types.ClientEnvelope.toObject(msg, { longs: String });
}

export enum Owner {
  NEUTRAL = 0,
  PLAYER1 = 1,
  PLAYER2 = 2,
  PLAYER3 = 3,
  PLAYER4 = 4,
}

