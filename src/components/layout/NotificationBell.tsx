import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyNotifications, markNotificationsRead } from "@/lib/notifications.functions";
import { useHydrated } from "@/hooks/useHydrated";
import { NotificationBellView, type NotificationBellLinkProps } from "./NotificationBellView";
function AllLink(props: NotificationBellLinkProps) {
  return (
    <Link
      to="/notifications"
      {...props}
      activeProps={{ className: "" }}
      inactiveProps={{ className: "" }}
    />
  );
}
function OrderLink({ orderId, ...props }: NotificationBellLinkProps & { orderId: string }) {
  return (
    <Link
      to="/orders/$orderId"
      params={{ orderId }}
      {...props}
      activeProps={{ className: "" }}
      inactiveProps={{ className: "" }}
    />
  );
}
export function NotificationBell() {
  const hydrated = useHydrated();
  const client = useQueryClient();
  const fetchNotifications = useServerFn(getMyNotifications),
    markRead = useServerFn(markNotificationsRead);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(),
    enabled: hydrated,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
  const markAll = useMutation({
    mutationFn: (ids: string[] | null) => markRead({ data: { ids } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (
    <NotificationBellView
      data={data}
      isLoading={isLoading}
      hydrated={hydrated}
      pathname={pathname}
      onMarkRead={(ids) => markAll.mutate(ids)}
      pending={markAll.isPending}
      error={
        (markAll.error ?? error) instanceof Error ? (markAll.error ?? error)!.message : undefined
      }
      renderAllLink={AllLink}
      renderOrderLink={OrderLink}
    />
  );
}
