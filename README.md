# ForSaleLister

ForSaleLister is a Codex-first assistant that turns product photos into researched, reviewable Russian-language for-sale listings and can publish an approved version through available marketplace tools.

The initial version runs as the repo-scoped `$for-sale-lister` skill inside Codex. It:

- inspects product photos and separates visible evidence from uncertain identification;
- researches specifications and Belarus-only comparable prices on the current web;
- communicates with the seller and writes every listing in Russian;
- asks a compact set of seller-only questions;
- creates a canonical listing packet and marketplace-specific variants;
- requires review of the exact copy, price, and fulfillment terms before publishing;
- uses a marketplace connector when available or a signed-in browser as a fallback;
- stops for CAPTCHA, MFA, identity/legal attestations, or ambiguous submission results.

## Use

Attach one or more photos and ask:

```text
Используй $for-sale-lister, чтобы определить товар, изучить цены в Беларуси и подготовить объявления на русском языке для выбранных площадок.
```

Codex discovers the skill from `.agents/skills/for-sale-lister`. Preparing a listing does not authorize an external post. Before publication, the skill shows the final material terms for every target platform and asks for explicit approval.

## Onliner publishing tool

The repository now includes a guarded local MCP server for Onliner Baraholka in
[`mcp/onliner`](mcp/onliner). It uses a persistent local browser profile, discovers the live category
tree, validates the current posting form, uploads photos through the page, and submits an exact
approved listing at most once.

Install its dependencies once:

```sh
cd mcp/onliner
npm install
```

The project-scoped [`.codex/config.toml`](.codex/config.toml) enables the STDIO server for trusted
Codex sessions in this repository. Restart MCP servers or open a new task after installation. Verify
the registration with:

```sh
codex mcp list
```

Use the tools in order:

1. `onliner_auth_status`; if needed, `onliner_start_login` and complete login/MFA manually.
2. `onliner_find_categories` with the product identity and, when useful, a Russian category hint.
3. `onliner_find_regions` with the selected category, then use its exact `value` and `label`.
4. `onliner_preview_listing` with the exact category, public terms, and local photo paths.
5. Show `exact_listing` to the seller and obtain explicit approval.
6. Call `onliner_publish_listing` once with the returned `approval_id` and required confirmation.

Browser cookies, approval packets, and the attempt ledger are stored outside the repository under
`~/.forsalelister/onliner` by default. Override the browser binary, profile, or state location with
`ONLINER_BROWSER_EXECUTABLE`, `ONLINER_BROWSER_PROFILE`, or `ONLINER_STATE_DIR`. Never point the tool
at a copied personal Chrome profile while Chrome is running.

The HAR-derived request flow and safety decisions are documented in
[`docs/onliner-har-analysis.md`](docs/onliner-har-analysis.md). This is browser automation over an
undocumented web form, not an official Onliner API, so selectors may need maintenance when the site
changes.

Run the local checks with:

```sh
cd mcp/onliner
npm run check
npm test
```

## Publish changes

The repo-scoped `$yeet` skill completes the Git publication workflow in one invocation while keeping unrelated worktree changes out:

```text
Use $yeet to split the intended changes into small coherent commits, push this branch, and open a draft PR against the repository's integration branch.
```

## Status

Repository skill MVP implemented. Marketplace availability still depends on the user's installed connectors or an accessible signed-in browser session.
