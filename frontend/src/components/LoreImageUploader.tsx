import React, { useState, ChangeEvent } from 'react';
import { UploadCloud, Link, X } from 'lucide-react';
import { characterInventoryService } from '../services/characterInventoryService';

interface LoreImageUploaderProps {
  loreEntryId: string; // or number, depending on your LoreEntry ID type
  characterUuid: string | null; // UUID of the current character, can be null
  characterFallbackId?: string; // Fallback ID if UUID is not available
  currentImageUrl?: string | null; // Optional current image URL to display/remove
  onImageUploaded: (loreEntryId: string, imageUuid: string, imagePath?: string) => void;
  onImageRemoved: (loreEntryId: string) => void;
  onClose: () => void;
}

const LoreImageUploader: React.FC<LoreImageUploaderProps> = (props) => {
  const {
    loreEntryId,
    characterUuid,
    characterFallbackId,
    currentImageUrl,
    onImageUploaded,
    onImageRemoved,
    onClose,
  } = props;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImageUrl(''); // Clear URL input if file is selected
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  const handleUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newUrl = event.target.value;
    setImageUrl(newUrl);
    setSelectedFile(null); // Clear file input if URL is typed
    if (newUrl) {
      setPreviewUrl(newUrl); // Optimistically set preview for URL
    } else {
      setPreviewUrl(null);
    }
    setError(null);
  };  const handleSubmit = async () => {
    if (!selectedFile && !imageUrl) {
      setError('Please select a file or enter an image URL.');
            return;
    }
    
    // Character UUID is now strictly required by the service
    if (!characterUuid) {
      setError('Character UUID is not available. Cannot upload image. Please ensure the character is saved to obtain a UUID.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let response;
      if (selectedFile) {
        response = await characterInventoryService.uploadLoreImage(
          characterUuid, // Now guaranteed to be a string
          loreEntryId,
          selectedFile,
          characterFallbackId // Optional, last argument
        );
      } else if (imageUrl) {
        response = await characterInventoryService.importLoreImageFromUrl(
          characterUuid, // Now guaranteed to be a string
          loreEntryId,
          imageUrl,
          characterFallbackId // Optional, last argument
        );
      } else {
        throw new Error('No image source selected.');
      }

      // Backend returns DataResponse structure: { success: bool, data: {...} }
      if (response && response.success && response.data) {
        const { image_uuid, image_path } = response.data;
        if (image_uuid) {
          onImageUploaded(loreEntryId, image_uuid, image_path);
          onClose();
        } else {
          throw new Error(response.data.message || 'Failed to upload image: missing image_uuid in response.');
        }
      } else {
        throw new Error(response?.data?.message || response?.message || 'Failed to upload image.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      console.error('Image upload failed:', err);
    } finally {
      setIsLoading(false);
    }
  };
  const handleRemoveImage = async () => {
    if (!currentImageUrl) {
      setError('No image to remove.');
      return;
    }
    
    // Character UUID is now strictly required by the service
    if (!characterUuid) {
      setError('Character UUID is not available. Cannot remove image. Please ensure the character is saved to obtain a UUID.');
      return;
    }
    
    // Assuming currentImageUrl contains the image_uuid or filename needed for deletion
    // Example: /uploads/lore_images/char_uuid/image_uuid_timestamp.png
    // We need to extract the `image_uuid_timestamp.png` part
    const filename = new URL(currentImageUrl, window.location.href).pathname.split('/').pop() ?? '';

    if (!filename) {
      setError('Could not determine filename from current image URL.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Call API to delete image using the character inventory service
      // characterFallbackId is no longer part of deleteLoreImage signature in the service
      await characterInventoryService.deleteLoreImage(
        characterUuid, // Now guaranteed to be a string
        filename
      );
      
      // Call parent's callback
      onImageRemoved(loreEntryId);
      setPreviewUrl(null); // Clear preview
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      console.error('Image removal failed:', err);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-stone-800 p-6 rounded-lg shadow-xl w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-200"
          aria-label="Close"
        >
          <X size={24} />
        </button>
        <h3 className="text-xl font-semibold mb-4 text-white">Add/Change Lore Image</h3>        {!characterUuid && (
          <p className="text-yellow-400 bg-yellow-900/30 p-2 rounded mb-3 text-sm">
            A Character UUID is required to associate images. This is currently missing. Please ensure the character is fully saved to obtain a UUID.
          </p>
        )}
        {error && <p className="text-red-400 bg-red-900/30 p-2 rounded mb-3 text-sm">{error}</p>}

        <div className="space-y-4">
          {/* File Upload */}
          <div>
            <label
              htmlFor="lore-image-upload"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Upload from computer
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md hover:border-gray-500 transition-colors cursor-pointer">
              <div className="space-y-1 text-center">
                <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-500">
                  <label
                    htmlFor="lore-image-upload-input"
                    className="relative cursor-pointer bg-stone-700 rounded-md font-medium text-indigo-400 hover:text-indigo-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-stone-800 focus-within:ring-indigo-500 px-2 py-1"
                  >
                    <span>Upload a file</span>
                    <input
                      id="lore-image-upload-input"
                      name="lore-image-upload"
                      type="file"
                      className="sr-only"
                      accept="image/png, image/jpeg, image/webp, image/gif"
                      onChange={handleFileChange}
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">PNG, JPG, GIF, WEBP up to 10MB</p>
              </div>
            </div>
            {selectedFile && (
              <p className="text-xs text-green-400 mt-1">Selected: {selectedFile.name}</p>
            )}
          </div>

          {/* URL Input */}
          <div>
            <label htmlFor="lore-image-url" className="block text-sm font-medium text-gray-300">
              Or import from URL
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Link className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </div>
              <input
                type="text"
                name="lore-image-url"
                id="lore-image-url"
                className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-600 bg-stone-700 text-white rounded-md py-2"
                placeholder="https://example.com/image.png"
                value={imageUrl}
                onChange={handleUrlChange}
              />
            </div>
          </div>

          {/* Image Preview */}
          {previewUrl && (
            <div className="mt-4">
              <p className="text-sm text-gray-400 mb-1">Preview:</p>
              <img
                src={previewUrl}
                alt="Preview"
                className="rounded-md max-h-48 w-auto mx-auto border border-gray-600"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'; // Hide if broken
                  setError('Could not load preview from URL. Please check the link.');
                }}
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row-reverse gap-3">          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || (!selectedFile && !imageUrl) || !characterUuid}
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-stone-800 focus:ring-indigo-500 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title={!characterUuid ? "Character UUID not available. Please save the character." : ""}
          >
            {isLoading ? 'Processing...' : 'Confirm & Save Image'}
          </button>
          {currentImageUrl && (
             <button
                type="button"
                onClick={handleRemoveImage}
                disabled={isLoading || !characterUuid}
                className="w-full inline-flex justify-center rounded-md border border-red-500 shadow-sm px-4 py-2 bg-red-700 text-base font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-stone-800 focus:ring-red-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50"
                title={!characterUuid ? "Character UUID not available. Please save the character." : ""}
            >
                {isLoading ? 'Removing...' : 'Remove Current Image'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-600 shadow-sm px-4 py-2 bg-stone-700 text-base font-medium text-gray-300 hover:bg-stone-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-stone-800 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoreImageUploader;