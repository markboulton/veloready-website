export default async (request: Request, context: any) => {
  const url = new URL(request.url);
  
  // Only protect /ops/ and /dashboard/ paths
  if (!url.pathname.startsWith('/ops') && !url.pathname.startsWith('/dashboard')) {
    return; // Pass through to next handler
  }

  // Check for authorization header
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="VeloReady Dashboard"',
      },
    });
  }

  // Verify credentials
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = atob(base64Credentials);
  const [username, password] = credentials.split(':');

  const validUsername = 'admin';
  // Temporary hardcoded password - TODO: Move to env var
  const validPassword = 'VeloReady2025!SecureDashboard#Ops';

  if (username === validUsername && password === validPassword) {
    return; // Allow access
  }

  return new Response('Invalid credentials', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="VeloReady Dashboard"',
    },
  });
};

export const config = {
  path: ["/ops/*", "/dashboard/*"],
};

// Declare Deno global for TypeScript
declare const Deno: any;
