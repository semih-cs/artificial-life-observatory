import type { FeedEvent } from '../world/sessionHistory.js';
import { lineageColor } from '../world/lineageColor.js';
import { formatInt } from './format.js';

export interface EventFeedProps {
  /** Oldest → newest; rendered newest first. */
  events: readonly FeedEvent[];
  /** Show at most this many (the newest). */
  limit?: number;
  focusLineage: number | null;
  /** Called with an organism id; the caller decides whether it is still selectable. */
  onSelectOrganism: (id: number) => void;
}

export const EVENT_FEED_RENDER_LIMIT = 40;

/**
 * Births, deaths, lineage extinctions and observation gaps derived from
 * consecutive received frames. Restrained: small markers, no alerts.
 */
export function EventFeed({ events, limit = EVENT_FEED_RENDER_LIMIT, focusLineage, onSelectOrganism }: EventFeedProps) {
  const shown: FeedEvent[] = [];
  for (let i = events.length - 1; i >= 0 && shown.length < limit; i--) shown.push(events[i]!);
  return (
    <section className="feed" aria-label="Birth and death events">
      <div className="panel-section-head">
        <h3 className="panel-section-title">Events</h3>
        <span className="panel-section-meta">between consecutive frames · newest first</span>
      </div>
      {shown.length === 0 ? <p className="panel-empty">no births or deaths observed yet</p> : null}
      <ol className="feed-list">
        {shown.map((e) => {
          if (e.kind === 'gap') {
            return (
              <li key={`gap-${e.seq}`} className="feed-row feed-gap" data-testid="feed-gap">
                <span className="feed-mark feed-mark-gap" aria-hidden="true">···</span>
                <span className="feed-text">observation gap · ticks {formatInt(e.fromTick)} → {formatInt(e.toTick)}</span>
                <span className="feed-note dim">{e.frames} frame{e.frames === 1 ? '' : 's'} · births/deaths not inferred</span>
              </li>
            );
          }
          const color = lineageColor(e.lineageRootId);
          const inFocus = focusLineage !== null && e.lineageRootId === focusLineage;
          const dimmed = focusLineage !== null && !inFocus;
          const cls = `feed-row feed-${e.kind}${dimmed ? ' feed-dimmed' : ''}${inFocus ? ' feed-in-focus' : ''}`;
          if (e.kind === 'extinction') {
            return (
              <li key={`x-${e.seq}`} className={cls} data-testid="feed-extinction">
                <span className="feed-mark feed-mark-extinct" style={{ color: color.css }} aria-hidden="true">◌</span>
                <span className="feed-text">lineage <span className="mono">#{e.lineageRootId}</span> no longer living</span>
                <span className="feed-note dim">t {formatInt(e.tick)} · was {e.lastCount}</span>
              </li>
            );
          }
          if (e.kind === 'birth') {
            return (
              <li key={`b-${e.seq}`} className={cls} data-testid="feed-birth">
                <span className="feed-mark feed-mark-birth" style={{ color: color.css }} aria-hidden="true">●</span>
                <span className="feed-text">
                  born <button type="button" className="feed-id mono" onClick={() => onSelectOrganism(e.id)} title="Select this organism if it is still alive">#{e.id}</button>
                  {e.parentId !== null ? <span className="dim" title={`parent #${e.parentId}`}> ← <span className="mono">#{e.parentId}</span></span> : null}
                  <span className="dim"> · lineage </span><span className="mono">#{e.lineageRootId}</span>
                  <span className="dim"> · gen {e.generationDepth}</span>
                </span>
                <span className="feed-note dim">t {formatInt(e.tick)}</span>
              </li>
            );
          }
          return (
            <li key={`d-${e.seq}`} className={cls} data-testid="feed-death">
              <span className="feed-mark feed-mark-death" style={{ color: color.css }} aria-hidden="true">○</span>
              <span className="feed-text">
                died <span className="mono">#{e.id}</span>
                <span className="dim"> · lineage </span><span className="mono">#{e.lineageRootId}</span>
                <span className="dim"> · gen {e.generationDepth} · age {formatInt(e.lastAge)}</span>
              </span>
              <span className="feed-note dim">t {formatInt(e.tick)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
