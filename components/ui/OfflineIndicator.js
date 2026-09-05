import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import PrimaryButton from './PrimaryButton';
import { radius, spacing } from '../../constants/theme';
import { useAppTheme } from '../../constants/ThemeContext';

const AVAILABLE = [
  'Record presentations',
  'Play saved recordings',
  'View cached feedback',
  'Edit saved transcripts',
];
const UNAVAILABLE = ['Generate new transcripts', 'Generate new AI analysis', 'Sync new results'];

export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const insets = useSafeAreaInsets();
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return unsubscribe;
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.pill, { top: insets.top + spacing.xs }]}
        onPress={() => setShowDetails(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="cloud-offline-outline" size={16} color={colors.card} />
        <View style={styles.pillTextWrap}>
          <Text style={styles.pillTitle}>Offline Mode</Text>
          <Text style={styles.pillSubtitle}>Local features available</Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={showDetails}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetails(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Offline Mode</Text>

            {AVAILABLE.map((item) => (
              <View key={item} style={styles.row}>
                <Ionicons name="checkmark" size={16} color={colors.success} />
                <Text style={styles.rowText}>{item}</Text>
              </View>
            ))}
            {UNAVAILABLE.map((item) => (
              <View key={item} style={styles.row}>
                <Ionicons name="close" size={16} color={colors.textSecondary} />
                <Text style={[styles.rowText, styles.rowTextMuted]}>{item}</Text>
              </View>
            ))}

            <Text style={styles.note}>
              Your work is saved on this device. SpeakSharp will continue processing when you're
              back online.
            </Text>

            <PrimaryButton label="Done" onPress={() => setShowDetails(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    shadowColor: '#101828',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
  },
  pillTextWrap: {
    marginLeft: spacing.xs,
  },
  pillTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.card,
  },
  pillSubtitle: {
    fontSize: 9,
    color: colors.card,
    opacity: 0.75,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 24, 40, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  sheetTitle: {
    ...typography.heading,
    fontSize: 18,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  rowText: {
    fontSize: 14,
    color: colors.navySoft,
    marginLeft: spacing.sm,
  },
  rowTextMuted: {
    color: colors.textSecondary,
  },
  note: {
    ...typography.body,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  });
}
