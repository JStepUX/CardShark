/**
 * @file combatEngine.ts
 * @description Pure combat engine using reducer pattern - fully testable with no side effects.
 *
 * ## Architecture
 * The engine is a pure function: `combatReducer(state, action) => { state, events }`
 * - No React dependencies
 * - No DOM manipulation
 * - No async operations
 * - Deterministic given same random seed
 *
 * ## Combat Flow
 * 1. `initializeCombat(data)` - Creates initial state, rolls initiative
 * 2. `combatReducer(state, action)` - Processes player/enemy actions
 * 3. Engine auto-advances turns and checks victory/defeat
 *
 * ## Key Formulas (V1)
 * - Attack: d20 + floor(level/2) >= target.defense
 * - Damage: attacker.damage - target.armor (min 1)
 * - Initiative: speed + d6
 *
 * ## Balance Notes
 * Current formulas have known issues at high levels (miss rate → 0%).
 * Use `tools/combat-simulator.js` for data-driven tuning.
 *
 * @see /docs/combat-system.md for full documentation
 * @see /tools/combat-simulator.js for balance testing
 */

import {
  CombatState,
  CombatAction,
  CombatEvent,
  Combatant,
  Battlefield,
  CombatLogEntry,
  CombatInitData,
  HitQuality,
  ActionType,
  calculateHitQuality,
  createCombatant,
} from '../../types/combat';
import { generateUUID } from '../../utils/generateUUID';

// =============================================================================
// Random Utilities
// =============================================================================

/**
 * Roll a d20 (1-20).
 */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Roll a d6 (1-6).
 */
export function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize a new combat encounter.
 *
 * Creates the initial combat state including:
 * - All combatants with derived stats
 * - Battlefield placement (allies bottom row, enemies top row)
 * - Initiative order (speed + d6, sorted descending)
 *
 * @param data - Combat initialization data (player, enemies, allies, room info)
 * @returns Initial CombatState ready for the first turn
 *
 * @example
 * const state = initializeCombat({
 *   playerData: { id: 'player', name: 'Hero', level: 10, imagePath: null },
 *   enemies: [{ id: 'goblin-1', name: 'Goblin', level: 5, imagePath: null }],
 *   roomName: 'Dark Cave',
 *   roomImagePath: null,
 *   playerAdvantage: true,
 * });
 */
export function initializeCombat(data: CombatInitData): CombatState {
  const combatants: Record<string, Combatant> = {};
  const battlefield: Battlefield = {
    enemySlots: [null, null, null, null, null],
    allySlots: [null, null, null, null, null],
  };

  // Place player in center of ally row
  const playerSlot = 2;
  const player = createCombatant(
    data.playerData.id,
    data.playerData.name,
    data.playerData.level,
    data.playerData.imagePath,
    true,  // isPlayerControlled
    true,  // isPlayer
    playerSlot
  );
  combatants[player.id] = player;
  battlefield.allySlots[playerSlot] = player.id;

  // Place allies (if any) around player
  const allySlots = [1, 3, 0, 4]; // Fill from center out
  data.allies?.forEach((ally, index) => {
    if (index < allySlots.length) {
      const slot = allySlots[index];
      const combatant = createCombatant(
        ally.id,
        ally.name,
        ally.level,
        ally.imagePath,
        true,  // isPlayerControlled
        false, // isPlayer
        slot
      );
      combatants[combatant.id] = combatant;
      battlefield.allySlots[slot] = combatant.id;
    }
  });

  // Place enemies using melee formation preference (cluster center)
  const enemyFormation = [2, 1, 3, 0, 4]; // Center first, then spread
  data.enemies.forEach((enemy, index) => {
    if (index < enemyFormation.length) {
      const slot = enemyFormation[index];
      const combatant = createCombatant(
        enemy.id,
        enemy.name,
        enemy.level,
        enemy.imagePath,
        false, // isPlayerControlled
        false, // isPlayer
        slot
      );
      combatants[combatant.id] = combatant;
      battlefield.enemySlots[slot] = combatant.id;
    }
  });

  // Calculate initiative: speed + d6
  const initiativeRolls: Array<{ id: string; initiative: number; speed: number }> = [];
  Object.values(combatants).forEach(c => {
    initiativeRolls.push({
      id: c.id,
      initiative: c.speed + rollD6(),
      speed: c.speed,
    });
  });

  // Sort by initiative (descending), then speed (descending), then player-controlled first
  initiativeRolls.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if (b.speed !== a.speed) return b.speed - a.speed;
    const aPlayerControlled = combatants[a.id].isPlayerControlled ? 1 : 0;
    const bPlayerControlled = combatants[b.id].isPlayerControlled ? 1 : 0;
    return bPlayerControlled - aPlayerControlled;
  });

  const initiativeOrder = initiativeRolls.map(r => r.id);

  const state: CombatState = {
    phase: 'turn_start',
    turn: 1,
    combatants,
    battlefield,
    initiativeOrder,
    currentTurnIndex: 0,
    log: [],
    pendingEvents: [],
    roomImagePath: data.roomImagePath,
    roomName: data.roomName,
  };

  // Emit combat_start event
  state.pendingEvents.push({
    type: 'combat_start',
    turn: 1,
    data: {
      playerAdvantage: data.playerAdvantage,
      enemyCount: data.enemies.length,
      allyCount: (data.allies?.length || 0) + 1,
      roomName: data.roomName,
    },
  });

  // Start first turn
  return startTurn(state);
}

// =============================================================================
// Turn Management
// =============================================================================

/**
 * Start a combatant's turn.
 */
function startTurn(state: CombatState): CombatState {
  const currentId = state.initiativeOrder[state.currentTurnIndex];
  const combatant = state.combatants[currentId];

  if (!combatant || combatant.isKnockedOut) {
    // Skip knocked out combatants
    return advanceTurn(state);
  }

  // Reset AP and clear defending status
  const updatedCombatant: Combatant = {
    ...combatant,
    apRemaining: 2,
    isDefending: false,
    isOverwatching: false, // Clear overwatch at start of your turn
    recentDamage: null,
    recentHeal: null,
  };

  const newState: CombatState = {
    ...state,
    phase: combatant.isPlayerControlled ? 'awaiting_input' : 'resolving',
    combatants: {
      ...state.combatants,
      [currentId]: updatedCombatant,
    },
  };

  // Emit turn_start event (sparse - every 3rd turn or significant moments)
  if (state.turn === 1 || state.turn % 3 === 0) {
    newState.pendingEvents = [
      ...state.pendingEvents,
      {
        type: 'turn_start',
        turn: state.turn,
        actorId: currentId,
        data: {
          actorName: combatant.name,
          isPlayerControlled: combatant.isPlayerControlled,
        },
      },
    ];
  }

  return newState;
}

/**
 * Advance to next combatant's turn.
 */
function advanceTurn(state: CombatState): CombatState {
  let nextIndex = state.currentTurnIndex + 1;
  let nextTurn = state.turn;

  // Wrap around to next round
  if (nextIndex >= state.initiativeOrder.length) {
    nextIndex = 0;
    nextTurn = state.turn + 1;
  }

  // Check for victory/defeat before continuing
  const victoryCheck = checkVictoryCondition(state);
  if (victoryCheck) {
    return victoryCheck;
  }

  const newState: CombatState = {
    ...state,
    currentTurnIndex: nextIndex,
    turn: nextTurn,
  };

  return startTurn(newState);
}

/**
 * Check if combat has ended.
 */
function checkVictoryCondition(state: CombatState): CombatState | null {
  const allies = Object.values(state.combatants).filter(c => c.isPlayerControlled);
  const enemies = Object.values(state.combatants).filter(c => !c.isPlayerControlled);

  const alliesAlive = allies.filter(c => !c.isKnockedOut);
  const enemiesAlive = enemies.filter(c => !c.isKnockedOut);

  if (enemiesAlive.length === 0) {
    // Victory!
    const xpReward = enemies.reduce((sum, e) => sum + e.level * 10, 0);
    const goldReward = enemies.reduce((sum, e) => sum + e.level * Math.floor(Math.random() * 11 + 5), 0);

    const victoryState: CombatState = {
      ...state,
      phase: 'victory',
      result: {
        outcome: 'victory',
        rewards: {
          xp: xpReward,
          gold: goldReward,
          items: [], // V1: no item drops
        },
        survivingAllies: alliesAlive.map(a => a.id),
        defeatedEnemies: enemies.map(e => e.id),
      },
      pendingEvents: [
        ...state.pendingEvents,
        {
          type: 'combat_victory',
          turn: state.turn,
          data: {
            turnsTotal: state.turn,
            xpReward,
            goldReward,
            survivingAllies: alliesAlive.length,
          },
        },
      ],
    };

    return victoryState;
  }

  if (alliesAlive.length === 0) {
    // Defeat (TPK)
    const defeatState: CombatState = {
      ...state,
      phase: 'defeat',
      result: {
        outcome: 'defeat',
        survivingAllies: [],
        defeatedEnemies: enemies.filter(e => e.isKnockedOut).map(e => e.id),
      },
      pendingEvents: [
        ...state.pendingEvents,
        {
          type: 'combat_defeat',
          turn: state.turn,
          data: {
            turnsTotal: state.turn,
          },
        },
      ],
    };

    return defeatState;
  }

  return null;
}

// =============================================================================
// Action Execution
// =============================================================================

/**
 * Main combat reducer - processes an action and returns new state + events.
 *
 * This is the primary entry point for combat logic. It's a pure function:
 * same inputs always produce same outputs (given same random rolls).
 *
 * @param state - Current combat state
 * @param action - Action to perform (attack, defend, move, etc.)
 * @returns Object containing:
 *   - `state`: New combat state after action
 *   - `events`: Array of events for narrator/UI (attack results, deaths, etc.)
 *
 * @example
 * // Player attacks an enemy
 * const { state: newState, events } = combatReducer(state, {
 *   type: 'attack',
 *   actorId: 'player',
 *   targetId: 'goblin-1',
 * });
 *
 * // Process events for narrator
 * for (const event of events) {
 *   if (event.type === 'attack_resolved') {
 *     console.log(`${event.data.actorName} hit for ${event.data.finalDamage}!`);
 *   }
 * }
 *
 * @remarks
 * The reducer automatically advances turns after actions that end the turn
 * (attack, defend, overwatch, flee) and checks for victory/defeat conditions.
 */
export function combatReducer(
  state: CombatState,
  action: CombatAction
): { state: CombatState; events: CombatEvent[] } {
  let newState: CombatState;

  switch (action.type) {
    case 'attack':
      newState = executeAttack(state, action);
      break;
    case 'defend':
      newState = executeDefend(state, action);
      break;
    case 'overwatch':
      newState = executeOverwatch(state, action);
      break;
    case 'move':
      newState = executeMove(state, action);
      break;
    case 'swap':
      newState = executeSwap(state, action);
      break;
    case 'flee':
      newState = executeFlee(state, action);
      break;
    default:
      newState = state;
  }

  // Extract pending events and clear them
  const events = newState.pendingEvents;
  newState = { ...newState, pendingEvents: [] };

  return { state: newState, events };
}

/**
 * Execute an attack action.
 * Cost: 2 AP, ends turn.
 */
function executeAttack(state: CombatState, action: CombatAction): CombatState {
  const actor = state.combatants[action.actorId];
  const target = action.targetId ? state.combatants[action.targetId] : null;

  if (!actor || !target || actor.apRemaining < 2) {
    return state;
  }

  // Roll to hit: d20 + attack bonus >= target defense
  const attackRoll = rollD20();
  const attackBonus = Math.floor(actor.level / 2); // Simple bonus based on level
  const totalAttack = attackRoll + attackBonus;

  // Adjacency bonus: +1 if ally adjacent
  const actorSlot = actor.slotPosition;
  const allySlots = actor.isPlayerControlled ? state.battlefield.allySlots : state.battlefield.enemySlots;
  const hasAdjacentAlly = [-1, 1].some(offset => {
    const adjSlot = actorSlot + offset;
    if (adjSlot < 0 || adjSlot > 4) return false;
    const adjId = allySlots[adjSlot];
    if (!adjId) return false;
    const adj = state.combatants[adjId];
    return adj && !adj.isKnockedOut && adj.isPlayerControlled === actor.isPlayerControlled;
  });
  const adjacencyBonus = hasAdjacentAlly ? 1 : 0;

  // Target defense (with defend bonus if applicable)
  const targetDefense = target.defense + (target.isDefending ? 2 : 0);

  const finalAttack = totalAttack + adjacencyBonus;
  const hit = finalAttack >= targetDefense;

  // Calculate damage
  let rawDamage = 0;
  let finalDamage = 0;
  let hitQuality: HitQuality = 'miss';

  if (hit) {
    rawDamage = actor.damage;
    finalDamage = Math.max(1, rawDamage - target.armor); // Minimum 1 damage
    hitQuality = calculateHitQuality(finalAttack, targetDefense, rawDamage, finalDamage);
  }

  // Apply damage to target
  const newTargetHp = Math.max(0, target.currentHp - finalDamage);
  const isKillingBlow = hit && newTargetHp === 0;
  const overkillAmount = isKillingBlow ? finalDamage - target.currentHp : 0;

  // Update target
  const updatedTarget: Combatant = {
    ...target,
    currentHp: newTargetHp,
    isKnockedOut: newTargetHp === 0,
    recentDamage: hit ? finalDamage : null,
  };

  // Update actor (spend AP)
  const updatedActor: Combatant = {
    ...actor,
    apRemaining: 0, // Attack costs 2 AP and ends turn
  };

  // Create log entry
  const mechanicalText = hit
    ? `${actor.name} strikes ${target.name} for ${finalDamage} damage!`
    : `${actor.name}'s attack misses ${target.name}!`;

  const logEntry: CombatLogEntry = {
    id: generateUUID(),
    turn: state.turn,
    actorId: actor.id,
    actorName: actor.name,
    actionType: 'attack',
    targetId: target.id,
    targetName: target.name,
    result: {
      hit,
      damage: finalDamage,
      hitQuality,
      special: isKillingBlow ? 'killing_blow' : undefined,
    },
    mechanicalText,
  };

  // Create events
  const events: CombatEvent[] = [
    {
      type: 'attack_resolved',
      turn: state.turn,
      actorId: actor.id,
      targetId: target.id,
      data: {
        attackRoll: finalAttack,
        targetDefense,
        rawDamage,
        finalDamage,
        hitQuality,
        isKillingBlow,
        overkillAmount,
        actorName: actor.name,
        targetName: target.name,
      },
    },
  ];

  if (isKillingBlow) {
    events.push({
      type: 'character_defeated',
      turn: state.turn,
      actorId: actor.id,
      targetId: target.id,
      data: {
        defeatedName: target.name,
        defeatedIsEnemy: !target.isPlayerControlled,
        killerName: actor.name,
      },
    });
  }

  const newState: CombatState = {
    ...state,
    combatants: {
      ...state.combatants,
      [actor.id]: updatedActor,
      [target.id]: updatedTarget,
    },
    log: [...state.log, logEntry],
    pendingEvents: [...state.pendingEvents, ...events],
  };

  // Attack ends turn, advance to next combatant
  return advanceTurn(newState);
}

/**
 * Execute a defend action.
 * Cost: 1 AP, ends turn, +2 Defense until next turn.
 */
function executeDefend(state: CombatState, action: CombatAction): CombatState {
  const actor = state.combatants[action.actorId];

  if (!actor || actor.apRemaining < 1) {
    return state;
  }

  const updatedActor: Combatant = {
    ...actor,
    apRemaining: 0, // Ends turn
    isDefending: true,
  };

  const logEntry: CombatLogEntry = {
    id: generateUUID(),
    turn: state.turn,
    actorId: actor.id,
    actorName: actor.name,
    actionType: 'defend',
    result: {},
    mechanicalText: `${actor.name} takes a defensive stance.`,
  };

  const newState: CombatState = {
    ...state,
    combatants: {
      ...state.combatants,
      [actor.id]: updatedActor,
    },
    log: [...state.log, logEntry],
    pendingEvents: [
      ...state.pendingEvents,
      {
        type: 'defend_activated',
        turn: state.turn,
        actorId: actor.id,
        data: { actorName: actor.name },
      },
    ],
  };

  return advanceTurn(newState);
}

/**
 * Execute an overwatch action.
 * Cost: 2 AP, ends turn.
 */
function executeOverwatch(state: CombatState, action: CombatAction): CombatState {
  const actor = state.combatants[action.actorId];

  if (!actor || actor.apRemaining < 2) {
    return state;
  }

  const updatedActor: Combatant = {
    ...actor,
    apRemaining: 0,
    isOverwatching: true,
  };

  const logEntry: CombatLogEntry = {
    id: generateUUID(),
    turn: state.turn,
    actorId: actor.id,
    actorName: actor.name,
    actionType: 'overwatch',
    result: {},
    mechanicalText: `${actor.name} enters overwatch, ready to react.`,
  };

  const newState: CombatState = {
    ...state,
    combatants: {
      ...state.combatants,
      [actor.id]: updatedActor,
    },
    log: [...state.log, logEntry],
    pendingEvents: [
      ...state.pendingEvents,
      {
        type: 'overwatch_activated',
        turn: state.turn,
        actorId: actor.id,
        data: { actorName: actor.name },
      },
    ],
  };

  return advanceTurn(newState);
}

/**
 * Execute a move action.
 * Cost: 1 AP to adjacent empty slot, 2 AP to pass ally.
 */
function executeMove(state: CombatState, action: CombatAction): CombatState {
  const actor = state.combatants[action.actorId];
  const targetSlot = action.targetSlot;

  if (!actor || targetSlot === undefined || targetSlot < 0 || targetSlot > 4) {
    return state;
  }

  const isAlly = actor.isPlayerControlled;
  const slots = isAlly ? [...state.battlefield.allySlots] : [...state.battlefield.enemySlots];

  // Check if target slot is empty
  if (slots[targetSlot] !== null) {
    return state; // Can't move to occupied slot
  }

  // Calculate move cost
  const currentSlot = actor.slotPosition;
  const distance = Math.abs(targetSlot - currentSlot);

  // Check if passing over allies
  let passingAlly = false;
  const minSlot = Math.min(currentSlot, targetSlot);
  const maxSlot = Math.max(currentSlot, targetSlot);
  for (let i = minSlot + 1; i < maxSlot; i++) {
    if (slots[i] !== null) {
      passingAlly = true;
      break;
    }
  }

  const moveCost = passingAlly ? 2 : (distance === 1 ? 1 : 2);

  if (actor.apRemaining < moveCost) {
    return state;
  }

  // Execute move
  slots[currentSlot] = null;
  slots[targetSlot] = actor.id;

  const updatedActor: Combatant = {
    ...actor,
    slotPosition: targetSlot,
    apRemaining: actor.apRemaining - moveCost,
  };

  const updatedBattlefield: Battlefield = isAlly
    ? { ...state.battlefield, allySlots: slots }
    : { ...state.battlefield, enemySlots: slots };

  const logEntry: CombatLogEntry = {
    id: generateUUID(),
    turn: state.turn,
    actorId: actor.id,
    actorName: actor.name,
    actionType: 'move',
    result: {},
    mechanicalText: `${actor.name} moves to a new position.`,
  };

  let newState: CombatState = {
    ...state,
    combatants: {
      ...state.combatants,
      [actor.id]: updatedActor,
    },
    battlefield: updatedBattlefield,
    log: [...state.log, logEntry],
    pendingEvents: [
      ...state.pendingEvents,
      {
        type: 'move_completed',
        turn: state.turn,
        actorId: actor.id,
        data: {
          actorName: actor.name,
          fromSlot: currentSlot,
          toSlot: targetSlot,
        },
      },
    ],
  };

  // If AP exhausted or move cost was 2, end turn
  if (updatedActor.apRemaining === 0 || moveCost === 2) {
    newState = advanceTurn(newState);
  }

  return newState;
}

/**
 * Execute a swap action.
 * Cost: 1 AP, does not end turn.
 */
function executeSwap(state: CombatState, action: CombatAction): CombatState {
  const actor = state.combatants[action.actorId];
  const target = action.targetId ? state.combatants[action.targetId] : null;

  if (!actor || !target || actor.apRemaining < 1) {
    return state;
  }

  // Must be same team
  if (actor.isPlayerControlled !== target.isPlayerControlled) {
    return state;
  }

  // Must be adjacent
  if (Math.abs(actor.slotPosition - target.slotPosition) !== 1) {
    return state;
  }

  const isAlly = actor.isPlayerControlled;
  const slots = isAlly ? [...state.battlefield.allySlots] : [...state.battlefield.enemySlots];

  // Swap positions
  const actorSlot = actor.slotPosition;
  const targetSlot = target.slotPosition;
  slots[actorSlot] = target.id;
  slots[targetSlot] = actor.id;

  const updatedActor: Combatant = {
    ...actor,
    slotPosition: targetSlot,
    apRemaining: actor.apRemaining - 1,
  };

  const updatedTarget: Combatant = {
    ...target,
    slotPosition: actorSlot,
  };

  const updatedBattlefield: Battlefield = isAlly
    ? { ...state.battlefield, allySlots: slots }
    : { ...state.battlefield, enemySlots: slots };

  const logEntry: CombatLogEntry = {
    id: generateUUID(),
    turn: state.turn,
    actorId: actor.id,
    actorName: actor.name,
    actionType: 'swap',
    targetId: target.id,
    targetName: target.name,
    result: {},
    mechanicalText: `${actor.name} swaps positions with ${target.name}.`,
  };

  const newState: CombatState = {
    ...state,
    combatants: {
      ...state.combatants,
      [actor.id]: updatedActor,
      [target.id]: updatedTarget,
    },
    battlefield: updatedBattlefield,
    log: [...state.log, logEntry],
    pendingEvents: [
      ...state.pendingEvents,
      {
        type: 'swap_completed',
        turn: state.turn,
        actorId: actor.id,
        targetId: target.id,
        data: {
          actorName: actor.name,
          targetName: target.name,
        },
      },
    ],
  };

  // Swap doesn't end turn unless AP exhausted
  if (updatedActor.apRemaining === 0) {
    return advanceTurn(newState);
  }

  return newState;
}

/**
 * Execute a flee action.
 * Cost: 2 AP, ends turn. Must be at edge slot.
 */
function executeFlee(state: CombatState, action: CombatAction): CombatState {
  const actor = state.combatants[action.actorId];

  if (!actor || actor.apRemaining < 2) {
    return state;
  }

  // Must be at edge slot (0 or 4)
  if (actor.slotPosition !== 0 && actor.slotPosition !== 4) {
    return state;
  }

  // Roll flee check: d20 + speed >= 10 + fastest enemy speed
  const enemies = Object.values(state.combatants).filter(
    c => c.isPlayerControlled !== actor.isPlayerControlled && !c.isKnockedOut
  );
  const fastestEnemySpeed = Math.max(...enemies.map(e => e.speed), 0);
  const fleeRoll = rollD20() + actor.speed;
  const fleeDc = 10 + fastestEnemySpeed;
  const success = fleeRoll >= fleeDc;

  const updatedActor: Combatant = {
    ...actor,
    apRemaining: 0,
  };

  if (success) {
    // Remove from battlefield
    const isAlly = actor.isPlayerControlled;
    const slots = isAlly ? [...state.battlefield.allySlots] : [...state.battlefield.enemySlots];
    slots[actor.slotPosition] = null;

    updatedActor.isKnockedOut = true; // Effectively "out of combat"

    const updatedBattlefield: Battlefield = isAlly
      ? { ...state.battlefield, allySlots: slots }
      : { ...state.battlefield, enemySlots: slots };

    const logEntry: CombatLogEntry = {
      id: generateUUID(),
      turn: state.turn,
      actorId: actor.id,
      actorName: actor.name,
      actionType: 'flee',
      result: { special: 'fled' },
      mechanicalText: `${actor.name} flees from combat!`,
    };

    const newState: CombatState = {
      ...state,
      combatants: {
        ...state.combatants,
        [actor.id]: updatedActor,
      },
      battlefield: updatedBattlefield,
      log: [...state.log, logEntry],
      pendingEvents: [
        ...state.pendingEvents,
        {
          type: 'flee_attempted',
          turn: state.turn,
          actorId: actor.id,
          data: {
            actorName: actor.name,
            success: true,
            fleeRoll,
            fleeDc,
          },
        },
      ],
    };

    return advanceTurn(newState);
  } else {
    // Failed flee attempt
    const logEntry: CombatLogEntry = {
      id: generateUUID(),
      turn: state.turn,
      actorId: actor.id,
      actorName: actor.name,
      actionType: 'flee',
      result: { special: 'fled_failed' },
      mechanicalText: `${actor.name} tries to flee but is blocked!`,
    };

    const newState: CombatState = {
      ...state,
      combatants: {
        ...state.combatants,
        [actor.id]: updatedActor,
      },
      log: [...state.log, logEntry],
      pendingEvents: [
        ...state.pendingEvents,
        {
          type: 'flee_attempted',
          turn: state.turn,
          actorId: actor.id,
          data: {
            actorName: actor.name,
            success: false,
            fleeRoll,
            fleeDc,
          },
        },
      ],
    };

    return advanceTurn(newState);
  }
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Get the current actor (whose turn it is).
 */
export function getCurrentActor(state: CombatState): Combatant | null {
  const id = state.initiativeOrder[state.currentTurnIndex];
  return state.combatants[id] || null;
}

/**
 * Get valid attack targets for an actor.
 */
export function getValidAttackTargets(state: CombatState, actorId: string): Combatant[] {
  const actor = state.combatants[actorId];
  if (!actor) return [];

  return Object.values(state.combatants).filter(
    c => c.isPlayerControlled !== actor.isPlayerControlled && !c.isKnockedOut
  );
}

/**
 * Get valid move targets for an actor.
 */
export function getValidMoveSlots(state: CombatState, actorId: string): number[] {
  const actor = state.combatants[actorId];
  if (!actor) return [];

  const slots = actor.isPlayerControlled
    ? state.battlefield.allySlots
    : state.battlefield.enemySlots;

  const validSlots: number[] = [];
  for (let i = 0; i < 5; i++) {
    if (slots[i] === null) {
      validSlots.push(i);
    }
  }

  return validSlots;
}

/**
 * Get valid swap targets for an actor.
 */
export function getValidSwapTargets(state: CombatState, actorId: string): Combatant[] {
  const actor = state.combatants[actorId];
  if (!actor) return [];

  const currentSlot = actor.slotPosition;
  const adjacentSlots = [currentSlot - 1, currentSlot + 1].filter(s => s >= 0 && s <= 4);

  const slots = actor.isPlayerControlled
    ? state.battlefield.allySlots
    : state.battlefield.enemySlots;

  return adjacentSlots
    .map(s => slots[s])
    .filter((id): id is string => id !== null)
    .map(id => state.combatants[id])
    .filter(c => c && !c.isKnockedOut && c.id !== actorId);
}

/**
 * Check if actor can flee (at edge slot).
 */
export function canFlee(state: CombatState, actorId: string): boolean {
  const actor = state.combatants[actorId];
  if (!actor || actor.apRemaining < 2) return false;
  return actor.slotPosition === 0 || actor.slotPosition === 4;
}

/**
 * Get available actions for current actor.
 */
export function getAvailableActions(state: CombatState): ActionType[] {
  const actor = getCurrentActor(state);
  if (!actor || !actor.isPlayerControlled) return [];

  const actions: ActionType[] = [];
  const ap = actor.apRemaining;

  if (ap >= 2) {
    actions.push('attack');
    actions.push('overwatch');
  }

  if (ap >= 1) {
    actions.push('defend');
    if (getValidMoveSlots(state, actor.id).length > 0) {
      actions.push('move');
    }
    if (getValidSwapTargets(state, actor.id).length > 0) {
      actions.push('swap');
    }
  }

  if (canFlee(state, actor.id)) {
    actions.push('flee');
  }

  return actions;
}
