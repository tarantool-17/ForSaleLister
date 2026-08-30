---
name: "yeet"
description: "Use only when the user explicitly asks to stage intended changes into small coherent commits, push the branch, and open or update a GitHub pull request in one flow using the GitHub CLI (`gh`)."
---

> Repository adaptation of OpenAI's curated `yeet` skill. This version adds scope-safe staging, small coherent commits, repository-instruction awareness, and clear conventional commit messages.

## Prerequisites

- Require GitHub CLI `gh`. Check `gh --version`. If missing, ask the user to install `gh` and stop.
- Require authenticated `gh` session. Run `gh auth status`. If not authenticated, ask the user to run `gh auth login` (and re-run `gh auth status`) before continuing.
- Read applicable repository instructions, including `AGENTS.md`, before choosing a branch, base branch, files, checks, or PR format.
- Require a clear understanding of which working-tree changes belong to the requested publication. Never include unrelated user changes merely because they are present.

## Naming conventions

- Branch: follow repository instructions; otherwise use `codex/{kebab-case-description}` when starting from the default or integration branch.
- Commit: `<type>(<optional-scope>): <imperative subject>` with a concise subject that states one coherent change.
- PR title: `<type>(<optional-scope>): <subject>` summarizing the full branch diff.

## Commit planning

Before staging, inspect `git status -sb`, the unstaged diff, the staged diff, and relevant untracked files. Propose the commit groups internally from the actual dependency and review boundaries.

- Prefer multiple small commits when the diff contains independently reviewable concerns such as implementation, tests, documentation, or tooling.
- Keep tightly coupled code and its required tests or schema changes together. Do not split merely by file count.
- Each commit should leave the repository internally consistent and pass the most relevant affordable check when practical.
- Use explicit paths or patch staging. Never default to `git add -A` in a mixed worktree.
- If ownership or grouping is ambiguous, ask before staging. Do not use destructive cleanup, rewrite published history, or amend user commits unless explicitly requested.
- If the complete requested change is one coherent unit, one focused commit is correct.

## PR template discovery

Before creating the PR, resolve the repository root and look for the active GitHub PR template from there:

```shell
repo_root="$(git rev-parse --show-toplevel)"
```

Template candidates, in order:

- `.github/pull_request_template.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- One `*.md` file under `.github/pull_request_template/`
- One `*.md` file under `.github/PULL_REQUEST_TEMPLATE/`

Use paths as emitted from the repository root, such as `.github/pull_request_template.md`, not `./.github/pull_request_template.md`.

If exactly one template is found, read it before composing the final PR body and pass it to `gh pr create` with `--template "$template"`.

If multiple template files are found, stop before PR creation and ask which template to use. If no template exists, use the fallback body shape in this skill.

## Workflow

- Inspect the current branch, repository instructions, remotes, status, staged and unstaged diffs, and relevant untracked files.
- If on the default or integration branch, create the required feature branch. Otherwise stay on the current feature branch.
- Determine the PR base from the user's request, then repository instructions, then the remote default branch. Confirm the base exists remotely before PR creation.
- Build the commit plan using the rules above. Stage only the first group's exact paths or hunks, inspect `git diff --cached`, run its relevant check when practical, and commit with a clear conventional message. Repeat for each group.
- Before pushing, inspect `git log --oneline <base>..HEAD`, `git diff --stat <base>...HEAD`, and `git status -sb`. Stop if intended changes remain unstaged or unrelated changes were included.
- Run remaining relevant checks if they have not already run. If a required dependency or tool is missing, report the blocker or request approval before installing it.
- Push once with tracking: `git push -u origin "$(git branch --show-current)"`.
- Do not pull, rebase, force-push, or retry a rejected push automatically. Inspect the rejection and ask before any history-changing recovery.
- Discover and read the repository PR template, if any.
- Check whether the current branch already has a PR: `gh pr view "$(git branch --show-current)" --json number,isDraft,url`
- If a PR already exists, update that PR in place. Do not create another PR, and do not change whether the existing PR is draft or ready for review.
- If no PR exists, open a new draft PR:
  - With one template: `GH_PROMPT_DISABLED=1 GIT_TERMINAL_PROMPT=0 gh pr create --draft --fill --template "$template" --head "$(git branch --show-current)" --base "$base_branch"`
  - Without a template: `GH_PROMPT_DISABLED=1 GIT_TERMINAL_PROMPT=0 gh pr create --draft --fill --head "$(git branch --show-current)" --base "$base_branch"`
- Edit the PR title and body so they reflect the actual net change in the diff.
- Write the PR description to a temp file with real newlines and pass it via `--body-file` or `gh pr edit --body-file` to avoid `\n`-escaped markdown.

## Determining the PR

When updating a PR created earlier in the flow, infer the PR from the current branch when possible:

```shell
git branch --show-current
gh pr view "$(git branch --show-current)" --json number --jq '.number'
```

If this finds an existing PR, preserve its current review state. Never convert an existing ready-for-review PR back to draft as part of `yeet`; only new PRs created by this flow should start as draft.

## PR Title

Format: `<type>(<scope>): <subject>`

`<scope>` is optional. A scope consists of a noun describing a section of the codebase, such as a component, service, or subsystem.

### Example

```
feat: add hat wobble
^--^  ^------------^
|     |
|     +-> Summary in present tense.
|
+-------> Type: chore, docs, feat, fix, refactor, style, or test.
```

More Examples:

- `feat`: (new feature for the user, not a new feature for build script)
- `fix`: (bug fix for the user, not a fix to a build script)
- `docs`: (changes to the documentation)
- `style`: (formatting, missing semi colons, etc; no production code change)
- `refactor`: (refactoring production code, eg. renaming a variable)
- `test`: (adding missing tests, refactoring tests; no production code change)
- `chore`: (updating grunt tasks etc; no production code change)


## PR Body Contents

When invoked, use `gh` to edit the pull request body and title to reflect the contents of the specified PR. Make sure to check the existing pull request body to see if there is key information that should be preserved. For example, NEVER remove an image in the existing pull request body, as the author may have no way to recover it if you remove it.

When a repository PR template exists, adapt the final PR body to that template. Preserve meaningful headings, required checklists, and repo-specific prompts, but replace placeholder text with net-diff-specific content or `N/A` where the template asks for it. Do not discard template sections just because the fallback shape below is shorter.

It is critically important to explain _why_ the change is being made. If the current conversation in which this skill is invoked has discussed the motivation, be sure to capture this in the pull request body.

The body should also explain _what_ changed, but this should appear after the _why_.

Limit discussion to the branch's _net change_. Do not describe changes that were attempted and later undone. When updating an existing pull request, remove details that are no longer part of the final diff while preserving meaningful user-authored content.

Avoid references to absolute paths on my local disk. When talking about a path that is within the repository, simply use the repo-relative path.

Default to omitting `Verification`. Add it only when you have behavioral evidence worth preserving for reviewers: a reproduced bug, a before/after check, a targeted test that exercises the changed behavior, or a manual scenario with input and observed outcome. Do not use it for generic commands or automation results such as package tests, type checks, linters, formatters, pre-commit/pre-push hooks, or CI status.

If the repository template requires a validation or verification section, keep that section and avoid generic filler: include meaningful commands/results, a targeted manual scenario, or `Not run` with a reason.

Use professional Markdown:

- Put code, paths, commands, flags, and identifiers in backticks.
- Use fenced code blocks for shell transcripts or multi-line examples.
- Use GitHub permalinks when citing existing code relevant to the change.
- Reference relevant issues or related PRs, but do not reference the PR in its own body.

### Suggested PR Body Shape

Use this as a fallback when the repository does not have a PR template:

```markdown
## Why

Describe the user-facing or maintainer-facing problem, including cause and effect where useful.

## What Changed

Describe the net implementation change in concise prose.
```
