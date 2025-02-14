import React, { useState } from 'react';
import { APICard } from './APICard';
import { Server } from 'lucide-react';
import { ChatTemplate, TEMPLATE_NAMES } from '../types/api';

interface LocalLLMCardProps {
  settings: {
    url: string;
    template: ChatTemplate;
    isConnected: boolean;
    lastTestedAt?: number;
    modelInfo?: {
      id: string;
      name?: string;
    };
  };
  onUpdate: (updates: Partial<LocalLLMCardProps['settings']>) => void;
}

export const LocalLLMCard: React.FC<LocalLLMCardProps> = ({
  settings,
  onUpdate,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: settings.url })
      });

      const data = await response.json();
      
      if (data.success) {
        onUpdate({
          isConnected: true,
          lastTestedAt: Date.now(),
          ...(data.model && { modelInfo: data.model }),
          ...(data.template && { template: data.template })
        });
      } else {
        throw new Error(data.message || 'Connection failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      onUpdate({ isConnected: false });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    onUpdate({
      isConnected: false,
      lastTestedAt: undefined,
      modelInfo: undefined
    });
  };

  return (
    <APICard
      title="Local LLM"
      description="Connect to a locally hosted language model"
      icon={<Server className="w-6 h-6" />}
      fields={[
        {
          id: 'url',
          label: 'API URL',
          type: 'text',
          value: settings.url,
          onChange: (value) => onUpdate({ url: value }),
          placeholder: 'http://localhost:5001',
          required: true
        },
        {
          id: 'template',
          label: 'Chat Template',
          type: 'select',
          value: settings.template,
          onChange: (value) => onUpdate({ template: value as ChatTemplate }),
          options: Object.entries(TEMPLATE_NAMES).map(([value, label]) => ({
            value,
            label
          }))
        }
      ]}
      isConnected={settings.isConnected}
      isLoading={isLoading}
      onTest={handleTest}
      onDisconnect={handleDisconnect}
      error={error || undefined}
      lastTestedAt={settings.lastTestedAt}
      modelInfo={settings.modelInfo}
    />
  );
};

export default LocalLLMCard;