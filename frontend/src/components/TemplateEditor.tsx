// src/components/TemplateEditor.tsx
import React, { useState, useEffect } from 'react';
import { Save, X, Info, Plus, Trash2 } from 'lucide-react';
import { Template } from '../types/templateTypes';
import { generateUUID } from '../utils/generateUUID';
import HighlightedTextArea from './HighlightedTextArea';

interface TemplateEditorProps {
  template: Template | null;
  onSave: (template: Template) => void;
  onCancel: () => void;
  isNew?: boolean;
}

const TemplateEditor: React.FC<TemplateEditorProps> = ({ 
  template, 
  onSave, 
  onCancel,
  isNew = false
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemFormat, setSystemFormat] = useState('');
  const [userFormat, setUserFormat] = useState('');
  const [assistantFormat, setAssistantFormat] = useState('');
  const [memoryFormat, setMemoryFormat] = useState('');
  const [stopSequences, setStopSequences] = useState<string[]>([]);
  const [detectionPatterns, setDetectionPatterns] = useState<string[]>([]);
  const [newStopSequence, setNewStopSequence] = useState('');
  const [newDetectionPattern, setNewDetectionPattern] = useState('');
  
  // Update form values when template changes
  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description);
      setSystemFormat(template.systemFormat || '');
      setUserFormat(template.userFormat);
      setAssistantFormat(template.assistantFormat);
      setMemoryFormat(template.memoryFormat || '');
      setStopSequences(template.stopSequences || []);
      setDetectionPatterns(template.detectionPatterns || []);
    } else {
      // Default values for new template
      setName('');
      setDescription('');
      setSystemFormat('[INST] {{content}} [/INST]');
      setUserFormat('[INST] {{content}} [/INST]');
      setAssistantFormat('{{char}}: {{content}}');
      setMemoryFormat('{{#if system}}[INST] {{system}} [/INST]\n{{/if}}Persona: {{description}}\nPersonality: {{personality}}\n[Scenario: {{scenario}}]');
      setStopSequences(['[INST]', 'User:', 'Assistant:', '{{char}}:']);
      setDetectionPatterns(['[INST]', '[/INST]']);
    }
  }, [template]);
  
  const handleSave = () => {
    // Validate required fields
    if (!name || !userFormat || !assistantFormat) {
      alert('Please fill in all required fields: Name, User Format, and Assistant Format');
      return;
    }
    
    // Create updated template
    const updatedTemplate: Template = {
      id: template?.id || `template-${generateUUID()}`,
      name,
      description,
      isBuiltIn: false,
      isEditable: true,
      systemFormat: systemFormat || undefined,
      userFormat,
      assistantFormat,
      memoryFormat: memoryFormat || undefined,
      stopSequences: stopSequences.length > 0 ? stopSequences : undefined,
      detectionPatterns: detectionPatterns.length > 0 ? detectionPatterns : undefined
    };
    
    onSave(updatedTemplate);
  };
  
  const handleAddStopSequence = () => {
    if (!newStopSequence) return;
    
    setStopSequences([...stopSequences, newStopSequence]);
    setNewStopSequence('');
  };
  
  const handleRemoveStopSequence = (index: number) => {
    setStopSequences(stopSequences.filter((_, i) => i !== index));
  };
  
  const handleAddDetectionPattern = () => {
    if (!newDetectionPattern) return;
    
    setDetectionPatterns([...detectionPatterns, newDetectionPattern]);
    setNewDetectionPattern('');
  };
  
  const handleRemoveDetectionPattern = (index: number) => {
    setDetectionPatterns(detectionPatterns.filter((_, i) => i !== index));
  };
  
  const isDisabled = template?.isBuiltIn && !isNew;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-stone-800">
        <h3 className="text-lg font-medium">
          {isNew ? 'Create New Template' : 'Edit Template'}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="p-2 rounded-lg flex items-center gap-1 hover:bg-red-900/50 transition-colors"
          >
            <X size={16} />
            <span>Cancel</span>
          </button>
          <button
            onClick={handleSave}
            disabled={isDisabled}
            className={`p-2 rounded-lg flex items-center gap-1 ${
              isDisabled 
                ? 'bg-green-900/30 text-green-500/50 cursor-not-allowed' 
                : 'bg-green-900/50 hover:bg-green-900 text-green-500'
            } transition-colors`}
          >
            <Save size={16} />
            <span>Save</span>
          </button>
        </div>
      </div>
      
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isDisabled}
                placeholder="Template Name"
                className={`w-full px-3 py-2 bg-stone-900 rounded-lg ${
                  isDisabled ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isDisabled}
                placeholder="Template Description"
                className={`w-full px-3 py-2 bg-stone-900 rounded-lg ${
                  isDisabled ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              />
            </div>
          </div>
          
          {/* Memory Format */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Memory Format
            </label>
            <HighlightedTextArea
              value={memoryFormat}
              onChange={setMemoryFormat}
              readOnly={isDisabled}
              className={`w-full h-32 bg-stone-900 rounded-lg ${
                isDisabled ? 'opacity-70 cursor-not-allowed' : ''
              }`}
              placeholder="Format for memory/context section (optional)"
            />
            <div className="mt-1 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Info size={12} />
                {'Supports template variables like {{description}}, {{personality}}, etc.'}
              </span>
            </div>
          </div>
          
          {/* Prompt Formats */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-300">Prompt Formats</h4>
            
            {/* System */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                System
              </label>
              <HighlightedTextArea
                value={systemFormat}
                onChange={setSystemFormat}
                readOnly={isDisabled}
                className={`w-full h-24 bg-stone-900 rounded-lg ${
                  isDisabled ? 'opacity-70 cursor-not-allowed' : ''
                }`}
                placeholder="Format for system messages (optional)"
              />
            </div>
            
            {/* User */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                User
              </label>
              <HighlightedTextArea
                value={userFormat}
                onChange={setUserFormat}
                readOnly={isDisabled}
                className={`w-full h-24 bg-stone-900 rounded-lg ${
                  isDisabled ? 'opacity-70 cursor-not-allowed' : ''
                }`}
                placeholder="Format for user messages (required)"
              />
            </div>
            
            {/* Assistant */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Assistant
              </label>
              <HighlightedTextArea
                value={assistantFormat}
                onChange={setAssistantFormat}
                readOnly={isDisabled}
                className={`w-full h-24 bg-stone-900 rounded-lg ${
                  isDisabled ? 'opacity-70 cursor-not-allowed' : ''
                }`}
                placeholder="Format for assistant messages (required)"
              />
            </div>
          </div>
          
          {/* Stop Sequences */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">
                Stop Sequences
              </label>
            </div>
            
            <div className="space-y-2 mb-3">
              {stopSequences.length === 0 ? (
                <div className="text-sm text-gray-500 py-2">
                  No stop sequences added
                </div>
              ) : (
                stopSequences.map((sequence, index) => (
                  <div 
                    key={index} 
                    className="flex items-center gap-2 bg-stone-800 rounded-lg px-3 py-2"
                  >
                    <div className="flex-1 font-mono text-sm">
                      {sequence}
                    </div>
                    <button
                      onClick={() => handleRemoveStopSequence(index)}
                      disabled={isDisabled}
                      className={`p-1 rounded-md ${
                        isDisabled 
                          ? 'text-gray-500 cursor-not-allowed' 
                          : 'text-gray-400 hover:text-red-400 hover:bg-stone-700'
                      } transition-colors`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            
            {!isDisabled && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStopSequence}
                  onChange={(e) => setNewStopSequence(e.target.value)}
                  placeholder="Add a stop sequence"
                  className="flex-1 px-3 py-2 bg-stone-900 rounded-lg"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddStopSequence();
                    }
                  }}
                />
                <button
                  onClick={handleAddStopSequence}
                  className="p-2 rounded-lg bg-stone-800 hover:bg-stone-700 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            )}
          </div>
          
          {/* Detection Patterns */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">
                Auto-detection Patterns
              </label>
            </div>
            
            <div className="space-y-2 mb-3">
              {detectionPatterns.length === 0 ? (
                <div className="text-sm text-gray-500 py-2">
                  No detection patterns added
                </div>
              ) : (
                detectionPatterns.map((pattern, index) => (
                  <div 
                    key={index} 
                    className="flex items-center gap-2 bg-stone-800 rounded-lg px-3 py-2"
                  >
                    <div className="flex-1 font-mono text-sm">
                      {pattern}
                    </div>
                    <button
                      onClick={() => handleRemoveDetectionPattern(index)}
                      disabled={isDisabled}
                      className={`p-1 rounded-md ${
                        isDisabled 
                          ? 'text-gray-500 cursor-not-allowed' 
                          : 'text-gray-400 hover:text-red-400 hover:bg-stone-700'
                      } transition-colors`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            
            {!isDisabled && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDetectionPattern}
                  onChange={(e) => setNewDetectionPattern(e.target.value)}
                  placeholder="Add a detection pattern"
                  className="flex-1 px-3 py-2 bg-stone-900 rounded-lg"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddDetectionPattern();
                    }
                  }}
                />
                <button
                  onClick={handleAddDetectionPattern}
                  className="p-2 rounded-lg bg-stone-800 hover:bg-stone-700 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            )}
            
            <div className="mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Info size={12} />
                These patterns are used to auto-detect the template from API responses.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateEditor;