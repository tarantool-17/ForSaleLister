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

## Publish changes

The repo-scoped `$yeet` skill completes the Git publication workflow in one invocation while keeping unrelated worktree changes out:

```text
Use $yeet to split the intended changes into small coherent commits, push this branch, and open a draft PR against the repository's integration branch.
```

## Status

Repository skill MVP implemented. Marketplace availability still depends on the user's installed connectors or an accessible signed-in browser session.
