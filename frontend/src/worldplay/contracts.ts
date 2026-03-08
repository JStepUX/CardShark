import type { APIConfig } from '../types/api';
import type { Message, UserProfile } from '../types/messages';
import type { NPCRelationship, TimeConfig, TimeState } from '../types/worldRuntime';
import type { CombatDisplayNPC, GridRoom } from '../types/worldGrid';

export interface WorldPlayMutableMessage {
  id: string;
  role: string;
  content: string;
  timestamp: number;
  status?: string;
  metadata?: Record<string, unknown>;
}

export type WorldPlayApiConfig = APIConfig | null;
export type WorldPlayMessage = Message;
export type WorldPlayMessageSetter = (
  messages: WorldPlayMutableMessage[]
    | ((prev: WorldPlayMutableMessage[]) => WorldPlayMutableMessage[])
) => void;
export type WorldPlayMessageAppender = (message: WorldPlayMutableMessage) => void;

export type WorldPlayCurrentUser =
  Pick<UserProfile, 'id' | 'name' | 'filename' | 'user_uuid'> | null;

export interface WorldModePanelData {
  currentRoom?: GridRoom | null;
  npcs: CombatDisplayNPC[];
  relationships?: Record<string, NPCRelationship>;
  timeState?: TimeState;
  timeConfig?: TimeConfig;
}