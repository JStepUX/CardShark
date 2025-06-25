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
const CharacterGallery = lazy(() => import('./CharacterGallery'));
const CharacterInfoView = lazy(() => import('./CharacterInfoView'));
const LoreView = lazy(() => import('./LoreView'));
const MessagesView = lazy(() => import('./MessagesView'));

// Chat view
const ChatView = lazy(() => import('./ChatView'));

// Settings view
const APISettingsView = lazy(() => import('./APISettingsView'));

// World-related views (grouped by feature)
const WorldCardsView = lazy(() => import('../views/WorldCardsView'));
const WorldBuilderView = lazy(() => import('../views/WorldBuilderView'));
const WorldCardsPlayView = lazy(() => import('../views/WorldCardsPlayView'));

const AppRoutes: React.FC = () => (
  // Global providers needed by most features - only essential ones
  <ComparisonProvider>
    <SettingsProvider>
      <APIConfigProvider>
        <TemplateProvider>
          <CharacterProvider>
            <ChatProvider>
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
            
            <Route path="worldcards">
              <Route index element={
                <LazyRoute routeName="World Cards">
                  <WorldCardsView />
                </LazyRoute>
              } />
              
              <Route path=":worldId/builder" element={
                <LazyRoute routeName="World Builder">
                  <WorldBuilderView />
                </LazyRoute>
              } />
              
              {/* World Cards Play route needs chat providers */}
              <Route path=":worldId/play" element={
                <LazyRoute routeName="World Play">
                  <WorldCardsPlayView />
                </LazyRoute>
              } />
            </Route>
            
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
              <LazyRoute routeName="Chat">
                <HighlightStylesUpdater />
                <ChatView />
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
            </ChatProvider>
          </CharacterProvider>
        </TemplateProvider>
      </APIConfigProvider>
    </SettingsProvider>
  </ComparisonProvider>
);

export default AppRoutes;
