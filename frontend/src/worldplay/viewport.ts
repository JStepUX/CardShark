import { WORLD_PLAY_VIEWPORT } from './config';

export interface ViewportPan {
  x: number;
  y: number;
}

export interface ViewportPanBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ViewportMetrics {
  zoom: number;
  pan: ViewportPan;
  panBounds: ViewportPanBounds;
}

export function calculateViewportPanBounds(
  stageWidth: number,
  stageHeight: number,
  zoom: number,
  minVisibleFraction: number = WORLD_PLAY_VIEWPORT.zoom.minVisibleFraction
): ViewportPanBounds {
  const scaledWidth = stageWidth * zoom;
  const scaledHeight = stageHeight * zoom;
  const minVisibleX = scaledWidth * minVisibleFraction;
  const minVisibleY = scaledHeight * minVisibleFraction;

  return {
    minX: -(scaledWidth - minVisibleX),
    maxX: scaledWidth - minVisibleX,
    minY: -(scaledHeight - minVisibleY),
    maxY: scaledHeight - minVisibleY,
  };
}

export function clampViewportPan(
  pan: ViewportPan,
  stageWidth: number,
  stageHeight: number,
  zoom: number
): ViewportPan {
  const bounds = calculateViewportPanBounds(stageWidth, stageHeight, zoom);

  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, pan.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, pan.y)),
  };
}

export function createViewportMetrics(
  zoom: number,
  pan: ViewportPan,
  stageWidth: number,
  stageHeight: number
): ViewportMetrics {
  return {
    zoom,
    pan,
    panBounds: calculateViewportPanBounds(stageWidth, stageHeight, zoom),
  };
}

export function getViewportCenter(width: number, height: number): { x: number; y: number } {
  return {
    x: width / 2,
    y: height / 2,
  };
}