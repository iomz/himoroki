import { useId, useState } from 'react';
import type { ThemeId } from '../shared/theme';
import { ThemePreview } from './theme-preview';
import { builtInThemes } from './themes';

type PreviewMode = 'light' | 'dark';

export function ThemeSelector({ name, value }: { name: string; value: ThemeId }) {
  const id = useId();
  const [previewMode, setPreviewMode] = useState<PreviewMode>('light');
  return <fieldset className="theme-selector">
    <legend>Theme</legend>
    <div className="theme-selector-heading">
      <p>Choose a built-in theme for this instance.</p>
      <fieldset className="theme-preview-mode"><legend>Preview mode</legend><div>
        {(['light', 'dark'] as const).map((mode) => <label key={mode}>
          <input type="radio" name={`${id}-preview-mode`} value={mode} checked={previewMode === mode}
            onChange={() => setPreviewMode(mode)} />
          <span>{mode[0].toUpperCase() + mode.slice(1)}</span>
        </label>)}
      </div></fieldset>
    </div>
    <div className="theme-grid">
      {builtInThemes.map((theme) => <label className="theme-card" key={theme.id}>
        <input className="sr-only" type="radio" name={name} value={theme.id} defaultChecked={value === theme.id} required />
        <ThemePreview palette={theme[previewMode]} />
        <span className="theme-card-label">{theme.label}</span>
        <span className="theme-card-selected" aria-hidden="true">✓</span>
      </label>)}
    </div>
  </fieldset>;
}
