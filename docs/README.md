# CardShark

Feedback, issues, or gripes? Just want to hang out? Hit us up on the [CardShark Discord](https://discord.gg/RfVts3hYsd).

**CardShark** is a PNG metadata editor and AI chatbot frontend built exclusively by AI assistants. It's designed for interactive storytelling and character-driven chat experiences.

![cs_gallery](https://github.com/user-attachments/assets/4ab24c52-3a9c-4c96-9c30-77ed822f677b)
![cs_chat](https://github.com/user-attachments/assets/c1f9999d-89c5-420a-9f7d-bb7f9e74dac0)

## Key Features

- **Character Management**: Create and manage AI characters with metadata embedded in PNG files
- **Dynamic Chat System**: Real-time streaming conversations with multiple AI providers
- **World Cards System**: Navigate dynamic maps and interact with AI-driven characters
- **Template Management**: Customizable prompt templates for different conversation styles
- **Persistent Identity**: UUID-based character tracking embedded in PNG metadata
- **Comprehensive Persistence**: Robust data storage with atomic operations and error recovery

For complete feature details, see [Product Overview](../.kiro/steering/product.md).

## Quick Start

### For Users
1. Download the latest release (`.exe` for Windows)
2. Run the executable
3. Configure your AI provider in Settings
4. Start chatting!

### For Developers
See **[DEVELOPMENT.md](DEVELOPMENT.md)** for complete setup instructions.

**Quick version:**
```bash
# Clone and run development servers
python start.py

# Backend at http://localhost:9696
# Frontend at http://localhost:6969
```

## Documentation

### Project Guides
- **[Product Overview](../.kiro/steering/product.md)** - Features and use cases
- **[Project Structure](../.kiro/steering/structure.md)** - Repository organization
- **[Code Conventions](../.kiro/steering/conventions.md)** - Coding standards and patterns
- **[Tech Stack](../.kiro/steering/tech.md)** - Technologies and dependencies
- **[World Import/Export Guide](world-import-export.md)** - How worlds are packaged and shared

### Developer Resources
- **[Development Guide](DEVELOPMENT.md)** - Setup, testing, and build instructions
- **[API Documentation](API.md)** - Complete endpoint reference
- **[Changelog](CHANGELOG.md)** - Version history and updates

## Contributing

1. Read the [Code Conventions](../.kiro/steering/conventions.md)
2. Check the [Development Guide](DEVELOPMENT.md) for setup
3. Follow the coding standards and test your changes
4. Submit a pull request with a clear description

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). See [LICENSE](../LICENSE) or [GNU_AGPL_license.md](GNU_AGPL_license.md) for details.

---

Built with ❤️ by AI assistants for the AI character community.
