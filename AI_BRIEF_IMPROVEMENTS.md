# AI Brief Improvements - Nov 7, 2025

## Problem Statement

The Daily Brief was generating **generic and repetitive** outputs day-to-day. Users received similar-sounding advice even when physiological signals changed significantly.

**Root Causes:**
1. **Low temperature (0.35)** → Model played it safe, produced predictable outputs
2. **Rule-focused prompt** → AI summarized metrics instead of interpreting them
3. **Generic few-shots** → Examples followed similar patterns (lead with recovery %, list metrics, recommend TSS)
4. **No variation guidance** → Nothing told AI to vary its language or reasoning approach
5. **Missing physiological storytelling** → Didn't explain *why* body feels a certain way

---

## Solution Overview

Transformed the AI from a **data summarizer** to a **physiological interpreter** who explains what the athlete's body is experiencing and what that means for today's ride.

---

## Key Changes

### 1. **Increased Temperature** (0.35 → 0.6)
- 70% increase in randomness/creativity
- Encourages varied language patterns
- Less repetitive day-to-day

### 2. **Rewrote System Prompt**

**Before:**
```
You are 'VeloReady Coach', a concise but insightful cycling coach...
Must:
- Always reference at least two of: Recovery %, Sleep Delta, HRV Delta...
- Give a clear recommendation (zones, duration, or TSS)...
```

**After:**
```
You are a cycling coach who interprets physiological data...
CRITICAL: Interpret, don't summarize. Tell the athlete WHY their body feels a certain way.
Vary your approach daily:
- Sometimes lead with physiology, sometimes load, sometimes sleep
- Mix short punchy sentences with longer ones
- Use different reasoning styles: cause-effect, comparison, pattern recognition
- Avoid repetitive phrases like 'metrics suggest', 'looking good', 'dial it back'
```

**Impact:** Shifts focus from "what the numbers are" to "what they mean."

### 3. **Decision Framework (Not Rules to Recite)**

**Before:**
```
Rules:
If Recovery < 50% OR HRV Delta <= -2% AND RHR Delta >= +2% -> suggest de-load
If Recovery >= 66% AND TSB >= 0 -> metrics support productive session
```

**After:**
```
Decision framework (not rules to recite):
- Recovery <50% OR (HRV down >2% AND RHR up >2%) → de-load to Z1-Z2
- Recovery ≥66% AND TSB ≥0 → productive session at top of target
- HRV up >15% → trust HRV over RHR (common after hard training)
- Mixed signals → explain which metric wins and why
```

**Impact:** AI uses framework to *reason* rather than recite rules verbatim.

### 4. **Interpretation Guidance**

**New Section:**
```
Interpret the metrics below as physiological signals:
- HRV/RHR patterns reveal autonomic nervous system state (recovery vs stress)
- Sleep quality + duration affect cognitive function and glycogen restoration
- TSB (Form) = CTL - ATL = readiness for hard efforts vs need for recovery
- Recovery score synthesizes everything but trust specific signals when conflicting

Translate these into:
1. What their body is experiencing
2. What that means for today
3. Specific session recommendation with rationale

Vary your language and reasoning approach each day to avoid sounding formulaic.
```

**Impact:** Teaches AI to think like a coach interpreting physiology, not a calculator.

### 5. **Improved Few-Shot Examples**

**Before (Generic):**
```
"Recovery and HRV both strong — you're fresh. Aim 75-80 TSS..."
"Fatigue flags showing: HRV down, RHR up. Skip FTP work..."
"Green trend though TSB slightly negative. Do 80-90 TSS..."
```

**After (Interpretive & Varied):**
```
"Your parasympathetic system is humming — HRV elevated, RHR dropping..."
"Skip the FTP session. HRV suppressed, heart rate elevated — textbook incomplete recovery..."
"TSB is slightly negative but HRV trend overrides that — you're absorbing training well..."
"Everything's flat — no red flags but no green lights either..."
"Massive HRV rebound (+126%) after rest block — parasympathetic system fully restored..."
```

**Impact:** Shows different ways to lead (physiology vs load), varied sentence structures, and specific physiological reasoning.

---

## Example Outputs (Simulated)

### Day 1: Recovery 72%, HRV +3%, RHR -1%, TSB 0
**Old:** "Solid recovery, neutral TSB. Expect 75-85 TSS from the ride."  
**New:** "Decent recovery with positive autonomic signals. Group ride should land around 75–85 TSS naturally. Control early surges, stay fueled (60 g/h), and stretch afterward to keep legs supple."

### Day 2: Recovery 70%, HRV +6%, RHR -1%, TSB -5
**Old:** "Green trend though TSB slightly negative. Do 80-90 TSS."  
**New:** "TSB is slightly negative but HRV trend overrides that — you're absorbing training well. Proceed with 80–90 TSS: 3×12 min at 95–100% FTP. Keep fueling tight and extend your cool-down."

### Day 3: Recovery 46%, HRV -5%, RHR +3%, TSB -10
**Old:** "Fatigue flags showing: HRV down, RHR up. Skip FTP work."  
**New:** "Skip the FTP session. HRV suppressed, heart rate elevated, sleep short — textbook incomplete recovery. Spin easy for 50 TSS in Z1–Z2, then prioritise food and an early night."

---

## Technical Details

### Files Modified
- `netlify/functions/ai-brief.ts`

### Changes
```diff
- const PROMPT_VERSION = "coach-v5-cycling";
+ const PROMPT_VERSION = "coach-v6-interpretive";

- temperature: 0.35,
+ temperature: 0.6,

- max_tokens: 220,
+ max_tokens: 240,
```

### Cache Invalidation
- Cache key includes `PROMPT_VERSION`
- Changing version from `coach-v5-cycling` → `coach-v6-interpretive` automatically invalidates old cached briefs
- Next request will generate with new prompt

---

## Expected Outcomes

### ✅ **More Personalized**
- Explains *why* body feels a certain way (parasympathetic tone, glycogen restoration, autonomic balance)
- Connects metrics to real physiology

### ✅ **Less Repetitive**
- Temperature increase encourages variation
- Anti-repetition instructions in system prompt
- Varied few-shot examples demonstrate different approaches

### ✅ **More Actionable**
- Still provides clear TSS/zone/duration recommendations
- Adds context: "HRV trend overrides TSB" or "you're absorbing training well"
- Forward-looking: "bank 8 hours sleep to lock in stimulus"

### ✅ **Natural Coach Voice**
- Sounds like a text from a coach who knows the athlete
- Uses physiological language naturally: "parasympathetic system humming," "CNS is fresh," "sympathetic overdrive"
- Varies sentence structure: sometimes punchy, sometimes explanatory

---

## Testing Strategy

### 1. **Monitor Next 7 Days**
Compare briefs day-to-day:
- Are they using different lead-ins? (HRV vs TSB vs sleep)
- Are they varying language? (Not repeating "metrics suggest")
- Are they interpreting physiology? (Explaining *why*, not just *what*)

### 2. **Edge Cases**
- **Illness detected:** Should prioritize rest with educational language
- **HRV spike >100%:** Should recognize supercompensation vs stress
- **Mixed signals:** Should explain which metric wins and why
- **Missing sleep data:** Should still provide guidance based on recovery

### 3. **Rollback Plan**
If outputs become too unpredictable or lose quality:
1. Reduce temperature to 0.5 (middle ground)
2. Add more few-shot examples for edge cases
3. Revert to `coach-v5-cycling` if necessary

---

## Deployment

### Status: ✅ **Deployed to Production**
- Changes committed to `netlify/functions/ai-brief.ts`
- Prompt version updated: `coach-v6-interpretive`
- Cache will auto-invalidate on next request

### Monitoring
- Check AI brief output in iOS app over next 7 days
- Compare day-to-day variation
- Verify physiological interpretation vs metric summarization
- User feedback on helpfulness and personalization

---

## Success Metrics

**Before:**
- Same opening phrases repeated ("metrics suggest," "looking good")
- Generic recommendations ("aim for 70-80 TSS")
- No explanation of *why* body feels a certain way

**After:**
- Varied language patterns day-to-day
- Specific physiological interpretation ("parasympathetic tone," "glycogen restoration")
- Clear rationale: "HRV trend overrides TSB because you're absorbing training well"
- Forward-looking context: "extend cool-down to set up tomorrow"

---

## Notes

- **Temperature 0.6** is high enough for variation but not so high as to produce nonsensical outputs
- **Max tokens 240** (up from 220) allows slightly longer briefs when needed for complex interpretation
- **Few-shot examples** are critical — they teach the AI the *style* of interpretation we want
- **Prompt version** in cache key ensures clean cutover without manual cache purging

---

## Next Steps

1. ✅ **Deploy** (DONE)
2. **Monitor** for 7 days
3. **Collect feedback** from users
4. **Iterate** if needed:
   - Adjust temperature if too random/too safe
   - Add more few-shot examples for specific scenarios
   - Refine system prompt based on observed outputs
