import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildExcludedSelectors,
  extractUrlsFromText,
  normalizeCaptureUrl,
  parseCliArguments,
  readUrlsFromFile,
  resolvePageKey,
  resolveSeedUrls,
  splitCommaList,
  uniqueOrdered,
} from "../capture-website-screenshots.mjs";

test("parseCliArguments parses core options", () => {
  const options = parseCliArguments([
    "https://example.com",
    "--url-file",
    "./targets.md",
    "--crawl",
    "--crawl-depth",
    "2",
    "--max-pages",
    "50",
    "--exclude-class",
    "cookie-banner,chat-widget",
    "--exclude-id",
    "welcome-modal",
    "--scale",
    "3",
    "--timeout-ms",
    "75000",
  ]);

  assert.deepEqual(options.positionalUrls, ["https://example.com"]);
  assert.deepEqual(options.urlFiles, ["./targets.md"]);
  assert.equal(options.crawl, true);
  assert.equal(options.crawlDepth, 2);
  assert.equal(options.maxPages, 50);
  assert.deepEqual(options.excludeClasses, ["cookie-banner", "chat-widget"]);
  assert.deepEqual(options.excludeIds, ["welcome-modal"]);
  assert.equal(options.scale, 3);
  assert.equal(options.timeoutMs, 75_000);
});

test("parseCliArguments accepts same-origin-only assignment", () => {
  const options = parseCliArguments(["https://example.com", "--same-origin-only=false"]);
  assert.equal(options.sameOriginOnly, false);
});

test("parseCliArguments accepts loop aliases", () => {
  const options = parseCliArguments([
    "https://example.com",
    "--loop",
    "--loop-depth",
    "2",
    "--max-pages",
    "40",
  ]);
  assert.equal(options.crawl, true);
  assert.equal(options.crawlDepth, 2);
  assert.equal(options.maxPages, 40);
});

test("parseCliArguments accepts same-origin-only value as next argument", () => {
  const options = parseCliArguments(["https://example.com", "--same-origin-only", "false"]);
  assert.equal(options.sameOriginOnly, false);
});

test("parseCliArguments rejects removed segment mode", () => {
  assert.throws(() => parseCliArguments(["--mode=segments"]), {
    message: /Only full-page mode is supported/u,
  });
});

test("splitCommaList and uniqueOrdered normalize values", () => {
  assert.deepEqual(splitCommaList(" a,b, c ,,d "), ["a", "b", "c", "d"]);
  assert.deepEqual(uniqueOrdered(["a", "b", "a", "c", "b"]), ["a", "b", "c"]);
});

test("normalizeCaptureUrl supports missing protocol and strips hash", () => {
  assert.equal(
    normalizeCaptureUrl("membershealth.ca/programs#intro"),
    "https://membershealth.ca/programs",
  );
});

test("extractUrlsFromText parses markdown/plain list and deduplicates", () => {
  const content = `
https://example.com/about
[Home](https://example.com/)
membershealth.ca/Discovery
https://example.com/about
`;

  const urls = extractUrlsFromText(content);
  assert.deepEqual(urls, [
    "https://example.com/about",
    "https://example.com/",
    "https://membershealth.ca/Discovery",
  ]);
});

test("readUrlsFromFile supports txt and md", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mh-screenshot-test-"));
  try {
    const txtFile = path.join(tempDir, "targets.txt");
    const mdFile = path.join(tempDir, "targets.md");

    await writeFile(
      txtFile,
      [
        "https://example.com",
        "membershealth.ca/Discovery",
        "invalid-url",
        "https://example.com",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      mdFile,
      [
        "# Targets",
        "- https://example.com/contact",
        "- [Docs](https://docs.example.com/start)",
      ].join("\n"),
      "utf8",
    );

    const txtUrls = await readUrlsFromFile(txtFile);
    const mdUrls = await readUrlsFromFile(mdFile);

    assert.deepEqual(txtUrls, ["https://example.com/", "https://membershealth.ca/Discovery"]);
    assert.deepEqual(mdUrls, [
      "https://example.com/contact",
      "https://docs.example.com/start",
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("resolveSeedUrls merges positional + file urls", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "mh-screenshot-seeds-"));
  try {
    const filePath = path.join(tempDir, "targets.txt");
    await writeFile(filePath, "https://example.com/blog\nmembershealth.ca/Discovery", "utf8");

    const options = parseCliArguments(["https://example.com", "--url-file", filePath]);
    const seeds = await resolveSeedUrls(options);

    assert.deepEqual(seeds, [
      "https://example.com/",
      "https://example.com/blog",
      "https://membershealth.ca/Discovery",
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("buildExcludedSelectors includes defaults and custom selectors", () => {
  const options = parseCliArguments([
    "--exclude-class",
    "cookie-banner",
    "--exclude-id",
    "modal-root",
  ]);

  const selectors = buildExcludedSelectors(options);
  assert.ok(selectors.includes(".weglot_switcher.country-selector.default.closed.wg-drop"));
  assert.ok(selectors.includes(".vsc-initialized:not(html):not(body)"));
  assert.ok(selectors.includes("#vsc-initialized"));
  assert.ok(selectors.includes(".cookie-banner"));
  assert.ok(selectors.includes("#modal-root"));
});

test("resolvePageKey builds deterministic key", () => {
  assert.equal(resolvePageKey("https://membershealth.ca/Discovery"), "discovery");
  assert.equal(resolvePageKey("https://membershealth.ca/"), "home");
});
