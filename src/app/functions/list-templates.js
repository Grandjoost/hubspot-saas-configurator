/**
 * list-templates — debug helper.
 * Returns all quote templates in the portal with their IDs, names, and types.
 * Use this to find the correct HUBSPOT_QUOTE_TEMPLATE_ID for binding a
 * specific CPQ template to the configurator-created quotes.
 */

const axios = require('axios');

exports.main = async () => {
  const token = process.env.PRIVATE_APP_ACCESS_TOKEN;
  if (!token) {
    return {
      statusCode: 200,
      body: { error: 'PRIVATE_APP_ACCESS_TOKEN missing.' },
    };
  }

  try {
    const res = await axios.get(
      'https://api.hubapi.com/crm/v3/objects/quote_templates',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        params: {
          properties: 'hs_type,hs_name,hs_label',
          limit: 50,
        },
        timeout: 10000,
      }
    );
    const templates = (res.data?.results || []).map((t) => ({
      id: t.id,
      name: t.properties?.hs_name || t.properties?.hs_label || '(unnamed)',
      type: t.properties?.hs_type || 'unknown',
    }));
    const defaultTemplateId = process.env.HUBSPOT_QUOTE_TEMPLATE_ID || null;
    return { statusCode: 200, body: { templates, defaultTemplateId } };
  } catch (err) {
    const detail =
      err?.response?.data?.message ||
      err?.message ||
      'Unknown error fetching templates.';
    return { statusCode: 200, body: { error: detail } };
  }
};
