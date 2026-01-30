/**
 * @file postCombatNarrative.ts
 * @description Service for generating post-combat narrative context for LLM.
 *
 * After combat ends, this service builds a summary of what happened during
 * the battle to feed to the LLM for narrative generation. This bridges
 * the programmatic combat system back to the generative RP system.
 *
 * Key features:
 * - Summarizes combat events in narrative-friendly format
 * - Tracks ally participation and status (knocked out, revived)
 * - Provides context for the bonded ally to "narrate" the aftermath
 */

import type {
    GridCombatState,
    GridCombatant,
    CombatLogEntry,
} from '../../types/combat';

// =============================================================================
// Types
// =============================================================================

/**
 * Combat summary for narrative generation
 */
export interface CombatNarrativeSummary {
    /** Combat outcome */
    outcome: 'victory' | 'defeat' | 'fled';

    /** Total turns/rounds the combat lasted */
    turnsTotal: number;

    /** Player's final status */
    player: {
        name: string;
        survived: boolean;
        wasKnockedOut: boolean;  // Player was knocked out during the fight
        wasRevived: boolean;     // Player was revived by ally after ally carried
        currentHp: number;
        maxHp: number;
        damageDealt: number;
        damageReceived: number;
    };

    /** Bonded ally's status (if present) */
    ally?: {
        name: string;
        survived: boolean;
        wasKnockedOut: boolean;
        wasRevived: boolean;
        carriedTheFight: boolean;  // Ally finished the fight while player was down
        currentHp: number;
        maxHp: number;
        damageDealt: number;
        damageReceived: number;
    };

    /** Enemies fought */
    enemies: Array<{
        name: string;
        level: number;
        isDead: boolean;
        isIncapacitated: boolean;
    }>;

    /** Notable combat moments (key log entries) */
    notableMoments: string[];

    /** Rewards earned (on victory) */
    rewards?: {
        xp: number;
        gold: number;
    };
}

// =============================================================================
// Summary Builder
// =============================================================================

/**
 * Build a narrative summary from the final combat state.
 *
 * @param combatState - Final combat state after combat ends
 * @returns Combat summary suitable for LLM context
 */
export function buildCombatNarrativeSummary(
    combatState: GridCombatState
): CombatNarrativeSummary {
    const outcome = combatState.result?.outcome ?? 'victory';
    const revivedAllyIds = new Set(combatState.result?.revivedAllies ?? []);
    const playerWasRevived = combatState.result?.revivedPlayer ?? false;
    const revivedByAllyId = combatState.result?.revivedByAllyId;

    // Find player and ally combatants
    const playerCombatant = Object.values(combatState.combatants).find(c => c.isPlayer);
    const allyCombatant = Object.values(combatState.combatants).find(
        c => c.isPlayerControlled && !c.isPlayer
    );

    // Calculate damage stats from combat log
    const damageStats = calculateDamageStats(combatState.log, combatState.combatants);

    // Determine if ally carried the fight (player was revived, ally wasn't knocked out)
    const allyCarriedTheFight = playerWasRevived && revivedByAllyId === allyCombatant?.id;

    // Build player summary
    const player = {
        name: playerCombatant?.name ?? 'Player',
        survived: playerCombatant ? !playerCombatant.isKnockedOut : true,
        wasKnockedOut: playerWasRevived, // If player was revived, they were knocked out
        wasRevived: playerWasRevived,
        currentHp: playerCombatant?.currentHp ?? 0,
        maxHp: playerCombatant?.maxHp ?? 100,
        damageDealt: damageStats.get(playerCombatant?.id ?? '')?.dealt ?? 0,
        damageReceived: damageStats.get(playerCombatant?.id ?? '')?.received ?? 0,
    };

    // Build ally summary if present
    let ally: CombatNarrativeSummary['ally'] = undefined;
    if (allyCombatant) {
        const wasRevived = revivedAllyIds.has(allyCombatant.id);
        ally = {
            name: allyCombatant.name,
            survived: !allyCombatant.isKnockedOut || wasRevived,
            wasKnockedOut: allyCombatant.isKnockedOut || wasRevived, // If revived, was knocked out
            wasRevived,
            carriedTheFight: allyCarriedTheFight,
            currentHp: allyCombatant.currentHp,
            maxHp: allyCombatant.maxHp,
            damageDealt: damageStats.get(allyCombatant.id)?.dealt ?? 0,
            damageReceived: damageStats.get(allyCombatant.id)?.received ?? 0,
        };
    }

    // Build enemy list
    const enemies = Object.values(combatState.combatants)
        .filter(c => !c.isPlayerControlled)
        .map(c => ({
            name: c.name,
            level: c.level,
            isDead: c.isDead,
            isIncapacitated: c.isIncapacitated,
        }));

    // Extract notable moments from combat log
    const notableMoments = extractNotableMoments(combatState.log);

    return {
        outcome,
        turnsTotal: combatState.turn,
        player,
        ally,
        enemies,
        notableMoments,
        rewards: combatState.result?.rewards,
    };
}

/**
 * Calculate damage dealt and received by each combatant from the combat log.
 */
function calculateDamageStats(
    log: CombatLogEntry[],
    combatants: Record<string, GridCombatant>
): Map<string, { dealt: number; received: number }> {
    const stats = new Map<string, { dealt: number; received: number }>();

    // Initialize all combatants
    for (const id of Object.keys(combatants)) {
        stats.set(id, { dealt: 0, received: 0 });
    }

    // Process attack entries
    for (const entry of log) {
        if (entry.actionType === 'attack' && entry.result.hit && entry.result.damage) {
            // Attacker dealt damage
            const attackerStats = stats.get(entry.actorId);
            if (attackerStats) {
                attackerStats.dealt += entry.result.damage;
            }

            // Target received damage
            if (entry.targetId) {
                const targetStats = stats.get(entry.targetId);
                if (targetStats) {
                    targetStats.received += entry.result.damage;
                }
            }
        }
    }

    return stats;
}

/**
 * Extract notable moments from combat log for narrative flavor.
 * Focuses on: killing blows, critical hits, ally knockouts, revivals.
 */
function extractNotableMoments(log: CombatLogEntry[]): string[] {
    const moments: string[] = [];

    for (const entry of log) {
        // Killing blows
        if (entry.result.special === 'killing_blow') {
            moments.push(`${entry.actorName} delivered a killing blow to ${entry.targetName}!`);
        }

        // Critical/crushing hits
        if (entry.result.hitQuality === 'crushing' && entry.result.damage) {
            moments.push(`${entry.actorName} landed a devastating strike on ${entry.targetName} for ${entry.result.damage} damage!`);
        }

        // Large damage hits (not crushing but still significant)
        if (entry.result.hit && entry.result.damage && entry.result.damage >= 15 && entry.result.hitQuality !== 'crushing') {
            moments.push(`${entry.actorName} dealt ${entry.result.damage} damage to ${entry.targetName}.`);
        }
    }

    // Limit to most impactful moments
    return moments.slice(0, 5);
}

// =============================================================================
// Prompt Building
// =============================================================================

/**
 * Build a narrative prompt for the LLM based on combat summary.
 *
 * @param summary - Combat summary
 * @param isAllyNarrator - Whether a bonded ally is narrating (vs world narrator)
 * @returns Prompt string for LLM
 */
export function buildPostCombatPrompt(
    summary: CombatNarrativeSummary,
    isAllyNarrator: boolean
): string {
    const enemyList = summary.enemies.map(e => e.name).join(', ');

    // Build context about what happened
    let combatDescription = `The battle against ${enemyList} has ended in ${summary.outcome}.`;

    if (summary.outcome === 'victory') {
        combatDescription += ` The fight lasted ${summary.turnsTotal} turn${summary.turnsTotal !== 1 ? 's' : ''}.`;

        // IMPORTANT: Track if player was knocked out and ally saved them
        if (summary.player.wasRevived && summary.ally?.carriedTheFight) {
            combatDescription += ` IMPORTANT: The player was knocked unconscious during the fight, but ${summary.ally.name} carried on alone and defeated the remaining enemies. ${summary.ally.name} then helped the player back to their feet (revived at 25% HP).`;
        }

        // Add ally status (if not already covered by player revival context)
        if (summary.ally && !summary.ally.carriedTheFight) {
            if (summary.ally.wasRevived) {
                combatDescription += ` ${summary.ally.name} was knocked unconscious during the fight but recovered after victory.`;
            } else if (summary.ally.wasKnockedOut) {
                combatDescription += ` ${summary.ally.name} fell during the battle.`;
            } else {
                combatDescription += ` ${summary.ally.name} fought alongside and survived.`;
            }
        }

        // Notable moments
        if (summary.notableMoments.length > 0) {
            combatDescription += '\n\nKey moments:\n- ' + summary.notableMoments.join('\n- ');
        }
    }

    // Build the actual prompt
    if (isAllyNarrator && summary.ally) {
        // Ally perspective - especially important if they saved the player
        const allyCarriedContext = summary.ally.carriedTheFight
            ? `\n\nCRITICAL CONTEXT: ${summary.ally.name} just saved the player's life! The player was knocked out but ${summary.ally.name} finished the fight alone and then helped the player up. ${summary.ally.name} should acknowledge this - perhaps with concern, relief, a bit of teasing, or whatever fits their personality. Something like "Here, let me help you up" or "You had me worried there" or similar.`
            : '';

        return `Combat has just ended. Generate a short, in-character reaction from ${summary.ally.name}'s perspective.

${combatDescription}${allyCarriedContext}

${summary.ally.name}'s current state: ${Math.round((summary.ally.currentHp / summary.ally.maxHp) * 100)}% HP${summary.ally.wasRevived ? ' (just recovered from being knocked out)' : ''}.

Requirements:
- Write 1-3 paragraphs maximum
- ${summary.ally.name} should acknowledge the battle that just occurred
- Reference the enemies by name (${enemyList})
${summary.ally.carriedTheFight
    ? `- MOST IMPORTANT: ${summary.ally.name} just saved the player who was knocked out. They should help the player up and react to this moment (concern, relief, teasing, etc. depending on personality)`
    : summary.ally.wasRevived
        ? `- Show ${summary.ally.name} recovering from unconsciousness and commenting on what happened`
        : '- Show awareness of the fight they participated in'}
- Include ${summary.ally.name}'s reaction to the outcome
- Stay in character for ${summary.ally.name}
- End with a natural transition back to exploration/conversation`;
    } else {
        // World narrator perspective
        const playerRevivedContext = summary.player.wasRevived && summary.ally
            ? `\n- IMPORTANT: The player was knocked out but ${summary.ally.name} saved them. Describe ${summary.ally.name} helping the player to their feet.`
            : '';

        return `Combat has just ended. Generate a brief narrative describing the aftermath.

${combatDescription}

Requirements:
- Write 1-2 paragraphs maximum
- Describe the scene after battle
- Reference the defeated enemies (${enemyList})
- Mention the player's condition (${Math.round((summary.player.currentHp / summary.player.maxHp) * 100)}% HP${summary.player.wasRevived ? ', just revived from unconsciousness' : ''})${playerRevivedContext}
${summary.ally && !summary.ally.carriedTheFight ? `- Mention ${summary.ally.name}'s condition${summary.ally.wasRevived ? ' and their recovery from unconsciousness' : ''}` : ''}
- Write in second person, present tense ("You catch your breath...")
- Transition smoothly back to exploration`;
    }
}

/**
 * Build a defeat-specific narrative prompt.
 */
export function buildDefeatPrompt(summary: CombatNarrativeSummary): string {
    const enemyList = summary.enemies.map(e => e.name).join(', ');

    return `The player has been defeated in combat. Generate a brief defeat narrative.

The battle was against ${enemyList} and lasted ${summary.turnsTotal} turn${summary.turnsTotal !== 1 ? 's' : ''}.

Requirements:
- Write 1-2 paragraphs maximum
- Describe the player being overwhelmed/falling
- Do NOT describe death - the player will respawn
- End with them awakening somewhere safe
- Write in second person, present tense
- Maintain some drama but keep it brief`;
}
