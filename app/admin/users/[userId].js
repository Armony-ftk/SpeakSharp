import { useLocalSearchParams } from "expo-router";
import AdminUserDetailsScreen from "../../../components/screens/AdminUserDetailsScreen";

export default function AdminUserDetailsRoute() {
  const { userId } = useLocalSearchParams();
  const resolvedUserId = Array.isArray(userId) ? userId[0] : userId;

  return <AdminUserDetailsScreen userId={resolvedUserId} />;
}
