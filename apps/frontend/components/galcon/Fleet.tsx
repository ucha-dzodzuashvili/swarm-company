'use client';
import React from 'react';
import FleetDart from './FleetDart';
import { FleetGroup } from './types';

export default function Fleet({ g }: { g: FleetGroup }) {
  const angle = (Math.atan2(g.dy, g.dx) * 180) / Math.PI;
  return (
    <g>
      {Array.from({ length: g.count }).map((_, i) => (
        <FleetDart key={i} x={g.x + i * 30} y={g.y + (i % 2 === 0 ? -10 : 12)} rot={angle} />
      ))}
    </g>
  );
}
