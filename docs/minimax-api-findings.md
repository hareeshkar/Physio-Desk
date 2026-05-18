# MiniMax API Findings for Kindred Echo

**Project:** Kindred Echo  
**Purpose:** Conversational AI that can speak in a deceased loved one's cloned voice for a private, consent-gated family memory experience.  
**Research date:** May 16, 2026

This document records the MiniMax API facts that should drive the implementation. It separates confirmed documentation from assumptions in the original concept.

## Token Plan Key Limitations

The MiniMax API key in use is a **Token Plan Key** (Starter Plus), not a Pay-as-You-Go key. These behave differently and the difference matters for this project.

| Property | Token Plan Key | Pay-as-You-Go Key |
| --- | --- | --- |
| Billing unit | Credits (prepaid) | Account balance |
| Key format | Token Plan Key | API Key |
| Rate limit | **900 req / hr (15 req / min)** | Higher, plan-dependent |
| TPS cap | **50 TPS normally, 100 TPS off-peak** | Higher |
| Pricing table | Credits pricing page | Pay-as-You-Go pricing page |

### Impact on Kindred Echo

Each chat turn chains at minimum **2 API calls**: one M2.7 streaming generation + one T2A call per sentence. A three-sentence response = 4 MiniMax calls per turn. At 15 req/min, a single active user generating 4-sentence answers can consume the rate limit in ~3 turns of rapid back-and-forth.

**Required mitigations (must be in the plan):**

1. **Client-side debounce**: do not allow the user to send a new message while audio is still playing or streaming.
2. **Rate limit error handler**: detect `status_code: 1002` in every MiniMax response and surface a user-friendly "please wait" message rather than a silent failure.
3. **Sentence batching cap**: limit TTS to a maximum of 4 concurrent sentences before waiting for the first to complete.
4. **Demo mode awareness**: inform demo presenters that rapid repeated queries can exhaust the per-hour quota.

## Smoke Test Status

**Last run**: 2026-05-16 — **4/4 PASS** — see [`smoke-test-results.md`](./smoke-test-results.md) for full details.

| Test | Result | Key finding |
| --- | --- | --- |
| M2.7 Chat | ✅ | Model `MiniMax-M2.7` works; `-highspeed` not included in this plan |
| TTS speech-2.8-hd | ✅ | Model confirmed; `output_format` must be omitted; domain `api.minimax.io` |
| Voice Clone permission | ✅ GRANTED | Account is verified; live cloning is available |
| Files API | ✅ | Upload endpoint accessible; 0 existing files |

## Confirmed API Endpoints (All Verified 2026-05-16)

**Single base URL for all endpoints**: `https://api.minimax.io`  
**Auth**: `Authorization: Bearer <MINIMAX_API_KEY>` — no GroupId header/param needed.  
**Full reference**: [`token-plan-api-guide.md`](./token-plan-api-guide.md)

| Capability | Path | Timing | Notes |
| --- | --- | --- | --- |
| Text generation (M2.7) | `POST /v1/text/chatcompletion_v2` | Streaming | `api.minimax.chat` rejects Token Plan keys (2049). |
| TTS | `POST /v1/t2a_v2` | ~2s | Omit `output_format`. Model must be `speech-2.8-hd`. |
| Voice clone | `POST /v1/voice_clone` | ~1s | `/v1/voice_clone/clone_voice` returns 404 — wrong path. |
| File upload | `POST /v1/files/upload` | <5s | Multipart form. `file_id` is int64 — store as string. |
| File list | `GET /v1/files/list?purpose=voice_clone` | <1s | Check existing uploaded files. |
| Web search | `POST /v1/coding_plan/search` | ~2s | Param: `{q: "..."}`. Returns `response.organic[]`. |
| Image understanding (VLM) | `POST /v1/coding_plan/vlm` | ~5s | `image_url` must be base64 data URI. Returns `response.content`. |
| Image generation | `POST /v1/image_generation` | ~40-50s | Synchronous. Model `image-01`. Returns `data.image_urls[]`. |
| Music generation | `POST /v1/music_generation` | ~90-120s | Synchronous. Model `music-2.6`. Returns `data.audio` (hex). |

## Official Sources

| Area | Official source |
| --- | --- |
| OpenAI-compatible text API | https://platform.minimax.io/docs/api-reference/text-openai-api |
| Anthropic-compatible text API | https://platform.minimax.io/docs/api-reference/text-anthropic-api |
| Model overview | https://platform.minimax.io/docs/guides/models-intro |
| M2.7 announcement | https://www.minimax.io/news/minimax-m27-en |
| File upload API | https://platform.minimax.io/docs/api-reference/file-management-upload |
| Voice clone guide | https://platform.minimax.io/docs/guides/speech-voice-clone |
| Voice clone API reference | https://platform.minimax.io/docs/api-reference/voice-cloning-clone |
| T2A HTTP API | https://platform.minimax.io/docs/api-reference/speech-t2a-http |
| T2A WebSocket guide | https://platform.minimax.io/docs/guides/speech-t2a-websocket |
| Speech 2.6 announcement | https://www.minimax.io/news/minimax-speech-26 |
| Model release notes | https://platform.minimax.io/docs/release-notes/models |
| Pay-as-you-go pricing | https://platform.minimax.io/docs/guides/pricing-paygo |

## Key Corrections to the Original Concept

1. **Speech 2.6 was not released on May 15, 2026.** MiniMax release notes list Speech 2.6 on Oct. 29, 2025, and the announcement page is dated 2025.10.30.
2. **Speech 2.8 is now available in the docs.** The product can still use Speech 2.6 as requested, but the plan should mention that Speech 2.8 is available and may be a fallback or upgrade path.
3. **`MiniMax-M2.7-highspeed` costs more than standard M2.7.** Pay-as-you-go pricing lists highspeed at $0.6/M input and $2.4/M output, while standard M2.7 is $0.3/M input and $1.2/M output.
4. **Rapid Voice Cloning is not ~$0.01 per clone.** Official pricing lists Rapid Voice Cloning at $1.5 per voice.
5. **M2.7 compatible APIs do not accept audio/image inputs.** The compatible OpenAI and Anthropic docs say audio/image or image/document inputs are not currently supported. Voice transcripts must be generated separately before being injected as text.
6. **Model name casing matters.** The compatible docs use `MiniMax-M2.7` and `MiniMax-M2.7-highspeed`, not `minimax-m2.7`.

## Text Generation: MiniMax M2.7

### Supported Compatibility APIs

MiniMax supports both OpenAI-compatible and Anthropic-compatible interfaces.

| Interface | Base URL | Notes |
| --- | --- | --- |
| OpenAI-compatible | `https://api.minimax.io/v1` | Works with the OpenAI SDK and chat completions style. |
| Anthropic-compatible | `https://api.minimax.io/anthropic` | Recommended by MiniMax docs for supported M-series models. |

### Supported Models

| Model | Context window | Approx output speed | Pricing |
| --- | ---: | ---: | --- |
| `MiniMax-M2.7` | 204,800 tokens | ~60 tokens/sec | $0.3/M input, $1.2/M output |
| `MiniMax-M2.7-highspeed` | 204,800 tokens | ~100 tokens/sec | $0.6/M input, $2.4/M output |

### M2.7 Product Claims Relevant to This App

From the official M2.7 announcement:

- M2.7 has improved character consistency and emotional intelligence.
- M2.7 maintained a 97% skill adherence rate across 40+ complex skills, each over 2,000 tokens.
- M2.7 is available on the MiniMax API platform.

These claims support using M2.7 for the persona layer, but they should not be overstated as a guarantee that a grief persona will always behave safely.

### Critical API Constraints (confirmed from live docs)

| Constraint | Detail |
| --- | --- |
| `temperature` | Must be in the range **(0.0, 1.0]** — values outside this return a hard error, not a warning. Do not pass `0`. |
| `n` parameter | Only supports value **`1`**. Some OpenAI SDK wrappers default to a different value; set explicitly. |
| `presence_penalty`, `frequency_penalty`, `logit_bias` | **Ignored silently** — do not rely on them. |
| Image / audio input | **Not supported** — M2.7 compatibility APIs only accept text messages. |
| Reasoning content (`<think>` tags) | Must be **preserved completely** in the assistant message when appending to conversation history. Truncating them breaks multi-turn coherence. |
| `reasoning_split: true` (extra_body) | Separates thinking content into a `reasoning_details` field. Useful for debugging persona drift but adds token overhead. |
| Multi-turn tool call history | The complete `response_message` object (including the `tool_calls` field) must be appended to message history — not just the `content` string. |

### Implementation Notes

- Prefer `MiniMax-M2.7-highspeed` for the live demo to minimize time to first spoken response.
- Keep `MiniMax-M2.7` as a lower-cost fallback for non-demo sessions.
- Use streaming text generation.
- Preserve complete assistant messages in conversation history as MiniMax compatibility docs instruct, especially if reasoning/tool fields are present. This includes any `<think>` content.
- Keep the persona prompt and transcript context text-only unless another API is introduced for transcription or image captioning.
- Always set `temperature: 1.0` explicitly. Do not pass `0` or omit the field if the SDK default could be outside (0.0, 1.0].

## File Upload API

### Endpoint

```http
POST https://api.minimax.io/v1/files/upload
Authorization: Bearer ${MINIMAX_API_KEY}
Content-Type: multipart/form-data
```

### Required Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `purpose` | string | Yes | One of `voice_clone`, `prompt_audio`, `t2a_async_input`. |
| `file` | binary | Yes | Uploaded file binary. |

### Supported Purposes

| Purpose | Use |
| --- | --- |
| `voice_clone` | Source audio for rapid voice cloning. |
| `prompt_audio` | Optional short sample audio to improve clone quality. |
| `t2a_async_input` | Text input file for async long-form TTS. |

### Response Shape

The response includes:

- `file.file_id`: integer, int64
- `file.bytes`
- `file.created_at`
- `file.filename`
- `file.purpose`
- `base_resp.status_code`
- `base_resp.status_msg`

## Voice Clone API

### Endpoint

```http
POST https://api.minimax.io/v1/voice_clone
Authorization: Bearer ${MINIMAX_API_KEY}
Content-Type: application/json
```

### Source Audio Requirements

| Constraint | Requirement |
| --- | --- |
| Formats | `mp3`, `m4a`, `wav` |
| Duration | 10 seconds minimum, 5 minutes maximum |
| Size | 20 MB maximum |

### Required Body Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `file_id` | integer | Yes | Returned by File Upload API. |
| `voice_id` | string | Yes | Custom ID for the cloned voice. |

### `voice_id` Rules

- Length must be 8-256 characters.
- Must start with an English letter.
- Can contain letters, digits, `-`, and `_`.
- Cannot end with `-` or `_`.
- **Must be globally unique** — reusing a `voice_id` string that already exists returns a `2013` error. Two demo runs with the same loved one's name will collide unless the ID includes a random suffix.

**Recommended generation strategy:**

```ts
function generateVoiceId(roomId: string): string {
  // KE_ prefix, first 8 chars of roomId (UUID), 6-char random hex suffix
  const suffix = Math.random().toString(16).slice(2, 8);
  return `KE_${roomId.replace(/-/g, "").slice(0, 8)}_${suffix}`;
}
// Example: "KE_a1b2c3d4_f09e3a" — 18 chars, valid format
```

### Optional Clone Prompt

`clone_prompt` can improve similarity and stability.

```json
{
  "clone_prompt": {
    "prompt_audio": 987654321,
    "prompt_text": "This voice sounds natural and pleasant."
  }
}
```

Prompt audio requirements:

- `mp3`, `m4a`, or `wav`
- Less than 8 seconds
- 20 MB maximum
- `prompt_text` must match the audio and end with punctuation

### Preview Text

The clone API can accept optional preview `text` and `model`. If provided, it returns a preview audio URL in `demo_audio`, and the preview is billed according to T2A character pricing.

### Persistence Rule

MiniMax docs state that if a cloned voice is not used within 7 days, the system will delete it.

Implementation response:

- Trigger a short warmup/preview TTS call immediately after cloning.
- Store `voice_id`, clone time, and last-used time in Supabase.
- Schedule a keepalive only if the product policy and MiniMax terms permit it.
- Surface to the user that availability depends on continued service/API access.

### `file_id` Type Safety Warning

The File Upload API returns `file_id` as an `int64`. JavaScript `number` can only safely represent integers up to 2^53 − 1 (`Number.MAX_SAFE_INTEGER`). MiniMax `int64` values can exceed this range.

**Risk**: If MiniMax issues a `file_id` above `9007199254740991`, parsing it as `number` will silently corrupt the value.

**Mitigation**: Accept and store `file_id` as a `string` in TypeScript types. Pass it back to the clone API as a string; MiniMax accepts both.

```ts
// Safe TypeScript type
type MiniMaxFile = {
  file_id: string;   // store as string, not number
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
};
```

### Content Safety Response Field

Every Voice Clone API response includes an `input_sensitive` field:

```json
{
  "input_sensitive": {
    "type": 0
  }
}
```

| `type` value | Meaning |
| --- | --- |
| `0` | Normal — no safety issue |
| `1` | Severe violation |
| `2` | Pornographic |
| `3` | Advertisement |
| `4` | Prohibited content |
| `5` | Abusive language |
| `6` | Terror / violence |
| `7` | Other |

The server must check this field before storing the `voice_id`. A non-zero value means the clone was rejected or flagged.

### Optional Clone Enhancement Flags

These two boolean flags are available on the clone request and should be enabled for better results:

| Flag | Default | Recommendation |
| --- | --- | --- |
| `need_noise_reduction` | `false` | Set `true` — family recordings (voicemails, phone calls) nearly always have background noise |
| `need_volume_normalization` | `false` | Set `true` — normalizes inconsistent recording levels |

## Text to Audio: Speech 2.6

### HTTP Endpoint

```http
POST https://api.minimax.io/v1/t2a_v2
Authorization: Bearer ${MINIMAX_API_KEY}
Content-Type: application/json
```

MiniMax also lists an alternate reduced-time-to-first-audio endpoint:

```text
https://api-uw.minimax.io/v1/t2a_v2
```

### WebSocket Endpoint

```text
wss://api.minimax.io/ws/v1/t2a_v2
```

The WebSocket guide supports real-time text-to-speech with `task_start`, `task_continue`, and `task_finish` events.

### Supported Speech Models in Current Docs

| Model | Notes |
| --- | --- |
| `speech-2.6-hd` | Higher fidelity, strong clone similarity, 40 languages. |
| `speech-2.6-turbo` | Lower latency and more affordable, ideal for agents. |
| `speech-2.8-hd` | Newer model with sound tags and high realism. |
| `speech-2.8-turbo` | Newer low-latency model with sound tags. |

### Request Fields

Required:

| Field | Type | Notes |
| --- | --- | --- |
| `model` | string | Example: `speech-2.6-turbo`. |
| `text` | string | Must be under 10,000 characters. |

Important optional fields:

| Field | Type | Notes |
| --- | --- | --- |
| `stream` | boolean | Enables streaming output. |
| `stream_options.exclude_aggregated_audio` | boolean | Avoid returning a final full aggregate chunk if not needed. |
| `voice_setting.voice_id` | string | Required for the target voice. Supports cloned voices. |
| `voice_setting.speed` | number | Range `[0.5, 2]`. |
| `voice_setting.vol` | number | Range `(0, 10]`. |
| `voice_setting.pitch` | integer | Range `[-12, 12]`. |
| `voice_setting.emotion` | string | Includes `happy`, `sad`, `angry`, `fearful`, `disgusted`, `surprised`, `calm`, `fluent`, `whisper`. |
| `audio_setting.sample_rate` | integer | Supports `8000`, `16000`, `22050`, `24000`, `32000`, `44100`. |
| `audio_setting.bitrate` | integer | Supports `32000`, `64000`, `128000`, `256000` for MP3. |
| `audio_setting.format` | string | Supports `mp3`, `pcm`, `flac`, `wav`, `pcmu_raw`, `pcmu_wav`, `opus`; `wav` only in non-streaming mode. |
| `audio_setting.channel` | integer | `1` mono or `2` stereo. |
| `language_boost` | string | Use `auto` when language is unknown. |
| `subtitle_enable` | boolean | Optional sentence or word timestamp output. |

### Response Notes

- Streaming responses can be returned as `application/json` or `text/event-stream`.
- Audio is returned as hex-encoded data.
- `data.status = 1` means synthesizing.
- `data.status = 2` means synthesis completed.
- `extra_info.usage_characters` reports billable characters.
- In streaming mode, output format is hex.

### Token Plan TTS Constraints (Confirmed 2026-05-16)

The Token Plan Plus plan only includes `speech-hd` quota (4,000 characters/day). The following models return error `2056` on this plan:

- `speech-2.8-turbo` → 2056
- `speech-2.6-hd` → 2056
- `speech-2.6-turbo` → 2056

Use `speech-2.8-hd` for all TTS calls. This is actually an upgrade from the original plan's `speech-2.6-turbo` — 2.8-hd has superior prosody AND supports interjection tags.

**Critical TTS request constraint**: Do NOT include `output_format` in the request body. Including it (`"output_format": "hex"`) routes through a different code path that returns error `2056` on Token Plan keys. Audio is returned as hex in `data.audio` regardless of whether this field is present.

### `base_resp` Error Wrapper — HTTP 200 Can Contain Errors

**Critical**: MiniMax returns HTTP 200 for most responses, even when the API call failed internally. The actual success or failure is in `base_resp.status_code` inside the response body.

```json
{
  "data": { "audio": "" },
  "base_resp": {
    "status_code": 1002,
    "status_msg": "rate limit exceeded"
  }
}
```

Every server-side MiniMax caller must unwrap and check `base_resp.status_code` before treating the response as successful. A helper is essential:

```ts
function assertMiniMaxSuccess(resp: { base_resp: { status_code: number; status_msg: string } }) {
  if (resp.base_resp.status_code !== 0) {
    throw new MiniMaxError(resp.base_resp.status_code, resp.base_resp.status_msg);
  }
}
```

### Interjection Tags — Speech 2.8 Only

Tags like `(laughs)`, `(sighs)`, `(breath)`, `(crying)` are **only supported in `speech-2.8-hd` and `speech-2.8-turbo`**. If injected into a `speech-2.6-*` request, they will be read aloud as literal text.

The current plan uses `speech-2.6-turbo` for chat and `speech-2.6-hd` for export. This means no interjection enrichment unless the model is upgraded to 2.8.

**Recommendation for the hackathon**: consider switching to `speech-2.8-turbo` for chat TTS. The grief experience benefits significantly from natural interjections. `speech-2.8-turbo` is still a turbo/low-latency model. Cost is the same ($60/M characters) as `speech-2.6-turbo`.

### Streaming Requirement for Next.js Route Handlers

When returning SSE from a Next.js App Router route handler, the response must include:

```
X-Content-Type-Options: nosniff
```

Without this header, some browsers buffer the entire response before parsing it, breaking the progressive audio experience. If the app is deployed behind Nginx or a reverse proxy, the route must also emit:

```
X-Accel-Buffering: no
```

This can be set globally in `next.config.js` headers config.

### Practical Browser Playback Implication

The frontend cannot directly play hex audio strings. The backend or frontend must convert hex into bytes and append them to a playable audio buffer, Blob URL, MediaSource stream, or queue of short clips.

For the hackathon MVP, the simplest reliable approach is:

1. Segment M2.7 text into sentences.
2. Send each sentence to T2A.
3. Convert each returned hex audio payload into an audio Blob.
4. Queue playback sentence by sentence.

If time allows, use HTTP or WebSocket TTS streaming for each sentence to reduce latency further.

## Speech 2.6 Product Claims

From MiniMax's Speech 2.6 announcement:

- Speech 2.6 targets real-time voice agent scenarios.
- MiniMax claims end-to-end latency below 250 ms for the audio generation pipeline.
- It improves handling of URLs, email addresses, phone numbers, dates, monetary values, and other specialized text formats.
- It introduces Fluent LoRA, intended to make cloned speech more fluent and natural while preserving timbre.
- It supports one-click fluency for voice cloning across 40+ languages.

Implementation caution:

- The claim is useful for the pitch, but product latency will also include M2.7 generation, network round trips, sentence detection, server overhead, and browser playback setup.

## Pricing Snapshot

Official pay-as-you-go pricing at research time:

| Component | Price |
| --- | ---: |
| `MiniMax-M2.7` input | $0.3 / M tokens |
| `MiniMax-M2.7` output | $1.2 / M tokens |
| `MiniMax-M2.7-highspeed` input | $0.6 / M tokens |
| `MiniMax-M2.7-highspeed` output | $2.4 / M tokens |
| M2.7 prompt cache read | $0.06 / M tokens |
| M2.7 prompt cache write | $0.375 / M tokens |
| T2A turbo models | $60 / M characters |
| T2A HD models | $100 / M characters |
| Rapid Voice Cloning | $1.5 per voice |
| Voice Design | $3 per voice |

Demo cost is still low, but the original estimate should be revised because voice cloning dominates per-user setup cost.

## Recommended MiniMax Choices for the MVP

| Need | Recommendation |
| --- | --- |
| Persona LLM | `MiniMax-M2.7-highspeed` during demo; standard `MiniMax-M2.7` as cost fallback. |
| Voice clone | Rapid Voice Clone with `speech-2.6-hd` or `speech-2.6-turbo` preview. |
| Interactive TTS | `speech-2.6-turbo`, `language_boost: "auto"`, MP3, mono, 32 kHz. |
| High-fidelity keepsake export | `speech-2.6-hd`, non-streaming, MP3 or WAV. |
| TTS endpoint | Start with HTTP T2A for simplicity; upgrade to WebSocket if latency requires it. |
| Upload handling | Browser extracts audio from video; server validates and uploads audio to MiniMax. |

## Comprehensive Error Code Reference

| Code | Meaning | Where it appears | Recommended action |
| --- | --- | --- | --- |
| `0` | Success | All APIs | Proceed normally |
| `1000` | Unknown error | All APIs | Log and surface generic error to user |
| `1001` | Timeout | All APIs | Retry once with exponential backoff |
| `1002` | **Rate limit** | All APIs | Surface "please wait" message; do not retry immediately |
| `1004` | Authentication failed | All APIs | Check API key; surface "service not configured" |
| `1013` | Internal service error | All APIs | Retry once; escalate if persistent |
| `2013` | Invalid input format | File upload, voice clone, TTS | Check request body shape; log for debug |
| `2038` | **No clone permission** | Voice clone | Surface account-not-verified message; activate fallback pre-cloned voice |
| `2049` | Authentication error (variant) | Some APIs | Same as `1004` |

## Resolved Questions

1. **Voice clone permission**: ✅ RESOLVED — account is verified (smoke test returns 2013, not 2038). Live cloning is available.
2. **Speech 2.8 upgrade**: ✅ RESOLVED — Token Plan Plus ONLY works with `speech-2.8-hd`. This is actually an upgrade: 2.8-hd supports interjection tags which improve the grief experience.
3. **API domain**: ✅ RESOLVED — use `api.minimax.io` for text + TTS, `api.minimaxi.chat` for voice clone.

## Remaining Open Questions

1. **Transcript grounding**: M2.7 does not transcribe audio. The persona prompt references `transcriptText[]` as grounding, but there is currently no mechanism to populate this field. Options: (a) skip transcripts and rely only on the memory form fields — **recommended for hackathon**, (b) add a manual transcript input field to the setup form, (c) integrate a separate transcription service (Whisper or similar). Option (a) is the safest for demo timebox.
2. **Voice keepalive policy**: The 7-day deletion rule requires a warmup call to preserve cloned voices. Are periodic keepalive calls acceptable under MiniMax's terms of service, or should voices expire naturally unless the family returns?

