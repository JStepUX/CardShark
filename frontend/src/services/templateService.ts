// src/services/templateService.ts
import { Template, TemplateExport } from '../types/templateTypes';

// Default built-in templates
const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'chatml',
    name: 'ChatML',
    description: 'General ChatML format used by many models',
    isBuiltIn: true,
    isEditable: false,
    systemFormat: '<|im_start|>system\n{{content}}<|im_end|>\n',
    userFormat: '<|im_start|>user\n{{content}}<|im_end|>\n',
    assistantFormat: '<|im_start|>assistant\n{{char}}: {{content}}<|im_end|>\n',
    detectionPatterns: ['<|im_start|>', '<|im_end|>'],
    stopSequences: [
      '<|im_end|>\\n<|im_start|>user',
      '<|im_end|>\\n<|im_start|>assistant',
      'User:',
      'Assistant:'
    ]
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'Format for Mistral models using [INST] tags',
    isBuiltIn: true,
    isEditable: false,
    systemFormat: '[INST] {{content}} [/INST]',
    userFormat: '[INST] {{content}} [/INST]',
    assistantFormat: '{{char}}: {{content}}',
    memoryFormat: '{{#if system}}[INST] {{system}} [/INST]\n{{/if}}Persona: {{description}}\nPersonality: {{personality}}\n[Scenario: {{scenario}}]',
    detectionPatterns: ['[INST]', '[/INST]'],
    stopSequences: [
      '[INST]',
      'User:',
      'Assistant:',
      '{{char}}:'
    ]
  },
  {
    id: 'llama',
    name: 'Llama',
    description: 'Format for Llama models',
    isBuiltIn: true,
    isEditable: false,
    systemFormat: '<|start_header_id|>system<|end_header_id|>\n\n{{content}}<|eot_id|>\n\n',
    userFormat: '<|start_header_id|>user<|end_header_id|>\n\n{{content}}<|eot_id|>\n\n',
    assistantFormat: '<|start_header_id|>assistant<|end_header_id|>\n\n{{char}}: {{content}}<|eot_id|>\n\n',
    detectionPatterns: ['<|start_header_id|>', '<|end_header_id|>', '<|eot_id|>'],
    stopSequences: [
      '<|eot_id|>',
      'User:',
      'Assistant:'
    ]
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Format for Google Gemini models',
    isBuiltIn: true,
    isEditable: false,
    userFormat: 'User: {{content}}\n',
    assistantFormat: 'Assistant: {{char}}: {{content}}\n',
    detectionPatterns: ['User:', 'Assistant:'],
    stopSequences: [
      'User:',
      'Assistant:'
    ]
  },
  {
    id: 'claude',
    name: 'Claude',
    description: 'Format for Anthropic Claude models',
    isBuiltIn: true,
    isEditable: false,
    systemFormat: 'System: {{content}}\n\n',
    userFormat: 'Human: {{content}}\n\n',
    assistantFormat: 'Assistant: {{char}}: {{content}}\n\n',
    detectionPatterns: ['Human:', 'Assistant:'],
    stopSequences: [
      'Human:',
      'Assistant:'
    ]
  }
];

class TemplateService {
  private templates: Template[] = [];
  private localStorageKey = 'cardshark_custom_templates';
  
  /**
   * Initialize the template service
   * Load built-in templates and any custom templates
   */
  constructor() {
    this.templates = [...DEFAULT_TEMPLATES];
    this.loadCustomTemplates();
  }
  
  /**
   * Get all templates
   */
  getAllTemplates(): Template[] {
    return [...this.templates];
  }
  
  /**
   * Get built-in templates only
   */
  getBuiltInTemplates(): Template[] {
    return this.templates.filter(t => t.isBuiltIn);
  }
  
  /**
   * Get custom templates only
   */
  getCustomTemplates(): Template[] {
    return this.templates.filter(t => !t.isBuiltIn);
  }
  
  /**
   * Get a template by ID
   */
  getTemplateById(id: string): Template | undefined {
    return this.templates.find(t => t.id === id);
  }
  
  /**
   * Get a template by name
   */
  getTemplateByName(name: string): Template | undefined {
    return this.templates.find(t => t.name === name);
  }
  
  /**
   * Add a new template
   * Returns true if added successfully, false if a template with the same ID already exists
   */
  addTemplate(template: Template): boolean {
    // Check if a template with the same ID already exists
    if (this.templates.some(t => t.id === template.id)) {
      return false;
    }
    
    this.templates.push(template);
    this.saveCustomTemplates();
    return true;
  }
  
  /**
   * Update an existing template
   * Returns true if updated successfully, false if the template doesn't exist
   */
  updateTemplate(template: Template): boolean {
    const index = this.templates.findIndex(t => t.id === template.id);
    if (index === -1) {
      return false;
    }
    
    // Don't allow editing built-in templates
    if (this.templates[index].isBuiltIn && !template.isBuiltIn) {
      return false;
    }
    
    this.templates[index] = template;
    this.saveCustomTemplates();
    return true;
  }
  
  /**
   * Delete a template
   * Returns true if deleted successfully, false if the template doesn't exist or is built-in
   */
  deleteTemplate(id: string): boolean {
    const index = this.templates.findIndex(t => t.id === id);
    if (index === -1) {
      return false;
    }
    
    // Don't allow deleting built-in templates
    if (this.templates[index].isBuiltIn) {
      return false;
    }
    
    this.templates.splice(index, 1);
    this.saveCustomTemplates();
    return true;
  }
  
  /**
   * Create a copy of a template
   */
  duplicateTemplate(id: string): Template | undefined {
    const template = this.getTemplateById(id);
    if (!template) {
      return undefined;
    }
    
    const copy: Template = {
      ...template,
      id: `${template.id}-copy-${Date.now()}`,
      name: `${template.name} Copy`,
      isBuiltIn: false,
      isEditable: true
    };
    
    this.addTemplate(copy);
    return copy;
  }
  
  /**
   * Export templates to a file
   */
  exportTemplates(includeBuiltIn: boolean = false): TemplateExport {
    const templatesToExport = includeBuiltIn 
      ? this.templates 
      : this.templates.filter(t => !t.isBuiltIn);
      
    return {
      templates: templatesToExport,
      version: '1.0',
      exportedAt: new Date().toISOString()
    };
  }
  
  /**
   * Import templates from file data
   * Returns number of templates imported
   */
  importTemplates(exportData: TemplateExport): number {
    if (!exportData || !exportData.templates || !Array.isArray(exportData.templates)) {
      return 0;
    }
    
    let importCount = 0;
    
    for (const template of exportData.templates) {
      // Skip built-in templates in the import
      if (template.isBuiltIn) {
        continue;
      }
      
      // Create a new template with a fresh ID to avoid conflicts
      const newTemplate: Template = {
        ...template,
        id: `${template.id}-imported-${Date.now()}`,
        isBuiltIn: false,
        isEditable: true
      };
      
      if (this.addTemplate(newTemplate)) {
        importCount++;
      }
    }
    
    if (importCount > 0) {
      this.saveCustomTemplates();
    }
    
    return importCount;
  }
  
  /**
   * Reset to default templates
   */
  resetToDefaults(): void {
    this.templates = [...DEFAULT_TEMPLATES];
    this.saveCustomTemplates();
  }
  
  /**
   * Load custom templates from localStorage
   */
  private loadCustomTemplates(): void {
    try {
      const savedTemplates = localStorage.getItem(this.localStorageKey);
      if (savedTemplates) {
        const customTemplates = JSON.parse(savedTemplates) as Template[];
        
        // Add custom templates, preserving built-in ones
        for (const template of customTemplates) {
          if (!this.templates.some(t => t.id === template.id)) {
            this.templates.push(template);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load custom templates:', error);
    }
  }
  
  /**
   * Save custom templates to localStorage
   */
  private saveCustomTemplates(): void {
    try {
      const customTemplates = this.templates.filter(t => !t.isBuiltIn);
      localStorage.setItem(this.localStorageKey, JSON.stringify(customTemplates));
    } catch (error) {
      console.error('Failed to save custom templates:', error);
    }
  }
  
  /**
   * Load templates from file system (server-side)
   * This would be implemented in the backend, but defined here for API consistency
   */
  async loadFromFileSystem(): Promise<void> {
    try {
      const response = await fetch('/api/templates');
      const data = await response.json();
      
      if (data.success && data.templates) {
        // Merge with built-in templates
        const customTemplates = data.templates.filter(
          (t: Template) => !this.templates.some(bt => bt.id === t.id && bt.isBuiltIn)
        );
        
        // Add custom templates
        for (const template of customTemplates) {
          if (!this.templates.some(t => t.id === template.id)) {
            this.templates.push({...template, isBuiltIn: false, isEditable: true});
          }
        }
      }
    } catch (error) {
      console.error('Failed to load templates from file system:', error);
    }
  }
  
  /**
   * Save templates to file system (server-side)
   * This would be implemented in the backend, but defined here for API consistency
   */
  async saveToFileSystem(): Promise<boolean> {
    try {
      const customTemplates = this.templates.filter(t => !t.isBuiltIn);
      
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ templates: customTemplates })
      });
      
      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Failed to save templates to file system:', error);
      return false;
    }
  }
}

// Create and export a singleton instance
export const templateService = new TemplateService();