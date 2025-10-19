import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

/**
 * Test endpoint to verify streams caching works
 * GET /test-streams-cache
 */
export async function handler(event: HandlerEvent, context: HandlerContext) {
  try {
    const siteID = process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN 
      || process.env.NETLIFY_TOKEN 
      || process.env.NETLIFY_FUNCTIONS_TOKEN;
    
    const store = getStore({
      name: "streams-cache",
      ...(siteID && token ? { siteID, token } : {})
    });
    
    // Test data similar to streams
    const testData = {
      time: { data: [0, 1, 2, 3, 4], series_type: "time" },
      watts: { data: [100, 150, 200, 180, 160], series_type: "distance" }
    };
    
    const cacheKey = "test:streams:12345";
    
    // Try to write
    await store.setJSON(cacheKey, testData, {
      metadata: {
        test: "true",
        cachedAt: new Date().toISOString()
      }
    });
    
    // Try to read
    const retrieved = await store.get(cacheKey, { type: "json" });
    
    // Clean up
    await store.delete(cacheKey);
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        message: "Streams cache test passed!",
        wrote: testData,
        retrieved: retrieved,
        dataMatches: JSON.stringify(testData) === JSON.stringify(retrieved)
      })
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
}
