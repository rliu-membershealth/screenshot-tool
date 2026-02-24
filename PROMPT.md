# Codex Prompt: Generate A Standalone Screenshot Tool

Use this prompt when you want an agent to **build a new project like `screenshot-tool` from scratch**.

```text
You are a coding agent. Build a standalone Node.js + pnpm project that captures website screenshots.

Goal:
Create a reusable CLI tool project that can run with:
1) one-time setup
2) one-command capture by URL

Project requirements:
1. Tech stack:
   - Node.js (ESM)
   - pnpm
   - Playwright (Chromium)
2. Create these files:
   - package.json
   - capture-website-screenshots.mjs
   - README.md
   - .gitignore
3. package.json scripts:
   - `setup`: install dependencies and install Playwright Chromium runtime
   - `capture`: run the screenshot script
4. CLI behavior (`capture-website-screenshots.mjs`):
   - command: `pnpm run capture "<url>"`
   - optional args:
     - `--output=./screenshot-output`
     - `--scale=2` (range 1..4)
     - `--exclude-class=<className>` (repeatable and comma-separated allowed)
     - `--exclude-id=<idName>` (repeatable and comma-separated allowed)
     - `--url-file=<path>` where path may be `.txt`, `.md`, `.doc`, or `.docx`
     - `--crawl` to capture additional reachable URLs from each seed URL
     - `--loop` as a plain-language alias of `--crawl`
     - `--crawl-depth=<n>` (default 1)
     - `--loop-depth=<n>` as an alias of `--crawl-depth`
     - `--same-origin-only <true|false>` (default true)
     - `--no-same-origin-only` (alias to disable same-origin restriction)
  - default URL fallback if URL missing
  - users must be able to combine args in one run (example: URL file + multiple exclude classes/ids + crawl)
5. Screenshot behavior:
   - take **full document screenshots** (`fullPage: true`), not viewport-only
   - do not use fixed viewport-height capture mode; render lazily loaded content first and capture only after the page height stabilizes
   - generate 2 outputs per URL:
     - desktop full document
     - mobile full document (mobile emulation context, no fixed capture height requirement)
   - default high-quality scale should be 2
6. Exclusions during capture:
   - always exclude non-root `.vsc-initialized`
   - always exclude `.weglot_switcher.country-selector.default.closed.wg-drop`
   - also apply user-provided class/id exclusions from CLI args
7. Page preparation before capture:
   - wait for page load
   - aggressively trigger lazy/intersection content by scrolling until document height no longer grows
   - promote lazy-loaded assets (`img`, `iframe`, lazy background attributes) before screenshot
   - wait for fonts/images/network to settle before screenshot
   - neutralize transitions/animations for deterministic output
8. Output naming:
   - `<page-key>-fullpage-document.png`
   - `<page-key>-fullpage-mobile-document.png`
9. README requirements:
   - setup command
   - capture command
   - optional output/scale usage
   - examples for:
     - single URL
     - URL file input
     - user exclusion class/id args
     - crawl mode
    - examples
10. Validation:
   - run script syntax check
   - run capture help command
   - run one real capture test URL and report generated files/sizes

Constraints:
- do not download page assets
- screenshots only
- keep implementation concise and production-usable
- URL file parsing requirements:
  - `.txt` / `.md`: parse line-by-line URLs
  - `.docx`: parse text and extract URLs
  - `.doc`: parse text and extract URLs (if environment cannot parse `.doc`, fail with clear actionable error)
 - crawl safety requirements:
  - dedupe URLs
  - skip non-http(s)
  - configurable max pages (default 50) to avoid runaway crawling
- output metadata:
  - print source URL and output file path/size for every generated screenshot

Deliverable:
- finished project files + short runbook summary
```
