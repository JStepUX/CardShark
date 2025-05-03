# CardShark Project Documentation

## Project Overview
CardShark is a React-based web application with a Python backend designed for interactive storytelling and character-driven chat experiences. The project leverages modern web technologies like Tailwind CSS for styling, Vite for fast builds, and Jest for testing. It supports dynamic chat interactions, customizable settings, and integration with AI models for generating responses.

### Key Features
- **Dynamic Chat System**: Engage in interactive conversations with AI-driven characters.
- **Customizable Settings**: Tailor the chat experience with background settings, reasoning toggles, and more.
- **Template Management**: Create, edit, and manage templates for chat formatting.
- **API Integration**: Seamless integration with AI models for generating responses.
- **World Building**: Tools for creating and managing character lore and world settings.

## Folder Structure
The workspace is organized into the following key folders:

### Backend
- **`backend/`**: Contains the Python backend code, including API endpoints, handlers, and utilities.
  - **`api_handler.py`**: Manages API requests and responses.
  - **`chat_endpoints.py`**: Handles chat-related API endpoints.
  - **`settings_manager.py`**: Manages application settings.
  - **`world_state_manager.py`**: Handles world state logic.

### Frontend
- **`frontend/`**: Contains the React-based frontend code.
  - **`src/`**: Main source folder for React components, hooks, and utilities.
    - **`components/`**: Reusable React components (e.g., `ChatView.tsx`, `SettingsTabs.tsx`).
    - **`hooks/`**: Custom hooks for managing state and logic (e.g., `useChatMessages.ts`).
    - **`contexts/`**: Context providers for shared state (e.g., `ChatContext.tsx`).
  - **`public/`**: Static assets like images and icons.
  - **`tailwind.config.js`**: Tailwind CSS configuration.
  - **`vite.config.ts`**: Vite build configuration.

### Shared Resources
- **`templates/`**: Stores chat templates and related documentation.
- **`backgrounds/`**: Background images and metadata for chat customization.
- **`users/`**: User data and profiles.
- **`worlds/`**: World-building resources and settings.

### Logs and Testing
- **`logs/`**: Build and runtime logs for debugging.
- **`testing/`**: Contains test cases and utilities for automated testing.

### Miscellaneous
- **`build/`**: Build artifacts and compiled files.
- **`settings.json`**: Global configuration file for the project.
- **`README.md`**: Project documentation (this file).

## Frontend Architecture
The frontend is built using React and TypeScript, styled with Tailwind CSS, and bundled with Vite. It is designed to be modular and scalable, with a focus on reusability and maintainability.

### Key Components
- **`ChatView.tsx`**: The main chat interface, responsible for rendering messages, handling user input, and managing chat-specific settings.
- **`SettingsTabs.tsx`**: Provides a tabbed navigation interface for accessing different settings categories.
- **`ChatSelector.tsx`**: Allows users to select, create, or delete chat sessions.
- **`TemplateEditor.tsx`**: Enables users to create and edit chat templates.
- **`APISettingsView.tsx`**: Manages API configurations, including adding, editing, and testing API connections.

### Custom Hooks
- **`useChatMessages.ts`**: Manages chat state, including loading, saving, and generating messages.
- **`useAPIConfig.ts`**: Provides access to API configuration and settings.
- **`useScrollToBottom.ts`**: Ensures the chat view scrolls to the latest message.

### Context Providers
- **`ChatContext.tsx`**: Shares chat-related state across components.
- **`TemplateContext.tsx`**: Manages state for chat templates.
- **`SettingsContext.tsx`**: Provides global access to application settings.

### Styling
- Tailwind CSS is used for styling, with utility classes applied directly in JSX.
- Custom styles are defined in `tailwind.config.js` and scoped CSS files when necessary.

### Build and Testing
- **Build Tool**: Vite is used for fast builds and hot module replacement.
- **Testing**: Jest and React Testing Library are used for unit and integration tests.

## Backend Architecture
The backend is implemented in Python and provides RESTful APIs for the frontend. It is designed to be modular, with clear separation of concerns.

### Key Modules
- **`api_handler.py`**: The entry point for handling API requests.
- **`chat_endpoints.py`**: Defines endpoints for chat-related operations, such as loading and saving messages.
- **`settings_manager.py`**: Handles application settings, including loading, saving, and validation.
- **`world_state_manager.py`**: Manages the state of the virtual world, including characters and lore.
- **`koboldcpp_manager.py`**: Integrates with the KoboldCPP AI model for generating chat responses.

### Utilities
- **`log_manager.py`**: Provides logging utilities for debugging and monitoring.
- **`errors.py`**: Defines custom error classes for consistent error handling.
- **`template_handler.py`**: Manages chat templates, including parsing and validation.

### Data Storage
- **`chats/`**: Stores chat history and related metadata.
- **`worlds/`**: Contains data for virtual worlds, including characters and settings.
- **`uploads/`**: Handles user-uploaded files, such as images and templates.

### Testing
- Unit tests are located in the `testing/` folder.
- Use `pytest` for running backend tests.

### Running the Backend
- Use `start.py` to launch the backend server.
- Configuration is managed through `settings.json` and environment variables.

## Development Workflow
Follow these steps to set up the development environment and start contributing to the project:

### Prerequisites
1. Install **Node.js** (v16 or later) and **npm**.
2. Install **Python** (v3.9 or later) and **pip**.
3. Install **Vite** globally: `npm install -g vite`.
4. Install **Jest** globally for testing: `npm install -g jest`.
5. Clone the repository and navigate to the project directory.

### Setting Up the Frontend
1. Navigate to the `frontend/` folder: `cd frontend`.
2. Install dependencies: `npm install`.
3. Start the development server: `npm run dev`.
4. Access the application at `http://localhost:3000`.

### Setting Up the Backend
1. Navigate to the `backend/` folder: `cd backend`.
2. Create a virtual environment: `python -m venv venv`.
3. Activate the virtual environment:
   - On Windows: `venv\Scripts\activate`
   - On macOS/Linux: `source venv/bin/activate`
4. Install dependencies: `pip install -r requirements.txt`.
5. Start the backend server: `python start.py`.

### Running Tests
- **Frontend**: Run `npm test` in the `frontend/` folder.
- **Backend**: Run `pytest` in the `backend/` folder.

### Building for Production
1. Build the frontend: `npm run build` (in the `frontend/` folder).
2. Deploy the backend and serve the built frontend files.

## Coding Standards
Adhering to coding standards ensures consistency and maintainability across the codebase.

### React (Frontend)
- Use functional components and hooks.
- Keep components small and focused.
- Use TypeScript for type safety.
- Follow Tailwind CSS conventions for styling.
- Write unit tests for all components using Jest and React Testing Library.

### Python (Backend)
- Follow PEP 8 for Python code style.
- Use type hints for function signatures.
- Write unit tests for all modules using `pytest`.
- Log errors and exceptions using `log_manager.py`.

### General Best Practices
- Write clear and concise comments for complex logic.
- Use meaningful variable and function names.
- Avoid hardcoding values; use configuration files or environment variables.
- Handle errors gracefully and provide user-friendly messages.
- Optimize for performance and scalability.

## Technical Reference

### Common Implementation Patterns

This section provides concrete examples of common patterns used throughout the CardShark project to ensure consistency in implementation.

### 1. Chat Message Handling

```tsx
// Creating a new message
const createAssistantMessage = (content: string = '', status: Message['status'] = 'streaming'): Message => ({
  id: generateUUID(),
  role: 'assistant',
  content,
  timestamp: Date.now(),
  status: status,
  variations: content ? [content] : [],
  currentVariation: content ? 0 : undefined,
});

// Handling streamed content with buffer
const handleStreamingContent = (content: string, messageId: string) => {
  if (buffer.length > 0) {
    const contentToAdd = buffer;
    buffer = '';
    updateMessageContent(messageId, contentToAdd);
  }
};
```

### 2. Settings Tab Management

```tsx
// Tab navigation component structure
const SettingsTabs: React.FC<SettingsTabsProps> = ({ 
  defaultTab = 'general', 
  children,
  onTabChange
}) => {
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // Find the active tab content
  const activeTabContent = React.Children.toArray(children)
    .find(child => React.isValidElement(child) && child.props.id === activeTab);

  return (
    <div className="flex flex-col h-full">
      {/* Tab navigation buttons */}
      <div className="flex border-b border-stone-800">
        {/* Tab buttons */}
      </div>
      
      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTabContent}
      </div>
    </div>
  );
};
```

### 3. API Integration Pattern

```tsx
// API service pattern
const apiService = {
  // Fetch data with proper error handling
  async fetchData(endpoint: string, params?: Record<string, any>): Promise<any> {
    try {
      const response = await fetch(`/api/${endpoint}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        ...(params && { body: JSON.stringify(params) })
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      
      return await response.json();
    } catch (err) {
      console.error(`Error fetching ${endpoint}:`, err);
      throw err;
    }
  },
  
  // Save data with optimistic updates
  async saveData(endpoint: string, data: any): Promise<any> {
    try {
      const response = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      
      return await response.json();
    } catch (err) {
      console.error(`Error saving to ${endpoint}:`, err);
      throw err;
    }
  }
};
```

### 4. Error Handling Pattern

```tsx
// Component-level error handling
const [error, setError] = useState<string | null>(null);

const handleOperation = async () => {
  try {
    setError(null);
    // Perform operation
  } catch (err) {
    setError(err instanceof Error ? err.message : 'An unknown error occurred');
  }
};

// In the render function
{error && (
  <div className="error-message p-3 mb-4 bg-red-900/30 text-red-200 border border-red-800 rounded">
    <div className="flex items-center">
      <AlertTriangle size={18} className="mr-2 flex-shrink-0" />
      <span>{error}</span>
    </div>
  </div>
)}
```

### 5. Context Window Management

```tsx
// Update context window with user action details
const handleUserAction = (actionType: string, details: any) => {
  setLastContextWindow({
    type: actionType,
    timestamp: new Date().toISOString(),
    actionDetails: details,
    // Additional metadata relevant to the action
  });
  
  // Perform action
};
```

These patterns serve as guidelines for implementing new features or modifying existing ones in a consistent manner.

CardShark is a PNG metadata editor built exclusively by Claude 3.5/3.7 Sonnet and Gemini 2.5 Pro (minor).

![cs_gallery](https://github.com/user-attachments/assets/4ab24c52-3a9c-4c96-9c30-77ed822f677b)

![cs_charinfo](https://github.com/user-attachments/assets/79bd551c-ab8f-42e9-a1eb-9a7fddb2eb8b)

![cs_compare](https://github.com/user-attachments/assets/c757f693-5f27-42c3-a4a3-f54af63bb53d)

![cs_greetings](https://github.com/user-attachments/assets/3f484ba5-2ac2-4511-a61e-3d7ff08838ec)

![cs_lore](https://github.com/user-attachments/assets/b83ecf38-52f8-433f-8cb7-392d803385c4)

![cs_chat](https://github.com/user-attachments/assets/c1f9999d-89c5-420a-9f7d-bb7f9e74dac0)

![cs_api](https://github.com/user-attachments/assets/3d091e6b-770d-4c8b-881e-b0d2a2a3b121)

![cs_templates](https://github.com/user-attachments/assets/a54b277d-8a38-4fbc-bc1a-3f23406b1aeb)

![cs_prompts](https://github.com/user-attachments/assets/60cd72e6-dcf5-4a2f-b821-342d8c5e030e)

