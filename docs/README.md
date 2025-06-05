Feedback, issues, or gripes? Just want to hang out? Hit us up on the [CardShark Discord](https://discord.gg/RfVts3hYsd).

CardShark is a PNG metadata editor and AI Chatbot front end built exclusively by AI assistants.

![cs_gallery](https://github.com/user-attachments/assets/4ab24c52-3a9c-4c96-9c30-77ed822f677b)
![cs_charinfo](https://github.com/user-attachments/assets/79bd551c-ab8f-42e9-a1eb-9a7fddb2eb8b)
![cs_compare](https://github.com/user-attachments/assets/c757f693-5f27-42c3-a4a3-f54af63bb53d)
![cs_greetings](https://github.com/user-attachments/assets/3f484ba5-2ac2-4511-a61e-3d7ff08838ec)
![cs_lore](https://github.com/user-attachments/assets/b83ecf38-52f8-433f-8cb7-392d803385c4)
![cs_chat](https://github.com/user-attachments/assets/c1f9999d-89c5-420a-9f7d-bb7f9e74dac0)
![cs_api](https://github.com/user-attachments/assets/3d091e6b-770d-4c8b-881e-b0d2a2a3b121)
![cs_templates](https://github.com/user-attachments/assets/a54b277d-8a38-4fbc-bc1a-3f23406b1aeb)
![cs_prompts](https://github.com/user-attachments/assets/60cd72e6-dcf5-4a2f-b821-342d8c5e030e)

# CardShark Project Documentation

## Project Overview
CardShark is a React-based web application with a Python backend designed for interactive storytelling and character-driven chat experiences. The project leverages modern web technologies like Tailwind CSS for styling, Vite for fast builds, and Jest for testing. It supports dynamic chat interactions, customizable settings, integration with AI models for generating responses, and a "World Cards" system for dynamic, character-driven environments.

### Key Features
- **Dynamic Chat System**: Engage in interactive conversations with AI-driven characters.
- **World Cards System**: Navigate dynamic maps, interact with AI-driven characters, and experience events that shape the world. (See `plan_WorldCards2.md` for full details).
- **Customizable Settings**: Tailor the chat experience with background settings, API configurations, and UI preferences.
- **Template Management**: Create, edit, and manage templates for chat formatting. (See `templates_README.md`).
- **API Integration**: Seamless integration with AI models for generating responses.
- **Persistent Character Identity**: Utilizes unique identifiers (UUIDs) embedded directly within character PNG metadata for stable and robust tracking. (See `backend_character_uuid_implementation_plan.md`).
- **Comprehensive Persistence**: Robust data storage for chats, worlds, settings, etc., with atomic operations and error recovery. (See `persistence_architecture.md`).

## Repository Structure

The workspace is organized into the following key folders:

### Backend (`backend/`)
The backend is implemented in Python using FastAPI. It provides APIs for managing characters, worlds, settings, and more.

-   **Core Files**:
    -   [`main.py`](backend/main.py:1): Initializes the FastAPI app and includes routers for various endpoints.
    -   [`api_handler.py`](backend/api_handler.py:1): Handles general API interactions and request processing.
    -   [`world_endpoints.py`](backend/world_endpoints.py:1): Implements endpoints for World Card operations (CRUD, state management, player movement).
    -   [`character_endpoints.py`](backend/character_endpoints.py:1): Manages character-related APIs (CRUD, metadata extraction/embedding, import).
    -   [`chat_endpoints.py`](backend/chat_endpoints.py:1): Handles chat-related API endpoints.
    -   [`settings_endpoints.py`](backend/settings_endpoints.py:1): Handles application settings.
-   **Handlers**:
    -   [`world_state_handler.py`](backend/handlers/world_state_handler.py:1) / [`world_state_manager.py`](backend/world_state_manager.py:1): Manages world state logic, including loading, saving, and initialization.
    -   [`chat_handler.py`](backend/chat_handler.py:1): Handles chat-related business logic, message storage, and retrieval.
    -   [`background_handler.py`](backend/background_handler.py:1): Manages background assets and metadata.
    -   [`png_metadata_handler.py`](backend/png_metadata_handler.py:1): Utility for reading and writing EXIF metadata to PNG files (characters, user profiles).
    -   [`settings_manager.py`](backend/settings_manager.py:1): Manages loading, saving, and validation of application settings from `settings.json`.
    -   [`koboldcpp_manager.py`](backend/koboldcpp_manager.py:1): Integrates with the KoboldCPP AI model.
    -   [`template_handler.py`](backend/template_handler.py:1): Manages chat templates.
-   **Models (`backend/models/`)**:
    -   Contains Pydantic models for data validation and structuring (e.g., [`world_state.py`](backend/models/world_state.py:1), [`character_data.py`](backend/models/character_data.py:1)).
-   **Utilities (`backend/utils/`)**:
    -   Includes helper functions and utilities such as [`location_extractor.py`](backend/utils/location_extractor.py:1) for World Cards, and [`user_dirs.py`](backend/utils/user_dirs.py:1) for path management.
    -   [`errors.py`](backend/errors.py:1): Defines custom error classes.
    -   [`log_manager.py`](backend/log_manager.py:1): Provides logging utilities.

### Frontend (`frontend/`)
The frontend is built with React and TypeScript. It uses Vite for development and build processes, and Tailwind CSS for styling.

-   **Core Files**:
    -   [`src/main.tsx`](frontend/src/main.tsx:1): Entry point for the React application.
    -   [`src/App.tsx`](frontend/src/App.tsx:1): Main application component, sets up routing.
    -   [`src/components/`](frontend/src/components/): Contains reusable UI components (e.g., [`ChatView.tsx`](frontend/src/components/ChatView.tsx:1), [`APISettingsView.tsx`](frontend/src/components/APISettingsView.tsx:1), `CharacterGallery.tsx`, `WorldMap.tsx`).
    -   [`src/views/`](frontend/src/views/): Higher-level view components (e.g., [`WorldCardsView.tsx`](frontend/src/views/WorldCardsView.tsx:1)).
    -   [`src/api/`](frontend/src/api/): API client modules for interacting with the backend (e.g., [`worldApi.ts`](frontend/src/api/worldApi.ts:1), `characterApi.ts`).
-   **State Management (`frontend/src/contexts/`)**:
    -   Context providers for managing global and feature-specific state (e.g., [`ChatContext.tsx`](frontend/src/contexts/ChatContext.tsx:1), [`WorldStateContext.tsx`](frontend/src/contexts/WorldStateContext.tsx:1), [`APIConfigContext.tsx`](frontend/src/contexts/APIConfigContext.tsx:1), [`CharacterContext.tsx`](frontend/src/contexts/CharacterContext.tsx:1)).
-   **Hooks (`frontend/src/hooks/`)**:
    -   Custom hooks for managing component logic and side effects (e.g., [`useChatMessages.ts`](frontend/src/hooks/useChatMessages.ts:1), [`useWorldState.ts`]).
-   **Types (`frontend/src/types/`)**:
    -   TypeScript type definitions and interfaces (e.g., [`schema.ts`](frontend/src/types/schema.ts:1), [`world.ts`](frontend/src/types/world.ts:1)).
-   **Styling**:
    -   [`tailwind.config.js`](frontend/tailwind.config.js): Tailwind CSS configuration.
    -   [`src/index.css`](frontend/src/index.css:1): Global styles.
-   **Testing**:
    -   [`jest.config.ts`](frontend/jest.config.ts:1): Jest configuration for unit and integration tests.
-   **Public Assets (`frontend/public/`)**:
    -   Static assets like images (`cardshark.ico`, `pngPlaceholder.png`) and icons.
-   **Build Configuration**:
    -   [`vite.config.ts`](frontend/vite.config.ts:1): Vite build and development server configuration.

### Shared Resources & Data Directories
-   **`worlds/`**: Stores world data, including `world_state.json` files, images, and location-specific chats.
-   **`characters/`**: Contains character PNG files with embedded metadata.
-   **`templates/`**: Stores chat templates (JSON format) and related documentation.
-   **`backgrounds/`**: Background images and `metadata.json` for chat customization.
-   **`users/`**: User profile PNGs with embedded metadata.
-   **`chats/`**: Stores chat history, typically organized by character name, using JSONL or JSON files.
-   **`uploads/`**: Default directory for user-uploaded files.
-   **`logs/`**: Build and runtime logs for debugging.
-   **`testing/`**: Contains backend test cases and utilities.
-   **`settings.json`**: Global configuration file for the project, managed by `settings_manager.py`.

### Miscellaneous
-   **`build/`**: Build artifacts and compiled files (typically frontend).
-   **`.gitignore`**: Specifies intentionally untracked files that Git should ignore.
-   **`LICENSE`**: Project license file (likely AGPL based on `docs/GNU_AGPL_license.md`).

## Functionality and Features

### World Cards
World Cards represent dynamic, navigable environments where users can interact with characters and events.
-   **Backend**: [`world_endpoints.py`](backend/world_endpoints.py:1) (APIs), [`world_state_handler.py`](backend/handlers/world_state_handler.py:1) (logic).
-   **Frontend**: [`src/views/WorldCardsView.tsx`](frontend/src/views/WorldCardsView.tsx:1) (management UI), [`src/views/WorldView.tsx`](frontend/src/views/WorldView.tsx:1) (play UI), [`src/api/worldApi.ts`](frontend/src/api/worldApi.ts:1) (client).

### Characters
Characters are central, with metadata embedded in PNGs, including a unique `character_uuid`.
-   **Backend**: [`character_endpoints.py`](backend/character_endpoints.py:1) (APIs, metadata handling).
-   **Frontend**: [`src/components/CharacterGallery.tsx`](frontend/src/components/CharacterGallery.tsx:1) (display), [`src/components/CharacterInfoView.tsx`](frontend/src/components/CharacterInfoView.tsx:1) (details), `src/api/characterApi.ts` (client).

### Chat System
Interactive conversations with AI-driven characters, using customizable templates.
-   **Backend**: [`chat_endpoints.py`](backend/chat_endpoints.py:1) (APIs), [`chat_handler.py`](backend/chat_handler.py:1) (logic).
-   **Frontend**: [`src/components/ChatView.tsx`](frontend/src/components/ChatView.tsx:1) (UI), [`src/hooks/useChatMessages.ts`](frontend/src/hooks/useChatMessages.ts:1) (state), [`frontend/src/handlers/promptHandler.ts`](frontend/src/handlers/promptHandler.ts:1) (formatting).

### Settings
Application settings are configurable, including API keys, UI preferences, and directory paths.
-   **Backend**: [`settings_endpoints.py`](backend/settings_endpoints.py:1) (APIs), [`settings_manager.py`](backend/settings_manager.py:1) (file I/O).
-   **Frontend**: [`src/components/APISettingsView.tsx`](frontend/src/components/APISettingsView.tsx:1) (UI).

## Routing and Endpoints

### Backend API Endpoints (FastAPI)
Key API routes defined in `backend/main.py` and respective endpoint files:
-   `/api/world-cards/`: Manages World Cards.
    -   `GET /{world_name}/state`: Retrieves the state of a world.
    -   `POST /{world_name}/state`: Updates the state of a world.
    -   `POST /{world_name}/move`: Moves a player within a world.
    -   `POST /create`: Creates a new world.
    -   `GET /`: Lists available worlds.
-   `/api/characters/`: Manages character data.
    -   `POST /save-card`: Saves a character card with embedded metadata (including `character_uuid`).
    -   `POST /extract-metadata`: Extracts metadata from character files.
    -   `GET /`: Lists available characters.
-   `/api/chat/`: Manages chat operations.
    -   `POST /generate`: Generates a chat response using the configured LLM.
    -   `GET /list/{character_id}`: Lists chat sessions for a character.
    -   `POST /load`: Loads a specific chat session.
-   `/api/settings/`: Manages application settings.
    -   `GET /`: Retrieves current settings.
    -   `POST /`: Updates settings.
-   `/api/templates/`: Manages chat templates.
    -   `GET /`: Lists templates.
    -   `POST /`: Creates/updates a template.

### Frontend Routing (React Router)
Key client-side routes defined in [`src/App.tsx`](frontend/src/App.tsx:1) or similar routing configuration:
-   `/gallery`: Displays the character gallery.
-   `/worldcards`: Manages World Cards (listing, creation).
-   `/worldcards/:worldName`: View/play a specific World Card.
-   `/chat/:characterId?/:chatId?`: Main chat interface.
-   `/settings/*`: Application settings (e.g., `/settings/api`, `/settings/templates`).

## Dependencies

### Frontend Dependencies (`frontend/package.json`)
-   **Core**: `react`, `react-dom`, `react-router-dom`
-   **Rich Text Editing**: `@tiptap/react`, `@tiptap/starter-kit`, various `@tiptap/extension-*`
-   **Image Manipulation**: `cropperjs`, `react-cropper`
-   **Icons**: `lucide-react`
-   **UI & Utilities**: `react-intersection-observer`, `zod` (schema validation), `uuid`
-   **Development**: `vite`, `typescript`, `@vitejs/plugin-react`, `jest`, `@testing-library/react`, `eslint`, `tailwindcss`, `postcss`, `autoprefixer`

### Backend Dependencies (`backend/requirements.txt`)
-   **Core Framework**: `fastapi`, `uvicorn[standard]`
-   **File Handling & Image Processing**: `Pillow`, `python-multipart`
-   **Data Validation & Settings**: `pydantic`
-   **System Utilities**: `psutil`, `Send2Trash`
-   **HTTP & Streaming**: `requests`, `sse-starlette`
-   **Packaging**: `pyinstaller` (for creating executables)

## ========================== DEV ONLY =====================================
## Development Workflow (Not for users - Users should use the .EXE releases)
## ========================== DEV ONLY =====================================

### Prerequisites
1.  Install **Node.js** (v16 or later) and **npm**.
2.  Install **Python** (v3.9 or later) and **pip**.
3.  (Optional) Install **Vite** globally: `npm install -g vite`.
4.  (Optional) Install **Jest** globally: `npm install -g jest`.
5.  Clone the repository and navigate to the project directory.

### Setting Up the Frontend
1.  Navigate to the `frontend/` folder: `cd frontend`.
2.  Install dependencies: `npm install`.
3.  Start the development server: `npm run dev`.
4.  Access the application at `http://localhost:5173` (or as specified by Vite).

### Setting Up the Backend
1.  Navigate to the `backend/` folder: `cd backend`.
2.  Create a virtual environment: `python -m venv venv`.
3.  Activate the virtual environment:
    -   On Windows: `venv\Scripts\activate`
    -   On macOS/Linux: `source venv/bin/activate`
4.  Install dependencies: `pip install -r requirements.txt`.
5.  Start the backend server: `python main.py` (or `uvicorn main:app --reload` for development).

### Running Tests
-   **Frontend**: In `frontend/`, run `npm test`.
-   **Backend**: In `backend/`, run `pytest`.

### Building for Production
1.  Build the frontend: In `frontend/`, run `npm run build`.
2.  The backend can be packaged using PyInstaller if needed, or deployed as a Python application. Serve the built frontend files (typically from `frontend/dist`) via the backend or a separate web server.

## Coding Standards

### React (Frontend)
-   Use functional components and hooks.
-   Keep components small and focused on a single responsibility.
-   Use TypeScript for type safety; define interfaces for props and state.
-   Follow Tailwind CSS conventions for styling.
-   Write unit tests for components and hooks using Jest and React Testing Library.

### Python (Backend)
-   Follow PEP 8 for Python code style.
-   Use type hints for function signatures and variables.
-   Use Pydantic models for request/response data validation and serialization.
-   Write unit tests for modules and endpoints using `pytest`.
-   Log errors and important events using `log_manager.py`.

### General Best Practices
-   Write clear and concise comments for complex logic.
-   Use meaningful variable, function, and class names.
-   Avoid hardcoding values; use configuration files (`settings.json`) or environment variables.
-   Handle errors gracefully and provide user-friendly messages or appropriate HTTP status codes.
-   Optimize for performance and scalability where necessary.
-   Ensure documentation is updated alongside code changes.

## Contribution Workflow
1.  Clone the repository and set up the development environment as described above.
2.  Create a new branch for your feature or bug fix.
3.  Follow the coding standards and development guidelines (for AI agent specific rules, refer to [Cursor Rules](docs/cursorrules.md)).
4.  Write or update relevant documentation for your changes.
5.  Test your changes thoroughly (unit tests, integration tests, manual testing).
6.  Run linters and formatters: `npm run lint` (frontend), `black .` and `isort .` (backend).
7.  Submit a pull request with a clear description of your changes.

## Additional Resources
-   **Persistence Architecture**: See [`docs/persistence_architecture.md`](docs/persistence_architecture.md).
-   **Character UUIDs**: See [`docs/backend_character_uuid_implementation_plan.md`](docs/backend_character_uuid_implementation_plan.md).
-   **Chat Persistence**: See [`docs/chat_persistence_strategy.md`](docs/chat_persistence_strategy.md).
-   **World Cards System Plan**: See [`docs/plan_WorldCards2.md`](docs/plan_WorldCards2.md).
-   **World Persistence Strategy**: See [`docs/world_persistence_strategy.md`](docs/world_persistence_strategy.md).
-   **World Prompts**: See [`docs/world_prompts.md`](docs/world_prompts.md).
-   **Templates Guide**: See [`docs/templates_README.md`](docs/templates_README.md).
-   **User Flows**: See [`docs/# CardShark User Flows.md`](docs/%23%20CardShark%20User%20Flows.md).
-   **Frontend Code Review (State)**: See [`docs/frontend_code_review_current_state.md`](docs/frontend_code_review_current_state.md).
-   **Cursor Rules**: See [`docs/cursorrules.md`](docs/cursorrules.md).

---
This document serves as a comprehensive guide to the CardShark repository. For further assistance, refer to the linked detailed documentation or contact project maintainers.

