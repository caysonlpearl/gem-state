import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/pets")({
  beforeLoad: () => {
    throw redirect({
      to: "/browse",
      search: { category: "pets" },
    });
  },
});
