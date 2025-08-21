'use client';
import { useState } from 'react';
import SinglePlayerGame from '../components/SinglePlayerGame';
import MultiPlayerGame from '../components/MultiPlayerGame';
import GalconBoard from '../components/GalconBoard';

export default function Page() {
  const [mode, setMode] = useState<'menu' | 'single' | 'multi' | 'board'>('menu');

  if (mode === 'single') return <SinglePlayerGame />;
  if (mode === 'multi') return <MultiPlayerGame />;
  if (mode === 'board') return <GalconBoard />;

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ color: 'white', fontFamily: 'ui-sans-serif' }}>Swarm — Demo</h2>
      <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
        <button onClick={() => setMode('single')}>Single Player</button>
        <button onClick={() => setMode('multi')}>Multiplayer</button>
        <button onClick={() => setMode('board')}>Board Demo</button>
      </div>
    </div>
  );
}
