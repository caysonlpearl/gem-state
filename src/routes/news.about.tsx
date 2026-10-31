import { createFileRoute } from "@tanstack/react-router";
import { EditorialCta } from "@/components/editorial/EditorialCta";

export const Route = createFileRoute("/news/about")({
  head: () => ({
    meta: [
      { title: "About Bluebird Local — Sources, authors & corrections" },
      {
        name: "description",
        content:
          "How Bluebird Local selects Idaho stories, researches original guides, credits publishers, and handles corrections.",
      },
    ],
  }),
  component: () => (
    <div className="mx-auto max-w-[820px] px-4 py-10 sm:px-6 sm:py-14">
      <a href="/news" className="text-sm font-semibold text-primary">
        ← Bluebird Local
      </a>
      <h1 className="mt-5 text-4xl font-bold tracking-tight">
        Local stories. Useful information. Clear sources.
      </h1>
      <div className="news-prose mt-7">
        <p>
          Bluebird Local is the news and guides section of Bluebird Marketplace, Idaho’s local
          marketplace. We connect useful local information with the people, businesses, and
          classified listings in our communities.
        </p>
        <h2>Our original articles</h2>
        <p>
          Original Bluebird guides and articles are prepared by the Bluebird Marketplace editorial
          team. We research reliable sources, link to the material behind factual claims, and review
          articles before publication. Writing tools may assist with research and drafting; the team
          is responsible for checking the finished article. Publication dates reflect when an
          article first appeared. Updated dates reflect substantive changes.
        </p>
        <h2>Stories from other publishers</h2>
        <p>
          External stories are labeled with their publisher and link to the original website. Where
          we have permission to republish a complete article, we retain its author, source links,
          and required credits. Permission for an article does not automatically cover its
          photographs.
        </p>
        <h2>Our coverage</h2>
        <p>
          We prioritize Idaho community life, local businesses, homes, jobs, cars, outdoors, and
          buying and selling. Selected Utah stories also appear. The newsroom filters are
          independent of the location you choose when searching classified listings.
        </p>
        <h2>Marketplace links</h2>
        <p>
          Our articles link to relevant Bluebird classifieds. Those links are part of Bluebird’s own
          marketplace navigation. A related listing or business does not influence a story’s factual
          conclusions, and featuring a listing does not imply an endorsement.
        </p>
        <h2>Corrections and questions</h2>
        <p>
          Found an error or have a question about content or photograph permissions?{" "}
          <a href="/contact">Contact Bluebird</a> with the article address and the information you
          would like us to review. We correct verified errors and retain source attribution.
        </p>
      </div>
      <div className="mt-9">
        <EditorialCta articleId="news-about" placement="news_about" />
      </div>
    </div>
  ),
});
