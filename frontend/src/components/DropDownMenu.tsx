import React, { useState, useRef, useEffect } from 'react';
import { LucideIcon } from 'lucide-react';

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
  /**
   * Optional text to display next to the icon.
   */
  label?: string;  // <-- New prop for button label
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({
  icon: Icon,
  items,
  buttonClassName = "w-10 h-10 bg-orange-700 rounded-full flex items-center justify-center hover:bg-orange-500 transition-colors",
  menuClassName = "absolute right-0 mt-2 w-56 bg-slate-700 border border-slate-600 rounded-lg shadow-lg py-1 z-10",
  label // <-- label prop
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Handle clicking outside of dropdown
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
            <button
              key={index}
              onClick={() => {
                item.onClick();
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left flex items-center hover:bg-slate-600 text-white"
            >
              <item.icon className="w-4 h-4 mr-2" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DropdownMenu;
