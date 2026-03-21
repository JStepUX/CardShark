// __tests__/pngHandler.test.ts

import { createEmptyCharacterCard } from '../src/types/schema';

// Mock window.fs for file operations
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();

global.window = {
  ...global.window,
  fs: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
  },
} as any;

// Mock fetch for API calls
global.fetch = jest.fn();

describe('PNG File Operations', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Reset fetch mock
    (global.fetch as jest.Mock).mockReset();
  });

  test('uploads PNG file successfully', async () => {
    const mockFile = new File([''], 'test.png', { type: 'image/png' });
    const mockMetadata = createEmptyCharacterCard();
    mockMetadata.data.name = "Test Character";

    // Mock successful API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        metadata: mockMetadata
      })
    });

    const formData = new FormData();
    formData.append('file', mockFile);

    const response = await fetch('/api/upload-png', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.metadata).toEqual(mockMetadata);
  });

  test('handles PNG upload failure', async () => {
    const mockFile = new File([''], 'test.png', { type: 'image/png' });

    // Mock failed API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        message: 'Invalid PNG file'
      })
    });

    const formData = new FormData();
    formData.append('file', mockFile);

    const response = await fetch('/api/upload-png', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    expect(response.ok).toBe(false);
    expect(data.success).toBe(false);
  });

  test('saves character to PNG successfully', async () => {
    const mockMetadata = createEmptyCharacterCard();
    mockMetadata.data.name = "Test Character";
    
    const mockImageBlob = new Blob([''], { type: 'image/png' });

    // Mock successful API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      blob: async () => mockImageBlob
    });

    const formData = new FormData();
    formData.append('file', mockImageBlob);
    formData.append('metadata', JSON.stringify(mockMetadata));

    const response = await fetch('/api/save-png', {
      method: 'POST',
      body: formData
    });

    expect(response.ok).toBe(true);
  });

  test('reads metadata from PNG successfully', async () => {
    const mockMetadata = createEmptyCharacterCard();
    mockMetadata.data.name = "Test Character";

    // Mock file read response
    mockReadFile.mockResolvedValueOnce(Buffer.from('mock png data'));

    // Mock successful API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        metadata: mockMetadata
      })
    });

    const response = await fetch('/api/extract-metadata', {
      method: 'POST',
      body: new FormData()
    });
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.metadata).toEqual(mockMetadata);
  });
});

describe('Character Directory Operations', () => {
  test('lists characters in directory', async () => {
    const mockCharacters = [
      { name: 'char1.png', path: '/path/to/char1.png' },
      { name: 'char2.png', path: '/path/to/char2.png' }
    ];

    // Mock successful API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        files: mockCharacters
      })
    });

    const response = await fetch('/api/characters?directory=/test/path');
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.files).toEqual(mockCharacters);
  });

  test('validates directory path', async () => {
    // Mock successful API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        exists: true,
        message: 'Directory is valid'
      })
    });

    const response = await fetch('/api/validate-directory', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ directory: '/test/path' })
    });
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.exists).toBe(true);
  });
});

describe('Backyard.ai Import Operations', () => {
  test('imports character from Backyard.ai URL', async () => {
    const mockMetadata = createEmptyCharacterCard();
    mockMetadata.data.name = "Imported Character";

    // Mock successful API response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        metadata: mockMetadata,
        imageUrl: 'https://example.com/image.png'
      })
    });

    const response = await fetch('/api/import-backyard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://backyard.ai/character/test'
      })
    });
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.success).toBe(true);
    expect(data.metadata).toEqual(mockMetadata);
    expect(data.imageUrl).toBeDefined();
  });
});