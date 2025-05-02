import React, { useState, useEffect } from 'react';
import KoboldCPPBottomDrawer from './KoboldCPPBottomDrawer';
import { useSettings } from '../contexts/SettingsContext';
import { useKoboldCPP } from '../hooks/useKoboldCPP';

const KoboldCPPDrawerManager: React.FC = () => {
  const [showDrawer, setShowDrawer] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const { settings } = useSettings();
  const { status } = useKoboldCPP();

  // Effect to handle showing/hiding the drawer based on status
  useEffect(() => {
    if (!isDismissed && status && settings.show_koboldcpp_launcher) {
      // Show drawer if KoboldCPP is installed but not running
      setShowDrawer(status.status === 'present' && !status.is_running);
    }
  }, [status, isDismissed, settings.show_koboldcpp_launcher]);

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