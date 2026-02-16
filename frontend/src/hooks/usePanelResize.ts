import { useState, useRef, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'cardshark_sidepanel_width';
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 280;
const MAX_WIDTH_RATIO = 0.5;

export function usePanelResize() {
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= MIN_WIDTH) return parsed;
      }
    } catch { /* ignore */ }
    return DEFAULT_WIDTH;
  });

  const isResizing = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;
      const newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, window.innerWidth - moveEvent.clientX));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setPanelWidth(DEFAULT_WIDTH);
  }, []);

  // Persist width changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(panelWidth));
    } catch { /* ignore */ }
  }, [panelWidth]);

  const resizeHandleProps = {
    onMouseDown: handleMouseDown,
    onDoubleClick: handleDoubleClick,
  };

  return { panelWidth, isResizing: isResizing.current, resizeHandleProps };
}
