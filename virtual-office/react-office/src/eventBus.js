import Phaser from 'phaser';

// Single bridge between React (HUD, panels) and Phaser (the office map).
// React -> Phaser: 'state', 'flash-zone'
// Phaser -> React: 'interact', 'near-zone', 'scene-ready'
export const bus = new Phaser.Events.EventEmitter();
