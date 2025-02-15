import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import CharacterPreview from './CharacterPreview';
import { NewCharacterDialog } from './NewCharacterDialog';

export interface NewCharacterDialogProps {
  isOpen: boolean;
  onDiscard: () => void;
  onNewCharacter: () => void;
}

const PngUpload: React.FC = () => {
  const [status, setStatus] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [filename, setFilename] = useState<string>('');
  const [characterData, setCharacterData] = useState<any>(null);
  const [showNewCharacterDialog, setShowNewCharacterDialog] = useState<boolean>(false);
  const [, setCurrentFile] = useState<File | null>(null);
  
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
      
      const response = await fetch('/api/upload-png', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setCharacterData(data.metadata);
        if (data.is_new) {
          setStatus('Created new character from image');
        } else {
          setStatus('Loaded existing character data');
        }
      } else {
        throw new Error(data.message || 'Upload failed');
      }
    } catch (error) {
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    // Create new empty character
    const emptyCharacter = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "",
        description: "",
        personality: "",
        first_mes: "",
        mes_example: "",
        scenario: "",
        creator_notes: "",
        system_prompt: "",
        post_history_instructions: "",
        alternate_greetings: [],
        tags: [],
        creator: "",
        character_version: "",
        extensions: {}
      }
    };

    setCharacterData(emptyCharacter);
    setStatus('New character created');
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

      <CharacterPreview data={characterData} />

      <NewCharacterDialog 
        isOpen={showNewCharacterDialog}
        onDiscard={handleDiscard}
        onNewCharacter={handleNewCharacter}
      />
    </div>
  );
};

export default PngUpload;