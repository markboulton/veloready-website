import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

/**
 * Test endpoint to verify Netlify Blobs is working
 * GET /test-blobs
 */
export async function handler(event: HandlerEvent, context: HandlerContext) {
  try {
    // In Netlify Functions v2, we need to use environment variables
    // Try multiple token sources in order of preference
    const siteID = process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN 
      || process.env.NETLIFY_TOKEN 
      || process.env.NETLIFY_FUNCTIONS_TOKEN;
    
    // Try to create a store
    const store = getStore({
      name: "test-store",
      ...(siteID && token ? { siteID, token } : {})
    });
    
    // Try to write
    await store.set("test-key", "Hello from Blobs!");
    
    // Try to read
    const value = await store.get("test-key");
    
    // Try to delete
    await store.delete("test-key");
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        message: "Netlify Blobs is working!",
        testValue: value,
        siteID: siteID || "not set",
        hasToken: !!token
      })
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: error.message,
        siteID: process.env.SITE_ID || "not set",
        hasToken: !!(process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_TOKEN || process.env.NETLIFY_FUNCTIONS_TOKEN),
        tokenSource: process.env.NETLIFY_BLOBS_TOKEN ? "NETLIFY_BLOBS_TOKEN" 
          : process.env.NETLIFY_TOKEN ? "NETLIFY_TOKEN"
          : process.env.NETLIFY_FUNCTIONS_TOKEN ? "NETLIFY_FUNCTIONS_TOKEN"
          : "none",
        availableEnvVars: Object.keys(process.env).filter(k => k.includes('NETLIFY') || k.includes('SITE'))
      })
    };
  }
}
