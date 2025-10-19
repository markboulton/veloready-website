import type { Context } from "@netlify/edge-functions";

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);
  
  // Only protect /ops/* and /dashboard/* paths
  if (!url.pathname.startsWith('/ops') && !url.pathname.startsWith('/dashboard')) {
    return; // Let other paths through
  }

  // Check for Authorization header
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="VeloReady Ops Dashboard"',
      },
    });
  }

  // Parse Basic Auth
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = atob(base64Credentials);
  const [username, password] = credentials.split(':');

  // Get password from environment variable
  const expectedPassword = Deno.env.get('DASHBOARD_PASSWORD');
  
  if (username !== 'admin' || password !== expectedPassword) {
    return new Response('Invalid credentials', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="VeloReady Ops Dashboard"',
      },
    });
  }

  // Authentication successful, continue to the page
  return;
};

export const config = {
  path: ["/ops/*", "/dashboard/*"],
};
