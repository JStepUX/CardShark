// Room and NPC types for RoomMap and world grid logic

export interface NPC {
  // Use path instead of id for consistency with NpcGridItem and backend
  path: string;
  name: string; // Ensure name is always present
  avatarUrl?: string;
  // Extend with more properties as needed
}

export interface Room {
  id: string;
  name: string;
  // Add description field
  description: string;
  // Add introduction field for greeting when entering the room
  introduction?: string;
  x: number;
  y: number;
  imageUrl?: string;
  npcs: NPC[];
  // Add neighbors field as expected by RoomMap
  neighbors: Record<string, any>; // Use a more specific type if known
  // Extend with more properties as needed
}
