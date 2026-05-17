# HubSpot SaaS Configurator

> An open-source **HubSpot UI Extension** that embeds a guided product configurator on the Deal record. Sales reps walk a 3-step wizard — **plan → add-ons → review** — toggle monthly vs. annual billing, and push a draft CPQ quote into HubSpot with one click.

Built as an open-source reference implementation for a pattern HubSpot itself recommends: customers keep their own configuration UX, HubSpot CPQ takes over for discounting, approvals, governance, and e-signature.

**Maintainer:** [noditch GmbH](https://noditch.de) — joost@noditch.de
**License:** MIT

---

## What's in the box

- **3-step wizard** (Select plan → Add-ons → Review & create) with vertical `StepIndicator`
- **Plan picker** — tile-based, "Most popular" badge, feature bullets per plan
- **Auto-included items** + **compatible add-ons** with `Toggle` + `StepperInput` for quantities
- **Monthly / Annual billing toggle** with configurable discount (10% by default — HubSpot's convention)
- **Quote-template selector** — auto-populates from the portal's CPQ templates, defaults to `HUBSPOT_QUOTE_TEMPLATE_ID` if set
- **One-click draft quote** — creates a `CPQ_QUOTE` with line items, contact, company, seller (deal owner), and template association
- **`recurringbillingfrequency`** is set per line item so the quote shows the correct cadence

## Quick start

### Prerequisites

- Node.js 20+
- [HubSpot CLI](https://developers.hubspot.com/docs/cms/developer-reference/local-development-cli) (`npm i -g @hubspot/cli`), authenticated against a dev portal (`hs auth`)
- A HubSpot portal you can install apps in (developer test or sandbox)
- **Platform version:** built on **Developer Platform 2026.03** (`platformVersion` in [hsproject.json](hsproject.json)) — this is the new project-based platform with `app-function` serverless, not the legacy Private Apps surface.

### 1. Clone & install

```sh
git clone https://github.com/noditch/hubspot-saas-configurator.git
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

1. Go to **Settings → Data Management → Objects → Deals → Customize record**.
2. Pick the view you want (Default view, or a team-specific view).
3. Click **Add cards** on whichever tab you want the configurator to live on (existing or new).
4. Find **"Product Configurator"** under the **App cards** section and toggle it on.
5. **Save**.

(Alternatively, from any deal record, click the **Customize record** action in the top right of the middle column and add the card there.)

### 5. (Optional) Pin a default CPQ template

```sh
hs project secret add HUBSPOT_QUOTE_TEMPLATE_ID
# paste the ID of the CPQ template you want new quotes to use by default
```

You can find the ID by opening the extension after step 4 — the template dropdown lists all CPQ templates in your portal with their IDs. If the secret is unset, the dropdown defaults to the first available template.

### 6. Try it

Open a **Deal record** that has at least one contact associated → the **"Product Configurator"** card appears on the tab you placed it on. Walk the wizard, toggle annual billing if you like, click **"Make a quote in HubSpot"** — a draft Quote opens in the CPQ editor.

> **Note on regions:** the success-state "Open quote" link defaults to `app-eu1.hubspot.com`. If you run on a US portal, change the host to `app.hubspot.com` in [src/app/cards/product-configurator.tsx](src/app/cards/product-configurator.tsx) where the URL is built.

## Customizing the catalog

The wizard reads its data from [src/app/cards/catalog.json](src/app/cards/catalog.json):

- `plans[]` — top-level offerings. Each has `unitPrice` (monthly), `features[]`, `defaultIncludedItemIds`, `compatibleAddOnIds`, optional `recommended: true` for the "Most popular" badge.
- `items[]` — pool of included items + add-ons that plans reference by id. Use `isOneTime: true` for setup/training fees, `isQuantifiable: true` with `min/max/step` for stepper-driven add-ons (e.g. seats).

The React extension reads `catalog.json` at build time, so no other code changes are needed for a simple swap. Bigger ambitions? Replace the import with a call to the HubSpot Products API or a CMS.

## Annual discount

The annual discount is a flat percentage applied to all recurring line items (monthly × 12 × (1 − discount)). One-time items are unaffected.

Configurable in [src/app/cards/components/format.ts](src/app/cards/components/format.ts):

```ts
export const ANNUAL_DISCOUNT = 0.1; // 10%
```

The `(annual)` suffix is appended to each recurring line item's name, and `recurringbillingfrequency = 'annually'` is set on the line item so HubSpot displays the correct cadence.

## How "Make a quote" actually works

1. Extension collects `dealId` from the card context + the configured line items + the billing mode.
2. Calls the `create_quote_function` serverless with `{ dealId, planName, currency, billing, templateId, lineItems[] }`.
3. The function:
   1. Fetches the deal's first **contact** + **company** + **owner** in parallel.
   2. Looks up the owner (becomes `hs_sender_*` on the quote).
   3. Creates each **line item** with explicit `price`, `amount`, `hs_pre_discount_amount`, `hs_total_discount: 0`, `discount: 0`, `hs_position_on_quote`, and (for recurring items) `recurringbillingfrequency`.
   4. Creates the **CPQ quote** with `hs_template_type: 'CPQ_QUOTE'` and a single association payload covering deal, contact, company, template, and all line items.
   5. PATCHes each line item with a no-op `hs_object_source: 'INTEGRATION'` — this triggers HubSpot's net-price recalculation that otherwise only fires when a user opens & saves the row in the quote editor UI.
   6. Returns `{ quoteId }`.
4. Extension builds the editor deep-link from `context.portal.id` + the returned `quoteId` and renders a success state.

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
        │   ├── list-templates.js                 ← fetches CPQ templates for the dropdown
        │   ├── list-templates-hsmeta.json
        │   └── package.json
        └── cards/
            ├── product-configurator-hsmeta.json
            ├── product-configurator.tsx          ← React extension entry
            ├── catalog.json                      ← ← YOUR catalog goes here
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
- **Not** multi-currency-aware out of the box (single currency per catalog).
- **Not** region-detecting — the open-quote deep-link assumes `app-eu1.hubspot.com`. One-line change for US portals.

## Contributing & forking

This is a reference implementation — fork it, adapt it, ship your own. If you build something interesting on top, drop a line at **joost@noditch.de**.

## Acknowledgements

Inspired by HubSpot's push for open-source product configurator demos that Solutions Consultants can show to prospects — and by the new Custom Quote Modules + UI Extensions surfaces that make this kind of integration viable in the first place.

---

**Built by [noditch GmbH](https://noditch.de)** — Knowledge-Transfer-Beratung für Tool-Stacks (HubSpot, Atlassian, custom). Open-source, MIT-licensed.
