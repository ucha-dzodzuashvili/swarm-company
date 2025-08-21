'use client';
import React, { useMemo, useState } from 'react';
import Planet from './galcon/Planet';
import TriBadge from './galcon/TriBadge';
import Link from './galcon/Link';
import Fleet from './galcon/Fleet';
import { gold, aqua, red } from './galcon/palette';
import { NodeData, LinkData, FleetGroup } from './galcon/types';

const VIEW_W = 1200;
const VIEW_H = 700;

function lineId(a: string, b: string) {
  return [a, b].sort().join('__');
}

export default function GalconBoard() {
  const [selected, setSelected] = useState<string | null>(null);

  const nodes: NodeData[] = useMemo(
    () => [
      { id: 'C', x: 600, y: 340, r: 96, value: 35, variant: 'aqua' },
      { id: 'L1', x: 240, y: 130, r: 66, value: 20, variant: 'aqua' },
      { id: 'L2', x: 360, y: 230, r: 28, value: 7, variant: 'aqua' },
      { id: 'L3', x: 300, y: 430, r: 44, value: 4, variant: 'aqua' },
      { id: 'L4', x: 420, y: 430, r: 26, value: 2, variant: 'aqua' },
      { id: 'L5', x: 200, y: 340, r: 24, value: 7, variant: 'aqua' },
      { id: 'B1', x: 600, y: 535, r: 38, value: 10, variant: 'aqua' },
      { id: 'R1', x: 880, y: 130, r: 26, value: 8, variant: 'aqua' },
      { id: 'R2', x: 1020, y: 110, r: 68, value: 18, variant: 'red' },
      { id: 'R3', x: 820, y: 430, r: 38, value: 10, variant: 'aqua' },
      { id: 'R4', x: 930, y: 290, r: 22, value: 8, variant: 'tri' },
      { id: 'R5', x: 930, y: 170, r: 22, value: 8, variant: 'aqua' },
    ],
    []
  );

  const map = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);

  const links: LinkData[] = useMemo(
    () => [
      { id: lineId('C', 'L1'), from: 'C', to: 'L1' },
      { id: lineId('C', 'L2'), from: 'C', to: 'L2' },
      { id: lineId('C', 'L3'), from: 'C', to: 'L3' },
      { id: lineId('C', 'B1'), from: 'C', to: 'B1' },
      { id: lineId('C', 'R1'), from: 'C', to: 'R1' },
      { id: lineId('C', 'R3'), from: 'C', to: 'R3' },
      { id: lineId('R1', 'R2'), from: 'R1', to: 'R2' },
      { id: lineId('R1', 'R4'), from: 'R1', to: 'R4' },
      { id: lineId('R3', 'B1'), from: 'R3', to: 'B1' },
      { id: lineId('L2', 'L1'), from: 'L2', to: 'L1' },
      { id: lineId('L3', 'L4'), from: 'L3', to: 'L4' },
      { id: lineId('L5', 'L3'), from: 'L5', to: 'L3' },
    ],
    []
  );

  const fleets: FleetGroup[] = useMemo(
    () => [
      { id: 'F1', x: 215, y: 610, dx: 1, dy: -0.38, count: 7 },
      { id: 'F2', x: 900, y: 620, dx: -1, dy: -0.52, count: 6 },
    ],
    []
  );

  return (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full max-w-[1200px] drop-shadow-2xl">
        <defs>
          <radialGradient id="bgRad" cx="50%" cy="48%" r="70%">
            <stop offset="0%" stopColor="#0a1722" />
            <stop offset="100%" stopColor="#050b10" />
          </radialGradient>
          <radialGradient id="goldRad" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor={gold.light} />
            <stop offset="60%" stopColor={gold.base} />
            <stop offset="100%" stopColor={gold.dark} />
          </radialGradient>
          <linearGradient id="goldStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gold.light} />
            <stop offset="100%" stopColor={gold.dark} />
          </linearGradient>
          <radialGradient id="core-aqua" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor={aqua.core} />
            <stop offset="100%" stopColor={aqua.deep} />
          </radialGradient>
          <radialGradient id="core-red" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor={red.core} />
            <stop offset="100%" stopColor={red.deep} />
          </radialGradient>
          <radialGradient id="glow-aqua" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#40c8ff" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#40c8ff" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="glow-red" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#ff6e6e" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#ff6e6e" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="glass" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
          </radialGradient>
          <filter id="marble">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="noStitch" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="table" tableValues="0 0 0.02 0.06" />
            </feComponentTransfer>
            <feBlend mode="overlay" in2="SourceGraphic" />
          </filter>
          <pattern id="stars" width="200" height="200" patternUnits="userSpaceOnUse">
            <rect width="200" height="200" fill="transparent" />
            {Array.from({ length: 50 }).map((_, i) => (
              <circle key={i} cx={(i * 37) % 200} cy={(i * 83) % 200} r={i % 3 === 0 ? 1.2 : 0.8} fill="#9fd8ff" opacity={0.45} />
            ))}
          </pattern>
        </defs>

        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#bgRad)" />
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#stars)" opacity={0.25} />

        {links.map(l => (
          <Link key={l.id} a={map[l.from]} b={map[l.to]} />
        ))}

        <Fleet g={fleets[0]} />

        {nodes.map(n =>
          n.variant === 'tri' ? (
            <TriBadge key={n.id} n={n} />
          ) : (
            <Planet key={n.id} n={n} selected={selected === n.id} onClick={setSelected} />
          )
        )}

        <Fleet g={fleets[1]} />
      </svg>
    </div>
  );
}
