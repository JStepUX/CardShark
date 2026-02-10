// frontend/src/hooks/useGridViewport.ts
// Shared zoom/pan state and mouse handlers for editor grid views.

import { useState, useCallback, useRef } from 'react';
import { EDITOR_GRID_CELL_SIZE, EDITOR_GRID_CELL_GAP, EDITOR_ZOOM } from '../types/editorGrid';

export interface GridViewportState {
    zoom: number;
    pan: { x: number; y: number };
    isPanning: boolean;
    cellSize: number;
    gap: number;
}

export interface GridViewportHandlers {
    handleMouseDown: (e: React.MouseEvent<HTMLDivElement>, canPanFromCell?: boolean) => void;
    handleMouseMove: (e: React.MouseEvent) => void;
    handleMouseUp: () => void;
    handleWheel: (e: React.WheelEvent) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
}

export function useGridViewport(): [GridViewportState, GridViewportHandlers] {
    const [zoom, setZoom] = useState<number>(EDITOR_ZOOM.default);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0 });

    const cellSize = EDITOR_GRID_CELL_SIZE * zoom;
    const gap = EDITOR_GRID_CELL_GAP * zoom;

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>, canPanFromCell = false) => {
        const target = e.target as HTMLElement;
        const isInsideCell = target.closest('[data-cell="true"]');

        // Middle mouse always pans; left mouse pans from background (or cells if allowed)
        if (e.button === 1 || (e.button === 0 && (!isInsideCell || canPanFromCell))) {
            setIsPanning(true);
            panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }
    }, [pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanning) {
            setPan({
                x: e.clientX - panStartRef.current.x,
                y: e.clientY - panStartRef.current.y,
            });
        }
    }, [isPanning]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -EDITOR_ZOOM.wheelStep : EDITOR_ZOOM.wheelStep;
            setZoom(prev => Math.max(EDITOR_ZOOM.min, Math.min(EDITOR_ZOOM.max, prev + delta)));
        }
    }, []);

    const zoomIn = useCallback(() => {
        setZoom(prev => Math.min(prev + EDITOR_ZOOM.buttonStep, EDITOR_ZOOM.max));
    }, []);

    const zoomOut = useCallback(() => {
        setZoom(prev => Math.max(prev - EDITOR_ZOOM.buttonStep, EDITOR_ZOOM.min));
    }, []);

    const resetView = useCallback(() => {
        setZoom(EDITOR_ZOOM.default);
        setPan({ x: 0, y: 0 });
    }, []);

    const state: GridViewportState = { zoom, pan, isPanning, cellSize, gap };
    const handlers: GridViewportHandlers = {
        handleMouseDown, handleMouseMove, handleMouseUp, handleWheel,
        zoomIn, zoomOut, resetView,
    };

    return [state, handlers];
}
