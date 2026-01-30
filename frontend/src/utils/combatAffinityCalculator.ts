// frontend/src/utils/combatAffinityCalculator.ts
// Calculate affinity changes based on combat outcomes

import type { GridCombatState } from '../types/combat';

export interface AffinityChange {
    npcUuid: string;
    delta: number;
    reason: string;
}

/**
 * Calculate affinity changes from combat results.
 * 
 * Rules:
 * - Defeated hostile NPC: No direct affinity change (they're dead)
 * - Surviving ally: +10 affinity (fought alongside player)
 * - Ally took damage: +5 additional affinity (player witnessed their sacrifice)
 * - Ally dealt killing blow: +3 additional affinity (player saw their prowess)
 * - Daily cap: Maximum 60 affinity per NPC per day (prevents farming)
 * 
 * Future: Could add faction-based affinity (killing goblin → -affinity with goblin tribe)
 */
export function calculateCombatAffinity(
    finalState: GridCombatState,
    relationships: Record<string, any> = {},
    currentDay: number = 1,
    dailyCap: number = 60
): AffinityChange[] {
    const changes: AffinityChange[] = [];

    if (!finalState.result) return changes;

    const { outcome, survivingAllies } = finalState.result;

    // Only process affinity for victory or fled (defeat = player dead, no witnesses)
    if (outcome === 'defeat') return changes;

    // Process surviving allies
    for (const allyId of survivingAllies) {
        const ally = finalState.combatants[allyId];
        if (!ally || ally.isPlayer) continue; // Skip player character

        let affinityDelta = 10; // Base: fought alongside player
        let reasons: string[] = ['fought alongside you'];

        // Check if ally took damage (showed bravery)
        if (ally.currentHp < ally.maxHp) {
            const damageTaken = ally.maxHp - ally.currentHp;
            const damagePercent = (damageTaken / ally.maxHp) * 100;

            if (damagePercent >= 50) {
                affinityDelta += 10; // Took heavy damage
                reasons.push('took heavy damage protecting you');
            } else if (damagePercent >= 25) {
                affinityDelta += 5; // Took moderate damage
                reasons.push('was wounded in battle');
            }
        }

        // Check combat log for ally's contributions
        const allyActions = finalState.log.filter(entry => entry.actorId === allyId);
        const killingBlows = allyActions.filter(entry => entry.result.special === 'killing_blow');

        if (killingBlows.length > 0) {
            affinityDelta += 3 * killingBlows.length; // +3 per killing blow
            reasons.push(`struck ${killingBlows.length} killing blow${killingBlows.length > 1 ? 's' : ''}`);
        }

        // Apply daily cap filtering
        const relationship = relationships[allyId];
        if (relationship) {
            const { getAvailableAffinityGain } = require('./affinityUtils');
            const availableGain = getAvailableAffinityGain(
                relationship,
                affinityDelta,
                currentDay,
                dailyCap
            );

            if (availableGain === 0) {
                // Daily limit reached, skip this NPC
                continue;
            }

            if (availableGain < affinityDelta) {
                // Partial gain due to daily cap
                reasons.push(`daily limit: ${availableGain}/${affinityDelta}`);
                affinityDelta = availableGain;
            }
        }

        changes.push({
            npcUuid: allyId,
            delta: affinityDelta,
            reason: reasons.join(', '),
        });
    }

    // Future: Add faction-based affinity changes
    // e.g., killing goblins → -affinity with goblin faction NPCs
    // This would require faction metadata on NPCs

    return changes;
}

/**
 * Get a human-readable summary of affinity changes for display.
 */
export function formatAffinityChanges(changes: AffinityChange[]): string {
    if (changes.length === 0) return '';

    const summaries = changes.map(change => {
        const sign = change.delta > 0 ? '+' : '';
        return `${sign}${change.delta} with ${change.npcUuid}`;
    });

    return `Affinity changes: ${summaries.join(', ')}`;
}
