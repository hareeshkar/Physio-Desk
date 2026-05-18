# MiniMax Smoke Test Results

**Date**: 2026-05-16  
**Run command**: `npm run smoke:minimax` (full) or `npm run smoke:minimax -- --fast` (skip tests 7-8)  
**Account**: Token Plan Plus (standard, `sk-cp-…` key format)  
**Base URL**: `https://api.minimax.io`

---

## Current Status: ✅ 6/6 fast-mode tests PASS | ✅ 8/8 full-suite PASS

---

## Test Results Summary

| # | Test | Status | Time | Key Metric |
| --- | --- | --- | --- | --- |
| 1 | M2.7 Chat Completion | ✅ PASS | 7,498ms | `"kindred echo works"` — 253 reasoning tok + 4 output tok |
| 2 | TTS speech-2.8-hd | ✅ PASS | 2,132ms | 74,989 bytes MP3, 4.6s audio, 51 chars billed |
| 3 | Voice Clone permission | ✅ GRANTED | 541ms | status 2013 (not 2038) → account verified |
| 4 | Files API | ✅ PASS | 1,315ms | status 0, 0 existing files |
| 5 | Web Search | ✅ PASS | 941ms | 10 results returned |
| 6 | Image Understanding (VLM) | ✅ PASS | 4,168ms | "A black-backed jackal walks across dry, dusty ground." |
| 7 | Image Generation (image-01) | ✅ PASS | ~44,000ms | 1 image generated, URL returned |
| 8 | Music Generation (music-2.6) | ✅ PASS | ~106,000ms | 1.7MB MP3, 111s of ambient music |

---

## Voice Clone Permission Verdict

**LIVE CLONING IS AVAILABLE.**

The probe returned error `2013` (invalid input), not `2038` (no permission). This confirms:

- Account is **verified** for voice cloning
- Live upload → clone → TTS pipeline is fully available
- The $1.50/clone cost will be charged on first real clone use
- No pre-cloned fallback voice is needed for the demo

---

## Reasoning Token Breakdown (M2.7)

M2.7 is a **reasoning model** — it thinks before answering. The response contains two distinct token budgets:

```
Test prompt: "Reply with exactly three words: kindred echo works"

Tokens:
  prompt:     50
  completion: 257
    ├─ reasoning: 253   (internal thinking — not shown to user)
    └─ output:      4   (visible response: "kindred echo works")

Thinking excerpt:
  "The user says: 'Reply with exactly three words: kindred echo works'.
   So presumably they want a response of exactly those three words…"
```

**Implementation implication**: Always budget `max_tokens ≥ 256` minimum. At 30 tokens, all budget goes to reasoning and `content` is empty — which is a silent failure that would break the chat experience.

For Kindred Echo's persona prompts (which are long and complex), budget `max_tokens: 1024` for normal turns, `max_tokens: 512` for warmup checks.

---

## Confirmed TTS Fix

Initial TTS calls returned `status_code: 2056` despite 0% quota used. Three root causes were found and fixed:

| Issue | Symptom | Fix |
| --- | --- | --- |
| Wrong domain | Used `api.minimaxi.chat` | Use `api.minimax.io` |
| Wrong TTS model | Used `speech-2.8-turbo` / `speech-2.6-*` | Use `speech-2.8-hd` (only HD is in plan) |
| `output_format` in body | Included `"output_format": "hex"` | Omit entirely — audio comes in `data.audio` regardless |

The fix was confirmed by reverse-engineering the `mmx-cli` source which revealed the correct domain (`var H={global:"https://api.minimax.io"}`) and correct request format.

---

## New Model Types Confirmed (beyond original plan)

Tests 5–8 were not in the original Kindred Echo plan. They are available and working:

| Model | Path | Primary use | Time |
| --- | --- | --- | --- |
| Web Search | `/v1/coding_plan/search` | Could be used to ground persona in real-world context | ~2s |
| Image Understanding | `/v1/coding_plan/vlm` | Could analyze photos of the loved one for context | ~5s |
| Image Generation | `/v1/image_generation` | Could generate a memorial visual / room background | ~45s |
| Music Generation | `/v1/music_generation` | Could generate ambient background music for the chat experience | ~90-120s |

None of these are in the current MVP scope, but they are available and tested.

---

## Quota Consumed by This Test Run

| Bucket | Consumed | Limit | Remaining (approx) |
| --- | --- | --- | --- |
| M2.7 requests (5-hr) | 1 | 4,500 | ~4,499 |
| VLM requests (5-hr) | 1 | 4,500 | ~4,499 |
| Web search requests (5-hr) | 1 | 4,500 | ~4,499 |
| speech-hd characters (daily) | 51 | 4,000 | ~3,949 |
| image-01 images (daily) | 1 | 50 | ~49 |
| music-2.6 songs (daily) | 1 | 100 | ~99 |

**Voice clone**: $0 used (probe used a fake file_id, no clone credit charged)

---

## How to Re-Run

```bash
# Fast mode (6 tests, ~20 seconds) — run before each dev session
npm run smoke:minimax -- --fast

# Full mode (8 tests, ~3-4 minutes) — run once per day or before demo
npm run smoke:minimax
```

The fast-mode test consumes approximately:
- 3 M2.7/VLM/Search requests (out of 4,500/5hr)
- 51 TTS characters (out of 4,000/day)

---

## What to Watch For

| Sign | Likely cause | Action |
| --- | --- | --- |
| Test 1 passes but `content` is empty | `max_tokens` too low | Check that smoke test still has `max_tokens: 300` |
| TTS returns 2056 | Wrong model or domain or body has `output_format` | See fix table above |
| Clone returns 2038 | Account lost verification | Contact MiniMax; activate fallback voice |
| Clone returns 2039 | `voice_id` collision | `generateVoiceId()` function has a race condition — add retry |
| Image gen times out | MiniMax server load | Wait and retry; increase timeout to 90s |
| Music gen times out | Normal — 90-120s is expected | Increase timeout to 150s |
