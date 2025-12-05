# CardShark Technology Stack

## Backend (Python)
- **Framework**: FastAPI with uvicorn server
- **Database**: SQLite with SQLAlchemy ORM
- **Image Processing**: Pillow (PIL) for PNG metadata handling
- **AI Integration**: Multiple providers (OpenAI, Claude, KoboldCPP) via HTTP clients
- **Validation**: Pydantic v2 for data models and validation
- **Testing**: pytest with asyncio support and coverage reporting

## Frontend (React/TypeScript)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with SWC for fast compilation
- **Styling**: Tailwind CSS with PostCSS
- **Rich Text**: TipTap editor with extensions for images and links
- **Routing**: React Router v7
- **State Management**: React Context API with custom hooks
- **Testing**: Jest with React Testing Library and MSW for API mocking

## Development Tools
- **Linting**: ESLint for TypeScript/React
- **Package Management**: npm (frontend), pip (backend)
- **Build System**: Custom Python build script with PyInstaller for executable creation
- **Development Server**: Concurrent frontend (port 6969) and backend (port 9696) servers

## Common Commands

### Development Setup
```bash
# Backend setup
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
python main.py

# Frontend setup  
cd frontend
npm install
npm run dev

# Full development (from root)
python start.py
```

### Testing
```bash
# Backend tests
cd backend
pytest
pytest --cov  # with coverage

# Frontend tests
cd frontend
npm test
npm run test:coverage
```

### Building
```bash
# Frontend build
cd frontend
npm run build

# Full executable build
python build.py
```

## Key Dependencies
- **Backend**: fastapi, uvicorn, sqlalchemy, pydantic, pillow, requests, psutil
- **Frontend**: react, react-dom, @tiptap/react, tailwindcss, lucide-react, zod
- **Build**: pyinstaller, vite, typescript, jest