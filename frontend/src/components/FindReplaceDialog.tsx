import React, { useState, useEffect } from 'react';
import { Dialog } from './Dialog';
import { CharacterCard } from '../types/schema';

interface FindReplaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  characterData: CharacterCard | null;
  onReplace: (updates: CharacterCard) => void;
}

export const FindReplaceDialog: React.FC<FindReplaceDialogProps> = ({
  isOpen,
  onClose,
  characterData,
  onReplace
}) => {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchCount, setMatchCount] = useState(0);

  // Fields to search within
  const searchableFields = [
    'name',
    'description',
    'personality',
    'scenario',
    'first_mes',
    'mes_example',
    'system_prompt',
    'post_history_instructions'
  ] as const;

  // Update match count whenever search text or case sensitivity changes
  useEffect(() => {
    if (!characterData || !findText) {
      setMatchCount(0);
      return;
    }

    let count = 0;
    const searchText = caseSensitive ? findText : findText.toLowerCase();

    searchableFields.forEach(field => {
      const text = characterData.data[field];
      if (typeof text === 'string') {
        const searchIn = caseSensitive ? text : text.toLowerCase();
        const matches = searchIn.split(searchText).length - 1;
        count += matches;
      }
    });

    setMatchCount(count);
  }, [findText, caseSensitive, characterData]);

  const handleReplaceAll = () => {
    if (!characterData || !findText) return;

    const updatedData = { ...characterData };

    searchableFields.forEach(field => {
      const text = updatedData.data[field];
      if (typeof text === 'string') {
        if (caseSensitive) {
          updatedData.data[field] = text.split(findText).join(replaceText);
        } else {
          // Case-insensitive replace while preserving case
          const parts = text.split(new RegExp(findText, 'i'));
          updatedData.data[field] = parts.join(replaceText);
        }
      }
    });

    onReplace(updatedData);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Find and Replace"
      buttons={[
        {
          label: 'Cancel',
          onClick: onClose
        },
        {
          label: `Replace All (${matchCount})`,
          onClick: matchCount > 0 ? handleReplaceAll : () => {},
          variant: matchCount > 0 ? 'primary' : 'secondary'
        }
      ]}
      showCloseButton={false}
    >
      <div className="w-full space-y-4">
        {/* Find field */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Find
          </label>
          <input
            type="text"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            className="w-full px-3 py-2 bg-stone-950 border border-slate-700 
                     rounded-lg focus:ring-1 focus:ring-blue-500"
            placeholder="Text to find..."
            autoFocus
          />
        </div>

        {/* Replace field */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Replace
          </label>
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            className="w-full px-3 py-2 bg-stone-950 border border-slate-700 
                     rounded-lg focus:ring-1 focus:ring-blue-500"
            placeholder="Replace with..."
          />
        </div>

        {/* Case sensitivity toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="form-checkbox h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-gray-300">
            Case sensitive
          </span>
        </label>

        {/* Match count display */}
        {findText && (
          <div className="text-sm text-gray-400">
            {matchCount === 0 ? (
              'No matches found'
            ) : (
              `Found ${matchCount} match${matchCount === 1 ? '' : 'es'}`
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
};