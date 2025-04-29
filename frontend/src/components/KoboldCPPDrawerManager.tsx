import React, { useState, useEffect } from 'react';
import KoboldCPPBottomDrawer from './KoboldCPPBottomDrawer';

interface KoboldStatus {
  status: 'running' | 'present' | 'missing';
  is_running: boolean;
}

const KoboldCPPDrawerManager: React.FC = () => {
  const [showDrawer, setShowDrawer] = useState(false);
  const [koboldStatus, setKoboldStatus] = useState<KoboldStatus | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  // Check KoboldCPP status when the component mounts
  useEffect(() => {
    checkKoboldStatus();
    
    // Check status periodically (every 30 seconds)
    const intervalId = setInterval(checkKoboldStatus, 30000);
    
    return () => clearInterval(intervalId);
  }, []);

  // Effect to handle showing/hiding the drawer based on status
  useEffect(() => {
    if (!isDismissed && koboldStatus) {
      // Show drawer if KoboldCPP is installed but not running
      setShowDrawer(koboldStatus.status === 'present' && !koboldStatus.is_running);
    }
  }, [koboldStatus, isDismissed]);

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

  if (!showDrawer) return null;

  return <KoboldCPPBottomDrawer onDismiss={handleDismiss} />;
};

export default KoboldCPPDrawerManager;