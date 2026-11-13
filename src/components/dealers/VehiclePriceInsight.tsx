import { getVehiclePriceInsight } from "@/lib/vehicle-price-insights.functions";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { VehiclePriceInsightView } from "./VehiclePriceInsightView";
export { VehiclePriceInsightCard } from "./VehiclePriceInsightView";
export function VehiclePriceInsight({ listingId }: { listingId: string }) {
  const fetchInsight = useServerFn(getVehiclePriceInsight);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const query = useQuery({
    queryKey: ["vehicle-price-insight", listingId],
    queryFn: () => fetchInsight({ data: { listingId } }),
    enabled: mounted,
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return <VehiclePriceInsightView value={query.data} />;
}
