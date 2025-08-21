'use client';
import React from 'react';
import { NodeData } from './types';
import { gold } from './palette';

function polarPoint(x: number, y: number, angleDeg: number, dist: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist };
}

function Crown() {
  return (
    <g transform="translate(0,-1)">
      <path
        d="M -58 -110 C -35 -150, 35 -150, 58 -110 L 40 -100 C 22 -128, -22 -128, -40 -100 Z"
        fill={`url(#goldRad)`}
        stroke={gold.dark}
        strokeWidth={2}
      />
      <ellipse cx={0} cy={-120} rx={14} ry={18} fill="url(#core-aqua)" stroke="url(#goldStroke)" strokeWidth={5} />
    </g>
  );
}

function CornerGem({ a, dist, size }: { a: number; dist: number; size: number }) {
  const p = polarPoint(0, 0, a, dist);
  const s = size;
  return (
    <g transform={`translate(${p.x},${p.y})`}>
      <polygon
        points={`0,${-s} ${s},0 0,${s} ${-s},0`}
        fill={`url(#goldRad)`}
        stroke={gold.dark}
        strokeWidth={1}
      />
      <circle r={s * 0.45} fill="url(#core-aqua)" stroke="url(#goldStroke)" strokeWidth={2.6} />
    </g>
  );
}

export default function Planet({ n, selected, onClick }: { n: NodeData; selected?: boolean; onClick?: (id: string) => void }) {
  const isRed = n.variant === 'red';
  const coreGrad = isRed ? 'core-red' : 'core-aqua';
  const glowId = isRed ? 'glow-red' : 'glow-aqua';
  const ring = Math.max(6, n.r * 0.18);
  const halo = n.r * 1.5;
  const fontSize = Math.max(14, n.r * 0.55);

  return (
    <g transform={`translate(${n.x},${n.y})`} onClick={() => onClick?.(n.id)} style={{ cursor: 'pointer' }}>
      <circle r={halo} fill={`url(#${glowId})`} opacity={0.9} />
      <circle r={n.r + ring + 10} fill="none" stroke={`url(#goldStroke)`} strokeWidth={8} opacity={0.9} />
      <circle r={n.r + ring} fill={`url(#goldRad)`} stroke={gold.dark} strokeWidth={2} />
      <circle r={n.r + Math.max(3, ring * 0.35)} fill="none" stroke={gold.dark} strokeOpacity={0.45} strokeWidth={2} />
      {[0, 90, 180, 270].map((a, i) => (
        <CornerGem key={i} a={a} dist={n.r + ring + 14} size={Math.max(6, n.r * 0.18)} />
      ))}
      <circle r={n.r} fill={`url(#${coreGrad})`} filter="url(#marble)" />
      <ellipse cx={-n.r * 0.25} cy={-n.r * 0.35} rx={n.r * 0.65} ry={n.r * 0.42} fill="url(#glass)" />
      <text
        y={fontSize * 0.35}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={800}
        fill="#e7fbff"
        style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell' }}
      >
        {n.value}
      </text>
      {selected && <circle r={n.r + ring + 16} fill="none" stroke="#8ee7ff" strokeWidth={4} strokeOpacity={0.95} />}
      {n.id === 'C' && <Crown />}
    </g>
  );
}
