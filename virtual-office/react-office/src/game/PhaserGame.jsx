import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import OfficeScene from './OfficeScene.js';

export default function PhaserGame() {
  const host = useRef(null);

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      backgroundColor: '#0b1220',
      physics: { default: 'arcade', arcade: { debug: false } },
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      scene: [OfficeScene]
    });
    return () => game.destroy(true); // safe under React StrictMode double-mount
  }, []);

  return <div ref={host} className="game-host" />;
}
