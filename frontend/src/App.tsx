// src/App.tsx
import { CharacterProvider } from './contexts/CharacterContext';
import { APIConfigProvider } from './contexts/APIConfigContext';
import { TemplateProvider } from './contexts/TemplateContext';
import { ChatProvider } from './contexts/ChatContext';
import { ComparisonProvider } from './contexts/ComparisonContext';
import { SettingsProvider } from './contexts/SettingsContext';
import Layout from './components/Layout';
import HighlightStylesUpdater from './components/tiptap/HighlightStylesUpdater';
import './styles/fonts.css';

function App() {
  return (
    <ComparisonProvider>
      <SettingsProvider>
        <APIConfigProvider>
          <TemplateProvider>
            <CharacterProvider>
              <ChatProvider>
                <HighlightStylesUpdater />
                <Layout />
              </ChatProvider>
            </CharacterProvider>
          </TemplateProvider>
        </APIConfigProvider>
      </SettingsProvider>
    </ComparisonProvider>
  );
}

export default App;