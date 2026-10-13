import { createFileRoute, notFound } from "@tanstack/react-router";

import { brand } from "@/config/brand";
import { GuideArticle } from "@/components/guides/GuideArticle";
import { guideBySlug } from "@/content/guides";
import { GUIDE_COVER_IMAGE, guideStructuredData, jsonLdScript } from "@/lib/structured-data";

export const Route = createFileRoute("/guides/$slug")({
  loader: ({ params }) => {
    const guide = guideBySlug(params.slug);
    if (!guide) throw notFound();
    return guide;
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: [
            { title: `${loaderData.title} — ${brand.name}` },
            { name: "description", content: loaderData.description },
            { property: "og:title", content: loaderData.title },
            { property: "og:description", content: loaderData.description },
            { property: "og:type", content: "article" },
            { property: "article:modified_time", content: loaderData.reviewed },
            { property: "og:image", content: `${brand.urls.siteUrl}${GUIDE_COVER_IMAGE}` },
            { name: "twitter:card", content: "summary_large_image" },
          ],
          scripts: [jsonLdScript(guideStructuredData(loaderData))],
        }
      : { meta: [{ name: "robots", content: "noindex" }] },
  component: GuidePage,
});

function GuidePage() {
  const guide = Route.useLoaderData();
  return <GuideArticle guide={guide} />;
}
