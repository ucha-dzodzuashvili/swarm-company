'use client';
import React from 'react';
import { gold } from './palette';

export default function FleetDart({ x, y, rot, scale = 1 }: { x: number; y: number; rot: number; scale?: number }) {
  const s = 14 * scale;
  const hull = [
    `M 0 ${-s}`,
    `L ${s * 1.1} 0`,
    `L 0 ${s}`,
    `L ${-s * 0.5} ${s * 0.38}`,
    `L ${-s * 1.6} 0`,
    `L ${-s * 0.5} ${-s * 0.38}`,
    'Z',
  ].join(' ');

  const inset = [
    `M 0 ${-s * 0.6}`,
    `L ${s * 0.55} 0`,
    `L 0 ${s * 0.6}`,
    `L ${-s * 0.55} 0`,
    'Z',
  ].join(' ');

  const gemR = s * 0.22;
  const nose = `M ${s * 0.9} 0 L ${s * 1.1} 0 L ${s * 0.88} ${-s * 0.22} L ${s * 0.88} ${s * 0.22} Z`;

  return (
    <g transform={`translate(${x},${y}) rotate(${rot})`}>
      <path d={`M ${-s * 1.6} 0 L ${-s * 3.8} 0`} stroke="#bff6ff" strokeOpacity={0.18} strokeWidth={7} />
      <path d={`M ${-s * 1.6} -1.5 L ${-s * 3.1} -1.5`} stroke="#9feeff" strokeOpacity={0.38} strokeWidth={3} />
      <path d={`M ${-s * 1.6} 1.5 L ${-s * 3.1} 1.5`} stroke="#9feeff" strokeOpacity={0.32} strokeWidth={3} />
      <path d={hull} fill="url(#goldRad)" stroke="url(#goldStroke)" strokeWidth={3.6} strokeLinejoin="round" />
      <path d={inset} fill="url(#core-aqua)" />
      <polygon points={`${-s * 0.25},${-s * 0.48} ${-s * 0.05},0 ${-s * 0.25},${s * 0.48}`} fill="url(#goldRad)" opacity={0.9} />
      <circle cx={-s * 0.05} cy={0} r={gemR} fill="url(#core-aqua)" stroke="url(#goldStroke)" strokeWidth={2.2} />
      <path d={nose} fill="url(#goldRad)" />
    </g>
  );
}
