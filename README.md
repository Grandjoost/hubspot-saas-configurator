# HubSpot SaaS Configurator

> An open-source **HubSpot UI Extension** that embeds a guided product configurator on the Deal record. Sales reps walk a 3-step wizard — **plan → add-ons → review** — toggle monthly vs. annual billing, and push a draft CPQ quote into HubSpot with one click.

Built as an open-source reference implementation for a pattern HubSpot itself recommends: customers keep their own configuration UX, HubSpot CPQ takes over for discounting, approvals, governance, and e-signature.

**Maintainer:** [noditch GmbH](https://www.noditch.de) — joost@noditch.de
**License:** MIT

---

## What's in the box

- **3-step wizard** (Select plan → Add-ons → Review & create) with vertical `StepIndicator`
- **Plan picker** — tile-based, "Most popular" badge, feature bullets per plan
- **Auto-included items** + **compatible add-ons** with `Toggle` + `StepperInput` for quantities
- **Monthly / Annual billing toggle** with **per-plan** discount (10% / 15% / 20% in the sample catalog, global fallback configurable)
- **Quote-template selector** — auto-populates from the portal's CPQ templates, defaults to `HUBSPOT_QUOTE_TEMPLATE_ID` if set
- **One-click draft quote** — creates a `CPQ_QUOTE` with line items, contact, company, seller (deal owner), and template association
- **`recurringbillingfrequency`** is set per line item so the quote shows the correct cadence
- **Server-side price authority** — the React extension sends only the user's *intent* (plan + add-ons + billing mode); the serverless function rebuilds line items from its own catalog copy, so prices can't be tampered with via browser devtools
- **Region-aware** — the serverless function reads the portal's `uiDomain` from `/account-info/v3/details` and builds the deep-link accordingly (works on EU, NA, AU portals without code changes)
- **Deal currency inheritance** — the quote inherits `deal_currency_code` from the deal when set, falling back to the catalog default

## Quick start

### Prerequisites

- Node.js 20+
- [HubSpot CLI](https://developers.hubspot.com/docs/cms/developer-reference/local-development-cli) (`npm i -g @hubspot/cli`), authenticated against a dev portal (`hs auth`)
- A HubSpot portal you can install apps in (developer test or sandbox)
- **Platform version:** built on **Developer Platform 2026.03** (`platformVersion` in [hsproject.json](hsproject.json)) — this is the new project-based platform with `app-function` serverless, not the legacy Private Apps surface.

### 1. Clone & install

```sh
git clone https://github.com/Grandjoost/hubspot-saas-configurator.git
cd hubspot-saas-configurator
(cd src/app/cards && npm install)
(cd src/app/functions && npm install)
```

### 2. Upload

```sh
hs project upload
```

This deploys the app, the React extension, and two serverless functions. The CRM scopes declared in [src/app/app-hsmeta.json](src/app/app-hsmeta.json) are granted to the app on install — its access token is auto-injected into the serverless functions via `process.env.PRIVATE_APP_ACCESS_TOKEN`. **No separate Private App setup needed.**

### 3. Install the app

Because the app is declared as `distribution: private`, it is installed from the **Development** area of your HubSpot portal — not from Marketplace or Connected-Apps:

1. Open the **Development** menu in HubSpot (the same portal where `hs project upload` deployed to).
2. Go to **Projects → `hubspot-saas-configurator`**.
3. In the component list, click the app UID (`hubspot_saas_configurator_app`).
4. Open the **Distribution** tab.
5. Under **Standard install**, click **Install now** → tick the "authorize installing an unverified app" checkbox → **Connect app**.
6. To install onto a **developer test account** instead, click **Add test install(s)** on the same tab and pick the test account.

Once installed, the app's private-app access token is automatically available to the serverless functions as `PRIVATE_APP_ACCESS_TOKEN`.

### 4. Add the card to the Deal record layout

UI Extension cards are **not** auto-attached to records — you have to place them on a record view yourself:

1. Go to **Settings → Objects → Deals → Record customization**.
2. Pick the view you want (Default view, or a team-specific view).
3. Click the **Add cards** dropdown on the tab where the configurator should live.
4. In the *Card types* panel, click **Apps**, then select **"SaaS Configurator"**.
5. **Save**.

(Alternatively, from any deal record, click **Customize tabs** at the top of the record and add the card from there.)

### 5. (Optional) Pin a default CPQ template

```sh
hs secret add HUBSPOT_QUOTE_TEMPLATE_ID
# paste the ID of the CPQ template you want new quotes to use by default
```

You can find the ID by opening the extension after step 4 — the template dropdown lists all CPQ templates in your portal with their IDs. If the secret is unset, the dropdown defaults to the first available template.

### 6. Try it

Open a **Deal record** that has at least one contact associated → the **"SaaS Configurator"** card appears on the tab you placed it on. Walk the wizard, toggle annual billing if you like, click **"Make a quote in HubSpot"** — a draft Quote opens in the CPQ editor.


## Customizing the catalog

The wizard reads its data from `catalog.json`, which lives in **two places** because HubSpot bundles the card and the function separately and neither bundler accepts imports from outside its own directory:

- [src/app/cards/catalog.json](src/app/cards/catalog.json) — consumed by the React extension for display
- [src/app/functions/catalog.json](src/app/functions/catalog.json) — consumed by the serverless function for the canonical price computation

**Keep them in sync** when changing the catalog. (A CI sync-check is a sensible follow-up PR.)

Shape:

- `plans[]` — top-level offerings. Each has `unitPrice` (monthly), `features[]`, `defaultIncludedItemIds`, `compatibleAddOnIds`, optional `recommended: true` for the "Most popular" badge, optional `annualDiscount` (decimal, e.g. `0.15` for 15%) to override the global default.
- `items[]` — pool of included items + add-ons that plans reference by id. Use `isOneTime: true` for setup/training fees, `isQuantifiable: true` with `min/max/step` for stepper-driven add-ons (e.g. seats).

Bigger ambitions? Replace the JSON import on both sides with a call to the HubSpot Products API or a HubDB table.

## Annual discount

Each plan may carry its own `annualDiscount` (decimal). Plans without one fall back to the global `ANNUAL_DISCOUNT` constant — `0.1` by default — defined in both [src/app/cards/components/format.ts](src/app/cards/components/format.ts) (client, for display) and [src/app/functions/create-quote.js](src/app/functions/create-quote.js) (server, for the line items actually written).

Recurring items in annual mode are priced at `monthly × 12 × (1 − discount)`, the line-item name is suffixed with `(annual)`, and `recurringbillingfrequency = 'annually'` is set so HubSpot displays the correct cadence. One-time items are charged as-is.

## How "Make a quote" actually works

1. Extension collects `dealId` from the card context + the user's *intent*: `{ planId, billing, addOns, templateId }`. No prices, no line items — just the choices.
2. Calls the `create_quote_function` serverless with that payload.
3. The function:
   1. Resolves the plan from its own `catalog.json` and rejects unknown IDs or incompatible add-ons.
   2. Fetches the deal's first **contact**, **company**, **owner**, and `deal_currency_code` plus the portal's `/account-info/v3/details` in parallel.
   3. Looks up the owner (becomes `hs_sender_*` on the quote).
   4. **Rebuilds line items** from catalog + intent, applying the plan-specific (or fallback) annual discount.
   5. Creates each **line item** with explicit `price`, `amount`, `hs_pre_discount_amount`, `hs_total_discount: 0`, `discount: 0`, `hs_position_on_quote`, and (for recurring items) `recurringbillingfrequency`.
   6. Creates the **CPQ quote** with `hs_template_type: 'CPQ_QUOTE'`, `hs_currency` from the deal, and a single association payload covering deal, contact, company, template, and all line items.
   7. PATCHes each line item with a no-op `hs_object_source: 'INTEGRATION'` — this triggers HubSpot's net-price recalculation that otherwise only fires when a user opens & saves the row in the quote editor UI.
   8. Builds a region-aware deep-link from the portal's `uiDomain` and returns `{ quoteId, quoteUrl }`.
4. Extension renders a success state with the link.

From there, the sales rep takes over in the native CPQ editor: tweak discounts, add signatures, route for approval, send.

## Project structure

```
hubspot-saas-configurator/
├── hsproject.json
├── README.md
├── LICENSE
└── src/
    └── app/
        ├── app-hsmeta.json                       ← app config (scopes, distribution)
        ├── functions/
        │   ├── create-quote.js                   ← creates the CPQ quote + line items
        │   ├── create-quote-hsmeta.json          ← declares secret keys
        │   ├── catalog.json                      ← server-side copy (must match cards/catalog.json)
        │   ├── list-templates.js                 ← fetches CPQ templates for the dropdown
        │   ├── list-templates-hsmeta.json
        │   └── package.json
        └── cards/
            ├── product-configurator-hsmeta.json
            ├── product-configurator.tsx          ← React extension entry
            ├── catalog.json                      ← client-side copy (must match functions/catalog.json)
            ├── package.json
            └── components/
                ├── PlanPicker.tsx
                ├── IncludedItemsList.tsx
                ├── AddOnPicker.tsx
                ├── OrderSummary.tsx
                ├── SuccessState.tsx
                ├── format.ts                     ← ANNUAL_DISCOUNT lives here
                └── types.ts
```

## Scopes

Declared in [src/app/app-hsmeta.json](src/app/app-hsmeta.json):

- `crm.objects.deals.read` — load the deal the card is attached to
- `crm.objects.contacts.read`, `crm.objects.companies.read` — find the deal's primary contact + company
- `crm.objects.owners.read` — resolve the deal owner → seller on the quote
- `crm.objects.quotes.read|write` — create the quote
- `crm.objects.line_items.read|write` — create + recalc line items

## What this is not

- **Not** a replacement for HubSpot CPQ — it's an *entry point* into HubSpot Quotes.
- **Not** a generic product catalog management system — `catalog.json` is a static config file by design.
- **Not** a full multi-currency story — the deal currency is honored when set, but the catalog itself is single-currency. Multi-currency pricing tables are a fork-and-extend exercise.

## Contributing & forking

This is a reference implementation — fork it, adapt it, ship your own. If you build something interesting on top, drop a line at **joost@noditch.de**.

## Acknowledgements

Inspired by HubSpot's push for open-source product configurator demos that Solutions Consultants can show to prospects — and by the new Custom Quote Modules + UI Extensions surfaces that make this kind of integration viable in the first place.

---

**Built by [noditch GmbH](https://www.noditch.de)** — Knowledge-Transfer-Beratung für Tool-Stacks (HubSpot, Atlassian, custom). Open-source, MIT-licensed.
