# VeloReady AI Daily Brief (veloready.app)

Serverless endpoint: `/.netlify/functions/ai-brief`

- ✅ HMAC auth (X-Signature) + anonymous X-User
- 💾 Netlify Blobs caching (per user/day)
- 🤖 OpenAI gpt-4o-mini with token limits
- 🧯 Deterministic fallback if LLM fails