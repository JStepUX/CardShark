import { getCharacterUUID } from './generateUUID';

describe('generateUUID', () => {
  describe('getCharacterUUID', () => {
    it('should generate a UUID for a character', () => {
      const characterData = {
        name: 'Test Character',
        description: 'This is a test character'
      };
      
      const uuid = getCharacterUUID(characterData);
      
      expect(uuid).toBeDefined();
      expect(typeof uuid).toBe('string');
      expect(uuid.length).toBeGreaterThan(0);
    });

    it('should generate the same UUID for the same character data', () => {
      const characterData1 = {
        name: 'Test Character',
        description: 'This is a test character'
      };
      
      const characterData2 = {
        name: 'Test Character',
        description: 'This is a test character'
      };
      
      const uuid1 = getCharacterUUID(characterData1);
      const uuid2 = getCharacterUUID(characterData2);
      
      expect(uuid1.substring(0, 8)).toBe(uuid2.substring(0, 8));
    });
  });
});
