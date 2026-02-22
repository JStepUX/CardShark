// src/components/TemplateList.tsx
import React, { useState } from 'react';
import { Copy, Pencil, Trash2, Plus, FileDown as Download, FileInput as Upload } from 'lucide-react';
import { Template } from '../types/templateTypes';
import { useTemplates } from '../contexts/TemplateContext';
import Button from './common/Button';

interface TemplateListProps {
  onEditTemplate: (template: Template) => void;
  onNewTemplate: () => void;
}

const TemplateList: React.FC<TemplateListProps> = ({ onEditTemplate, onNewTemplate }) => {
  const { 
    templates, 
    selectTemplate, 
    selectedTemplate,
    duplicateTemplate,
    deleteTemplate,
    exportTemplates,
    importTemplates
  } = useTemplates();
  
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter templates based on search term
  const filteredTemplates = templates.filter(template => {
    // Ensure template is valid and has required properties
    if (!template || typeof template !== 'object') return false;
    
    const templateName = template.name || '';
    const templateDescription = template.description || '';
    
    // Check if search term is included in name or description
    return searchTerm === '' || 
      templateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      templateDescription.toLowerCase().includes(searchTerm.toLowerCase());
  });
  
  // Group templates by built-in vs custom
  const builtInTemplates = filteredTemplates.filter(t => t.isBuiltIn);
  const customTemplates = filteredTemplates.filter(t => !t.isBuiltIn);
  
  // Handle template duplication
  const handleDuplicate = (templateId: string) => {
    const duplicated = duplicateTemplate(templateId);
    if (duplicated) {
      selectTemplate(duplicated.id);
      onEditTemplate(duplicated);
    }
  };
  
  // Handle template deletion with confirmation
  const handleDelete = (templateId: string) => {
    if (window.confirm('Are you sure you want to delete this template? This cannot be undone.')) {
      deleteTemplate(templateId);
    }
  };
  
  // Handle export to file
  const handleExport = () => {
    try {
      const data = exportTemplates(false); // Don't include built-in templates
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cardshark-templates-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export templates:', err);
      alert('Failed to export templates');
    }
  };
  
  // Handle import from file
  const handleImport = () => {
    // Create file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    // Handle file selection
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const data = JSON.parse(content);
          
          const importCount = importTemplates(data);
          if (importCount > 0) {
            alert(`Successfully imported ${importCount} templates`);
          } else {
            alert('No templates were imported');
          }
        } catch (err) {
          console.error('Failed to import templates:', err);
          alert('Failed to import templates: Invalid format');
        }
      };
      
      reader.readAsText(file);
    };
    
    // Trigger file selection
    input.click();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header with search and actions */}
      <div className="flex-none p-4 border-b border-stone-800">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">Templates</h3>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<Upload size={16} />}
              onClick={handleImport}
              title="Import Templates"
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Download size={16} />}
              onClick={handleExport}
              title="Export Templates"
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Plus size={16} />}
              onClick={onNewTemplate}
              title="New Template"
            />
          </div>
        </div>
        
        {/* Search input */}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search templates..."
          className="w-full px-3 py-2 bg-stone-900 rounded-lg text-sm"
        />
      </div>
      
      {/* Template list */}
      <div className="flex-1 overflow-y-auto p-4">
        {templates.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No templates found
          </div>
        ) : (
          <div className="space-y-4">
            {/* Built-in templates */}
            {builtInTemplates.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                  Built-in Templates
                </h4>
                <div className="space-y-2">
                  {builtInTemplates.map(template => (
                    <TemplateItem
                      key={template.id}
                      template={template}
                      isSelected={selectedTemplate?.id === template.id}
                      onSelect={() => selectTemplate(template.id)}
                      onEdit={() => onEditTemplate(template)}
                      onDuplicate={() => handleDuplicate(template.id)}
                      onDelete={() => handleDelete(template.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* Custom templates */}
            {customTemplates.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2">
                  Custom Templates
                </h4>
                <div className="space-y-2">
                  {customTemplates.map(template => (
                    <TemplateItem
                      key={template.id}
                      template={template}
                      isSelected={selectedTemplate?.id === template.id}
                      onSelect={() => selectTemplate(template.id)}
                      onEdit={() => onEditTemplate(template)}
                      onDuplicate={() => handleDuplicate(template.id)}
                      onDelete={() => handleDelete(template.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {filteredTemplates.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                No templates match your search
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface TemplateItemProps {
  template: Template;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const TemplateItem: React.FC<TemplateItemProps> = ({
  template,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete
}) => {
  return (
    <div 
      className={`p-3 rounded-lg transition-colors cursor-pointer ${
        isSelected ? 'bg-stone-700' : 'bg-stone-800 hover:bg-stone-700'
      }`}
      onClick={onSelect}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium truncate">{template.name || 'Unnamed Template'}</h4>
          <p className="text-sm text-gray-400 truncate">{template.description || 'No description'}</p>
        </div>
        <div className="flex items-center space-x-1 ml-4">
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil size={14} className={!template.isEditable ? 'opacity-30' : ''} />}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit"
            disabled={!template.isEditable}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Copy size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="Duplicate"
          />
          {!template.isBuiltIn && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete"
              className="hover:text-red-400"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateList;