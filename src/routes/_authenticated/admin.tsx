import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getAdminAccess } from "@/lib/admin-access.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const access = await getAdminAccess();
    if (!access.isAdmin) {
      throw redirect({ to: "/account" });
    }
    return access;
  },
  component: () => <Outlet />,
});
