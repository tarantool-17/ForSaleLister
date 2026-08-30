---
name: for-sale-lister
description: Turn product photos into researched, reviewable marketplace listings and, after explicit approval, publish them through available marketplace connectors or a signed-in browser. Use when a user wants to identify an item from images, research its market, write platform-specific sale copy, or list it for sale; do not use for general image analysis or buying products.
---

# For Sale Lister

Turn one product photo set into truthful, evidence-backed listing drafts. Publish only the exact packet the user approves.

## Choose the mode

- **Prepare** is the default: inspect photos, identify and research the item, ask for missing seller facts, and draft listings.
- **Publish** applies when the user wants listings created on external platforms. Complete the Prepare mode first, then pass the approval gate below.
- If the request contains photos of multiple products, separate them into distinct listing packets. Confirm ambiguous groupings before continuing.

## Prepare the listing packet

1. Require at least one usable product photo. Inspect every supplied image, including labels, model numbers, serial-number areas, accessories, packaging, wear, and damage. If none is usable, pause and request clear overall, identifier or label, included-contents, and defect photos before identifying, researching, or drafting.
2. Separate facts directly visible in the photos from hypotheses. Give the proposed identity a confidence level and explain the evidence. Do not claim an exact model, material, authenticity, working state, or included accessory from visual similarity alone.
3. Search the current web using the strongest visible identifiers. Prefer manufacturer documentation for specifications and distinguish sold-price evidence from active asking prices. Record the URL, access date, and claim supported by every consequential source. If live research is unavailable, say so and do not invent a market price.
4. Ask one compact batch of questions for seller-only or unresolved facts that materially affect the listing. Cover, when relevant:
   - exact identity or variant;
   - ownership, authenticity, or provenance claims;
   - tested state, operation, wear, defects, repairs, odors, and missing parts;
   - included accessories and quantity;
   - target marketplaces and seller account when more than one is available;
   - price, currency, negotiability, and any private minimum price;
   - general location and pickup/shipping preferences, parcel size, and weight.
5. Build the canonical packet described in [references/listing-packet.md](references/listing-packet.md). Preserve unknown values as unknown; never turn them into positive claims.
6. For each target marketplace, verify its current categories, required fields, title or description limits, condition choices, restricted-item rules, and fulfillment options using first-party help or the live form. Adapt the canonical facts without changing them between platforms.
7. Recommend a price range only when supported by relevant comparables. Explain the evidence and let the seller choose the final price. Keep a private minimum price out of public copy.

## Approval gate

Before any final publish, submit, activate, or list action:

1. Resolve every material or platform-required field before requesting or accepting publication approval. An unknown fact may remain only when the exact truthful disclosure, such as `untested`, is valid for the platform and shown to the user.
2. Show the user a compact review containing the proposed identity and confidence, unresolved warnings, source links, and the exact category, title, condition, description, public price, currency, and fulfillment terms for every named platform.
3. Ask for explicit approval to publish that reviewed version to those named platforms. One approval may cover several platforms when all material terms are shown.
4. If any material field changes after approval, show the change and obtain approval again.
5. Do not publish when the item may be prohibited, recalled, counterfeit, unlawfully sold, or materially misrepresented. Explain the concern and stop or request the evidence needed to resolve it.

Preparing text or a local packet is not authorization to mutate an external account. A general request to build or test this skill is not approval to publish a real listing.

## Publish to marketplaces

Read [references/publishing.md](references/publishing.md) before making external changes.

1. Prefer an available purpose-built marketplace connector or API. Otherwise use a signed-in browser session. Never ask the user to paste a password or export authentication secrets.
2. Re-check the approved packet against the live form. Use only approved facts and the supplied photos; do not silently accept platform-generated claims or substitutions.
3. Save as a draft when the user requested a draft. Click the final publication control only when the approval explicitly covers publication.
4. Submit at most once per platform until the outcome is known. On an error or timeout, inspect the seller's listings or drafts before retrying so an ambiguous success cannot create a duplicate. If reconciliation remains inconclusive, record `outcome_unknown` and do not retry.
5. Stop for CAPTCHA, MFA, identity checks, legal attestations, unexpected fees, policy acknowledgements, or a required seller fact that is not in the packet. Tell the user exactly what they need to complete or decide.
6. Capture the resulting listing ID, public or draft URL, status, and any platform warning.

## Report completion

Return one row per platform with `published`, `drafted`, `blocked`, `failed`, or `outcome_unknown`, plus its listing ID or URL when available. Distinguish actions actually completed from drafts merely prepared in the conversation, and list any remaining user action. `outcome_unknown` means a final action may have succeeded but could not be reconciled, so retry remains prohibited.
