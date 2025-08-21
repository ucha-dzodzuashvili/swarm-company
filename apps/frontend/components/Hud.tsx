'use client';
import React from 'react';

interface Totals {
  human: number;
  ai: number;
  neutral: number;
}

interface HudProps {
  totals: Totals;
  sendPercent: number;
  setSendPercent: (v: number) => void;
}

function Circle({ value, size = 'w-16 h-16', gradient = 'from-blue-900 to-cyan-700', border = 'border-yellow-600' }: { value: number; size?: string; gradient?: string; border?: string; }) {
  return (
    <div className={`${size} rounded-full border-4 ${border} bg-gradient-to-b ${gradient} flex items-center justify-center text-white font-bold select-none`}>
      {value}
    </div>
  );
}

export default function Hud({ totals, sendPercent, setSendPercent }: HudProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 pointer-events-auto">
      <Circle value={Math.round(totals.human)} gradient="from-teal-900 to-teal-600" border="border-cyan-400" />
      <div className="w-8 h-0.5 bg-yellow-600" />
      <div className="relative">
        <Circle value={Math.round(sendPercent * 100)} size="w-24 h-24" gradient="from-sky-900 to-sky-600" border="border-yellow-500" />
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={Math.round(sendPercent * 100)}
          onChange={e => setSendPercent(Math.max(0.05, parseInt(e.target.value) / 100))}
          className="absolute -bottom-5 left-1/2 -translate-x-1/2 w-24"
        />
      </div>
      <div className="w-8 h-0.5 bg-yellow-600" />
      <Circle value={Math.round(totals.ai)} gradient="from-red-900 to-red-600" border="border-red-500" />
      <div className="w-8 h-0.5 bg-yellow-600" />
      <Circle value={Math.round(totals.neutral)} gradient="from-gray-700 to-gray-500" border="border-gray-400" />
    </div>
  );
}
