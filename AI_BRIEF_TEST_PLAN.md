# AI Brief v6 Test Plan

## Overview
Testing the improved AI brief prompt (`coach-v6-interpretive`) to ensure more personalized, interpretive, and less repetitive daily guidance.

---

## Automated Testing

### ✅ Existing Tests (All Should Pass)
Run: `npm test api.ai-brief`

1. **Authentication:** Rejects unauthenticated requests (401)
2. **Valid request:** Returns brief text for authenticated user (200)
3. **Missing metrics:** Handles gracefully (400)
4. **Invalid date:** Handles gracefully (400)
5. **Caching:** Returns cached brief when available
6. **Rate limiting:** Respects rate limits (200 or 429)

**Expected:** All tests pass with new prompt version

---

## Manual Testing (iOS App)

### Day 1: Initial Test
**Date:** Nov 7, 2025

**Steps:**
1. Open VeloReady iOS app
2. Navigate to Today view
3. Wait for AI brief to load
4. Note the brief text and style

**What to check:**
- ✅ Brief loads successfully
- ✅ Text is 80-100 words
- ✅ Contains specific physiological interpretation (not just metric summary)
- ✅ Includes TSS/zone recommendation
- ✅ Uses UK English spelling
- ✅ No emojis
- ✅ `version: "coach-v6-interpretive"` in debug logs

**Example good output:**
> "Your parasympathetic system is humming — HRV elevated, RHR dropping, sleep quality strong. Body's primed for work. Take 75–80 TSS: steady Z2 with 4×30s cadence bursts. Fuel early to capitalise."

**Example bad output (what we're avoiding):**
> "Recovery and HRV both strong — you're fresh. Aim 75-80 TSS with steady Z2 endurance. Fuel early to keep glycogen topped."

---

### Days 2-7: Variation Testing

**Goal:** Verify briefs vary day-to-day and don't become repetitive

**Test Matrix:**

| Day | Recovery | HRV | RHR | TSB | Expected Lead-In Style |
|-----|----------|-----|-----|-----|------------------------|
| 2 | 72% | +3% | -1% | 0 | Autonomic signals |
| 3 | 46% | -5% | +3% | -10 | Sleep/fatigue pattern |
| 4 | 85% | +5% | -2% | +10 | Form/readiness |
| 5 | 64% | +2% | 0% | +4 | Neutral/balanced |
| 6 | 53% | -3% | +1% | -8 | Load accumulation |
| 7 | 78% | +1% | 0% | 0 | Sleep restoration |

**What to check each day:**
- ✅ Different opening sentence
- ✅ Varied reasoning approach (not always same pattern)
- ✅ No repeated phrases like "metrics suggest," "looking good," "dial it back"
- ✅ Explains *why* (physiology) not just *what* (numbers)
- ✅ Varies sentence structure (short vs long)

**Red flags (what we're trying to avoid):**
- ❌ Same opening 3+ days in a row
- ❌ Repeated phrases verbatim
- ❌ Generic recommendations without rationale
- ❌ Just listing metrics without interpreting them

---

## Edge Case Testing

### Test 1: Missing Sleep Data
**Input:**
```json
{
  "recovery": 57,
  "sleepDelta": null,
  "sleepScore": null,
  "hrvDelta": null,
  "rhrDelta": null,
  "tsb": 5,
  "tssLow": 60,
  "tssHigh": 80
}
```

**Expected:**
- Brief mentions lack of sleep data
- Still provides recommendation based on recovery score
- Suggests wearing watch tonight
- Example: "Without sleep data, I can only read recovery at 57% — borderline..."

---

### Test 2: Illness Detected (Body Stress)
**Input:**
```json
{
  "recovery": 75,
  "sleepScore": 70,
  "hrvDelta": 130,
  "rhrDelta": 8,
  "tsb": 10,
  "illnessIndicator": {
    "severity": "moderate",
    "confidence": 0.65,
    "signals": [
      { "type": "hrvSpike", "deviation": 130, "value": 95 }
    ]
  }
}
```

**Expected:**
- Recommends rest or very light Z1 (max 30 TSS)
- Uses educational language: "your body needs extra recovery"
- Does NOT diagnose: No "you are sick"
- Overrides good recovery score
- Example: "Massive HRV rebound (+130%) suggests supercompensation or stress response..."

---

### Test 3: Mixed Signals (HRV up, RHR up, TSB negative)
**Input:**
```json
{
  "recovery": 68,
  "sleepScore": 82,
  "hrvDelta": 15,
  "rhrDelta": 5,
  "tsb": -8
}
```

**Expected:**
- Explains which metric wins and why
- Mentions HRV takes priority when >15% (parasympathetic recovery)
- Acknowledges RHR elevation is normal after hard training
- Example: "HRV up 15% overrides slightly elevated RHR — common after hard efforts..."

---

### Test 4: Supercompensation (Very High Recovery)
**Input:**
```json
{
  "recovery": 96,
  "sleepScore": 98,
  "hrvDelta": 126,
  "rhrDelta": 9,
  "tsb": 37
}
```

**Expected:**
- Recognizes this as rest block recovery
- Recommends moderate TSS to reactivate (not heavy load immediately)
- Explains parasympathetic restoration
- Example: "Massive HRV rebound (+126%) after rest block — parasympathetic system fully restored..."

---

### Test 5: Deep Fatigue (Red Day)
**Input:**
```json
{
  "recovery": 35,
  "sleepScore": 58,
  "hrvDelta": -7,
  "rhrDelta": 4,
  "tsb": -15
}
```

**Expected:**
- Strong recommendation for rest or very light Z1
- Explains sympathetic overdrive / stress response
- Prioritizes recovery (food, sleep)
- Example: "Your body is deeply fatigued. Sleep disrupted, HRV crushed, RHR spiking — sympathetic overdrive..."

---

## Comparison Analysis

### Before vs After (Same Input)

**Input:** Recovery 72%, HRV +3%, RHR -1%, TSB 0, Sleep 79/100

**Before (coach-v5):**
> "Solid recovery, neutral TSB. Expect 75-85 TSS from the ride; control surges early, fuel 60 g/h, and stretch after."

**After (coach-v6):**
> "Decent recovery with positive autonomic signals. Group ride should land around 75–85 TSS naturally. Control early surges, stay fueled (60 g/h), and stretch afterward to keep legs supple."

**Differences:**
- ✅ "Positive autonomic signals" (physiology) vs "neutral TSB" (metric)
- ✅ "Keep legs supple" (outcome) vs "stretch after" (action only)
- ✅ Natural language flow vs list-like structure

---

## Success Criteria

### Must Have ✅
1. All automated tests pass
2. Briefs load successfully in iOS app
3. Text is 80-100 words
4. Contains physiological interpretation
5. Includes specific TSS/zone recommendation
6. No medical diagnosis when illness detected

### Should Have ⭐
7. Varies day-to-day (3+ different opening styles in 7 days)
8. No repeated phrases >2 times in 7 days
9. Explains *why* body feels a certain way
10. Uses cycling-specific language naturally (Z2, TSS, threshold, etc.)

### Nice to Have 🎯
11. Mixes short and long sentences
12. Uses different reasoning approaches (cause-effect, pattern, comparison)
13. Forward-looking context ("set up tomorrow," "lock in stimulus")
14. Personalized feel (like text from a coach who knows athlete)

---

## Rollback Triggers

If any of these occur, consider rolling back:

1. **Generic/repetitive briefs** persist after 3 days
2. **Nonsensical outputs** (temperature too high)
3. **Missing critical info** (no TSS recommendation)
4. **Medical diagnosis** language when illness detected
5. **Automated tests fail**

**Rollback process:**
1. Change `PROMPT_VERSION` back to `"coach-v5-cycling"`
2. Restore previous SYSTEM_PROMPT, FEW_SHOTS
3. Set temperature back to 0.35
4. Deploy and verify
5. Investigate root cause before re-attempting

---

## Monitoring

### Logs to Check
```
iOS App Debug Logs:
AI BRIEF REQUEST DATA:
  Recovery: 72
  Sleep Score: 79/100
  HRV Delta: +3.0%
  RHR Delta: -1.0%
  TSB: 0.0
  TSS Range: 65-85

AI brief updated (fresh)
Version: coach-v6-interpretive
```

### Backend Logs (Netlify Functions)
```
openai_call: temperature=0.6, max_tokens=240
cache_key: user-123:2025-11-07:coach-v6-interpretive:full
cache_miss: generating new brief
```

---

## Timeline

- **Nov 7, 2025:** Deploy coach-v6-interpretive
- **Nov 7-14:** Monitor daily briefs for variation/quality
- **Nov 14:** Review feedback, decide on adjustments
- **Nov 15+:** Iterate if needed or declare success

---

## Contact

Issues or questions? Check:
- Backend logs: Netlify Functions dashboard
- iOS logs: Xcode console
- Documentation: `AI_BRIEF_IMPROVEMENTS.md`
