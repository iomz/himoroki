import { useEffect, useId, useRef, useState } from 'react';
import { filterTimezones } from './timezones';

export function TimezonePicker({ name, value, disabled = false, onChange }: {
  name: string; value: string; disabled?: boolean; onChange?(value: string): void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = filterTimezones(query);
  const listId = `${id}-list`;
  const activeId = matches[active] ? `${id}-option-${active}` : undefined;

  useEffect(() => { setSelected(value); }, [value]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  useEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId, open]);

  function choose(zone: string) {
    setSelected(zone);
    if (zone !== selected) onChange?.(zone);
    setQuery('');
    setOpen(false);
    trigger.current?.focus();
  }
  function openPicker() {
    setQuery('');
    setActive(0);
    setOpen(true);
  }

  return <div className="timezone-field" ref={root}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>Display timezone</label>
    <input type="hidden" name={name} value={selected} readOnly />
    <button id={`${id}-trigger`} ref={trigger} type="button" className="timezone-trigger"
      disabled={disabled}
      aria-labelledby={`${id}-label ${id}-value`} aria-controls={listId} aria-expanded={open} aria-haspopup="listbox"
      onClick={() => open ? setOpen(false) : openPicker()}>
      <span id={`${id}-value`}>{selected}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="timezone-popover">
      <label className="sr-only" htmlFor={`${id}-search`}>Search timezones</label>
      <input id={`${id}-search`} ref={search} type="search" role="combobox" value={query} placeholder="Search timezones…"
        autoComplete="off" aria-autocomplete="list" aria-controls={listId} aria-expanded="true" aria-activedescendant={activeId}
        onChange={(event) => { setQuery(event.currentTarget.value); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, matches.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && matches[active]) {
            event.preventDefault();
            choose(matches[active]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            trigger.current?.focus();
          }
        }} />
      <ul id={listId} role="listbox" aria-labelledby={`${id}-label`} className="timezone-list">
        {matches.map((zone, index) => <li id={`${id}-option-${index}`} key={zone} role="option"
          aria-selected={zone === selected} className={index === active ? 'active' : undefined}
          onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(zone)}>
          {zone}
        </li>)}
      </ul>
      {!matches.length && <p className="timezone-empty" role="status">No matching timezones.</p>}
    </div>}
  </div>;
}
