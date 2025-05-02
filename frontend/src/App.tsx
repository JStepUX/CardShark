// src/App.tsx
import { CharacterProvider } from './contexts/CharacterContext';
import { APIConfigProvider } from './contexts/APIConfigContext';
import { TemplateProvider } from './contexts/TemplateContext';
import { ChatProvider } from './contexts/ChatContext';
import { ComparisonProvider } from './contexts/ComparisonContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { KoboldCPPProvider } from './hooks/useKoboldCPP';
import Layout from './components/Layout';
import HighlightStylesUpdater from './components/tiptap/HighlightStylesUpdater';
import ResilientApiProvider from './context/ResilientApiContext';
import ApiErrorBoundary from './components/common/ApiErrorBoundary';
import './styles/fonts.css';

function App() {
  return (
    <ApiErrorBoundary
      fallback={(error, resetError) => (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
          <div className="max-w-md p-6 bg-white rounded-lg shadow-lg">
            <h2 className="mb-4 text-2xl font-bold text-red-600">Application Error</h2>
            <p className="mb-4 text-gray-700">
              There was a problem connecting to the CardShark services:
            </p>
            <p className="p-3 mb-4 text-sm font-mono bg-gray-100 rounded border border-gray-300">
              {error.message}
            </p>
            <div className="flex justify-center">
              <button
                onClick={resetError}
                className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    >
      <ResilientApiProvider retryCount={5} retryDelay={2000}>
        <ComparisonProvider>
          <SettingsProvider>
            <APIConfigProvider>
              <TemplateProvider>
                <CharacterProvider>
                  <ChatProvider>
                    <KoboldCPPProvider pollInterval={120000}>
                      <HighlightStylesUpdater />
                      <Layout />
                    </KoboldCPPProvider>
                  </ChatProvider>
                </CharacterProvider>
              </TemplateProvider>
            </APIConfigProvider>
          </SettingsProvider>
        </ComparisonProvider>
      </ResilientApiProvider>
    </ApiErrorBoundary>
  );
}

export default App;