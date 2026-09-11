import { useState } from 'react';

const ROWS: Array<[string, string]> = [
  ['click organism', 'inspect it; its vision cone (range × angle) is drawn — geometry only'],
  ['click lineage row', 'focus that lineage'],
  ['# id  ⏎', 'jump to a living organism'],
  ['wheel · + / −', 'zoom (around the cursor)'],
  ['drag', 'pan'],
  ['F', 'fit the whole world'],
  ['Space', 'pause / resume the view only'],
  ['Esc', 'deselect'],
];

/** A small "?" toggle with the existing controls listed. Not a tutorial. */
export function HelpHint() {
  const [open, setOpen] = useState(false);
  return (
    <div className="help">
      <button type="button" className={`ctl ctl-help${open ? ' ctl-active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Controls help" title="Controls">?</button>
      {open ? (
        <div className="help-pop" role="dialog" aria-label="Controls">
          <dl className="help-list">
            {ROWS.map(([k, v]) => (
              <div className="help-row" key={k}><dt className="mono">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          <p className="help-foot dim">The Observatory only watches. Nothing here changes the simulation.</p>
        </div>
      ) : null}
    </div>
  );
}
