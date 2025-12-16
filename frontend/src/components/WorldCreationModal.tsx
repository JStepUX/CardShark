// frontend/src/components/WorldCreationModal.tsx
import React, { useState, useEffect } from 'react';
import { Dialog } from './common/Dialog';
import Button from './common/Button';
import CharacterGallery from './character/CharacterGallery';
import { worldStateApi } from '../utils/worldStateApi';

interface CharacterFile {
  name: string;
  path: string;
  is_incomplete?: boolean;
}

interface WorldCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (worldName: string) => void;
}

const WorldCreationModal: React.FC<WorldCreationModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [worldName, setWorldName] = useState("");
  const [createType, setCreateType] = useState<"empty" | "character">("empty");
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterFile | null>(null);
  const [showCharacterSelector, setShowCharacterSelector] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null); // State for image file
  const [imagePreview, setImagePreview] = useState<string | null>(null); // State for image preview URL

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setWorldName("");
      setCreateType("empty");
      setSelectedCharacter(null);
      setShowCharacterSelector(false);
      setError(null);
      setSelectedImage(null); // Reset image state
      setImagePreview(null); // Reset preview
    }
  }, [isOpen]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/png')) {
      setSelectedImage(file);
      // Create a preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError(null); // Clear previous errors
    } else {
      setSelectedImage(null);
      setImagePreview(null);
      if (file) { // Only show error if a file was selected but wasn't PNG
        setError("Please select a PNG file for the world card.");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!worldName.trim()) {
      setError("World name is required");
      return;
    }

    if (createType === "character" && !selectedCharacter) {
      setError("Please select a character");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await worldStateApi.createWorld(
        worldName,
        createType === "character" ? selectedCharacter?.path : undefined
      );

      if (result.success) {
        const createdWorldName = result.world_name; // Get the actual name used by backend

        // --- Image Upload Step ---
        if (selectedImage) {
          const formData = new FormData();
          formData.append('file', selectedImage);

          try {
            const imageUploadResponse = await fetch(`/api/worlds/${encodeURIComponent(createdWorldName)}/upload-card`, {
              method: 'POST',
              body: formData,
            });

            if (!imageUploadResponse.ok) {
              // Log warning but don't block success if world state created
              console.warn(`World created, but failed to upload card image: ${imageUploadResponse.statusText}`);
              setError(`World created, but image upload failed: ${imageUploadResponse.statusText}`); // Show non-blocking error
            } else {
              console.log(`Successfully uploaded world card image for ${createdWorldName}`);
            }
          } catch (imgErr) {
            console.warn(`World created, but encountered error uploading card image:`, imgErr);
            setError(`World created, but image upload failed: ${imgErr instanceof Error ? imgErr.message : 'Unknown error'}`); // Show non-blocking error
          }
        }
        // --- End Image Upload ---

        onSuccess(createdWorldName); // Call success callback
        onClose(); // Close modal
      } else {
        setError("Failed to create world");
      }
    } catch (err) {
      console.error("Error creating world:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCharacterClick = (character: CharacterFile) => {
    setSelectedCharacter(character);
    setShowCharacterSelector(false);
  };

  // If character selector is shown, render it in a dialog
  if (isOpen && showCharacterSelector) {
    return (
      <Dialog
        isOpen={true}
        onClose={() => setShowCharacterSelector(false)}
        title="Select Character"
        buttons={[]}
        showCloseButton={true}
        className="max-w-4xl h-[80vh]"
      >
        <div className="h-full">
          <CharacterGallery
            onCharacterClick={handleCharacterClick}
            lazyLoad={true}
          />
        </div>
      </Dialog>
    );
  }

  // Main creation modal
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Create New World"
      buttons={[]}
      showCloseButton={false}
      className="max-w-md"
    >
      <form
        className="flex flex-col gap-4 w-full"
        onSubmit={handleSubmit}
      >
        <label className="text-slate-700 dark:text-slate-300">World Name</label>
        <input
          className="input input-bordered w-full dark:bg-stone-800 dark:text-white"
          value={worldName}
          onChange={e => setWorldName(e.target.value)}
          required
          maxLength={64}
          placeholder="Enter a name for your world"
        />

        <div className="mt-2">
          <label className="text-slate-700 dark:text-slate-300 block mb-2">World Type</label>
          <div className="flex space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                checked={createType === "empty"}
                onChange={() => setCreateType("empty")}
                className="radio radio-primary"
              />
              {/* Removed incorrect closing div and moved attributes inside input */}
              <span>Empty World</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                checked={createType === "character"}
                onChange={() => setCreateType("character")}
                className="radio radio-primary"
              />
              <span>Based on Character</span>
            </label>
          </div>
        </div>



        {/* Image Upload Input */}
        <div className="mt-2">
          <label className="text-slate-700 dark:text-slate-300 block mb-2">World Card Image (Optional PNG)</label>
          <input
            type="file"
            accept="image/png"
            onChange={handleImageChange}
            className="file-input file-input-bordered file-input-primary w-full dark:bg-stone-800 dark:text-white"
          />
          {imagePreview && (
            <div className="mt-2 border border-stone-600 rounded p-2 flex justify-center">
              <img src={imagePreview} alt="Preview" className="max-h-40 rounded" />
            </div>
          )}
        </div>

        {createType === "character" && (
          <div className="mt-2">
            <label className="text-slate-700 dark:text-slate-300 block mb-2">Character</label>
            {selectedCharacter ? (
              <div className="flex items-center justify-between p-3 bg-stone-800 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-md overflow-hidden">
                    <img
                      src={`/api/character-image/${encodeURIComponent(selectedCharacter.path)}`}
                      alt={selectedCharacter.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-white">{selectedCharacter.name}</div>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 py-1"
                  onClick={() => setShowCharacterSelector(true)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="md"
                className="w-full bg-blue-600 hover:bg-blue-700 rounded-lg"
                onClick={() => setShowCharacterSelector(true)}
              >
                Select Character
              </Button>
            )}
          </div>
        )}

        {error && (
          <div className="mt-2 p-3 bg-red-900 text-white rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end mt-4">
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="px-6 rounded-lg shadow font-medium bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-stone-700 dark:text-white dark:hover:bg-stone-600"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="px-6 rounded-lg shadow font-medium bg-blue-700 hover:bg-blue-800"
            disabled={loading || (createType === "character" && !selectedCharacter)}
          >
            {loading ? "Creating..." : "Create World"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

export default WorldCreationModal;