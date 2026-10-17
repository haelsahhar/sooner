const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Tiny standalone result page for the confirm / unsubscribe links in emails.
export function resultPage(heading: string, message: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(heading)} · Sooner</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F6F2;color:#13201E;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:420px;padding:32px 24px;text-align:center}
h1{font-size:24px;margin:0 0 10px;letter-spacing:-.01em}
p{margin:0 0 24px;color:#52605D;line-height:1.5}
a{display:inline-block;background:#0F766E;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600}
</style></head><body><main><h1>${esc(heading)}</h1><p>${esc(message)}</p><a href="/">Back to Sooner</a></main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
