import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  FolderOpen,
  History,
  Settings as SettingsIcon,
} from 'lucide-react';
import usePrefetchRoute from '../hooks/usePrefetchRoute';
import logo from '../assets/cardshark_justfin.png';

// Route component imports for prefetching
const importCharacterGallery = () => import('./character/CharacterGallery');
const importChatHistoryView = () => import('./history/ChatHistoryView');
const importAPISettingsView = () => import('./settings/APISettingsView');

const ROUTE_IMPORTS: Record<string, () => Promise<unknown>> = {
  '/gallery': importCharacterGallery,
  '/history': importChatHistoryView,
  '/settings': importAPISettingsView,
};

const NAV_ITEMS = [
  { to: '/gallery', label: 'Gallery', Icon: FolderOpen },
  { to: '/history', label: 'History', Icon: History },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
] as const;

const SideNav: React.FC = () => {
  return (
    <div className="bg-stone-950 shrink-0 flex flex-col items-center w-16 border-r border-stone-800 py-4 z-40">
      {/* Logo — navigates to gallery */}
      <NavLink
        to="/gallery"
        className="mb-6 flex items-center justify-center w-10 h-10 rounded-lg hover:bg-stone-800 transition-colors"
        title="CardShark Home"
      >
        <img src={logo} alt="CardShark" className="w-5 h-6" />
      </NavLink>

      {/* Navigation icons */}
      <nav className="flex flex-col items-center gap-2">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <RailLink key={to} to={to} label={label} Icon={Icon} />
        ))}
      </nav>
    </div>
  );
};

const RailLink: React.FC<{
  to: string;
  label: string;
  Icon: React.ElementType;
}> = ({ to, label, Icon }) => {
  const prefetchHandlers = usePrefetchRoute(ROUTE_IMPORTS[to] || (() => Promise.resolve()));

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
          isActive
            ? 'bg-stone-800 text-white'
            : 'text-stone-400 hover:text-white hover:bg-stone-800'
        }`
      }
      aria-label={label}
      title={label}
      {...prefetchHandlers}
    >
      <Icon className="w-5 h-5" />
    </NavLink>
  );
};

export default SideNav;
