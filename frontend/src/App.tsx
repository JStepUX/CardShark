// src/App.tsx
import { CharacterProvider } from './contexts/CharacterContext';
import { APIConfigProvider } from './contexts/APIConfigContext';
import { TemplateProvider } from './contexts/TemplateContext';
import { ChatProvider } from './contexts/ChatContext';
import { ComparisonProvider } from './contexts/ComparisonContext';
import Layout from './components/Layout';
import './styles/fonts.css';

function App() {
  return (
    <ComparisonProvider>
      <APIConfigProvider>
        <TemplateProvider>
          <CharacterProvider>
            <ChatProvider>
              <Layout />
            </ChatProvider>
          </CharacterProvider>
        </TemplateProvider>
      </APIConfigProvider>
    </ComparisonProvider>
  );
}

export default App;