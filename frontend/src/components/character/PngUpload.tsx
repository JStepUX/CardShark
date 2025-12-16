import React, { useState } from 'react';
import { toast } from 'sonner';
import CharacterPreview from './CharacterPreview';
import { NewCharacterDialog } from './NewCharacterDialog';
import { CharacterCard, createEmptyCharacterCard } from '../../types/schema';
import { generateUUID } from '../../utils/uuidUtils';
import { ImageUploader } from '../media/ImageUploader';

export interface NewCharacterDialogProps {
  isOpen: boolean;
  onDiscard: () => void;
  onNewCharacter: () => void;
}

const PngUpload: React.FC = () => {
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [characterData, setCharacterData] = useState<CharacterCard | null>(null);
  const [showNewCharacterDialog, setShowNewCharacterDialog] = useState<boolean>(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    // Safety check just in case validator missed it (ImageUploader handles this though)
    if (!file.type.includes('png')) {
      setStatus('Please select a PNG file');
      return;
    }

    try {
      setIsLoading(true);
      setCurrentFile(file);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/characters/extract-metadata', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        const metadata = data.metadata;

        // Check if the PNG contains character metadata
        if (!metadata || Object.keys(metadata).length === 0 || !metadata.data) {
          // No character metadata found - offer to create new character
          setStatus('No character data found in PNG. Would you like to create a new character?');
          setShowNewCharacterDialog(true);
          toast.info('No character metadata found in this PNG. You can create a new character instead.');
        } else {
          // Character metadata found - process normally
          setCharacterData(metadata);
          if (data.is_new) {
            setStatus('Created new character from image');
            toast.success('Created new character from image!');
          } else {
            setStatus('Loaded existing character data');
            toast.success('Loaded existing character data from image!');
          }
        }
      } else {
        const errorMsg = data.message || 'Upload failed';
        toast.error(`PNG Upload failed: ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Error: ${errorMsg}`);
      toast.error(`PNG Upload error: ${errorMsg}`);
      console.error('Upload error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscard = () => {
    setShowNewCharacterDialog(false);
    setCurrentFile(null);
    setStatus('Operation cancelled');
  };

  const handleNewCharacter = () => {
    // Create new empty character using the helper function
    const emptyCharacter = createEmptyCharacterCard();

    // Add UUID for new character
    emptyCharacter.data.character_uuid = generateUUID();

    setCharacterData(emptyCharacter);
    setStatus('New character template created. Fill in details and save.');
    toast.success('New character template created. Please fill in the details.');
    setShowNewCharacterDialog(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-stone-900/50 p-6 rounded-xl border border-stone-800">
        <h3 className="text-lg font-medium text-stone-300 mb-4">Import Character</h3>

        <ImageUploader
          onFileSelect={handleFileSelect}
          acceptedTypes={['image/png']}
          label="Upload PNG Character Card"
          isLoading={isLoading}
          className="bg-stone-900"
        />

        {status && (
          <div className={`mt-4 p-3 rounded-lg text-sm border ${status.includes('Error')
              ? 'bg-red-900/20 border-red-900/50 text-red-300'
              : status.includes('success') || status.includes('found') || status.includes('Loaded') || status.includes('Created')
                ? 'bg-green-900/20 border-green-900/50 text-green-300'
                : 'bg-blue-900/20 border-blue-900/50 text-blue-300'
            }`}>
            {status}
          </div>
        )}
      </div>

      <CharacterPreview data={characterData} imageFile={currentFile} />

      <NewCharacterDialog
        isOpen={showNewCharacterDialog}
        onDiscard={handleDiscard}
        onNewCharacter={handleNewCharacter}
      />
    </div>
  );
};

export default PngUpload;