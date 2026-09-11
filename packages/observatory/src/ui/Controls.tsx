import { QuickJump, type JumpResult } from './QuickJump.js';
import { HelpHint } from './HelpHint.js';

export interface ControlsProps {
  viewPaused: boolean;
  zoomPercent: number | null;
  focusLineage: number | null;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTogglePause: () => void;
  onClearFocus: () => void;
  onJump: (id: number) => JumpResult;
}

export function Controls({ viewPaused, zoomPercent, focusLineage, onFit, onZoomIn, onZoomOut, onTogglePause, onClearFocus, onJump }: ControlsProps) {
  return (
    <div className="controls" aria-label="View controls">
      {focusLineage !== null ? (
        <button type="button" className="chip" onClick={onClearFocus} title="Clear lineage focus (display only)">
          Lineage #{focusLineage} focused <span aria-hidden="true">×</span>
        </button>
      ) : null}
      <QuickJump onJump={onJump} />
      <div className="control-group">
        <button type="button" className="ctl" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">−</button>
        <span className="ctl ctl-readout mono" title="Zoom relative to fit">{zoomPercent === null ? '—' : `${zoomPercent}%`}</span>
        <button type="button" className="ctl" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">+</button>
        <button type="button" className="ctl" onClick={onFit} title="Fit whole world (F)">Fit</button>
      </div>
      <button
        type="button"
        className={`ctl ctl-pause${viewPaused ? ' ctl-active' : ''}`}
        onClick={onTogglePause}
        title="Pauses only this view. The simulation keeps running."
      >
        {viewPaused ? 'Resume view' : 'Pause view'}
      </button>
      <HelpHint />
    </div>
  );
}
