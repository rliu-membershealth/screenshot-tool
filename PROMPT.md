# Codex Prompt: Website Screenshot Capture

Copy/paste this prompt into Codex when you want Codex to run this project for a target URL.

```text
You are in the screenshot-tool project root.

Task:
Capture full-page screenshots of this URL:
<TARGET_URL>

Requirements:
1. Use this project's built-in command (do not create a new script).
2. Ensure setup is complete before capture:
   - run: pnpm run setup
3. Run capture:
   - pnpm run capture "<TARGET_URL>"
4. Default output folder:
   - ./screenshot-output
5. Report:
   - output file paths
   - file sizes
6. Keep capture exclusions active:
   - .vsc-initialized (non-root nodes)
   - .weglot_switcher.country-selector.default.closed.wg-drop
7. Do not download website assets. Only generate screenshots.

Optional:
- Higher resolution:
  pnpm run capture "<TARGET_URL>" --scale=3
- Custom output folder:
  pnpm run capture "<TARGET_URL>" --output=./my-screenshots
```

