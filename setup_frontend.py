import os
import json
import shutil

def setup_frontend():
    # Get root directory
    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "frontend")
    
    # Create frontend directory if it doesn't exist
    if not os.path.exists(frontend_dir):
        print(f"Creating frontend directory at {frontend_dir}")
        os.makedirs(frontend_dir)
        
    # Create src directory
    src_dir = os.path.join(frontend_dir, "src")
    if not os.path.exists(src_dir):
        print("Creating src directory")
        os.makedirs(src_dir)
        
    # Create components directory
    components_dir = os.path.join(src_dir, "components")
    if not os.path.exists(components_dir):
        print("Creating components directory")
        os.makedirs(components_dir)
        
    # Create package.json if it doesn't exist
    package_json = {
        "name": "cardshark-frontend",
        "private": True,
        "version": "0.1.0",
        "type": "module",
        "scripts": {
            "dev": "vite",
            "build": "tsc && vite build",
            "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
            "preview": "vite preview"
        },
        "dependencies": {
            "react": "^18.2.0",
            "react-dom": "^18.2.0",
            "lucide-react": "^0.292.0"
        },
        "devDependencies": {
            "@types/react": "^18.2.37",
            "@types/react-dom": "^18.2.15",
            "@vitejs/plugin-react-swc": "^3.4.1",
            "autoprefixer": "^10.4.16",
            "postcss": "^8.4.31",
            "tailwindcss": "^3.3.5",
            "typescript": "^5.2.2",
            "vite": "^4.5.0"
        }
    }
    
    package_json_path = os.path.join(frontend_dir, "package.json")
    if not os.path.exists(package_json_path):
        print("Creating package.json")
        with open(package_json_path, 'w') as f:
            json.dump(package_json, f, indent=2)
            
    print("Frontend setup complete!")
    print("Next steps:")
    print("1. Run 'cd frontend'")
    print("2. Run 'npm install'")
    print("3. Run 'npm run dev'")

if __name__ == "__main__":
    setup_frontend()