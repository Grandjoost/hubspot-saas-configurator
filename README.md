# HubSpot SaaS Configurator

> An open-source **HubSpot UI Extension** that embeds a guided product configurator on the Deal record. Sales reps pick a top-level plan, see auto-included items + compatible add-ons, and click **"Make a Quote"** to push a draft into HubSpot Quotes with one click.

Built as a reference implementation for the pattern Ethan from HubSpot described: customers keep their own configuration UX, HubSpot CPQ takes over for discounting, approvals, and governance.

**Maintainer:** [noditch GmbH](https://noditch.de) — joost@noditch.de
**Repo:** https://github.com/noditch/hubspot-saas-configurator (upcoming)
**License:** MIT

---

## What it does

```
┌─────────────────────────────────────────────────────────┐
│  HubSpot Deal Record                                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │  SaaS Configurator (this UI Extension)            │  │
│  │  ┌─────────┬─────────┬─────────┐                  │  │
│  │  │ Starter │  Pro    │  Ent    │  ← Plan picker   │  │
│  │  └─────────┴─────────┴─────────┘                  │  │
│  │  ✓ 5 Seats (included)                              │  │
│  │  ✓ 10k Contacts (included)                         │  │
│  │  ☐ +25k Contacts  +110 €/mo                        │  │
│  │  ☐ Premium Support  +800 €/mo                      │  │
│  │  ─────────────────────────────────                 │  │
│  │  [ Draft-Quote in HubSpot erstellen ]              │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓ on click
            POST /app.functions/create-quote
                          ↓
            HubSpot Quotes API (server-side)
                          ↓
       Draft Quote + Line Items, associated to Deal
```

## Sample catalog

The repo ships with a sample SaaS catalog modeled on Marketing Hub tiers (`Starter` / `Professional` / `Enterprise`) — three plans, default-included items, compatible add-ons. **Prices are illustrative; replace with your own SKUs in `catalog.json`.**

## Quick start (5 minutes)

### 1. Prerequisites

- Node.js 20+
- [HubSpot CLI](https://developers.hubspot.com/docs/cms/developer-reference/local-development-cli) installed and authenticated (`hs auth`)
- A HubSpot portal where you have **app developer** access

### 2. Clone & install

```sh
git clone https://github.com/noditch/hubspot-saas-configurator.git
cd hubspot-saas-configurator
(cd src/app/cards && npm install)
(cd src/app/app.functions && npm install)
```

### 3. Upload the project

```sh
hs project upload --force-create
```

This deploys the app + UI Extension to your portal. The CRM scopes declared in `app-hsmeta.json` are automatically granted to the app on install — its access token is exposed to the serverless function via `process.env.PRIVATE_APP_ACCESS_TOKEN`. **No separate Private App setup needed.**

### 4. (Optional) Set portal ID for deep-linking

```sh
hs secrets add HUBSPOT_PORTAL_ID
# paste your portal ID (e.g. 12345678) — used to build the deep-link back to the new quote.
# Optional: if omitted, a generic /l/quote/{id} redirect URL is used instead.
```

### 5. Install the app

In HubSpot: **Settings → Integrations → Connected Apps → [your app]** → Install on yourself (since it's a `distribution: private` app).

### 6. Try it

Open any **Deal record** → the **"SaaS Configurator"** card appears as a tab. Pick a plan, add some add-ons, click **"Make a quote in HubSpot"**. A draft Quote appears in HubSpot Quotes, associated with the deal.

## Customizing for your catalog

Open `src/app/cards/catalog.json` and replace:

- `plans[]` — your top-level offerings (e.g. service tiers, license bundles, contract sizes)
- `items[]` — included items + add-ons that plans can reference by id
- For each plan, set `defaultIncludedItemIds` (auto-added on select) and `compatibleAddOnIds` (which add-ons can be added to this plan)

The React extension reads `catalog.json` at build time, so no other code changes are needed for a simple swap.

## Project structure

```
hubspot-saas-configurator/
├── hsproject.json
├── README.md
├── LICENSE
└── src/
    └── app/
        ├── app-hsmeta.json                  ← app config (scopes, distribution)
        ├── app.functions/
        │   ├── create-quote.js              ← serverless: creates Quote + line items
        │   └── package.json
        └── cards/
            ├── product-configurator-hsmeta.json
            ├── product-configurator.tsx     ← React extension entry
            ├── catalog.json                 ← <-- YOUR catalog goes here
            ├── package.json
            └── components/
                ├── PlanPicker.tsx
                ├── IncludedItemsList.tsx
                ├── AddOnPicker.tsx
                ├── OrderSummary.tsx
                ├── SuccessState.tsx
                ├── format.ts
                └── types.ts
```

## How "Make a Quote" actually works

1. Extension collects `dealId` from the card context + the configured line items.
2. Calls the `create-quote` serverless function with `{ dealId, planName, currency, lineItems[] }`.
3. The function:
   1. `POST /crm/v3/objects/quotes` — creates a DRAFT quote, associated to the deal.
   2. For each line item: `POST /crm/v3/objects/line_items` — creates the line item with associations to both the new quote and the deal.
   3. Returns `{ quoteId, quoteUrl }`.
4. Extension renders a success state with a deep-link to the new quote.

From there, the sales rep takes over in HubSpot's native quote editor: apply discounts, configure approvals, send for signature, etc.

## What this is not

- **Not** a replacement for HubSpot CPQ — it's an *entry point* into HubSpot Quotes.
- **Not** a generic product catalog management system — `catalog.json` is a static config file by design (swap to HubSpot Products API or a CMS if needed).
- **Not** multi-currency-aware out of the box (single currency per catalog).

## Contributing & forking

This is a reference implementation — fork it, adapt it, ship your own. If you build something interesting on top, drop us a line at **joost@noditch.de**.

## Acknowledgements

This project was inspired by [Ethan from HubSpot's](https://hubspot.com) call for open-source product configurator demos that HubSpot's Solutions Consultants can show to enterprise prospects.

---

**Built by [noditch GmbH](https://noditch.de)** — Knowledge-Transfer-Beratung für Toolstacks (HubSpot, Atlassian, custom systems). Open-source, MIT-licensed.
