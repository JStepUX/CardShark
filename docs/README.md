# CardShark

Feedback, issues, or gripes? Just want to hang out? Hit us up on the [CardShark Discord](https://discord.gg/RfVts3hYsd).

**CardShark** is a PNG metadata editor and AI chatbot frontend built exclusively by AI assistants. It's designed for interactive storytelling and character-driven chat experiences.

![cs_gallery](https://github.com/user-attachments/assets/4ab24c52-3a9c-4c96-9c30-77ed822f677b)
<img width="1653" height="917" alt="chatview" src="https://github.com/user-attachments/assets/25b49fc7-fb3a-44cd-8e30-15ea2da68819" />
<img width="1653" height="920" alt="lore" src="https://github.com/user-attachments/assets/d7d118b7-8323-4db2-a1cf-bbad460218d6" />
<img width="1657" height="916" alt="worldview" src="https://github.com/user-attachments/assets/f701b42e-1f0b-46c8-aa69-2743c7c4aed0" />
<img width="1658" height="921" alt="worldedit" src="https://github.com/user-attachments/assets/3ccc5ca6-b0c8-4001-b838-21c731426d7b" />


## Key Features

### Core Chat Experience
- **Dynamic Chat System**: Real-time streaming conversations with multiple AI providers (OpenAI, Claude, KoboldCPP, etc.)
- **Impersonation Mode**: Let the AI generate responses on your behalf with a single click
- **Chat Forking**: Branch conversations from any message to explore alternative storylines
- **Message Regeneration**: Regenerate AI responses to explore different narrative directions

### Advanced Context Management
CardShark offers **4 powerful options** for managing conversation context:
1. **Session Notes**: Persistent notes that stay active across the entire chat session
2. **Author's Note (Journaling)**: Inject dynamic guidance into the conversation context
3. **Automatic Compression**: Intelligent message summarization to maintain coherent long conversations
4. **Context Window Monitoring**: Real-time visibility into what's being sent to the AI

### World Building & Exploration
- **World Cards System**: Create immersive worlds with dynamic maps and locations
- **World Builder**: Design rich environments with interconnected locations and characters
- **World Play Mode**: Navigate maps, interact with AI-driven characters, and experience dynamic events
- **Combat Cards** *(in development)*: Structured combat encounters and game mechanics

### Character & Content Management
- **Character Management**: Create and manage AI characters with rich metadata embedded in PNG files
- **Persistent Identity**: UUID-based character tracking ensures consistency across sessions
- **Template Management**: Customizable prompt templates for different conversation styles
- **Lore System**: Build deep character backgrounds with searchable, context-aware lore injection
- **Content Filtering**: Advanced moderation and safety controls with built-in and custom filters

### Technical Excellence
- **Comprehensive Persistence**: Robust data storage with atomic operations and error recovery
- **Rich Media Support**: Background images, character portraits, and visual elements
- **Room Management**: Create and manage different conversation spaces and contexts

For complete feature details, see [Product Overview](../.kiro/steering/product.md).

## Quick Start

### For Users
1. Download the latest release (`.exe` for Windows)
2. Run the executable
3. Configure your AI provider in Settings
4. Start chatting!

**Quick version:**
```bash
# Clone and run development servers
python start.py

# Backend at http://localhost:9696
# Frontend at http://localhost:6969
```

## License

This project was previously released under the AGPL.
Current development and releases are proprietary.

---

Built with ❤️ by AI assistants for the AI character community.
