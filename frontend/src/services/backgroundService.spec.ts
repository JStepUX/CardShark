import { BackgroundService } from './backgroundService';

// Mock global fetch
global.fetch = jest.fn();

describe('BackgroundService', () => {
    beforeEach(() => {
        (global.fetch as jest.Mock).mockClear();
    });

    describe('getBackgrounds', () => {
        it('should correctly parse the standardized API response (data.data)', async () => {
            // Mock successful response with standard structure
            const mockResponse = {
                success: true,
                data: [
                    { filename: 'bg1.png', name: 'Background 1' },
                    { filename: 'bg2.jpg', name: 'Background 2' }
                ],
                timestamp: '2023-01-01T00:00:00Z'
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockResponse
            });

            const result = await BackgroundService.getBackgrounds();

            // Verify URL - NO trailing slash as per my fix
            expect(global.fetch).toHaveBeenCalledWith('/api/backgrounds');

            // Verify data extraction - should get the array from inside 'data'
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual(mockResponse.data[0]);
        });

        it('should handle API failure gracefully', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 404,
                text: async () => 'Not Found'
            });

            const result = await BackgroundService.getBackgrounds();

            expect(result).toEqual([]);
        });

        it('should handle malformed responses', async () => {
            // Mock response that doesn't follow standard format
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ success: true, something_else: [] })
            });

            const result = await BackgroundService.getBackgrounds();

            // Should return empty array if validation fails
            expect(result).toEqual([]);
        });
    });

    describe('uploadBackground', () => {
        it('should correctly parsing upload response', async () => {
            const mockFile = new File([''], 'test.png', { type: 'image/png' });
            const mockResponse = {
                success: true,
                data: {
                    filename: 'test.png',
                    name: 'test'
                }
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockResponse
            });

            const result = await BackgroundService.uploadBackground(mockFile);

            // Verify endpoint
            expect(global.fetch).toHaveBeenCalledWith('/api/backgrounds/upload', expect.any(Object));

            // Verify result extraction
            expect(result).toEqual(mockResponse.data);
        });
    });
});
