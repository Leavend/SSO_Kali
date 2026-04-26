export function GET(): Response {
  return new Response("ok\n", {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
    status: 200,
  });
}
