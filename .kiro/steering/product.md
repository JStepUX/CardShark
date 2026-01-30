# CardShark Product Overview

CardShark is a PNG metadata editor and AI chatbot frontend built exclusively by AI assistants. It's a React-based web application with a Python FastAPI backend designed for interactive storytelling and character-driven chat experiences.

## Core Features

- **Character Management**: Create, import, and manage AI characters with rich metadata embedded in PNG files using unique UUIDs
- **Dynamic Chat System**: Real-time streaming conversations with multiple AI providers (OpenAI, Claude, KoboldCPP, etc.)
- **Context Management**: Session notes and automatic message compression to maintain coherent long conversations
- **World Cards System**: Navigate dynamic maps, interact with AI-driven characters, and experience events that shape immersive worlds
- **Template Management**: Create, edit, and manage customizable prompt templates for different conversation styles
- **Content Filtering**: Advanced content moderation and safety controls with builtin and custom filters
- **Room Management**: Create and manage different conversation spaces and contexts
- **Rich Media Support**: Background images, character portraits, and lore management with visual elements
- **Grid Combat System**: Tactical tile-based combat with movement, attack ranges, threat zones, and turn-based AI
- **Inventory and Equipment**: Melee and ranged weapons with stat modifiers, equipment swapping
- **NPC Relationships**: Affinity system with sentiment-based and combat-based progression, daily caps, 5-tier heart display
- **NPC Bonding**: Two-tier interaction (conversation vs bonding) with thin frames for ally room awareness
- **Multi-Speaker Conversations**: Bonded allies can interject in conversations, parsed from LLM responses
- **Day/Night Cycle**: Message-based time progression with rotating visual indicator
- **Progression System**: XP, gold, and leveling with combat rewards and stat growth
- **Local Map**: Pixi.js tile grid with entity portrait cards, exits, pathfinding, and terrain types
- **Combat End Screen**: Genre-themed backdrop with rewards, level-up stats, and ally revival display

## Target Use Cases

- Interactive storytelling and roleplay
- Character-driven narrative experiences
- AI-assisted creative writing
- World building and simulation
- Educational conversational scenarios
- Tactical RPG combat encounters within narrative worlds

## Architecture Philosophy

- Frontend-backend separation with clear API boundaries
- Metadata-driven character system using PNG embedding
- Streaming-first chat implementation
- Modular, service-oriented backend design
- Comprehensive persistence with atomic operations