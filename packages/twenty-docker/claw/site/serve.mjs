// Local preview only: serves dist/ and forwards /api/* to the CRM's /s/*, like the production Caddyfile.
// Usage: node build.mjs && node serve.mjs   (CRM_URL defaults to http://localhost:3000)
// MOCK=1 answers /api/* with sample data instead, to preview without a running CRM.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT ?? 4321);
const CRM_URL = process.env.CRM_URL ?? 'http://localhost:3000';
const DIST = join(import.meta.dirname, 'dist');
const IS_MOCK = process.env.MOCK === '1';
const MOCK_PRICES = { ROD: 180_000, PROFILE: 220_000, REBAR: 250_000 };
const MOCK_OFFER_PERCENT = 10;
const MOCK_DESIGNS = ['Классика', 'Ромб', 'Кольца', 'Арка', 'Модерн'].map((name, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`,
  name,
  prices: { ...MOCK_PRICES, PROFILE: MOCK_PRICES.PROFILE + index * 10_000 },
}));

const mockAnswer = (path, body) => {
  if (path === 'website/catalog') {
    return { designs: MOCK_DESIGNS, defaultPrices: MOCK_PRICES, offerPercent: MOCK_OFFER_PERCENT };
  }

  const input = JSON.parse(body ?? '{}');
  const area =
    (input.widthCm * input.heightCm + 2 * input.projectionCm * (input.widthCm + input.heightCm)) / 10_000;
  const estimate = Math.round(area * input.quantity * MOCK_PRICES[input.metal]);

  return {
    areaSquareMeters: Math.round(area * input.quantity * 100) / 100,
    pricePerSquareMeter: MOCK_PRICES[input.metal],
    estimate,
    offerPercent: MOCK_OFFER_PERCENT,
    discountedEstimate: Math.round((estimate * (100 - MOCK_OFFER_PERCENT)) / 100),
  };
};
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const readBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) chunks.push(chunk);

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
};

createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/') && IS_MOCK) {
    const body = request.method === 'GET' ? undefined : String(await readBody(request));

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(mockAnswer(url.pathname.slice('/api/'.length), body)));

    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const upstream = await fetch(`${CRM_URL}/s/${url.pathname.slice('/api/'.length)}${url.search}`, {
      method: request.method,
      headers: { 'content-type': request.headers['content-type'] ?? 'application/json' },
      body: request.method === 'GET' ? undefined : await readBody(request),
    }).catch((error) => new Response(String(error), { status: 502 }));

    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'text/plain' });
    response.end(Buffer.from(await upstream.arrayBuffer()));

    return;
  }

  const path = normalize(url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname);

  try {
    const file = await readFile(join(DIST, path));

    response.writeHead(200, { 'content-type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream' });
    response.end(file);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(PORT, () => console.log(`ProfMet site on http://localhost:${PORT} → ${IS_MOCK ? 'mock API' : `CRM ${CRM_URL}`}`));
