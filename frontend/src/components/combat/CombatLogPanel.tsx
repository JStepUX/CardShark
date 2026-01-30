/**
 * @file CombatLogPanel.tsx
 * @description Combat log panel that replaces chat during combat.
 *
 * Based on mockup:
 * - Turn order portraits at top (horizontal row of circles)
 * - Current turn highlighted
 * - Combat action feed below
 * - No input field (combat is turn-based, not chat-based)
 */

import React, { useRef, useEffect } from 'react';

interface CombatLogEntry {
    id: string;
    type: 'turn_start' | 'attack' | 'defend' | 'move' | 'flee' | 'death' | 'system';
    message: string;
    timestamp: number;
    actorName?: string;
    targetName?: string;
    damage?: number;
    isCritical?: boolean;
}

interface TurnOrderEntry {
    id: string;
    name: string;
    imagePath: string | null;
    isPlayerControlled: boolean;
    isCurrentTurn: boolean;
}

interface CombatLogPanelProps {
    /** Current round number */
    roundNumber: number;
    /** Turn order for display */
    turnOrder: TurnOrderEntry[];
    /** Combat log entries */
    logEntries: CombatLogEntry[];
    /** Current actor ID (for highlighting) */
    currentActorId?: string;
}

export const CombatLogPanel: React.FC<CombatLogPanelProps> = ({
    roundNumber,
    turnOrder,
    logEntries,
    currentActorId: _currentActorId,
}) => {
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new entries are added
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logEntries]);

    // Format combat log entry with flavor text
    const formatLogEntry = (entry: CombatLogEntry): React.ReactNode => {
        switch (entry.type) {
            case 'turn_start':
                return (
                    <span className="text-gray-400 font-medium">
                        Combat Turn #{roundNumber}
                    </span>
                );
            case 'attack':
                return (
                    <span>
                        <span className="text-white font-medium">{entry.actorName}</span>
                        <span className="text-gray-400"> hit </span>
                        <span className="text-white font-medium">{entry.targetName}</span>
                        <span className="text-gray-400"> for </span>
                        <span className={entry.isCritical ? 'text-yellow-400 font-bold' : 'text-red-400'}>
                            {entry.damage} hp
                        </span>
                        {entry.isCritical && (
                            <span className="text-yellow-400 font-bold ml-1">CRITICAL!</span>
                        )}
                    </span>
                );
            case 'defend':
                return (
                    <span>
                        <span className="text-white font-medium">{entry.actorName}</span>
                        <span className="text-blue-400"> is defending </span>
                        {entry.targetName && (
                            <span className="text-white font-medium">{entry.targetName}</span>
                        )}
                    </span>
                );
            case 'move':
                return (
                    <span>
                        <span className="text-white font-medium">{entry.actorName}</span>
                        <span className="text-gray-400"> moved</span>
                    </span>
                );
            case 'flee':
                return (
                    <span>
                        <span className="text-white font-medium">{entry.actorName}</span>
                        <span className="text-yellow-400"> attempts to flee...</span>
                    </span>
                );
            case 'death':
                return (
                    <span>
                        <span className="text-white font-medium">{entry.actorName}</span>
                        <span className="text-red-500 font-bold"> has been defeated!</span>
                    </span>
                );
            case 'system':
            default:
                return <span className="text-gray-400">{entry.message}</span>;
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0a0a]">
            {/* Turn Order Display */}
            <div className="flex items-center gap-2 px-4 py-2 bg-[#111111] border-b border-gray-800">
                {/* Turn order portraits */}
                <div className="flex items-center gap-2">
                    {turnOrder.map((entry, index) => (
                        <div
                            key={entry.id}
                            className={`relative w-10 h-10 rounded-full overflow-hidden border-2 transition-all ${
                                entry.isCurrentTurn
                                    ? 'border-yellow-400 ring-2 ring-yellow-400/50 scale-110'
                                    : entry.isPlayerControlled
                                    ? 'border-blue-500'
                                    : 'border-red-500'
                            }`}
                            title={entry.name}
                        >
                            {entry.imagePath ? (
                                <img
                                    src={entry.imagePath}
                                    alt={entry.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full bg-gray-700 flex items-center justify-center text-xs font-bold">
                                    {entry.name.charAt(0)}
                                </div>
                            )}
                            {/* Turn indicator number */}
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gray-900 rounded-full flex items-center justify-center text-[10px] text-gray-400">
                                {index + 1}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Round indicator */}
                <div className="ml-auto text-sm text-gray-500">
                    Round {roundNumber}
                </div>
            </div>

            {/* Combat Log */}
            <div
                ref={logContainerRef}
                className="flex-1 overflow-y-auto px-4 py-2 space-y-1"
            >
                {logEntries.length === 0 ? (
                    <div className="text-gray-500 text-sm text-center py-4">
                        Combat begins...
                    </div>
                ) : (
                    logEntries.map((entry) => (
                        <div
                            key={entry.id}
                            className="text-sm py-1 border-b border-gray-800/50 last:border-b-0"
                        >
                            {formatLogEntry(entry)}
                        </div>
                    ))
                )}
            </div>

            {/* Bottom info bar (no input - combat is turn-based) */}
            <div className="px-4 py-2 bg-[#111111] border-t border-gray-800 text-xs text-gray-500 text-center">
                Click on enemies to attack, or use action buttons
            </div>
        </div>
    );
};

export default CombatLogPanel;
