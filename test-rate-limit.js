#!/usr/bin/env node

/**
 * Rate Limit Testing Script
 * Tests that API endpoints enforce tier-based rate limiting
 *
 * Usage: node test-rate-limit.js <endpoint> <auth-token>
 * Example: node test-rate-limit.js /api/activities eyJhbG...
 */

const https = require('https');

// Configuration
const BASE_URL = process.env.TEST_URL || 'https://veloready.app';
const ENDPOINT = process.argv[2] || '/api/activities';
const AUTH_TOKEN = process.argv[3] || process.env.AUTH_TOKEN;
const NUM_REQUESTS = 100;
const TEST_DURATION_MS = 60000; // 1 minute

if (!AUTH_TOKEN) {
  console.error('❌ Error: AUTH_TOKEN required');
  console.error('Usage: node test-rate-limit.js <endpoint> <auth-token>');
  console.error('Example: node test-rate-limit.js /api/activities eyJhbG...');
  process.exit(1);
}

// Stats tracking
const stats = {
  total: 0,
  success: 0,
  rateLimited: 0,
  errors: 0,
  responseTimes: [],
  firstRateLimitAt: null,
  headers: {}
};

/**
 * Make a single request to the API
 */
function makeRequest() {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL(ENDPOINT, BASE_URL);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        stats.responseTimes.push(responseTime);
        stats.total++;

        // Capture rate limit headers
        if (res.headers['x-ratelimit-limit']) {
          stats.headers = {
            limit: res.headers['x-ratelimit-limit'],
            remaining: res.headers['x-ratelimit-remaining'],
            reset: res.headers['x-ratelimit-reset'],
            retryAfter: res.headers['retry-after']
          };
        }

        if (res.statusCode === 200) {
          stats.success++;
          resolve({ status: 200, responseTime, headers: res.headers });
        } else if (res.statusCode === 429) {
          stats.rateLimited++;
          if (!stats.firstRateLimitAt) {
            stats.firstRateLimitAt = stats.total;
          }

          try {
            const body = JSON.parse(data);
            resolve({
              status: 429,
              responseTime,
              headers: res.headers,
              body
            });
          } catch (e) {
            resolve({ status: 429, responseTime, headers: res.headers });
          }
        } else {
          stats.errors++;
          resolve({ status: res.statusCode, responseTime, error: data });
        }
      });
    });

    req.on('error', (error) => {
      stats.errors++;
      stats.total++;
      resolve({ status: 'error', error: error.message });
    });

    req.end();
  });
}

/**
 * Run the load test
 */
async function runTest() {
  console.log('🚀 Starting Rate Limit Test');
  console.log(`📍 Endpoint: ${BASE_URL}${ENDPOINT}`);
  console.log(`🔢 Requests: ${NUM_REQUESTS}`);
  console.log(`⏱️  Duration: ${TEST_DURATION_MS / 1000}s`);
  console.log('');

  const startTime = Date.now();
  const delayBetweenRequests = TEST_DURATION_MS / NUM_REQUESTS;

  for (let i = 0; i < NUM_REQUESTS; i++) {
    const result = await makeRequest();

    // Print progress every 10 requests
    if ((i + 1) % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const avgResponseTime = (stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length).toFixed(0);
      console.log(`[${i + 1}/${NUM_REQUESTS}] ${elapsed}s elapsed | Avg: ${avgResponseTime}ms | ✅ ${stats.success} | ⛔ ${stats.rateLimited} | ❌ ${stats.errors}`);

      // If we hit first rate limit, show the response
      if (result.status === 429 && stats.rateLimited === 1) {
        console.log('\n⛔ RATE LIMIT HIT!');
        console.log('Headers:', JSON.stringify(result.headers, null, 2));
        if (result.body) {
          console.log('Body:', JSON.stringify(result.body, null, 2));
        }
        console.log('');
      }
    }

    // Delay between requests to spread over test duration
    if (i < NUM_REQUESTS - 1) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
    }
  }

  // Print final results
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgResponseTime = (stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length).toFixed(0);
  const minResponseTime = Math.min(...stats.responseTimes);
  const maxResponseTime = Math.max(...stats.responseTimes);

  console.log('\n═══════════════════════════════════════════');
  console.log('📊 RATE LIMIT TEST RESULTS');
  console.log('═══════════════════════════════════════════');
  console.log(`Total Requests:       ${stats.total}`);
  console.log(`✅ Successful:         ${stats.success} (${(stats.success / stats.total * 100).toFixed(1)}%)`);
  console.log(`⛔ Rate Limited:       ${stats.rateLimited} (${(stats.rateLimited / stats.total * 100).toFixed(1)}%)`);
  console.log(`❌ Errors:             ${stats.errors} (${(stats.errors / stats.total * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`⏱️  Total Time:         ${totalTime}s`);
  console.log(`📈 Avg Response Time:  ${avgResponseTime}ms`);
  console.log(`⚡ Min Response Time:  ${minResponseTime}ms`);
  console.log(`🐌 Max Response Time:  ${maxResponseTime}ms`);

  if (stats.firstRateLimitAt) {
    console.log(`\n🎯 First Rate Limit:   Request #${stats.firstRateLimitAt}`);
  }

  if (stats.headers.limit) {
    console.log('\n📋 Rate Limit Headers:');
    console.log(`   Limit:             ${stats.headers.limit} requests/hour`);
    console.log(`   Remaining:         ${stats.headers.remaining}`);
    console.log(`   Reset:             ${new Date(parseInt(stats.headers.reset)).toISOString()}`);
    if (stats.headers.retryAfter) {
      console.log(`   Retry After:       ${stats.headers.retryAfter}s`);
    }
  }

  console.log('═══════════════════════════════════════════\n');

  // Verify rate limiting is working
  if (stats.rateLimited === 0) {
    console.log('⚠️  WARNING: No rate limiting detected! Expected 429 responses.');
    process.exit(1);
  } else {
    console.log('✅ Rate limiting is working correctly!');
    process.exit(0);
  }
}

// Run the test
runTest().catch(console.error);
