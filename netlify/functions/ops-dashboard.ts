import { Handler } from '@netlify/functions';
import { readFileSync } from 'fs';
import { join } from 'path';

const VALID_USERNAME = 'admin';
const VALID_PASSWORD = process.env.DASHBOARD_PASSWORD || 'mabo4283';

export const handler: Handler = async (event) => {
  // Check for Basic Auth header
  const authHeader = event.headers.authorization || event.headers.Authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return {
      statusCode: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="VeloReady Ops Dashboard"',
      },
      body: 'Authentication required',
    };
  }

  // Verify credentials
  try {
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (username !== VALID_USERNAME || password !== VALID_PASSWORD) {
      return {
        statusCode: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="VeloReady Ops Dashboard"',
        },
        body: 'Invalid credentials',
      };
    }
  } catch (error) {
    return {
      statusCode: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="VeloReady Ops Dashboard"',
      },
      body: 'Invalid authorization header',
    };
  }

  // Authentication successful - serve the dashboard HTML
  try {
    const htmlPath = join(process.cwd(), 'public', 'dashboard', 'index.html');
    const html = readFileSync(htmlPath, 'utf-8');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: html,
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: 'Error loading dashboard',
    };
  }
};
