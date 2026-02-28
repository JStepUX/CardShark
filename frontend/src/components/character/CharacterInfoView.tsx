import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, FileJson, SplitSquareVertical, AlertTriangle, Save, Globe, Trash2, Copy, MoreHorizontal } from 'lucide-react';
import Button from '../common/Button';
import { useNavigate } from 'react-router-dom';
import { useCharacter } from '../../contexts/CharacterContext';
import { useComparison } from '../../contexts/ComparisonContext';
import { CharacterCard } from '../../types/schema';
import RichTextEditor from '../RichTextEditor';
import { FindReplaceDialog } from '../FindReplaceDialog';
import { Dialog } from '../common/Dialog';
import { saveCharacterCardToPng } from '../../handlers/exportHandlers';
import DeleteConfirmationDialog from '../common/DeleteConfirmationDialog';
import { htmlToPlainText } from '../../utils/contentUtils';
import CharacterImageGallery from './CharacterImageGallery';

// Dedicated modal version of JsonViewer without redundant title
const JsonViewerModal: React.FC<{
  characterData: CharacterCard | null;
  setCharacterData: React.Dispatch<React.SetStateAction<CharacterCard | null>>;
}> = ({ characterData, setCharacterData }) => {
  const [editableJson, setEditableJson] = useState(() => {
    try {
      return characterData ? JSON.stringify(characterData, null, 2) : 'No character data loaded';
    } catch (e) {
      return 'Invalid JSON data';
    }
  });
  const [error, setError] = useState<string | null>(null);

  // Update content when character data changes
  React.useEffect(() => {
    if (characterData) {
      try {
        setEditableJson(JSON.stringify(characterData, null, 2));
        setError(null);
      } catch (e) {
        setEditableJson('Invalid JSON data');
        setError('Invalid JSON data');
      }
    } else {
      setEditableJson('No character data loaded');
      setError('No character data loaded');
    }
  }, [characterData]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditableJson(e.target.value);
  };

  const handleSave = () => {
    try {
      const parsedData = JSON.parse(editableJson);
      setCharacterData(parsedData);
      setError(null);
    } catch (e: any) {
      setError(`Invalid JSON: ${e.message}`);
    }
  };

  return (
    <div className="h-full w-full flex flex-col">
      {error && <div className="text-red-500 mb-2">{error}</div>}
      <textarea
        className="w-full flex-1 bg-stone-900 text-white font-mono text-sm
                  rounded-lg p-4 overflow-auto
                  whitespace-pre-wrap break-words resize-none"
        value={editableJson}
        onChange={handleChange}
      />
      <Button
        variant="primary"
        size="md"
        className="mt-4 !bg-purple-600 hover:!bg-purple-700"
        onClick={handleSave}
      >
        Save Changes
      </Button>
    </div>
  );
};

// Approximate token count: ~4 characters per token (matches promptHandler.ts)
const estimateTokens = (text: unknown): number => {
  if (!text) return 0;
  const str = typeof text === 'string' ? text
    : Array.isArray(text) ? text.join(' ')
    : typeof text === 'object' ? JSON.stringify(text)
    : String(text);
  return Math.ceil(str.length / 4);
};

const TOKEN_FIELDS = ['name', 'description', 'scenario', 'personality', 'mes_example', 'system_prompt', 'first_mes'] as const;

interface CharacterInfoViewProps {
  isSecondary?: boolean;
}

const CharacterInfoView: React.FC<CharacterInfoViewProps> = ({ isSecondary = false }) => {  // Use the appropriate context based on the mode
  const navigate = useNavigate();
  const primaryContext = useCharacter();
  const { isCompareMode, setCompareMode, secondaryCharacterData, setSecondaryCharacterData } = useComparison();

  // Determine which data to use based on isSecondary prop
  const { characterData, setCharacterData } = isSecondary
    ? { characterData: secondaryCharacterData, setCharacterData: setSecondaryCharacterData }
    : primaryContext;

  // Always get imageUrl and hasUnsavedChanges from primary context (not used in secondary/compare mode)
  const { imageUrl, setImageUrl, hasUnsavedChanges, setHasUnsavedChanges } = primaryContext;
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  // Smart change tracking state - removed local hasUnsavedChanges, now using context
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [isConvertingToWorld, setIsConvertingToWorld] = useState(false);
  const [originalCharacterData, setOriginalCharacterData] = useState<CharacterCard | null>(null);
  const changeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State for deletion
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for overflow menu
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

  // Track original character data when it changes
  useEffect(() => {
    if (characterData && JSON.stringify(characterData) !== JSON.stringify(originalCharacterData)) {
      setOriginalCharacterData(JSON.parse(JSON.stringify(characterData)));
      setHasUnsavedChanges(false);
    }
  }, [characterData?.data?.character_uuid]); // Only reset when character actually changes

  // Debounced change detection - only detect real changes after user stops typing
  useEffect(() => {
    if (!originalCharacterData || !characterData || isSecondary) return; // Don't track changes for secondary view

    // Clear existing timeout
    if (changeTimeoutRef.current) {
      clearTimeout(changeTimeoutRef.current);
    }

    // Set a debounced check for changes
    changeTimeoutRef.current = setTimeout(() => {
      const hasChanges = JSON.stringify(characterData) !== JSON.stringify(originalCharacterData);
      setHasUnsavedChanges(hasChanges); // Update context state
    }, 1000); // 1 second delay to avoid flagging temporary typing

    // Cleanup timeout on unmount
    return () => {
      if (changeTimeoutRef.current) {
        clearTimeout(changeTimeoutRef.current);
      }
    };
  }, [characterData, originalCharacterData, setHasUnsavedChanges, isSecondary]);
  // Navigation blocking using beforeunload and improved popstate handling
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    const handlePopState = (_e: PopStateEvent) => {
      if (hasUnsavedChanges) {
        // Since preventDefault() doesn't work on popstate, we need to handle this differently
        // Use setTimeout to avoid blocking the current event handling
        setTimeout(() => {
          const confirmLeave = window.confirm('You have unsaved changes. Are you sure you want to leave?');
          if (!confirmLeave) {
            // Use history.go(1) to move forward one step instead of pushState
            // This reverses the back navigation that just occurred
            window.history.go(1);
          }
        }, 0);
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasUnsavedChanges]);// Save function
  const handleSave = async () => {
    if (!characterData) return;

    try {
      // Create a simple image blob for saving (we could enhance this later with actual image)
      const response = await fetch(imageUrl || '/api/placeholder-image');
      const imageBlob = await response.blob();

      await saveCharacterCardToPng(characterData, imageBlob);
      setOriginalCharacterData(JSON.parse(JSON.stringify(characterData)));
      setHasUnsavedChanges(false);
      setShowUnsavedModal(false);

      // Execute pending navigation if any
      if (pendingNavigation) {
        pendingNavigation();
        setPendingNavigation(null);
      }
    } catch (error) {
      console.error('Failed to save character:', error);
    }
  };

  // Handle modal actions
  const handleCancelNavigation = () => {
    setShowUnsavedModal(false);
    setPendingNavigation(null);
  };

  const handleDiscardChanges = () => {
    if (originalCharacterData) {
      setCharacterData(JSON.parse(JSON.stringify(originalCharacterData)));
      setHasUnsavedChanges(false);
    }
    setShowUnsavedModal(false);

    // Execute pending navigation if any
    if (pendingNavigation) {
      pendingNavigation();
      setPendingNavigation(null);
    }
  };
  const handleFieldChange = (field: keyof CharacterCard['data'], value: string | string[]): void => {
    try {
      // If there's no character data yet, auto-create a new character
      if (!characterData?.data) {
        if (primaryContext.createNewCharacter) {
          // Create with the field value as name, or empty name if it's not the name field
          const newName = field === 'name' ? (value as string) : '';
          primaryContext.createNewCharacter(newName);
          // The useEffect will handle setting this as the original data
          // Don't return here - continue to update the field after creation
        } else {
          console.error("Cannot create character: createNewCharacter function not available");
          return;
        }
      }

      // Update the character data (this will work for both existing and newly created characters)
      setCharacterData((prev: CharacterCard | null) => {
        if (!prev?.data) return prev;

        return {
          ...prev,
          data: {
            ...prev.data,
            [field]: value,
          },
        };
      });
    } catch (error) {
      console.error("Error updating character field:", error);
    }
  };

  // Helper function to safely get field value
  const getFieldValue = (field: keyof CharacterCard['data']): string => {
    const value = characterData?.data?.[field];
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return value?.toString() || '';
  };

  // Toggle comparison mode
  const toggleCompareMode = () => {
    setCompareMode(!isCompareMode);
  };

  const handleConvertToWorld = async () => {
    if (!characterData || !characterData.data.character_uuid) {
      console.error('Cannot convert to world: Missing character data or UUID');
      alert('Cannot convert to world: Character data is missing');
      return;
    }

    console.log('Starting world conversion for:', characterData.data.name, 'UUID:', characterData.data.character_uuid);
    setIsConvertingToWorld(true);

    try {
      // Use the V2 World Creation API
      // This will handles duplication, lore extraction, and initialization atomially on the backend
      const requestBody = {
        name: `${characterData.data.name} (World)`,
        character_path: characterData.data.character_uuid // Backend also supports UUID as character_path
      };

      console.log('Sending world creation request:', requestBody);

      const response = await fetch('/api/world-cards-v2/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      console.log('World creation response status:', response.status, response.statusText);

      if (!response.ok) {
        let errorMessage = 'Failed to create world';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
          console.error('World creation error response:', errorData);
        } catch (e) {
          console.error('Failed to parse error response:', e);
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('World creation result:', result);

      if (result.success && result.data) {
        const newUuid = result.data.character_uuid;
        console.log('World created successfully with UUID:', newUuid);

        // Invalidate character gallery cache since we generated a new card
        if (primaryContext.invalidateCharacterCache) {
          primaryContext.invalidateCharacterCache();
        }

        // Navigate to the new world launcher
        const targetUrl = `/world/${newUuid}/launcher`;
        console.log('Navigating to:', targetUrl);
        navigate(targetUrl);
      } else {
        console.error('World creation returned unexpected result:', result);
        throw new Error('World creation returned success but no data was received.');
      }

    } catch (error) {
      console.error('Failed to convert to world:', error);
      alert('Failed to convert to world: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsConvertingToWorld(false);
    }
  };

  const handleDelete = async () => {
    if (!characterData?.data?.character_uuid) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/character/${characterData.data.character_uuid}?delete_png=true`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Failed to delete character');
      }

      // Invalidate cache and navigate to gallery
      if (primaryContext.invalidateCharacterCache) {
        primaryContext.invalidateCharacterCache();
      }
      navigate('/');

    } catch (error) {
      console.error('Error deleting character:', error);
      alert('Failed to delete character: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsDeleting(false);
      setIsDeleteConfirmOpen(false);
    }
  };

  const handleDuplicate = async () => {
    if (!characterData?.data?.character_uuid) return;

    setShowOverflowMenu(false);
    try {
      const response = await fetch(`/api/character/${characterData.data.character_uuid}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_name: `${characterData.data.name} (Copy)`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || errorData.message || 'Failed to duplicate character');
      }

      const result = await response.json();

      if (result.success && result.data?.character) {
        const newUuid = result.data.character.character_uuid;

        // Invalidate character gallery cache
        if (primaryContext.invalidateCharacterCache) {
          primaryContext.invalidateCharacterCache();
        }

        // Navigate to the duplicated character
        navigate(`/character/${newUuid}/info`);
      } else {
        throw new Error('Duplication returned success but no data was received.');
      }

    } catch (error) {
      console.error('Failed to duplicate character:', error);
      alert('Failed to duplicate character: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // Close overflow menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(event.target as Node)) {
        setShowOverflowMenu(false);
      }
    };

    if (showOverflowMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showOverflowMenu]);

  const totalTokens = useMemo(() => {
    if (!characterData?.data) return 0;
    return TOKEN_FIELDS.reduce((sum, f) => sum + estimateTokens(characterData.data[f]), 0);
  }, [characterData]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-none px-8 pt-8 pb-4 flex items-center justify-between gap-4">
        <h2 className="heading-primary whitespace-nowrap">
          {isSecondary ? "Comparison View" : "Primary Character Info"}
          {totalTokens > 0 && (
            <span className="ml-2 text-sm font-normal text-stone-500">~{totalTokens.toLocaleString()} tokens</span>
          )}
        </h2>

        {/* Toolbar - Save Changes button and icon buttons */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Tools group */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="lg"
              icon={<FileJson />}
              onClick={() => setShowJsonModal(true)}
              title="View JSON"
            />

            <Button
              variant="ghost"
              size="lg"
              icon={<Search />}
              onClick={() => setShowFindReplace(true)}
              title="Find & Replace"
            />

            {!isSecondary && (
              <>
                <Button
                  variant="ghost"
                  size="lg"
                  icon={<Globe className={isConvertingToWorld ? 'animate-spin' : ''} />}
                  onClick={handleConvertToWorld}
                  disabled={isConvertingToWorld}
                  title="Convert to World"
                />

                <Button
                  variant="ghost"
                  size="lg"
                  icon={<Copy />}
                  onClick={handleDuplicate}
                  title="Duplicate"
                />
              </>
            )}
          </div>

          {/* Divider */}
          {!isSecondary && <div className="w-px h-6 bg-stone-700 mx-1" />}

          {/* Panel toggles */}
          {!isSecondary && (
            <div className="flex items-center gap-1">
              <Button
                variant="toolbar"
                size="lg"
                icon={<SplitSquareVertical />}
                active={isCompareMode}
                onClick={toggleCompareMode}
                title={isCompareMode ? "Close Comparison" : "Compare Characters"}
              />
            </div>
          )}

          {/* Divider before delete */}
          {!isSecondary && <div className="w-px h-6 bg-stone-700 mx-1" />}

          {/* Delete - destructive action */}
          {!isSecondary && (
            <Button
              variant="ghost"
              size="lg"
              icon={<Trash2 />}
              onClick={() => setIsDeleteConfirmOpen(true)}
              title="Delete Character"
              className="text-red-400/70 hover:text-red-400 hover:bg-red-900/30"
            />
          )}

          {/* Overflow menu for secondary view or tight spaces */}
          {isSecondary && (
            <div className="relative" ref={overflowMenuRef}>
              <Button
                variant="ghost"
                size="lg"
                icon={<MoreHorizontal />}
                onClick={() => setShowOverflowMenu(!showOverflowMenu)}
                title="More actions"
              />

              {showOverflowMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-stone-800 border border-stone-700 rounded-lg shadow-lg z-10 overflow-hidden">
                  <Button
                    variant="ghost"
                    size="md"
                    icon={<FileJson />}
                    fullWidth
                    className="justify-start px-4 py-3 text-white hover:bg-stone-700 rounded-none"
                    onClick={() => {
                      setShowOverflowMenu(false);
                      setShowJsonModal(true);
                    }}
                  >
                    View JSON
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    icon={<Search />}
                    fullWidth
                    className="justify-start px-4 py-3 text-white hover:bg-stone-700 rounded-none"
                    onClick={() => {
                      setShowOverflowMenu(false);
                      setShowFindReplace(true);
                    }}
                  >
                    Find & Replace
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 pb-8">
          {/* Removed inline 'Save Now' button - now handled by ChatHeader */}

          <div className="space-y-6">
            {/* Character Image Gallery - only show when editing existing character */}
            {characterData?.data?.character_uuid && (
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Character Images</label>
                <CharacterImageGallery
                  characterUuid={characterData.data.character_uuid}
                  portraitUrl={imageUrl}
                  onImageSelect={(image) => {
                    console.log('Selected secondary image:', image.filename);
                  }}
                  onSetAsPortrait={(newImageUrl) => {
                    setImageUrl(newImageUrl);
                    setHasUnsavedChanges(true);
                  }}
                />
              </div>
            )}

            {/* Name Field */}            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                className={`w-full bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} rounded-lg px-3 py-2`}
                placeholder="Character name"
                value={characterData?.data?.name || ''}
                onChange={(e) => handleFieldChange('name', e.target.value)}
              />
            </div>

            {/* Description Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <RichTextEditor
                className={`bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} font-light tracking-wide rounded-lg h-64`} // Apply styles to container
                placeholder="Who is this character? Background, appearance, role in the story..."
                content={getFieldValue('description')}
                onChange={(html) => handleFieldChange('description', htmlToPlainText(html))}
                preserveWhitespace={true} // Preserve newlines/whitespace
              />
            </div>

            {/* Scenario Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Scenario</label>
              <RichTextEditor
                className={`w-full bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} font-light tracking-wide rounded-lg h-32`}
                placeholder="Where and when does the conversation begin?"
                content={getFieldValue('scenario')}
                onChange={(html) => handleFieldChange('scenario', htmlToPlainText(html))}
                preserveWhitespace={true} // Preserve newlines/whitespace
              />
            </div>

            {/* Personality Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Personality</label>
              <RichTextEditor
                className={`w-full bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} font-light tracking-wide rounded-lg h-32`} // Apply styles, manage height
                placeholder="How do they talk, think, and react? What drives them?"
                content={getFieldValue('personality')}
                onChange={(html) => handleFieldChange('personality', htmlToPlainText(html))}
                preserveWhitespace={true}
              />
            </div>

            {/* Example Dialogue Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Example Dialogue</label>
              <RichTextEditor
                className={`w-full bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} font-light tracking-wide rounded-lg h-64`} // Apply styles, manage height
                placeholder="Show, don't tell — a sample exchange in their voice"
                content={getFieldValue('mes_example')}
                onChange={(html) => handleFieldChange('mes_example', htmlToPlainText(html))}
                preserveWhitespace={true} // Crucial for dialogue formatting
              />
            </div>

            {/* System Prompt Field */}
            <div>
              <label className="block text-sm font-medium mb-2">System Prompt</label>
              <div className="relative w-full">
                <RichTextEditor
                  className={`w-full h-64 bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} font-light tracking-wide rounded-lg text-base leading-relaxed`} // Apply styles, manage height
                  placeholder="Instructions for the AI: tone, rules, boundaries, format..."
                  content={getFieldValue('system_prompt')}
                  onChange={(html) => handleFieldChange('system_prompt', htmlToPlainText(html))}
                  preserveWhitespace={true} // Important for prompt structure
                />
              </div>
            </div>

            {/* Tags Field */}
            <div>
              <label className="block text-sm font-medium mb-2">Tags</label>
              <input
                type="text"
                className={`w-full bg-stone-800 border ${isSecondary ? 'border-purple-700' : 'border-stone-700'} rounded-lg px-3 py-2`}
                placeholder="Character tags (comma-separated)"
                value={characterData?.data?.tags?.join(', ') || ''}
                onChange={(e) => handleFieldChange('tags', e.target.value.split(',').map(tag => tag.trim()))}
              />
            </div>

          </div>
        </div>
      </div>

      {/* Find and Replace Dialog */}
      <FindReplaceDialog
        isOpen={showFindReplace}
        onClose={() => setShowFindReplace(false)}
        characterData={characterData}
        onReplace={setCharacterData}
      />      {/* JSON Modal Dialog */}
      {showJsonModal && (
        <Dialog
          isOpen={showJsonModal}
          onClose={() => setShowJsonModal(false)}
          title="JSON View"
          showCloseButton={true}
          className="max-w-4xl w-2/3" // Added width control here
        >
          <div className="w-full h-[70vh]">
            <JsonViewerModal
              characterData={characterData}
              setCharacterData={setCharacterData}
            />
          </div>
        </Dialog>
      )}

      {/* Unsaved Changes Modal */}
      {showUnsavedModal && (
        <Dialog
          isOpen={showUnsavedModal}
          onClose={handleCancelNavigation}
          title="Unsaved Changes"
          showCloseButton={false}
          className="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
              <div>
                <p className="text-white">You have unsaved changes that will be lost.</p>
                <p className="text-gray-400 text-sm">Would you like to save before continuing?</p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                size="lg"
                onClick={handleCancelNavigation}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="lg"
                onClick={handleDiscardChanges}
              >
                Discard Changes
              </Button>
              <Button
                variant="primary"
                size="lg"
                icon={<Save />}
                className="!bg-green-600 hover:!bg-green-700"
                onClick={handleSave}
              >
                Save
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={isDeleteConfirmOpen}
        title="Delete Character"
        description="Are you sure you want to delete this character? This action cannot be undone."
        itemName={characterData?.data?.name || 'Character'}
        isDeleting={isDeleting}
        onCancel={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default CharacterInfoView;