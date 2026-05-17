/**
 * create-quote — UI-Extension serverless function.
 *
 * Creates a DRAFT HubSpot CPQ Quote tied to the current Deal, populated
 * with the line items configured in the React extension.
 *
 * Implementation note: line items are created FIRST (no associations),
 * then the quote is created with ALL associations (deal, contact,
 * company, template, line items) in a single request. This matches the
 * pattern in HubSpot's CPQ docs and avoids template tier-pricing logic
 * overriding the line item prices.
 */

const axios = require('axios');

const HS_API = 'https://api.hubapi.com';

// HUBSPOT_DEFINED association type IDs — from the quote's perspective
// (FROM = quote = 0-14)
const ASSOC = {
  QUOTE_TO_DEAL: 64,
  QUOTE_TO_LINE_ITEM: 67,
  QUOTE_TO_CONTACT: 69,
  QUOTE_TO_COMPANY: 71,
  QUOTE_TO_TEMPLATE: 286,
};

exports.main = async (context = {}) => {
  const { dealId, planName, currency, lineItems, templateId, billing } =
    context.parameters || {};
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
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return { statusCode: 200, body: { error: 'Parameter "lineItems" is empty.' } };
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const api = axios.create({ baseURL: HS_API, headers, timeout: 20000 });

  try {
    // 0. Pull deal context: first contact + company + owner
    const [contactAssoc, companyAssoc, dealRes] = await Promise.all([
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
          `/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=hubspot_owner_id`
        )
        .catch(() => null),
    ]);
    const contactId = contactAssoc?.data?.results?.[0]?.toObjectId
      ? String(contactAssoc.data.results[0].toObjectId)
      : null;
    const companyId = companyAssoc?.data?.results?.[0]?.toObjectId
      ? String(companyAssoc.data.results[0].toObjectId)
      : null;
    const ownerId = dealRes?.data?.properties?.hubspot_owner_id || null;

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

    // 1. Create each line item WITHOUT associations.
    // We pass: explicit price+quantity, computed amount (net price),
    // hs_position_on_quote (1-based, stable ordering), and zero-discount
    // fields so HubSpot doesn't fall back to "calculated" defaults.
    const lineItemIds = [];
    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i];
      const unitPrice = Number(li.unitPrice ?? 0);
      const quantity = Number(li.quantity ?? 1);
      const total = unitPrice * quantity;
      const properties = {
        name: String(li.name || '').slice(0, 200),
        description: String(li.description || '').slice(0, 1000),
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

    // 2. Create the CPQ Quote with ALL associations in one request.
    const today = new Date();
    const expiration = new Date(today);
    expiration.setDate(expiration.getDate() + 30);
    const safePlan = (planName || 'SaaS bundle').slice(0, 80);
    const isoDate = today.toISOString().slice(0, 10);

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
      // All line items as associations FROM the quote
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
        hs_currency: currency || 'USD',
        hs_language: 'en',
        hs_locale: 'en-US',
        ...senderProps,
      },
      associations,
    });
    const quoteId = quoteRes.data.id;

    // 3. Touch each line item with a no-op PATCH. This is the documented
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

    return {
      statusCode: 200,
      body: { quoteId: String(quoteId) },
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
