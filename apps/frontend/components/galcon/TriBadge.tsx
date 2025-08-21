'use client';
import React from 'react';
import { NodeData } from './types';

export default function TriBadge({ n }: { n: NodeData }) {
  const r = n.r;
  const fs = r * 0.85;
  return (
    <g transform={`translate(${n.x},${n.y})`}>
      <polygon
        points={`${-r},${r} 0,${-r} ${r},${r}`}
        fill={`url(#core-aqua)`}
        filter="url(#marble)"
        stroke={`url(#goldStroke)`}
        strokeWidth={10}
        strokeLinejoin="round"
        opacity={0.98}
      />
      <circle cx={-r * 0.85} cy={r * 0.85} r={r * 0.12} fill="url(#goldRad)" />
      <circle cx={0} cy={-r * 0.98} r={r * 0.12} fill="url(#goldRad)" />
      <circle cx={r * 0.85} cy={r * 0.85} r={r * 0.12} fill="url(#goldRad)" />
      <text
        y={fs * 0.35}
        textAnchor="middle"
        fontSize={fs}
        fontWeight={800}
        fill="#e7fbff"
        style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell' }}
      >
        {n.value}
      </text>
    </g>
  );
}
