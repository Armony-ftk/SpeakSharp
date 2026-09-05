import { createContext, useContext, useMemo, useState } from 'react';
import { lightColors, darkColors, getTypography, spacing, radius } from './theme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  const value = useMemo(() => {
    const colors = isDark ? darkColors : lightColors;
    return {
      isDark,
      setIsDark,
      toggleDarkMode: () => setIsDark((prev) => !prev),
      colors,
      spacing,
      radius,
      typography: getTypography(colors),
    };
  }, [isDark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return context;
}
