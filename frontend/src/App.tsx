// src/App.tsx
import { CharacterProvider } from './contexts/CharacterContext';
import { APIConfigProvider } from './contexts/APIConfigContext';
import { TemplateProvider } from './contexts/TemplateContext';
import Layout from './components/Layout';
import './styles/fonts.css';

function App() {
  return (
    <APIConfigProvider>
      <TemplateProvider>
        <CharacterProvider>
          <Layout />
        </CharacterProvider>
      </TemplateProvider>
    </APIConfigProvider>
  );
}

export default App;