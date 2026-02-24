#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = __dirname;

const DEFAULT_PAGE_URL = "https://membershealth.ca/Discovery";
const DEFAULT_OUTPUT_DIR = path.join(repoRoot, "screenshot-output");
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_SCALE = 2;
const DEFAULT_CRAWL_DEPTH = 1;
const DEFAULT_MAX_PAGES = 50;
const DEFAULT_FULLLOAD_STABLE_ROUNDS = 3;
const DEFAULT_FULLLOAD_MAX_ROUNDS = 36;
const DEFAULT_ASSET_SETTLE_TIMEOUT_MS = 6_000;
const DEFAULT_MOBILE_DEVICE_NAME = "iPhone 12";

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);
const SUPPORTED_URL_FILE_EXTENSIONS = new Set([".txt", ".md", ".doc", ".docx"]);
const ASSET_EXTENSION_PATTERN =
  /\.(?:avif|bmp|css|csv|gif|ico|jpe?g|js|json|map|mp3|mp4|pdf|png|svg|txt|webm|webp|woff2?)$/i;

const DEFAULT_EXCLUDED_SELECTORS = [
  ".weglot_switcher.country-selector.default.closed.wg-drop",
  ".weglot_switcher",
  ".vsc-initialized:not(html):not(body)",
  "#vsc-initialized",
];

/**
 * @typedef {object} CaptureCliOptions
 * @property {string[]} positionalUrls
 * @property {string[]} urlFiles
 * @property {string} outputDir
 * @property {boolean} crawl
 * @property {number} crawlDepth
 * @property {boolean} sameOriginOnly
 * @property {number} maxPages
 * @property {number} timeoutMs
 * @property {number} scale
 * @property {string[]} excludeClasses
 * @property {string[]} excludeIds
 * @property {boolean} help
 */

/**
 * @typedef {object} CaptureTarget
 * @property {string} targetUrl
 * @property {string} outputKey
 */

/**
 * @typedef {object} CaptureResult
 * @property {string} targetUrl
 * @property {string} outputPath
 * @property {number} width
 * @property {number} height
 * @property {number} bytes
 */

/**
 * Parse CLI arguments.
 * @param {string[]} argv
 * @returns {CaptureCliOptions}
 */
export const parseCliArguments = (argv) => {
  /** @type {CaptureCliOptions} */
  const options = {
    positionalUrls: [],
    urlFiles: [],
    outputDir: DEFAULT_OUTPUT_DIR,
    crawl: false,
    crawlDepth: DEFAULT_CRAWL_DEPTH,
    sameOriginOnly: true,
    maxPages: DEFAULT_MAX_PAGES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    scale: DEFAULT_SCALE,
    excludeClasses: [],
    excludeIds: [],
    help: false,
  };

  const readValue = (arg, index, flagName) => {
    const maybeInline = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : undefined;
    if (typeof maybeInline === "string" && maybeInline.length > 0) {
      return { value: maybeInline, nextIndex: index + 1 };
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${flagName}`);
    }
    return { value: next, nextIndex: index + 2 };
  };

  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      index += 1;
      continue;
    }

    if (!arg.startsWith("--")) {
      options.positionalUrls.push(arg);
      index += 1;
      continue;
    }

    if (arg === "--crawl") {
      options.crawl = true;
      index += 1;
      continue;
    }

    if (arg === "--no-crawl") {
      options.crawl = false;
      index += 1;
      continue;
    }

    if (arg === "--same-origin-only") {
      options.sameOriginOnly = true;
      index += 1;
      continue;
    }

    if (arg.startsWith("--same-origin-only=")) {
      const rawValue = arg.slice("--same-origin-only=".length).trim().toLowerCase();
      if (rawValue === "true") {
        options.sameOriginOnly = true;
        index += 1;
        continue;
      }
      if (rawValue === "false") {
        options.sameOriginOnly = false;
        index += 1;
        continue;
      }
      throw new Error(
        `Invalid --same-origin-only value: ${rawValue}. Use true, false, or --no-same-origin-only.`,
      );
    }

    if (arg === "--no-same-origin-only") {
      options.sameOriginOnly = false;
      index += 1;
      continue;
    }

    if (arg.startsWith("--url-file")) {
      const { value, nextIndex } = readValue(arg, index, "--url-file");
      options.urlFiles.push(value);
      index = nextIndex;
      continue;
    }

    if (arg.startsWith("--output-dir") || arg.startsWith("--output")) {
      const flagName = arg.startsWith("--output-dir") ? "--output-dir" : "--output";
      const { value, nextIndex } = readValue(arg, index, flagName);
      options.outputDir = path.resolve(process.cwd(), value);
      index = nextIndex;
      continue;
    }

    if (arg.startsWith("--crawl-depth")) {
      const { value, nextIndex } = readValue(arg, index, "--crawl-depth");
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid --crawl-depth value: ${value}`);
      }
      options.crawlDepth = parsed;
      index = nextIndex;
      continue;
    }

    if (arg.startsWith("--max-pages")) {
      const { value, nextIndex } = readValue(arg, index, "--max-pages");
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Invalid --max-pages value: ${value}`);
      }
      options.maxPages = parsed;
      index = nextIndex;
      continue;
    }

    if (arg.startsWith("--timeout-ms")) {
      const { value, nextIndex } = readValue(arg, index, "--timeout-ms");
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 5_000) {
        throw new Error(`Invalid --timeout-ms value: ${value}. Expected >= 5000.`);
      }
      options.timeoutMs = parsed;
      index = nextIndex;
      continue;
    }

    if (arg.startsWith("--scale")) {
      const { value, nextIndex } = readValue(arg, index, "--scale");
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --scale value: ${value}`);
      }
      options.scale = parsed;
      index = nextIndex;
      continue;
    }

    if (arg.startsWith("--exclude-class")) {
      const { value, nextIndex } = readValue(arg, index, "--exclude-class");
      options.excludeClasses.push(...splitCommaList(value));
      index = nextIndex;
      continue;
    }

    if (arg.startsWith("--exclude-id")) {
      const { value, nextIndex } = readValue(arg, index, "--exclude-id");
      options.excludeIds.push(...splitCommaList(value));
      index = nextIndex;
      continue;
    }

    if (arg.startsWith("--mode")) {
      const { value, nextIndex } = readValue(arg, index, "--mode");
      if (value !== "full") {
        throw new Error("Only full-page mode is supported. Remove --mode=segments.");
      }
      index = nextIndex;
      continue;
    }

    if (arg === "--segments") {
      throw new Error("Segmented mode is no longer supported. Use default full-page capture.");
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
};

/**
 * Print command usage.
 */
const printHelp = () => {
  console.log(
    [
      "Usage:",
      "  node capture-website-screenshots.mjs [url] [options]",
      "",
      "Examples:",
      "  node capture-website-screenshots.mjs https://membershealth.ca/Discovery",
      "  node capture-website-screenshots.mjs --url-file ./targets.md --crawl --crawl-depth 2",
      "  node capture-website-screenshots.mjs --url-file ./targets.docx --exclude-class cookie-banner --exclude-id modal-root",
      "",
      "Options:",
      "  --url-file <path>              Read URLs from .txt/.md/.doc/.docx",
      "  --crawl                        Crawl reachable pages from seed URLs",
      "  --crawl-depth <n>              Crawl depth (default: 1)",
      "  --max-pages <n>                Max URLs captured after crawl (default: 50)",
      "  --same-origin-only             Keep crawl inside seed origins (default)",
      "  --same-origin-only=true|false  Explicit boolean variant",
      "  --no-same-origin-only          Allow cross-origin crawl links",
      "  --exclude-class <name[,name]>  Hide class selectors during capture (repeatable)",
      "  --exclude-id <name[,name]>     Hide id selectors during capture (repeatable)",
      "  --output-dir <path>            Output directory (default: ./screenshot-output)",
      "  --output <path>                Alias for --output-dir",
      "  --scale <number>               Device scale factor (default: 2)",
      "  --timeout-ms <ms>              Navigation timeout in milliseconds (default: 60000)",
      "  --help                         Print help",
    ].join("\n"),
  );
};

/**
 * Split comma-separated values and trim blanks.
 * @param {string} value
 * @returns {string[]}
 */
export const splitCommaList = (value) => {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

/**
 * Deduplicate strings while preserving order.
 * @param {string[]} values
 * @returns {string[]}
 */
export const uniqueOrdered = (values) => {
  const seen = new Set();
  /** @type {string[]} */
  const output = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }
  return output;
};

/**
 * Normalize a URL string for capture/crawl usage.
 * @param {string} value
 * @returns {string}
 */
export const normalizeCaptureUrl = (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("URL cannot be empty.");
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const parsed = new URL(withProtocol);
  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
  }

  parsed.hash = "";
  return parsed.toString();
};

/**
 * Normalize crawl-discovered URL by dropping hash and preserving query.
 * @param {URL} url
 * @returns {string}
 */
const normalizeDiscoveredUrl = (url) => {
  const normalized = new URL(url.toString());
  normalized.hash = "";
  return normalized.toString();
};

/**
 * Extract URL-like tokens from plain text and normalize to capture URLs.
 * @param {string} content
 * @returns {string[]}
 */
export const extractUrlsFromText = (content) => {
  const rawCandidates = new Set();
  const httpPattern = /https?:\/\/[^\s<>"'`)]*/gi;
  const markdownLinkPattern = /\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi;

  for (const match of content.matchAll(httpPattern)) {
    const candidate = trimUrlPunctuation(match[0] ?? "");
    if (candidate) {
      rawCandidates.add(candidate);
    }
  }

  for (const match of content.matchAll(markdownLinkPattern)) {
    const candidate = trimUrlPunctuation(match[1] ?? "");
    if (candidate) {
      rawCandidates.add(candidate);
    }
  }

  for (const line of content.split(/\r?\n/u)) {
    const candidate = line.trim();
    if (
      candidate &&
      !candidate.includes(" ") &&
      !candidate.includes("@") &&
      /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}([/:?#].*)?$/u.test(candidate)
    ) {
      rawCandidates.add(candidate);
    }
  }

  /** @type {string[]} */
  const normalized = [];
  for (const candidate of rawCandidates) {
    try {
      normalized.push(normalizeCaptureUrl(candidate));
    } catch {
      // Ignore invalid URL candidates extracted from free-form documents.
    }
  }

  return uniqueOrdered(normalized);
};

/**
 * Trim punctuation frequently attached to pasted URLs.
 * @param {string} value
 * @returns {string}
 */
const trimUrlPunctuation = (value) => {
  return value.replace(/[),.;]+$/u, "").trim();
};

/**
 * Best-effort XML entity decoding for DOCX fallback parsing.
 * @param {string} value
 * @returns {string}
 */
const decodeXmlEntities = (value) => {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    );
};

/**
 * Run an external command and return stdout.
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{ ok: true; stdout: string } | { ok: false; reason: string }>}
 */
const runCommandForStdout = async (command, args) => {
  try {
    const { stdout } = await execFileAsync(command, args, {
      maxBuffer: 20 * 1024 * 1024,
    });
    return { ok: true, stdout };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason };
  }
};

/**
 * Extract text from .docx.
 * Uses `textutil` first (macOS), then `unzip -p` fallback.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
const extractDocxText = async (filePath) => {
  const textutilAttempt = await runCommandForStdout("textutil", [
    "-convert",
    "txt",
    "-stdout",
    filePath,
  ]);
  if (textutilAttempt.ok && textutilAttempt.stdout.trim().length > 0) {
    return textutilAttempt.stdout;
  }

  const unzipAttempt = await runCommandForStdout("unzip", [
    "-p",
    filePath,
    "word/document.xml",
  ]);
  if (unzipAttempt.ok && unzipAttempt.stdout.trim().length > 0) {
    const withNewlines = unzipAttempt.stdout
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<[^>]+>/g, " ");
    return decodeXmlEntities(withNewlines);
  }

  throw new Error(
    [
      `Unable to read .docx file: ${filePath}`,
      "Tried: textutil, unzip.",
      "Install one of those tools, or convert the URL file to .txt/.md.",
    ].join(" "),
  );
};

/**
 * Extract text from .doc.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
const extractDocText = async (filePath) => {
  const textutilAttempt = await runCommandForStdout("textutil", [
    "-convert",
    "txt",
    "-stdout",
    filePath,
  ]);
  if (textutilAttempt.ok && textutilAttempt.stdout.trim().length > 0) {
    return textutilAttempt.stdout;
  }

  const catdocAttempt = await runCommandForStdout("catdoc", [filePath]);
  if (catdocAttempt.ok && catdocAttempt.stdout.trim().length > 0) {
    return catdocAttempt.stdout;
  }

  throw new Error(
    [
      `Unable to read .doc file: ${filePath}`,
      "Tried: textutil, catdoc.",
      "Install one of those tools, or convert the URL file to .txt/.md.",
    ].join(" "),
  );
};

/**
 * Read a URL file and return normalized URL values.
 * @param {string} filePath
 * @returns {Promise<string[]>}
 */
export const readUrlsFromFile = async (filePath) => {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const extension = path.extname(absolutePath).toLowerCase();
  if (!SUPPORTED_URL_FILE_EXTENSIONS.has(extension)) {
    throw new Error(
      `Unsupported --url-file extension: ${extension || "(none)"} for ${filePath}`,
    );
  }

  let textContent = "";
  if (extension === ".txt" || extension === ".md") {
    textContent = await fs.readFile(absolutePath, "utf8");
  } else if (extension === ".docx") {
    textContent = await extractDocxText(absolutePath);
  } else if (extension === ".doc") {
    textContent = await extractDocText(absolutePath);
  }

  const urls = extractUrlsFromText(textContent);
  if (urls.length === 0) {
    throw new Error(`No valid URLs found in: ${filePath}`);
  }
  return urls;
};

/**
 * Resolve seed URLs from positional args and --url-file inputs.
 * @param {CaptureCliOptions} options
 * @returns {Promise<string[]>}
 */
export const resolveSeedUrls = async (options) => {
  /** @type {string[]} */
  const collected = [];

  if (options.positionalUrls.length === 0 && options.urlFiles.length === 0) {
    collected.push(DEFAULT_PAGE_URL);
  } else {
    collected.push(...options.positionalUrls);
  }

  for (const urlFile of options.urlFiles) {
    const fileUrls = await readUrlsFromFile(urlFile);
    collected.push(...fileUrls);
  }

  const normalized = collected.map((candidate) => normalizeCaptureUrl(candidate));
  return uniqueOrdered(normalized);
};

/**
 * Load Playwright from this workspace.
 * @returns {Promise<import("playwright")>}
 */
const loadPlaywright = async () => {
  try {
    return await import("playwright");
  } catch {
    throw new Error(
      [
        "Playwright is not available in this runtime.",
        "Install with: pnpm add -D playwright@1.51.1",
        "Install browser with: pnpm exec playwright install chromium",
      ].join("\n"),
    );
  }
};

/**
 * Resolve mobile emulation options without manually fixing viewport height.
 * Prefers built-in Playwright mobile descriptors.
 * @param {import("playwright")} playwright
 * @param {number} scale
 * @returns {import("playwright").BrowserContextOptions}
 */
const resolveMobileContextOptions = (playwright, scale) => {
  const descriptor = playwright.devices?.[DEFAULT_MOBILE_DEVICE_NAME];
  if (descriptor) {
    return {
      ...descriptor,
      deviceScaleFactor: scale,
    };
  }

  return {
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: scale,
  };
};

/**
 * Convert user-provided class values into safe selector fragments.
 * @param {string[]} classNames
 * @returns {string[]}
 */
const classNamesToSelectors = (classNames) => {
  return classNames
    .map((name) => name.trim().replace(/^\./u, ""))
    .filter(Boolean)
    .map((name) => `.${escapeCssIdentifier(name)}`);
};

/**
 * Convert user-provided id values into safe selector fragments.
 * @param {string[]} ids
 * @returns {string[]}
 */
const idsToSelectors = (ids) => {
  return ids
    .map((value) => value.trim().replace(/^#/u, ""))
    .filter(Boolean)
    .map((value) => `#${escapeCssIdentifier(value)}`);
};

/**
 * Escape a CSS identifier.
 * @param {string} value
 * @returns {string}
 */
export const escapeCssIdentifier = (value) => {
  return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
};

/**
 * Build hide selectors from defaults + user options.
 * @param {CaptureCliOptions} options
 * @returns {string[]}
 */
export const buildExcludedSelectors = (options) => {
  return uniqueOrdered([
    ...DEFAULT_EXCLUDED_SELECTORS,
    ...classNamesToSelectors(options.excludeClasses),
    ...idsToSelectors(options.excludeIds),
  ]);
};

/**
 * Promote lazy media attributes so assets start loading before scroll/capture.
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
const promoteLazyAssets = async (page) => {
  await page.evaluate(() => {
    const readDataset = (element, keys) => {
      for (const key of keys) {
        const value = element.getAttribute(`data-${key}`);
        if (value) {
          return value;
        }
      }
      return null;
    };

    const images = Array.from(document.querySelectorAll("img"));
    for (const image of images) {
      if (!(image instanceof HTMLImageElement)) {
        continue;
      }
      if (image.loading === "lazy") {
        image.loading = "eager";
      }
      const src = readDataset(image, ["src", "lazy-src", "original"]);
      const srcset = readDataset(image, ["srcset", "lazy-srcset"]);
      if (src && !image.getAttribute("src")) {
        image.setAttribute("src", src);
      }
      if (srcset && !image.getAttribute("srcset")) {
        image.setAttribute("srcset", srcset);
      }
    }

    const iframes = Array.from(document.querySelectorAll("iframe[loading='lazy']"));
    for (const frame of iframes) {
      if (frame instanceof HTMLIFrameElement) {
        frame.loading = "eager";
      }
    }

    const backgroundNodes = Array.from(
      document.querySelectorAll("[data-bg], [data-background-image], [data-lazy-background]"),
    );
    for (const node of backgroundNodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const backgroundValue =
        node.getAttribute("data-bg") ||
        node.getAttribute("data-background-image") ||
        node.getAttribute("data-lazy-background");
      if (!backgroundValue) {
        continue;
      }
      const normalized = backgroundValue.trim().startsWith("url(")
        ? backgroundValue
        : `url("${backgroundValue}")`;
      node.style.setProperty("background-image", normalized, "important");
    }

    const autoVisibilityNodes = Array.from(document.querySelectorAll("*"));
    for (const node of autoVisibilityNodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      const contentVisibility = window.getComputedStyle(node).contentVisibility;
      if (contentVisibility === "auto") {
        node.style.setProperty("content-visibility", "visible", "important");
      }
    }
  });
};

/**
 * Scroll page to load lazy/reveal sections.
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
const triggerDeferredContent = async (page) => {
  await page.evaluate(
    async ({ maxRounds, stableRoundsToStop }) => {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const readHeight = () =>
        Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.offsetHeight,
        );

      let maxSeenHeight = readHeight();
      let stableRounds = 0;

      for (let round = 0; round < maxRounds; round += 1) {
        let targetHeight = readHeight();
        let previousY = -1;

        while (window.scrollY + window.innerHeight < targetHeight - 2) {
          const step = Math.max(220, Math.floor(window.innerHeight * 0.9));
          window.scrollBy(0, step);
          await delay(120);

          if (window.scrollY === previousY) {
            break;
          }
          previousY = window.scrollY;
          targetHeight = Math.max(targetHeight, readHeight());
        }

        window.scrollTo(0, targetHeight);
        await delay(380);

        const nextHeight = readHeight();
        if (nextHeight <= maxSeenHeight + 2) {
          stableRounds += 1;
        } else {
          stableRounds = 0;
          maxSeenHeight = nextHeight;
        }

        if (stableRounds >= stableRoundsToStop) {
          break;
        }
      }

      window.scrollTo(0, 0);
    },
    {
      maxRounds: DEFAULT_FULLLOAD_MAX_ROUNDS,
      stableRoundsToStop: DEFAULT_FULLLOAD_STABLE_ROUNDS,
    },
  );
};

/**
 * Wait until late-loading assets (fonts/images) settle before screenshot.
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
const waitForAssetSettle = async (page) => {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(async (timeoutMs) => {
    const waitForImage = (image) =>
      new Promise((resolve) => {
        if (image.complete) {
          resolve();
          return;
        }
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });

    const timeout = new Promise((resolve) => {
      setTimeout(resolve, timeoutMs);
    });

    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    const pendingImages = Array.from(document.images).map((image) => waitForImage(image));
    await Promise.race([
      Promise.allSettled([fontsReady, ...pendingImages]),
      timeout,
    ]);
  }, DEFAULT_ASSET_SETTLE_TIMEOUT_MS);
};

/**
 * Prepare page state to make captures deterministic.
 * @param {import("playwright").Page} page
 * @param {string[]} excludedSelectors
 * @returns {Promise<void>}
 */
const preparePageForCapture = async (page, excludedSelectors) => {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(800);
  await promoteLazyAssets(page);
  await triggerDeferredContent(page);
  await waitForAssetSettle(page);

  const hideRule =
    excludedSelectors.length > 0
      ? `${excludedSelectors.join(",\n")} {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}`
      : "";

  await page.addStyleTag({
    content: `
      [data-w-id],
      [style*="opacity:0"],
      [style*="opacity: 0"] {
        opacity: 1 !important;
        transform: none !important;
      }

      *,
      *::before,
      *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }

      ${hideRule}
    `,
  });

  await page.evaluate((selectors) => {
    const revealNodes = document.querySelectorAll(
      '[data-w-id], [style*="opacity:0"], [style*="opacity: 0"]',
    );
    for (const node of revealNodes) {
      if (node instanceof HTMLElement) {
        node.style.opacity = "1";
        node.style.transform = "none";
      }
    }

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (node instanceof HTMLElement) {
          node.style.setProperty("display", "none", "important");
          node.style.setProperty("visibility", "hidden", "important");
          node.style.setProperty("opacity", "0", "important");
          node.style.setProperty("pointer-events", "none", "important");
        }
      }
    }
  }, excludedSelectors);

  await page.waitForTimeout(200);
};

/**
 * Resolve filename-safe output key from URL path.
 * @param {string} urlValue
 * @returns {string}
 */
export const resolvePageKey = (urlValue) => {
  const parsed = new URL(urlValue);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const fromPath = segments.at(-1) ?? "home";
  const normalized = fromPath
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "page";
};

/**
 * Resolve unique output key per target URL.
 * @param {string} targetUrl
 * @param {Set<string>} seen
 * @returns {string}
 */
const resolveOutputKey = (targetUrl, seen) => {
  const pageKey = resolvePageKey(targetUrl);
  const parsed = new URL(targetUrl);
  const hostKey = parsed.hostname
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  /** @type {string[]} */
  const candidates = [pageKey, `${hostKey}-${pageKey}`, `${hostKey}-${pageKey}-${Date.now()}`];
  for (const candidate of candidates) {
    if (!seen.has(candidate)) {
      seen.add(candidate);
      return candidate;
    }
  }

  const fallback = `${hostKey}-${pageKey}-${seen.size + 1}`;
  seen.add(fallback);
  return fallback;
};

/**
 * Capture desktop + mobile screenshots for one URL.
 * @param {import("playwright").Browser} browser
 * @param {CaptureTarget} target
 * @param {{ outputDir: string; timeoutMs: number; scale: number; excludedSelectors: string[]; mobileContextOptions: import("playwright").BrowserContextOptions }} settings
 * @returns {Promise<CaptureResult[]>}
 */
const captureUrl = async (browser, target, settings) => {
  const captureProfiles = [
    {
      suffix: "fullpage-document",
      contextOptions: {
        deviceScaleFactor: settings.scale,
      },
    },
    {
      suffix: "fullpage-mobile-document",
      contextOptions: settings.mobileContextOptions,
    },
  ];

  /** @type {CaptureResult[]} */
  const results = [];

  for (const profile of captureProfiles) {
    const outputPath = path.join(
      settings.outputDir,
      `${target.outputKey}-${profile.suffix}.png`,
    );

    const context = await browser.newContext(profile.contextOptions);
    const page = await context.newPage();

    try {
      await page.goto(target.targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: settings.timeoutMs,
      });
      await preparePageForCapture(page, settings.excludedSelectors);
      await page.screenshot({
        path: outputPath,
        fullPage: true,
      });

      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));

      const stat = await fs.stat(outputPath);
      results.push({
        targetUrl: target.targetUrl,
        outputPath,
        width: viewport.width,
        height: viewport.height,
        bytes: stat.size,
      });
    } finally {
      await context.close();
    }
  }

  return results;
};

/**
 * Determine whether a URL should be considered as crawl target page.
 * @param {URL} url
 * @returns {boolean}
 */
const isLikelyHtmlPage = (url) => {
  return !ASSET_EXTENSION_PATTERN.test(url.pathname);
};

/**
 * Collect crawl links from current page.
 * @param {import("playwright").Page} page
 * @param {string} baseUrl
 * @param {Set<string>} allowedOrigins
 * @param {boolean} sameOriginOnly
 * @returns {Promise<string[]>}
 */
const collectLinksFromPage = async (page, baseUrl, allowedOrigins, sameOriginOnly) => {
  const hrefs = await page.$$eval("a[href]", (elements) =>
    elements
      .map((element) => element.getAttribute("href") ?? "")
      .map((href) => href.trim())
      .filter(Boolean),
  );

  /** @type {string[]} */
  const resolved = [];
  for (const href of hrefs) {
    if (
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:")
    ) {
      continue;
    }

    try {
      const parsed = new URL(href, baseUrl);
      if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
        continue;
      }
      if (sameOriginOnly && !allowedOrigins.has(parsed.origin)) {
        continue;
      }
      if (!isLikelyHtmlPage(parsed)) {
        continue;
      }
      resolved.push(normalizeDiscoveredUrl(parsed));
    } catch {
      // Ignore invalid URLs.
    }
  }

  return uniqueOrdered(resolved);
};

/**
 * Crawl pages reachable from seed URLs.
 * @param {import("playwright").Browser} browser
 * @param {string[]} seedUrls
 * @param {{ crawlDepth: number; maxPages: number; sameOriginOnly: boolean; timeoutMs: number }} settings
 * @returns {Promise<string[]>}
 */
const crawlTargets = async (browser, seedUrls, settings) => {
  const allowedOrigins = new Set(seedUrls.map((urlValue) => new URL(urlValue).origin));
  const maxPages = Math.max(settings.maxPages, seedUrls.length);
  const discovered = uniqueOrdered(seedUrls);
  const discoveredSet = new Set(discovered);

  /** @type {Array<{ url: string; depth: number }>} */
  const queue = seedUrls.map((urlValue) => ({ url: urlValue, depth: 0 }));

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    while (queue.length > 0 && discoveredSet.size < maxPages) {
      const next = queue.shift();
      if (!next) {
        break;
      }

      try {
        await page.goto(next.url, {
          waitUntil: "domcontentloaded",
          timeout: settings.timeoutMs,
        });
      } catch {
        continue;
      }

      if (next.depth >= settings.crawlDepth) {
        continue;
      }

      const links = await collectLinksFromPage(
        page,
        next.url,
        allowedOrigins,
        settings.sameOriginOnly,
      );

      for (const link of links) {
        if (discoveredSet.has(link)) {
          continue;
        }
        if (discoveredSet.size >= maxPages) {
          break;
        }
        discoveredSet.add(link);
        discovered.push(link);
        queue.push({ url: link, depth: next.depth + 1 });
      }
    }
  } finally {
    await context.close();
  }

  return discovered;
};

/**
 * Resolve capture targets from seed URLs and optional crawl behavior.
 * @param {import("playwright").Browser} browser
 * @param {CaptureCliOptions} options
 * @returns {Promise<CaptureTarget[]>}
 */
const resolveCaptureTargets = async (browser, options) => {
  const seedUrls = await resolveSeedUrls(options);
  const urls = options.crawl
    ? await crawlTargets(browser, seedUrls, {
        crawlDepth: options.crawlDepth,
        maxPages: options.maxPages,
        sameOriginOnly: options.sameOriginOnly,
        timeoutMs: options.timeoutMs,
      })
    : seedUrls;

  const seenOutputKeys = new Set();
  return urls.map((targetUrl) => ({
    targetUrl,
    outputKey: resolveOutputKey(targetUrl, seenOutputKeys),
  }));
};

/**
 * Print capture summary.
 * @param {CaptureCliOptions} options
 * @param {string[]} excludedSelectors
 * @param {CaptureResult[]} results
 */
const printSummary = (options, excludedSelectors, results) => {
  console.log(`Output dir: ${path.relative(repoRoot, options.outputDir) || "."}`);
  console.log("Viewport height mode: dynamic (auto-scrolls until page height stabilizes)");
  console.log(`Device scale factor: ${options.scale}`);
  console.log(`Crawl enabled: ${options.crawl ? "yes" : "no"}`);
  if (options.crawl) {
    console.log(`Crawl depth: ${options.crawlDepth}`);
    console.log(`Max pages: ${options.maxPages}`);
    console.log(`Same origin only: ${options.sameOriginOnly ? "yes" : "no"}`);
  }
  console.log(`Excluded selectors (${excludedSelectors.length}):`);
  for (const selector of excludedSelectors) {
    console.log(`  - ${selector}`);
  }
  console.log("Screenshots:");
  for (const result of results) {
    console.log(
      [
        `  - URL: ${result.targetUrl}`,
        `    viewport=${result.width}x${result.height}`,
        `    file=${path.relative(repoRoot, result.outputPath)}`,
        `    bytes=${result.bytes}`,
      ].join("\n"),
    );
  }
};

/**
 * Run screenshot capture workflow.
 * @returns {Promise<void>}
 */
export const run = async () => {
  const options = parseCliArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await fs.mkdir(options.outputDir, { recursive: true });
  const excludedSelectors = buildExcludedSelectors(options);

  const playwright = await loadPlaywright();
  const { chromium } = playwright;
  const mobileContextOptions = resolveMobileContextOptions(playwright, options.scale);
  const browser = await chromium.launch({ headless: true });

  try {
    const targets = await resolveCaptureTargets(browser, options);
    if (targets.length === 0) {
      throw new Error("No URLs resolved for capture.");
    }

    /** @type {CaptureResult[]} */
    const results = [];
    for (const target of targets) {
      const captures = await captureUrl(browser, target, {
        outputDir: options.outputDir,
        timeoutMs: options.timeoutMs,
        scale: options.scale,
        excludedSelectors,
        mobileContextOptions,
      });
      results.push(...captures);
    }

    printSummary(options, excludedSelectors, results);
  } finally {
    await browser.close();
  }
};

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === __filename
  : false;

if (isDirectExecution) {
  run().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
