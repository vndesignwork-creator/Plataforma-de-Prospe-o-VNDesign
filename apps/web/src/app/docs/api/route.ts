/** GET /docs/api — documentação interativa da API (Scalar). */
export function GET() {
  const html = `<!doctype html>
<html lang="pt-PT">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VNDesign Leads — API</title>
  </head>
  <body>
    <script id="api-reference" data-url="/api/v1/openapi.json"
      data-configuration='{"theme":"default","darkMode":true,"hideClientButton":false}'></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.34.6"></script>
  </body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
