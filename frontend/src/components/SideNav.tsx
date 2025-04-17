import React, { useState } from 'react';
import { NavLink } from 'react-router-dom'; // Import NavLink
import {
  ImagePlus,
  Link,
  Save,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  FileText,
  MessageSquare,
  Book,
  MessageCircle,
  Settings as SettingsIcon,
  Globe
} from 'lucide-react';
import { useCharacter } from '../contexts/CharacterContext';
// Remove View import if no longer needed elsewhere
// import { View } from '../types/navigation';
import DropdownMenu from './DropDownMenu';
import ImagePreview from './ImagePreview';
import TokenCounter from './TokenCounter';
import logo from '../assets/cardshark_justfin.png';

const NAV_ICONS = {
  gallery: FolderOpen,
  info: FileText,
  messages: MessageSquare,
  lore: Book,
  chat: MessageCircle,
  settings: SettingsIcon,
  worldcards: Globe
} as const;

interface SideNavProps {
  // Remove props related to internal view state management
  // currentView: View;
  // onViewChange: (view: View) => void;
  onFileUpload: () => void;
  onUrlImport: () => void;
  onSave: () => void;
  onShowAbout: () => void;
  backendStatus: 'running' | 'disconnected';
  onImageChange?: (newImageData: string | File) => void;
}

const SideNav: React.FC<SideNavProps> = ({
  // Remove props from destructuring
  // currentView,
  // onViewChange,
  onFileUpload,
  onUrlImport,
  onSave,
  onShowAbout,
  backendStatus,
  onImageChange
}) => {
  const { characterData, imageUrl } = useCharacter();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={`relative bg-stone-950 shrink-0 flex flex-col border-r border-stone-800 transition-all duration-300 
      ${isCollapsed ? 'w-20' : 'w-96'}`}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-6 w-6 h-12 bg-stone-800 rounded-full flex items-center justify-center
                   hover:bg-stone-700 transition-colors z-10"
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-gray-300" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-gray-300" />
        )}
      </button>

      {/* Main Content */}
      <div className="p-6 flex flex-col h-full">
        {isCollapsed ? (
          // Collapsed Layout - Everything in a single centered column
          <div className="flex flex-col items-center space-y-6">
            {/* Logo */}
            <div className="flex items-center justify-center w-10">
              <img src={logo} alt="CardShark Logo" className="w-5 h-6" />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col items-center space-y-2">
              <button
                onClick={onFileUpload}
                className="w-10 h-10 bg-orange-700 rounded-lg flex items-center justify-center hover:bg-orange-600 transition-colors"
                title="Load PNG"
              >
                <ImagePlus size={20} />
              </button>
              <button
                onClick={onUrlImport}
                className="w-10 h-10 bg-orange-700/80 rounded-lg flex items-center justify-center hover:bg-orange-600 transition-colors"
                title="Import from URL"
              >
                <Link size={20} />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex flex-col items-center space-y-2 w-10">
              {/* Replace NavButton with NavLink */}
              <NavLinkHelper isCollapsed={isCollapsed} to="/gallery" label="Character Folder" Icon={NAV_ICONS.gallery} />
              <NavLinkHelper isCollapsed={isCollapsed} to="/info" label="Basic Info & Greetings" Icon={NAV_ICONS.info} />
              <NavLinkHelper isCollapsed={isCollapsed} to="/lore" label="Lore Manager" Icon={NAV_ICONS.lore} />
              <NavLinkHelper isCollapsed={isCollapsed} to="/chat" label="Chat" Icon={NAV_ICONS.chat} />
              <NavLinkHelper isCollapsed={isCollapsed} to="/worldcards" label="Worlds" Icon={NAV_ICONS.worldcards} />
              <NavLinkHelper isCollapsed={isCollapsed} to="/settings" label="Settings" Icon={NAV_ICONS.settings} />

              {/* Divider and Save Button */}
              <div className="w-8 border-t border-stone-800 my-2" />
              {/* Save button remains a regular button */}
              <button
                onClick={onSave}
                className="w-10 h-10 bg-purple-700 rounded-lg flex items-center justify-center hover:bg-purple-600 transition-colors"
                title="Save PNG"
              >
                <Save size={20} className="text-white" />
              </button>
            </nav>
          </div>
        ) : (
          // Expanded Layout
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <img src={logo} alt="CardShark Logo" className="w-5 h-6" />
                <span className="text-orange-500 text-xl">CardShark</span>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu
                  icon={ImagePlus}
                  title="Import character from PNG or URL"
                  items={[
                    { icon: ImagePlus, label: "Load PNG", onClick: onFileUpload },
                    { icon: Link, label: "Import by URL", onClick: onUrlImport }
                  ]}
                  buttonClassName="w-10 h-10 bg-orange-700 rounded-lg flex items-center justify-center hover:bg-orange-600 transition-colors"
                />
                <button
                  onClick={onSave}
                  className="w-10 h-10 bg-purple-700 rounded-lg flex items-center justify-center hover:bg-purple-600 transition-colors"
                  title="Save PNG"
                >
                  <Save size={20} />
                </button>
              </div>
            </div>

            {/* Navigation */}
            <nav className="space-y-2">
              {/* Replace NavButton with NavLink */}
              <NavLinkHelper isCollapsed={isCollapsed} to="/gallery" label="Character Folder" Icon={NAV_ICONS.gallery} />
              <NavLinkHelper isCollapsed={isCollapsed} to="/info" label="Basic Info & Greetings" Icon={NAV_ICONS.info} />
              <NavLinkHelper isCollapsed={isCollapsed} to="/lore" label="Lore" Icon={NAV_ICONS.lore} />
              <NavLinkHelper isCollapsed={isCollapsed} to="/chat" label="Chat" Icon={NAV_ICONS.chat} />
              <NavLinkHelper isCollapsed={isCollapsed} to="/worldcards" label="Worlds" Icon={NAV_ICONS.worldcards} />
              <NavLinkHelper isCollapsed={isCollapsed} to="/settings" label="Settings" Icon={NAV_ICONS.settings} />
            </nav>

            {/* Image Preview and Footer */}
            <div className="mt-auto">
              <div className="flex flex-col h-[64vh]">
                <div className="flex-1 min-h-0">
                  <ImagePreview 
                    imageUrl={imageUrl} 
                    onImageChange={onImageChange}
                  />
                </div>
                <TokenCounter characterData={characterData} />
              </div>
              <div className="mt-4 text-xs text-gray-500 flex justify-between items-center">
                <div>
                  Backend: {backendStatus === "running" ? "Connected" : "Disconnected"}
                </div>
                <button
                  onClick={onShowAbout}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                  About
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Helper component using NavLink
const NavLinkHelper: React.FC<{
  isCollapsed: boolean;
  to: string;
  label: string;
  Icon: React.ElementType; // Lucide icon component
}> = ({ isCollapsed, to, label, Icon }) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `w-full px-4 py-2 rounded-lg transition-colors flex items-center gap-3
         ${isActive
           ? "bg-stone-800 text-white"
           : "text-gray-300 hover:text-white hover:bg-stone-700"
         }
         ${isCollapsed ? "justify-center w-10 !px-0" : ""}`
      }
      aria-label={label}
      title={label}
      end // Use 'end' prop for exact matching on index routes like gallery if needed
    >
      <Icon className="w-5 h-5" />
      {!isCollapsed && <span>{label}</span>}
    </NavLink>
  );
};

export default SideNav;