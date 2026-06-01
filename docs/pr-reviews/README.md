# PR Reviews

Drop zone for external pull-request reviews (e.g. GitHub Copilot) that the `reviewer` agent triages.

One file per review, named `pr-<number>-<source>.md` (e.g. `pr-1-copilot.md`). Paste the raw review — file/line references and comment text. The reviewer converts each comment into a verdict (ACCEPT / REJECT / DEFER) with a reason; see `.claude/agents/reviewer.md` → "Triaging external PR reviews".
