export const lightColors = {
  background: '#F2F4F9',
  card: '#FFFFFF',
  navy: '#101828',
  navySoft: '#344054',
  textPrimary: '#101828',
  textSecondary: '#667085',
  placeholder: '#98A2B3',
  border: '#E4E7EC',
  inputBackground: '#F5F6F8',
  accent: '#2E6BFF',
  success: '#12B76A',
};

export const darkColors = {
  background: '#0B0F19',
  card: '#161B26',
  navy: '#F2F4F9',
  navySoft: '#CBD2E1',
  textPrimary: '#F2F4F9',
  textSecondary: '#94A3B8',
  placeholder: '#64748B',
  border: '#2A3040',
  inputBackground: '#1F2430',
  accent: '#5B8DEF',
  success: '#3AD07A',
};

// Back-compat default (light) for any stray static import — dynamic screens should use useAppTheme().
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
};

export function getTypography(themeColors) {
  return {
    brand: {
      fontSize: 26,
      fontWeight: '800',
      color: themeColors.navy,
      letterSpacing: 0.2,
    },
    heading: {
      fontSize: 20,
      fontWeight: '700',
      color: themeColors.navy,
    },
    body: {
      fontSize: 14,
      color: themeColors.textSecondary,
    },
  };
}

export const typography = getTypography(lightColors);
