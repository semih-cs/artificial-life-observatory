import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { FrameStore } from '../world/frameStore.js';
import { WorldRenderer } from '../render/WorldRenderer.js';
import type { CameraState } from '../render/camera.js';

export interface WorldViewHandle {
  fitWorld(): void;
  zoomBy(factor: number): void;
  centerOnOrganism(id: number): boolean;
}

export interface WorldViewProps {
  store: FrameStore;
  selectedId: number | null;
  emphasisLineage: number | null;
  viewPaused: boolean;
  onSelect: (id: number | null) => void;
  onCamera: (cam: CameraState, fitted: boolean) => void;
}

/**
 * The canvas host. Organisms and food are drawn by `WorldRenderer` (PixiJS);
 * React only mounts it and forwards presentation state.
 */
export const WorldView = forwardRef<WorldViewHandle, WorldViewProps>(function WorldView(
  { store, selectedId, emphasisLineage, viewPaused, onSelect, onCamera },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WorldRenderer | null>(null);
  const onSelectRef = useRef(onSelect);
  const onCameraRef = useRef(onCamera);
  const selectedIdRef = useRef(selectedId);
  const emphasisRef = useRef(emphasisLineage);
  const pausedRef = useRef(viewPaused);
  onSelectRef.current = onSelect;
  onCameraRef.current = onCamera;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const renderer = new WorldRenderer(store, {
      onSelect: (id) => onSelectRef.current(id),
      onCamera: (cam, fitted) => onCameraRef.current(cam, fitted),
    });
    rendererRef.current = renderer;
    void renderer.mount(host).then(() => {
      if (rendererRef.current !== renderer) return;
      renderer.setSelection(selectedIdRef.current);
      renderer.setEmphasisLineage(emphasisRef.current);
      renderer.setPaused(pausedRef.current);
    });
    return () => {
      rendererRef.current = null;
      renderer.destroy();
    };
  }, [store]);

  useEffect(() => { selectedIdRef.current = selectedId; rendererRef.current?.setSelection(selectedId); }, [selectedId]);
  useEffect(() => { emphasisRef.current = emphasisLineage; rendererRef.current?.setEmphasisLineage(emphasisLineage); }, [emphasisLineage]);
  useEffect(() => { pausedRef.current = viewPaused; rendererRef.current?.setPaused(viewPaused); }, [viewPaused]);

  useImperativeHandle(ref, () => ({
    fitWorld: () => rendererRef.current?.fitWorld(),
    zoomBy: (factor: number) => rendererRef.current?.zoomBy(factor),
    centerOnOrganism: (id: number) => rendererRef.current?.centerOnOrganism(id) ?? false,
  }), []);

  return <div className="world-host" ref={hostRef} data-testid="world-host" />;
});
