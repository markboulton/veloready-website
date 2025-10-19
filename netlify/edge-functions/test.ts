export default async () => {
  return new Response('Edge Function is working!', {
    headers: { 'content-type': 'text/plain' },
  });
};

export const config = { path: "/test-edge" };
