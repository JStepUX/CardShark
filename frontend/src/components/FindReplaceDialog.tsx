import React, { useState, useEffect } from 'react';
import { Dialog } from './common/Dialog';
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

    // Search flat fields
    searchableFields.forEach(field => {
      const text = characterData.data[field];
      if (typeof text === 'string') {
        // Always do a direct substring search, ignoring any quotes or formatting
        const searchIn = caseSensitive ? text : text.toLowerCase();
        const matches = searchIn.split(searchText).length - 1;
        count += matches;
      }
    });

    // Search alternate_greetings (array of strings)
    if (Array.isArray(characterData.data.alternate_greetings)) {
      characterData.data.alternate_greetings.forEach((greeting: string) => {
        if (typeof greeting === 'string') {
          const searchIn = caseSensitive ? greeting : greeting.toLowerCase();
          const matches = searchIn.split(searchText).length - 1;
          count += matches;
        }
      });
    }

    // Search group_only_greetings (array of strings)
    if (Array.isArray(characterData.data.group_only_greetings)) {
      characterData.data.group_only_greetings.forEach((greeting: string) => {
        if (typeof greeting === 'string') {
          const searchIn = caseSensitive ? greeting : greeting.toLowerCase();
          const matches = searchIn.split(searchText).length - 1;
          count += matches;
        }
      });
    }

    // Search character_book.entries (array of lore objects with 'content')
    if (characterData.data.character_book && Array.isArray(characterData.data.character_book.entries)) {
      characterData.data.character_book.entries.forEach((entry: any) => {
        if (entry && typeof entry.content === 'string') {
          const searchIn = caseSensitive ? entry.content : entry.content.toLowerCase();
          const matches = searchIn.split(searchText).length - 1;
          count += matches;
        }
      });
    }

    setMatchCount(count);
  }, [findText, caseSensitive, characterData]);

  const handleReplaceAll = () => {
    if (!characterData || !findText) return;

    const updatedData = { ...characterData };

    // Replace in flat fields
    searchableFields.forEach(field => {
      const text = updatedData.data[field];
      if (typeof text === 'string') {
        if (caseSensitive) {
          updatedData.data[field] = text.split(findText).join(replaceText);
        } else {
          const regex = new RegExp(findText, 'gi');
          updatedData.data[field] = text.replace(regex, replaceText);
        }
      }
    });

    // Replace in alternate_greetings
    if (Array.isArray(updatedData.data.alternate_greetings)) {
      updatedData.data.alternate_greetings = updatedData.data.alternate_greetings.map((greeting: string) => {
        if (typeof greeting === 'string') {
          if (caseSensitive) {
            return greeting.split(findText).join(replaceText);
          } else {
            const regex = new RegExp(findText, 'gi');
            return greeting.replace(regex, replaceText);
          }
        }
        return greeting;
      });
    }

    // Replace in group_only_greetings
    if (Array.isArray(updatedData.data.group_only_greetings)) {
      updatedData.data.group_only_greetings = updatedData.data.group_only_greetings.map((greeting: string) => {
        if (typeof greeting === 'string') {
          if (caseSensitive) {
            return greeting.split(findText).join(replaceText);
          } else {
            const regex = new RegExp(findText, 'gi');
            return greeting.replace(regex, replaceText);
          }
        }
        return greeting;
      });
    }

    // Replace in character_book.entries
    if (updatedData.data.character_book && Array.isArray(updatedData.data.character_book.entries)) {
      updatedData.data.character_book.entries = updatedData.data.character_book.entries.map((entry: any) => {
        if (entry && typeof entry.content === 'string') {
          if (caseSensitive) {
            return { ...entry, content: entry.content.split(findText).join(replaceText) };
          } else {
            const regex = new RegExp(findText, 'gi');
            return { ...entry, content: entry.content.replace(regex, replaceText) };
          }
        }
        return entry;
      });
    }

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
          onClick: matchCount > 0 ? handleReplaceAll : () => { },
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
            className="w-full px-3 py-2 bg-stone-950 border border-stone-700 
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
            className="w-full px-3 py-2 bg-stone-950 border border-stone-700 
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