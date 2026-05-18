# MiniMax Token Plan API Guide

**Account type**: Token Plan Plus (standard, not Highspeed)  
**All endpoints verified**: 2026-05-16 via live API testing  
**Key format**: `sk-cp-…` (Token Plan Key — different from Pay-as-You-Go key)

---

## The CLI vs Direct REST API — What You Actually Need

MiniMax's documentation says:

> "To call non-text models (Speech, Image, Video, Music) with your Token Plan Key, see the MiniMax CLI guide."

This is **misleading**. The MiniMax CLI (`mmx-cli`) is a **convenience wrapper**, not a gateway. Every model — including TTS, image, music, and vision — is callable directly via the REST API with your Token Plan Key. The CLI is just easier to use for manual terminal tasks.

The reason our early TTS calls failed was **wrong parameters**, not a CLI requirement:
- Wrong domain (`api.minimax.chat` instead of `api.minimax.io`)
- Wrong TTS model (`speech-2.6-turbo` instead of `speech-2.8-hd`)
- Wrong request body (included `output_format: hex` which routes to a broken codepath)

Once those were corrected, TTS worked flawlessly via direct REST API.

**When to actually use the CLI**: Manual one-off tasks from the terminal (generate an audio preview, test an image prompt, check your quota). It is not part of any production integration.

---

## Complete Endpoint Map

All endpoints use the same base URL: **`https://api.minimax.io`**  
Auth header: `Authorization: Bearer <MINIMAX_API_KEY>` (no GroupId needed)

| Capability | Method | Path | Sync? | Quota type |
| --- | --- | --- | --- | --- |
| Text generation (M2.7) | POST | `/v1/text/chatcompletion_v2` | Yes | 5-hr rolling |
| Text-to-Speech | POST | `/v1/t2a_v2` | Yes | Daily (chars) |
| Voice clone | POST | `/v1/voice_clone` | Yes | Pay-per-clone |
| File upload | POST | `/v1/files/upload` | Yes | Storage |
| File list | GET | `/v1/files/list` | Yes | — |
| Web search | POST | `/v1/coding_plan/search` | Yes | 5-hr rolling |
| Image understanding | POST | `/v1/coding_plan/vlm` | Yes | 5-hr rolling |
| Image generation | POST | `/v1/image_generation` | Yes (~40-50s) | Daily (images) |
| Music generation | POST | `/v1/music_generation` | Yes (~90-120s) | Daily (songs) |
| Voice list | GET | `/v1/get_voice` | Yes | — |

> **Note on "Voice clone" domain**: The official OpenAPI spec lists `api.minimax.io`. Our testing found `api.minimaxi.chat` also works for `/v1/voice_clone`. Use `api.minimax.io` for consistency.

---

## Token Plan Plus Quota Table

| Model bucket | 5-hr window | Daily window | Notes |
| --- | --- | --- | --- |
| `MiniMax-M*` (text gen) | **4,500 req** | 45,000 req/week | M2.7 standard only. `-highspeed` not included. |
| `speech-hd` (TTS) | — | **4,000 chars** | speech-2.8-hd only. speech-2.6-* return 2056. |
| `coding-plan-vlm` (vision) | **4,500 req** | 45,000 req/week | Image understanding via /v1/coding_plan/vlm |
| `coding-plan-search` (web) | **4,500 req** | 45,000 req/week | Web search via /v1/coding_plan/search |
| `image-01` (image gen) | — | **50 images** | Synchronous, ~40-50s per image |
| `music-2.6` (music gen) | — | **100 songs** | Synchronous, ~90-120s per song |
| Hailuo video | — | 0/0 | Not included in this plan tier |

The 5-hr window resets on a rolling schedule (not fixed midnight). Current window: 05:00–10:00 UTC.

---

## Per-Endpoint Implementation Notes

### 1. Text Generation — `/v1/text/chatcompletion_v2`

```json
{
  "model": "MiniMax-M2.7",
  "temperature": 1.0,
  "max_tokens": 512,
  "messages": [
    { "role": "system", "content": "You are a warm AI persona." },
    { "role": "user", "content": "Tell me a memory." }
  ]
}
```

**Critical constraints:**

| Constraint | Value | Why |
| --- | --- | --- |
| `model` | `"MiniMax-M2.7"` | `MiniMax-M2.7-highspeed` requires Plus-Highspeed plan |
| `temperature` | `(0.0, 1.0]` | 0 causes a hard API error. Always set 1.0 explicitly. |
| `max_tokens` | ≥ 256 | M2.7 is a **reasoning model** that spends tokens thinking before responding. At 30 tokens, all budget goes to reasoning and `content` is empty. |
| `n` | 1 (implicit) | Only 1 completion supported |
| Image/audio in messages | ❌ Not supported | OpenAI-compatible endpoint is text-only |

**Response: reasoning tokens**

M2.7 separates thinking tokens from output tokens. Always unwrap properly:

```typescript
const msg = choices[0].message;
const visibleContent = msg.content;           // What the user sees
const thinkingContent = msg.reasoning_content; // Internal reasoning (invisible to user)
const usage = response.usage;
const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens;
const outputTokens = usage.completion_tokens - reasoningTokens; // Visible output tokens
```

**Multi-turn history**: When appending assistant messages to conversation history, preserve the **complete message object** including `reasoning_content`. Stripping it breaks multi-turn coherence.

---

### 2. Text-to-Speech — `/v1/t2a_v2`

```json
{
  "model": "speech-2.8-hd",
  "text": "I carry your heart with me.",
  "stream": false,
  "language_boost": "auto",
  "voice_setting": {
    "voice_id": "English_expressive_narrator",
    "speed": 1,
    "vol": 1,
    "pitch": 0
  },
  "audio_setting": {
    "sample_rate": 32000,
    "bitrate": 128000,
    "format": "mp3",
    "channel": 1
  }
}
```

**Critical constraints:**

| Constraint | Value | Why |
| --- | --- | --- |
| `model` | `"speech-2.8-hd"` | Only HD model included in Token Plan Plus. `speech-2.8-turbo`, `speech-2.6-*` → error 2056. |
| `output_format` | **Omit entirely** | Including this field routes through a different code path that returns 2056 on Token Plan keys. Audio is returned as hex in `data.audio` regardless. |
| Domain | `api.minimax.io` | `api.minimaxi.chat` returns 2056 for TTS. |

**Response:**

```typescript
const audioHex: string = response.data.audio;        // Hex-encoded MP3
const audioBytes = Buffer.from(audioHex, "hex");     // Decode to binary
const billedChars: number = response.extra_info.usage_characters;
const durationMs: number = response.extra_info.audio_length;
```

**Interjection tags** (speech-2.8 only):
`(sighs)`, `(laughs)`, `(chuckle)`, `(coughs)`, `(breath)`, `(pant)`, `(inhale)`, `(exhale)`, `(gasps)`, `(sniffs)`, `(groans)`, `(snorts)`, `(burps)`, `(lip-smacking)`, `(humming)`, `(hissing)`, `(emm)`, `(whistles)`, `(sneezes)`, `(crying)`, `(applause)`

**Selected English system voice IDs** (call `/v1/get_voice` or see [`minimax-api-reference.md`](./minimax-api-reference.md)):

| `voice_id` | Character |
| --- | --- |
| `English_expressive_narrator` | Expressive narrator — good for storytelling |
| `English_CalmWoman` | Calm woman — grief-appropriate warmth |
| `English_Gentle-voiced_man` | Gentle man — warm, familiar |
| `English_SentimentalLady` | Sentimental lady — emotional depth |
| `English_ManWithDeepVoice` | Deep-voiced man — gravitas |

---

### 3. Voice Clone — `/v1/voice_clone`

**Step 1 — Upload audio:**

```
POST /v1/files/upload
Content-Type: multipart/form-data

purpose=voice_clone
file=<audio binary>
```

Constraints: mp3/m4a/wav, 10s–5min, ≤ 20MB.

Returns: `file.file_id` as **int64** — store as `string` to avoid JavaScript overflow.

**Step 2 — Clone:**

```json
{
  "file_id": "123456789012345678",
  "voice_id": "KE_a1b2c3d4_f09e3a",
  "text": "Hello, this is a preview of the cloned voice.",
  "model": "speech-2.8-hd",
  "need_noise_reduction": true,
  "need_volume_normalization": true,
  "language_boost": "English"
}
```

**`voice_id` generation (collision-safe):**

```typescript
function generateVoiceId(roomId: string): string {
  const suffix = Math.random().toString(16).slice(2, 8);
  return `KE_${roomId.replace(/-/g, "").slice(0, 8)}_${suffix}`;
  // Example: "KE_a1b2c3d4_f09e3a" — 18 chars, format-compliant
}
```

Rules: 8–256 chars, starts with letter, only `[a-zA-Z0-9_-]`, no trailing `-` or `_`, globally unique.

**Permission error codes:**

| Code | Meaning |
| --- | --- |
| `0` | Success — cloned |
| `2013` | Invalid params (wrong file_id, etc.) |
| `2038` | Account NOT verified for cloning |
| `2039` | `voice_id` already exists — generate a new one |
| `2037` | Audio too short (<10s) or too long (>5min) |
| `1043` | ASR similarity check failed |
| `1044` | Clone prompt similarity check failed |

**7-day expiry**: A cloned voice is deleted if not used in 7 days. Run a warmup TTS call immediately after cloning.

---

### 4. Web Search — `/v1/coding_plan/search`

```json
{ "q": "your search query here" }
```

**Note**: The param is `"q"`, not `"query"` or `"search_count"`. Any other key returns 2013.

Response:

```typescript
const results: { title: string; link: string; snippet: string }[] = response.organic;
```

---

### 5. Image Understanding (VLM) — `/v1/coding_plan/vlm`

```json
{
  "prompt": "What is in this image?",
  "image_url": "data:image/jpeg;base64,<base64-encoded-image>"
}
```

**Critical**: `image_url` must be a **base64 data URI**, not a plain HTTPS URL. Plain HTTPS returns `"invalid image URL"` (2013).

```typescript
// Correct: fetch and encode
const imgRes = await fetch("https://example.com/photo.jpg");
const imgBuf = await imgRes.arrayBuffer();
const b64 = Buffer.from(imgBuf).toString("base64");
const imageUrl = `data:image/jpeg;base64,${b64}`;
```

Response: `{ content: "The image shows...", base_resp: {...} }`

---

### 6. Image Generation — `/v1/image_generation`

```json
{
  "model": "image-01",
  "prompt": "A softly glowing candle on a wooden table, warm and peaceful",
  "aspect_ratio": "1:1",
  "response_format": "url",
  "n": 1
}
```

- Synchronous, takes 40-50 seconds
- `response_format: "url"` → returns `data.image_urls[]` (URL valid for 24 hours)
- `response_format: "base64"` → returns `data.image_base64[]`
- Max 9 images per request (`n` 1–9)

---

### 7. Music Generation — `/v1/music_generation`

```json
{
  "model": "music-2.6",
  "prompt": "Gentle ambient piano, peaceful and warm",
  "is_instrumental": true,
  "audio_setting": {
    "sample_rate": 44100,
    "bitrate": 128000,
    "format": "mp3"
  }
}
```

- Synchronous, takes 90–120 seconds
- `is_instrumental: true` skips the required `lyrics` field
- Returns `data.audio` as hex (same as TTS) when no `output_format` is specified
- `extra_info.music_duration` is in milliseconds

---

## All Confirmed Error Codes

| Code | Message | Common cause | Action |
| --- | --- | --- | --- |
| `0` | Success | — | Proceed normally |
| `1000` | Unknown error | Server-side issue | Retry once |
| `1001` | Timeout | Server-side slow | Retry with longer timeout |
| `1002` | Rate limit | Too many requests in window | Wait; do not retry automatically |
| `1004` | Auth failed / token not match group | Wrong key format or domain | Check key; use `api.minimax.io` |
| `1008` | Insufficient balance | Credits exhausted | Check account balance |
| `1013` | Internal error | Server-side | Retry once |
| `1024` | Internal error (variant) | Server-side | Retry once |
| `1026` | Sensitive content in prompt | Safety filter | Revise prompt |
| `1039` | Token limit | Response too long | Reduce `max_tokens` or input length |
| `1041` | Connection limit | Too many concurrent connections | Reduce concurrency |
| `1042` | Invisible character limit | Illegal chars in input | Sanitize input text |
| `1043` | ASR similarity check failed | Clone audio doesn't match text | Check `file_id` and `text_validation` |
| `1044` | Clone prompt similarity failed | Prompt audio mismatch | Check `clone_prompt` audio/text |
| `2013` | Invalid params | Wrong field name/type/value | Check request body against docs |
| `2037` | Voice duration out of range | Audio too short (<10s) or too long (>5min) | Trim or extend audio |
| `2038` | No clone permission | Account not verified for cloning | Contact MiniMax support |
| `2039` | voice_id duplicate | `voice_id` already exists in account | Generate a new unique `voice_id` |
| `2042` | No access to voice_id | Using another account's voice_id | Use only voice_ids you created |
| `2045` | Rate growth limit | Sudden request spike | Smooth out request rate |
| `2048` | Prompt audio too long | `clone_prompt.prompt_audio` > 8s | Trim prompt audio to < 8s |
| `2049` | Invalid API key | Wrong domain (`.chat` vs `.io`) | Use `api.minimax.io` |
| `2056` | Usage limit exceeded | 5-hr or daily quota hit | Wait for window reset |

---

## `base_resp` Is Not Optional

Every MiniMax API response wraps its actual status in a `base_resp` object. **HTTP 200 does not mean success.**

```typescript
// Required pattern for every MiniMax call
const base = response.base_resp;
if (!base || base.status_code !== 0) {
  throw new MiniMaxError(base.status_code, base.status_msg);
}
// Only now is the response safe to use
```

---

## Rate Limiting Strategy

With Token Plan Plus (4,500 req / 5 hrs = 15 req/min):

- A single chat turn = 1 M2.7 request + 1–4 TTS requests = 2–5 API calls
- At 15 req/min, rapid back-and-forth can exhaust the window in minutes

**Required mitigations:**

1. **Client debounce**: Block new messages while audio is still playing or streaming
2. **2056 handler**: Surface a visible "please wait" message — do not retry automatically
3. **TTS sentence cap**: Max 4 concurrent TTS calls before waiting for audio queue to drain
4. **Demo mode**: Inform demo presenters that rapid repeated queries burn quota fast

---

## The mmx-cli as a Diagnostic Tool

Install once for debugging:

```bash
npm install -g mmx-cli
mmx auth login --api-key <your-key>
mmx quota          # Check live quota usage
mmx speech synthesize --text "Hello" --out test.mp3  # Test TTS
mmx image generate --prompt "test" --out test.jpg     # Test image gen
```

This is NOT part of the Kindred Echo app — it's a manual debugging tool only.

```bash
# Quick quota check (run anytime)
mmx quota
```
