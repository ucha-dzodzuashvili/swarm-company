'use client';
import { useState } from 'react';
import SinglePlayerGame from '../components/SinglePlayerGame';
import MultiPlayerGame from '../components/MultiPlayerGame';

export default function Page() {
  const [mode, setMode] = useState<'menu' | 'single' | 'multi'>('menu');

  if (mode === 'single') return <SinglePlayerGame />;
  if (mode === 'multi') return <MultiPlayerGame />;

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ color: 'white', fontFamily: 'ui-sans-serif' }}>Swarm — Demo</h2>
      <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
        <button onClick={() => setMode('single')}>Single Player</button>
        <button onClick={() => setMode('multi')}>Multiplayer</button>
      </div>
    </div>
  );
}
