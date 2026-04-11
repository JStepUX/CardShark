import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// --- Mocks (must be before component import) ---

const mockSetAPIConfig = vi.fn();
const mockUpdateSettings = vi.fn().mockResolvedValue(undefined);

// Capture what gets sent to the debounced persist function
let capturedPersistArgs: unknown[] = [];

vi.mock('../../utils/performance', () => ({
  debounce: (fn: (...args: unknown[]) => void) => {
    return (...args: unknown[]) => {
      capturedPersistArgs = args;
      fn(...args);
    };
  },
}));

// Stable object references — React 18 concurrent mode re-renders cause
// infinite loops if the mock hook returns new object refs each call.
const stableGenSettings = {};
const stableApiConfig = {
  id: 'api_1',
  name: 'Test API',
  provider: 'KoboldCPP',
  model: 'test-model',
  enabled: true,
  templateId: 'chatml',
  generation_settings: stableGenSettings,
};

vi.mock('../../contexts/APIConfigContext', () => ({
  useAPIConfig: () => ({
    apiConfig: stableApiConfig,
    activeApiId: 'api_1',
    setAPIConfig: mockSetAPIConfig,
  }),
}));

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    updateSettings: mockUpdateSettings,
    settings: {},
    isLoading: false,
  }),
}));

const mockTemplates = [
  { id: 'chatml', name: 'ChatML (OpenAI)', isBuiltIn: true },
  { id: 'llama3', name: 'Llama 3', isBuiltIn: true },
  { id: 'mistral', name: 'Mistral', isBuiltIn: true },
  { id: 'custom-1', name: 'My Custom', isBuiltIn: false },
];

vi.mock('../../services/templateService', () => ({
  templateService: {
    getAllTemplates: () => mockTemplates,
  },
}));

import { SamplerSettingsPanel } from '../SidePanel/SamplerSettingsPanel';

describe('SamplerSettingsPanel — Template dropdown', () => {
  beforeEach(() => {
    mockSetAPIConfig.mockClear();
    mockUpdateSettings.mockClear();
    capturedPersistArgs = [];
  });

  it('renders the template dropdown with all templates', () => {
    const { unmount } = render(<SamplerSettingsPanel onClose={vi.fn()} />);

    const select = screen.getByLabelText('Chat Template') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('chatml');

    // All templates + the "no template" option
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(5); // 4 templates + 1 "-- No Template --"
    expect(options[0].textContent).toBe('-- No Template --');
    expect(options[1].textContent).toBe('ChatML (OpenAI)');
    unmount();
  });

  it('calls setAPIConfig with the new templateId on change', () => {
    const { unmount } = render(<SamplerSettingsPanel onClose={vi.fn()} />);

    const select = screen.getByLabelText('Chat Template');
    fireEvent.change(select, { target: { value: 'llama3' } });

    expect(mockSetAPIConfig).toHaveBeenCalledTimes(1);
    const updatedConfig = mockSetAPIConfig.mock.calls[0][0];
    expect(updatedConfig.templateId).toBe('llama3');
    unmount();
  });

  it('sends same config object for state and persistence when clearing template', () => {
    const { unmount } = render(<SamplerSettingsPanel onClose={vi.fn()} />);

    const select = screen.getByLabelText('Chat Template');
    fireEvent.change(select, { target: { value: '' } });

    // In-memory state uses undefined (correct for TypeScript types)
    const inMemoryConfig = mockSetAPIConfig.mock.calls[0][0];
    expect(inMemoryConfig.templateId).toBeUndefined();

    // Persistence payload matches — undefinedToNull in updateSettings
    // converts to null on the wire, so the component doesn't need to
    const [, persistedConfig] = capturedPersistArgs as [string, Record<string, unknown>];
    expect(persistedConfig.templateId).toBeUndefined();
    unmount();
  });

  it('appears above the Quick Tune section', () => {
    const { container, unmount } = render(<SamplerSettingsPanel onClose={vi.fn()} />);

    const scrollable = container.querySelector('.overflow-y-auto');
    expect(scrollable).toBeTruthy();

    const children = Array.from(scrollable!.children);
    const templateDiv = children.find(el =>
      el.querySelector('label')?.textContent === 'Chat Template'
    );
    const quickTuneDetails = children.find(el =>
      el.querySelector('summary')?.textContent?.includes('Quick Tune')
    );

    expect(templateDiv).toBeTruthy();
    expect(quickTuneDetails).toBeTruthy();

    const templateIdx = children.indexOf(templateDiv!);
    const quickTuneIdx = children.indexOf(quickTuneDetails!);
    expect(templateIdx).toBeLessThan(quickTuneIdx);
    unmount();
  });
});
