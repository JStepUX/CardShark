import React, { useState, useEffect, useCallback } from 'react';
import { Download, Play, AlertCircle, X, CheckCircle, Loader2, RefreshCw, ArrowUpCircle } from 'lucide-react';

interface KoboldStatus {
  status: 'running' | 'present' | 'missing';
  exe_path: string;
  is_running: boolean;
  message?: string;
}

interface DownloadProgress {
  bytes_downloaded: number;
  total_bytes: number;
  percent: number;
  error?: string;
  status?: string;
}

interface VersionInfo {
  update_available: boolean;
  current_version: string | null;
  latest_version: string | null;
  can_check: boolean;
  error?: string;
}

const KoboldCPPManager: React.FC = () => {
  const [status, setStatus] = useState<KoboldStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [checkingForUpdates, setCheckingForUpdates] = useState(false);
  
  // Fetch KoboldCPP status - using useCallback to prevent unnecessary rerenders
  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/koboldcpp/status');
      if (!response.ok) {
        throw new Error(`Failed to get KoboldCPP status: ${response.statusText}`);
      }
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(`Error checking KoboldCPP status: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Check for KoboldCPP updates
  const checkForUpdates = useCallback(async (force: boolean = false) => {
    try {
      setCheckingForUpdates(true);
      const response = await fetch(`/api/koboldcpp/check-updates?force=${force}`);
      if (!response.ok) {
        throw new Error(`Failed to check for updates: ${response.statusText}`);
      }
      const data = await response.json();
      setVersionInfo(data);
      if (data.error) {
        setError(`Error checking updates: ${data.error}`);
      }
    } catch (err) {
      setError(`Error checking for updates: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCheckingForUpdates(false);
    }
  }, []);
  
  // Launch KoboldCPP
  const launchKoboldCPP = async () => {
    try {
      const response = await fetch('/api/koboldcpp/launch', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || response.statusText);
      }
      
      // Wait a moment and then refresh status
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      setError(`Error launching KoboldCPP: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  
  // Download KoboldCPP
  const downloadKoboldCPP = async () => {
    try {
      setIsDownloading(true);
      setDownloadProgress(null);
      setError(null);
      
      const response = await fetch('/api/koboldcpp/download', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download KoboldCPP: ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Stream reader not available');
      
      const decoder = new TextDecoder();
      
      // Process the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const lines = decoder.decode(value).split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.error) {
                setError(`Download error: ${data.error}`);
                setIsDownloading(false);
                return;
              }
              
              if (data.status === 'completed') {
                // Download completed
                setIsDownloading(false);
                // Refresh status
                await fetchStatus();
                // Check for version info since we installed a new version
                await checkForUpdates();
                break;
              }
              
              // Ensure all required properties exist before updating state
              if (data.bytes_downloaded !== undefined || 
                  data.total_bytes !== undefined || 
                  data.percent !== undefined) {
                setDownloadProgress({
                  bytes_downloaded: data.bytes_downloaded || 0,
                  total_bytes: data.total_bytes || 0,
                  percent: data.percent || 0,
                  status: data.status || 'downloading'
                });
              }
            } catch (e) {
              console.error('Error parsing SSE data:', line, e);
              // Don't crash the component on parse errors
            }
          }
        }
      }
      
    } catch (err) {
      setError(`Download error: ${err instanceof Error ? err.message : String(err)}`);
      setIsDownloading(false);
    }
  };
  
  // Recheck status manually
  const recheckStatus = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/koboldcpp/recheck', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to recheck KoboldCPP status: ${response.statusText}`);
      }
      
      const data = await response.json();
      setStatus(data);
      
      if (data.message) {
        setError(data.message);
      } else {
        setError(null);
      }
      
      // Also check for updates
      await checkForUpdates();
    } catch (err) {
      setError(`Error rechecking KoboldCPP: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Load status on component mount and poll less frequently
  useEffect(() => {
    // Initial load
    fetchStatus();
    checkForUpdates();
    
    // Poll for status updates less frequently (every 60s instead of 30s)
    // This helps reduce UI jitter from too many status checks
    const intervalId = setInterval(fetchStatus, 60000);
    
    return () => clearInterval(intervalId);
  }, [fetchStatus, checkForUpdates]);
  
  // Format byte size for display
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };
  
  // Render component
  return (
    <div className="p-4 bg-zinc-800 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-white">KoboldCPP Integration</h2>
        <button
          onClick={fetchStatus}
          className="text-gray-300 hover:text-white"
          title="Refresh Status"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <RefreshCw className="h-5 w-5" />
          )}
        </button>
      </div>
      
      {isLoading && !status ? (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        </div>
      ) : status ? (
        <>
          {/* Status indicator */}
          <div className="mb-4 p-4 rounded-lg border flex items-center gap-2" 
            style={{ 
              backgroundColor: status.is_running ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              borderColor: status.is_running ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'
            }}>
            {status.is_running ? (
              <CheckCircle className="h-6 w-6 text-green-500" />
            ) : (
              <AlertCircle className="h-6 w-6 text-yellow-500" />
            )}
            <div>
              <div className="font-medium">
                {status.is_running ? 'KoboldCPP is running' : 'KoboldCPP is not running'}
              </div>
              <div className="text-sm text-gray-400">
                {status.status === 'present' ? 
                  'Executable is installed but not running' : 
                  status.status === 'missing' ? 
                  'Executable is not installed' : 
                  'KoboldCPP server is active'}
              </div>
              
              {/* Version information */}
              {versionInfo && versionInfo.current_version && (
                <div className="text-sm mt-1 flex items-center gap-1">
                  <span className="text-gray-400">Version: </span>
                  <span className="text-gray-200">v{versionInfo.current_version}</span>
                  
                  {versionInfo.update_available && (
                    <span className="ml-2 text-blue-400 text-xs flex items-center">
                      <ArrowUpCircle className="h-3 w-3 mr-1" />
                      v{versionInfo.latest_version} available
                    </span>
                  )}
                  
                  <button 
                    onClick={() => checkForUpdates(true)} 
                    disabled={checkingForUpdates}
                    className="ml-2 text-xs text-gray-400 hover:text-gray-300"
                    title="Check for updates"
                  >
                    {checkingForUpdates ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Path info */}
          <div className="mb-4 p-2 bg-zinc-900 rounded text-gray-300 text-sm overflow-x-auto">
            <code>{status.exe_path}</code>
          </div>
          
          {/* Action buttons based on status */}
          <div className="flex flex-col sm:flex-row gap-2 justify-center mb-4">
            {status.status === 'missing' && (
              <button
                onClick={downloadKoboldCPP}
                disabled={isDownloading}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download KoboldCPP
                  </>
                )}
              </button>
            )}
            
            {status.status === 'present' && !status.is_running && (
              <button
                onClick={launchKoboldCPP}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Play className="h-4 w-4" />
                Launch KoboldCPP
              </button>
            )}
            
            {/* Update button */}
            {versionInfo && versionInfo.update_available && status.status !== 'missing' && (
              <button
                onClick={downloadKoboldCPP}
                disabled={isDownloading}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <ArrowUpCircle className="h-4 w-4" />
                    Update to v{versionInfo.latest_version}
                  </>
                )}
              </button>
            )}
            
            {/* Recheck button */}
            {!status.is_running && (
              <button
                onClick={recheckStatus}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                <RefreshCw className="h-4 w-4" />
                Recheck Status
              </button>
            )}
          </div>
          
          {/* Download progress */}
          {isDownloading && downloadProgress && (
            <div className="mb-4">
              <div className="w-full bg-gray-700 rounded-full h-2.5 mb-2">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-200" 
                  style={{ width: `${downloadProgress.percent ?? 0}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{formatBytes(downloadProgress.bytes_downloaded || 0)}</span>
                <span>{(downloadProgress.percent != null ? downloadProgress.percent.toFixed(1) : '0.0')}%</span>
                <span>{formatBytes(downloadProgress.total_bytes || 0)}</span>
              </div>
            </div>
          )}
          
          {/* General information */}
          <div className="mt-6 text-sm text-gray-400">
            <p className="mb-2">
              KoboldCPP is a local AI text generation server that runs entirely on your computer.
              It provides a compatible API for text generation without requiring internet connectivity.
            </p>
            <p>
              When installed and running, KoboldCPP will automatically be available as an API provider option.
            </p>
          </div>
        </>
      ) : (
        <div className="text-red-500 py-4">
          Failed to load KoboldCPP status.
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="mt-4 p-3 bg-red-900/40 border border-red-700 rounded-lg flex items-start gap-2 text-red-200">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">{error}</div>
          <button 
            onClick={() => setError(null)}
            className="ml-auto text-red-300 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default KoboldCPPManager;