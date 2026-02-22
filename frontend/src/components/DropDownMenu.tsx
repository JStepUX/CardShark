import React, { useState, useRef, useEffect } from 'react';
import { LucideIcon } from 'lucide-react';
import Button from './common/Button';

interface MenuItem {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

interface DropdownMenuProps {
  icon: LucideIcon;
  items: MenuItem[];
  buttonClassName?: string;
  menuClassName?: string;
  label?: string;
  title?: string; // Add title prop for tooltip
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({
  icon: Icon,
  items,
  buttonClassName = "w-10 h-10 bg-orange-700 rounded-full flex items-center justify-center hover:bg-orange-500 transition-colors",
  menuClassName = "absolute right-0 mt-2 w-56 bg-stone-700 border border-stone-600 rounded-lg shadow-lg py-1 z-10",
  label,
  title // Destructure title prop
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center ${buttonClassName}`}
        title={title} // Add title attribute for tooltip
      >
        <Icon className="w-5 h-5 text-white" />
        {label && (
          <span className="ml-2 text-white">
            {label}
          </span>
        )}
      </button>

      {isOpen && (
        <div ref={dropdownRef} className={menuClassName}>
          {items.map((item, index) => (
            <Button
              key={index}
              variant="ghost"
              size="md"
              fullWidth
              onClick={() => {
                item.onClick();
                setIsOpen(false);
              }}
              className="px-4 py-2 text-left text-white hover:!bg-stone-600"
            >
              <item.icon className="w-4 h-4 mr-2" />
              {item.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DropdownMenu;