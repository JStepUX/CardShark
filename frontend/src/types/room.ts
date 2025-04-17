// Room and NPC types for RoomMap and world grid logic

export interface NPC {
  id: string;
  name: string;
  avatarUrl?: string;
  // Extend with more properties as needed
}

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  imageUrl?: string;
  npcs: NPC[];
  // Extend with more properties as needed
}
