import type { AnchorHTMLAttributes } from "react";
export type StorefrontLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  hash?: string;
};
