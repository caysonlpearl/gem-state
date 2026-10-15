"""Read-only public crawl reconciliation. No login, cookies or database credentials.

Usage: python3 scripts/seo-live-check.py /absolute/path/report.json
"""
import concurrent.futures
import datetime
import html.parser
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ORIGIN = "https://onbluebird.com"


class Page(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta, self.canonicals, self.links = {}, [], []
        self.title, self.heading = "", ""
        self.in_title, self.in_heading = False, False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            key = attrs.get("name", attrs.get("property", ""))
            self.meta.setdefault(key, []).append(attrs.get("content", ""))
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonicals.append(attrs.get("href"))
        if tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])
        self.in_title = tag == "title" or self.in_title
        self.in_heading = tag == "h1" or self.in_heading

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "h1":
            self.in_heading = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.in_heading:
            self.heading += data


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def safe_url(url):
    # Photo redirects may contain short-lived signed storage capabilities.
    parts = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    return urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode([
        (key, "[redacted]" if key.lower() in {"token", "access_token", "signature"} else value)
        for key, value in query
    ])))


def fetch(url, follow=True):
    start = time.monotonic()
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    try:
        response = opener.open(urllib.request.Request(url, headers={"User-Agent": "BluebirdSEOCheck/1.0 (+https://onbluebird.com)"}), timeout=40)
    except urllib.error.HTTPError as error:
        response = error
    except Exception as error:
        return {"url": url, "error": str(error)}
    with response:
        body = response.read().decode("utf-8", errors="replace")
        result = {"url": url, "status": response.code, "destination": safe_url(response.url), "location": response.headers.get("location"), "robots_header": response.headers.get("x-robots-tag"), "milliseconds": round((time.monotonic() - start) * 1000), "body": body}
    return result


def inspect(url):
    result = fetch(url)
    page = Page()
    page.feed(result.pop("body", ""))
    result.update(title=page.title, h1=page.heading, canonicals=page.canonicals, robots=page.meta.get("robots", []), description=page.meta.get("description", []), og_title=page.meta.get("og:title", []), og_image=page.meta.get("og:image", []), twitter_image=page.meta.get("twitter:image", []), listing_links=list(dict.fromkeys(link for link in page.links if link.startswith("/listings/"))), pagination_links=list(dict.fromkeys(link for link in page.links if "page=" in link)))
    return result


def main():
    sitemap = fetch(ORIGIN + "/sitemap.xml")
    xml = sitemap.pop("body", "")
    urls = [node.text for node in ET.fromstring(xml).iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        pages = list(pool.map(inspect, urls))
    errors = []
    for page in pages:
        reasons = []
        if page.get("status") != 200:
            reasons.append("not-200")
        if page.get("destination") != page["url"]:
            reasons.append("redirect")
        if page.get("canonicals") != [page["url"]]:
            reasons.append("non-self-or-multiple-canonical")
        if "noindex" in " ".join(page.get("robots", []) + [page.get("robots_header") or ""]):
            reasons.append("noindex")
        if urllib.parse.urlparse(page["url"]).netloc != "onbluebird.com":
            reasons.append("cross-domain")
        if reasons:
            errors.append({"url": page["url"], "reasons": reasons})
    checks = ["/browse?allCategories=true&page=2", "/browse?allCategories=true&page=99999", "/browse?category=jewelry-watches&priceMin=0&priceMax=50", "/claim-seller", "/auth", "/account", "/not-a-real-bluebird-page"]
    extras = [inspect(ORIGIN + path) for path in checks]
    aliases = [fetch(url, follow=False) for url in ["http://onbluebird.com/browse?page=2", "https://www.onbluebird.com/browse?page=2", "https://gemstateclassifieds.lovable.app/browse?page=2", "https://onbluebird.com/idaho/eagle/"]]
    for row in aliases:
        row.pop("body", None)
    images = sorted(set(image for row in pages for image in row["og_image"] + row["twitter_image"]))
    image_results = []
    for image in images:
        row = fetch(image)
        row.pop("body", None)
        image_results.append(row)
    output = {"captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "method": "Anonymous HTTP HTML crawl, not a verified search crawler or browser test", "sitemap": sitemap, "sitemap_urls": len(urls), "reconciliation_errors": errors, "pages": pages, "extra_cases": extras, "host_matrix": aliases, "share_images": image_results}
    with open(sys.argv[1], "w") as destination:
        json.dump(output, destination, indent=2)
    print(json.dumps({"sitemap_urls": len(urls), "reconciliation_errors": errors, "extra_cases": [{"url": row["url"], "status": row.get("status"), "canonical": row.get("canonicals"), "robots": row.get("robots")} for row in extras], "host_matrix": aliases, "image_statuses": [row.get("status") for row in image_results]}, indent=2))


if __name__ == "__main__":
    main()
