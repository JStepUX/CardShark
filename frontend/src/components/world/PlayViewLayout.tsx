/**
 * @file PlayViewLayout.tsx
 * @description Layout component for the unified Play View.
 *
 * Side-by-side layout:
 * ┌──────────────────────────────────────────────────────────────┐
 * │ Header: World -> Room    [Lvl] [XP Bar] [Gold]  Journal Time │
 * ├────────────────────────────────────┬─────────────────────────┤
 * │                                    │                         │
 * │                                    │      Chat Panel         │
 * │         LOCAL MAP (9x9)            │      (messages)         │
 * │         Portrait grid              │                         │
 * │              2/3                   │          1/3            │
 * │                                    ├─────────────────────────┤
 * │                                    │      [Input field]      │
 * └────────────────────────────────────┴─────────────────────────┘
 *
 * During combat: Chat panel hides, map expands to full width.
 * Combat HUD overlays the map directly.
 */

import React, { ReactNode } from 'react';
import { Star, Coins, UserPlus, X, ArrowLeft } from 'lucide-react';
import dayNightCycleIcon from '../../assets/icons/daynightcycle.png';

/** Player progression display data */
interface PlayerProgressProps {
    level: number;
    xpCurrent: number;      // XP progress toward next level
    xpNeeded: number;       // XP required for next level
    gold: number;
}

/** Conversation state for displaying NPC interaction UI */
interface ConversationState {
    /** Currently talking to (non-bonded) */
    conversationTargetName?: string;
    /** Whether player already has a bonded ally */
    hasBondedAlly: boolean;
    /** Bonded ally name (if any) */
    bondedAllyName?: string;
}

interface PlayViewLayoutProps {
    /** World name for breadcrumb */
    worldName: string;
    /** Room name for breadcrumb */
    roomName: string;
    /** Current time display */
    timeDisplay?: string;
    /** Time of day for day/night cycle icon rotation (0.0-1.0) */
    timeOfDay?: number;
    /** Player progression for HUD display */
    playerProgress?: PlayerProgressProps;
    /** Whether journal button is available */
    showJournalButton?: boolean;
    /** Journal button click handler */
    onJournalClick?: () => void;
    /** Back button click handler (returns to world splash) */
    onBackToWorld?: () => void;
    /** The local map component */
    localMapContent: ReactNode;
    /** The chat or combat log panel */
    chatPanelContent: ReactNode;
    /** Optional side icons (from existing SidePanel) */
    sideIcons?: ReactNode;
    /** Whether in combat mode (affects styling) */
    inCombat?: boolean;
    /** Current conversation state (for bond button display) */
    conversationState?: ConversationState;
    /** Handler for bonding with the conversation target */
    onBondNpc?: () => void;
    /** Handler for ending conversation with current target */
    onEndConversation?: () => void;
}

export const PlayViewLayout: React.FC<PlayViewLayoutProps> = ({
    worldName,
    roomName,
    timeDisplay,
    timeOfDay = 0,
    playerProgress,
    showJournalButton = true,
    onJournalClick,
    onBackToWorld,
    localMapContent,
    chatPanelContent,
    sideIcons,
    inCombat = false,
    conversationState,
    onBondNpc,
    onEndConversation,
}) => {
    // Calculate XP progress percentage
    const xpPercentage = playerProgress
        ? Math.min(100, (playerProgress.xpCurrent / playerProgress.xpNeeded) * 100)
        : 0;

    // Calculate day/night cycle rotation angle
    // The icon has 12:00 noon at 0 degrees, so add 90-degree offset so 0.0 timeOfDay (dawn/6AM) starts at top
    // Full day (0.0 to 1.0) = full 360 degree rotation
    const dayNightRotation = timeOfDay * 360 + 90;
    return (
        <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden relative">
            {/* Side Icons (if provided) */}
            {sideIcons && (
                <div className="flex flex-col items-center py-2 px-1 bg-[#111111] border-r border-gray-800">
                    {sideIcons}
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header Bar */}
                <header className="flex items-center justify-between px-4 py-2 bg-[#111111] border-b border-gray-800">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 text-sm">
                        <button
                            onClick={onBackToWorld}
                            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
                            title="Return to World"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            {worldName}
                        </button>
                        <span className="text-gray-600">→</span>
                        <span className="text-white font-medium">{roomName}</span>
                        {inCombat && (
                            <span className="ml-2 px-2 py-0.5 text-xs font-bold text-red-400 bg-red-900/30 rounded border border-red-800/50">
                                COMBAT
                            </span>
                        )}
                    </div>

                    {/* Right side controls */}
                    <div className="flex items-center gap-4">
                        {/* Player Progress Display */}
                        {playerProgress && (
                            <div className="flex items-center gap-3 px-3 py-1 bg-gray-800/50 rounded">
                                {/* Level Badge */}
                                <div className="flex items-center gap-1" title={`Level ${playerProgress.level}`}>
                                    <span className="text-xs font-bold text-yellow-400 bg-yellow-900/40 px-1.5 py-0.5 rounded">
                                        Lv.{playerProgress.level}
                                    </span>
                                </div>

                                {/* XP Progress Bar */}
                                <div
                                    className="flex items-center gap-2"
                                    title={`XP: ${playerProgress.xpCurrent} / ${playerProgress.xpNeeded}`}
                                >
                                    <Star className="w-3.5 h-3.5 text-yellow-400" />
                                    <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 transition-all duration-300"
                                            style={{ width: `${xpPercentage}%` }}
                                        />
                                    </div>
                                    <span className="text-xs text-gray-500 min-w-[3rem]">
                                        {playerProgress.xpCurrent}/{playerProgress.xpNeeded}
                                    </span>
                                </div>

                                {/* Gold Display */}
                                <div className="flex items-center gap-1" title={`${playerProgress.gold} Gold`}>
                                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                                    <span className="text-sm text-amber-400 font-medium">
                                        {playerProgress.gold}
                                    </span>
                                </div>
                            </div>
                        )}

                        {showJournalButton && (
                            <button
                                onClick={onJournalClick}
                                className="flex items-center gap-2 px-3 py-1 text-sm text-gray-400 hover:text-white bg-gray-800/50 hover:bg-gray-700/50 rounded transition-colors"
                            >
                                <span>📓</span>
                                <span>Journal</span>
                            </button>
                        )}
                        {timeDisplay && (
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                {/* Day/Night Cycle Icon */}
                                <div
                                    className="relative w-7 h-7 flex-shrink-0"
                                    title={`Time: ${timeDisplay}`}
                                >
                                    <img
                                        src={dayNightCycleIcon}
                                        alt="Day/Night Cycle"
                                        className="w-full h-full object-contain transition-transform duration-500 ease-out"
                                        style={{
                                            transform: `rotate(${dayNightRotation}deg)`,
                                        }}
                                    />
                                </div>
                                <span>{timeDisplay}</span>
                            </div>
                        )}
                    </div>
                </header>

                {/* Main Content: Map + Chat side by side (or just Map in combat) */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Local Map Area - 60% width normally, full width in combat */}
                    <div
                        className={`overflow-hidden transition-all duration-300 ${
                            inCombat ? 'w-full' : 'w-[60%] border-r border-gray-800'
                        }`}
                    >
                        {localMapContent}
                    </div>

                    {/* Chat Panel - 40% width, hidden in combat */}
                    {!inCombat && (
                        <div className="w-[40%] flex flex-col overflow-hidden bg-[#0a0a0a]">
                            {/* Conversation Header - shows when talking to non-bonded NPC */}
                            {conversationState?.conversationTargetName && (
                                <div className="flex items-center justify-between px-3 py-2 bg-[#1a1a2e] border-b border-purple-900/50">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-400">Speaking with</span>
                                        <span className="text-sm font-medium text-purple-300">
                                            {conversationState.conversationTargetName}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Bond button - only show if no bonded ally */}
                                        {!conversationState.hasBondedAlly && onBondNpc && (
                                            <button
                                                onClick={onBondNpc}
                                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium
                                                         text-green-300 bg-green-900/40 hover:bg-green-800/60
                                                         border border-green-700/50 rounded transition-colors"
                                                title={`Bond with ${conversationState.conversationTargetName} (they will follow you)`}
                                            >
                                                <UserPlus className="w-3.5 h-3.5" />
                                                Bond
                                            </button>
                                        )}
                                        {/* End conversation button */}
                                        {onEndConversation && (
                                            <button
                                                onClick={onEndConversation}
                                                className="flex items-center gap-1 px-2 py-1 text-xs
                                                         text-gray-400 hover:text-gray-200 hover:bg-gray-800/50
                                                         rounded transition-colors"
                                                title="End conversation"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                            {/* Bonded Ally indicator - shows when have bonded ally but not in conversation */}
                            {!conversationState?.conversationTargetName && conversationState?.bondedAllyName && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1e1e2e] border-b border-gray-800/50">
                                    <span className="text-xs text-gray-500">Ally:</span>
                                    <span className="text-xs font-medium text-purple-400">
                                        {conversationState.bondedAllyName}
                                    </span>
                                </div>
                            )}
                            {chatPanelContent}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PlayViewLayout;
