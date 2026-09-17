import { useId } from 'react';
import type { ColorScheme } from '../shared/appearance';
import type { ThemeId } from '../shared/theme';
import { ThemePreview } from './theme-preview';
import { builtInThemes } from './themes';

export function ThemeSelector({ name, value, previewMode, disabled = false, onChange, onPreviewModeChange }: {
  name: string; value: ThemeId; previewMode: ColorScheme; disabled?: boolean;
  onChange?(value: ThemeId): void; onPreviewModeChange?(value: ColorScheme): void;
}) {
  const id = useId();
  return <fieldset className="theme-selector">
    <legend>Theme</legend>
    <div className="theme-selector-heading">
      <p>Choose an instance-wide theme. Preview its Light and Dark variants without changing your Profile appearance.</p>
    </div>
    <fieldset className="theme-preview-mode"><legend className="sr-only">Preview mode</legend>
      <div className="theme-preview-mode-row"><span aria-hidden="true">Preview mode</span><div>
        {(['light', 'dark'] as const).map((mode) => <label key={mode}>
          <input type="radio" name={`${id}-preview-mode`} value={mode} checked={previewMode === mode}
            onChange={() => onPreviewModeChange?.(mode)} />
          <span>{mode[0].toUpperCase() + mode.slice(1)}</span>
        </label>)}
      </div></div>
    </fieldset>
    <div className="theme-grid">
      {builtInThemes.map((theme) => <label className="theme-card" key={theme.id}>
        <input className="sr-only" type="radio" name={name} value={theme.id} checked={value === theme.id}
          disabled={disabled} onChange={() => onChange?.(theme.id)} required />
        <ThemePreview palette={theme[previewMode]} />
        <span className="theme-card-label">{theme.label}</span>
        <span className="theme-card-selected" aria-hidden="true">✓</span>
      </label>)}
    </div>
  </fieldset>;
}
