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
import { ImageHandlerProvider } from '../contexts/ImageHandlerContext';
import { KoboldCPPProvider } from '../hooks/useKoboldCPP';
import HighlightStylesUpdater from './tiptap/HighlightStylesUpdater';

// Lazily load route components
// Character and Gallery views
const CharacterGallery = lazy(() => import('./character/CharacterGallery'));
const CharacterInfoView = lazy(() => import('./character/CharacterInfoView'));
const LoreView = lazy(() => import('./LoreView'));
const MessagesView = lazy(() => import('./MessagesView'));

// Chat view
const ChatView = lazy(() => import('./chat/ChatView'));

// Settings view
const APISettingsView = lazy(() => import('./settings/APISettingsView'));

// World views (V2 - UUID-based)
const WorldLauncher = lazy(() => import('../views/WorldLauncher'));
const WorldEditor = lazy(() => import('../views/WorldEditor'));
const WorldPlayView = lazy(() => import('../views/WorldPlayView'));

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
                    <ChatProvider>
                      <LazyRoute routeName="World Play">
                        <HighlightStylesUpdater />
                        <WorldPlayView />
                      </LazyRoute>
                    </ChatProvider>
                  } />

                  {/* Character routes with ImageHandler - basic editing, no chat needed */}
                  <Route path="info" element={
                    <LazyRoute routeName="Character Info">
                      <ImageHandlerProvider>
                        <CharacterInfoView />
                      </ImageHandlerProvider>
                    </LazyRoute>
                  } />

                  <Route path="lore" element={
                    <LazyRoute routeName="Lore Manager">
                      <LoreView />
                    </LazyRoute>
                  } />

                  <Route path="messages" element={
                    <LazyRoute routeName="Messages">
                      <MessagesView />
                    </LazyRoute>
                  } />

                  {/* Chat route with chat-specific providers - LAZY LOADED */}
                  <Route path="chat" element={
                    <ChatProvider>
                      <LazyRoute routeName="Chat">
                        <HighlightStylesUpdater />
                        <ChatView />
                      </LazyRoute>
                    </ChatProvider>
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
