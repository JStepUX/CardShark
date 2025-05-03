# CardShark Repository Documentation

## Overview
CardShark is a React-based application with a Python backend. It leverages Tailwind CSS for styling, Jest for testing, and Vite as the build tool. The application is designed to manage and interact with "World Cards," which are dynamic, character-driven environments. This document provides a detailed overview of the repository structure, functionality, and routing to help contributors understand the project.

---

## Repository Structure

### Backend (`backend/`)
The backend is implemented in Python using FastAPI. It provides APIs for managing characters, worlds, settings, and more.

- **Core Files**:
  - `main.py`: Initializes the FastAPI app and includes routers for various endpoints.
  - `api_handler.py`: Handles API interactions.
  - `world_endpoints.py`: Implements endpoints for world card operations.
  - `character_endpoints.py`: Manages character-related APIs.
  - `settings_endpoints.py`: Handles application settings.

- **Handlers**:
  - `world_state_handler.py`: Manages world state logic.
  - `chat_handler.py`: Handles chat-related operations.
  - `background_handler.py`: Manages background assets.

- **Models**:
  - `models/`: Contains Pydantic models for data validation.

- **Utilities**:
  - `utils/`: Includes helper functions and utilities.

### Frontend (`frontend/`)
The frontend is built with React and TypeScript. It uses Vite for development and build processes.

- **Core Files**:
  - `src/main.tsx`: Entry point for the React application.
  - `src/App.tsx`: Main application component.
  - `src/components/`: Contains reusable UI components.
  - `src/api/`: API client for interacting with the backend.

- **State Management**:
  - `src/contexts/`: Context providers for managing global state.

- **Styling**:
  - `tailwind.config.js`: Tailwind CSS configuration.

- **Testing**:
  - `jest.config.ts`: Jest configuration for unit and integration tests.

### Shared Resources
- **Worlds (`worlds/`)**: Stores world data and configurations.
- **Characters (`characters/`)**: Contains character assets and metadata.
- **Backgrounds (`backgrounds/`)**: Includes background images and metadata.

---

## Functionality and Features

### World Cards
World Cards represent dynamic environments that users can interact with.

- **Backend**:
  - `world_endpoints.py`: Provides APIs for creating, listing, and managing worlds.
  - `world_state_handler.py`: Handles world state logic.

- **Frontend**:
  - `src/views/WorldCardsView.tsx`: Main view for managing World Cards.
  - `src/api/worldApi.ts`: API client for world-related operations.

### Characters
Characters are central to the system, providing context and interaction.

- **Backend**:
  - `character_endpoints.py`: Manages character creation and metadata extraction.

- **Frontend**:
  - `src/components/CharacterGallery.tsx`: Displays a gallery of characters.
  - `src/components/CharacterInfoView.tsx`: Displays character details.
  - `src/api/characterApi.ts`: API client for character-related operations.

### Settings
The application settings are configurable via a dedicated UI.

- **Backend**:
  - `settings_endpoints.py`: Provides APIs for managing settings.
  - `settings_manager.py`: Writes and reads settings from settings.json.

- **Frontend**:
  - `src/components/APISettingsView.tsx`: UI for configuring API settings.

---

## Routing and Endpoints

### Backend API Endpoints
The backend uses FastAPI to define endpoints. Key routes include:

- `/api/world-cards`: Manages World Cards.
  - `GET /state`: Retrieves the state of a world.
  - `POST /state`: Updates the state of a world.
  - `POST /move`: Moves a player within a world.

- `/api/characters`: Manages character data.
  - `POST /extract-metadata`: Extracts metadata from character files.

- `/api/settings`: Manages application settings.
  - `GET /`: Retrieves current settings.
  - `POST /`: Updates settings.

### Frontend Routing
The frontend uses React Router for navigation. Key routes include:

- `/gallery`: Displays the character gallery.
- `/worldcards`: Manages World Cards.
- `/settings`: Configures application settings.

---

## Dependencies

### Frontend Dependencies
The `package.json` file in the frontend directory lists the following dependencies:

#### Core Libraries
- **React** (`react`, `react-dom`): Core libraries for building the user interface.
- **React Router DOM** (`react-router-dom`): For client-side routing.

#### Rich Text Editing
- **TipTap** (`@tiptap/*`): A modern rich-text editor framework.
- **ProseMirror** (`prosemirror-*`): Underlying libraries for TipTap.

#### Image Manipulation
- **CropperJS** (`cropperjs`, `react-cropper`): For image cropping functionality.

#### Icons
- **Lucide React** (`lucide-react`): Provides a set of customizable icons.

#### Intersection Observer
- **React Intersection Observer** (`react-intersection-observer`): For observing element visibility.

#### TypeScript Support
- **@types/***: TypeScript type definitions for React, Node, and Jest.

#### Development Tools
- **Vite** (`vite`): Build tool for fast development.
- **Jest** (`jest`, `@testing-library/*`): Testing framework and utilities.
- **ESLint** (`@typescript-eslint/*`): Linting for TypeScript.
- **Tailwind CSS** (`tailwindcss`, `postcss`, `autoprefixer`): Utility-first CSS framework.

#### Zod
- **Zod**: A TypeScript-first schema declaration and validation library. It is used for defining and validating API schemas in the frontend.

### Backend Dependencies
The `requirements.txt` file in the backend directory lists the following dependencies:

#### Core Framework
- **FastAPI**: Web framework for building APIs.
- **Uvicorn**: ASGI server for running FastAPI applications.

#### File Handling
- **Pillow**: For image processing.
- **Python Multipart**: For handling file uploads.

#### Data Validation
- **Pydantic**: For data validation and settings management.

#### System Utilities
- **Psutil**: For process management.
- **Send2Trash**: For native file deletion.

#### HTTP and Streaming
- **Requests**: For making HTTP requests.
- **SSE-Starlette**: For server-sent events.

#### Packaging
- **PyInstaller**: For creating standalone executables.

---

These dependencies are essential for the functionality and development of the CardShark application. They enable features like rich text editing, image manipulation, API development, and testing.

---

## Development Guidelines

### Backend
- Use Pydantic models for data validation.
- Follow FastAPI conventions for defining endpoints.

### Frontend
- Use functional components and React hooks.
- Leverage Tailwind CSS for styling.
- Write unit tests using Jest and React Testing Library.

---

## Contribution Workflow

1. Clone the repository and set up the development environment.
2. Follow the coding standards outlined in `.github/copilot-instructions.md`.
3. Test your changes thoroughly before submitting a pull request.
4. Run `npm test` and `npm run lint` to ensure your changes pass all tests and adhere to coding standards.

---

## Additional Resources

- **Templates**: Refer to `templates_README.md` for information on managing templates.
- **Testing**: See `testing/test-strategy.md` for the testing strategy.
- **General Guidance**: See `copilot-instructions.md` for general guidelines.
- **World Prompts**: Refer to `world_prompts.md` for guidelines on creating and managing world prompts.

---

This document serves as a comprehensive guide to the CardShark repository. For further assistance, refer to the individual README files or contact the project maintainers.