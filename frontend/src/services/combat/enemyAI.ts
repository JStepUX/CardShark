// frontend/src/services/combat/enemyAI.ts
// Simple enemy AI for V1 combat

import {
  CombatState,
  CombatAction,
  Combatant,
} from '../../types/combat';
import { getValidAttackTargets, getCurrentActor } from './combatEngine';

/**
 * Simple enemy AI that picks an action.
 * V1: Always attacks lowest HP target.
 * Future: Different behaviors based on archetype.
 */
export function getEnemyAction(state: CombatState): CombatAction | null {
  const actor = getCurrentActor(state);

  if (!actor || actor.isPlayerControlled || actor.isKnockedOut) {
    return null;
  }

  // Get valid targets
  const targets = getValidAttackTargets(state, actor.id);

  if (targets.length === 0) {
    // No targets? Defend.
    return {
      type: 'defend',
      actorId: actor.id,
    };
  }

  // V1 AI: Attack lowest HP target (focus fire strategy)
  const sortedTargets = [...targets].sort((a, b) => a.currentHp - b.currentHp);
  const target = sortedTargets[0];

  return {
    type: 'attack',
    actorId: actor.id,
    targetId: target.id,
  };
}

/**
 * Get a short description of enemy intent for UI (optional future feature).
 */
export function getEnemyIntent(state: CombatState, enemyId: string): string {
  const enemy = state.combatants[enemyId];
  if (!enemy || enemy.isKnockedOut) return '';

  const targets = getValidAttackTargets(state, enemyId);
  if (targets.length === 0) return 'Defending';

  const sortedTargets = [...targets].sort((a, b) => a.currentHp - b.currentHp);
  return `Targeting ${sortedTargets[0].name}`;
}
