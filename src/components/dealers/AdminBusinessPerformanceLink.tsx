import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { getBusinessSellerKey } from "@/lib/business-performance.functions";
import { getAdminAccess } from "@/lib/admin-access.functions";
export function AdminBusinessPerformanceLink({
  dealerSlug,
  businessKey,
  sellerSlug,
}: {
  dealerSlug?: string;
  businessKey?: string;
  sellerSlug?: string;
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
  const resolveSeller = useServerFn(getBusinessSellerKey);
  const registered = useQuery({
    queryKey: ["business-seller-key", user?.id, sellerSlug],
    queryFn: () => resolveSeller({ data: { slug: sellerSlug! } }),
    enabled: Boolean(access.data?.isAdmin && sellerSlug),
    staleTime: 5 * 60000,
    retry: false,
  });
  const resolvedKey = businessKey ?? registered.data?.businessKey;
  if ((!dealerSlug && !resolvedKey) || !access.data?.isAdmin) return null;
  return (
    <Link
      to="/admin/business-performance"
      search={{
        ...(dealerSlug ? { dealer: dealerSlug } : {}),
        ...(resolvedKey ? { business: resolvedKey } : {}),
      }}
      className="mt-4 inline-flex rounded-full border border-border px-4 py-2 text-xs font-semibold text-primary"
    >
      View business performance · Admin
    </Link>
  );
}
