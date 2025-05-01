import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import CharacterInfoView from './CharacterInfoView'; // Corrected path based on Layout.tsx
import LoreView from './LoreView'; // Path from Layout.tsx
import MessagesView from './MessagesView'; // Path from Layout.tsx
import ChatView from './ChatView'; // Path from Layout.tsx
import CharacterGallery from './CharacterGallery'; // Path from Layout.tsx
import APISettingsView from './APISettingsView'; // Path from Layout.tsx
import WorldCardsView from '../views/WorldCardsView';
import WorldBuilderView from '../views/WorldBuilderView';
import WorldCardsPlayView from '../views/WorldCardsPlayView';
import { ComparisonProvider } from '../contexts/ComparisonContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { APIConfigProvider } from '../contexts/APIConfigContext';
import { TemplateProvider } from '../contexts/TemplateContext';
import { CharacterProvider } from '../contexts/CharacterContext';
import { ChatProvider } from '../contexts/ChatContext';
import HighlightStylesUpdater from './tiptap/HighlightStylesUpdater';

const AppRoutes: React.FC = () => (
  <ComparisonProvider>
    <SettingsProvider>
      <APIConfigProvider>
        <TemplateProvider>
          <CharacterProvider>
            <ChatProvider>
              <HighlightStylesUpdater />
              <Routes>
                <Route path="/" element={<Layout />}> {/* Layout is the parent route */}
                  {/* Define nested routes rendered inside Layout's Outlet */}
                  {/* Default view redirects to gallery */}
                  <Route index element={<Navigate to="/gallery" replace />} />
                  {/* Only one CharacterGallery route */}
                  <Route path="gallery" element={<CharacterGallery />} />
                  {/* Map other views previously handled by Layout state */}
                  <Route path="info" element={<CharacterInfoView />} />
                  <Route path="lore" element={<LoreView />} />
                  <Route path="messages" element={<MessagesView />} />
                  <Route path="chat" element={<ChatView />} />
                  <Route path="settings" element={<APISettingsView />} />

                  {/* World Cards Routes */}
                  <Route path="worldcards" element={<WorldCardsView />} />
                  {/* Use a unique param like worldId */}
                  {/* Remove props, components fetch data via useParams */}
                  <Route path="worldcards/:worldId/builder" element={<WorldBuilderView />} />
                  <Route path="worldcards/:worldId/play" element={<WorldCardsPlayView />} />

                  {/* Fallback route - Redirects to gallery if no match */}
                  <Route path="*" element={<Navigate to="/gallery" replace />} />
                </Route>
                {/* Remove the separate /play route as it's now nested */}
              </Routes>
            </ChatProvider>
          </CharacterProvider>
        </TemplateProvider>
      </APIConfigProvider>
    </SettingsProvider>
  </ComparisonProvider>
);

export default AppRoutes;
