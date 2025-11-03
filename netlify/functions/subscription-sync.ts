import { HandlerEvent } from '@netlify/functions';
import { authenticate } from '../lib/auth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

interface SubscriptionSyncRequest {
  athlete_id: number;
  subscription_tier: 'free' | 'trial' | 'pro';
  subscription_status: string;
  expires_at?: string;
  trial_ends_at?: string;
  transaction_id?: string;
  product_id?: string;
  purchase_date?: string;
  auto_renew?: boolean;
}

export default async (event: HandlerEvent) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  try {
    // Authenticate user
    const authResult = await authenticate(event);
    
    if ('error' in authResult) {
      return {
        statusCode: authResult.statusCode,
        body: JSON.stringify({ error: authResult.error }),
        headers: { 'Content-Type': 'application/json' },
      };
    }
    
    const { userId } = authResult;

    // Parse request body
    const body: SubscriptionSyncRequest = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!body.athlete_id || !body.subscription_tier) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing required fields: athlete_id, subscription_tier',
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // Upsert subscription to database
    const { data, error } = await supabase
      .from('user_subscriptions')
      .upsert(
        {
          user_id: userId,
          athlete_id: body.athlete_id,
          subscription_tier: body.subscription_tier,
          subscription_status: body.subscription_status || 'active',
          expires_at: body.expires_at || null,
          trial_ends_at: body.trial_ends_at || null,
          transaction_id: body.transaction_id || null,
          product_id: body.product_id || null,
          purchase_date: body.purchase_date || null,
          auto_renew: body.auto_renew ?? true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (error) {
      console.error('❌ Subscription sync failed:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: error.message,
        }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    console.log(`✅ Subscription synced for user ${userId}: ${body.subscription_tier}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: data,
      }),
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    };
  } catch (error) {
    console.error('❌ Subscription sync error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
};
