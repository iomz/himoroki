import type { ThemePalette } from './themes/types';
import { paletteVariables } from './themes/variables';

export function ThemePreview({ palette }: { palette: ThemePalette }) {
  return <span className="theme-preview" style={paletteVariables(palette)} aria-hidden="true">
    <span className="theme-preview-chrome"><span className="theme-preview-mark" /><span /><span /></span>
    <span className="theme-preview-canvas">
      <span className="theme-preview-surface"><span /><span /><i /><b /></span>
    </span>
  </span>;
}
