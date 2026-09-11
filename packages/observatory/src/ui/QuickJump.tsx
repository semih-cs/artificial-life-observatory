import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

export type JumpResult = 'selected' | 'not-alive' | 'invalid';

export interface QuickJumpProps {
  /** Resolve an id against the newest frame only. Never queries anything. */
  onJump: (id: number) => JumpResult;
}

/** Parse "208", "#208" or " 208 " into an organism id; null otherwise. */
export function parseOrganismId(raw: string): number | null {
  const m = /^\s*#?\s*(\d{1,9})\s*$/.exec(raw);
  return m === null ? null : Number(m[1]);
}

/**
 * Organism quick-jump: type an id, Enter selects it if it is in the newest
 * frame (and centres the camera on it); otherwise a small "not alive" note.
 * Current frame only — no history, no backend query.
 */
export function QuickJump({ onJump }: QuickJumpProps) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState<{ kind: 'not-alive' | 'invalid'; id: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (note === null) return;
    const h = setTimeout(() => setNote(null), 2400);
    return () => clearTimeout(h);
  }, [note]);

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const id = parseOrganismId(value);
    if (id === null) { setNote({ kind: 'invalid', id: value.trim() }); return; }
    const result = onJump(id);
    if (result === 'selected') { setValue(''); setNote(null); inputRef.current?.blur(); }
    else setNote({ kind: result === 'invalid' ? 'invalid' : 'not-alive', id: `#${id}` });
  };
  const onKey = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Escape') { setValue(''); setNote(null); inputRef.current?.blur(); ev.stopPropagation(); }
  };

  return (
    <form className="jump" onSubmit={submit} role="search" aria-label="Jump to organism">
      <span className="jump-prefix" aria-hidden="true">#</span>
      <input
        ref={inputRef}
        className="jump-input mono"
        type="text"
        inputMode="numeric"
        placeholder="organism id"
        value={value}
        onChange={(e) => { setValue(e.target.value); if (note !== null) setNote(null); }}
        onKeyDown={onKey}
        aria-label="Organism id"
        data-testid="jump-input"
      />
      {note !== null ? (
        <span className={`jump-note jump-note-${note.kind}`} role="status" data-testid="jump-note">
          {note.kind === 'not-alive' ? `${note.id} is not currently alive` : 'enter a numeric organism id'}
        </span>
      ) : null}
    </form>
  );
}
