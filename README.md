# Standalone Website Screenshot Tool

This folder contains a standalone screenshot CLI.

Prerequisites:
- Node.js 20+
- `pnpm`

```bash
brew install pnpm
```

## Prompt For Codex

Prompt file:
- `PROMPT.md`

What this prompt is:
- a builder prompt for Codex to generate a standalone screenshot-tool project
- includes required files, scripts, CLI behavior, and exclusions
- useful when creating a similar tool in a new repository

How to use prompt with Codex:
1. Open Codex in your target repository (new or existing).
2. Open `PROMPT.md`.
3. Copy/paste the full prompt into Codex.
4. Ask Codex to implement it directly in that repository.
5. Review generated files and run the setup/capture commands.

## 1. Git Clone

```bash
git clone https://github.com/rliu-membershealth/screenshot-tool.git
cd screenshot-tool
```

## 2. Open Terminal In This Folder

Run commands from `screenshot-tool`.

## 3. Run Setup Once

```bash
pnpm run setup
```

What setup does:
- installs local dependencies
- installs Playwright Chromium runtime

Run tests anytime:

```bash
pnpm test
```

## 4. Capture Screenshot (One Command With URL)

```bash
pnpm run capture "https://example.com"
```

This captures:
- full-page screenshot of the whole document (desktop)
- full-page screenshot of the whole document (mobile)
- not just the visible on-screen viewport
- no fixed viewport-height capture mode (script auto-scrolls until page height stabilizes)
- no segmented mode
- higher resolution by default (`--scale=2`)

Output folder:
- `./screenshot-output`

Default exclusions:
- `.vsc-initialized` (non-root)
- `#vsc-initialized`
- `.weglot_switcher.country-selector.default.closed.wg-drop`
- `.weglot_switcher`

## 5. Advanced Options

Custom output folder:

```bash
pnpm run capture "https://example.com" --output=./my-screenshots
```

Custom resolution scale (`1` to `4`):

```bash
pnpm run capture "https://example.com" --scale=3
```

Exclude extra classes/ids:

```bash
pnpm run capture "https://example.com" --exclude-class cookie-banner,chat-widget --exclude-id modal-root
```

Capture URLs from a file (`.txt`, `.md`, `.doc`, `.docx`):

```bash
pnpm run capture --url-file ./targets.md
```

Crawl reachable pages from the seed URL(s):

```bash
pnpm run capture "https://example.com" --crawl --crawl-depth 2 --max-pages 30
```

Cross-origin crawling (optional):

```bash
pnpm run capture "https://example.com" --crawl --same-origin-only=false
```

You can combine options in one run:

```bash
pnpm run capture --url-file ./targets.docx --exclude-class cookie-banner --exclude-id modal-root --crawl --crawl-depth 1
```

## 6. If Setup Was Skipped

If you see a Playwright/Chromium message, run:

```bash
pnpm run setup
```

Then run the capture command again.

## 7. File Naming

Examples:
- `example-fullpage-document.png`
- `example-fullpage-mobile-document.png`

## 8. Help

```bash
pnpm run capture --help
```
