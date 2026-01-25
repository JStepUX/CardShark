// frontend/src/components/world/AffinityHearts.tsx
// Visual display of NPC affinity using heart icons

import { Heart } from 'lucide-react';
import { getHeartDisplay, getTierColor } from '../../utils/affinityUtils';
import type { NPCRelationship } from '../../types/worldRuntime';

interface AffinityHeartsProps {
    relationship: NPCRelationship | null;
    size?: 'sm' | 'md';
}

/**
 * Displays affinity as filled/half/empty hearts (max 5 hearts).
 * Similar to Stardew Valley's friendship hearts.
 */
export function AffinityHearts({ relationship, size = 'sm' }: AffinityHeartsProps) {
    if (!relationship) {
        // No relationship data - show empty hearts for strangers
        return (
            <div className="flex gap-0.5" title="Stranger (0/100)">
                {[...Array(5)].map((_, i) => (
                    <Heart
                        key={i}
                        className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} text-gray-600`}
                        fill="none"
                    />
                ))}
            </div>
        );
    }

    const { filled, half } = getHeartDisplay(relationship.affinity);
    const tierColor = getTierColor(relationship.tier);
    const empty = 5 - filled - (half ? 1 : 0);

    return (
        <div
            className="flex gap-0.5"
            title={`${relationship.tier.replace('_', ' ')} (${relationship.affinity}/100)`}
        >
            {/* Filled hearts */}
            {[...Array(filled)].map((_, i) => (
                <Heart
                    key={`filled-${i}`}
                    className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} ${tierColor}`}
                    fill="currentColor"
                />
            ))}

            {/* Half heart */}
            {half && (
                <div className="relative">
                    <Heart
                        className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} text-gray-600`}
                        fill="none"
                    />
                    <div className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
                        <Heart
                            className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} ${tierColor}`}
                            fill="currentColor"
                        />
                    </div>
                </div>
            )}

            {/* Empty hearts */}
            {[...Array(empty)].map((_, i) => (
                <Heart
                    key={`empty-${i}`}
                    className={`${size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} text-gray-600`}
                    fill="none"
                />
            ))}
        </div>
    );
}
