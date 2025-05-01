import React, { useState, useEffect } from 'react';
import KoboldCPPBottomDrawer from './KoboldCPPBottomDrawer';
import { useSettings } from '../contexts/SettingsContext';

interface KoboldStatus {
  status: 'running' | 'present' | 'missing';
  is_running: boolean;
}

const KoboldCPPDrawerManager: React.FC = () => {
  const [showDrawer, setShowDrawer] = useState(false);
  const [koboldStatus, setKoboldStatus] = useState<KoboldStatus | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const { settings } = useSettings();

  // Check KoboldCPP status when the component mounts
  useEffect(() => {
    // Only check status if the launcher setting is enabled
    if (settings.show_koboldcpp_launcher) {
      checkKoboldStatus();
      
      // Check status periodically (every 30 seconds)
      const intervalId = setInterval(checkKoboldStatus, 30000);
      
      return () => clearInterval(intervalId);
    }
  }, [settings.show_koboldcpp_launcher]);

  // Effect to handle showing/hiding the drawer based on status
  useEffect(() => {
    if (!isDismissed && koboldStatus && settings.show_koboldcpp_launcher) {
      // Show drawer if KoboldCPP is installed but not running
      setShowDrawer(koboldStatus.status === 'present' && !koboldStatus.is_running);
    }
  }, [koboldStatus, isDismissed, settings.show_koboldcpp_launcher]);

  // Check KoboldCPP status from the backend
  const checkKoboldStatus = async () => {
    try {
      const response = await fetch('/api/koboldcpp/status');
      if (response.ok) {
        const status = await response.json();
        setKoboldStatus(status);
      }
    } catch (error) {
      console.error('Failed to check KoboldCPP status:', error);
    }
  };

  // Handle drawer dismissal
  const handleDismiss = () => {
    setShowDrawer(false);
    setIsDismissed(true);
  };

  // Don't render anything if the launcher setting is disabled
  if (!settings.show_koboldcpp_launcher || !showDrawer) return null;

  return <KoboldCPPBottomDrawer onDismiss={handleDismiss} />;
};

export default KoboldCPPDrawerManager;