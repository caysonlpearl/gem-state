/* eslint-disable @typescript-eslint/no-explicit-any -- persisted search JSON predates typed route filters. */
export type SavedSearchFilters = Record<
  string,
  string | number | boolean | null | undefined | string[]
>;

export type SavedSearch = {
  id: string;
  name: string;
  search: SavedSearchFilters;
  emailAlerts: boolean;
  paused: boolean;
  lastMatchAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function savedSearch(row: Record<string, any>): SavedSearch {
  return {
    id: row.id,
    name: row.name,
    search: (row.search ?? {}) as SavedSearchFilters,
    emailAlerts: row.email_alerts !== false,
    paused: row.paused === true,
    lastMatchAt: row.last_match_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
