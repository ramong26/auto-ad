import assert from "node:assert/strict";
import test from "node:test";
import { checkSiteReadiness } from "./site-readiness.ts";

const policies = ["/about/", "/contact/", "/privacy-policy/", "/terms/", "/editorial-policy/"];

test("public site readiness checks technical files and trust navigation", async () => {
  const publisherId = "pub-1234567890123456";
  const measurementId = "G-ABC123DEF4";
  const links = policies.map((path) => `<a href="${path}">${path}</a>`).join("");
  const responses = new Map<string, string>([
    ["/", `<meta name="viewport" content="width=device-width"><script>${measurementId}</script>${links}`],
    ...policies.map((path) => [path, "policy"] as const),
    ["/wp-sitemap.xml", "<sitemapindex></sitemapindex>"],
    ["/robots.txt", "User-agent: *\nAllow: /\nSitemap: https://blog.example/wp-sitemap.xml"],
    ["/ads.txt", `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0`],
  ]);
  const request = (async (input: string | URL | Request) => {
    const body = responses.get(new URL(input instanceof Request ? input.url : input).pathname);
    return new Response(body ?? "", { status: body === undefined ? 404 : 200 });
  }) as typeof fetch;

  const ready = await checkSiteReadiness("https://blog.example", publisherId, measurementId, request);
  assert.equal(ready.every(({ ok }) => ok), true);

  responses.set("/robots.txt", "User-agent: Googlebot\nDisallow: /");
  responses.set("/ads.txt", "google.com, pub-0000000000000000, DIRECT");
  const broken = await checkSiteReadiness("https://blog.example", publisherId, measurementId, request);
  assert.equal(broken.find(({ name }) => name === "robots.txt")?.ok, false);
  assert.equal(broken.find(({ name }) => name === "ads.txt")?.ok, false);
});
