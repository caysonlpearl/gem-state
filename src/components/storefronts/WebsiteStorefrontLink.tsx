import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import type { StorefrontLinkProps } from "./storefront-types";
export function WebsiteStorefrontLink(props: StorefrontLinkProps) {
  return <Link {...(props as ComponentProps<typeof Link>)} />;
}
