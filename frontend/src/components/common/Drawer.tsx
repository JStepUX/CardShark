import React from "react";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  widthClass?: string; // e.g. "w-96" or "w-[400px]"
}

const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, children, title, widthClass = "w-96" }) => {
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        aria-hidden="true"
        onClick={onClose}
      />
      {/* Drawer Panel */}
      <aside
        className={`fixed top-0 right-0 h-full ${widthClass} bg-white dark:bg-stone-900 shadow-xl z-50 transform transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-700">
          {title && <h2 className="heading-primary dark:text-stone-100">{title}</h2>}
          <button
            className="p-2 rounded hover:bg-stone-100 dark:hover:bg-stone-800 focus:outline-none"
            onClick={onClose}
            aria-label="Close drawer"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-64px)] px-6 py-4">
          {children}
        </div>
      </aside>
    </>
  );
};

export default Drawer;
