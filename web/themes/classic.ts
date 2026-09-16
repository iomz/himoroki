import type { ThemeDefinition } from './types';

export const classicTheme = {
  id: 'classic',
  label: 'Classic',
  light: {
    canvas: '#f4f5f7', surface: '#ffffff', surfaceMuted: '#e9edf1', surfaceHover: '#f2f4f6',
    border: '#d3d9df', controlBorder: '#82909e', text: '#29343f', textMuted: '#596775',
    chrome: '#29384a', chromeHover: '#3c5066', chromeText: '#f2f5f8', chromeMuted: '#bbc6d1', brandMark: '#4f91c2',
    accent: '#3676a8', accentSoft: '#dce8f1', accentText: '#285779',
    link: '#285f8a', linkHover: '#1c486b', focus: '#285f8a',
    action: '#2f5f87', actionHover: '#244966', actionText: '#ffffff',
    selectedSurface: '#dce8f1', selectedText: '#244f70', selectedIndicator: '#3676a8',
    successSurface: '#e2eee5', successText: '#2d613d', dangerSurface: '#f4e2e1', dangerText: '#84302d',
  },
  dark: {
    canvas: '#171b20', surface: '#20262d', surfaceMuted: '#2a323c', surfaceHover: '#333d48',
    border: '#424e5b', controlBorder: '#718091', text: '#edf1f5', textMuted: '#b7c1cc',
    chrome: '#111820', chromeHover: '#273544', chromeText: '#f3f6f9', chromeMuted: '#afbdca', brandMark: '#69a7d5',
    accent: '#69a7d5', accentSoft: '#213b51', accentText: '#badcf3',
    link: '#84bce2', linkHover: '#aed5ef', focus: '#7db7df',
    action: '#3c7098', actionHover: '#346588', actionText: '#ffffff',
    selectedSurface: '#28445a', selectedText: '#d6eaf7', selectedIndicator: '#69a7d5',
    successSurface: '#203a2a', successText: '#a8dcba', dangerSurface: '#482422', dangerText: '#ffbfba',
  },
} satisfies ThemeDefinition;
