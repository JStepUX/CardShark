// frontend/src/types/worldState.ts

// Type for an NPC (assuming this structure)
export interface NpcGridItem {
  name: string;
  path: string; // Path to character file/data
}

// Type for a Room within the world state
export interface Room {
  id: string;
  name: string;
  description?: string;
  x: number;
  y: number;
  neighbors: Partial<Record<'N' | 'S' | 'E' | 'W', string>>; // direction -> room id
  npcs?: NpcGridItem[];
  // Add other room properties if needed (e.g., background, events)
}

// Type for the full world state data fetched from the API
export interface FullWorldState {
  id: string; // World ID (directory name or UUID)
  name: string;
  description: string;
  cardImageUrl: string | null; // Optional URL for the card image
  rooms: Room[]; // Array of rooms in the world
  // Add other top-level world properties returned by the API (e.g., creation date, grid settings)
}

// You might also want to define the structure for saving world state if it differs
// export interface WorldStateForSave { ... }