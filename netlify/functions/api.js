/**
 * Netlify serverless proxy for Open Electricity API.
 * Rewrites /api/* to this function; we forward to api.openelectricity.org.au
 * so the "This Week" live data works without CORS.
 *
 * Set OE_API_KEY in Netlify: Site settings → Environment variables.
 */

const OE_BASE = 'https://api.openelectricity.org.au';

function buildUpstreamUrl(pathParam, queryParams) {
  const pathPart = pathParam ? ('/' + pathParam.replace(/^\//, '')) : '/';
  const rest = { ...(queryParams || {}) };
  delete rest.path;
  const qs = Object.keys(rest).length ? '?' + new URLSearchParams(rest).toString() : '';
  return OE_BASE + pathPart + qs;
}

exports.handler = async (event) => {
  const apiKey = process.env.OE_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: 'OE_API_KEY not set in Netlify' }),
    };
  }

  const pathParam = event.queryStringParameters?.path ?? event.path.replace(/^\/api/, '').replace(/^\//, '');
  const url = buildUpstreamUrl(pathParam, event.queryStringParameters);

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'User-Agent': 'AGL-Portfolio/1.0',
      },
    });
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
      body,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: String(err.message) }),
    };
  }
};
