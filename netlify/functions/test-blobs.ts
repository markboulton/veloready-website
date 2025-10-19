import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

/**
 * Test endpoint to verify Netlify Blobs is working
 * GET /test-blobs
 */
export async function handler(event: HandlerEvent, context: HandlerContext) {
  try {
    // Try to create a store using the correct API
    const store = getStore({ name: "test-store" });
    
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
        deployContext: context.clientContext?.custom?.netlify?.deploy_context || "unknown"
      })
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: error.message,
        errorStack: error.stack,
        deployContext: context.clientContext?.custom?.netlify?.deploy_context || "unknown"
      })
    };
  }
}
