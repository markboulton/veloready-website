export default async (request: Request, context: any) => {
  const url = new URL(request.url);
  
  // Only protect /ops/ and /dashboard/ paths
  if (!url.pathname.startsWith('/ops') && !url.pathname.startsWith('/dashboard')) {
    return; // Pass through to next handler
  }

  // Check for authorization header
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return new Response('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="VeloReady Dashboard"',
      },
    });
  }

  // Verify credentials
  try {
    const base64Credentials = authHeader.substring(6); // Remove 'Basic '
    const credentials = atob(base64Credentials);
    const [username, password] = credentials.split(':');

    const validUsername = 'admin';
    const validPassword = 'mabo4283';

    console.log('[AUTH] Received username:', username);
    console.log('[AUTH] Received password:', password);
    console.log('[AUTH] Expected username:', validUsername);
    console.log('[AUTH] Expected password:', validPassword);
    console.log('[AUTH] Username match:', username === validUsername);
    console.log('[AUTH] Password match:', password === validPassword);

    if (username === validUsername && password === validPassword) {
      console.log('[AUTH] ✅ Authentication successful');
      // Authentication successful - pass through to the actual page
      return;
    }
    
    console.log('[AUTH] ❌ Authentication failed - credentials mismatch');
  } catch (error) {
    console.log('[AUTH] ❌ Error parsing credentials:', error);
    // Invalid base64 or malformed header
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
