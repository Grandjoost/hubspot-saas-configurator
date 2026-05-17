/**
 * create-quote — UI-Extension serverless function.
 *
 * Creates a DRAFT HubSpot CPQ Quote tied to the current Deal, populated
 * with line items rebuilt from the shared catalog. The client sends
 * INTENT only ({ planId, billing, addOns }) — never prices — so a user
 * can't tamper with figures via browser devtools.
 *
 * Flow:
 *   1. Load deal context (contact, company, owner, currency) + account info
 *      (uiDomain → region-aware deep-link).
 *   2. Build line items from catalog.json + intent. Apply per-plan annual
 *      discount with global fallback.
 *   3. Create line items, then the CPQ quote with all associations.
 *   4. No-op PATCH on each line item to trigger HubSpot's net-price recalc.
 */

const axios = require('axios');

// NOTE: this catalog must stay in sync with src/app/cards/catalog.json.
// HubSpot's function bundler ships ONLY the entrypoint file plus
// node_modules — adjacent .json or .js files referenced via require()
// are not bundled and fail at runtime with "Cannot find module". So the
// canonical price authority is inlined here verbatim. A CI sync-check
// between this object and cards/catalog.json is the right follow-up.
const catalog = {
  currency: 'USD',
  plans: [
    {
      id: 'hub-starter',
      name: 'Marketing Hub Starter',
      description: 'Get started with email marketing and basic automation.',
      unitPrice: 50,
      isOneTime: false,
      annualDiscount: 0.10,
      defaultIncludedItemIds: ['seats-included-1', 'contacts-tier-1k', 'onboarding-essentials'],
      compatibleAddOnIds: ['seats-extra', 'contacts-tier-up-2k', 'contacts-tier-up-5k', 'support-standard'],
    },
    {
      id: 'hub-professional',
      name: 'Marketing Hub Professional',
      description: 'Advanced automation and multi-language content for scaling teams.',
      unitPrice: 890,
      isOneTime: false,
      recommended: true,
      annualDiscount: 0.15,
      defaultIncludedItemIds: ['seats-included-3', 'contacts-tier-2k', 'onboarding-professional'],
      compatibleAddOnIds: [
        'seats-extra',
        'contacts-tier-up-5k',
        'contacts-tier-up-10k',
        'support-standard',
        'support-premium',
        'training-power-user',
      ],
    },
    {
      id: 'hub-enterprise',
      name: 'Marketing Hub Enterprise',
      description: 'Custom objects, AI features, and dedicated CSM for enterprises.',
      unitPrice: 3300,
      isOneTime: false,
      annualDiscount: 0.20,
      defaultIncludedItemIds: ['seats-included-5', 'contacts-tier-10k', 'onboarding-enterprise', 'csm-dedicated'],
      compatibleAddOnIds: [
        'seats-extra',
        'contacts-tier-up-25k',
        'contacts-tier-up-50k',
        'support-premium',
        'training-power-user',
        'training-admin',
        'sso',
      ],
    },
  ],
  items: [
    { id: 'seats-included-1', name: '1 Core Seat', description: 'Sales seat included in the plan', unitPrice: 0, isOneTime: false },
    { id: 'seats-included-3', name: '3 Core Seats', description: 'Sales seats included in the plan', unitPrice: 0, isOneTime: false },
    { id: 'seats-included-5', name: '5 Core Seats', description: 'Sales seats included in the plan', unitPrice: 0, isOneTime: false },
    { id: 'seats-extra', name: 'Additional Core Seat', description: 'Per additional user', unitPrice: 45, isOneTime: false, isQuantifiable: true, minQty: 1, maxQty: 50, step: 1 },
    { id: 'contacts-tier-1k', name: '1,000 marketing contacts', description: 'Plan default allocation', unitPrice: 0, isOneTime: false },
    { id: 'contacts-tier-2k', name: '2,000 marketing contacts', description: 'Plan default allocation', unitPrice: 0, isOneTime: false },
    { id: 'contacts-tier-10k', name: '10,000 marketing contacts', description: 'Plan default allocation', unitPrice: 0, isOneTime: false },
    { id: 'contacts-tier-up-2k', name: '+2,000 Contacts', description: 'Extends the contact allocation', unitPrice: 50, isOneTime: false },
    { id: 'contacts-tier-up-5k', name: '+5,000 Contacts', description: 'Extends the contact allocation', unitPrice: 110, isOneTime: false },
    { id: 'contacts-tier-up-10k', name: '+10,000 Contacts', description: 'Extends the contact allocation', unitPrice: 200, isOneTime: false },
    { id: 'contacts-tier-up-25k', name: '+25,000 Contacts', description: 'Extends the contact allocation', unitPrice: 450, isOneTime: false },
    { id: 'contacts-tier-up-50k', name: '+50,000 Contacts', description: 'Extends the contact allocation', unitPrice: 850, isOneTime: false },
    { id: 'onboarding-essentials', name: 'Essentials Onboarding', description: 'One-time, 2 weeks', unitPrice: 250, isOneTime: true },
    { id: 'onboarding-professional', name: 'Professional Onboarding', description: 'One-time, 4–6 weeks', unitPrice: 3000, isOneTime: true },
    { id: 'onboarding-enterprise', name: 'Enterprise Onboarding', description: 'One-time, 8–12 weeks, dedicated PM', unitPrice: 7500, isOneTime: true },
    { id: 'csm-dedicated', name: 'Dedicated Customer Success Manager', description: 'Included with the Enterprise plan', unitPrice: 0, isOneTime: false },
    { id: 'support-standard', name: 'Standard Support', description: '24/5 chat support', unitPrice: 0, isOneTime: false },
    { id: 'support-premium', name: 'Premium Support', description: '24/7 phone + chat', unitPrice: 800, isOneTime: false },
    { id: 'training-power-user', name: 'Power-User Training', description: 'Half-day live session', unitPrice: 1500, isOneTime: true, isQuantifiable: true, minQty: 1, maxQty: 10, step: 1 },
    { id: 'training-admin', name: 'Admin Training', description: 'Full-day live session for admins', unitPrice: 2800, isOneTime: true },
    { id: 'sso', name: 'Single Sign-On (SSO)', description: 'SAML 2.0 integration', unitPrice: 600, isOneTime: false },
  ],
};

const HS_API = 'https://api.hubapi.com';

// Global fallback annual-billing discount; matches ANNUAL_DISCOUNT in
// cards/components/format.ts. Per-plan `annualDiscount` (in catalog.json)
// overrides this.
const ANNUAL_DISCOUNT = 0.1;

// HUBSPOT_DEFINED association type IDs — from the quote's perspective
// (FROM = quote = 0-14)
const ASSOC = {
  QUOTE_TO_DEAL: 64,
  QUOTE_TO_LINE_ITEM: 67,
  QUOTE_TO_CONTACT: 69,
  QUOTE_TO_COMPANY: 71,
  QUOTE_TO_TEMPLATE: 286,
};

function effectivePrice(unitPrice, isOneTime, billing, planDiscount) {
  if (isOneTime) return unitPrice;
  if (billing === 'annual') {
    const discount = typeof planDiscount === 'number' ? planDiscount : ANNUAL_DISCOUNT;
    return Math.round(unitPrice * 12 * (1 - discount));
  }
  return unitPrice;
}

function annualName(name, isOneTime, billing) {
  if (isOneTime || billing === 'monthly') return name;
  return `${name} (annual)`;
}

function lookupItem(id) {
  return catalog.items.find((it) => it.id === id);
}

function buildLineItems(plan, billing, addOns) {
  const discount = plan.annualDiscount;
  const items = [];

  const planUnit = effectivePrice(plan.unitPrice, plan.isOneTime, billing, discount);
  items.push({
    name: annualName(plan.name, plan.isOneTime, billing),
    description: plan.description || '',
    unitPrice: planUnit,
    quantity: 1,
    isOneTime: plan.isOneTime,
  });

  for (const id of plan.defaultIncludedItemIds || []) {
    const it = lookupItem(id);
    if (!it) continue;
    const unit = effectivePrice(it.unitPrice, it.isOneTime, billing, discount);
    items.push({
      name: annualName(it.name, it.isOneTime, billing),
      description: it.description || '',
      unitPrice: unit,
      quantity: 1,
      isOneTime: it.isOneTime,
    });
  }

  const compatible = new Set(plan.compatibleAddOnIds || []);
  for (const [itemId, rawQty] of Object.entries(addOns || {})) {
    const qty = Number(rawQty);
    if (!qty || qty <= 0) continue;
    // Reject incompatible add-ons — defence in depth.
    if (!compatible.has(itemId)) continue;
    const it = lookupItem(itemId);
    if (!it) continue;
    const clampedQty = Math.min(
      Math.max(qty, it.minQty ?? 1),
      it.maxQty ?? 999
    );
    const unit = effectivePrice(it.unitPrice, it.isOneTime, billing, discount);
    items.push({
      name: annualName(it.name, it.isOneTime, billing),
      description: it.description || '',
      unitPrice: unit,
      quantity: clampedQty,
      isOneTime: it.isOneTime,
    });
  }

  return items;
}

exports.main = async (context = {}) => {
  const { dealId, planId, billing, addOns, templateId } = context.parameters || {};
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN;
  const recurringFrequency = billing === 'annual' ? 'annually' : 'monthly';

  if (!token) {
    return {
      statusCode: 200,
      body: {
        error:
          'PRIVATE_APP_ACCESS_TOKEN is not available. Is the app installed with the required scopes?',
      },
    };
  }
  if (!dealId) {
    return { statusCode: 200, body: { error: 'Parameter "dealId" is missing.' } };
  }

  const plan = catalog.plans.find((p) => p.id === planId);
  if (!plan) {
    return {
      statusCode: 200,
      body: { error: `Unknown planId "${planId}".` },
    };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const api = axios.create({ baseURL: HS_API, headers, timeout: 20000 });

  try {
    // 0. Build line items from catalog + intent.
    const lineItems = buildLineItems(plan, billing, addOns);
    if (lineItems.length === 0) {
      return {
        statusCode: 200,
        body: { error: 'No line items resolved from the given plan/add-ons.' },
      };
    }

    // 1. Pull deal context + account info in parallel.
    const [contactAssoc, companyAssoc, dealRes, accountRes] = await Promise.all([
      api
        .get(
          `/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/contacts?limit=1`
        )
        .catch(() => null),
      api
        .get(
          `/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/companies?limit=1`
        )
        .catch(() => null),
      api
        .get(
          `/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=hubspot_owner_id,deal_currency_code`
        )
        .catch(() => null),
      api.get('/account-info/v3/details').catch(() => null),
    ]);
    const contactId = contactAssoc?.data?.results?.[0]?.toObjectId
      ? String(contactAssoc.data.results[0].toObjectId)
      : null;
    const companyId = companyAssoc?.data?.results?.[0]?.toObjectId
      ? String(companyAssoc.data.results[0].toObjectId)
      : null;
    const ownerId = dealRes?.data?.properties?.hubspot_owner_id || null;
    const dealCurrency = dealRes?.data?.properties?.deal_currency_code || null;

    const account = accountRes?.data || {};
    // uiDomain: "app-eu1.hubspot.com" (EU), "app.hubspot.com" (NA), etc.
    const uiDomain = account.uiDomain || 'app.hubspot.com';
    const portalId = account.portalId || null;

    if (!contactId) {
      return {
        statusCode: 200,
        body: {
          error:
            'CPQ quotes require at least one contact associated with the deal. Add a contact to the deal and try again.',
        },
      };
    }

    // Fetch deal owner → becomes the "Seller" on the quote
    let senderProps = {};
    if (ownerId) {
      try {
        const ownerRes = await api.get(
          `/crm/v3/owners/${encodeURIComponent(ownerId)}`
        );
        const o = ownerRes?.data || {};
        senderProps = {
          hs_sender_firstname: o.firstName || '',
          hs_sender_lastname: o.lastName || '',
          hs_sender_email: o.email || '',
        };
      } catch {
        // non-fatal
      }
    }

    // 2. Create each line item WITHOUT associations.
    // explicit price+quantity, computed amount, hs_position_on_quote
    // (1-based), zero-discount fields so HubSpot doesn't fall back to
    // "calculated" defaults.
    const lineItemIds = [];
    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i];
      const unitPrice = Number(li.unitPrice);
      const quantity = Number(li.quantity);
      const total = unitPrice * quantity;
      const properties = {
        name: String(li.name).slice(0, 200),
        description: String(li.description).slice(0, 1000),
        price: unitPrice,
        quantity: quantity,
        amount: total,
        hs_pre_discount_amount: total,
        hs_total_discount: 0,
        discount: 0,
        hs_position_on_quote: i + 1,
      };
      // Recurring items carry an explicit billing frequency so the quote
      // shows "annually" / "monthly" next to each line. One-time items get
      // no frequency. We deliberately omit hs_term_in_months — it triggers
      // HubSpot's tier-pricing recalculation, which can override the
      // explicit price we just set.
      if (!li.isOneTime) {
        properties.recurringbillingfrequency = recurringFrequency;
      }
      const liRes = await api.post('/crm/v3/objects/line_items', {
        properties,
      });
      lineItemIds.push(String(liRes.data.id));
    }

    // 3. Create the CPQ Quote with ALL associations in one request.
    const today = new Date();
    const expiration = new Date(today);
    expiration.setDate(expiration.getDate() + 30);
    const safePlan = plan.name.slice(0, 80);
    const isoDate = today.toISOString().slice(0, 10);
    // Currency precedence: deal currency → catalog default → USD.
    const quoteCurrency = dealCurrency || catalog.currency || 'USD';

    const associations = [
      {
        to: { id: String(dealId) },
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: ASSOC.QUOTE_TO_DEAL,
          },
        ],
      },
      {
        to: { id: contactId },
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: ASSOC.QUOTE_TO_CONTACT,
          },
        ],
      },
      ...(companyId
        ? [
            {
              to: { id: companyId },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: ASSOC.QUOTE_TO_COMPANY,
                },
              ],
            },
          ]
        : []),
      ...((templateId || process.env.HUBSPOT_QUOTE_TEMPLATE_ID)
        ? [
            {
              to: {
                id: String(templateId || process.env.HUBSPOT_QUOTE_TEMPLATE_ID),
              },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: ASSOC.QUOTE_TO_TEMPLATE,
                },
              ],
            },
          ]
        : []),
      ...lineItemIds.map((id) => ({
        to: { id },
        types: [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: ASSOC.QUOTE_TO_LINE_ITEM,
          },
        ],
      })),
    ];

    const quoteRes = await api.post('/crm/v3/objects/quotes', {
      properties: {
        hs_title: `${safePlan} — ${isoDate}`,
        hs_template_type: 'CPQ_QUOTE',
        hs_expiration_date: expiration.toISOString(),
        hs_currency: quoteCurrency,
        hs_language: 'en',
        hs_locale: 'en-US',
        ...senderProps,
      },
      associations,
    });
    const quoteId = quoteRes.data.id;

    // 4. Touch each line item with a no-op PATCH. This is the documented
    // workaround for HubSpot's CPQ engine not auto-calculating net prices
    // on API-created line items — a write-trigger fires the recalc that
    // would otherwise only happen when a user opens & saves the row in the
    // quote editor UI.
    await Promise.all(
      lineItemIds.map((id) =>
        api
          .patch(`/crm/v3/objects/line_items/${encodeURIComponent(id)}`, {
            properties: { hs_object_source: 'INTEGRATION' },
          })
          .catch(() => null)
      )
    );

    // 5. Build region-aware deep-link to the CPQ editor.
    const quoteUrl = portalId
      ? `https://${uiDomain}/quote/${portalId}/editor/${quoteId}/content`
      : `https://${uiDomain}/l/quote/${quoteId}`;

    return {
      statusCode: 200,
      body: { quoteId: String(quoteId), quoteUrl },
    };
  } catch (err) {
    const detail =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      'Unknown error while creating the quote.';
    return { statusCode: 200, body: { error: detail } };
  }
};
