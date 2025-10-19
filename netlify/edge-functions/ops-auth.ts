export default async (request: Request, context: any) => {
  // TEMPORARY: Disable auth to debug
  console.log('[AUTH] Edge Function triggered, passing through without auth');
  return; // Pass through without authentication
  
  const url = new URL(request.url);
  
  console.log('[AUTH] Edge Function triggered for:', url.pathname);
  
  // Only protect /ops/ and /dashboard/ paths
  if (!url.pathname.startsWith('/ops') && !url.pathname.startsWith('/dashboard')) {
    console.log('[AUTH] Path not protected, passing through');
    return; // Pass through to next handler
  }

  console.log('[AUTH] Path is protected, checking auth');

  // Check for authorization header
  const authHeader = request.headers.get('authorization');
  console.log('[AUTH] Auth header present:', !!authHeader);
  
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
    console.log('[AUTH] Base64 credentials:', base64Credentials);
    
    // Decode base64 - use TextDecoder for proper string handling in Deno
    const decoded = atob(base64Credentials);
    console.log('[AUTH] Decoded credentials:', decoded);
    
    const [username, password] = decoded.split(':');

    const validUsername = 'admin';
    const validPassword = 'test123'; // TEMPORARY TEST PASSWORD

    console.log('[AUTH] Received username:', JSON.stringify(username));
    console.log('[AUTH] Received password:', JSON.stringify(password));
    console.log('[AUTH] Expected username:', JSON.stringify(validUsername));
    console.log('[AUTH] Expected password:', JSON.stringify(validPassword));
    console.log('[AUTH] Username match:', username === validUsername);
    console.log('[AUTH] Password match:', password === validPassword);
    console.log('[AUTH] Username length:', username.length, 'Expected:', validUsername.length);
    console.log('[AUTH] Password length:', password.length, 'Expected:', validPassword.length);

    if (username === validUsername && password === validPassword) {
      console.log('[AUTH] ✅ Authentication successful');
      // Authentication successful - pass through to the actual page
      return;
    }
    
    console.log('[AUTH] ❌ Authentication failed - credentials mismatch');
    
    // TEMPORARY DEBUG: Return detailed error
    return new Response(`Auth failed - user: "${username}" (len:${username.length}), pass: "${password}" (len:${password.length})`, {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="VeloReady Dashboard"',
      },
    });
  } catch (error) {
    console.log('[AUTH] ❌ Error parsing credentials:', error);
    // Invalid base64 or malformed header
    return new Response(`Auth error: ${error}`, {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="VeloReady Dashboard"',
      },
    });
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
