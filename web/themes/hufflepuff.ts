import type { ThemeDefinition } from './types';

export const hufflepuffTheme = {
  id: 'hufflepuff',
  label: 'Hufflepuff',
  light: {
    canvas: '#fbf7e8', surface: '#fffdf6', surfaceMuted: '#f4ecd2', surfaceHover: '#faf3dc',
    border: '#ded2ad', controlBorder: '#94845e', text: '#393329', textMuted: '#665c48',
    chrome: '#302d25', chromeHover: '#484236', chromeText: '#fff8df', chromeMuted: '#d3c69e', brandMark: '#efc84a',
    accent: '#c79516', accentSoft: '#f3e3ad', accentText: '#5c4300',
    link: '#765100', linkHover: '#563a00', focus: '#8a6200',
    action: '#3d382e', actionHover: '#27241e', actionText: '#fff9e5',
    selectedSurface: '#f1dfa6', selectedText: '#4a3710', selectedIndicator: '#a67400',
    successSurface: '#e8f0df', successText: '#3d5e2e', dangerSurface: '#f5e4df', dangerText: '#81372d',
  },
  dark: {
    canvas: '#171612', surface: '#211f19', surfaceMuted: '#2c291f', surfaceHover: '#353126',
    border: '#4a4433', controlBorder: '#7b704e', text: '#f5efd9', textMuted: '#c9bea0',
    chrome: '#090909', chromeHover: '#24221b', chromeText: '#fff7da', chromeMuted: '#d0c291', brandMark: '#f1c84b',
    accent: '#f1c84b', accentSoft: '#443813', accentText: '#ffe79a',
    link: '#f3cf5a', linkHover: '#ffe38b', focus: '#f3cf5a',
    action: '#d6aa23', actionHover: '#efc13a', actionText: '#201900',
    selectedSurface: '#4a3c16', selectedText: '#ffedac', selectedIndicator: '#f1c84b',
    successSurface: '#283a21', successText: '#b9dda6', dangerSurface: '#49241f', dangerText: '#ffc0b2',
  },
} satisfies ThemeDefinition;
