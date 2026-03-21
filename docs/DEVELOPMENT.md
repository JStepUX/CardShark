# DEVELOPMENT.md

> For users: Download `.exe` release. This is for developers/contributors.

## PREREQUISITES
```yaml
required:
  nodejs: ">=16"
  python: ">=3.9"
  git: any
optional:
  vite: npm install -g vite
  jest: npm install -g jest
```

## QUICK_START
```bash
# From project root - starts both servers
python start.py

# Backend: http://localhost:9696
# Frontend: http://localhost:6969
```

## SETUP_FRONTEND
```yaml
directory: frontend/
commands:
  install: npm install
  dev: npm run dev
  build: npm run build
  test: npm test
  test_coverage: npm run test:coverage
  lint: npm run lint

key_dirs:
  components: src/components/
  views: src/views/
  contexts: src/contexts/
  hooks: src/hooks/
  api: src/api/
  types: src/types/

config_files:
  - vite.config.ts
  - tailwind.config.js
  - jest.config.ts
  - package.json
```

## SETUP_BACKEND
```yaml
directory: backend/
commands:
  venv_create: python -m venv venv
  venv_activate_windows: venv\Scripts\activate
  venv_activate_unix: source venv/bin/activate
  install: pip install -r requirements.txt
  dev: python main.py
  dev_reload: uvicorn main:app --reload --port 9696
  test: pytest
  test_coverage: pytest --cov
  format: black . && isort .

key_files:
  endpoints: "*_endpoints.py"
  handlers: "handlers/*.py"
  services: "services/*.py"
  models: "models/*.py"
  database: database.py
  sql_models: sql_models.py

config_files:
  - requirements.txt
  - database.py
```

## BUILD_PRODUCTION
```yaml
frontend_only:
  command: npm run build
  output: frontend/dist/

full_executable:
  command: python build.py
  output: dist/*.exe
  includes: [frontend_build, backend, dependencies]
  packager: PyInstaller
```

## TESTING
```yaml
frontend:
  runner: Jest
  library: React Testing Library
  mocking: MSW
  commands:
    all: npm test
    coverage: npm run test:coverage
    watch: npm test -- --watch
    specific: npm test -- <file>

backend:
  runner: pytest
  async: true
  commands:
    all: pytest
    coverage: pytest --cov
    verbose: pytest -v
    specific: pytest testing/<file>.py
```

## GIT_WORKFLOW
```yaml
branch_creation:
  - git checkout -b feature/<name>

commit_prefixes:
  feat: new feature
  fix: bug fix
  docs: documentation
  refactor: code restructure
  test: test changes
  chore: maintenance

process:
  - create feature branch
  - make changes
  - write/update tests
  - run linters
  - commit with conventional prefix
  - push and create PR
```

## CODING_STANDARDS
```yaml
python:
  style: PEP 8
  type_hints: required
  async: use for all DB/API operations
  validation: Pydantic v2
  errors: custom exceptions from errors.py
  logging: log_manager.py

typescript:
  strict: true
  no_any: true
  components: functional + hooks only
  state: Context API + custom hooks
  styling: Tailwind CSS (no inline styles)
  debug: DEBUG flag for console.log (false in prod)

naming_backend:
  endpoints: "*_endpoints.py"
  handlers: "*_handler.py"
  services: "*_service.py|*_manager.py"

naming_frontend:
  components: PascalCase.tsx
  hooks: "use*.ts"
  api_clients: "*Api.ts"
```

## DATA_DIRECTORIES
```yaml
runtime_created:
  characters: "characters/"
  worlds: "worlds/"
  backgrounds: "backgrounds/"
  users: "users/"
  templates: "templates/"
  chats: "chats/"
  uploads: "uploads/"
  logs: "logs/"

files:
  settings: settings.json
  database: cardshark.sqlite
```

## TROUBLESHOOTING
```yaml
frontend_wont_start:
  - verify: node --version (>=16)
  - delete: [node_modules/, package-lock.json]
  - reinstall: npm install
  - check_port: 6969 available

backend_wont_start:
  - verify: python --version (>=3.9)
  - check_venv: venv activated
  - reinstall: pip install -r requirements.txt
  - check_port: 9696 available

tests_failing:
  - verify: all dependencies installed
  - check: database migrations current
  - clear: cached test data

build_fails:
  - verify: frontend builds (cd frontend && npm run build)
  - check: PyInstaller installed
  - review: logs/ directory
```

## ARCHITECTURE_REFS
```yaml
for_AI_systems:
  overview: ../CONTEXT.md
  product: ../.kiro/steering/product.md
  structure: ../.kiro/steering/structure.md
  conventions: ../.kiro/steering/conventions.md
  tech: ../.kiro/steering/tech.md
  api: API.md
```

## SUPPORT
```yaml
discord: https://discord.gg/RfVts3hYsd
github_issues: check existing or create new
documentation: see ARCHITECTURE_REFS above
```
