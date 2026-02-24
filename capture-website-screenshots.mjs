#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * Standalone website screenshot CLI.
 *
 * Behavior:
 * - Captures two full-document screenshots for a URL:
 *   1) desktop
 *   2) mobile (390x844)
 * - Applies deterministic capture preparation:
 *   - scroll pass to reveal lazy/intersection content
 *   - animation/transition neutralization
 *   - explicit exclusion of unwanted overlay/extension nodes
 * - Writes PNG files to `--output` (default: ./screenshot-output)
 *
 * Typical usage:
 *   pnpm run capture "https://example.com"
 *   pnpm run capture "https://example.com" --scale=3
 */
const DEFAULT_URL = "https://membershealth.ca/Discovery";
const MOBILE_VIEWPORT_WIDTH = 390;
const MOBILE_VIEWPORT_HEIGHT = 844;
const DEFAULT_SCALE = 2;
// UI overlays to hide for clean captures.
const EXCLUDED_CAPTURE_SELECTOR =
  ".weglot_switcher.country-selector.default.closed.wg-drop, .weglot_switcher";
// Exclude non-root nodes injected with this class (while keeping <html>/<body> intact).
const EXCLUDED_VSC_SELECTOR = ".vsc-initialized:not(html):not(body)";

/**
 * @typedef {{targetUrl: string, outputDir: string, scale: number}} CliOptions
 */

/**
 * Parse and validate CLI args.
 *
 * Supported flags:
 * - --output=<dir>  output directory
 * - --scale=<1..4>  Playwright deviceScaleFactor for sharper output
 *
 * Positional argument:
 * - first non-flag token is treated as target URL
 *
 * @returns {CliOptions}
 */
const parseOptions = () => {
  const args = process.argv.slice(2);

  /** @type {string | undefined} */
  let maybeUrl;
  let outputDir = path.resolve(process.cwd(), "screenshot-output");
  let scale = DEFAULT_SCALE;

  for (const arg of args) {
    if (arg.startsWith("--output=")) {
      const value = arg.split("=")[1];
      if (!value) {
        console.error("Invalid output dir. Use e.g. --output=./screenshots");
        process.exit(1);
      }
      outputDir = path.resolve(process.cwd(), value);
      continue;
    }

    if (arg.startsWith("--scale=")) {
      const value = Number.parseFloat(arg.split("=")[1] ?? "");
      if (Number.isFinite(value) && value >= 1 && value <= 4) {
        scale = value;
        continue;
      }
      console.error("Invalid scale. Use e.g. --scale=2 (range: 1 to 4).");
      process.exit(1);
    }

    if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage:",
          "  node capture-website-screenshots.mjs <url> [--output=./screenshot-output] [--scale=2]",
          "",
          "Examples:",
          "  node capture-website-screenshots.mjs https://membershealth.ca/Discovery",
          "  node capture-website-screenshots.mjs https://membershealth.ca/programs/surp --output=./my-screenshots",
          "  node capture-website-screenshots.mjs https://membershealth.ca/Discovery --scale=3",
        ].join("\n"),
      );
      process.exit(0);
    }

    if (!arg.startsWith("--") && !maybeUrl) {
      maybeUrl = arg;
    }
  }

  const targetUrl = maybeUrl ?? DEFAULT_URL;
  try {
    const parsed = new URL(targetUrl);
    return {
      targetUrl: parsed.toString(),
      outputDir,
      scale,
    };
  } catch {
    console.error(`Invalid URL: ${targetUrl}`);
    process.exit(1);
  }
};

/**
 * Build a filename-safe key from URL path.
 * Examples:
 * - https://example.com/Discovery -> discovery
 * - https://example.com/programs/surp -> surp
 *
 * @param {string} targetUrl
 * @returns {string}
 */
const pageKeyFromUrl = (targetUrl) => {
  const parsed = new URL(targetUrl);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const raw = parts.at(-1) ?? "page";
  const key = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key.length > 0 ? key : "page";
};

/**
 * Prepare page for deterministic full-document capture.
 *
 * Why this exists:
 * - Some pages hide content until scroll/intersection.
 * - Animated entry states (opacity/transform) can produce blank sections in static captures.
 * - Certain overlays/extensions should not appear in output.
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<void>}
 */
const preparePage = async (page) => {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1200);

  // Perform a top-to-bottom scroll pass to reveal lazy/intersection content.
  await page.evaluate(async () => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 80; i += 1) {
      window.scrollBy(0, Math.floor(window.innerHeight * 0.8));
      await delay(130);

      const nearBottom =
        window.scrollY + window.innerHeight >=
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - 2;

      if (nearBottom) {
        break;
      }
    }
    window.scrollTo(0, 0);
  });

  await page.addStyleTag({
    content: `
      [data-w-id],
      [style*="opacity:0"],
      [style*="opacity: 0"] {
        opacity: 1 !important;
        transform: none !important;
      }
      ${EXCLUDED_CAPTURE_SELECTOR} {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      ${EXCLUDED_VSC_SELECTOR} {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      *,
      *::before,
      *::after {
        /* Freeze animation/motion for reproducible screenshots. */
        transition-duration: 0s !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
      }
    `,
  });

  // Enforce exclusions in runtime DOM, even if site scripts re-toggle visibility.
  await page.evaluate((excludedSelector) => {
    // Keep root nodes visible while excluding non-root extension nodes.
    if (document.documentElement.classList.contains("vsc-initialized")) {
      document.documentElement.classList.remove("vsc-initialized");
    }
    if (document.body.classList.contains("vsc-initialized")) {
      document.body.classList.remove("vsc-initialized");
    }

    const excludedNodes = document.querySelectorAll(excludedSelector);
    for (const node of excludedNodes) {
      if (node instanceof HTMLElement) {
        node.style.setProperty("display", "none", "important");
        node.style.setProperty("visibility", "hidden", "important");
        node.style.setProperty("opacity", "0", "important");
        node.style.setProperty("pointer-events", "none", "important");
      }
    }
  }, EXCLUDED_CAPTURE_SELECTOR);
};

/**
 * @typedef {{outputPath: string, bytes: number}} CaptureResult
 */

/**
 * Capture one full-document screenshot.
 *
 * @param {import("playwright").Browser} browser
 * @param {{url: string, outputPath: string, contextOptions?: import("playwright").BrowserContextOptions}} input
 * @returns {Promise<CaptureResult>}
 */
const captureFullPage = async (browser, input) => {
  const context = await browser.newContext(input.contextOptions ?? {});
  const page = await context.newPage();
  try {
    await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await preparePage(page);
    // Full document capture (whole scrollable page), not just visible viewport.
    await page.screenshot({ path: input.outputPath, fullPage: true });
    const stat = await fs.stat(input.outputPath);
    return { outputPath: input.outputPath, bytes: stat.size };
  } finally {
    await context.close();
  }
};

/**
 * CLI entrypoint:
 * 1) Parse args
 * 2) Ensure output directory exists
 * 3) Launch Chromium
 * 4) Capture desktop + mobile full-document screenshots
 * 5) Print output paths and file sizes
 */
const run = async () => {
  const options = parseOptions();
  const pageKey = pageKeyFromUrl(options.targetUrl);
  await fs.mkdir(options.outputDir, { recursive: true });

  /** @type {import("playwright")} */
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error("Playwright package is not available.");
    console.error("Run setup first:");
    console.error("  pnpm run setup");
    process.exit(1);
  }

  const { chromium } = playwright;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Executable doesn't exist") || message.includes("Please run")) {
      console.error("Chromium runtime is not installed for Playwright.");
      console.error("Run setup first:");
      console.error("  pnpm run setup");
      process.exit(1);
    }
    if (
      message.includes("Permission denied") ||
      message.includes("bootstrap_check_in") ||
      message.includes("Target page, context or browser has been closed")
    ) {
      console.error("Browser launch was blocked by the current environment.");
      console.error("Run this command from a normal local terminal session (not a restricted sandbox).");
      process.exit(1);
    }
    throw error;
  }

  try {
    const desktopOutputPath = path.join(
      options.outputDir,
      `${pageKey}-fullpage-document.png`,
    );
    const mobileOutputPath = path.join(
      options.outputDir,
      `${pageKey}-fullpage-mobile-document.png`,
    );

    const desktopResult = await captureFullPage(browser, {
      url: options.targetUrl,
      outputPath: desktopOutputPath,
      contextOptions: {
        // Higher default pixel density improves text and edge sharpness.
        deviceScaleFactor: options.scale,
      },
    });

    const mobileResult = await captureFullPage(browser, {
      url: options.targetUrl,
      outputPath: mobileOutputPath,
      contextOptions: {
        viewport: {
          width: MOBILE_VIEWPORT_WIDTH,
          height: MOBILE_VIEWPORT_HEIGHT,
        },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: options.scale,
      },
    });
    console.log(`URL: ${options.targetUrl}`);
    console.log(`Output dir: ${options.outputDir}`);
    console.log(`Scale: ${options.scale}x`);
    console.log(`${desktopResult.outputPath} (${desktopResult.bytes} bytes)`);
    console.log(`${mobileResult.outputPath} (${mobileResult.bytes} bytes)`);
  } finally {
    await browser.close();
  }
};

run().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
