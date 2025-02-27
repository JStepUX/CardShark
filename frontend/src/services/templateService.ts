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
    // Ensure we're returning a safe copy of templates with valid properties
    return this.templates.map(template => this.validateTemplate(template));
  }
  
  /**
   * Get built-in templates only
   */
  getBuiltInTemplates(): Template[] {
    return this.templates
      .filter(t => t.isBuiltIn)
      .map(template => this.validateTemplate(template));
  }
  
  /**
   * Get custom templates only
   */
  getCustomTemplates(): Template[] {
    return this.templates
      .filter(t => !t.isBuiltIn)
      .map(template => this.validateTemplate(template));
  }
  
  /**
   * Get a template by ID
   */
  getTemplateById(id: string): Template | undefined {
    const template = this.templates.find(t => t.id === id);
    return template ? this.validateTemplate(template) : undefined;
  }
  
  /**
   * Get a template by name
   */
  getTemplateByName(name: string): Template | undefined {
    const template = this.templates.find(t => t.name === name);
    return template ? this.validateTemplate(template) : undefined;
  }
  
  /**
   * Validate and normalize a template
   */
  private validateTemplate(template: any): Template {
    // Create a new validated template
    return {
      id: template.id || `template-${Date.now()}`,
      name: template.name || 'Unnamed Template',
      description: template.description || '',
      isBuiltIn: Boolean(template.isBuiltIn),
      isEditable: template.isBuiltIn ? false : Boolean(template.isEditable !== false),
      systemFormat: template.systemFormat || undefined,
      userFormat: template.userFormat || '[INST] {{content}} [/INST]',
      assistantFormat: template.assistantFormat || '{{char}}: {{content}}',
      memoryFormat: template.memoryFormat || undefined,
      detectionPatterns: Array.isArray(template.detectionPatterns) ? template.detectionPatterns : [],
      stopSequences: Array.isArray(template.stopSequences) ? template.stopSequences : []
    };
  }
  
  /**
   * Add a new template
   * Returns true if added successfully, false if a template with the same ID already exists
   */
  addTemplate(template: Template): boolean {
    // Validate the template
    const validatedTemplate = this.validateTemplate(template);
    
    // Check if a template with the same ID already exists
    if (this.templates.some(t => t.id === validatedTemplate.id)) {
      console.warn(`Template with ID ${validatedTemplate.id} already exists`);
      return false;
    }
    
    this.templates.push(validatedTemplate);
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
      console.warn(`Template with ID ${template.id} not found`);
      return false;
    }
    
    // Don't allow editing built-in templates
    if (this.templates[index].isBuiltIn && !template.isBuiltIn) {
      console.warn(`Cannot modify built-in template: ${template.id}`);
      return false;
    }
    
    // Validate the template
    const validatedTemplate = this.validateTemplate(template);
    
    this.templates[index] = validatedTemplate;
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
      console.warn(`Template with ID ${id} not found`);
      return false;
    }
    
    // Don't allow deleting built-in templates
    if (this.templates[index].isBuiltIn) {
      console.warn(`Cannot delete built-in template: ${id}`);
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
      console.warn(`Template with ID ${id} not found for duplication`);
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
      
    // Validate each template before export
    const validatedTemplates = templatesToExport.map(t => this.validateTemplate(t));
    
    return {
      templates: validatedTemplates,
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
      console.warn('Invalid export data format');
      return 0;
    }
    
    let importCount = 0;
    
    for (const template of exportData.templates) {
      // Skip built-in templates in the import
      if (template.isBuiltIn) {
        continue;
      }
      
      try {
        // Validate template before import
        const validatedTemplate = this.validateTemplate(template);
        
        // Create a new template with a fresh ID to avoid conflicts
        const newTemplate: Template = {
          ...validatedTemplate,
          id: `${validatedTemplate.id}-imported-${Date.now()}`,
          isBuiltIn: false,
          isEditable: true
        };
        
        if (this.addTemplate(newTemplate)) {
          importCount++;
        }
      } catch (error) {
        console.error(`Failed to import template: ${template.id || 'unknown'}`, error);
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
        let customTemplates: Template[] = [];
        
        try {
          customTemplates = JSON.parse(savedTemplates);
        } catch (error) {
          console.error('Failed to parse stored templates:', error);
          return;
        }
        
        // Validate custom templates
        if (!Array.isArray(customTemplates)) {
          console.warn('Stored templates is not an array');
          return;
        }
        
        // Add custom templates, preserving built-in ones
        for (const template of customTemplates) {
          try {
            // Skip if template is invalid or doesn't have an ID
            if (!template || !template.id) continue;
            
            // Skip if this template ID already exists
            if (this.templates.some(t => t.id === template.id)) continue;
            
            // Add the template (it will be validated on access)
            this.templates.push({
              ...template,
              isBuiltIn: false,  // Force custom templates to not be built-in
              isEditable: true   // Force custom templates to be editable
            });
          } catch (error) {
            console.error(`Failed to load custom template: ${template?.id || 'unknown'}`, error);
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
      if (!response.ok) {
        throw new Error(`Failed to load templates: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.templates)) {
        // Merge with built-in templates
        const customTemplates = data.templates.filter(
          (t: Template) => t && t.id && !this.templates.some(bt => bt.id === t.id && bt.isBuiltIn)
        );
        
        // Add custom templates
        for (const template of customTemplates) {
          try {
            if (!template || !template.id) continue;
            
            if (!this.templates.some(t => t.id === template.id)) {
              this.templates.push({
                ...template,
                isBuiltIn: false,
                isEditable: true
              });
            }
          } catch (error) {
            console.error(`Failed to load template from server: ${template?.id || 'unknown'}`, error);
          }
        }
      } else {
        console.warn('Invalid response format from server', data);
      }
    } catch (error) {
      console.error('Failed to load templates from file system:', error);
      throw error; // Re-throw to allow caller to handle
    }
  }
  
  /**
   * Save templates to file system (server-side)
   * This would be implemented in the backend, but defined here for API consistency
   */
  async saveToFileSystem(): Promise<boolean> {
    try {
      const customTemplates = this.templates
        .filter(t => !t.isBuiltIn)
        .map(t => this.validateTemplate(t));
      
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ templates: customTemplates })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save templates: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Failed to save templates to file system:', error);
      return false;
    }
  }
}

// Create and export a singleton instance
export const templateService = new TemplateService();