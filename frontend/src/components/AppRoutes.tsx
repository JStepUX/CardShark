import React, { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import LazyRoute from './common/LazyRoute';

// Keep essential context providers for core app functionality
// Chat-specific providers (APIConfig, Template, Chat) are now lazy loaded per route
import { ComparisonProvider } from '../contexts/ComparisonContext';
import { SettingsProvider } from '../contexts/SettingsContext';
import { APIConfigProvider } from '../contexts/APIConfigContext';
import { TemplateProvider } from '../contexts/TemplateContext';
import { CharacterProvider } from '../contexts/CharacterContext';
import { ChatProvider } from '../contexts/ChatContext';
import { KoboldCPPProvider } from '../hooks/useKoboldCPP';
import HighlightStylesUpdater from './tiptap/HighlightStylesUpdater';

// Lazily load route components
// Character and Gallery views
const CharacterGallery = lazy(() => import('./character/CharacterGallery'));
const PngUpload = lazy(() => import('./character/PngUpload'));
const CharacterDetailView = lazy(() => import('./character/CharacterDetailView'));

// Chat view
const ChatView = lazy(() => import('./chat/ChatView'));

// Settings view
const APISettingsView = lazy(() => import('./settings/APISettingsView'));

// History view
const ChatHistoryView = lazy(() => import('./history/ChatHistoryView'));

// World views (V2 - UUID-based)
const WorldLauncher = lazy(() => import('../views/WorldLauncher'));
const WorldEditor = lazy(() => import('../views/WorldEditor'));
const WorldPlayView = lazy(() => import('../views/WorldPlayView'));

// Room views
const RoomEditor = lazy(() => import('./RoomEditor'));

const AppRoutes: React.FC = () => (
  // Global providers needed by most features - only essential ones
  <ComparisonProvider>
    <SettingsProvider>
      <APIConfigProvider>
        <TemplateProvider>
          <CharacterProvider>
              <KoboldCPPProvider pollInterval={120000}>
                <Routes>
                <Route path="/" element={<Layout />}>
                  {/* Default view redirects to gallery */}
                  <Route index element={<Navigate to="/gallery" replace />} />

                  {/* Routes that don't need chat providers - FAST LOADING */}
                  <Route path="gallery" element={
                    <LazyRoute routeName="Character Gallery">
                      <CharacterGallery />
                    </LazyRoute>
                  } />

                  <Route path="import" element={
                    <LazyRoute routeName="Import Character">
                      <PngUpload />
                    </LazyRoute>
                  } />

                  {/* Character Detail — tabbed view (Chat, Info, Greetings, Lore) */}
                  <Route path="character/:uuid" element={
                    <LazyRoute routeName="Character Detail">
                      <CharacterDetailView />
                    </LazyRoute>
                  } />

                  {/* World Card Routes (V2 - UUID-based) */}
                  <Route path="world/:uuid/launcher" element={
                    <LazyRoute routeName="World Launcher">
                      <WorldLauncher />
                    </LazyRoute>
                  } />
                  <Route path="world/:uuid/builder" element={
                    <LazyRoute routeName="World Editor">
                      <WorldEditor />
                    </LazyRoute>
                  } />
                  <Route path="world/:uuid/play" element={
                    <ChatProvider disableAutoLoad={true}>
                      <LazyRoute routeName="World Play">
                        <HighlightStylesUpdater />
                        <WorldPlayView />
                      </LazyRoute>
                    </ChatProvider>
                  } />

                  {/* Room Card Routes */}
                  <Route path="room/:uuid/edit" element={
                    <LazyRoute routeName="Room Editor">
                      <RoomEditor />
                    </LazyRoute>
                  } />

                  {/* Legacy /chat route — fallback for characters without UUID */}
                  <Route path="chat" element={
                    <ChatProvider>
                      <LazyRoute routeName="Chat">
                        <HighlightStylesUpdater />
                        <ChatView />
                      </LazyRoute>
                    </ChatProvider>
                  } />

                  {/* Chat History view */}
                  <Route path="history" element={
                    <LazyRoute routeName="Chat History">
                      <ChatHistoryView />
                    </LazyRoute>
                  } />

                  {/* Settings view with API configuration */}
                  <Route path="settings" element={
                    <LazyRoute routeName="Settings">
                      <APISettingsView />
                    </LazyRoute>
                  } />

                  {/* Fallback route - Redirects to gallery if no match */}
                  <Route path="*" element={<Navigate to="/gallery" replace />} />
                </Route>
              </Routes>
              </KoboldCPPProvider>
          </CharacterProvider>
        </TemplateProvider>
      </APIConfigProvider>
    </SettingsProvider>
  </ComparisonProvider>
);

export default AppRoutes;
