// src/App.tsx
import { CharacterProvider } from './contexts/CharacterContext';
import { APIConfigProvider } from './contexts/APIConfigContext';
import { TemplateProvider } from './contexts/TemplateContext';
import { ChatProvider } from './contexts/ChatContext';
import Layout from './components/Layout';
import './styles/fonts.css';

function App() {
  return (
    <APIConfigProvider>
      <TemplateProvider>
        <CharacterProvider>
          <ChatProvider>
            <Layout />
          </ChatProvider>
        </CharacterProvider>
      </TemplateProvider>
    </APIConfigProvider>
  );
}

export default App;