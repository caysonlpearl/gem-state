/* eslint-disable react-refresh/only-export-components -- the hook shares the native search-area provider. */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

const SearchAreaContext = createContext<{
  area: string;
  setArea: (area: string) => void;
} | null>(null);

/** A search preference shared by native navigation; kept in memory only. */
export function SearchAreaProvider({ children }: { children: ReactNode }) {
  const [area, setArea] = useState("Idaho");
  const value = useMemo(() => ({ area, setArea }), [area]);
  return <SearchAreaContext.Provider value={value}>{children}</SearchAreaContext.Provider>;
}

export function useSearchArea() {
  const value = useContext(SearchAreaContext);
  if (!value) throw Error("Search area is unavailable.");
  return value;
}
