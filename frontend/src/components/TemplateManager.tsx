// src/components/TemplateManager.tsx
import React, { useState } from 'react';
import { Template } from '../types/templateTypes';
import TemplateList from './TemplateList';
import TemplateEditor from './TemplateEditor';
import { useTemplates } from '../contexts/TemplateContext';

interface TemplateManagerProps {
  // Any specific props can be added here
}

const TemplateManager: React.FC<TemplateManagerProps> = () => {
  const { 
    addTemplate, 
    updateTemplate 
  } = useTemplates();
  
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  
  // Handle template editing
  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setIsCreatingNew(false);
  };
  
  // Handle new template creation
  const handleNewTemplate = () => {
    setEditingTemplate(null);
    setIsCreatingNew(true);
  };
  
  // Handle template save
  const handleSaveTemplate = (template: Template) => {
    if (isCreatingNew) {
      addTemplate(template);
    } else {
      updateTemplate(template);
    }
    
    setEditingTemplate(null);
    setIsCreatingNew(false);
  };
  
  // Handle cancel editing
  const handleCancelEdit = () => {
    setEditingTemplate(null);
    setIsCreatingNew(false);
  };

  return (
    <div className="h-full flex">
      {/* Template List */}
      <div className="w-1/3 h-full border-r border-stone-800">
        <TemplateList 
          onEditTemplate={handleEditTemplate} 
          onNewTemplate={handleNewTemplate} 
        />
      </div>
      
      {/* Template Editor */}
      <div className="w-2/3 h-full">
        {editingTemplate || isCreatingNew ? (
          <TemplateEditor 
            template={editingTemplate} 
            onSave={handleSaveTemplate} 
            onCancel={handleCancelEdit}
            isNew={isCreatingNew}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p>Select a template to edit</p>
              <p>or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateManager;