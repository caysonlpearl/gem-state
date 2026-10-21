import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getAdminAccess } from "@/lib/admin-access.functions";
import { safeAuthReturnPath } from "@/lib/auth-return-path";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ location }) => {
    let access;
    try {
      access = await getAdminAccess();
    } catch (error) {
      // Only a missing/expired login goes to sign-in. Role denials and service
      // failures must never be mistaken for successful administrator access.
      if (error instanceof Error && error.message.startsWith("Unauthorized:")) {
        throw redirect({
          to: "/auth",
          search: { redirect: safeAuthReturnPath(location.pathname) },
        });
      }
      throw error;
    }
    if (!access.isAdmin) {
      throw redirect({ to: "/account" });
    }
    return access;
  },
  component: () => <Outlet />,
});
