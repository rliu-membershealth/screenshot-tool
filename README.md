# Standalone Website Screenshot Tool

This folder contains a standalone screenshot program.

only needs:
- `pnpm` install

```bash
brew install pnpm
```

## Prompt For Codex

Prompt file:
- `PROMPT.md`

What this prompt is:
- the exact instruction template used to tell Codex how to run this project
- includes required setup + capture commands
- includes output/reporting expectations

How to use prompt with Codex:
1. Open Codex in this repository (`screenshot-tool`).
2. Open `PROMPT.md`.
3. Replace `<TARGET_URL>` with your page URL.
4. Copy/paste the full prompt into Codex.
5. Codex will run setup/capture and return output file paths + sizes.

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

## 4. Capture Screenshot (One Command With URL)

```bash
pnpm run capture "https://example.com"
```

This captures:
- full-page screenshot of the whole document (desktop)
- full-page screenshot of the whole document (mobile)
- not just the visible on-screen viewport
- no segmented mode
- higher resolution by default (`--scale=2`)

Output folder:
- `./screenshot-output`

Capture exclusions (from your prompt):
- excludes `.vsc-initialized` (non-root nodes)
- excludes `.weglot_switcher.country-selector.default.closed.wg-drop`

## 5. If Setup Was Skipped

If you see a Playwright/Chromium message, run:

```bash
pnpm run setup
```

Then run the capture command again.

Custom output folder:

```bash
pnpm run capture "https://example.com" --output=./my-screenshots
```

Custom resolution scale (`1` to `4`):

```bash
pnpm run capture "https://example.com" --scale=3
```

## 6. File Naming

Examples:
- `example-fullpage-document.png`
- `example-fullpage-mobile-document.png`

## 7. Help

```bash
pnpm run capture --help
```
