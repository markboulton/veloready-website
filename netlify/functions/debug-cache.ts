import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

/**
 * Debug endpoint to test cache operations in real-time
 * GET /debug-cache?action=write|read|test
 */
export async function handler(event: HandlerEvent, context: HandlerContext) {
  const action = event.queryStringParameters?.action || "test";
  const activityId = event.queryStringParameters?.activityId || "16156463870";
  
  const results: any = {
    action,
    timestamp: new Date().toISOString(),
    env: {
      hasSiteID: !!process.env.SITE_ID,
      siteID: process.env.SITE_ID,
      hasBlobsToken: !!process.env.NETLIFY_BLOBS_TOKEN,
      hasNetlifyToken: !!process.env.NETLIFY_TOKEN,
      hasFunctionsToken: !!process.env.NETLIFY_FUNCTIONS_TOKEN,
      tokenUsed: process.env.NETLIFY_BLOBS_TOKEN ? "NETLIFY_BLOBS_TOKEN"
        : process.env.NETLIFY_TOKEN ? "NETLIFY_TOKEN"
        : process.env.NETLIFY_FUNCTIONS_TOKEN ? "NETLIFY_FUNCTIONS_TOKEN"
        : "none"
    }
  };

  try {
    const siteID = process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN 
      || process.env.NETLIFY_TOKEN 
      || process.env.NETLIFY_FUNCTIONS_TOKEN;
    
    if (!siteID || !token) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...results,
          error: "Missing siteID or token",
          siteID: !!siteID,
          token: !!token
        })
      };
    }

    const store = getStore({
      name: "streams-cache",
      siteID,
      token
    });
    
    const cacheKey = `streams:104662:${activityId}`;
    results.cacheKey = cacheKey;

    if (action === "write") {
      // Write test data
      const testData = {
        time: { data: [0, 1, 2, 3, 4], series_type: "time" },
        watts: { data: [100, 150, 200, 180, 160], series_type: "distance" },
        test: true,
        timestamp: new Date().toISOString()
      };
      
      await store.setJSON(cacheKey, testData, {
        metadata: {
          athleteId: "104662",
          activityId,
          cachedAt: new Date().toISOString(),
          test: true
        }
      });
      
      results.operation = "write";
      results.success = true;
      results.dataSize = JSON.stringify(testData).length;
      results.message = "Data written to cache";
      
    } else if (action === "read") {
      // Read from cache
      const cached = await store.get(cacheKey, { type: "json" });
      
      results.operation = "read";
      results.found = !!cached;
      results.data = cached;
      results.message = cached ? "Data found in cache" : "No data in cache";
      
    } else {
      // Test: write then read
      const testData = {
        test: true,
        timestamp: new Date().toISOString(),
        random: Math.random()
      };
      
      // Write
      await store.setJSON(cacheKey, testData);
      results.writeSuccess = true;
      results.wroteData = testData;
      
      // Read immediately
      const retrieved = await store.get(cacheKey, { type: "json" });
      results.readSuccess = !!retrieved;
      results.retrievedData = retrieved;
      results.dataMatches = JSON.stringify(testData) === JSON.stringify(retrieved);
      
      // Clean up
      await store.delete(cacheKey);
      results.cleanedUp = true;
      
      results.message = results.dataMatches 
        ? "✅ Cache working perfectly!" 
        : "❌ Data mismatch";
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(results, null, 2)
    };
    
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...results,
        error: error.message,
        stack: error.stack,
        errorType: error.constructor.name
      }, null, 2)
    };
  }
}
