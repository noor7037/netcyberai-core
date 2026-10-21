#!/usr/bin/env python3
"""SEO / AEO audit for the NetCyberAI public site.

Governed by docs/06_VISIBILITY_PROTOCOL.md Sec2/Sec5; checks below map
directly to that section's requirements. Fetches every page the site
actually built from a running server and checks metadata, OG images,
locale tags, JSON-LD validity and schema coverage, banned schema types,
Organization.sameAs, an answer-block length proxy, llms.txt link
resolution, and robots.txt crawler policy.

Stdlib only. No `requests`/`beautifulsoup4` dependency: neither is a
declared dependency of this project (no requirements.txt exists), so
relying on either being present on a given machine or CI runner would
be an unstated new dependency, not a "deps only if already present."

Usage:
    python3 scripts/seo_audit.py [base_url]
    base_url defaults to http://localhost:3000

Exit 0 on a clean run. Non-zero if any check fails, the server is
unreachable, or zero pages were checked (a zero-page run is a failure,
never a silent pass -- see the "0 problems from 0 pages" failure mode
this project has already hit once, on a tap-target check).
"""

from __future__ import annotations

import json
import re
import struct
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

REPO_ROOT = Path(__file__).resolve().parent.parent
PRERENDER_MANIFEST = REPO_ROOT / ".next" / "prerender-manifest.json"
BLOG_CONTENT_DIR = REPO_ROOT / "src" / "content" / "blog"

USER_AGENT = "NetCyberAI-SEO-Audit/1.0 (+internal CI check)"
FETCH_TIMEOUT = 15

# Non-page routes that legitimately exist in the build but must NOT be
# in sitemap.xml (infrastructure routes, not content pages).
NON_PAGE_ROUTE_SUFFIXES = ("/opengraph-image",)
# The school app's install manifest and its icons (C143) are files, not pages.
NON_PAGE_ROUTES = {"/robots.txt", "/sitemap.xml", "/llms.txt", "/icon.svg", "/manifest.webmanifest", "/icons/192", "/icons/512", "/icons/maskable"}

# Authenticated-only internal shells (src/app/sitemap.ts's own INTERNAL_ROOTS
# exclusion: the /control admin panel, the /app tenant app, the /family
# parent app (C230-D), and /login) are
# intentionally absent from the public sitemap -- so they must not be
# flagged by the sitemap<->build cross-check below as "uncrawlable". Public
# marketing metadata requirements (meta description, hreflang, breadcrumbs,
# an answer-block paragraph) don't apply to an auth-gated app shell either.
INTERNAL_ROUTE_PREFIXES = ("/control", "/app", "/family")
INTERNAL_ROUTES = {"/login"}


def is_internal_route(route: str) -> bool:
    return route in INTERNAL_ROUTES or any(route.startswith(p) for p in INTERNAL_ROUTE_PREFIXES)

# docs/06_VISIBILITY_PROTOCOL.md Sec4 crawler policy table.
REQUIRED_CRAWLERS_UNRESTRICTED = ["Googlebot", "Bingbot"]
REQUIRED_CRAWLERS_DEMO_DISALLOWED = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "PerplexityBot",
    "Google-Extended",
    "CCBot",
]

FAQ_FIXED_ROUTES = {"/", "/pricing", "/security/data-ownership"}
BANNED_SCHEMA_STRINGS = ["aggregateRating", "reviewCount", "ratingValue", '"Review"']


# ---------------------------------------------------------------------
# Problems
# ---------------------------------------------------------------------


@dataclass
class Problem:
    page: str
    check: str
    expected: str
    found: str
    compliance: bool = False  # banned-schema-type failures are flagged distinctly

    def __str__(self) -> str:
        tag = "[COMPLIANCE]" if self.compliance else "[FAIL]"
        return f"{tag} {self.page} :: {self.check}\n    expected: {self.expected}\n    found:    {self.found}"


# ---------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------


class FetchResult:
    def __init__(self, status: int, body: bytes, headers: dict):
        self.status = status
        self.body = body
        self.headers = headers

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")


def fetch(url: str) -> FetchResult | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
            # HTTP header names are case-insensitive; a plain dict() from
            # an HTTPMessage is not, and loses that -- normalise to
            # lowercase keys so .get() lookups are reliable regardless of
            # the casing the server actually sent.
            return FetchResult(resp.status, resp.read(), {k.lower(): v for k, v in resp.headers.items()})
    except urllib.error.HTTPError as e:
        headers = e.headers or {}
        return FetchResult(e.code, e.read() if e.fp else b"", {k.lower(): v for k, v in headers.items()})
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        print(f"FATAL: could not reach {url}: {e}", file=sys.stderr)
        return None


def server_reachable(base_url: str) -> bool:
    result = fetch(base_url)
    return result is not None and result.status < 500


# ---------------------------------------------------------------------
# PNG dimension decoding (no PIL) -- IHDR chunk is bytes 16:20 / 20:24
# ---------------------------------------------------------------------


def png_dimensions(data: bytes) -> tuple[int, int] | None:
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    if data[12:16] != b"IHDR":
        return None
    width, height = struct.unpack(">II", data[16:24])
    return width, height


# ---------------------------------------------------------------------
# HTML parsing
# ---------------------------------------------------------------------


class PageParser(HTMLParser):
    """Collects title, meta/link tags, JSON-LD blocks, html lang, and
    the first non-chrome <p> text (answer-block proxy)."""

    MIN_CANDIDATE_WORDS = 8  # below this, treat a <p> as a caption/label, not prose

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.metas: list[dict] = []
        self.links: list[dict] = []
        self.ld_json_blocks: list[str] = []
        self.html_lang = None
        self.first_p_text = None

        self._in_title = False
        self._in_ldjson = False
        self._ldjson_buffer: list[str] = []
        self._in_p = False
        self._p_buffer: list[str] = []
        self._p_done = False
        self._skip_stack: list[str] = []

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        if tag == "html":
            self.html_lang = attrs_d.get("lang")
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            self.metas.append(attrs_d)
        elif tag == "link":
            self.links.append(attrs_d)
        elif tag == "script" and attrs_d.get("type") == "application/ld+json":
            self._in_ldjson = True
            self._ldjson_buffer = []
        elif tag in ("header", "nav", "footer"):
            self._skip_stack.append(tag)
        elif tag == "p" and not self._p_done and not self._skip_stack:
            self._in_p = True
            self._p_buffer = []

    # Next.js emits some tags (meta, link) with a trailing slash; the
    # stdlib parser routes those through handle_startendtag by default,
    # which already calls handle_starttag, so no override needed.

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_ldjson:
            self._in_ldjson = False
            self.ld_json_blocks.append("".join(self._ldjson_buffer))
        elif tag in ("header", "nav", "footer") and self._skip_stack and self._skip_stack[-1] == tag:
            self._skip_stack.pop()
        elif tag == "p" and self._in_p:
            self._in_p = False
            text = "".join(self._p_buffer).strip()
            # Short captions (a publish date, a badge label) are not the
            # answer-first paragraph and would otherwise be mistaken for
            # it as literally the first <p> in the body -- observed on
            # every blog post, which opens with a one-line date caption
            # before the real answer paragraph. Skip anything under the
            # threshold and keep looking, rather than locking onto it.
            if text and not self._p_done and len(text.split()) >= self.MIN_CANDIDATE_WORDS:
                self.first_p_text = text
                self._p_done = True

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_ldjson:
            self._ldjson_buffer.append(data)
        if self._in_p:
            self._p_buffer.append(data)


def meta_content(metas: list[dict], **key_value) -> list[str]:
    (key, value), = key_value.items()
    return [m.get("content", "") for m in metas if m.get(key) == value]


def links_by_rel(links: list[dict], rel: str) -> list[dict]:
    return [l for l in links if l.get("rel") == rel]


# ---------------------------------------------------------------------
# Route discovery
# ---------------------------------------------------------------------


def get_sitemap_routes(base_url: str) -> list[str] | None:
    result = fetch(urljoin(base_url, "/sitemap.xml"))
    if result is None or result.status != 200:
        return None
    try:
        root = ET.fromstring(result.text)
    except ET.ParseError:
        return None
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    routes = []
    for loc in root.findall(".//sm:loc", ns):
        path = urlparse(loc.text).path
        routes.append(path if path else "/")
    return sorted(set(routes))


def get_built_routes() -> list[str] | None:
    """Ground truth for 'routes Next.js actually built', independent of
    sitemap.ts (which derives its own list by walking src/app -- using
    that same walk here would just re-check sitemap.ts against itself)."""
    if not PRERENDER_MANIFEST.exists():
        return None
    with open(PRERENDER_MANIFEST) as f:
        manifest = json.load(f)
    routes = []
    for route in manifest.get("routes", {}):
        if route in NON_PAGE_ROUTES:
            continue
        if any(route.endswith(suf) for suf in NON_PAGE_ROUTE_SUFFIXES):
            continue
        if is_internal_route(route):
            continue
        routes.append(route)
    return sorted(set(routes))


# ---------------------------------------------------------------------
# robots.txt
# ---------------------------------------------------------------------


def parse_robots(text: str) -> dict[str, dict]:
    blocks: dict[str, dict] = {}
    current = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key, value = key.strip(), value.strip()
        if key.lower() == "user-agent":
            current = value
            blocks.setdefault(current, {"allow": [], "disallow": []})
        elif key.lower() == "allow" and current is not None:
            blocks[current]["allow"].append(value)
        elif key.lower() == "disallow" and current is not None:
            blocks[current]["disallow"].append(value)
    return blocks


def check_robots(base_url: str) -> list[Problem]:
    problems: list[Problem] = []
    result = fetch(urljoin(base_url, "/robots.txt"))
    if result is None or result.status != 200:
        problems.append(Problem("/robots.txt", "reachable", "HTTP 200", f"HTTP {result.status if result else 'unreachable'}"))
        return problems

    text = result.text
    if "Sitemap:" not in text:
        problems.append(Problem("/robots.txt", "sitemap directive", "a Sitemap: line", "none found"))

    blocks = parse_robots(text)

    for agent in REQUIRED_CRAWLERS_UNRESTRICTED:
        block = blocks.get(agent)
        if block is None:
            problems.append(Problem("/robots.txt", f"{agent} block", "present, Allow: /", "missing entirely"))
            continue
        if "/" not in block["allow"]:
            problems.append(Problem("/robots.txt", f"{agent} allow", "Allow: /", str(block["allow"])))
        if block["disallow"]:
            problems.append(Problem("/robots.txt", f"{agent} unrestricted", "no Disallow lines", str(block["disallow"])))

    for agent in REQUIRED_CRAWLERS_DEMO_DISALLOWED:
        block = blocks.get(agent)
        if block is None:
            problems.append(Problem("/robots.txt", f"{agent} block", "present, Allow: / + Disallow: /demo", "missing entirely"))
            continue
        if "/" not in block["allow"]:
            problems.append(Problem("/robots.txt", f"{agent} allow", "Allow: /", str(block["allow"])))
        if "/demo" not in block["disallow"]:
            problems.append(Problem("/robots.txt", f"{agent} disallow", "Disallow: /demo", str(block["disallow"])))

    return problems


# ---------------------------------------------------------------------
# llms.txt
# ---------------------------------------------------------------------


def check_llms_txt(base_url: str) -> list[Problem]:
    problems: list[Problem] = []
    result = fetch(urljoin(base_url, "/llms.txt"))
    if result is None or result.status != 200:
        problems.append(Problem("/llms.txt", "reachable", "HTTP 200", f"HTTP {result.status if result else 'unreachable'}"))
        return problems

    urls = re.findall(r"https?://[^\s)\"\]]+", result.text)
    if not urls:
        problems.append(Problem("/llms.txt", "link count", "at least one link", "0 links found"))
        return problems

    checked = 0
    for url in urls:
        path = urlparse(url).path or "/"
        target = urljoin(base_url, path)
        r = fetch(target)
        checked += 1
        if r is None or r.status != 200:
            problems.append(Problem("/llms.txt", f"link resolves ({url})", "HTTP 200", f"HTTP {r.status if r else 'unreachable'}"))

    print(f"  llms.txt: {checked} links checked")
    return problems


# ---------------------------------------------------------------------
# Per-page checks
# ---------------------------------------------------------------------


def route_schema_requirements(route: str) -> dict[str, bool]:
    is_home = route == "/"
    is_feature = route.startswith("/features/")
    is_blog_post = route.startswith("/blog/")  # excludes bare "/blog" index
    return {
        "Organization": True,  # every page
        "WebSite": True,  # every page (sitewide via layout)
        "BreadcrumbList": not is_home,  # every non-home page
        "FAQPage": route in FAQ_FIXED_ROUTES or is_feature or is_blog_post,
        "Article": is_blog_post,
        "SoftwareApplication": route in ("/", "/pricing"),
    }


def blog_slug_declares_howto(route: str) -> bool | None:
    """Cross-check HowTo presence against source intent, not just output
    shape -- the requirement is 'only where the page has actual steps',
    which is a content decision, not something derivable from HTML
    alone. Returns None if the route isn't a blog post or the source
    file can't be found (caller should skip the check, not fail it)."""
    if not route.startswith("/blog/"):
        return None
    slug = route.rsplit("/", 1)[-1]
    candidate = BLOG_CONTENT_DIR / f"{slug}.ts"
    if not candidate.exists():
        return None
    text = candidate.read_text(encoding="utf-8")
    return "howTo:" in text


def find_banned_schema_strings(html: str) -> list[str]:
    """Which of BANNED_SCHEMA_STRINGS actually appear in this page's HTML.

    Extracted as its own function (see self_test()) because of a real bug
    this shape once had: BANNED_SCHEMA_STRINGS's '"Review"' entry
    deliberately embeds its own quote characters, unlike the other three
    (aggregateRating/reviewCount/ratingValue, which are camelCase JSON
    property names that can't occur in ordinary prose and don't need
    quoting to be unambiguous) -- the quotes are what make it match only a
    real serialized JSON-LD `"@type":"Review"` string, not the plain
    English word "review" turning up in unrelated UI copy ("Review and
    continue"). An earlier version searched `banned.strip('"')`, which
    defeats that on-purpose quoting for every entry. Caught live: it
    flagged LeadForm.tsx's "Review and continue" button label on
    /get-started and /book-demo as a fabricated-review-schema compliance
    violation, which it plainly isn't -- fixed by searching `banned`
    itself, unstripped.
    """
    return [banned for banned in BANNED_SCHEMA_STRINGS if banned in html]


def check_page(base_url: str, route: str) -> list[Problem]:
    url = urljoin(base_url, route)
    result = fetch(url)
    if result is None:
        return [Problem(route, "reachable", "HTTP 200", "unreachable (see stderr)")]
    if result.status != 200:
        return [Problem(route, "reachable", "HTTP 200", f"HTTP {result.status}")]
    return analyze_page(base_url, route, result.text)


def analyze_page(base_url: str, route: str, html: str) -> list[Problem]:
    """Pure(ish) analysis of one page's already-fetched HTML -- separated
    from check_page's fetch so it can be exercised directly against
    synthetic/mutated HTML (see the negative-test harness), not only
    against a live server."""
    problems: list[Problem] = []
    p = PageParser()
    p.feed(html)

    # 1. Metadata -----------------------------------------------------
    title_count = len(re.findall(r"<title[^>]*>", html, re.I))
    if title_count != 1:
        problems.append(Problem(route, "title count", "exactly 1", str(title_count)))
    elif len(p.title) > 60:
        problems.append(Problem(route, "title length", "<=60 chars", f"{len(p.title)} chars: {p.title!r}"))

    desc_contents = meta_content(p.metas, name="description")
    if len(desc_contents) != 1:
        problems.append(Problem(route, "meta description count", "exactly 1", str(len(desc_contents))))
    else:
        dl = len(desc_contents[0])
        if not (150 <= dl <= 160):
            problems.append(Problem(route, "meta description length", "150-160 chars", f"{dl} chars: {desc_contents[0]!r}"))

    canonical_links = links_by_rel(p.links, "canonical")
    if len(canonical_links) != 1:
        problems.append(Problem(route, "canonical count", "exactly 1", str(len(canonical_links))))
    canonical_href = canonical_links[0].get("href") if len(canonical_links) == 1 else None

    og_image_contents = meta_content(p.metas, property="og:image")
    if len(og_image_contents) != 1:
        problems.append(Problem(route, "og:image count", "exactly 1", str(len(og_image_contents))))

    # 2. OG image resolves, absolute, alt text, 1200x630 --------------
    if len(og_image_contents) == 1:
        og_url = og_image_contents[0]
        if not og_url.startswith("http://") and not og_url.startswith("https://"):
            problems.append(Problem(route, "og:image absolute URL", "absolute URL", og_url))
        else:
            og_path = urlparse(og_url).path
            img_result = fetch(urljoin(base_url, og_path))
            if img_result is None or img_result.status != 200:
                problems.append(Problem(route, "og:image resolves", "HTTP 200", f"HTTP {img_result.status if img_result else 'unreachable'}"))
            else:
                ctype = img_result.headers.get("content-type", "")
                if not ctype.startswith("image/"):
                    problems.append(Problem(route, "og:image content-type", "image/*", ctype))
                dims = png_dimensions(img_result.body)
                if dims is None:
                    problems.append(Problem(route, "og:image dimensions (decoded)", "1200x630 PNG", "could not decode as PNG"))
                elif dims != (1200, 630):
                    problems.append(Problem(route, "og:image dimensions (decoded)", "1200x630", f"{dims[0]}x{dims[1]}"))

        alt_contents = meta_content(p.metas, property="og:image:alt")
        if not alt_contents or not alt_contents[0].strip():
            problems.append(Problem(route, "og:image alt text", "non-empty og:image:alt", str(alt_contents)))

        w = meta_content(p.metas, property="og:image:width")
        h = meta_content(p.metas, property="og:image:height")
        if w != ["1200"] or h != ["630"]:
            problems.append(Problem(route, "og:image declared dimensions", "width=1200 height=630", f"width={w} height={h}"))

    # 3. Locale ---------------------------------------------------------
    locale_contents = meta_content(p.metas, property="og:locale")
    if locale_contents != ["en_IN"]:
        problems.append(Problem(route, "og:locale", "en_IN", str(locale_contents)))

    hreflang_links = [l for l in p.links if l.get("rel") == "alternate" and l.get("hreflang")]
    if not hreflang_links:
        problems.append(Problem(route, "hreflang", "an alternate/hreflang link present", "none found"))
    elif canonical_href and hreflang_links[0].get("href") != canonical_href:
        problems.append(Problem(route, "hreflang matches canonical", canonical_href, hreflang_links[0].get("href")))

    # 4. JSON-LD parses ---------------------------------------------------
    parsed_blocks = []
    for i, raw in enumerate(p.ld_json_blocks):
        try:
            parsed_blocks.append(json.loads(raw))
        except json.JSONDecodeError as e:
            problems.append(Problem(route, f"JSON-LD block #{i} valid JSON", "parses", f"JSONDecodeError: {e}"))

    types_present = set()
    for block in parsed_blocks:
        t = block.get("@type")
        if isinstance(t, str):
            types_present.add(t)
        elif isinstance(t, list):
            types_present.update(t)

    # 5. Schema presence by route type -----------------------------------
    reqs = route_schema_requirements(route)
    for schema_type, required in reqs.items():
        if required and schema_type not in types_present:
            problems.append(Problem(route, f"{schema_type} JSON-LD present", "present", "missing"))

    if reqs["FAQPage"]:
        faq_blocks = [b for b in parsed_blocks if b.get("@type") == "FAQPage"]
        if faq_blocks:
            n = len(faq_blocks[0].get("mainEntity", []))
            if not (4 <= n <= 6):
                problems.append(Problem(route, "FAQPage question count", "4-6", str(n)))

    if reqs["SoftwareApplication"]:
        sa_blocks = [b for b in parsed_blocks if b.get("@type") == "SoftwareApplication"]
        if sa_blocks and not sa_blocks[0].get("offers"):
            problems.append(Problem(route, "Offer nested in SoftwareApplication", "present", "missing/empty offers"))

    # HowTo: cross-check against source content's declared intent, not
    # just "does it exist" -- the rule is 'only where genuine steps
    # exist', which the HTML alone can't confirm either way.
    declares_howto = blog_slug_declares_howto(route)
    has_howto = "HowTo" in types_present
    if declares_howto is True and not has_howto:
        problems.append(Problem(route, "HowTo present (source declares howTo)", "HowTo JSON-LD present", "missing"))
    elif declares_howto is False and has_howto:
        problems.append(Problem(route, "HowTo absent (source has no howTo)", "no HowTo JSON-LD", "HowTo present anyway"))
    if has_howto:
        howto_blocks = [b for b in parsed_blocks if b.get("@type") == "HowTo"]
        steps = howto_blocks[0].get("step", []) if howto_blocks else []
        if not steps:
            problems.append(Problem(route, "HowTo has steps", "at least 1 HowToStep", "0 steps"))

    # 6. Banned schema types (compliance, flagged distinctly) -----------
    for banned in find_banned_schema_strings(html):
        problems.append(Problem(route, "banned schema string absent", "not present anywhere", banned, compliance=True))

    # 7. Organization.sameAs empty, not populated ------------------------
    org_blocks = [b for b in parsed_blocks if b.get("@type") == "Organization"]
    for org in org_blocks:
        if "sameAs" in org and org["sameAs"]:
            problems.append(Problem(route, "Organization.sameAs empty", "[] or absent", str(org["sameAs"])))

    # 8. Answer-block length (PROXY -- see report) -----------------------
    if p.first_p_text:
        word_count = len(p.first_p_text.split())
        if not (40 <= word_count <= 60):
            problems.append(
                Problem(
                    route,
                    "answer-block word count (proxy: first <p>, NOT a self-containment check)",
                    "40-60 words",
                    f"{word_count} words",
                )
            )
    else:
        problems.append(Problem(route, "answer-block present", "a first <p> found outside header/nav/footer", "none found"))

    return problems


# ---------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
    if not base_url.startswith("http"):
        base_url = "http://" + base_url

    print(f"SEO audit against {base_url}")
    print(f"(docs/06_VISIBILITY_PROTOCOL.md Sec2/Sec5 -- see script docstring for what is and isn't checked)\n")

    if not server_reachable(base_url):
        print(f"FATAL: server at {base_url} is not reachable. Nothing was checked.", file=sys.stderr)
        return 2

    all_problems: list[Problem] = []
    gaps: list[str] = []

    # --- route cross-check -------------------------------------------
    sitemap_routes = get_sitemap_routes(base_url)
    built_routes = get_built_routes()

    if sitemap_routes is None:
        all_problems.append(Problem("/sitemap.xml", "reachable and parses", "valid XML", "unreachable or unparsable"))
        print("FATAL: could not get route list from sitemap.xml; aborting.", file=sys.stderr)
        return 2

    if built_routes is None:
        gaps.append(
            "Route cross-check against the Next.js build manifest was skipped: "
            f".next/prerender-manifest.json not found at {PRERENDER_MANIFEST}. "
            "Run `npm run build` before this script to enable it. Falling back to "
            "auditing sitemap.xml's routes only, with no independent check that the "
            "sitemap doesn't list a route Next.js never built, or omit one it did."
        )
    else:
        only_in_sitemap = sorted(set(sitemap_routes) - set(built_routes))
        only_in_build = sorted(set(built_routes) - set(sitemap_routes))
        for r in only_in_sitemap:
            all_problems.append(Problem(r, "route cross-check", "route exists in the Next.js build", "in sitemap.xml but NOT in the build manifest (404 risk)"))
        for r in only_in_build:
            all_problems.append(Problem(r, "route cross-check", "route listed in sitemap.xml", "built by Next.js but NOT in sitemap.xml (uncrawlable)"))
        print(f"Route cross-check: {len(sitemap_routes)} in sitemap, {len(built_routes)} in build manifest, "
              f"{len(only_in_sitemap)} only-in-sitemap, {len(only_in_build)} only-in-build\n")

    # --- robots.txt / llms.txt -----------------------------------------
    all_problems.extend(check_robots(base_url))
    all_problems.extend(check_llms_txt(base_url))

    # --- per-page checks -------------------------------------------------
    pages_checked = 0
    for route in sitemap_routes:
        page_problems = check_page(base_url, route)
        all_problems.extend(page_problems)
        pages_checked += 1
        status = "OK" if not page_problems else f"{len(page_problems)} problem(s)"
        print(f"  {route:60s} {status}")

    # --- summary -----------------------------------------------------
    print()
    print(f"Pages checked: {pages_checked}")
    print(f"Problems found: {len(all_problems)}")
    compliance_problems = [p for p in all_problems if p.compliance]
    if compliance_problems:
        print(f"  of which COMPLIANCE failures (banned schema types): {len(compliance_problems)}")

    if pages_checked == 0:
        print("FATAL: 0 pages were checked. This is a failure, not a clean run.", file=sys.stderr)
        return 2

    if all_problems:
        print("\n--- Problems ---")
        for prob in all_problems:
            print(str(prob))
            print()

    if gaps:
        print("--- [GAP] ---")
        for g in gaps:
            print(f"[GAP] {g}")

    print(
        "\nNote: the answer-block check is a word-count proxy only. It does "
        "not verify a paragraph reads correctly in isolation with no "
        "surrounding context -- that requires a human read, per "
        "docs/06_VISIBILITY_PROTOCOL.md Sec5.3."
    )

    if all_problems:
        print(f"\nRESULT: FAILED -- {len(all_problems)} problem(s) across {pages_checked} page(s).")
        return 1

    print(f"\nRESULT: CLEAN -- {pages_checked} pages checked, 0 problems.")
    return 0


def self_test() -> int:
    # The bug shape itself: ordinary UI prose containing the bare word
    # "Review" must NOT be treated as a fabricated review-schema violation.
    prose_html = "<button>Review and continue</button>"
    found = find_banned_schema_strings(prose_html)
    if found:
        print(f"SELF-TEST FAILED: prose containing the word 'Review' was wrongly flagged as banned schema: {found}")
        return 1

    # A real JSON-LD block declaring @type: Review must still be caught.
    schema_html = '<script type="application/ld+json">{"@type": "Review", "reviewBody": "great"}</script>'
    found = find_banned_schema_strings(schema_html)
    if '"Review"' not in found:
        print("SELF-TEST FAILED: a real JSON-LD \"@type\": \"Review\" block was NOT caught")
        return 1

    # The other three banned strings are unaffected by this fix -- still
    # camelCase JSON property names, still caught wherever they appear.
    rating_html = '<script type="application/ld+json">{"aggregateRating": {"ratingValue": "4.8", "reviewCount": "12"}}</script>'
    found = find_banned_schema_strings(rating_html)
    missing = {"aggregateRating", "reviewCount", "ratingValue"} - set(found)
    if missing:
        print(f"SELF-TEST FAILED: fabricated rating schema strings were not all caught, missing: {missing}")
        return 1

    print("SELF-TEST PASSED: prose containing 'Review' is not flagged; real Review/rating JSON-LD schema still is.")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        sys.exit(self_test())
    sys.exit(main())
