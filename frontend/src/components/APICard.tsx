import React from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

export interface APICardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  fields: {
    id: string;
    label: string;
    type: 'text' | 'password' | 'number' | 'select';
    value: string;
    onChange: (value: string) => void;
    options?: { value: string; label: string }[];
    placeholder?: string;
    required?: boolean;
    hidden?: boolean;
  }[];
  isConnected: boolean;
  isLoading: boolean;
  onTest: () => Promise<void>;
  onDisconnect: () => void;
  error?: string;
  lastTestedAt?: number;
  modelInfo?: {
    id: string;
    name?: string;
    provider?: string;
  };
}

export const APICard: React.FC<APICardProps> = ({
  title,
  description,
  icon,
  fields,
  isConnected,
  isLoading,
  onTest,
  onDisconnect,
  error,
  lastTestedAt,
  modelInfo
}) => {
  return (
    <div className="w-full p-6 bg-stone-950 rounded-lg border border-stone-800">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {icon && <div className="w-8 h-8">{icon}</div>}
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            {description && (
              <p className="text-sm text-gray-400">{description}</p>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm
          ${isConnected ? 'bg-green-900/50 text-green-300' : 'bg-stone-800 text-gray-300'}`}
        >
          {isConnected ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : (
            <XCircle className="w-3 h-3" />
          )}
          <span className="ml-1">{isConnected ? "Connected" : "Not Connected"}</span>
        </div>
      </div>

      <div className="space-y-4">
        {fields.map(field => !field.hidden && (
          <div key={field.id}>
            <label 
              htmlFor={field.id}
              className="block text-sm font-medium text-gray-300 mb-1.5"
            >
              {field.label}
            </label>
            {field.type === 'select' ? (
              <select
                id={field.id}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-700 
                         rounded-lg focus:ring-1 focus:ring-blue-500"
              >
                {field.options?.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={field.id}
                type={field.type}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                className="w-full px-3 py-2 bg-stone-900 border border-stone-700 
                         rounded-lg focus:ring-1 focus:ring-blue-500"
              />
            )}
          </div>
        ))}

        {error && (
          <div className="p-3 text-sm text-red-500 bg-red-950/50 rounded-lg">
            {error}
          </div>
        )}

        {modelInfo && (
          <div className="p-3 bg-stone-900/50 rounded-lg space-y-1">
            <div className="text-sm font-medium">Connected Model</div>
            <div className="text-sm text-gray-400">
              {modelInfo.name || modelInfo.id}
              {modelInfo.provider && (
                <span className="text-xs ml-1">
                  by {modelInfo.provider}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          {isConnected ? (
            <button
              onClick={onDisconnect}
              disabled={isLoading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg 
                       transition-colors disabled:opacity-50"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={onTest}
              disabled={isLoading}
              className="min-w-[100px] px-4 py-2 bg-blue-600 hover:bg-blue-700 
                       text-white rounded-lg transition-colors disabled:opacity-50
                       flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </button>
          )}
        </div>

        {lastTestedAt && (
          <div className="text-xs text-gray-500 text-right">
            Last tested: {new Date(lastTestedAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
};

export default APICard;