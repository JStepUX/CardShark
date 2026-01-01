// frontend/src/components/combat/ActionButtons.tsx
// Action button bar for combat

import React from 'react';
import { ActionType } from '../../types/combat';

interface ActionButtonsProps {
  availableActions: ActionType[];
  selectedAction: ActionType | null;
  apRemaining: number;
  onSelectAction: (action: ActionType) => void;
  onCancel: () => void;
  disabled?: boolean;
}

interface ActionConfig {
  type: ActionType;
  label: string;
  icon: React.ReactNode;
  apCost: number;
  hotkey: string;
  description: string;
}

const ACTION_CONFIGS: ActionConfig[] = [
  {
    type: 'attack',
    label: 'Attack',
    icon: <AttackIcon />,
    apCost: 2,
    hotkey: 'A',
    description: 'Strike an enemy (2 AP)',
  },
  {
    type: 'overwatch',
    label: 'Overwatch',
    icon: <OverwatchIcon />,
    apCost: 2,
    hotkey: 'O',
    description: 'Ready a reaction shot (2 AP)',
  },
  {
    type: 'defend',
    label: 'Defend',
    icon: <DefendIcon />,
    apCost: 1,
    hotkey: 'D',
    description: 'Brace for attacks, +2 DEF (1 AP)',
  },
  {
    type: 'move',
    label: 'Move',
    icon: <MoveIcon />,
    apCost: 1,
    hotkey: 'M',
    description: 'Change position (1-2 AP)',
  },
  {
    type: 'swap',
    label: 'Swap',
    icon: <SwapIcon />,
    apCost: 1,
    hotkey: 'S',
    description: 'Switch with adjacent ally (1 AP)',
  },
  {
    type: 'flee',
    label: 'Run Away!',
    icon: <FleeIcon />,
    apCost: 2,
    hotkey: 'F',
    description: 'Attempt to escape (2 AP, edge only)',
  },
];

export function ActionButtons({
  availableActions,
  selectedAction,
  apRemaining,
  onSelectAction,
  onCancel,
  disabled,
}: ActionButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      {ACTION_CONFIGS.map(config => {
        const isAvailable = availableActions.includes(config.type);
        const isSelected = selectedAction === config.type;
        const canAfford = apRemaining >= config.apCost;

        return (
          <button
            key={config.type}
            onClick={() => isAvailable && onSelectAction(config.type)}
            disabled={disabled || !isAvailable}
            title={`${config.description} [${config.hotkey}]`}
            aria-label={`${config.label}: ${config.description}. Hotkey: ${config.hotkey}`}
            aria-pressed={isSelected}
            className={`
              relative flex flex-col items-center justify-center
              w-20 h-20 rounded-lg
              transition-all duration-150
              ${isSelected
                ? 'bg-amber-600 border-2 border-amber-400 shadow-lg shadow-amber-500/30'
                : isAvailable
                  ? 'bg-amber-700 hover:bg-amber-600 border-2 border-amber-800'
                  : 'bg-gray-800 border-2 border-gray-700 opacity-50 cursor-not-allowed'
              }
            `}
          >
            {/* Icon */}
            <div className={`w-8 h-8 ${isAvailable ? 'text-white' : 'text-gray-500'}`}>
              {config.icon}
            </div>

            {/* Label */}
            <span className={`text-xs mt-1 ${isAvailable ? 'text-white' : 'text-gray-500'}`}>
              {config.label}
            </span>

            {/* AP cost badge */}
            <div className={`
              absolute -top-1 -right-1
              w-5 h-5 rounded-full
              flex items-center justify-center
              text-xs font-bold
              ${canAfford ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}
            `}>
              {config.apCost}
            </div>

            {/* Hotkey hint */}
            <div className="absolute bottom-0.5 right-1 text-[10px] text-amber-300/50">
              {config.hotkey}
            </div>
          </button>
        );
      })}

      {/* Cancel button (shown when action is selected) */}
      {selectedAction && (
        <button
          onClick={onCancel}
          aria-label="Cancel current action. Hotkey: Escape"
          className="flex flex-col items-center justify-center w-20 h-20 rounded-lg bg-gray-700 hover:bg-gray-600 border-2 border-gray-600 transition-all"
        >
          <div className="w-8 h-8 text-gray-300">
            <CancelIcon />
          </div>
          <span className="text-xs mt-1 text-gray-300">Cancel</span>
          <div className="absolute bottom-0.5 right-1 text-[10px] text-gray-500">
            Esc
          </div>
        </button>
      )}
    </div>
  );
}

// Simple SVG icons
function AttackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6" />
      <path d="M16 16l4 4" />
      <path d="M19 21l2-2" />
    </svg>
  );
}

function OverwatchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function DefendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" />
      <path d="M12 5l7 7-7 7" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 16V4M7 4L3 8M7 4l4 4" />
      <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
}

function FleeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 4v2" />
      <path d="M13 8.5v.5" />
      <path d="M9.5 10l-2 4.5" />
      <path d="M14.5 10l2 4.5" />
      <path d="M7.5 14.5l-1 5" />
      <path d="M16.5 14.5l1 5" />
      <circle cx="12" cy="6" r="2" />
      <path d="M12 8.5v2" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6" />
      <path d="M9 9l6 6" />
    </svg>
  );
}
