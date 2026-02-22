/**
 * Cell Action Menu Component
 * Context menu for grid cells in World Builder
 * @dependencies lucide-react
 */
import React from 'react';
import { Plus, Upload, Edit, Trash2, X } from 'lucide-react';
import Button from '../common/Button';

interface CellActionMenuProps {
  position: { x: number; y: number }; // Screen coordinates
  isOccupied: boolean; // Whether cell has a room assigned
  onCreateNew: () => void;
  onImportFromGallery: () => void;
  onEdit?: () => void; // Only shown if occupied
  onRemove?: () => void; // Only shown if occupied
  onClose: () => void;
}

export const CellActionMenu: React.FC<CellActionMenuProps> = ({
  position,
  isOccupied,
  onCreateNew,
  onImportFromGallery,
  onEdit,
  onRemove,
  onClose,
}) => {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Menu */}
      <div
        className="fixed z-50 bg-stone-800 border border-stone-700 rounded-lg shadow-2xl min-w-[200px] py-2"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
      >
        {/* Header */}
        <div className="px-4 py-2 border-b border-stone-700 flex items-center justify-between">
          <span className="text-sm font-medium text-stone-300">
            {isOccupied ? 'Room Actions' : 'Add Room'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            icon={<X className="w-3 h-3" />}
          />
        </div>

        {/* Actions */}
        <div className="py-1">
          {!isOccupied ? (
            <>
              {/* Create New Room */}
              <button
                onClick={() => {
                  onCreateNew();
                  onClose();
                }}
                className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-stone-700 transition-colors group"
              >
                <Plus className="w-4 h-4 text-green-400 group-hover:text-green-300" />
                <div>
                  <div className="text-sm font-medium text-white group-hover:text-green-300">
                    Create New Room
                  </div>
                  <div className="text-xs text-stone-400">
                    Design a new room card
                  </div>
                </div>
              </button>

              {/* Import from Gallery */}
              <button
                onClick={() => {
                  onImportFromGallery();
                  onClose();
                }}
                className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-stone-700 transition-colors group"
              >
                <Upload className="w-4 h-4 text-purple-400 group-hover:text-purple-300" />
                <div>
                  <div className="text-sm font-medium text-white group-hover:text-purple-300">
                    Import from Gallery
                  </div>
                  <div className="text-xs text-stone-400">
                    Use an existing room card
                  </div>
                </div>
              </button>
            </>
          ) : (
            <>
              {/* Edit Room */}
              {onEdit && (
                <button
                  onClick={() => {
                    onEdit();
                    onClose();
                  }}
                  className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-stone-700 transition-colors group"
                >
                  <Edit className="w-4 h-4 text-blue-400 group-hover:text-blue-300" />
                  <div>
                    <div className="text-sm font-medium text-white group-hover:text-blue-300">
                      Edit Room
                    </div>
                    <div className="text-xs text-stone-400">
                      Modify room properties
                    </div>
                  </div>
                </button>
              )}

              {/* Remove from Cell */}
              {onRemove && (
                <>
                  <div className="my-1 border-t border-stone-700" />
                  <button
                    onClick={() => {
                      onRemove();
                      onClose();
                    }}
                    className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-stone-700 transition-colors group"
                  >
                    <Trash2 className="w-4 h-4 text-red-400 group-hover:text-red-300" />
                    <div>
                      <div className="text-sm font-medium text-white group-hover:text-red-300">
                        Remove from Cell
                      </div>
                      <div className="text-xs text-stone-400">
                        Unassign (doesn't delete room)
                      </div>
                    </div>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default CellActionMenu;
