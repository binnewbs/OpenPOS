import { requireUser } from "@/server/auth";
import { getActivityLog, getStore, getUsers } from "@/server/queries";
import { plain } from "@/lib/plain";
import { SettingsManager } from "./settings-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const store = getStore(user.storeId);
  const users = getUsers(user.storeId) as {
    id: string;
    name: string;
    username: string;
    is_active: number;
    last_login_at: string | null;
    role_name: string;
    role_slug: string;
  }[];
  const activity = getActivityLog(user.storeId, 20) as {
    id: string;
    action: string;
    entity_type: string;
    reason: string | null;
    created_at: string;
    user_name: string | null;
  }[];

  return (
    <SettingsManager
      store={plain(store)}
      users={plain(users)}
      activity={plain(activity)}
      canManageSettings={user.permissions.includes("settings.manage")}
      canManageUsers={user.permissions.includes("users.manage")}
      canBackup={user.permissions.includes("backup.manage")}
      currentUserId={user.id}
    />
  );
}
