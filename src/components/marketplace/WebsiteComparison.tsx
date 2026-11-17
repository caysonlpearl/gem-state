import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { listingParam } from "@/lib/listing-url";
import { ComparisonProvider } from "./Comparison";
export function WebsiteComparison({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <ComparisonProvider
      owner={user?.id ?? null}
      listingHref={(item) => `/listings/${listingParam(item)}`}
    >
      {children}
    </ComparisonProvider>
  );
}
