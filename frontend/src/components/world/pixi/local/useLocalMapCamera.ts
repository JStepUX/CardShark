import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type React from 'react';
import { LOCAL_MAP_ZOOM } from '../../../../types/localMap';
import { WORLD_PLAY_VIEWPORT } from '../../../../worldplay/config';
import { createViewportMetrics, getViewportCenter } from '../../../../worldplay/viewport';
import type { TilePosition } from '../../../../types/localMap';
import type { LocalMapStage } from './LocalMapStage';

export interface LocalMapViewportDebugState {
  pan: { x: number; y: number };
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  playerTile: TilePosition;
}

interface UseLocalMapCameraOptions {
  containerRef: RefObject<HTMLDivElement>;
  stageRef: RefObject<LocalMapStage | null>;
  playerPosition: TilePosition;
  defaultZoom: number;
  cardOverflowPadding: number;
}

interface UseLocalMapCameraReturn {
  currentZoom: number;
  viewportDebug: LocalMapViewportDebugState;
  isPanMode: boolean;
  isPanModeRef: React.MutableRefObject<boolean>;
  setIsPanMode: React.Dispatch<React.SetStateAction<boolean>>;
  syncViewportDebug: () => void;
  centerViewportOnPlayer: (options?: { resetZoom?: boolean }) => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleResetZoom: () => void;
  handleWheel: (event: React.WheelEvent) => void;
  handleMouseDown: (event: React.MouseEvent) => void;
  handleMouseMove: (event: React.MouseEvent) => void;
  handleMouseUp: () => void;
  handleMouseLeave: () => void;
  handleContextMenu: (event: React.MouseEvent) => void;
}

export function useLocalMapCamera({
  containerRef,
  stageRef,
  playerPosition,
  defaultZoom,
  cardOverflowPadding,
}: UseLocalMapCameraOptions): UseLocalMapCameraReturn {
  const [currentZoom, setCurrentZoom] = useState(defaultZoom);
  const [viewportDebug, setViewportDebug] = useState<LocalMapViewportDebugState>({
    pan: { x: 0, y: 0 },
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    playerTile: playerPosition,
  });
  const [isPanMode, setIsPanMode] = useState(false);

  const isPanModeRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastPanPositionRef = useRef({ x: 0, y: 0 });
  const autoPanRef = useRef<{ dx: number; dy: number } | null>(null);
  const autoPanAnimationRef = useRef<number | null>(null);
  const playerPositionRef = useRef(playerPosition);

  useEffect(() => {
    playerPositionRef.current = playerPosition;
  }, [playerPosition]);

  useEffect(() => {
    isPanModeRef.current = isPanMode;
  }, [isPanMode]);

  const syncViewportDebug = useCallback(() => {
    if (!stageRef.current) {
      return;
    }

    const { width, height } = stageRef.current.getStageDimensions();
    const metrics = createViewportMetrics(
      stageRef.current.getZoom(),
      stageRef.current.getPan(),
      width,
      height
    );

    setViewportDebug({
      pan: metrics.pan,
      bounds: {
        minX: metrics.panBounds.minX,
        maxX: metrics.panBounds.maxX,
        minY: metrics.panBounds.minY,
        maxY: metrics.panBounds.maxY,
      },
      playerTile: playerPositionRef.current,
    });
  }, [stageRef]);

  const getViewportCenterPoint = useCallback(() => {
    if (!containerRef.current) {
      return { x: 0, y: 0 };
    }

    const rect = containerRef.current.getBoundingClientRect();
    return getViewportCenter(
      rect.width - cardOverflowPadding * 2,
      rect.height - cardOverflowPadding * 2
    );
  }, [cardOverflowPadding, containerRef]);

  const centerViewportOnPlayer = useCallback((options?: { resetZoom?: boolean }) => {
    if (!stageRef.current || !containerRef.current) {
      return;
    }

    const shouldResetZoom = options?.resetZoom ?? false;
    if (shouldResetZoom) {
      stageRef.current.setZoom(defaultZoom);
      setCurrentZoom(defaultZoom);
    } else {
      setCurrentZoom(stageRef.current.getZoom());
    }

    const rect = containerRef.current.getBoundingClientRect();
    const viewportWidth = rect.width - cardOverflowPadding * 2;
    const viewportHeight = rect.height - cardOverflowPadding * 2;
    stageRef.current.centerOnTile(playerPositionRef.current, viewportWidth, viewportHeight);
    syncViewportDebug();
  }, [cardOverflowPadding, containerRef, defaultZoom, stageRef, syncViewportDebug]);

  const handleZoomIn = useCallback(() => {
    if (!stageRef.current) {
      return;
    }

    const newZoom = Math.min(stageRef.current.getZoom() + LOCAL_MAP_ZOOM.buttonStep, LOCAL_MAP_ZOOM.max);
    const center = getViewportCenterPoint();
    stageRef.current.setZoom(newZoom, center.x, center.y);
    setCurrentZoom(newZoom);
    syncViewportDebug();
  }, [getViewportCenterPoint, stageRef, syncViewportDebug]);

  const handleZoomOut = useCallback(() => {
    if (!stageRef.current) {
      return;
    }

    const newZoom = Math.max(stageRef.current.getZoom() - LOCAL_MAP_ZOOM.buttonStep, LOCAL_MAP_ZOOM.min);
    const center = getViewportCenterPoint();
    stageRef.current.setZoom(newZoom, center.x, center.y);
    setCurrentZoom(newZoom);
    syncViewportDebug();
  }, [getViewportCenterPoint, stageRef, syncViewportDebug]);

  const handleResetZoom = useCallback(() => {
    centerViewportOnPlayer({ resetZoom: true });
  }, [centerViewportOnPlayer]);

  const handleWheel = useCallback((event: React.WheelEvent) => {
    if (!stageRef.current || !containerRef.current) {
      return;
    }

    event.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left - cardOverflowPadding;
    const mouseY = event.clientY - rect.top - cardOverflowPadding;
    const zoomDelta = event.deltaY > 0 ? -LOCAL_MAP_ZOOM.wheelStep : LOCAL_MAP_ZOOM.wheelStep;
    const newZoom = Math.max(
      LOCAL_MAP_ZOOM.min,
      Math.min(LOCAL_MAP_ZOOM.max, stageRef.current.getZoom() + zoomDelta)
    );

    stageRef.current.setZoom(newZoom, mouseX, mouseY);
    setCurrentZoom(newZoom);
    syncViewportDebug();
  }, [cardOverflowPadding, containerRef, stageRef, syncViewportDebug]);

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (isPanModeRef.current && event.button === 0) {
      event.preventDefault();
      isPanningRef.current = true;
      lastPanPositionRef.current = { x: event.clientX, y: event.clientY };
      return;
    }

    if (event.button === 1 || event.button === 2 || (event.button === 0 && event.ctrlKey)) {
      event.preventDefault();
      isPanningRef.current = true;
      lastPanPositionRef.current = { x: event.clientX, y: event.clientY };
    }
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
  }, []);

  const startAutoPan = useCallback(() => {
    if (autoPanAnimationRef.current !== null) {
      return;
    }

    const animate = () => {
      const direction = autoPanRef.current;
      if (direction && stageRef.current && (direction.dx !== 0 || direction.dy !== 0)) {
        stageRef.current.pan(
          direction.dx * WORLD_PLAY_VIEWPORT.autoPan.speedPxPerFrame,
          direction.dy * WORLD_PLAY_VIEWPORT.autoPan.speedPxPerFrame
        );
        syncViewportDebug();
      }
      autoPanAnimationRef.current = requestAnimationFrame(animate);
    };

    autoPanAnimationRef.current = requestAnimationFrame(animate);
  }, [stageRef, syncViewportDebug]);

  const stopAutoPan = useCallback(() => {
    if (autoPanAnimationRef.current !== null) {
      cancelAnimationFrame(autoPanAnimationRef.current);
      autoPanAnimationRef.current = null;
    }
    autoPanRef.current = null;
  }, []);

  const updateAutoPan = useCallback((event: React.MouseEvent) => {
    if (!containerRef.current || isPanningRef.current) {
      stopAutoPan();
      return;
    }

    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button') || target.closest('.z-20')) {
      stopAutoPan();
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let dx = 0;
    let dy = 0;

    if (x < WORLD_PLAY_VIEWPORT.autoPan.edgeZonePx) {
      dx = 1;
    } else if (x > rect.width - WORLD_PLAY_VIEWPORT.autoPan.edgeZonePx) {
      dx = -1;
    }

    if (y < WORLD_PLAY_VIEWPORT.autoPan.edgeZonePx) {
      dy = 1;
    } else if (y > rect.height - WORLD_PLAY_VIEWPORT.autoPan.edgeZonePx) {
      dy = -1;
    }

    if (dx !== 0 || dy !== 0) {
      autoPanRef.current = { dx, dy };
      startAutoPan();
      return;
    }

    stopAutoPan();
  }, [containerRef, startAutoPan, stopAutoPan]);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (isPanningRef.current && stageRef.current) {
      const dx = event.clientX - lastPanPositionRef.current.x;
      const dy = event.clientY - lastPanPositionRef.current.y;
      lastPanPositionRef.current = { x: event.clientX, y: event.clientY };
      stageRef.current.pan(dx, dy);
      syncViewportDebug();
      return;
    }

    updateAutoPan(event);
  }, [stageRef, syncViewportDebug, updateAutoPan]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false;
    stopAutoPan();
  }, [stopAutoPan]);

  useEffect(() => {
    return () => {
      if (autoPanAnimationRef.current !== null) {
        cancelAnimationFrame(autoPanAnimationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const panSpeed = WORLD_PLAY_VIEWPORT.keyboardPan.speedPxPerFrame;
    const keysHeld = new Set<string>();
    let animationId: number | null = null;

    const updatePan = () => {
      if (!stageRef.current || keysHeld.size === 0) {
        animationId = null;
        return;
      }

      let dx = 0;
      let dy = 0;
      if (keysHeld.has('w')) dy += panSpeed;
      if (keysHeld.has('s')) dy -= panSpeed;
      if (keysHeld.has('a')) dx += panSpeed;
      if (keysHeld.has('d')) dx -= panSpeed;

      if (dx !== 0 || dy !== 0) {
        stageRef.current.pan(dx, dy);
        syncViewportDebug();
      }

      animationId = requestAnimationFrame(updatePan);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
        || (event.target instanceof HTMLElement && event.target.isContentEditable)) {
        return;
      }

      if (event.key === 'p' || event.key === 'P') {
        setIsPanMode((previous) => !previous);
        return;
      }

      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) {
        event.preventDefault();
        if (!keysHeld.has(key)) {
          keysHeld.add(key);
          if (!animationId) {
            animationId = requestAnimationFrame(updatePan);
          }
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      keysHeld.delete(event.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [stageRef, syncViewportDebug]);

  return {
    currentZoom,
    viewportDebug,
    isPanMode,
    isPanModeRef,
    setIsPanMode,
    syncViewportDebug,
    centerViewportOnPlayer,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleContextMenu,
  };
}
