// frontend/src/api/characterApi.ts
// API client for Character Card creation operations

export const characterApi = {
  /**
   * Create a new blank character card
   */
  async createCharacter(name: string = 'New Character'): Promise<{ character_uuid: string; name: string }> {
    const formData = new FormData();
    formData.append('name', name);

    const response = await fetch('/api/characters/create', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to create character' }));
      throw new Error(error.detail || 'Failed to create character');
    }

    const data = await response.json();
    return data.data.character;
  },
};
