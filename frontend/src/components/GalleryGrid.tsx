// frontend/src/components/GalleryGrid.tsx
import React from "react";

interface GalleryGridProps<T> {
  items: T[];
  renderItem: (item: T, idx: number) => React.ReactNode;
  emptyMessage?: string;
  className?: string;
  columns?: number; // Optional fixed column count
}

function GalleryGrid<T>({ items, renderItem, emptyMessage, className, columns }: GalleryGridProps<T>) {
  if (!items.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
        {emptyMessage || "No items found."}
      </div>
    );
  }
  const gridClass = columns
    ? `grid grid-cols-${columns} gap-6 px-6 pt-6 ${className || ""}`
    : `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-6 px-6 pt-6 ${className || ""}`;
  return (
    <div className={gridClass}>
      {items.map((item, idx) => renderItem(item, idx))}
    </div>
  );
}

export default GalleryGrid;
