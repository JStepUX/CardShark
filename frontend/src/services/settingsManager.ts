import { GenerationSettings } from "../types/settings";

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  temperature: 1.05,
  top_p: 0.92,
  top_k: 100,
  dynatemp_enabled: false,  // Boolean flag approach
  dynatemp_min: 0.7,        // Min temperature
  dynatemp_max: 1.2,        // Max temperature
  dynatemp_exponent: 1.0,   // Exponent value
};

export const loadGenerationSettings = (savedSettings?: Partial<GenerationSettings>): GenerationSettings => {
  if (!savedSettings) return DEFAULT_GENERATION_SETTINGS;
  
  return {
    ...DEFAULT_GENERATION_SETTINGS,
    ...savedSettings,
    // Ensure dynatemp settings are properly loaded with defaults
    dynatemp_enabled: savedSettings.dynatemp_enabled ?? DEFAULT_GENERATION_SETTINGS.dynatemp_enabled,
    dynatemp_min: savedSettings.dynatemp_min ?? DEFAULT_GENERATION_SETTINGS.dynatemp_min,
    dynatemp_max: savedSettings.dynatemp_max ?? DEFAULT_GENERATION_SETTINGS.dynatemp_max,
    dynatemp_exponent: savedSettings.dynatemp_exponent ?? DEFAULT_GENERATION_SETTINGS.dynatemp_exponent
  };
};