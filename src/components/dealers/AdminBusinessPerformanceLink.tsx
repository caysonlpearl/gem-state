import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { getAdminAccess } from "@/lib/admin-access.functions";
export function AdminBusinessPerformanceLink({
  dealerSlug,
  businessKey,
}: {
  dealerSlug?: string;
  businessKey?: string;
}) {
  const { user } = useAuth();
  const get = useServerFn(getAdminAccess);
  const access = useQuery({
    queryKey: ["business-performance-admin-access", user?.id],
    queryFn: () => get(),
    enabled: Boolean(user?.id),
    staleTime: 60000,
    retry: false,
  });
  if ((!dealerSlug && !businessKey) || !access.data?.isAdmin) return null;
  return (
    <Link
      to="/admin/business-performance"
      search={{
        ...(dealerSlug ? { dealer: dealerSlug } : {}),
        ...(businessKey ? { business: businessKey } : {}),
      }}
      className="mt-4 inline-flex rounded-full border border-border px-4 py-2 text-xs font-semibold text-primary"
    >
      View business performance · Admin
    </Link>
  );
}
