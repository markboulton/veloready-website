import { createClient } from '@supabase/supabase-js'

export interface TestUser {
  id: string
  email: string
  athleteId: number
  accessToken: string
  refreshToken: string
}

export class TestHelpers {
  private static supabase = createClient(
    process.env.TEST_SUPABASE_URL || 'https://test.supabase.co',
    process.env.TEST_SUPABASE_ANON_KEY || 'test-key'
  )

  // Helper to handle Netlify function responses
  static async parseResponse(response: any) {
    if (typeof response === 'string') {
      return { status: 200, data: response }
    }
    
    let data = {}
    if (response.body) {
      try {
        data = JSON.parse(response.body)
      } catch (error) {
        // If it's not JSON, treat as plain text
        data = { message: response.body }
      }
    }
    
    return {
      status: response.statusCode || 200,
      data,
      headers: response.headers || {}
    }
  }

  // Helper to create a mock Response object that behaves like fetch Response
  static createMockResponse(netlifyResponse: any) {
    return {
      status: netlifyResponse.statusCode || 200,
      statusCode: netlifyResponse.statusCode || 200,
      headers: netlifyResponse.headers || {},
      body: netlifyResponse.body || '',
      json: async () => {
        try {
          return JSON.parse(netlifyResponse.body || '{}')
        } catch (error) {
          return { message: netlifyResponse.body || '' }
        }
      },
      text: async () => netlifyResponse.body || '',
      ok: (netlifyResponse.statusCode || 200) >= 200 && (netlifyResponse.statusCode || 200) < 300
    }
  }

  static async createTestUser(): Promise<TestUser> {
    // In a real test environment, you'd create a test user in Supabase
    // For now, return a mock user
    return {
      id: 'test-user-id',
      email: 'test@example.com',
      athleteId: 123456789,
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token'
    }
  }

  static async getAuthToken(user: TestUser): Promise<string> {
    // Mock authentication - in real tests, you'd get a real token
    return user.accessToken
  }

  static async getExpiredToken(): Promise<string> {
    return 'expired-token'
  }

  static createMockRequest(options: {
    method: string
    path: string
    headers?: Record<string, string>
    body?: any
    queryStringParameters?: Record<string, string>
  }) {
    // Build rawUrl for OAuth functions
    const queryString = options.queryStringParameters 
      ? '?' + new URLSearchParams(options.queryStringParameters).toString()
      : ''
    const rawUrl = `https://test.netlify.app${options.path}${queryString}`
    
    return {
      httpMethod: options.method,
      path: options.path,
      rawUrl,
      headers: options.headers || {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      isBase64Encoded: false,
      queryStringParameters: options.queryStringParameters || {},
      multiValueQueryStringParameters: {},
      pathParameters: {},
      stageVariables: {},
      requestContext: {
        accountId: 'test',
        apiId: 'test',
        protocol: 'HTTP/1.1',
        httpMethod: options.method,
        path: options.path,
        stage: 'test',
        requestId: 'test-request-id',
        requestTime: new Date().toISOString(),
        requestTimeEpoch: Date.now(),
        resourceId: 'test-resource',
        resourcePath: options.path,
        identity: {
          cognitoIdentityPoolId: null,
          accountId: null,
          cognitoIdentityId: null,
          caller: null,
          sourceIp: '127.0.0.1',
          principalOrgId: null,
          accessKey: null,
          cognitoAuthenticationType: null,
          cognitoAuthenticationProvider: null,
          userArn: null,
          userAgent: 'test-agent',
          user: null
        },
        authorizer: null,
        pathParameters: {},
        stageVariables: {}
      }
    }
  }
}