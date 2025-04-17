import React from "react";
import mapIcon from '../assets/icons/cswc_icon_map.png';
import inventoryIcon from '../assets/icons/cswc_icon_inventory.png';
import spellsIcon from '../assets/icons/cswc_icon_magic.png';
import meleeIcon from '../assets/icons/cswc_icon_combat.png';
import statsIcon from '../assets/icons/cswc_icon_health.png';

interface GameWorldIconBarProps {
  onMap?: () => void;
  onInventory?: () => void;
  onSpells?: () => void;
  onMelee?: () => void;
  onStats?: () => void;
}

type GameWorldIconKey = "map" | "inventory" | "spells" | "melee" | "stats";

const icons: { key: GameWorldIconKey; icon: string; label: string }[] = [
  { key: "map", icon: mapIcon, label: "Map" },
  { key: "inventory", icon: inventoryIcon, label: "Inventory" },
  { key: "spells", icon: spellsIcon, label: "Spells" },
  { key: "melee", icon: meleeIcon, label: "Melee" },
  { key: "stats", icon: statsIcon, label: "Stats" },
];

const GameWorldIconBar: React.FC<GameWorldIconBarProps> = ({
  onMap,
  onInventory,
  onSpells,
  onMelee,
  onStats,
}) => {
  const handlers: Record<GameWorldIconKey, (() => void) | undefined> = {
    map: onMap,
    inventory: onInventory,
    spells: onSpells,
    melee: onMelee,
    stats: onStats,
  };

  return (
    <div className="flex flex-row justify-center gap-6 py-3 bg-stone-900/80 rounded-t-xl border-b border-stone-700 shadow">
      {icons.map(({ key, icon, label }) => (
        <button
          key={key}
          onClick={handlers[key]}
          className="flex flex-col items-center px-4 py-2 text-blue-200 hover:text-yellow-400 focus:outline-none group"
          title={label}
        >
          <img
            src={icon}
            alt={label}
            className="mb-1 group-hover:scale-110 transition-transform"
            style={{ width: 28, height: 28 }}
          />
          <span className="text-xs font-medium tracking-wide">{label}</span>
        </button>
      ))}
    </div>
  );
};

export default GameWorldIconBar;
