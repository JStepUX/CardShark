/**
 * @file gridCombatEngine.ts
 * @description Grid-based tactical combat engine for card-avatar RPG.
 *
 * ## Core Loop
 * 1. Combat starts from LocalMapState when player enters threat zone
 * 2. Entities become GridCombatants with positions preserved
 * 3. Turn-based: initiative order, AP scales with level (2 + floor(level/10))
 * 4. Actions: move, attack (weapon-specific), defend, use item, AoE, end turn, flee
 * 5. Victory when all enemies defeated, defeat when player KO'd
 *
 * ## AP Economy (level-scaled)
 * - Level 1-9: 2 AP | Level 10-19: 3 AP | Level 20-29: 4 AP | ... | Level 60: 8 AP
 * - Move: 1 AP per tile (2 AP for difficult terrain)
 * - Heavy attack: 2 AP, ends turn (cleave on kill for heavy melee)
 * - Light attack: 1 AP, does NOT end turn (max 2/turn)
 * - Gun attack: 2 AP, ends turn (50% armor pen)
 * - Magic direct: 2 AP, ends turn (no LOS)
 * - AoE attack: 3 AP, ends turn (bomb 3x3 or magic cross)
 * - Defend: 1 AP, ends turn
 * - Use item: 2 AP, does NOT end turn
 * - Flee: full turn action
 */

import {
    GridCombatant,
    GridCombatState,
    GridCombatAction,
    GridMoveAction,
    GridAttackAction,
    GridDefendAction,
    GridFleeAction,
    GridUseItemAction,
    GridAoEAttackAction,
    CombatEvent,
    CombatEventType,
    CombatLogEntry,
    HitQuality,
    calculateHitQuality,
    GRID_AP_COSTS,
    MAX_LIGHT_ATTACKS_PER_TURN,
    getAPForLevel,
} from '../../types/combat';
import { TilePosition } from '../../types/localMap';
import { generateUUID } from '../../utils/generateUUID';
import {
    calculateDistance,
    hasLineOfSight,
    checkFlanking,
    CombatGrid,
    CombatEntity,
    getBlastPattern,
    getAdjacentEnemies,
    getCombatantsOnTiles,
    areAdjacent,
} from '../../utils/gridCombatUtils';
import {
    isLightWeapon,
    isAoEWeapon,
    getWeaponAPCost,
    doesWeaponEndTurn,
    weaponRequiresLOS,
    tickBuffs,
    applyBuff,
} from '../../types/inventory';
import type { InventoryItem } from '../../types/inventory';

// =============================================================================
// Random Utilities
// =============================================================================

function rollD20(): number {
    return Math.floor(Math.random() * 20) + 1;
}

function rollDamageVariance(): number {
    return Math.floor(Math.random() * 7) - 3; // -3 to +3
}

/**
 * Determine whether a defeated enemy is killed or incapacitated.
 * Incapacitation is MORE LIKELY than death (70% vs 30%).
 */
export function rollDeathOrIncapacitation(): 'incapacitated' | 'dead' {
    const roll = Math.random() * 100;
    return roll < 70 ? 'incapacitated' : 'dead';
}

// =============================================================================
// Grid Combat Reducer
// =============================================================================

export interface GridCombatResult {
    state: GridCombatState;
    events: CombatEvent[];
}

/**
 * Main grid combat reducer.
 * Pure function: state + action => new state + events
 */
export function gridCombatReducer(
    state: GridCombatState,
    action: GridCombatAction,
    grid: CombatGrid
): GridCombatResult {
    // Validate it's the actor's turn
    const currentId = state.initiativeOrder[state.currentTurnIndex];
    if (action.actorId !== currentId && action.type !== 'grid_end_turn') {
        return { state, events: [] };
    }

    let newState: GridCombatState;

    switch (action.type) {
        case 'grid_move':
            newState = executeGridMove(state, action, grid);
            break;
        case 'grid_attack':
            newState = executeGridAttack(state, action, grid);
            break;
        case 'grid_defend':
            newState = executeGridDefend(state, action);
            break;
        case 'grid_flee':
            newState = executeGridFlee(state, action as GridFleeAction);
            break;
        case 'grid_use_item':
            newState = executeGridUseItem(state, action as GridUseItemAction);
            break;
        case 'grid_aoe_attack':
            newState = executeGridAoEAttack(state, action as GridAoEAttackAction, grid);
            break;
        case 'grid_end_turn':
            newState = executeEndTurn(state);
            break;
        default:
            newState = state;
    }

    // Extract and clear pending events
    const events = [...newState.pendingEvents];
    newState = { ...newState, pendingEvents: [] };

    return { state: newState, events };
}

// =============================================================================
// Action Execution
// =============================================================================

/**
 * Execute grid movement along a path.
 * Cost: 1 AP per tile (2 for difficult terrain)
 */
function executeGridMove(
    state: GridCombatState,
    action: GridMoveAction,
    grid: CombatGrid
): GridCombatState {
    const actor = state.combatants[action.actorId];
    if (!actor || actor.isKnockedOut) return state;

    const { path } = action;
    if (path.length < 2) return state;

    const start = path[0];
    if (start.x !== actor.position.x || start.y !== actor.position.y) {
        return state;
    }

    let totalCost = 0;
    for (let i = 1; i < path.length; i++) {
        const tile = grid.tiles[path[i].y]?.[path[i].x];
        const tileCost = tile?.terrainType === 'difficult' ? 2 : 1;
        totalCost += tileCost;
    }

    if (totalCost > actor.apRemaining) return state;

    const destination = path[path.length - 1];
    const updatedActor: GridCombatant = {
        ...actor,
        position: destination,
        apRemaining: actor.apRemaining - totalCost,
        facing: getFacing(path[path.length - 2], destination),
    };

    const logEntry: CombatLogEntry = {
        id: generateUUID(),
        turn: state.turn,
        actorId: actor.id,
        actorName: actor.name,
        actionType: 'move',
        result: {},
        mechanicalText: `${actor.name} moves ${path.length - 1} tiles.`,
    };

    const moveEvent: CombatEvent = {
        type: 'move_completed',
        turn: state.turn,
        actorId: actor.id,
        data: { actorName: actor.name, path, apSpent: totalCost },
    };

    let newState: GridCombatState = {
        ...state,
        combatants: { ...state.combatants, [actor.id]: updatedActor },
        log: [...state.log, logEntry],
        pendingEvents: [...state.pendingEvents, moveEvent],
    };

    if (updatedActor.apRemaining === 0) {
        newState = advanceToNextTurn(newState);
    }

    return newState;
}

/**
 * Execute grid attack on target.
 * AP cost and behavior depend on equipped weapon subtype:
 * - Heavy melee/ranged: 2 AP, ends turn, cleave on kill (melee)
 * - Light melee/ranged: 1 AP, does NOT end turn (max 2/turn)
 * - Gun: 2 AP, ends turn, 50% armor penetration
 * - Magic direct: 2 AP, ends turn, no LOS required
 */
function executeGridAttack(
    state: GridCombatState,
    action: GridAttackAction,
    grid: CombatGrid
): GridCombatState {
    const actor = state.combatants[action.actorId];
    const target = state.combatants[action.targetId];

    if (!actor || !target || actor.isKnockedOut || target.isKnockedOut) {
        return state;
    }

    const weapon = actor.equippedWeapon;
    const weaponSubtype = actor.weaponSubtype;
    const isLight = isLightWeapon(weaponSubtype);
    const apCost = getWeaponAPCost(weapon);

    // AP check
    if (actor.apRemaining < apCost) return state;

    // Light weapon attack cap
    if (isLight && actor.lightAttacksThisTurn >= MAX_LIGHT_ATTACKS_PER_TURN) return state;

    // Reload check for light ranged (crossbow): every other shot costs 2 AP
    let effectiveAPCost = apCost;
    if (weaponSubtype === 'light_ranged' && weapon?.weaponProperties?.reload && actor.needsReload) {
        effectiveAPCost = 2;
        if (actor.apRemaining < effectiveAPCost) return state;
    }

    // Validate range
    const distance = calculateDistance(actor.position, target.position);
    if (distance > actor.attackRange) return state;

    // LOS check (magic direct doesn't need it, melee doesn't need it)
    const needsLOS = weaponRequiresLOS(weapon);
    if (needsLOS && !hasLineOfSight(actor.position, target.position, grid)) {
        return state;
    }

    // Roll to hit
    const attackRoll = rollD20();
    const attackBonus = Math.floor(actor.level / 2);
    const buffAttackBonus = actor.activeBuffs.attackBonus;

    // Flanking bonus
    const allies = Object.values(state.combatants).filter(
        c => c.isPlayerControlled === actor.isPlayerControlled && !c.isKnockedOut
    );
    const combatEntities: CombatEntity[] = allies.map(c => ({
        id: c.id, position: c.position,
        allegiance: c.isPlayerControlled ? 'player' as const : 'enemy' as const,
        isKnockedOut: c.isKnockedOut,
    }));
    const targetEntity: CombatEntity = {
        id: target.id, position: target.position,
        allegiance: target.isPlayerControlled ? 'player' : 'enemy',
        isKnockedOut: target.isKnockedOut,
    };
    const actorEntity: CombatEntity = {
        id: actor.id, position: actor.position,
        allegiance: actor.isPlayerControlled ? 'player' : 'enemy',
        isKnockedOut: actor.isKnockedOut,
    };

    const flankingBonus = checkFlanking(actorEntity, targetEntity, combatEntities) ? 2 : 0;

    const totalAttack = attackRoll + attackBonus + flankingBonus + buffAttackBonus;
    const targetDefenseBuffBonus = target.activeBuffs.defenseBonus;
    const targetDefense = target.defense + (target.isDefending ? 3 : 0) + targetDefenseBuffBonus;
    const hit = totalAttack >= targetDefense;

    // Calculate damage
    let rawDamage = 0;
    let finalDamage = 0;
    let hitQuality: HitQuality = 'miss';

    if (hit) {
        const variance = rollDamageVariance();
        const weaponBonusDmg = weapon?.stats?.damage ?? 0;
        const buffDmgBonus = actor.activeBuffs.damageBonus;
        const baseDamage = Math.max(1, actor.damage + buffDmgBonus + weaponBonusDmg + variance);

        // Armor penetration (gun: 50%)
        const armorPenPercent = weapon?.weaponProperties?.armorPenPercent ?? 0;
        const effectiveArmor = Math.floor(target.armor * (1 - armorPenPercent));

        rawDamage = baseDamage;
        finalDamage = Math.max(1, baseDamage - effectiveArmor);
        hitQuality = calculateHitQuality(totalAttack, targetDefense, rawDamage, finalDamage);
    }

    // Apply damage
    const newTargetHp = Math.max(0, target.currentHp - finalDamage);
    const isKillingBlow = hit && newTargetHp === 0;

    let deathOutcome: 'incapacitated' | 'dead' | null = null;
    if (isKillingBlow) {
        deathOutcome = target.isPlayerControlled ? 'incapacitated' : rollDeathOrIncapacitation();
    }

    const endsTurn = doesWeaponEndTurn(weapon);

    const updatedActor: GridCombatant = {
        ...actor,
        apRemaining: endsTurn ? 0 : actor.apRemaining - effectiveAPCost,
        facing: getFacing(actor.position, target.position),
        lightAttacksThisTurn: isLight ? actor.lightAttacksThisTurn + 1 : actor.lightAttacksThisTurn,
        needsReload: weaponSubtype === 'light_ranged' && weapon?.weaponProperties?.reload
            ? !actor.needsReload  // Toggle reload state
            : actor.needsReload,
    };

    const updatedTarget: GridCombatant = {
        ...target,
        currentHp: newTargetHp,
        isKnockedOut: newTargetHp === 0,
        isIncapacitated: deathOutcome === 'incapacitated',
        isDead: deathOutcome === 'dead',
        recentDamage: hit ? finalDamage : null,
    };

    // Determine attack verb based on weapon
    const attackVerb = getAttackVerb(weaponSubtype);

    const mechanicalText = hit
        ? `${actor.name} ${attackVerb} ${target.name} for ${finalDamage} damage!`
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
            hit, damage: finalDamage, hitQuality,
            special: isKillingBlow ? 'killing_blow' : undefined,
        },
        mechanicalText,
    };

    const events: CombatEvent[] = [{
        type: 'attack_resolved',
        turn: state.turn,
        actorId: actor.id,
        targetId: target.id,
        data: {
            attackRoll: totalAttack, targetDefense, rawDamage, finalDamage,
            hitQuality, isKillingBlow, flanking: flankingBonus > 0,
            actorName: actor.name, targetName: target.name,
            weaponSubtype,
        },
    }];

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
                deathOutcome,
            },
        });
    }

    let newState: GridCombatState = {
        ...state,
        combatants: {
            ...state.combatants,
            [actor.id]: updatedActor,
            [target.id]: updatedTarget,
        },
        log: [...state.log, logEntry],
        pendingEvents: [...state.pendingEvents, ...events],
    };

    // Cleave: on kill with heavy melee, free attack on 1 adjacent enemy
    if (isKillingBlow && weapon?.weaponProperties?.cleave) {
        newState = executeCleave(newState, updatedActor, target.position, grid);
    }

    // Check victory/defeat
    const endResult = checkCombatEnd(newState);
    if (endResult) return endResult;

    // End turn or continue (light weapons don't end turn)
    if (endsTurn || updatedActor.apRemaining <= 0) {
        return advanceToNextTurn(newState);
    }

    return newState;
}

/**
 * Execute cleave: free attack on 1 adjacent enemy after a kill (heavy melee).
 * Max 1 cleave per attack.
 */
function executeCleave(
    state: GridCombatState,
    actor: GridCombatant,
    killPosition: TilePosition,
    _grid: CombatGrid
): GridCombatState {
    const adjacentEnemyIds = getAdjacentEnemies(
        killPosition, state.combatants, actor.id, actor.isPlayerControlled
    );

    if (adjacentEnemyIds.length === 0) return state;

    // Pick first adjacent enemy (could prioritize lowest HP in future)
    const cleaveTargetId = adjacentEnemyIds[0];
    const cleaveTarget = state.combatants[cleaveTargetId];
    if (!cleaveTarget || cleaveTarget.isKnockedOut) return state;

    // Simplified cleave attack: same stats, no flanking recalc
    const attackRoll = rollD20();
    const totalAttack = attackRoll + Math.floor(actor.level / 2) + actor.activeBuffs.attackBonus;
    const targetDefense = cleaveTarget.defense + (cleaveTarget.isDefending ? 3 : 0) + cleaveTarget.activeBuffs.defenseBonus;
    const hit = totalAttack >= targetDefense;

    let finalDamage = 0;
    let hitQuality: HitQuality = 'miss';

    if (hit) {
        const variance = rollDamageVariance();
        const weaponBonusDmg = actor.equippedWeapon?.stats?.damage ?? 0;
        const baseDamage = Math.max(1, actor.damage + actor.activeBuffs.damageBonus + weaponBonusDmg + variance);
        finalDamage = Math.max(1, baseDamage - cleaveTarget.armor);
        hitQuality = calculateHitQuality(totalAttack, targetDefense, baseDamage, finalDamage);
    }

    const newTargetHp = Math.max(0, cleaveTarget.currentHp - finalDamage);
    const isKillingBlow = hit && newTargetHp === 0;
    let deathOutcome: 'incapacitated' | 'dead' | null = null;
    if (isKillingBlow) {
        deathOutcome = cleaveTarget.isPlayerControlled ? 'incapacitated' : rollDeathOrIncapacitation();
    }

    const updatedTarget: GridCombatant = {
        ...cleaveTarget,
        currentHp: newTargetHp,
        isKnockedOut: newTargetHp === 0,
        isIncapacitated: deathOutcome === 'incapacitated',
        isDead: deathOutcome === 'dead',
        recentDamage: hit ? finalDamage : null,
    };

    const cleaveMechanical = hit
        ? `${actor.name} cleaves into ${cleaveTarget.name} for ${finalDamage} damage!`
        : `${actor.name}'s cleave misses ${cleaveTarget.name}!`;

    const logEntry: CombatLogEntry = {
        id: generateUUID(),
        turn: state.turn,
        actorId: actor.id,
        actorName: actor.name,
        actionType: 'attack',
        targetId: cleaveTarget.id,
        targetName: cleaveTarget.name,
        result: { hit, damage: finalDamage, hitQuality, special: isKillingBlow ? 'killing_blow' : undefined },
        mechanicalText: cleaveMechanical,
    };

    const cleaveEvent: CombatEvent = {
        type: 'cleave_triggered' as CombatEventType,
        turn: state.turn,
        actorId: actor.id,
        targetId: cleaveTarget.id,
        data: { actorName: actor.name, targetName: cleaveTarget.name, damage: finalDamage, hit },
    };

    return {
        ...state,
        combatants: { ...state.combatants, [cleaveTarget.id]: updatedTarget },
        log: [...state.log, logEntry],
        pendingEvents: [...state.pendingEvents, cleaveEvent],
    };
}

/**
 * Execute AoE attack (bomb or magic AoE weapon).
 * Cost: 3 AP, ends turn.
 * Bomb: 3x3 blast, friendly fire (allies take 50% damage).
 * Magic AoE: Cross pattern, no friendly fire.
 */
function executeGridAoEAttack(
    state: GridCombatState,
    action: GridAoEAttackAction,
    grid: CombatGrid
): GridCombatState {
    const actor = state.combatants[action.actorId];
    if (!actor || actor.isKnockedOut) return state;

    // Determine AoE source: bomb item or AoE weapon
    let aoeItem: InventoryItem | undefined;
    let blastPattern: 'radius_3x3' | 'cross' = 'radius_3x3';
    let aoeDamage = 0;
    let friendlyFire = false;
    let friendlyFireMultiplier = 0.5;
    let apCost: number = GRID_AP_COSTS.aoeAttack;

    if (action.itemId) {
        // Bomb consumable
        aoeItem = actor.combatItems.find(i => i.id === action.itemId);
        if (!aoeItem) return state;
        blastPattern = aoeItem.weaponProperties?.blastPattern ?? 'radius_3x3';
        aoeDamage = aoeItem.stats?.aoeDamage ?? 8;
        friendlyFire = aoeItem.weaponProperties?.friendlyFire ?? true;
        friendlyFireMultiplier = aoeItem.weaponProperties?.friendlyFireMultiplier ?? 0.5;
        apCost = aoeItem.apCost ?? GRID_AP_COSTS.aoeAttack;
    } else if (actor.equippedWeapon && isAoEWeapon(actor.weaponSubtype)) {
        // AoE weapon
        blastPattern = actor.equippedWeapon.weaponProperties?.blastPattern ?? 'cross';
        aoeDamage = actor.damage + (actor.equippedWeapon.stats?.damage ?? 0) + actor.activeBuffs.damageBonus;
        friendlyFire = actor.equippedWeapon.weaponProperties?.friendlyFire ?? false;
        friendlyFireMultiplier = actor.equippedWeapon.weaponProperties?.friendlyFireMultiplier ?? 0.5;
        apCost = getWeaponAPCost(actor.equippedWeapon);
    } else {
        return state; // No AoE capability
    }

    if (actor.apRemaining < apCost) return state;

    // Range check
    const distance = calculateDistance(actor.position, action.targetPosition);
    const maxRange = aoeItem?.attackRange ?? actor.equippedWeapon?.attackRange ?? 5;
    if (distance > maxRange) return state;

    // LOS check for bombs (magic AoE doesn't need LOS)
    if (aoeItem && !hasLineOfSight(actor.position, action.targetPosition, grid)) {
        return state;
    }

    // Get affected tiles
    const affectedTiles = getBlastPattern(action.targetPosition, blastPattern, grid);

    // Get combatants on affected tiles
    const affectedIds = getCombatantsOnTiles(affectedTiles, state.combatants);

    // Resolve hits on each affected combatant
    const updatedCombatants = { ...state.combatants };
    const events: CombatEvent[] = [];
    const logEntries: CombatLogEntry[] = [];
    let totalHits = 0;

    for (const targetId of affectedIds) {
        if (targetId === actor.id) continue; // Don't hit self

        const aoeTarget = updatedCombatants[targetId];
        if (!aoeTarget || aoeTarget.isKnockedOut) continue;

        // Friendly fire check
        const isAlly = aoeTarget.isPlayerControlled === actor.isPlayerControlled;
        if (isAlly && !friendlyFire) continue;

        // Individual hit roll
        const attackRoll = rollD20();
        const totalAttack = attackRoll + Math.floor(actor.level / 2) + actor.activeBuffs.attackBonus;
        const targetDefense = aoeTarget.defense + (aoeTarget.isDefending ? 3 : 0) + aoeTarget.activeBuffs.defenseBonus;
        const hit = totalAttack >= targetDefense;

        let finalDamage = 0;
        if (hit) {
            // AoE: no variance (consistent damage)
            finalDamage = Math.max(1, aoeDamage - aoeTarget.armor);
            if (isAlly) {
                finalDamage = Math.max(1, Math.floor(finalDamage * friendlyFireMultiplier));
            }
            totalHits++;
        }

        const newHp = Math.max(0, aoeTarget.currentHp - finalDamage);
        const isKillingBlow = hit && newHp === 0;
        let deathOutcome: 'incapacitated' | 'dead' | null = null;
        if (isKillingBlow) {
            deathOutcome = aoeTarget.isPlayerControlled ? 'incapacitated' : rollDeathOrIncapacitation();
        }

        updatedCombatants[targetId] = {
            ...aoeTarget,
            currentHp: newHp,
            isKnockedOut: newHp === 0,
            isIncapacitated: deathOutcome === 'incapacitated',
            isDead: deathOutcome === 'dead',
            recentDamage: hit ? finalDamage : null,
        };

        if (hit) {
            logEntries.push({
                id: generateUUID(),
                turn: state.turn,
                actorId: actor.id,
                actorName: actor.name,
                actionType: 'attack',
                targetId: aoeTarget.id,
                targetName: aoeTarget.name,
                result: { hit: true, damage: finalDamage, special: isKillingBlow ? 'killing_blow' : undefined },
                mechanicalText: `${aoeTarget.name} takes ${finalDamage} ${blastPattern === 'radius_3x3' ? 'blast' : 'magic'} damage!`,
            });
        }

        if (isKillingBlow) {
            events.push({
                type: 'character_defeated',
                turn: state.turn,
                actorId: actor.id,
                targetId: aoeTarget.id,
                data: { defeatedName: aoeTarget.name, defeatedIsEnemy: !aoeTarget.isPlayerControlled, killerName: actor.name, deathOutcome },
            });
        }
    }

    // Consume bomb if applicable
    let updatedCombatItems = actor.combatItems;
    if (aoeItem) {
        updatedCombatItems = actor.combatItems.map(item => {
            if (item.id !== aoeItem!.id) return item;
            const newCount = (item.stackCount ?? 1) - 1;
            return newCount > 0 ? { ...item, stackCount: newCount } : item;
        }).filter(item => (item.stackCount ?? 1) > 0);
    }

    const updatedActor: GridCombatant = {
        ...actor,
        apRemaining: 0, // AoE always ends turn
        combatItems: updatedCombatItems,
    };
    updatedCombatants[actor.id] = updatedActor;

    const aoeLogEntry: CombatLogEntry = {
        id: generateUUID(),
        turn: state.turn,
        actorId: actor.id,
        actorName: actor.name,
        actionType: 'attack',
        result: {},
        mechanicalText: `${actor.name} unleashes ${blastPattern === 'radius_3x3' ? 'a 3x3 blast' : 'a cross-pattern attack'}! ${totalHits} targets hit.`,
    };

    events.unshift({
        type: 'aoe_resolved' as CombatEventType,
        turn: state.turn,
        actorId: actor.id,
        data: {
            actorName: actor.name,
            targetPosition: action.targetPosition,
            blastPattern,
            affectedTiles,
            totalHits,
            isBomb: !!aoeItem,
        },
    });

    let newState: GridCombatState = {
        ...state,
        combatants: updatedCombatants,
        log: [...state.log, aoeLogEntry, ...logEntries],
        pendingEvents: [...state.pendingEvents, ...events],
    };

    const endResult = checkCombatEnd(newState);
    if (endResult) return endResult;

    return advanceToNextTurn(newState);
}

/**
 * Execute item usage in combat.
 * Cost: 2 AP, does NOT end turn.
 * Meds: Heal self or adjacent ally.
 * Buffs: Apply temporary stat boost.
 */
function executeGridUseItem(
    state: GridCombatState,
    action: GridUseItemAction
): GridCombatState {
    const actor = state.combatants[action.actorId];
    if (!actor || actor.isKnockedOut) return state;

    if (actor.apRemaining < GRID_AP_COSTS.useItem) return state;

    // Find item
    const item = actor.combatItems.find(i => i.id === action.itemId);
    if (!item) return state;
    if (item.type !== 'consumable') return state;
    if (!item.stackCount || item.stackCount <= 0) return state;

    // Validate target (self or adjacent ally, defaults to self)
    const targetId = action.targetId ?? action.actorId;
    const target = state.combatants[targetId];
    if (!target || target.isKnockedOut) return state;
    if (target.isPlayerControlled !== actor.isPlayerControlled) return state; // Must target same side
    if (target.id !== actor.id && !areAdjacent(actor.position, target.position)) return state;

    const events: CombatEvent[] = [];
    let updatedTarget = { ...target };
    let mechanicalText = '';

    if (item.consumableSubtype === 'med') {
        // Healing
        const healPercent = item.stats?.healPercent ?? 0.25;
        const healMin = item.stats?.healMin ?? 0;
        const healAmount = Math.max(healMin, Math.floor(target.maxHp * healPercent));
        const actualHeal = Math.min(healAmount, target.maxHp - target.currentHp);

        updatedTarget = {
            ...updatedTarget,
            currentHp: Math.min(target.maxHp, target.currentHp + actualHeal),
            recentHeal: actualHeal,
        };

        mechanicalText = target.id === actor.id
            ? `${actor.name} uses ${item.name}, restoring ${actualHeal} HP!`
            : `${actor.name} uses ${item.name} on ${target.name}, restoring ${actualHeal} HP!`;

        events.push({
            type: 'item_used' as CombatEventType,
            turn: state.turn,
            actorId: actor.id,
            targetId: target.id,
            data: { itemName: item.name, itemSubtype: 'med', healAmount: actualHeal, targetName: target.name },
        });
    } else if (item.consumableSubtype === 'buff') {
        // Apply buff
        updatedTarget = {
            ...updatedTarget,
            activeBuffs: applyBuff(target.activeBuffs, item),
        };

        const buffDesc = [];
        if (item.stats?.attackBonus) buffDesc.push(`+${item.stats.attackBonus} attack`);
        if (item.stats?.damageBonus) buffDesc.push(`+${item.stats.damageBonus} damage`);
        if (item.stats?.defenseBonus) buffDesc.push(`+${item.stats.defenseBonus} defense`);

        mechanicalText = target.id === actor.id
            ? `${actor.name} uses ${item.name} (${buffDesc.join(', ')} for ${item.stats?.buffDuration ?? 3} turns)!`
            : `${actor.name} uses ${item.name} on ${target.name} (${buffDesc.join(', ')} for ${item.stats?.buffDuration ?? 3} turns)!`;

        events.push({
            type: 'buff_applied' as CombatEventType,
            turn: state.turn,
            actorId: actor.id,
            targetId: target.id,
            data: { itemName: item.name, buffs: item.stats, targetName: target.name },
        });
    } else {
        return state; // Unsupported consumable subtype in combat
    }

    // Consume item (decrease stack)
    const updatedCombatItems = actor.combatItems.map(i => {
        if (i.id !== item.id) return i;
        const newCount = (i.stackCount ?? 1) - 1;
        return newCount > 0 ? { ...i, stackCount: newCount } : i;
    }).filter(i => (i.stackCount ?? 1) > 0);

    const updatedActor: GridCombatant = {
        ...actor,
        apRemaining: actor.apRemaining - GRID_AP_COSTS.useItem,
        combatItems: updatedCombatItems,
    };

    // If actor used item on self, merge both updates
    const combatants = { ...state.combatants };
    if (actor.id === target.id) {
        combatants[actor.id] = {
            ...updatedActor,
            currentHp: updatedTarget.currentHp,
            recentHeal: updatedTarget.recentHeal,
            activeBuffs: updatedTarget.activeBuffs,
        };
    } else {
        combatants[actor.id] = updatedActor;
        combatants[target.id] = updatedTarget;
    }

    const logEntry: CombatLogEntry = {
        id: generateUUID(),
        turn: state.turn,
        actorId: actor.id,
        actorName: actor.name,
        actionType: 'item',
        targetId: target.id,
        targetName: target.name,
        result: {},
        mechanicalText,
    };

    let newState: GridCombatState = {
        ...state,
        combatants,
        log: [...state.log, logEntry],
        pendingEvents: [...state.pendingEvents, ...events],
    };

    // Item usage does NOT end turn, but check if AP exhausted
    const finalActor = newState.combatants[actor.id];
    if (finalActor.apRemaining <= 0) {
        newState = advanceToNextTurn(newState);
    }

    return newState;
}

/**
 * Execute defend action.
 * Cost: 1 AP, grants +3 defense until next turn. Always ends turn.
 */
function executeGridDefend(
    state: GridCombatState,
    action: GridDefendAction
): GridCombatState {
    const actor = state.combatants[action.actorId];
    if (!actor || actor.isKnockedOut) return state;

    if (actor.apRemaining < GRID_AP_COSTS.defend) return state;

    const updatedActor: GridCombatant = {
        ...actor,
        apRemaining: 0, // Defend always ends turn
        isDefending: true,
    };

    const logEntry: CombatLogEntry = {
        id: generateUUID(),
        turn: state.turn,
        actorId: actor.id,
        actorName: actor.name,
        actionType: 'defend',
        result: {},
        mechanicalText: `${actor.name} takes a defensive stance (+3 defense).`,
    };

    const event: CombatEvent = {
        type: 'defend_activated',
        turn: state.turn,
        actorId: actor.id,
        data: { actorName: actor.name },
    };

    let newState: GridCombatState = {
        ...state,
        combatants: { ...state.combatants, [actor.id]: updatedActor },
        log: [...state.log, logEntry],
        pendingEvents: [...state.pendingEvents, event],
    };

    return advanceToNextTurn(newState);
}

/**
 * Attempt to flee from combat.
 * Roll: d20 + floor(speed / 5) >= 12 for success
 */
function executeGridFlee(
    state: GridCombatState,
    action: GridFleeAction
): GridCombatState {
    const actor = state.combatants[action.actorId];
    if (!actor || actor.isKnockedOut) return state;
    if (!actor.isPlayer) return state;

    const fleeRoll = rollD20();
    const speedBonus = Math.floor(actor.speed / 5);
    const totalRoll = fleeRoll + speedBonus;
    const success = totalRoll >= 12;

    if (success) {
        const logEntry: CombatLogEntry = {
            id: generateUUID(),
            turn: state.turn,
            actorId: actor.id,
            actorName: actor.name,
            actionType: 'flee',
            result: { special: 'fled' },
            mechanicalText: `${actor.name} successfully flees from combat! (rolled ${fleeRoll} + ${speedBonus} = ${totalRoll} vs DC 12)`,
        };

        const fleeEvent: CombatEvent = {
            type: 'flee_attempted',
            turn: state.turn,
            actorId: actor.id,
            data: { actorName: actor.name, success: true, roll: fleeRoll, speedBonus, total: totalRoll },
        };

        const survivingAllies = Object.values(state.combatants)
            .filter(c => c.isPlayerControlled && !c.isKnockedOut)
            .map(c => c.id);

        return {
            ...state,
            phase: 'victory',
            log: [...state.log, logEntry],
            pendingEvents: [...state.pendingEvents, fleeEvent],
            result: { outcome: 'fled', survivingAllies, defeatedEnemies: [] },
        };
    } else {
        const logEntry: CombatLogEntry = {
            id: generateUUID(),
            turn: state.turn,
            actorId: actor.id,
            actorName: actor.name,
            actionType: 'flee',
            result: { special: 'fled_failed' },
            mechanicalText: `${actor.name} fails to flee! (rolled ${fleeRoll} + ${speedBonus} = ${totalRoll} vs DC 12)`,
        };

        const fleeEvent: CombatEvent = {
            type: 'flee_attempted',
            turn: state.turn,
            actorId: actor.id,
            data: { actorName: actor.name, success: false, roll: fleeRoll, speedBonus, total: totalRoll },
        };

        const updatedActor: GridCombatant = { ...actor, apRemaining: 0 };

        let newState: GridCombatState = {
            ...state,
            combatants: { ...state.combatants, [actor.id]: updatedActor },
            log: [...state.log, logEntry],
            pendingEvents: [...state.pendingEvents, fleeEvent],
        };

        return advanceToNextTurn(newState);
    }
}

/**
 * End turn early (pass remaining AP).
 */
function executeEndTurn(state: GridCombatState): GridCombatState {
    return advanceToNextTurn(state);
}

// =============================================================================
// Turn Management
// =============================================================================

/**
 * Advance to the next combatant's turn.
 * Handles: AP reset, buff tick, light attack counter reset, defend clear.
 */
function advanceToNextTurn(state: GridCombatState): GridCombatState {
    let nextIndex = state.currentTurnIndex + 1;
    let nextTurn = state.turn;

    if (nextIndex >= state.initiativeOrder.length) {
        nextIndex = 0;
        nextTurn = state.turn + 1;
    }

    let attempts = 0;
    while (attempts < state.initiativeOrder.length) {
        const nextId = state.initiativeOrder[nextIndex];
        const nextCombatant = state.combatants[nextId];

        if (nextCombatant && !nextCombatant.isKnockedOut) break;

        nextIndex = (nextIndex + 1) % state.initiativeOrder.length;
        if (nextIndex === 0) nextTurn++;
        attempts++;
    }

    const nextId = state.initiativeOrder[nextIndex];
    const nextCombatant = state.combatants[nextId];

    if (!nextCombatant) return state;

    // Tick buffs (decrement durations, clear expired)
    const tickedBuffs = tickBuffs(nextCombatant.activeBuffs);
    const buffExpiredEvents: CombatEvent[] = [];

    // Check if any buffs just expired
    if (nextCombatant.activeBuffs.attackBonus > 0 && tickedBuffs.attackBonus === 0) {
        buffExpiredEvents.push({
            type: 'buff_expired' as CombatEventType,
            turn: nextTurn,
            actorId: nextId,
            data: { actorName: nextCombatant.name, buffType: 'attack' },
        });
    }
    if (nextCombatant.activeBuffs.damageBonus > 0 && tickedBuffs.damageBonus === 0) {
        buffExpiredEvents.push({
            type: 'buff_expired' as CombatEventType,
            turn: nextTurn,
            actorId: nextId,
            data: { actorName: nextCombatant.name, buffType: 'damage' },
        });
    }
    if (nextCombatant.activeBuffs.defenseBonus > 0 && tickedBuffs.defenseBonus === 0) {
        buffExpiredEvents.push({
            type: 'buff_expired' as CombatEventType,
            turn: nextTurn,
            actorId: nextId,
            data: { actorName: nextCombatant.name, buffType: 'defense' },
        });
    }

    const updatedCombatant: GridCombatant = {
        ...nextCombatant,
        apRemaining: getAPForLevel(nextCombatant.level),
        isDefending: false,
        recentDamage: null,
        recentHeal: null,
        lightAttacksThisTurn: 0,
        activeBuffs: tickedBuffs,
    };

    const turnEvent: CombatEvent = {
        type: 'turn_start',
        turn: nextTurn,
        actorId: nextId,
        data: {
            actorName: nextCombatant.name,
            isPlayerControlled: nextCombatant.isPlayerControlled,
        },
    };

    return {
        ...state,
        turn: nextTurn,
        currentTurnIndex: nextIndex,
        phase: nextCombatant.isPlayerControlled ? 'awaiting_input' : 'resolving',
        combatants: { ...state.combatants, [nextId]: updatedCombatant },
        pendingEvents: [...state.pendingEvents, ...buffExpiredEvents, turnEvent],
    };
}

/**
 * Check for victory or defeat.
 * On victory, automatically revives incapacitated allies at 25% HP.
 */
function checkCombatEnd(state: GridCombatState): GridCombatState | null {
    const playerSideAlive = Object.values(state.combatants).some(
        c => c.isPlayerControlled && !c.isKnockedOut
    );
    const enemySideAlive = Object.values(state.combatants).some(
        c => !c.isPlayerControlled && !c.isKnockedOut
    );

    if (!enemySideAlive) {
        const enemies = Object.values(state.combatants).filter(c => !c.isPlayerControlled);

        const xpReward = enemies.reduce((sum, e) => {
            return sum + (e.isDead ? e.level * 10 : e.level * 5);
        }, 0);

        const goldReward = enemies.reduce((sum, e) => sum + e.level * 5, 0);

        const incapacitatedPlayerSide = Object.values(state.combatants).filter(
            c => c.isPlayerControlled && c.isKnockedOut && c.isIncapacitated
        );

        const incapacitatedPlayer = incapacitatedPlayerSide.find(c => c.isPlayer);
        const incapacitatedAllies = incapacitatedPlayerSide.filter(c => !c.isPlayer);

        const carryingAlly = Object.values(state.combatants).find(
            c => c.isPlayerControlled && !c.isPlayer && !c.isKnockedOut
        );

        const revivedCombatants = { ...state.combatants };
        const revivedAllyIds: string[] = [];
        const revivalEvents: CombatEvent[] = [];
        let revivedPlayer = false;
        let revivedByAllyId: string | undefined = undefined;

        if (incapacitatedPlayer) {
            const revivedHp = Math.max(1, Math.floor(incapacitatedPlayer.maxHp * 0.25));
            revivedCombatants[incapacitatedPlayer.id] = {
                ...incapacitatedPlayer,
                currentHp: revivedHp,
                isKnockedOut: false,
                isIncapacitated: false,
            };
            revivedPlayer = true;
            revivedByAllyId = carryingAlly?.id;

            revivalEvents.push({
                type: 'player_revived' as CombatEventType,
                turn: state.turn,
                actorId: carryingAlly?.id,
                targetId: incapacitatedPlayer.id,
                data: {
                    playerName: incapacitatedPlayer.name,
                    revivedByAllyName: carryingAlly?.name,
                    revivedHp,
                    maxHp: incapacitatedPlayer.maxHp,
                },
            });
        }

        for (const ally of incapacitatedAllies) {
            const revivedHp = Math.max(1, Math.floor(ally.maxHp * 0.25));
            revivedCombatants[ally.id] = {
                ...ally,
                currentHp: revivedHp,
                isKnockedOut: false,
                isIncapacitated: false,
            };
            revivedAllyIds.push(ally.id);

            revivalEvents.push({
                type: 'ally_revived' as CombatEventType,
                turn: state.turn,
                actorId: ally.id,
                data: { allyName: ally.name, revivedHp, maxHp: ally.maxHp },
            });
        }

        const survivingAllies = Object.values(revivedCombatants)
            .filter(c => c.isPlayerControlled && !c.isKnockedOut)
            .map(c => c.id);

        return {
            ...state,
            combatants: revivedCombatants,
            phase: 'victory',
            result: {
                outcome: 'victory',
                rewards: { xp: xpReward, gold: goldReward, items: [] },
                survivingAllies,
                defeatedEnemies: enemies.map(e => e.id),
                revivedAllies: revivedAllyIds,
                revivedPlayer,
                revivedByAllyId,
            },
            pendingEvents: [
                ...state.pendingEvents,
                ...revivalEvents,
                {
                    type: 'combat_victory',
                    turn: state.turn,
                    data: { turnsTotal: state.turn, xpReward, revivedAllies: revivedAllyIds, revivedPlayer, revivedByAllyId },
                },
            ],
        };
    }

    if (!playerSideAlive) {
        return {
            ...state,
            phase: 'defeat',
            result: {
                outcome: 'defeat',
                survivingAllies: [],
                defeatedEnemies: Object.values(state.combatants)
                    .filter(c => !c.isPlayerControlled && c.isKnockedOut)
                    .map(c => c.id),
            },
            pendingEvents: [
                ...state.pendingEvents,
                { type: 'combat_defeat', turn: state.turn, data: { turnsTotal: state.turn } },
            ],
        };
    }

    return null;
}

// =============================================================================
// Helpers
// =============================================================================

function getFacing(from: TilePosition, to: TilePosition): 'north' | 'south' | 'east' | 'west' {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west';
    return dy > 0 ? 'south' : 'north';
}

function getAttackVerb(subtype: import('../../types/inventory').WeaponSubtype | undefined): string {
    switch (subtype) {
        case 'heavy_melee': return 'cleaves';
        case 'light_melee': return 'slashes';
        case 'heavy_ranged': return 'shoots';
        case 'light_ranged': return 'fires at';
        case 'gun': return 'shoots';
        case 'magic_direct': return 'blasts';
        case 'magic_aoe': return 'unleashes magic on';
        default: return 'strikes';
    }
}

// =============================================================================
// Query Helpers
// =============================================================================

export function getCurrentCombatant(state: GridCombatState): GridCombatant | null {
    const id = state.initiativeOrder[state.currentTurnIndex];
    return state.combatants[id] ?? null;
}

/**
 * Check if an action is valid for the current combatant.
 */
export function canPerformAction(
    state: GridCombatState,
    actionType: GridCombatAction['type']
): boolean {
    const actor = getCurrentCombatant(state);
    if (!actor || actor.isKnockedOut) return false;

    switch (actionType) {
        case 'grid_move':
            return actor.apRemaining >= 1;
        case 'grid_attack': {
            const apCost = getWeaponAPCost(actor.equippedWeapon);
            const isLight = isLightWeapon(actor.weaponSubtype);
            if (isLight && actor.lightAttacksThisTurn >= MAX_LIGHT_ATTACKS_PER_TURN) return false;
            // Reload cost for light ranged
            if (actor.weaponSubtype === 'light_ranged' && actor.equippedWeapon?.weaponProperties?.reload && actor.needsReload) {
                return actor.apRemaining >= 2;
            }
            return actor.apRemaining >= apCost;
        }
        case 'grid_defend':
            return actor.apRemaining >= GRID_AP_COSTS.defend && !actor.isDefending;
        case 'grid_use_item':
            return actor.apRemaining >= GRID_AP_COSTS.useItem && actor.combatItems.length > 0;
        case 'grid_aoe_attack': {
            const aoeApCost = GRID_AP_COSTS.aoeAttack;
            const hasAoEWeapon = isAoEWeapon(actor.weaponSubtype);
            const hasBombs = actor.combatItems.some(i => i.consumableSubtype === 'bomb' && (i.stackCount ?? 0) > 0);
            return actor.apRemaining >= aoeApCost && (hasAoEWeapon || hasBombs);
        }
        case 'grid_flee':
            return actor.isPlayer;
        case 'grid_end_turn':
            return true;
        default:
            return false;
    }
}

export function getEnemies(state: GridCombatState, combatantId: string): GridCombatant[] {
    const combatant = state.combatants[combatantId];
    if (!combatant) return [];
    return Object.values(state.combatants).filter(
        c => c.isPlayerControlled !== combatant.isPlayerControlled && !c.isKnockedOut
    );
}

export function getAllies(state: GridCombatState, combatantId: string): GridCombatant[] {
    const combatant = state.combatants[combatantId];
    if (!combatant) return [];
    return Object.values(state.combatants).filter(
        c => c.isPlayerControlled === combatant.isPlayerControlled && !c.isKnockedOut
    );
}
