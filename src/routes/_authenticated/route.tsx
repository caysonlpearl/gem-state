import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      const sellerRedirects = [
        "/selling",
        "/seller-setup",
        "/create-listing",
        "/create-missing-listing",
      ] as const;
      const destination = sellerRedirects.includes(
        location.pathname as (typeof sellerRedirects)[number],
      )
        ? (location.pathname as (typeof sellerRedirects)[number])
        : undefined;
      throw redirect({ to: "/auth", search: { redirect: destination } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
