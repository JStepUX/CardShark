/**
 * @file combatResultContext.ts
 * @description Builds structured combat result context for post-combat AI narrative generation.
 * 
 * This service processes the final combat state and log to extract:
 * - Player and ally performance statistics
 * - Enemy defeat information
 * - Notable dramatic moments (close calls, clutch saves, overkills)
 * 
 * The resulting context is passed to the AI to generate rich return-to-RP narratives
 * that reference specific combat events and outcomes.
 * 
 * @see CardShark_Combat_System_v04.yaml lines 384-483 for spec
 */

import { CombatState, HitQuality } from '../../types/combat';

/**
 * Structured combat result context for AI narrative generation.
 * Matches the spec's combat_result_context structure.
 */
export interface CombatResultContext {
    outcome: 'victory' | 'defeat' | 'fled';
    turns_taken: number;

    player_state: {
        ending_hp: number;
        max_hp: number;
        damage_dealt_total: number;
        killing_blows: number;
        was_knocked_out: boolean;
    };

    ally_summary: Array<{
        npc_id: string;
        name: string;
        ending_hp: number;
        max_hp: number;
        damage_dealt: number;
        damage_taken: number;
        killing_blows: number;
        was_knocked_out: boolean;
        defended_player: boolean;
    }>;

    enemy_summary: Array<{
        npc_id: string;
        name: string;
        was_defeated: boolean;
        defeated_by: string;
        hit_quality_on_death: HitQuality | null;
        fled: boolean;
    }>;

    notable_moments: Array<{
        type: 'CLOSE_CALL' | 'CLUTCH_SAVE' | 'OVERKILL' | 'FIRST_BLOOD' | 'LAST_STAND';
        actor: string;
        target?: string;
        details: string;
    }>;
}

/**
 * Build combat result context from final combat state and log.
 * 
 * This function analyzes the entire combat log to extract statistics and
 * identify dramatic moments for AI narrative generation.
 * 
 * @param finalState - The final combat state after combat ended
 * @returns Structured context for AI narrative generation
 * 
 * @example
 * const context = buildCombatResultContext(finalState);
 * // Pass to AI: "Generate a return-to-RP narrative: ${JSON.stringify(context)}"
 */
export function buildCombatResultContext(finalState: CombatState): CombatResultContext {
    const combatLog = finalState.log;
    const combatants = finalState.combatants;

    // Find player combatant
    const player = Object.values(combatants).find(c => c.isPlayer);
    if (!player) {
        throw new Error('No player combatant found in combat state');
    }

    // Separate allies and enemies
    const allies = Object.values(combatants).filter(c => c.isPlayerControlled && !c.isPlayer);
    const enemies = Object.values(combatants).filter(c => !c.isPlayerControlled);

    // Initialize tracking maps
    const damageDealt = new Map<string, number>();
    const damageTaken = new Map<string, number>();
    const killingBlows = new Map<string, number>();
    const defendedPlayer = new Set<string>();
    const defeatedBy = new Map<string, string>(); // enemyId -> killerId
    const hitQualityOnDeath = new Map<string, HitQuality>();

    // Initialize all combatants in tracking maps
    Object.keys(combatants).forEach(id => {
        damageDealt.set(id, 0);
        damageTaken.set(id, 0);
        killingBlows.set(id, 0);
    });

    // Process combat log
    let firstBloodActorId: string | null = null;

    for (const entry of combatLog) {
        const actorId = entry.actorId;
        const targetId = entry.targetId;

        // Track damage dealt
        if (entry.actionType === 'attack' && entry.result.hit && entry.result.damage) {
            const currentDamage = damageDealt.get(actorId) || 0;
            damageDealt.set(actorId, currentDamage + entry.result.damage);

            // Track damage taken by target
            if (targetId) {
                const currentTaken = damageTaken.get(targetId) || 0;
                damageTaken.set(targetId, currentTaken + entry.result.damage);
            }

            // Track killing blows
            if (entry.result.special === 'killing_blow' && targetId) {
                const currentKills = killingBlows.get(actorId) || 0;
                killingBlows.set(actorId, currentKills + 1);

                // Track who defeated this enemy
                defeatedBy.set(targetId, actorId);

                // Track hit quality on death
                if (entry.result.hitQuality) {
                    hitQualityOnDeath.set(targetId, entry.result.hitQuality);
                }

                // Track first blood
                if (!firstBloodActorId) {
                    firstBloodActorId = actorId;
                }
            }

            // Track intercepted damage
            if (entry.result.interceptedDamage && entry.result.interceptedByDefender) {
                const interceptedDamage = entry.result.interceptedDamage;
                if (targetId) {
                    const currentTaken = damageTaken.get(targetId) || 0;
                    damageTaken.set(targetId, currentTaken + interceptedDamage);
                }
            }
        }

        // Track defend actions targeting player
        if (entry.actionType === 'defend' && targetId === player.id) {
            defendedPlayer.add(actorId);
        }
    }

    // Build player state
    const player_state = {
        ending_hp: player.currentHp,
        max_hp: player.maxHp,
        damage_dealt_total: damageDealt.get(player.id) || 0,
        killing_blows: killingBlows.get(player.id) || 0,
        was_knocked_out: player.isKnockedOut,
    };

    // Build ally summary
    const ally_summary = allies.map(ally => ({
        npc_id: ally.id,
        name: ally.name,
        ending_hp: ally.currentHp,
        max_hp: ally.maxHp,
        damage_dealt: damageDealt.get(ally.id) || 0,
        damage_taken: damageTaken.get(ally.id) || 0,
        killing_blows: killingBlows.get(ally.id) || 0,
        was_knocked_out: ally.isKnockedOut,
        defended_player: defendedPlayer.has(ally.id),
    }));

    // Build enemy summary
    const enemy_summary = enemies.map(enemy => ({
        npc_id: enemy.id,
        name: enemy.name,
        was_defeated: enemy.isKnockedOut,
        defeated_by: defeatedBy.has(enemy.id)
            ? combatants[defeatedBy.get(enemy.id)!]?.name || 'Unknown'
            : 'N/A',
        hit_quality_on_death: hitQualityOnDeath.get(enemy.id) || null,
        fled: false, // V1: enemies don't flee
    }));

    // Identify notable moments
    const notable_moments: CombatResultContext['notable_moments'] = [];

    // FIRST_BLOOD: First killing blow
    if (firstBloodActorId) {
        const actor = combatants[firstBloodActorId];
        if (actor) {
            notable_moments.push({
                type: 'FIRST_BLOOD',
                actor: actor.name,
                details: `${actor.name} struck the first killing blow`,
            });
        }
    }

    // CLOSE_CALL: Survived with < 20% HP
    [player, ...allies].forEach(combatant => {
        if (!combatant.isKnockedOut && combatant.currentHp > 0) {
            const hpPercent = (combatant.currentHp / combatant.maxHp) * 100;
            if (hpPercent < 20) {
                notable_moments.push({
                    type: 'CLOSE_CALL',
                    actor: combatant.name,
                    details: `${combatant.name} survived with only ${combatant.currentHp}/${combatant.maxHp} HP remaining`,
                });
            }
        }
    });

    // CLUTCH_SAVE: Defender intercepted damage that would have KO'd protected ally
    for (const entry of combatLog) {
        if (entry.result.interceptedDamage && entry.result.interceptedByDefender && entry.targetId) {
            const target = combatants[entry.targetId];
            const interceptedDamage = entry.result.interceptedDamage;

            if (target && interceptedDamage >= target.currentHp) {
                notable_moments.push({
                    type: 'CLUTCH_SAVE',
                    actor: entry.result.interceptedByDefender,
                    target: target.name,
                    details: `${entry.result.interceptedByDefender} intercepted ${interceptedDamage} damage when ${target.name} was at ${target.currentHp} HP`,
                });
            }
        }
    }

    // OVERKILL: Final damage >= 2x target's remaining HP
    for (const entry of combatLog) {
        if (entry.result.special === 'killing_blow' && entry.result.damage && entry.targetId) {
            const target = combatants[entry.targetId];
            const actor = combatants[entry.actorId];

            if (target && actor && entry.result.damage >= target.maxHp * 0.5) {
                notable_moments.push({
                    type: 'OVERKILL',
                    actor: actor.name,
                    target: target.name,
                    details: `${actor.name} dealt ${entry.result.damage} damage to ${target.name}, far exceeding what was needed`,
                });
            }
        }
    }

    // LAST_STAND: Got killing blow while at < 20% HP
    for (const entry of combatLog) {
        if (entry.result.special === 'killing_blow') {
            const actor = combatants[entry.actorId];
            const target = combatants[entry.targetId!];

            if (actor && target && actor.currentHp > 0) {
                const hpPercent = (actor.currentHp / actor.maxHp) * 100;
                if (hpPercent < 20) {
                    notable_moments.push({
                        type: 'LAST_STAND',
                        actor: actor.name,
                        target: target.name,
                        details: `${actor.name} defeated ${target.name} while barely standing at ${actor.currentHp}/${actor.maxHp} HP`,
                    });
                }
            }
        }
    }

    return {
        outcome: finalState.result?.outcome || 'victory',
        turns_taken: finalState.turn,
        player_state,
        ally_summary,
        enemy_summary,
        notable_moments,
    };
}
