# CardShark Development Guide

This guide covers setting up your development environment, running tests, and building CardShark for production.

> **Note for Users**: If you're just using CardShark, download the latest `.exe` release. This guide is for developers who want to contribute to or modify CardShark.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Frontend Setup](#frontend-setup)
- [Backend Setup](#backend-setup)
- [Running Tests](#running-tests)
- [Building for Production](#building-for-production)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)

## Prerequisites

Before you begin, ensure you have:

1. **Node.js** (v16 or later) and **npm** - [Download here](https://nodejs.org/)
2. **Python** (v3.9 or later) and **pip** - [Download here](https://www.python.org/)
3. **Git** for version control
4. (Optional) **Vite** globally: `npm install -g vite`
5. (Optional) **Jest** globally: `npm install -g jest`

## Quick Start

The fastest way to get both frontend and backend running:

```bash
# From the project root
python start.py
```

This starts:
- **Backend** at `http://localhost:9696`
- **Frontend** at `http://localhost:6969`

Visit `http://localhost:6969` in your browser to use the application.

## Frontend Setup

### Installation

```bash
cd frontend
npm install
```

### Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:6969` (or as specified by Vite).

### Frontend Project Structure

See [Project Structure](../.kiro/steering/structure.md#frontend-structure-frontendrc) for detailed organization.

**Key directories:**
- `src/components/` - Reusable UI components
- `src/views/` - Page-level components
- `src/contexts/` - React Context providers for state management
- `src/hooks/` - Custom React hooks
- `src/api/` - API client modules
- `src/types/` - TypeScript type definitions

### Frontend Technologies

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with SWC
- **Styling**: Tailwind CSS
- **Routing**: React Router v7
- **Rich Text**: TipTap editor
- **Testing**: Jest with React Testing Library

See [Tech Stack](../.kiro/steering/tech.md) for complete details.

## Backend Setup

### Installation

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Development Server

```bash
# Make sure virtual environment is activated
python main.py

# Or use uvicorn directly for auto-reload:
uvicorn main:app --reload --port 9696
```

The backend API will be available at `http://localhost:9696`.

### Backend Project Structure

See [Project Structure](../.kiro/steering/structure.md#backend-structure-backend) for detailed organization.

**Key components:**
- `*_endpoints.py` - FastAPI routers for different features
- `handlers/` - Business logic classes
- `services/` - Service layer for complex operations
- `models/` - Pydantic data models
- `utils/` - Utility functions
- `database.py` - SQLAlchemy database setup
- `sql_models.py` - Database table definitions

### Backend Technologies

- **Framework**: FastAPI with uvicorn
- **Database**: SQLite with SQLAlchemy ORM
- **Image Processing**: Pillow (PIL)
- **Validation**: Pydantic v2
- **Testing**: pytest with asyncio support

See [Tech Stack](../.kiro/steering/tech.md) for complete details.

## Running Tests

### Frontend Tests

```bash
cd frontend

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm test -- --watch
```

Frontend tests use **Jest** and **React Testing Library** with **MSW** for API mocking.

### Backend Tests

```bash
cd backend

# Make sure virtual environment is activated

# Run all tests
pytest

# Run with coverage
pytest --cov

# Run specific test file
pytest testing/test_specific_feature.py

# Run with verbose output
pytest -v
```

Backend tests use **pytest** with asyncio support.

## Building for Production

### Frontend Build

```bash
cd frontend
npm run build
```

This creates optimized production files in `frontend/dist/`.

### Full Executable Build

CardShark can be packaged as a standalone Windows executable:

```bash
# From project root
python build.py
```

This script:
1. Builds the frontend with Vite
2. Packages everything with PyInstaller
3. Creates a standalone `.exe` in the `dist/` folder

The executable includes both the frontend and backend, along with all dependencies.

## Development Workflow

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes following the coding standards** (see below)

3. **Test your changes**
   - Write unit tests for new features
   - Run existing tests to ensure nothing breaks
   - Test manually in the browser

4. **Run linters and formatters**
   ```bash
   # Frontend
   cd frontend
   npm run lint

   # Backend (if configured)
   cd backend
   black .
   isort .
   ```

5. **Commit and push**
   ```bash
   git add .
   git commit -m "feat: Add your feature description"
   git push origin feature/your-feature-name
   ```

6. **Submit a pull request** with a clear description of your changes

### Git Commit Message Conventions

Use clear, descriptive commit messages:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

## Coding Standards

CardShark follows strict coding standards to maintain code quality and consistency.

### Python (Backend)

- **Follow PEP 8** for Python code style
- **Use type hints** for all function signatures and variables
- **Async/await** for all database operations and API calls
- **Pydantic models** for request/response validation
- **Custom exceptions** from `errors.py`
- **Logging** via `log_manager.py` for errors and important events

**Example:**
```python
async def get_character(character_id: str) -> CharacterData:
    """Retrieve character by ID with proper error handling."""
    try:
        character = await db.get_character(character_id)
        return character
    except NotFoundError:
        logger.error(f"Character not found: {character_id}")
        raise
```

### TypeScript/React (Frontend)

- **Strict TypeScript** - No `any` types allowed
- **Functional components** with hooks only
- **Context + hooks** for state management (no external libraries)
- **Tailwind CSS** for styling - avoid inline styles
- **Proper error boundaries** and loading states
- **DEBUG flag** for console.log statements (set to false for production)

**Example:**
```typescript
interface ChatViewProps {
  characterId: string;
  sessionId: string;
}

const ChatView: React.FC<ChatViewProps> = ({ characterId, sessionId }) => {
  const [messages, setMessages] = useState<Message[]>([]);

  // Component logic...

  return (
    <div className="flex flex-col h-full">
      {/* JSX content */}
    </div>
  );
};
```

### Naming Conventions

**Backend:**
- Endpoint files: `*_endpoints.py`
- Handler classes: `*_handler.py`
- Service/Manager classes: `*_service.py` or `*_manager.py`

**Frontend:**
- Components: PascalCase `.tsx` files (`ChatView.tsx`)
- Hooks: `use*` prefix (`useChatMessages.ts`)
- API clients: `*Api.ts` suffix (`worldApi.ts`)

See [Code Conventions](../.kiro/steering/conventions.md) for complete details.

## Project Organization

### Data Directories

The following directories are created at runtime and contain user data:

- `characters/` - Character PNG files with embedded metadata
- `worlds/` - World state files and location-specific chats
- `backgrounds/` - Background images with metadata
- `users/` - User profile PNGs
- `templates/` - Chat prompt templates
- `chats/` - Chat history (JSONL/JSON format)
- `uploads/` - User-uploaded files
- `logs/` - Runtime and build logs
- `settings.json` - Global configuration

### Configuration Files

- **Frontend**: `vite.config.ts`, `tailwind.config.js`, `jest.config.ts`
- **Backend**: `requirements.txt`, database configuration in `database.py`
- **Build**: `build.py` (PyInstaller configuration)

## Troubleshooting

### Common Issues

**Frontend won't start:**
- Ensure Node.js v16+ is installed
- Delete `node_modules/` and `package-lock.json`, then run `npm install`
- Check that port 6969 isn't already in use

**Backend won't start:**
- Ensure Python 3.9+ is installed
- Verify virtual environment is activated
- Check that all dependencies installed: `pip install -r requirements.txt`
- Ensure port 9696 isn't already in use

**Tests failing:**
- Ensure all dependencies are installed
- Check that database migrations are up to date
- Clear any cached test data

**Build fails:**
- Ensure frontend builds successfully first (`cd frontend && npm run build`)
- Check that PyInstaller is installed in your Python environment
- Review logs in `logs/` directory

## Additional Resources

- [Product Overview](../.kiro/steering/product.md) - Features and use cases
- [Project Structure](../.kiro/steering/structure.md) - Detailed file organization
- [Code Conventions](../.kiro/steering/conventions.md) - Coding patterns and best practices
- [Tech Stack](../.kiro/steering/tech.md) - Complete technology details
- [API Documentation](API.md) - API endpoint reference

## Getting Help

- **Discord**: Join the [CardShark Discord](https://discord.gg/RfVts3hYsd)
- **Issues**: Check existing issues or create a new one on GitHub
- **Documentation**: Review the docs linked above

---

Happy coding! 🦈
