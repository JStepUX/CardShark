import React, { useState } from 'react';
import { WordSwapRule } from '../utils/contentProcessing';
import { AlertCircle, Plus, Trash, Check, X, ArrowUpDown } from 'lucide-react';
import { Dialog } from './Dialog';

interface SubstitutionManagerProps {
  rules: WordSwapRule[];
  onChange: (rules: WordSwapRule[]) => void;
}

export const SubstitutionManager: React.FC<SubstitutionManagerProps> = ({ rules, onChange }) => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentRule, setCurrentRule] = useState<WordSwapRule | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  
  // Handlers
  const handleAddClick = () => {
    setCurrentRule({
      original: '',
      substitutions: [''],
      mode: 'exact',
      enabled: true,
      strategy: 'auto'
    });
    setIsAddDialogOpen(true);
  };
  
  const handleEditClick = (rule: WordSwapRule, index: number) => {
    setCurrentRule({ ...rule });
    setCurrentIndex(index);
    setIsEditDialogOpen(true);
  };
  
  const handleDeleteClick = (index: number) => {
    const newRules = [...rules];
    newRules.splice(index, 1);
    onChange(newRules);
  };
  
  const handleToggleEnabled = (index: number) => {
    const newRules = [...rules];
    newRules[index] = {
      ...newRules[index],
      enabled: !newRules[index].enabled
    };
    onChange(newRules);
  };

  const handleAddRule = (rule: WordSwapRule) => {
    onChange([...rules, rule]);
    setIsAddDialogOpen(false);
  };
  
  const handleUpdateRule = (rule: WordSwapRule) => {
    if (currentIndex === -1) return;
    
    const newRules = [...rules];
    newRules[currentIndex] = rule;
    onChange(newRules);
    setIsEditDialogOpen(false);
  };

  // Helper to move a rule up or down in the list
  const handleMoveRule = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === rules.length - 1)
    ) {
      return; // Can't move past the edges
    }

    const newRules = [...rules];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [newRules[index], newRules[newIndex]] = [newRules[newIndex], newRules[index]];
    onChange(newRules);
  };
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-md font-medium text-white">Content Filtering Rules</h2>
        <button
          onClick={handleAddClick}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-700 hover:bg-purple-600 transition-colors rounded"
        >
          <Plus size={16} />
          Add Rule
        </button>
      </div>
      
      <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
        {rules.length === 0 ? (
          <div className="py-8 text-center text-gray-400">
            <p>No word substitution rules defined.</p>
            <p className="text-sm mt-2">Add rules to filter unwanted content from AI responses.</p>
          </div>
        ) : (
          <table className="min-w-full">
            <thead className="bg-zinc-800">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Enabled</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Original Text</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Replacement</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Mode</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-400">Strategy</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700">
              {rules.map((rule, index) => (
                <tr key={index} className={rule.enabled ? "" : "opacity-50"}>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleToggleEnabled(index)}
                      className={`w-6 h-6 rounded-md flex items-center justify-center ${
                        rule.enabled
                          ? "bg-green-600 text-white"
                          : "bg-zinc-600 text-zinc-400"
                      }`}
                      title={rule.enabled ? "Disable" : "Enable"}
                    >
                      {rule.enabled ? <Check size={14} /> : <X size={14} />}
                    </button>
                  </td>
                  <td className="px-4 py-2 font-mono text-sm">
                    {rule.original.length > 20 
                      ? `${rule.original.substring(0, 20)}...` 
                      : rule.original}
                  </td>
                  <td className="px-4 py-2 font-mono text-sm">
                    {rule.substitutions.length === 0 
                      ? <span className="text-red-400">(Removed)</span> 
                      : rule.substitutions.join(" | ")}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {rule.mode === 'exact' ? 'Exact' :
                     rule.mode === 'case-insensitive' ? 'Case Insensitive' : 'Regex'}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {rule.strategy === 'api-ban' ? 'API Ban' :
                     rule.strategy === 'client-replace' ? 'Client Replace' : 'Auto'}
                  </td>
                  <td className="px-4 py-2 text-right space-x-1">
                    <button
                      onClick={() => handleMoveRule(index, 'up')}
                      disabled={index === 0}
                      className={`p-1 rounded ${
                        index === 0 ? "text-zinc-600" : "text-zinc-400 hover:bg-zinc-700"
                      }`}
                      title="Move Up"
                    >
                      <ArrowUpDown size={14} />
                    </button>
                    <button
                      onClick={() => handleEditClick(rule, index)}
                      className="p-1 rounded text-blue-400 hover:bg-zinc-700"
                      title="Edit"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteClick(index)}
                      className="p-1 rounded text-red-400 hover:bg-zinc-700"
                      title="Delete"
                    >
                      <Trash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Rule Editor Dialog */}
      {(isAddDialogOpen || isEditDialogOpen) && currentRule && (
        <RuleEditorDialog
          rule={currentRule}
          isOpen={isAddDialogOpen || isEditDialogOpen}
          onClose={() => {
            setIsAddDialogOpen(false);
            setIsEditDialogOpen(false);
          }}
          onSave={(rule) => {
            if (isAddDialogOpen) {
              handleAddRule(rule);
            } else {
              handleUpdateRule(rule);
            }
          }}
        />
      )}
    </div>
  );
};

interface RuleEditorDialogProps {
  rule: WordSwapRule;
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: WordSwapRule) => void;
}

const RuleEditorDialog: React.FC<RuleEditorDialogProps> = ({
  rule,
  isOpen,
  onClose,
  onSave
}) => {
  const [editedRule, setEditedRule] = useState<WordSwapRule>({ ...rule });
  const [substitution, setSubstitution] = useState('');
  
  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setEditedRule({
      ...editedRule,
      mode: e.target.value as 'exact' | 'case-insensitive' | 'regex'
    });
  };
  
  const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setEditedRule({
      ...editedRule,
      strategy: e.target.value as 'api-ban' | 'client-replace' | 'auto'
    });
  };
  
  const handleAddSubstitution = () => {
    if (substitution.trim()) {
      setEditedRule({
        ...editedRule,
        substitutions: [...editedRule.substitutions, substitution.trim()]
      });
      setSubstitution('');
    }
  };
  
  const handleRemoveSubstitution = (index: number) => {
    const newSubstitutions = [...editedRule.substitutions];
    newSubstitutions.splice(index, 1);
    setEditedRule({
      ...editedRule,
      substitutions: newSubstitutions
    });
  };
  
  const handleSave = () => {
    // Validate before saving
    if (!editedRule.original.trim()) {
      alert('Original text is required');
      return;
    }
    
    onSave(editedRule);
  };
  
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={rule.original ? `Edit Rule: ${rule.original}` : 'Add New Rule'}
      buttons={[
        { label: 'Cancel', onClick: onClose, variant: 'secondary' },
        { label: 'Save', onClick: handleSave, variant: 'primary' }
      ]}
    >
      <div className="space-y-4 py-2">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Original Text
          </label>
          <input
            type="text"
            value={editedRule.original}
            onChange={(e) => setEditedRule({ ...editedRule, original: e.target.value })}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
            placeholder="Text to match and replace"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Matching Mode
            </label>
            <select
              value={editedRule.mode}
              onChange={handleModeChange}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
            >
              <option value="exact">Exact Match</option>
              <option value="case-insensitive">Case Insensitive</option>
              <option value="regex">Regular Expression</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Filter Strategy
            </label>
            <select
              value={editedRule.strategy}
              onChange={handleStrategyChange}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2"
            >
              <option value="auto">Auto (Use Best Method)</option>
              <option value="api-ban">API-Level Ban</option>
              <option value="client-replace">Client-Side Replacement</option>
            </select>
          </div>
        </div>
        
        <div>
          {editedRule.strategy === 'api-ban' ? (
            <div className="flex items-center bg-blue-900/20 border border-blue-700/30 p-3 rounded">
              <AlertCircle size={16} className="text-blue-400 mr-2" />
              <div className="text-sm text-blue-300">
                API-ban mode will prevent the model from generating this text.
                No substitution is needed.
              </div>
            </div>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Substitutions
              </label>
              
              <div className="space-y-2 mb-2">
                {editedRule.substitutions.length === 0 ? (
                  <div className="text-sm text-yellow-500 italic">
                    No substitutions added. The matched text will be removed.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {editedRule.substitutions.map((sub, idx) => (
                      <div 
                        key={idx}
                        className="bg-zinc-800 px-2 py-1 rounded flex items-center gap-1.5"
                      >
                        <span className="text-sm">{sub}</span>
                        <button
                          onClick={() => handleRemoveSubstitution(idx)}
                          className="text-zinc-400 hover:text-red-400"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={substitution}
                  onChange={(e) => setSubstitution(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm"
                  placeholder="Add a substitution..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSubstitution();
                    }
                  }}
                />
                <button
                  onClick={handleAddSubstitution}
                  className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
                >
                  Add
                </button>
              </div>
              
              <p className="mt-2 text-xs text-gray-500">
                Press Enter or click Add to add multiple substitutions.
                One will be randomly selected when substituting.
              </p>
            </>
          )}
        </div>
        
        {editedRule.mode === 'regex' && (
          <div className="bg-yellow-900/20 border border-yellow-700/30 p-3 rounded">
            <p className="text-sm text-yellow-300">
              <strong>Regular Expression Mode:</strong> Use JavaScript-compatible regex patterns.
              Be careful with complex patterns as they may impact performance.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
};
