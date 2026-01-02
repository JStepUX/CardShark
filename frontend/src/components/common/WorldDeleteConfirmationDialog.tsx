import React, { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, DoorOpen } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { Dialog } from './Dialog';
import { worldApi } from '../../api/worldApi';
import { WorldDeletePreview } from '../../types/worldCard';

interface WorldDeleteConfirmationDialogProps {
  isOpen: boolean;
  worldUuid: string;
  worldName: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: (deleteRooms: boolean) => void;
}

/**
 * A specialized confirmation dialog for world deletion
 * Shows a preview of which rooms will be deleted vs kept
 */
const WorldDeleteConfirmationDialog: React.FC<WorldDeleteConfirmationDialogProps> = ({
  isOpen,
  worldUuid,
  worldName,
  isDeleting,
  onCancel,
  onConfirm
}) => {
  const [preview, setPreview] = useState<WorldDeletePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Load preview when dialog opens
  useEffect(() => {
    if (isOpen && worldUuid) {
      setLoadingPreview(true);
      setPreviewError(null);

      worldApi.getDeletePreview(worldUuid)
        .then(data => {
          setPreview(data);
          setLoadingPreview(false);
        })
        .catch(err => {
          setPreviewError(err.message || 'Failed to load preview');
          setLoadingPreview(false);
        });
    } else {
      // Reset state when dialog closes
      setPreview(null);
      setPreviewError(null);
    }
  }, [isOpen, worldUuid]);

  const hasRoomsToDelete = preview && preview.rooms_to_delete.length > 0;
  const hasRoomsToKeep = preview && preview.rooms_to_keep.length > 0;

  const deleteWithRoomsLabel = isDeleting ? (
    <span className="flex items-center gap-2">
      <LoadingSpinner size="sm" />
      Deleting...
    </span>
  ) : (
    `Delete World + ${preview?.rooms_to_delete.length || 0} Room(s)`
  );

  const deleteWorldOnlyLabel = isDeleting ? (
    <span className="flex items-center gap-2">
      <LoadingSpinner size="sm" />
      Deleting...
    </span>
  ) : (
    'Delete World Only'
  );

  // Build buttons based on preview
  const buttons = [];

  buttons.push({
    label: 'Cancel',
    onClick: onCancel,
    variant: 'secondary' as const,
    disabled: isDeleting,
  });

  if (hasRoomsToDelete) {
    // Two options: delete world only, or delete world + rooms
    buttons.push({
      label: deleteWorldOnlyLabel,
      onClick: () => onConfirm(false),
      variant: 'secondary' as const,
      disabled: isDeleting || loadingPreview,
      className: "bg-stone-700 hover:bg-stone-600 text-white",
    });
    buttons.push({
      label: deleteWithRoomsLabel,
      onClick: () => onConfirm(true),
      variant: 'primary' as const,
      disabled: isDeleting || loadingPreview,
      className: "bg-red-700 hover:bg-red-600 text-white disabled:bg-red-700/50 disabled:text-white/70",
    });
  } else {
    // No rooms to delete, just one delete button
    buttons.push({
      label: isDeleting ? (
        <span className="flex items-center gap-2">
          <LoadingSpinner size="sm" />
          Deleting...
        </span>
      ) : 'Delete World',
      onClick: () => onConfirm(false),
      variant: 'primary' as const,
      disabled: isDeleting || loadingPreview,
      className: "bg-red-700 hover:bg-red-600 text-white disabled:bg-red-700/50 disabled:text-white/70",
    });
  }

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title="Delete World"
      buttons={buttons}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        {/* Header with warning icon */}
        <div className="flex items-start gap-4">
          <div className="p-2 bg-red-900/30 rounded-full flex-shrink-0">
            <AlertTriangle className="text-red-500 h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="text-stone-300 mb-2">
              Are you sure you want to delete this world?
            </p>
            <div className="p-3 bg-stone-800 rounded mb-4 border border-stone-700 text-stone-300">
              {worldName}
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loadingPreview && (
          <div className="flex items-center justify-center py-4">
            <LoadingSpinner text="Loading room information..." />
          </div>
        )}

        {/* Error state */}
        {previewError && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
            {previewError}
          </div>
        )}

        {/* Preview content */}
        {preview && !loadingPreview && (
          <div className="space-y-4">
            {/* Rooms to delete */}
            {hasRoomsToDelete && (
              <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3">
                <h4 className="text-red-400 font-medium mb-2 flex items-center gap-2">
                  <Trash2 size={16} />
                  {preview.rooms_to_delete.length} room(s) will be deleted:
                </h4>
                <ul className="space-y-1 max-h-32 overflow-y-auto">
                  {preview.rooms_to_delete.map(room => (
                    <li key={room.uuid} className="flex items-center gap-2 text-sm text-stone-300">
                      <DoorOpen size={14} className="text-red-400 flex-shrink-0" />
                      <span className="truncate">{room.name}</span>
                      <span className="text-stone-500 text-xs">({room.reason})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Rooms to keep */}
            {hasRoomsToKeep && (
              <div className="bg-stone-800/50 border border-stone-700 rounded-lg p-3">
                <h4 className="text-stone-400 font-medium mb-2 flex items-center gap-2">
                  <DoorOpen size={16} />
                  {preview.rooms_to_keep.length} room(s) will be kept:
                </h4>
                <ul className="space-y-1 max-h-32 overflow-y-auto">
                  {preview.rooms_to_keep.map(room => (
                    <li key={room.uuid} className="flex items-center gap-2 text-sm text-stone-400">
                      <DoorOpen size={14} className="text-stone-500 flex-shrink-0" />
                      <span className="truncate">{room.name}</span>
                      <span className="text-stone-500 text-xs">({room.reason})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* No rooms message */}
            {!hasRoomsToDelete && !hasRoomsToKeep && (
              <p className="text-stone-400 text-sm">
                This world has no rooms.
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default WorldDeleteConfirmationDialog;
