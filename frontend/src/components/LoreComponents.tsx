import React, { useState, useEffect } from 'react';
import {
  ChevronUp,
  ChevronDown,
  Settings,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ImagePlus, // For adding image
  FileImage // For displaying thumbnail
} from 'lucide-react';
import { LoreEntry, WorldInfoLogic } from '../types/schema';
import RichTextEditor from './RichTextEditor';
import LoreImageUploader from './LoreImageUploader'; // Import the uploader
import { useCharacter } from '../contexts/CharacterContext'; // To get character UUID
// import { useChat } from '../contexts/ChatContext'; // Import useChat when needed
import { useCharacterUuid } from '../hooks/useCharacterUuid'; // Import UUID hook

interface LoreCardProps {
  item: LoreEntry;
  onDelete: (uid: number) => void;
  onUpdate: (uid: number, updates: Partial<LoreEntry>) => void;
  onMoveUp: (uid: number) => void;
  onMoveDown: (uid: number) => void;
  isFirst: boolean;
  isLast: boolean;
}

export const LoreCard: React.FC<LoreCardProps> = ({
  item,
  onDelete,
  onUpdate,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast
}) => {  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showImageUploader, setShowImageUploader] = useState(false);
  const { characterData } = useCharacter(); // Get character data for UUID  // Chat context will be used in future implementations
  // const chatContext = useChat();
  // const navigateToPreviewImage = chatContext?.navigateToPreviewImage;
  // const availablePreviewImages = chatContext?.availablePreviewImages;
  const { getCharacterUuid, isLoading: isUuidLoading } = useCharacterUuid();
  
  // State for character UUID management
  const [charUuidString, setCharUuidString] = useState<string | null>(
    (characterData && characterData.data && typeof characterData.data.character_uuid === 'string')
      ? characterData.data.character_uuid
      : null
  );

  // Convert array of keys to comma-separated string for editing
  const [primaryKeys, setPrimaryKeys] = useState(
    Array.isArray(item.keys) ? item.keys.join(', ') : ''
  );
  const [secondaryKeys, setSecondaryKeys] = useState(
    Array.isArray(item.secondary_keys) ? item.secondary_keys.join(', ') : ''
  );

  useEffect(() => {
    setPrimaryKeys(Array.isArray(item.keys) ? item.keys.join(', ') : '');
  }, [item.keys]);

  useEffect(() => {
    setSecondaryKeys(Array.isArray(item.secondary_keys) ? item.secondary_keys.join(', ') : '');
  }, [item.secondary_keys]);

  // Initialize character UUID from characterData or fetch it
  useEffect(() => {
    const fetchUuid = async () => {
      if (characterData?.data) {
        // If character already has UUID built-in, use that
        if (characterData.data.character_uuid && typeof characterData.data.character_uuid === 'string') {
          if (charUuidString !== characterData.data.character_uuid) {
            setCharUuidString(characterData.data.character_uuid);
          }
          return;
        }
        
        try {
          // Otherwise use our mapping system to get or generate a UUID          // Use character_uuid if available, otherwise generate a deterministic ID from name
          const characterId = characterData.data.character_uuid || 
                            `name-${encodeURIComponent(characterData.data.name || 'unknown')}`;
          
          const uuid = await getCharacterUuid(characterId, characterData.data.name);
          if (charUuidString !== uuid) {
            setCharUuidString(uuid);
          }
        } catch (error) {
          console.error("Failed to get character UUID:", error);
        }
      }
    };
    
    fetchUuid();
  }, [characterData?.data, getCharacterUuid, charUuidString]);

  // Update handlers
  const handlePrimaryKeysBlur = () => {
    const keys = primaryKeys.split(',').map(k => k.trim()).filter(k => k);
    onUpdate(item.id, { keys: keys });
  };

  const handleSecondaryKeysBlur = () => {
    const keys = secondaryKeys.split(',').map(k => k.trim()).filter(k => k);
    onUpdate(item.id, { secondary_keys: keys });
  };

  const handlePositionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate(item.id, { position: e.target.value });
  };

  const handleImageUploaded = (loreEntryId: string, imageUuid: string) => {
    onUpdate(parseInt(loreEntryId, 10), { has_image: true, image_uuid: imageUuid });
    // imagePath parameter was removed as it was unused.
    // image_uuid is used to construct the path dynamically by the backend or other display components.
  };

  const handleImageRemoved = (loreEntryId: string) => {
    onUpdate(parseInt(loreEntryId, 10), { has_image: false, image_uuid: '' });
  };
  const getFullImagePath = (imageUuid?: string): string | undefined => {
    if (!imageUuid) return undefined;
    
    // If we have a UUID (either built-in or from our mapping), use it
    if (charUuidString) {
      return `/uploads/lore_images/${charUuidString}/${imageUuid}`;
    }
    
    // Fallback for characters without UUID - use a deterministic path based on character name or ID
    const characterIdentifier = characterData?.data?.name || 'unknown';
    const safeIdentifier = encodeURIComponent(characterIdentifier);
    return `/uploads/lore_images/by-name/${safeIdentifier}/${imageUuid}`;
  };

  let loreImageUploaderElement = null;
  if (showImageUploader) {
    // Get character identifier - either UUID or fallback
    const characterFallbackId = characterData?.data?.name ? 
                       `name-${encodeURIComponent(characterData.data.name)}` : 
                       'unknown';
    
    if (isUuidLoading) {
      // Show loading indicator while UUID is being fetched
      loreImageUploaderElement = (
        <div className="p-4 bg-zinc-900/70 rounded-lg mt-2">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-300">Preparing image uploader...</span>
          </div>
        </div>
      );
    } else {
      // UUID is ready or we'll use the fallback
      loreImageUploaderElement = (
        <LoreImageUploader
          loreEntryId={item.id.toString()}
          characterUuid={charUuidString} // Pass UUID if exists
          characterFallbackId={characterFallbackId} // Always pass a fallback ID
          currentImageUrl={item.has_image && item.image_uuid ? getFullImagePath(item.image_uuid) : undefined}
          onImageUploaded={handleImageUploaded}
          onImageRemoved={handleImageRemoved}
          onClose={() => setShowImageUploader(false)}
        />
      );
    }
  }

  return (
    <>
    <div className={`bg-gradient-to-b from-zinc-900 to-stone-950 rounded-lg p-4 mb-4 shadow-lg ${!item.enabled ? 'opacity-60' : ''}`}>
      {/* Top controls row */}
      <div className="flex items-center justify-between gap-4 mb-4">
        {/* Left side controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdate(item.id, { enabled: !item.enabled })}
            className="text-gray-400 hover:text-blue-400 transition-colors"
            title={!item.enabled ? 'Enable' : 'Disable'}
          >
            {!item.enabled ? <ToggleLeft size={20} /> : <ToggleRight size={20} />}
          </button>

          <select
              value={item.position}
              onChange={handlePositionChange}
              className="bg-zinc-950 text-white rounded px-2 py-1 text-sm border border-zinc-800"
            >
              <option value="before_char">Before Character</option>
              <option value="after_char">After Character</option>
              <option value="an_top">Author's Note Top</option>
              <option value="an_bottom">Author's Note Bottom</option>
              <option value="at_depth">@ Depth</option>
              <option value="before_example">Before Examples</option>
              <option value="after_example">After Examples</option>
            </select>
            
            {item.position === 'at_depth' && (
              <>
                <select
                  value={item.extensions?.role || 0}
                  onChange={(e) => onUpdate(item.id, {
                    extensions: { ...(item.extensions || {}), role: parseInt(e.target.value) }
                  })}
                  className="bg-zinc-950 text-white rounded px-2 py-1 text-sm border border-zinc-800"
                >
                  <option value={0}>as System</option>
                  <option value={1}>as User</option>
                  <option value={2}>as Character</option>
                </select>
                <input
                  type="number"
                  value={item.extensions?.depth ?? ''}
                  onChange={(e) => onUpdate(item.id, {
                    extensions: { ...(item.extensions || {}), depth: parseInt(e.target.value) || 0 }
                  })}
                  placeholder="Depth"
                  className="w-20 bg-zinc-950 text-white rounded px-2 py-1 text-sm border border-zinc-800"
                  min="0"
                />
              </>
            )}
          </div>

        {/* Right side controls */}
        <div className="flex items-center gap-1">
           {/* Image Add/Remove Button */}
           <button
            onClick={() => setShowImageUploader(true)}
            className="p-1 text-gray-400 hover:text-green-400 hover:bg-gray-800 rounded"
            title={item.has_image ? "Change/Remove Image" : "Add Image"}
          >
            {item.has_image ? <FileImage size={18} /> : <ImagePlus size={18} />}
          </button>

          <button
            onClick={() => onMoveUp(item.id)}
            disabled={isFirst}
            className={`p-1 rounded ${isFirst ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-400 hover:bg-gray-800'}`}
            title="Move up"
          >
            <ChevronUp size={18} />
          </button>

          <button
            onClick={() => onMoveDown(item.id)}
            disabled={isLast}
            className={`p-1 rounded ${isLast ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-400 hover:bg-gray-800'}`}
            title="Move down"
          >
            <ChevronDown size={18} />
          </button>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded"
            title="Advanced settings"
          >
            <Settings size={18} />
          </button>

          <button
            onClick={() => onDelete(item.id)}
            className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"
            title="Delete entry"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="space-y-4">
        {/* Primary Keys and Selective */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-gray-400">Primary Keys</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={item.selective || false}
                onChange={(e) => onUpdate(item.id, { selective: e.target.checked })}
                className="form-checkbox"
              />
              <span className="text-sm text-gray-400">Selective</span>
            </label>
          </div>
          <input
            type="text"
            value={primaryKeys}
            onChange={(e) => setPrimaryKeys(e.target.value)}
            onBlur={handlePrimaryKeysBlur}
            className="w-full bg-zinc-950 text-white rounded px-3 py-2 border border-zinc-800"
            placeholder="Enter comma-separated keywords"
          />
        </div>

        {/* Secondary Keys and Logic (only shown if selective is true) */}
        {item.selective && (
          <div className="space-y-2">
            <div className="flex items-center gap-4">
            <div className="w-48">
                <label className="block text-sm text-gray-400 mb-1">Logic</label>
                <select
                  value={item.extensions?.selectiveLogic || WorldInfoLogic.AND_ANY}
                  onChange={(e) => onUpdate(item.id, {
                    extensions: { ...(item.extensions || {}), selectiveLogic: parseInt(e.target.value) }
                  })}
                  className="w-full bg-zinc-950 text-white rounded px-2 py-2 border border-zinc-800"
                >
                  <option value={WorldInfoLogic.AND_ANY}>AND ANY</option>
                  <option value={WorldInfoLogic.AND_ALL}>AND ALL</option>
                  <option value={WorldInfoLogic.NOT_ANY}>NOT ANY</option>
                  <option value={WorldInfoLogic.NOT_ALL}>NOT ALL</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm text-gray-400 mb-1">Secondary Keys</label>
                <input
                  type="text"
                  value={secondaryKeys}
                  onChange={(e) => setSecondaryKeys(e.target.value)}
                  onBlur={handleSecondaryKeysBlur}
                  className="w-full bg-zinc-950 text-white rounded px-3 py-2 border border-zinc-800"
                  placeholder="Enter comma-separated secondary keywords"
                />
              </div>
              </div>
          </div>
        )}
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Content</label>
          <RichTextEditor
            content={item.content}
            onChange={(html) => onUpdate(item.id, { content: html })}
            className="w-full bg-zinc-950 text-white rounded border border-zinc-800 h-32" // Apply styles, manage height
            placeholder="Enter lore content (supports Markdown)"
            preserveWhitespace={true} // Preserve formatting
          />
        </div>
        
        {/* Image Thumbnail */}
        {item.has_image && item.image_uuid && (
          <div className="mt-2">
            <label className="block text-sm text-gray-400 mb-1">Associated Image:</label>
            <img
              src={getFullImagePath(item.image_uuid)}
              alt="Lore item image"
              className="max-h-20 max-w-xs rounded border border-gray-700 cursor-pointer"
              onClick={() => setShowImageUploader(true)} // Open uploader to change/remove
              onError={(e) => {
                console.warn(`Lore thumbnail failed to load: ${e.currentTarget.src}`);
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}


        {/* Advanced settings panel */}
        {showAdvanced && ( // Corrected condition
            <div className="mt-4 p-4 bg-zinc-950 rounded-lg border border-zinc-800">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Advanced Settings</h4>

            {/* Special Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Case Sensitivity</label>
                <select
                  value={(item.extensions?.case_sensitive === null || item.extensions?.case_sensitive === undefined) ? 'default' : (item.extensions.case_sensitive ? 'true' : 'false')}
                  onChange={(e) => onUpdate(item.id, {
                    extensions: { ...(item.extensions || {}), case_sensitive: e.target.value === 'default' ? null : e.target.value === 'true' }
                  })}
                  className="w-full bg-zinc-950 text-white rounded px-2 py-1 border border-zinc-800"
                >
                  <option value="default">Use Global Setting</option>
                  <option value="true">Case Sensitive</option>
                  <option value="false">Case Insensitive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Word Matching</label>
                <select
                  value={(item.extensions?.match_whole_words === null || item.extensions?.match_whole_words === undefined) ? 'default' : (item.extensions.match_whole_words ? 'true' : 'false')}
                  onChange={(e) => onUpdate(item.id, {
                    extensions: { ...(item.extensions || {}), match_whole_words: e.target.value === 'default' ? null : e.target.value === 'true' }
                  })}
                  className="w-full bg-zinc-950 text-white rounded px-2 py-1 border border-zinc-800"
                >
                  <option value="default">Use Global Setting</option>
                  <option value="true">Match Whole Words</option>
                  <option value="false">Match Parts of Words</option>
                </select>
              </div>
            </div>

            {/* Probability Settings */}
            <div className="mt-4 flex items-center gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.extensions?.useProbability || false}
                  onChange={(e) => onUpdate(item.id, { extensions: { ...(item.extensions || {}), useProbability: e.target.checked } })}
                  className="form-checkbox"
                />
                <span className="text-sm text-gray-400">Use Probability</span>
              </label>
              {item.extensions?.useProbability && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Trigger Chance:</span>
                  <input
                    type="number"
                    value={item.extensions?.probability || 100}
                    onChange={(e) => onUpdate(item.id, {
                      extensions: {
                        ...(item.extensions || {}),
                        probability: e.target.value === ''
                          ? undefined          // treat empty as “unset”
                          : Math.min(100, Math.max(0, Number(e.target.value)))
                      }
                    })}
                    className="w-20 bg-zinc-950 text-white rounded px-2 py-1 border border-zinc-800"
                    min="0"
                    max="100"
                  />
                  <span className="text-sm text-gray-400">%</span>
                </div>
              )}
            </div>

            {/* Timing Controls */}
            <div className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Sticky</label>
                <input
                  type="number"
                  value={item.extensions?.sticky || ''}
                  onChange={(e) => onUpdate(item.id, {
                    extensions: { ...(item.extensions || {}), sticky: e.target.value ? parseInt(e.target.value) : null }
                  })}
                  className="w-full bg-zinc-950 text-white rounded px-2 py-1 border border-zinc-800"
                  placeholder="# Messages"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Cooldown</label>
                <input
                  type="number"
                  value={item.extensions?.cooldown || ''}
                  onChange={(e) => onUpdate(item.id, {
                    extensions: { ...(item.extensions || {}), cooldown: e.target.value ? parseInt(e.target.value) : null }
                  })}
                  className="w-full bg-zinc-950 text-white rounded px-2 py-1 border border-zinc-800"
                  placeholder="# Messages"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Delay</label>
                <input
                  type="number"
                  value={item.extensions?.delay || ''}
                  onChange={(e) => onUpdate(item.id, {
                    extensions: { ...(item.extensions || {}), delay: e.target.value ? parseInt(e.target.value) : null }
                  })}
                  className="w-full bg-zinc-950 text-white rounded px-2 py-1 border border-zinc-800"
                  placeholder="# Messages"
                />
              </div>
            </div>

            {/* Comment Field */}
            <div className="mt-4">
              <label className="block text-sm text-gray-400 mb-1">Notes</label>
              <textarea
                value={item.comment || ''}
                onChange={(e) => onUpdate(item.id, { comment: e.target.value })}
                className="w-full bg-zinc-950 text-white rounded px-3 py-2 border border-zinc-800 h-20 resize-y"
                placeholder="Add notes about this entry (not used by AI)"
              />
            </div>
            </div>
          )
        }
      </div>
   
    {loreImageUploaderElement}
    {/* Ensure fragment has a final explicit child or comment */}
    </>
  );
};

export default LoreCard;