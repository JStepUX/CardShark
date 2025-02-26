// src/contexts/TemplateContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Template, TemplateExport } from '../types/templateTypes';
import { templateService } from '../services/templateService';

interface TemplateContextType {
  templates: Template[];
  selectedTemplate: Template | null;
  isLoading: boolean;
  error: string | null;
  
  // Template operations
  selectTemplate: (id: string | null) => void;
  addTemplate: (template: Template) => boolean;
  updateTemplate: (template: Template) => boolean;
  deleteTemplate: (id: string) => boolean;
  duplicateTemplate: (id: string) => Template | undefined;
  
  // Import/Export
  exportTemplates: (includeBuiltIn?: boolean) => TemplateExport;
  importTemplates: (exportData: TemplateExport) => number;
  
  // Remote operations
  loadFromServer: () => Promise<void>;
  saveToServer: () => Promise<boolean>;
}

const TemplateContext = createContext<TemplateContextType | null>(null);

export const TemplateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize templates
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Load templates from service
        setTemplates(templateService.getAllTemplates());
        
        // Try to load from server too
        try {
          await templateService.loadFromFileSystem();
          setTemplates(templateService.getAllTemplates());
        } catch (err) {
          console.warn('Failed to load templates from server, using local only', err);
        }
      } catch (e) {
        setError('Failed to load templates');
        console.error('Template loading error:', e);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadTemplates();
  }, []);

  // Computed value for selected template
  const selectedTemplate = selectedTemplateId 
    ? templates.find(t => t.id === selectedTemplateId) || null
    : null;

  // Template operations
  const selectTemplate = (id: string | null) => {
    setSelectedTemplateId(id);
  };

  const addTemplate = (template: Template): boolean => {
    try {
      const result = templateService.addTemplate(template);
      if (result) {
        setTemplates(templateService.getAllTemplates());
      }
      return result;
    } catch (e) {
      setError('Failed to add template');
      console.error('Template addition error:', e);
      return false;
    }
  };

  const updateTemplate = (template: Template): boolean => {
    try {
      const result = templateService.updateTemplate(template);
      if (result) {
        setTemplates(templateService.getAllTemplates());
      }
      return result;
    } catch (e) {
      setError('Failed to update template');
      console.error('Template update error:', e);
      return false;
    }
  };

  const deleteTemplate = (id: string): boolean => {
    try {
      const result = templateService.deleteTemplate(id);
      if (result) {
        setTemplates(templateService.getAllTemplates());
        if (selectedTemplateId === id) {
          setSelectedTemplateId(null);
        }
      }
      return result;
    } catch (e) {
      setError('Failed to delete template');
      console.error('Template deletion error:', e);
      return false;
    }
  };

  const duplicateTemplate = (id: string): Template | undefined => {
    try {
      const result = templateService.duplicateTemplate(id);
      if (result) {
        setTemplates(templateService.getAllTemplates());
      }
      return result;
    } catch (e) {
      setError('Failed to duplicate template');
      console.error('Template duplication error:', e);
      return undefined;
    }
  };

  // Import/Export
  const exportTemplates = (includeBuiltIn: boolean = false): TemplateExport => {
    return templateService.exportTemplates(includeBuiltIn);
  };

  const importTemplates = (exportData: TemplateExport): number => {
    try {
      const count = templateService.importTemplates(exportData);
      if (count > 0) {
        setTemplates(templateService.getAllTemplates());
      }
      return count;
    } catch (e) {
      setError('Failed to import templates');
      console.error('Template import error:', e);
      return 0;
    }
  };

  // Server operations
  const loadFromServer = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      await templateService.loadFromFileSystem();
      setTemplates(templateService.getAllTemplates());
    } catch (e) {
      setError('Failed to load templates from server');
      console.error('Template server load error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const saveToServer = async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await templateService.saveToFileSystem();
      return result;
    } catch (e) {
      setError('Failed to save templates to server');
      console.error('Template server save error:', e);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const contextValue: TemplateContextType = {
    templates,
    selectedTemplate,
    isLoading,
    error,
    selectTemplate,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
    exportTemplates,
    importTemplates,
    loadFromServer,
    saveToServer
  };

  return (
    <TemplateContext.Provider value={contextValue}>
      {children}
    </TemplateContext.Provider>
  );
};

export const useTemplates = () => {
  const context = useContext(TemplateContext);
  if (!context) {
    throw new Error('useTemplates must be used within a TemplateProvider');
  }
  return context;
};