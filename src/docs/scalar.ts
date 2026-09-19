/**
 * Renders an interactive Scalar API Reference HTML document.
 * Consumes OpenAPI 3.0 specification from specUrl and renders using the @scalar/api-reference web component.
 */
export function renderScalarHtml(specUrl: string = "/openapi.json"): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <title>Reedrich Financial Intelligence API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚡</text></svg>">
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #0d1117;
      }
    </style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="${specUrl}"
      data-configuration='{"theme":"kepler","layout":"modern","darkMode":true}'
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}
