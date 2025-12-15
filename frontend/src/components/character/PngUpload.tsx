import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import CharacterPreview from './CharacterPreview';
import { NewCharacterDialog } from './NewCharacterDialog';
import { CharacterCard, createEmptyCharacterCard } from '../../types/schema';
import { generateUUID } from '../../utils/uuidUtils';

export interface NewCharacterDialogProps {
  isOpen: boolean;
  onDiscard: () => void;
  onNewCharacter: () => void;
}

const PngUpload: React.FC = () => {
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [filename, setFilename] = useState<string>('');
  const [characterData, setCharacterData] = useState<CharacterCard | null>(null);
  const [showNewCharacterDialog, setShowNewCharacterDialog] = useState<boolean>(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.type.includes('png')) {
      setStatus('Please select a PNG file');
      return;
    }
    
    try {
      setIsLoading(true);
      setFilename(file.name);
      
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
          setCurrentFile(file);
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
  };  const handleNewCharacter = () => {
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
    <div>
      <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg">
        <div className="flex items-center mb-4">
          <Upload className={`w-6 h-6 mr-2 ${isLoading ? 'animate-bounce' : ''}`} />
          <label 
            htmlFor="png-upload" 
            className="text-lg font-medium cursor-pointer hover:text-blue-600 transition-colors"
          >
            {isLoading ? 'Uploading...' : 'Upload PNG'}
          </label>
        </div>
        
        <input
          id="png-upload"
          type="file"
          accept=".png"
          onChange={handleFileUpload}
          className="hidden"
        />
        
        {filename && (
          <p className="text-sm text-gray-600 mb-2">
            File: {filename}
          </p>
        )}
        
        {status && (
          <p className={`mt-2 text-sm ${
            status.includes('Error') 
              ? 'text-red-500' 
              : status.includes('success') || status.includes('found')
                ? 'text-green-500'
                : 'text-blue-500'
          }`}>
            {status}
          </p>
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