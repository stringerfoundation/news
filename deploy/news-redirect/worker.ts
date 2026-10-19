export default {
  fetch(request: Request) {
    const destination = new URL('https://stringerjournalism.org/');
    destination.search = new URL(request.url).search;
    return new Response(null, {
      status: 302,
      headers: {
        Location: destination.href,
        'Cache-Control': 'no-store',
      },
    });
  },
};
