import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import EmptyState from "../ui/EmptyState";
import FilterTabs from "../ui/FilterTabs";
import PrimaryButton from "../ui/PrimaryButton";
import ScreenContainer from "../ui/ScreenContainer";
import UserListItem from "../admin/UserListItem";
import { radius, spacing } from "../../constants/theme";
import { useAppTheme } from "../../constants/ThemeContext";
import { getUsers } from "../../services/adminService";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;
const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Suspended", value: "suspended" },
];

function getErrorState(error) {
  if (error?.code === "permission-denied") {
    return "forbidden";
  }

  if (
    error?.code === "unavailable" ||
    error?.code === "auth/network-request-failed"
  ) {
    return "offline";
  }

  return "error";
}

function OnlineRequiredBanner({ onRetry, styles, colors }) {
  return (
    <View
      style={styles.offlineBanner}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.offlineMessage}>
        <Ionicons
          name="cloud-offline-outline"
          size={20}
          color={colors.navy}
        />
        <Text style={styles.offlineText}>
          Admin information requires an internet connection.
        </Text>
      </View>
      <PrimaryButton label="Retry" onPress={onRetry} style={styles.retryButton} />
    </View>
  );
}

export default function AdminUsersScreen() {
  const { colors, typography } = useAppTheme();
  const styles = getStyles(colors, typography);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [users, setUsers] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [total, setTotal] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [loadMoreState, setLoadMoreState] = useState("idle");
  const [retryCount, setRetryCount] = useState(0);
  const requestIdRef = useRef(0);
  const latestQueryRef = useRef({ search: "", status: "all" });

  const isSearchPending = searchInput.trim() !== debouncedSearch;
  const hasFilters = Boolean(searchInput.trim()) || status !== "all";

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (isSearchPending) {
      return undefined;
    }

    const query = { search: debouncedSearch, status };
    latestQueryRef.current = query;
    const requestId = ++requestIdRef.current;

    setUsers([]);
    setNextCursor(null);
    setTotal(null);
    setLoadState("loading");
    setLoadMoreState("idle");

    getUsers({
      ...query,
      pageSize: PAGE_SIZE,
      cursor: null,
    })
      .then((result) => {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setUsers(Array.isArray(result.items) ? result.items : []);
        setNextCursor(result.nextCursor ?? null);
        setTotal(result.total ?? null);
        setLoadState("success");
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn("Could not load admin users", error);
        }
        if (requestId === requestIdRef.current) {
          setLoadState(getErrorState(error));
        }
      });

    return () => {
      if (requestId === requestIdRef.current) {
        requestIdRef.current += 1;
      }
    };
  }, [debouncedSearch, isSearchPending, retryCount, status]);

  const handleSearchChange = useCallback((value) => {
    requestIdRef.current += 1;
    setSearchInput(value);
    setUsers([]);
    setNextCursor(null);
    setTotal(null);
    setLoadState("loading");
    setLoadMoreState("idle");
  }, []);

  const handleStatusChange = useCallback((value) => {
    requestIdRef.current += 1;
    setStatus(value);
    setUsers([]);
    setNextCursor(null);
    setTotal(null);
    setLoadState("loading");
    setLoadMoreState("idle");
  }, []);

  const retryFirstPage = useCallback(() => {
    setLoadState("loading");
    setRetryCount((count) => count + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setRetryCount((count) => count + 1);
    }, []),
  );

  const clearFilters = useCallback(() => {
    requestIdRef.current += 1;
    setSearchInput("");
    setDebouncedSearch("");
    setStatus("all");
    setUsers([]);
    setNextCursor(null);
    setTotal(null);
    setLoadMoreState("idle");
    setLoadState("loading");
    setRetryCount((count) => count + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") {
      return;
    }

    const query = latestQueryRef.current;
    const cursor = nextCursor;
    const requestId = ++requestIdRef.current;

    setLoadMoreState("loading");
    getUsers({
      ...query,
      pageSize: PAGE_SIZE,
      cursor,
    })
      .then((result) => {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setUsers((currentUsers) => [...currentUsers, ...(result.items ?? [])]);
        setNextCursor(result.nextCursor ?? null);
        setLoadMoreState("idle");
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn("Could not load the next page of admin users", error);
        }
        if (requestId === requestIdRef.current) {
          setLoadMoreState(getErrorState(error));
        }
      });
  }, [loadMoreState, nextCursor]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    [],
  );

  const retryMore = useCallback(() => {
    setLoadMoreState("idle");
    loadMore();
  }, [loadMore]);

  const goToUser = useCallback((userId) => {
    router.push({
      pathname: "/admin/users/[userId]",
      params: { userId },
    });
  }, []);

  const showInitialError =
    loadState === "error" || loadState === "forbidden";
  const isOffline =
    loadState === "offline" || loadMoreState === "offline";
  const hasNoMatches = loadState === "success" && users.length === 0;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Users</Text>
        {loadState === "success" && total != null ? (
          <Text style={styles.total}>{total} total</Text>
        ) : null}
      </View>

      {__DEV__ ? (
        <View style={styles.demoNotice} accessibilityRole="text">
          <Ionicons name="flask-outline" size={16} color={colors.accent} />
          <Text style={styles.demoNoticeText}>Demo Data</Text>
        </View>
      ) : null}

      <View style={styles.searchWrapper}>
        <Ionicons
          name="search-outline"
          size={18}
          color={colors.placeholder}
          style={styles.searchIcon}
        />
        <TextInput
          accessibilityLabel="Search users by name or email"
          accessibilityHint="Search is applied after a short delay"
          returnKeyType="search"
          style={styles.searchInput}
          placeholder="Search name or email"
          placeholderTextColor={colors.placeholder}
          value={searchInput}
          onChangeText={handleSearchChange}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <Text
        accessibilityRole="text"
        style={styles.filterLabel}
      >
        Filter users by account status
      </Text>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={`Account status filters. ${status === "all" ? "All" : status === "active" ? "Active" : "Suspended"} selected.`}
        style={styles.filterGroup}
      >
        <FilterTabs
          options={STATUS_OPTIONS}
          value={status}
          onChange={handleStatusChange}
        />
      </View>

      {isOffline ? (
        <OnlineRequiredBanner
          onRetry={loadState === "offline" ? retryFirstPage : retryMore}
          styles={styles}
          colors={colors}
        />
      ) : null}

      {loadState === "loading" ? (
        <View
          style={styles.loading}
          accessibilityRole="progressbar"
          accessibilityLabel="Loading users"
        >
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading users</Text>
        </View>
      ) : null}

      {loadState === "success" && hasNoMatches ? (
        <EmptyState
          icon="people-outline"
          title={hasFilters ? "No matching users" : "No users yet"}
          description={
            hasFilters
              ? "Try a different search or filter."
              : "There are no user accounts to show yet."
          }
          actionLabel={hasFilters ? "Clear Filters" : undefined}
          onAction={hasFilters ? clearFilters : undefined}
        />
      ) : null}

      {showInitialError ? (
        <EmptyState
          icon={
            loadState === "forbidden"
              ? "lock-closed-outline"
              : "alert-circle-outline"
          }
          title={
            loadState === "forbidden"
              ? "Access Denied"
              : "Couldn’t load users"
          }
          description={
            loadState === "forbidden"
              ? "You don’t have permission to view the user directory."
              : "The user directory is unavailable right now. Try again."
          }
          actionLabel={loadState === "error" ? "Retry" : undefined}
          onAction={loadState === "error" ? retryFirstPage : undefined}
        />
      ) : null}

      {loadState === "success" && users.length > 0 ? (
        <View style={styles.list}>
          {users.map((user, index) => (
            <UserListItem
              key={user.userId ?? `user-${index}`}
              user={user}
              onPress={() => user.userId && goToUser(user.userId)}
            />
          ))}
        </View>
      ) : null}

      {loadMoreState === "forbidden" ? (
        <View style={styles.footerError} accessibilityRole="alert">
          <Text style={styles.footerErrorText}>
            Access to more users was denied.
          </Text>
        </View>
      ) : null}

      {loadMoreState === "error" ? (
        <View style={styles.footerError} accessibilityRole="alert">
          <Text style={styles.footerErrorText}>
            Couldn’t load more users.
          </Text>
          <PrimaryButton
            label="Retry"
            onPress={retryMore}
            style={styles.footerButton}
          />
        </View>
      ) : null}

      {loadMoreState === "loading" ? (
        <View
          style={styles.footerLoading}
          accessibilityRole="progressbar"
          accessibilityLabel="Loading more users"
        >
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading more users</Text>
        </View>
      ) : null}

      {loadState === "success" &&
      users.length > 0 &&
      nextCursor &&
      loadMoreState === "idle" ? (
        <PrimaryButton
          label="Load More"
          onPress={loadMore}
          style={styles.loadMoreButton}
        />
      ) : null}
    </ScreenContainer>
  );
}

function getStyles(colors, typography) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    title: {
      ...typography.heading,
      fontSize: 22,
    },
    total: {
      ...typography.body,
      flexShrink: 1,
      textAlign: "right",
    },
    demoNotice: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: spacing.xs,
      backgroundColor: colors.inputBackground,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.smd,
      paddingVertical: spacing.xs,
      marginBottom: spacing.md,
    },
    demoNoticeText: {
      color: colors.accent,
      fontSize: 12,
      fontWeight: "700",
    },
    searchWrapper: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.inputBackground,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.md,
    },
    searchIcon: {
      marginRight: spacing.sm,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      color: colors.textPrimary,
      fontSize: 16,
      paddingVertical: spacing.smd,
      outlineStyle: "none",
    },
    filterLabel: {
      color: colors.navySoft,
      fontSize: 13,
      fontWeight: "600",
      marginBottom: spacing.xs,
    },
    filterGroup: {
      marginBottom: spacing.xs,
    },
    loading: {
      minHeight: 120,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    list: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    loadMoreButton: {
      marginTop: spacing.md,
    },
    footerLoading: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
    },
    footerError: {
      alignItems: "center",
      paddingVertical: spacing.md,
    },
    footerErrorText: {
      color: colors.textSecondary,
      fontSize: 14,
      textAlign: "center",
    },
    footerButton: {
      minWidth: 140,
      marginTop: spacing.xs,
    },
    offlineBanner: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    offlineMessage: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    offlineText: {
      flex: 1,
      color: colors.navy,
      fontSize: 14,
      lineHeight: 20,
    },
    retryButton: {
      marginTop: spacing.sm,
    },
  });
}
