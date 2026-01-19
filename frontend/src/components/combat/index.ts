// Combat components index
// Phase 4: PixiJS is now the only renderer

// Export PixiCombatModal as CombatModal for backwards compatibility
export { PixiCombatModal as CombatModal } from './pixi/PixiCombatModal';

// Keep other components that are still used
export { ActionButtons } from './ActionButtons';
export { CombatLog } from './CombatLog';
export { InitiativeTracker } from './InitiativeTracker';
export { PlayerHUD } from './PlayerHUD';
