# MiniMax API Reference — Kindred Echo Agent Guide

> **This document is the authoritative reference for any agent building Kindred Echo.**
> All data was verified against live API calls on **2026-05-16** using the production
> Token Plan Plus key. Every type, field name, field type, and gotcha is confirmed real.

---

## Quick Facts

| Item | Value |
|---|---|
| Base URL | `https://api.minimax.io` (all endpoints) |
| Auth | `Authorization: Bearer <MINIMAX_API_KEY>` (header only — no GroupId) |
| Content-Type | `application/json` (except file upload: `multipart/form-data`) |
| Key format | `sk-cp-...` (64+ chars) |
| Account UID | `511929836918784005` |
| Plan | Token Plan Plus (valid until 2026-06-15) |

---

## The One Mandatory Rule: Unwrap `base_resp`

```typescript
// HTTP 200 does NOT mean success. Always check base_resp.
const resp = await fetch(...);
const body = await resp.json();
if (body.base_resp?.status_code !== 0) {
  throw new Error(`MiniMax error ${body.base_resp.status_code}: ${body.base_resp.status_msg}`);
}
```

Every MiniMax response has a `base_resp` object. `status_code: 0` = success. Anything else is a failure, even if HTTP status is 200.

---

## Endpoint Map

| # | Endpoint | Method | URL | Sync? | Quota |
|---|---|---|---|---|---|
| 1 | Text Generation | POST | `/v1/text/chatcompletion_v2` | Yes | 4,500 req/5hr |
| 2 | Text-to-Speech | POST | `/v1/t2a_v2` | Yes | 4,000 chars/day |
| 3 | Voice Clone | POST | `/v1/voice_clone` | Yes | Included |
| 4 | File Upload | POST | `/v1/files/upload` | Yes | Included |
| 4 | File List | GET | `/v1/files/list` | Yes | Included |
| 4 | File Delete | POST | `/v1/files/delete` | Yes | Included |
| 5 | Web Search | POST | `/v1/coding_plan/search` | Yes | 4,500 req/5hr |
| 6 | Image Understanding | POST | `/v1/coding_plan/vlm` | Yes | 4,500 req/5hr |
| 7 | Image Generation | POST | `/v1/image_generation` | Yes | 50 images/day |
| 8 | Music Generation | POST | `/v1/music_generation` | Yes | 100 songs/day |

---

## Quota Windows

| Bucket | Models | Limit | Reset |
|---|---|---|---|
| LLM / VLM / Search | M2.7, VLM, Web Search | 4,500 requests | Every 5 hours (rolling) |
| TTS | speech-2.8-hd | 4,000 characters | Daily (UTC midnight) |
| Image | image-01 | 50 images | Daily (UTC midnight) |
| Music | music-2.6 | 100 songs | Daily (UTC midnight) |
| Music Cover | — | 100 | Daily (UTC midnight) |
| Lyrics | — | 100 | Daily (UTC midnight) |

---

## 1. Text Generation (M2.7 Chat)

**POST** `https://api.minimax.io/v1/text/chatcompletion_v2`

### Request Body

```typescript
{
  model:       "MiniMax-M2.7",   // string, REQUIRED. Only this model on Token Plan Plus.
  messages:    MessageInput[],   // array, REQUIRED. See schema below.
  temperature: number,           // number, REQUIRED. Must be in (0.0, 1.0] — 0.0 causes hard error.
  max_tokens:  number,           // number, REQUIRED. Must be >= 256 (see Gotcha #1).
  stream?:     boolean,          // optional. Default: false.
  top_p?:      number,           // optional. Default: 0.95.
  n?:          1,                // optional. Values > 1 are silently ignored — always 1 choice.
}

MessageInput {
  role:    "user" | "assistant" | "system"  // string, REQUIRED
  content: string                            // string, REQUIRED
  name?:   string                            // optional display name
}
```

### Gotcha #1 — max_tokens must be ≥ 256
M2.7 is a reasoning model. Before producing any visible output, it spends tokens on internal reasoning (thinking). At `max_tokens: 30`, 100% of tokens are consumed by reasoning and `message.content` is empty string. Always set `max_tokens >= 256`. For complex tasks, use 1000+.

### Gotcha #2 — temperature cannot be 0.0
`temperature: 0.0` causes a hard error from the API. Minimum is any value > 0.0. Use `1.0` as the default.

### Response Body (live-verified)

```
{
  id:                   string               // Trace ID, e.g. "065755d3de2bde1064cc6bf46beacd6d"
  choices:              Choice[]             // Always length 1
  created:              number               // Unix timestamp
  model:                string               // "MiniMax-M2.7"
  object:               "chat.completion"    // Literal string
  usage:                Usage
  input_sensitive:      boolean              // true = prompt triggered content filter
  output_sensitive:     boolean              // true = output triggered content filter
  input_sensitive_type: number               // 0 = no issue
  output_sensitive_type:number               // 0 = no issue
  output_sensitive_int: number               // 0 = no issue
  base_resp:            BaseResp
}

Choice {
  finish_reason: "stop" | "length" | "content_filter"
  index:         number   // Always 0
  message:       ResponseMessage
}

ResponseMessage {
  content:           string                  // The visible assistant reply
  role:              "assistant"             // Literal
  name:              "MiniMax AI"            // Literal — always this string
  audio_content:     ""                      // Always "" in text-only mode
  reasoning_content: string                  // Full internal reasoning text (can be long)
  reasoning_details: ReasoningDetail[]       // Same content as reasoning_content, structured
}

ReasoningDetail {
  type:   "reasoning.text"         // Literal
  id:     "reasoning-text-1"       // Literal
  format: "MiniMax-response-v1"    // Literal
  index:  0                        // Always 0
  text:   string                   // Same as reasoning_content
}

Usage {
  total_tokens:              number   // prompt + completion
  total_characters:          0        // Always 0 on Token Plan (not the billing unit)
  prompt_tokens:             number
  completion_tokens:         number   // reasoning_tokens + visible_output_tokens
  completion_tokens_details: {
    reasoning_tokens: number          // Tokens spent on thinking (not billed extra)
  }
}

BaseResp { status_code: 0, status_msg: "" }
```

### Example — extracting visible output

```typescript
const msg = body.choices[0].message;
const visibleOutput = msg.content;                          // The reply to show users
const thinkingText  = msg.reasoning_content;                // Internal reasoning (log/debug)
const reasoningTok  = body.usage.completion_tokens_details.reasoning_tokens;
const visibleTok    = body.usage.completion_tokens - reasoningTok;
```

---

## 2. Text-to-Speech

**POST** `https://api.minimax.io/v1/t2a_v2`

### Request Body

```typescript
{
  model:          "speech-2.8-hd",           // string, REQUIRED. Only this model in TTS quota.
  text:           string,                    // string, REQUIRED. 1–10,000 chars.
  stream?:        false,                     // optional. Default: false.
  language_boost?: string,                   // optional. "auto" | "en" | "zh" | "ja" | "ko" | ...
  voice_setting:  VoiceSetting,              // object, REQUIRED.
  audio_setting?: AudioSetting,              // optional.
  // ⚠️ DO NOT include output_format — triggers status_code 2056 on Token Plan keys.
}

VoiceSetting {
  voice_id: string    // REQUIRED. Built-in or cloned voice ID.
  speed:    number    // REQUIRED. Range: 0.5–2.0. Use 1.0 as default.
  vol:      number    // REQUIRED. Range: 0.1–10.0. Use 1.0 as default.
  pitch:    number    // REQUIRED. Range: -12 to 12. Use 0 as default.
}

AudioSetting {
  sample_rate: 8000|16000|22050|24000|32000|44100   // Default: 32000
  bitrate:     32000|64000|128000|256000             // Default: 128000
  format:      "mp3" | "pcm" | "flac"               // Default: "mp3"
  channel:     1 | 2                                 // Default: 1
}
```

### Gotcha — Never include `output_format`
Including `output_format` in the request body triggers `status_code: 2056` on Token Plan keys, even though audio is always returned as hex in `data.audio` regardless. Remove this field entirely.

### Confirmed Working Voice ID (international platform)
```
"English_expressive_narrator"
```

### Response Body (live-verified)

```
{
  data: {
    audio:  string    // Hex-encoded audio. Decode: Buffer.from(audio, "hex")
    status: 2         // Always 2 (completed) for non-streaming
    ced:    ""        // Internal field. Always "". Ignore.
  }
  extra_info: {
    audio_length:             number   // Duration in milliseconds (e.g. 1872 = 1.872s)
    audio_sample_rate:        number   // e.g. 32000
    audio_size:               number   // Actual bytes of audio (e.g. 31746)
    bitrate:                  number   // e.g. 128000
    word_count:               number   // Characters processed (NOT word count — naming bug)
    invisible_character_ratio:number   // 0 = no invisible chars
    usage_characters:         number   // Billed against daily quota (4,000 chars/day)
    audio_format:             string   // "mp3"
    audio_channel:            number   // 1 = mono
  }
  trace_id: string    // Unique trace ID
  base_resp: BaseResp
}
```

### Example — playing audio in browser

```typescript
const hex = body.data.audio;
const bytes = Buffer.from(hex, "hex");
const blob = new Blob([bytes], { type: "audio/mpeg" });
const url = URL.createObjectURL(blob);
const audio = new Audio(url);
audio.play();
```

---

## 3. Voice Clone

**POST** `https://api.minimax.io/v1/voice_clone`

> ⚠️ Not `/v1/voice_clone/clone_voice` — that path returns 404.

### Request Body

```typescript
{
  file_id:                   string | number, // REQUIRED. Prefer JSON number when ≤ MAX_SAFE_INTEGER (matches Files delete shape).
  voice_id:                  string,   // REQUIRED. Your chosen ID for the cloned voice.
  model?:                    "speech-2.8-hd",  // optional. TTS model for demo generation.
  text?:                     string,   // optional. Text to synthesize with cloned voice.
  need_noise_reduction?:     boolean,  // optional. Apply noise reduction to input audio.
  need_volume_normalization?:boolean,  // optional. Normalize volume of input audio.
}
```

### voice_id Rules
- **Global namespace**: voice_ids are shared across ALL MiniMax accounts worldwide.
- **Use a unique prefix**: `KE_<userId>_<timestamp>` to avoid collisions.
- Collisions return `status_code: 2054` ("voice id already exists").

### Response Body (live-verified)

```
{
  input_sensitive:      boolean   // Content filter for audio
  input_sensitive_type: number    // 0 = no issue
  demo_audio:           string    // Hex audio of cloned voice (if text was provided); else ""
  base_resp:            BaseResp
}
```

### Permission Probe Pattern

To check if your account can clone voices WITHOUT wasting quota on a real upload:

```typescript
const resp = await fetch("https://api.minimax.io/v1/voice_clone", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${KEY}` },
  body: JSON.stringify({ file_id: "1", voice_id: "probe_test" })
});
const body = await resp.json();
const code = body.base_resp.status_code;
// code === 2013 → permission GRANTED (bad file_id rejected at input validation)
// code === 2038 → permission DENIED (account not verified)
```

### Error Codes for this Endpoint

| Code | Meaning | Action |
|---|---|---|
| 0 | Clone successful | Proceed |
| 2013 | Invalid params (bad file_id or voice_id) | If probing: permission IS granted |
| 2038 | Permission denied | Account needs verification via MiniMax support |
| 2054 | voice_id already taken | Choose a different voice_id |
| 2056 | Quota exhausted | Wait for reset |

---

## 4. Files API

### Upload — POST `https://api.minimax.io/v1/files/upload`

Request is `multipart/form-data` (NOT JSON).

```
Form fields:
  purpose: "voice_clone"           string, REQUIRED
  file:    <binary audio data>     binary, REQUIRED
           Content-Type: audio/mpeg (or appropriate MIME)

Audio requirements:
  Duration:   10 seconds – 5 minutes
  Formats:    mp3, m4a, wav, aac, ogg, flac
  Quality:    Clear speech, minimal background noise (or use need_noise_reduction)
```

### Gotcha — multipart `Content-Type` must match real audio bytes

Browsers often leave `File.type` empty; Kindred Echo previously defaulted validation MIME to `audio/mpeg`. Sending WAV/M4A bytes while labeling the part as MPEG can still produce HTTP 200 from upload, but **`POST /v1/voice_clone` may then fail with `2013` (invalid params)** because the stored file metadata does not match the container. The server **sniffs magic bytes** (RIFF/WAVE, ID3, fLaC, `ftyp`, etc.) and overrides filename + MIME for MiniMax when they disagree with the declared type.

```typescript
// Node.js upload example
const form = new FormData();
form.append("purpose", "voice_clone");
form.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), "voice.mp3");

const resp = await fetch("https://api.minimax.io/v1/files/upload", {
  method: "POST",
  headers: { "Authorization": `Bearer ${KEY}` },
  body: form,
});
const body = await resp.json();
const fileIdStr = String(body.file.file_id); // ⚠️ Stringify immediately!
```

**Upload Response:**

```
{
  file: {
    file_id:    number    // ⚠️ int64 JSON number — STRINGIFY immediately: String(file_id)
    bytes:      number    // File size in bytes
    created_at: number    // Unix timestamp
    filename:   string    // Original filename
    purpose:    "voice_clone"
  }
  base_resp: BaseResp
}
```

### List — GET `https://api.minimax.io/v1/files/list`

```
Query params:
  purpose:   "voice_clone"   string, REQUIRED
  page_size: number          optional, default 20
```

**List Response:**

```
{
  files:     FileObject[]   // Array of files (same shape as upload response file field)
  base_resp: BaseResp
}
```

### Delete — POST `https://api.minimax.io/v1/files/delete`

```typescript
body: { file_id: number }   // Use the raw number, not the stringified version
```

**Delete Response:**

```
{
  file_id:   number    // Same as deleted file's file_id
  base_resp: BaseResp
}
```

### ⚠️ Critical: file_id int64 Safety

```typescript
// WRONG — may silently corrupt for very large IDs:
const fileId = body.file.file_id;   // raw number
localStorage.setItem("fileId", fileId); // stored as potentially-imprecise float

// CORRECT:
const fileIdStr = String(body.file.file_id);  // stringify immediately
// Store fileIdStr in DB, pass to voice_clone as string
```

MiniMax docs specify `file_id` as `int64`. The API accepts string-format numbers in the `voice_clone` request. Current observed values are ~15 digits (well within JS safe range), but spec says int64, so always stringify.

---

## 5. Web Search

**POST** `https://api.minimax.io/v1/coding_plan/search`

### Request Body

```typescript
{
  q: string   // REQUIRED. Search query. ⚠️ Field is "q" NOT "query".
}
```

### Response Body (live-verified)

```
{
  organic: [           // Up to 10 results
    {
      title:   string  // Page title
      link:    string  // Full URL
      snippet: string  // Short excerpt
      date:    string  // ISO date string or "" if unavailable
    }
  ]
  related_searches: [  // Up to 8 related query suggestions
    { query: string }
  ]
  base_resp: BaseResp
}
```

---

## 6. Image Understanding (VLM)

**POST** `https://api.minimax.io/v1/coding_plan/vlm`

### Request Body

```typescript
{
  prompt:    string,   // REQUIRED. Question or instruction about the image.
  image_url: string,   // REQUIRED. MUST be a base64 data URI (see gotcha below).
}
```

### Gotcha — `image_url` Must Be a Base64 Data URI

Plain HTTPS URLs (`https://example.com/image.jpg`) return `status_code: 2013` ("invalid image URL"). The API requires the image to be embedded as a base64 data URI.

```typescript
// Correct approach: fetch the image, base64-encode it, build data URI
const imgResp = await fetch(imageUrl);
const imgBuf  = await imgResp.arrayBuffer();
const imgB64  = Buffer.from(imgBuf).toString("base64");
const dataUri = `data:image/jpeg;base64,${imgB64}`;

// Then pass dataUri as image_url
```

### Response Body (live-verified)

```
{
  content:   string    // The model's description / answer
  base_resp: BaseResp
}
```

---

## 7. Image Generation

**POST** `https://api.minimax.io/v1/image_generation`

This is a **synchronous** endpoint. Typical wait: **15–50 seconds**. Plan for up to 90s timeout.

### Request Body

```typescript
{
  model:            "image-01",      // string, REQUIRED.
  prompt:           string,          // string, REQUIRED. Describe the image.
  aspect_ratio?:    string,          // optional. "1:1"|"16:9"|"9:16"|"4:3"|"3:4"|"2:3"|"3:2". Default: "1:1".
  response_format?: "url"|"base64",  // optional. Default: "url". URLs expire in 24 hours.
  n?:               number,          // optional. 1–4 images. Default: 1.
}
```

### Response Body (live-verified)

```
{
  id:   string          // Unique trace ID for this generation
  data: {
    image_urls: string[]  // URLs (if response_format="url") or base64 strings (if "base64")
                          // URLs expire in 24 hours — save/proxy promptly
  }
  metadata: {
    success_count: string  // ⚠️ STRING "1", not number. Use parseInt().
    failed_count:  string  // ⚠️ STRING "0", not number. Use parseInt().
  }
  base_resp: BaseResp
}
```

### ⚠️ metadata values are strings, not numbers

```typescript
// WRONG:
if (body.metadata.success_count > 0) { ... }  // String comparison, always truthy if non-empty

// CORRECT:
if (parseInt(body.metadata.success_count, 10) > 0) { ... }
```

---

## 8. Music Generation

**POST** `https://api.minimax.io/v1/music_generation`

This is a **synchronous** endpoint. Typical wait: **90–145 seconds**. Always use 150s+ timeout.

### Request Body

```typescript
{
  model:            "music-2.6",     // string, REQUIRED.
  prompt:           string,          // string, REQUIRED. Style/mood description.
  is_instrumental?: boolean,         // optional. true = skip lyrics. Default: false.
  lyrics?:          string,          // Required when is_instrumental is false or omitted.
  audio_setting?:   AudioSetting,    // optional.
}

AudioSetting {
  sample_rate?: 16000|32000|44100   // Default: 44100
  bitrate?:     64000|128000|256000 // Default: 128000
  format?:      "mp3"|"pcm"|"flac"  // Default: "mp3"
}
```

### Response Body (live-verified)

```
{
  data: {
    audio:  string  // Hex-encoded audio. Decode: Buffer.from(audio, "hex")
                    // Typical: 2–3 MB for a full track (~140 seconds)
    status: 2       // Always 2 (completed) for synchronous responses
  }
  trace_id: string
  extra_info: {
    music_duration:    number   // Duration in milliseconds (e.g. 139755 = ~140s)
    music_sample_rate: number   // e.g. 44100
    music_channel:     number   // 2 = stereo (always stereo for music-2.6)
    bitrate:           number   // e.g. 128000
    music_size:        number   // Bytes of audio data
  }
  analysis_info: null   // Always null — reserved for future use
  base_resp: BaseResp
}
```

---

## Error Code Reference

| Code | Name | When It Appears | Action |
|---|---|---|---|
| 0 | Success | Any endpoint | Proceed |
| 1002 | Rate limit | Any endpoint | Wait for window reset |
| 1004 | Token/Group mismatch | TTS, any | Remove GroupId from request |
| 2013 | Invalid params | Any; voice clone = permission OK signal | Fix params; for clone probe: permission granted |
| 2038 | Clone permission denied | Voice clone | Contact MiniMax support for account verification |
| 2049 | Invalid API key | Any | Check MINIMAX_API_KEY value |
| 2054 | Voice ID not found / already exists | TTS, voice clone | Check voice_id spelling; choose different ID |
| 2056 | Quota exhausted | Any | Wait for quota window reset |

---

## Common Patterns

### Pattern 1 — Base `minimax()` fetch helper

```typescript
async function minimax(path: string, body: unknown, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.minimax.io${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MINIMAX_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
```

### Pattern 2 — Decode hex audio to playable file

```typescript
function hexToAudioBuffer(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

// Save to file (Node.js):
import fs from "fs";
fs.writeFileSync("output.mp3", hexToAudioBuffer(body.data.audio));

// Play in browser (after fetching from server):
const bytes = hexToAudioBuffer(body.data.audio);
const blob = new Blob([bytes], { type: "audio/mpeg" });
const url = URL.createObjectURL(blob);
new Audio(url).play();
```

### Pattern 3 — Full voice clone pipeline

```typescript
// Step 1: Upload audio file
const form = new FormData();
form.append("purpose", "voice_clone");
form.append("file", audioBlob, "voice.mp3");
const uploadResp = await fetch("https://api.minimax.io/v1/files/upload", {
  method: "POST",
  headers: { "Authorization": `Bearer ${KEY}` },
  body: form,
});
const uploadBody = await uploadResp.json();
const fileIdStr = String(uploadBody.file.file_id);  // ⚠️ Stringify!

// Step 2: Clone the voice
const cloneResp = await minimax("/v1/voice_clone", {
  file_id: fileIdStr,
  voice_id: `KE_${userId}_${Date.now()}`,  // unique prefix prevents collisions
  need_noise_reduction: true,
  need_volume_normalization: true,
});
// cloneResp.base_resp.status_code === 0 → clone complete

// Step 3: Use cloned voice in TTS
const ttsResp = await minimax("/v1/t2a_v2", {
  model: "speech-2.8-hd",
  text: "Your message here.",
  voice_setting: { voice_id: `KE_${userId}_${timestamp}`, speed: 1, vol: 1, pitch: 0 },
  audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
});
const audioBuffer = Buffer.from(ttsResp.data.audio, "hex");
```

### Pattern 4 — VLM with image fetch

```typescript
async function analyzeImage(imageUrl: string, prompt: string): Promise<string> {
  // Fetch and base64-encode the image
  const imgResp = await fetch(imageUrl);
  const imgBuf  = await imgResp.arrayBuffer();
  const mimeType = imgResp.headers.get("content-type") ?? "image/jpeg";
  const b64      = Buffer.from(imgBuf).toString("base64");
  const dataUri  = `data:${mimeType};base64,${b64}`;

  const resp = await minimax("/v1/coding_plan/vlm", { prompt, image_url: dataUri });
  if (resp.base_resp?.status_code !== 0) throw new Error(resp.base_resp?.status_msg);
  return resp.content;
}
```

---

## Smoke Test

Run validation against the live API:

```bash
# Full suite (all 8 endpoints, takes ~3-5 minutes):
npm run smoke:minimax

# Fast mode (skips image + music generation, ~30 seconds):
npm run smoke:minimax -- --fast
```

Results are printed to stdout. Exit code 0 = all run tests passed. Exit code 1 = failures.

**Important about fast mode:** The smoke test correctly counts `6/6 passed | 2 skipped` (not `8/8`) when `--fast` is used. The verdict shows `🟡 PARTIAL CHECK` when tests are skipped — not `🟢 ALL SYSTEMS GO`. Always run the full suite before deploying.

---

## Confirmed Smoke Test Results (2026-05-16)

All 8 endpoints passed live validation:

| Test | Model | Status | Time | Notes |
|---|---|---|---|---|
| M2.7 Chat | MiniMax-M2.7 | ✅ PASS | ~7s | reasoning_tokens: 239/243 completion tokens |
| TTS | speech-2.8-hd | ✅ PASS | ~2.6s | 24 chars billed, 1.87s audio |
| Voice Clone probe | — | ✅ PASS | ~1.3s | status 2013 = permission GRANTED |
| Files API | — | ✅ PASS | ~1.1s | Upload + List + Delete confirmed |
| Web Search | — | ✅ PASS | ~1.7s | 10 organic + 8 related results |
| VLM | — | ✅ PASS | ~7.3s | base64 data URI required |
| Image Gen | image-01 | ✅ PASS | ~15.6s | metadata strings not numbers |
| Music Gen | music-2.6 | ✅ PASS | ~145s | 2.2MB MP3, stereo, 140s track |

---

## Things to Never Do

| ❌ Don't | ✅ Do |
|---|---|
| Include `output_format` in TTS request | Omit it entirely |
| Use `MiniMax-M2.7-highspeed` model | Use `MiniMax-M2.7` |
| Send GroupId header | Remove it from all requests |
| Use `max_tokens < 256` for M2.7 | Set at least 256 |
| Use `temperature: 0` | Use `temperature: 1.0` |
| Pass plain HTTPS URL to VLM `image_url` | Base64-encode the image into a data URI |
| Treat `body.metadata.success_count` as number | `parseInt(body.metadata.success_count, 10)` |
| Store `file_id` as JS Number | `String(body.file.file_id)` immediately |
| Use `/v1/voice_clone/clone_voice` | Use `/v1/voice_clone` |
| Trust HTTP 200 as success | Always check `base_resp.status_code === 0` |
| Use `temperature: 0` | Use any value in `(0.0, 1.0]` |
