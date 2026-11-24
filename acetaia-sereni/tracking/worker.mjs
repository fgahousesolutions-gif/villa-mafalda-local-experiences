const OFFERS = Object.freeze({
  classics: 'https://fareharbor.com/embeds/book/acetaiasereni/items/380165/?flow=744606&full-items=yes',
  gourmerenda: 'https://fareharbor.com/embeds/book/acetaiasereni/items/380173/?flow=744606&full-items=yes',
  secrets: 'https://fareharbor.com/embeds/book/acetaiasereni/items/516615/?flow=744606&full-items=yes',
  table: 'https://fareharbor.com/embeds/book/acetaiasereni/items/380175/?flow=744606&full-items=yes',
  chocolate: 'https://fareharbor.com/embeds/book/acetaiasereni/items/380171/?flow=744606&full-items=yes',
  luxury: 'https://fareharbor.com/embeds/book/acetaiasereni/items/516645/?flow=744606&full-items=yes',
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const match = /^\/go\/([a-z]+)\/?$/.exec(url.pathname);
    if (!match || request.method !== 'GET') {
      return env.ASSETS.fetch(request);
    }
    const id = match[1];
    const destination = OFFERS[id];
    if (!destination) return new Response('Esperienza non disponibile', {status: 404});
    // Only aggregate by calendar day and experience. No names, IPs, cookies or UA retained.
    const day = new Date().toISOString().slice(0, 10);
    try {
      await env.DB.prepare(
        `INSERT INTO clicks (day, experience, total) VALUES (?, ?, 1)
         ON CONFLICT (day, experience) DO UPDATE SET total = total + 1`
      ).bind(day, id).run();
    } catch (err) {
      console.error('Aggregate click count failed'); // Never interrupt a guest booking
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: destination,
        'Cache-Control': 'no-store, max-age=0',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow',
      }
    });
  }
};
