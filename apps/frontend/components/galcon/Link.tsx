'use client';
import React from 'react';
import { NodeData } from './types';

export default function Link({ a, b }: { a: NodeData; b: NodeData }) {
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8fe9ff" strokeOpacity={0.12} strokeWidth={8} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#53d5f0" strokeOpacity={0.7} strokeWidth={2} />
    </g>
  );
}
