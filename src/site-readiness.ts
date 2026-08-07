const policyPaths = ["/about/", "/contact/", "/privacy-policy/", "/terms/", "/editorial-policy/"];

export type SiteCheck = { name: string; ok: boolean; detail: string };

function siteOrigin(value: string): URL {
  if (!value.trim()) throw new Error("site URL is required");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("site URL must be credential-free HTTPS");
  return new URL(url.origin);
}

function disallows(robots: string, path: string): boolean {
  // ponytail: prefix rules cover this site's simple robots.txt; use a standards parser if wildcard rules are added.
  let applies = false;
  let rulesStarted = false;
  let best = { length: -1, blocked: false };
  for (const raw of robots.split(/\r?\n/u)) {
    const match = /^\s*([\w-]+)\s*:\s*([^#]*)/u.exec(raw);
    if (!match) continue;
    const field = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (field === "user-agent") {
      if (rulesStarted) {
        applies = false;
        rulesStarted = false;
      }
      applies ||= value === "*" || value.toLowerCase() === "googlebot";
    } else if (field === "allow" || field === "disallow") {
      rulesStarted = true;
      if (applies && value && path.startsWith(value)
        && (value.length > best.length || (value.length === best.length && field === "allow"))) {
        best = { length: value.length, blocked: field === "disallow" };
      }
    }
  }
  return best.blocked;
}

async function getText(url: URL, request: typeof fetch): Promise<{ ok: boolean; text: string; detail: string }> {
  try {
    const response = await request(url, { signal: AbortSignal.timeout(15_000) });
    return { ok: response.ok, text: await response.text(), detail: `${response.status} ${url}` };
  } catch (error) {
    return { ok: false, text: "", detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function checkSiteReadiness(
  baseUrl: string,
  publisherId: string,
  measurementId: string,
  request: typeof fetch = fetch,
): Promise<SiteCheck[]> {
  const origin = siteOrigin(baseUrl);
  if (!/^pub-\d{16}$/u.test(publisherId)) throw new Error("AdSense publisher ID must look like pub-0000000000000000");
  if (!/^G-[A-Z0-9]+$/u.test(measurementId)) throw new Error("GA4 measurement ID must start with G-");

  const paths = ["/", ...policyPaths, "/wp-sitemap.xml", "/robots.txt", "/ads.txt"];
  const pages = new Map(await Promise.all(paths.map(async (path) => [path, await getText(new URL(path, origin), request)] as const)));
  const home = pages.get("/")!;
  const homeLinks = [...home.text.matchAll(/\bhref\s*=\s*["']([^"']+)["']/giu)]
    .flatMap(([, href]) => { try { return [new URL(href!, origin).pathname]; } catch { return []; } });
  const sitemap = pages.get("/wp-sitemap.xml")!;
  const robots = pages.get("/robots.txt")!;
  const ads = pages.get("/ads.txt")!;
  const expectedAds = `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0`;

  return [
    { name: "homepage", ok: home.ok, detail: home.detail },
    {
      name: "mobile viewport",
      ok: home.ok && /<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/iu.test(home.text),
      detail: "homepage must include a viewport meta tag",
    },
    ...policyPaths.map((path) => ({
      name: `policy ${path}`,
      ok: pages.get(path)!.ok && homeLinks.some((link) => link.replace(/\/?$/u, "/") === path),
      detail: `${pages.get(path)!.detail}; homepage navigation link required`,
    })),
    {
      name: "sitemap",
      ok: sitemap.ok && /<(?:sitemapindex|urlset)\b/iu.test(sitemap.text),
      detail: sitemap.detail,
    },
    {
      name: "robots.txt",
      ok: robots.ok && !disallows(robots.text, "/") && !disallows(robots.text, "/ads.txt")
        && robots.text.includes(new URL("/wp-sitemap.xml", origin).toString()),
      detail: `${robots.detail}; sitemap must be listed and Googlebot must not be blocked`,
    },
    {
      name: "ads.txt",
      ok: ads.ok && ads.text.split(/\r?\n/u).some((line) => line.trim() === expectedAds),
      detail: `${ads.detail}; expected ${expectedAds}`,
    },
    {
      name: "GA4 tag",
      ok: home.ok && home.text.includes(measurementId),
      detail: `homepage must contain ${measurementId}`,
    },
  ];
}

if (import.meta.main) {
  const checks = await checkSiteReadiness(
    process.env.WP_DIGITAL_URL ?? "",
    process.env.ADSENSE_PUBLISHER_ID ?? "",
    process.env.GA_MEASUREMENT_ID ?? "",
  );
  for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`);
  if (checks.some(({ ok }) => !ok)) process.exitCode = 1;
}
