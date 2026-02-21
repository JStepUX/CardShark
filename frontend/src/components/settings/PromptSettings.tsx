// components/PromptSettings.tsx
import React, { useState, useEffect } from 'react';
import Button from '../common/Button';
import { usePrompts } from '../../hooks/usePrompts';
import { RefreshCw, Save, Plus, Download, Upload, AlertCircle, Info, Trash2, BookOpen } from 'lucide-react';
import RichTextEditor from '../RichTextEditor'; // Import RichTextEditor
import { StandardPromptKey, PromptVariable, PromptCategory } from '../../types/promptTypes';
import { Dialog } from '../common/Dialog';
import {
  newPromptSchema,
  PromptExportSchema
} from '../../types/promptSchemas';
import { htmlToPlainText } from '../../utils/contentUtils';
import { useSettings } from '../../contexts/SettingsContext';
import { DEFAULT_JOURNAL_ENTRY } from '../../contexts/ChatSessionContext';

interface PromptEditorProps {
  promptKey: string;
  title: string;
  description: string;
  availableVariables: string[];
}

// Individual prompt editor component
const PromptEditor: React.FC<PromptEditorProps> = ({
  promptKey,
  title,
  description,
  availableVariables
}) => {
  const {
    getPrompt,
    updatePrompt,
    resetPrompt,
    isCustomPrompt,
    getDefaultPrompt
  } = usePrompts();

  const [value, setValue] = useState('');
  const [isEdited, setIsEdited] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Load prompt value on mount and when promptKey changes
  useEffect(() => {
    setValue(getPrompt(promptKey));
    setIsEdited(false);
  }, [promptKey, getPrompt]);

  const handleSave = () => {
    updatePrompt(promptKey, value);
    setIsEdited(false);
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset this prompt to its default?')) {
      resetPrompt(promptKey);
      setValue(getDefaultPrompt(promptKey));
      setIsEdited(false);
    }
  };

  return (
    <div className="bg-stone-900 p-6 rounded-lg mb-8">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2">
            {title}
            {isCustomPrompt(promptKey) && (
              <span className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded">Custom</span>
            )}
            <Button
              variant="ghost"
              onClick={() => setShowInfo(!showInfo)}
              className="ml-2 p-1 text-gray-400 hover:text-gray-200 rounded-full"
              title="Show information about this prompt"
            >
              <Info size={14} />
            </Button>
          </h3>
          <p className="text-sm text-gray-400 mt-1">{description}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={handleReset}
            disabled={!isCustomPrompt(promptKey)}
            className="p-2 rounded-lg flex items-center gap-1 text-gray-300 hover:bg-stone-700"
            title="Reset to default"
          >
            <RefreshCw size={16} />
          </Button>
          <Button
            variant="ghost"
            onClick={handleSave}
            disabled={!isEdited}
            className="p-2 rounded-lg flex items-center gap-1 text-green-500 hover:bg-stone-700"
            title="Save changes"
          >
            <Save size={16} />
          </Button>
        </div>
      </div>

      {showInfo && (
        <div className="bg-stone-800 p-4 rounded-lg mb-4">
          <h4 className="text-sm font-medium mb-2">Available Variables</h4>
          <div className="flex flex-wrap gap-2">
            {availableVariables.map(variable => (
              <div key={variable} className="bg-stone-700 px-2 py-1 rounded text-xs">
                {variable}
              </div>
            ))}
          </div>
        </div>
      )}

      <RichTextEditor
        content={value}
        onChange={(html) => { // Use html from editor
          const plainText = htmlToPlainText(html);
          setValue(plainText);
          setIsEdited(plainText !== getPrompt(promptKey));
        }}
        className="w-full bg-stone-950 rounded-lg h-56 font-mono" // Apply styles
        placeholder="Enter prompt template (supports Markdown)..."
        preserveWhitespace={true} // Preserve formatting
      />
    </div>
  );
};

// New prompt dialog component
interface NewPromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (key: string, template: string) => void;
}

const NewPromptDialog: React.FC<NewPromptDialogProps> = ({
  isOpen,
  onClose,
  onCreate
}) => {
  const [key, setKey] = useState('');
  const [template, setTemplate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setKey('');
      setTemplate('');
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = () => {
    try {
      // Use Zod to validate the input
      const result = newPromptSchema.safeParse({ key, template });

      if (!result.success) {
        // Extract the first error message
        const errorMessage = result.error.issues[0]?.message || 'Invalid input';
        setError(errorMessage);
        return;
      }

      onCreate(key, template);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create prompt');
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Prompt"
      buttons={[
        {
          label: 'Cancel',
          onClick: onClose
        },
        {
          label: 'Create',
          onClick: handleSubmit,
          variant: 'primary'
        }
      ]}
    >
      <div className="space-y-4">
        {error && (
          <div className="bg-red-900/50 text-red-200 p-3 rounded-lg flex items-start gap-2">
            <AlertCircle size={16} className="mt-1" />
            <div>{error}</div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Prompt Key
          </label>
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value.trim())}
            className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg"
            placeholder="custom_prompt_key"
          />
          <p className="text-xs text-gray-500 mt-1">
            Use only letters, numbers, and underscores. This is how you'll reference the prompt in code.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Prompt Template
          </label>
          <RichTextEditor
            content={template}
            onChange={(html) => setTemplate(htmlToPlainText(html))} // Convert HTML to plain text
            className="w-full bg-stone-950 border border-stone-700 rounded-lg h-40 font-mono" // Apply styles
            placeholder="Enter prompt template with variables like {{char}}, {{user}}, etc. (supports Markdown)"
            preserveWhitespace={true} // Preserve formatting
          />
        </div>
      </div>
    </Dialog>
  );
};

// Import/Export dialog component
interface ImportExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'import' | 'export';
  exportData?: string;
  onImport: (data: string) => void;
}

const ImportExportDialog: React.FC<ImportExportDialogProps> = ({
  isOpen,
  onClose,
  mode,
  exportData,
  onImport
}) => {
  const [data, setData] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (mode === 'export' && exportData) {
        setData(exportData);
      } else {
        setData('');
      }
      setError('');
    }
  }, [isOpen, mode, exportData]);

  const handleImport = () => {
    try {
      if (!data) {
        setError('No data to import');
        return;
      }

      // Parse and validate JSON with Zod
      try {
        const parsedData = JSON.parse(data);
        const validationResult = PromptExportSchema.safeParse(parsedData);

        if (!validationResult.success) {
          const errorMessage = validationResult.error.issues[0]?.message || 'Invalid prompt data format';
          setError(`Invalid import format: ${errorMessage}`);
          return;
        }
      } catch (e) {
        setError('Invalid JSON format');
        return;
      }

      onImport(data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import prompts');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data);
      // Add a temporary "Copied!" message or similar
    } catch (e) {
      setError('Failed to copy to clipboard');
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'import' ? 'Import Prompts' : 'Export Prompts'}
      buttons={[
        {
          label: 'Cancel',
          onClick: onClose
        },
        ...(mode === 'import' ? [
          {
            label: 'Import',
            onClick: handleImport,
            variant: 'primary' as const
          }
        ] : [
          {
            label: 'Copy to Clipboard',
            onClick: handleCopy,
            variant: 'primary' as const
          }
        ])
      ]}
    >
      <div className="space-y-4">
        {error && (
          <div className="bg-red-900/50 text-red-200 p-3 rounded-lg flex items-start gap-2">
            <AlertCircle size={16} className="mt-1" />
            <div>{error}</div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            {mode === 'import' ? 'Paste JSON Data' : 'Export Data'}
          </label>
          <textarea
            value={data}
            onChange={(e) => mode === 'import' ? setData(e.target.value) : null}
            readOnly={mode === 'export'}
            className="w-full px-3 py-2 bg-stone-950 border border-stone-700 rounded-lg font-mono h-64"
            placeholder={mode === 'import' ? 'Paste JSON prompt data here...' : ''}
          />
          {mode === 'import' && (
            <p className="text-xs text-gray-500 mt-1">
              Paste JSON data exported from another CardShark instance.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
};

// Define prompt categories with their prompts
const PROMPT_CATEGORIES = [
  {
    id: PromptCategory.REASONING,
    title: 'Reasoning Prompts',
    description: 'Prompts for thinking and reasoning about responses',
    prompts: [
      {
        key: StandardPromptKey.REASONING,
        title: 'Character Thinking',
        description: 'Template for creating "thinking mode" content where the AI reasons about responses',
        variables: [
          PromptVariable.CHAR_NAME,
          PromptVariable.USER_NAME,
          PromptVariable.MESSAGE,
          PromptVariable.DESCRIPTION,
          PromptVariable.PERSONALITY
        ]
      }
    ]
  },
  {
    id: PromptCategory.VARIATION,
    title: 'Variation Prompts',
    description: 'Prompts for generating variations of responses',
    prompts: [
      {
        key: StandardPromptKey.REFRESH_VARIATION,
        title: 'Response Variation',
        description: 'Template for generating alternative responses to the same message',
        variables: [
          PromptVariable.CHAR_NAME,
          PromptVariable.USER_NAME,
          PromptVariable.MESSAGE,
          PromptVariable.PREVIOUS_RESPONSE,
          PromptVariable.DESCRIPTION,
          PromptVariable.PERSONALITY
        ]
      },
      {
        key: StandardPromptKey.GENERATE_INTRO,
        title: 'Alternative Greeting Prompt',
        description: 'Template for generating a new first message for a character',
        variables: [
          PromptVariable.CHAR_NAME,
          PromptVariable.USER_NAME,
          PromptVariable.DESCRIPTION,
          PromptVariable.PERSONALITY,
          PromptVariable.SCENARIO,
          PromptVariable.FIRST_MESSAGE,
          PromptVariable.EXAMPLES
        ]
      }
    ]
  },

  {
    id: PromptCategory.CHAT,
    title: 'Chat Prompts',
    description: 'Prompts that control the chat experience',
    prompts: [
      {
        key: StandardPromptKey.CHAT_STARTER,
        title: 'Chat Starter',
        description: 'Template for generating initial messages when starting a new conversation',
        variables: [
          PromptVariable.CHAR_NAME,
          PromptVariable.USER_NAME,
          PromptVariable.DESCRIPTION,
          PromptVariable.PERSONALITY,
          PromptVariable.SCENARIO
        ]
      },
      {
        key: StandardPromptKey.CHAT_CONTINUE,
        title: 'Continue Chat',
        description: 'Template for continuing a paused or incomplete conversation',
        variables: [
          PromptVariable.CHAR_NAME,
          PromptVariable.USER_NAME,
          PromptVariable.CHAT_HISTORY,
          PromptVariable.DESCRIPTION,
          PromptVariable.PERSONALITY
        ]
      }
    ]
  },
  {
    id: PromptCategory.SYSTEM,
    title: 'System Prompts',
    description: 'Core system prompts that control model behavior',
    prompts: [
      {
        key: StandardPromptKey.SYSTEM_PROMPT,
        title: 'Primary System Prompt',
        description: 'The main system prompt that sets model behavior and character instruction',
        variables: [
          PromptVariable.CHAR_NAME,
          PromptVariable.USER_NAME,
          PromptVariable.DESCRIPTION,
          PromptVariable.PERSONALITY,
          PromptVariable.SCENARIO,
          PromptVariable.EXAMPLE_DIALOGUE
        ]
      },
      {
        key: StandardPromptKey.ASSISTANT_PROMPT,
        title: 'Assistant System Prompt',
        description: 'System prompt for the generic CardShark assistant',
        variables: [
          PromptVariable.USER_NAME
        ]
      }
    ]
  }
];

/** Editor for the global default Journal entry stored in settings.json */
const JournalDefaultEditor: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const saved = settings.default_journal_entry ?? DEFAULT_JOURNAL_ENTRY;
  const [value, setValue] = useState(saved);
  const [isEdited, setIsEdited] = useState(false);

  // Sync when settings load/change externally
  useEffect(() => {
    const current = settings.default_journal_entry ?? DEFAULT_JOURNAL_ENTRY;
    setValue(current);
    setIsEdited(false);
  }, [settings.default_journal_entry]);

  const handleSave = async () => {
    // Save undefined to clear the override (fall back to hardcoded default)
    // Save the value as-is when it differs from the hardcoded default
    await updateSettings({ default_journal_entry: value || undefined });
    setIsEdited(false);
  };

  const handleReset = () => {
    if (window.confirm('Reset to the built-in default Journal entry?')) {
      setValue(DEFAULT_JOURNAL_ENTRY);
      setIsEdited(DEFAULT_JOURNAL_ENTRY !== saved);
    }
  };

  return (
    <div className="bg-stone-900 p-6 rounded-lg mb-8">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2">
            <BookOpen size={14} className="text-blue-400" />
            Default Journal Entry
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Pre-populated in every new chat session's Journal. Users can edit per-session.
            Supports <code className="text-gray-300">{'{{char}}'}</code> and <code className="text-gray-300">{'{{user}}'}</code> tokens.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={handleReset}
            className="p-2 rounded-lg flex items-center gap-1 text-gray-300 hover:bg-stone-700"
            title="Reset to built-in default"
          >
            <RefreshCw size={16} />
          </Button>
          <Button
            variant="ghost"
            onClick={handleSave}
            disabled={!isEdited}
            className="p-2 rounded-lg flex items-center gap-1 text-green-500 hover:bg-stone-700"
            title="Save changes"
          >
            <Save size={16} />
          </Button>
        </div>
      </div>

      <RichTextEditor
        content={value}
        onChange={(html) => {
          const plainText = htmlToPlainText(html);
          setValue(plainText);
          setIsEdited(plainText !== saved);
        }}
        className="w-full bg-stone-950 rounded-lg h-32 font-mono"
        placeholder="Enter default Journal instructions..."
        preserveWhitespace={true}
      />
    </div>
  );
};

const PromptSettings: React.FC = () => {
  const {
    createCustomPrompt,
    deleteCustomPrompt,
    exportPrompts,
    importPrompts,
    getCustomPromptKeys
  } = usePrompts();

  const [isNewPromptDialogOpen, setIsNewPromptDialogOpen] = useState(false);
  const [isImportExportDialogOpen, setIsImportExportDialogOpen] = useState(false);
  const [importExportMode, setImportExportMode] = useState<'import' | 'export'>('export');
  const [customPromptKeys, setCustomPromptKeys] = useState<string[]>([]);

  // Load custom prompts on mount
  useEffect(() => {
    setCustomPromptKeys(getCustomPromptKeys());
  }, [getCustomPromptKeys]);

  // Handle creating a new custom prompt
  const handleCreatePrompt = (key: string, template: string) => {
    createCustomPrompt(key, template);
    setCustomPromptKeys(getCustomPromptKeys());
  };

  // Handle deleting a custom prompt
  const handleDeletePrompt = (key: string) => {
    if (window.confirm(`Are you sure you want to delete the custom prompt "${key}"?`)) {
      deleteCustomPrompt(key);
      setCustomPromptKeys(getCustomPromptKeys());
    }
  };

  // Handle exporting prompts
  const handleExport = () => {
    setImportExportMode('export');
    setIsImportExportDialogOpen(true);
  };

  // Handle importing prompts
  const handleImport = () => {
    setImportExportMode('import');
    setIsImportExportDialogOpen(true);
  };

  // Process prompt import with better error handling using Zod
  const processImport = (data: string) => {
    try {
      // Validation already happened in the dialog component
      importPrompts(data);
      setCustomPromptKeys(getCustomPromptKeys());
    } catch (error) {
      console.error('Failed to import prompts:', error);
      alert('Failed to import prompts. Please check the format of your data.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-lg font-bold">Prompt Settings</h2>
          <p className="text-gray-400 mt-1">
            Customize prompts used by the AI to control character behavior and responses
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={handleImport}
            className="hidden bg-stone-800 hover:bg-stone-700 rounded-lg flex items-center gap-2"
            title="Import prompts"
          >
            <Upload size={16} />
            <span>Import</span>
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={handleExport}
            className="hidden bg-stone-800 hover:bg-stone-700 rounded-lg flex items-center gap-2"
            title="Export prompts"
          >
            <Download size={16} />
            <span>Export</span>
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsNewPromptDialogOpen(true)}
            className="bg-blue-900 hover:bg-blue-800 rounded-lg flex items-center gap-2"
            title="Create new custom prompt"
          >
            <Plus size={16} />
            <span>New Prompt</span>
          </Button>
        </div>
      </div>

      {/* Default Journal entry — stored in settings.json, applied to new sessions */}
      <div className="mb-12">
        <div className="border-b border-stone-700 pb-2 mb-6">
          <h3 className="text-base font-semibold">Journal</h3>
          <p className="text-gray-400 text-sm">Default instructions pre-populated in every new session's Journal</p>
        </div>
        <JournalDefaultEditor />
      </div>

      {/* Standard prompt categories */}
      {PROMPT_CATEGORIES.map(category => (
        <div key={category.id} className="mb-12">
          <div className="border-b border-stone-700 pb-2 mb-6">
            <h3 className="text-base font-semibold">{category.title}</h3>
            <p className="text-gray-400 text-sm">{category.description}</p>
          </div>

          {category.prompts.map(prompt => (
            <PromptEditor
              key={prompt.key}
              promptKey={prompt.key}
              title={prompt.title}
              description={prompt.description}
              availableVariables={prompt.variables}
            />
          ))}
        </div>
      ))}

      {/* Custom prompts section */}
      {customPromptKeys.length > 0 && (
        <div className="mb-12">
          <div className="border-b border-stone-700 pb-2 mb-6">
            <h3 className="text-base font-semibold">Custom Prompts</h3>
            <p className="text-gray-400 text-sm">
              User-defined prompts that you've created for specific purposes
            </p>
          </div>

          {customPromptKeys.map(key => (
            <div key={key} className="relative">
              <Button
                variant="ghost"
                onClick={() => handleDeletePrompt(key)}
                className="absolute right-8 top-8 p-2 text-gray-400 hover:text-red-500 hover:bg-stone-800 rounded-full"
                title="Delete this custom prompt"
              >
                <Trash2 size={16} />
              </Button>
              <PromptEditor
                promptKey={key}
                title={key}
                description="Custom user-defined prompt"
                availableVariables={Object.values(PromptVariable)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <NewPromptDialog
        isOpen={isNewPromptDialogOpen}
        onClose={() => setIsNewPromptDialogOpen(false)}
        onCreate={handleCreatePrompt}
      />

      <ImportExportDialog
        isOpen={isImportExportDialogOpen}
        onClose={() => setIsImportExportDialogOpen(false)}
        mode={importExportMode}
        exportData={importExportMode === 'export' ? exportPrompts() : undefined}
        onImport={processImport}
      />
    </div>
  );
};

export default PromptSettings;
