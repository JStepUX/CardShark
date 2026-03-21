import { vi, Mock } from 'vitest';
import {
  transformKoboldPayload,
  getKoboldStreamEndpoint,
  isKoboldResponse,
  wakeKoboldServer
} from './koboldTransformer';

// Mock fetch for wakeKoboldServer tests
vi.stubGlobal('fetch', vi.fn());

describe('koboldTransformer', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  describe('transformKoboldPayload', () => {
    it('should transform a basic payload correctly', () => {
      // Arrange
      const mockPayload = {
        api_config: {
          generation_settings: {
            max_length: 200,
            temperature: 0.7
          }
        },
        generation_params: {
          prompt: 'Hello, world!',
          memory: 'Test memory',
          stop_sequence: ['User:', 'Assistant:']
        }
      };
      
      // Act
      const result = transformKoboldPayload(mockPayload);
      
      // Assert
      expect(result).toMatchObject({
        prompt: 'Hello, world!',
        memory: 'Test memory',
        stop_sequence: ['User:', 'Assistant:'],
        max_length: 200,
        temperature: 0.7,
        stream: true
      });
    });
    
    it('should construct memory from character data if memory is empty', () => {
      // Arrange
      const mockPayload = {
        api_config: {
          generation_settings: {}
        },
        generation_params: {
          prompt: 'Hello',
          memory: '',
          character_data: {
            data: {
              system_prompt: 'System prompt',
              description: 'Character description',
              personality: 'Character personality',
              scenario: 'Character scenario'
            }
          }
        }
      };
      
      // Act
      const result = transformKoboldPayload(mockPayload);
      
      // Assert
      expect(result.memory).toContain('System prompt');
      expect(result.memory).toContain('Persona: Character description');
      expect(result.memory).toContain('Personality: Character personality');
      expect(result.memory).toContain('Scenario: Character scenario');
    });
  });
  
  describe('getKoboldStreamEndpoint', () => {
    it('should normalize URL and return correct endpoint', () => {
      // Act
      const result = getKoboldStreamEndpoint('http://localhost:5001/');
      
      // Assert
      expect(result).toBe('http://localhost:5001/api/extra/generate/stream');
    });
    
    it('should use default URL if none provided', () => {
      // Act
      const result = getKoboldStreamEndpoint('');
      
      // Assert
      expect(result).toBe('http://localhost:5001/api/extra/generate/stream');
    });
  });
  
  describe('isKoboldResponse', () => {
    it('should identify Kobold response by server header', () => {
      // Arrange
      const mockResponse = {
        headers: {
          get: vi.fn((header) => {
            if (header === 'server') return 'KoboldCPP/1.0';
            return null;
          })
        }
      } as unknown as Response;
      
      // Act
      const result = isKoboldResponse(mockResponse);
      
      // Assert
      expect(result).toBe(true);
    });
    
    it('should identify Kobold response by x-koboldcpp-version header', () => {
      // Arrange
      const mockResponse = {
        headers: {
          get: vi.fn((header) => {
            if (header === 'x-koboldcpp-version') return '1.0';
            return null;
          })
        }
      } as unknown as Response;
      
      // Act
      const result = isKoboldResponse(mockResponse);
      
      // Assert
      expect(result).toBe(true);
    });
    
    it('should return false for non-Kobold response', () => {
      // Arrange
      const mockResponse = {
        headers: {
          get: vi.fn(() => null)
        }
      } as unknown as Response;
      
      // Act
      const result = isKoboldResponse(mockResponse);
      
      // Assert
      expect(result).toBe(false);
    });
  });
  
  describe('wakeKoboldServer', () => {
    it('should return true when server is responsive', async () => {
      // Arrange
      (fetch as Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model: 'test-model' })
      });
      
      // Act
      const result = await wakeKoboldServer('http://localhost:5001');
      
      // Assert
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/v1/model',
        expect.objectContaining({ method: 'GET' })
      );
    });
    
    it('should return false when server returns non-ok response', async () => {
      // Arrange
      (fetch as Mock).mockResolvedValueOnce({
        ok: false
      });
      
      // Act
      const result = await wakeKoboldServer('http://localhost:5001');
      
      // Assert
      expect(result).toBe(false);
    });
    
    it('should return false when fetch throws an error', async () => {
      // Arrange
      (fetch as Mock).mockRejectedValueOnce(new Error('Network error'));
      
      // Act
      const result = await wakeKoboldServer('http://localhost:5001');
      
      // Assert
      expect(result).toBe(false);
    });
  });
});
