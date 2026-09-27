// Dev-only static server for docs/. Not part of the deployed app.
const root = decodeURIComponent(new URL("./docs/", import.meta.url).pathname);
Bun.serve({
  port: 5052,
  async fetch(req) {
    let path = decodeURIComponent(new URL(req.url).pathname);
    if (path === "/") path = "/index.html";
    const file = Bun.file(root + path.slice(1));
    return (await file.exists())
      ? new Response(file, { headers: { "Cache-Control": "no-store" } })
      : new Response("Not found", { status: 404 });
  },
});
console.log("Serving docs/ at http://localhost:5052");
