import { env } from '../config/env.js';
import {
  DIET_TYPES,
  FOOD_CATEGORIES,
  FOOD_UNITS,
  REPORT_CATEGORIES,
  REPORT_SEVERITIES,
} from '../models/constants.js';
import { HttpError } from '../utils/http.js';

/**
 * AI features: GreenBot chat, dumping-photo checks and food-photo checks/autofill.
 * OpenAI is used when OPENAI_API_KEY is set; Gemini and Cloud Vision remain as
 * fallbacks for deployments that still use Google keys.
 */

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
// Tried in order if the configured model isn't available to the API key.
const OPENAI_FALLBACK_MODELS = ['gpt-6-luna', 'gpt-5-mini', 'gpt-4.1-mini'];
const ALLERGENS = ['gluten', 'dairy', 'nuts', 'peanuts', 'soy', 'egg', 'fish', 'shellfish', 'sesame'];

const GARBAGE_LABELS = new Set([
  'trash', 'garbage', 'waste', 'litter', 'rubbish', 'plastic bag', 'dumpster', 'landfill',
  'scrap', 'pollution', 'debris', 'junk', 'waste container', 'waste management',
]);
const FOOD_LABELS = new Set([
  'food', 'meal', 'dish', 'cuisine', 'ingredient', 'plate', 'recipe', 'staple food', 'produce',
  'fast food', 'baked goods', 'bread', 'rice', 'curry', 'vegetable', 'fruit', 'snack', 'dessert',
  'breakfast', 'lunch', 'dinner', 'comfort food', 'finger food', 'junk food', 'biryani',
]);

const isKeyError = (status, message = '') =>
  [400, 401, 403].includes(status) && /api key|permission|expired|unauthori[sz]ed/i.test(message);

// Flipped to false when a provider rejects its key, so the UI stops offering that feature.
const keyState = { openai: null, gemini: null, vision: null };
const openaiOn = () => Boolean(env.openai.apiKey) && keyState.openai !== false;
const geminiOn = () => Boolean(env.geminiApiKey) && keyState.gemini !== false;
const visionOn = () => Boolean(env.visionApiKey) && keyState.vision !== false;

export const aiStatus = () => ({
  provider: openaiOn() ? 'openai' : geminiOn() ? 'gemini' : visionOn() ? 'vision' : null,
  chat: openaiOn() || geminiOn(),
  photoCheck: openaiOn() || geminiOn() || visionOn(),
  autofill: openaiOn() || geminiOn(),
  // Older flags, kept for API compatibility.
  gemini: geminiOn(),
  vision: visionOn(),
});

export function aiSummary() {
  if (env.openai.apiKey) return `OpenAI (${env.openai.model})`;
  const parts = [env.geminiApiKey && 'Gemini', env.visionApiKey && 'Cloud Vision'].filter(Boolean);
  return parts.length ? parts.join(' + ') : 'off';
}

/** Startup sanity check so a bad key is obvious in the console, not just in the UI. */
export async function checkAiKeys() {
  try {
    if (env.openai.apiKey) {
      const res = await fetch(`${env.openai.baseUrl}/models/${encodeURIComponent(env.openai.model)}`, {
        headers: { Authorization: `Bearer ${env.openai.apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401) {
        keyState.openai = false;
        console.warn('[ai] OPENAI_API_KEY was rejected. Create a key at https://platform.openai.com/api-keys');
      } else if (res.status === 404) {
        console.warn(`[ai] OpenAI model "${env.openai.model}" isn't available to this key; fallback models will be tried.`);
      } else if (res.ok) {
        keyState.openai = true;
      }
      return;
    }
    if (env.geminiApiKey) {
      const res = await fetch(`${GEMINI_BASE}?pageSize=1`, {
        headers: { 'x-goog-api-key': env.geminiApiKey },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        keyState.gemini = true;
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (isKeyError(res.status, data.error?.message)) keyState.gemini = false;
      console.warn(
        `[ai] GEMINI_API_KEY was rejected (${data.error?.message || res.status}).\n` +
          '     Set OPENAI_API_KEY (or a valid Gemini key) to enable GreenBot and photo checks.',
      );
    }
  } catch {
    /* offline — don't block startup */
  }
}

// ---------------------------------------------------------------------------
// OpenAI (Chat Completions)
// ---------------------------------------------------------------------------

// Models that rejected `reasoning_effort` (non-reasoning models); not sent again.
const noReasoning = new Set();

async function openaiPost(body) {
  try {
    const res = await fetch(`${env.openai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.openai.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    return { res, data: await res.json().catch(() => ({})) };
  } catch (err) {
    console.error(`[ai] OpenAI (${body.model}) request failed:`, err.message);
    throw new HttpError(504, 'The AI service took too long to respond. Please try again.', 'AI_TIMEOUT');
  }
}

/**
 * One Chat Completions call. `schema` ({ name, schema }) asks for strict JSON output.
 * Returns the reply text (JSON text when a schema is given).
 */
export async function openaiGenerate({ system, messages, schema, maxTokens = 2000 }) {
  if (!env.openai.apiKey) {
    throw new HttpError(503, 'The AI assistant is not configured (OPENAI_API_KEY is missing).', 'AI_NOT_CONFIGURED');
  }
  const models = [...new Set([env.openai.model, ...OPENAI_FALLBACK_MODELS])];

  for (const model of models) {
    const body = {
      model,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      max_completion_tokens: maxTokens,
      ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } } } : {}),
      ...(env.openai.reasoningEffort && !noReasoning.has(model) ? { reasoning_effort: env.openai.reasoningEffort } : {}),
    };
    let { res, data } = await openaiPost(body);
    let message = data.error?.message || '';

    if (res.status === 400 && body.reasoning_effort && /reasoning/i.test(message)) {
      // Non-reasoning models don't accept reasoning_effort: retry without it.
      noReasoning.add(model);
      delete body.reasoning_effort;
      ({ res, data } = await openaiPost(body));
      message = data.error?.message || '';
    }
    if (res.status === 404 || data.error?.code === 'model_not_found') {
      console.warn(`[ai] OpenAI model "${model}" unavailable (${message || res.status}), trying the next one.`);
      continue;
    }
    if (res.status === 401) {
      keyState.openai = false;
      console.error(`[ai] OpenAI rejected the API key: ${message}`);
      throw new HttpError(503, 'The AI assistant is unavailable: its API key is invalid. Please contact the site admin.', 'AI_KEY_INVALID');
    }
    if (res.status === 429) {
      if (data.error?.code === 'insufficient_quota') {
        console.error('[ai] OpenAI account has no credit left: add billing at https://platform.openai.com/settings/organization/billing');
        throw new HttpError(503, 'The AI assistant is unavailable right now (out of credit). Please contact the site admin.', 'AI_QUOTA');
      }
      throw new HttpError(429, 'The AI assistant is busy right now. Please try again in a minute.', 'AI_RATE_LIMITED');
    }
    if (!res.ok) {
      console.error(`[ai] OpenAI (${model}) error ${res.status}:`, message);
      throw new HttpError(502, 'The AI service returned an error. Please try again.', 'AI_ERROR');
    }

    const choice = data.choices?.[0];
    const text = (choice?.message?.content || '').trim();
    if (!text) {
      console.warn(`[ai] OpenAI (${model}) returned no text: ${choice?.message?.refusal ? 'refusal' : choice?.finish_reason}`);
      throw new HttpError(502, "I couldn't come up with an answer to that. Try rephrasing?", 'AI_EMPTY');
    }
    keyState.openai = true;
    return text;
  }
  throw new HttpError(502, 'None of the configured OpenAI models is available to this API key.', 'AI_NO_MODEL');
}

const openaiImage = (buffer, mime, detail = 'low') => ({
  type: 'image_url',
  image_url: { url: `data:${mime};base64,${buffer.toString('base64')}`, detail },
});

// ---------------------------------------------------------------------------
// Gemini (fallback)
// ---------------------------------------------------------------------------

export async function geminiGenerate({ system, contents, json = false, temperature = 0.6, maxOutputTokens = 2048 }) {
  if (!env.geminiApiKey) {
    throw new HttpError(503, 'The AI assistant is not configured.', 'AI_NOT_CONFIGURED');
  }
  const models = [...new Set([env.geminiModel, ...GEMINI_FALLBACK_MODELS])];
  let lastError = null;

  for (const model of models) {
    let res;
    try {
      res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents,
          generationConfig: { temperature, maxOutputTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
        }),
        signal: AbortSignal.timeout(45000),
      });
    } catch (err) {
      lastError = new HttpError(504, 'The AI service took too long to respond. Please try again.', 'AI_TIMEOUT');
      console.error(`[ai] Gemini (${model}) request failed:`, err.message);
      continue;
    }

    const data = await res.json().catch(() => ({}));
    const modelMissing = res.status === 404 || (res.status === 400 && /model/i.test(data.error?.message || ''));
    if (modelMissing) {
      console.warn(`[ai] Gemini model "${model}" unavailable, trying next.`);
      continue;
    }
    if (res.status === 429) {
      throw new HttpError(429, 'The AI assistant is busy right now. Please try again in a minute.', 'AI_RATE_LIMITED');
    }
    if (isKeyError(res.status, data.error?.message)) {
      keyState.gemini = false;
      console.error(`[ai] Gemini rejected the API key: ${data.error?.message}.`);
      throw new HttpError(503, 'The AI assistant is unavailable: its API key is invalid or expired. Please contact the site admin.', 'AI_KEY_INVALID');
    }
    if (!res.ok) {
      console.error(`[ai] Gemini (${model}) error ${res.status}:`, data.error?.message);
      throw new HttpError(502, 'The AI service returned an error. Please try again.', 'AI_ERROR');
    }

    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .filter((part) => part.text && !part.thought)
      .map((part) => part.text)
      .join('')
      .trim();
    if (!text) {
      console.warn(`[ai] Gemini (${model}) returned no text: ${candidate?.finishReason || data.promptFeedback?.blockReason || 'EMPTY'}`);
      throw new HttpError(502, "I couldn't come up with an answer to that. Try rephrasing?", 'AI_EMPTY');
    }
    return text;
  }
  throw lastError || new HttpError(502, 'No Gemini model is available for this API key.', 'AI_NO_MODEL');
}

const geminiImage = (buffer, mime) => ({ inlineData: { mimeType: mime, data: buffer.toString('base64') } });

// ---------------------------------------------------------------------------
// Google Cloud Vision (label detection, fallback)
// ---------------------------------------------------------------------------

async function visionLabels(buffer) {
  if (!visionOn()) return null;
  try {
    const res = await fetch(`${VISION_URL}?key=${encodeURIComponent(env.visionApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { content: buffer.toString('base64') }, features: [{ type: 'LABEL_DETECTION', maxResults: 15 }] }],
      }),
      signal: AbortSignal.timeout(12000),
    });
    const json = await res.json().catch(() => ({}));
    const apiError = json.error || json.responses?.[0]?.error;
    if (!res.ok || apiError) {
      if (isKeyError(res.status, apiError?.message)) keyState.vision = false;
      console.error(`[ai] Vision API error: ${apiError?.message || res.status}.`);
      return null;
    }
    return (json.responses?.[0]?.labelAnnotations || []).map((l) => ({
      description: String(l.description || '').toLowerCase(),
      score: Number(l.score) || 0,
    }));
  } catch (err) {
    console.error('[ai] Vision API request failed:', err.message);
    return null;
  }
}

function matchLabels(labels, targets) {
  let best = 0;
  for (const { description, score } of labels) {
    const hit = targets.has(description) || description.split(/\s+/).some((word) => targets.has(word));
    if (hit && score > best) best = score;
  }
  return { matched: best > 0, confidence: best };
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/** GreenBot reply for a [{ role: 'user' | 'assistant', text }] history. */
export async function chatReply({ system, history }) {
  if (openaiOn() || (env.openai.apiKey && !geminiOn())) {
    return openaiGenerate({
      system,
      messages: history.map((m) => ({ role: m.role, content: m.text })),
      maxTokens: 2500,
    });
  }
  return geminiGenerate({
    system,
    contents: history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
    temperature: 0.7,
  });
}

// ---------------------------------------------------------------------------
// Helpers for model output
// ---------------------------------------------------------------------------

function parseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
}

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));
const sentence = (s, max = 240) => (typeof s === 'string' ? s.trim().slice(0, max) : '') || undefined;
const strList = (v, max = 8) =>
  (Array.isArray(v) ? v : []).map((s) => String(s).toLowerCase().trim().slice(0, 40)).filter(Boolean).slice(0, max);

const NOT_ANALYZED = { analyzed: false, verified: false, confidence: 0, labels: [] };

// ---------------------------------------------------------------------------
// Waste (illegal dumping) check
// ---------------------------------------------------------------------------

const WASTE_PROMPT =
  'You check photos that citizens submit to report illegal garbage dumping in an Indian city. ' +
  'isGarbage is true only if garbage, litter, dumped waste, debris or an overflowing bin is clearly visible. ' +
  'If the photo shows something else (a selfie, a clean street, an indoor room, a screenshot, a random object), isGarbage is false. ' +
  'confidence is your certainty in that decision, from 0 to 1. ' +
  'reason is one short, polite sentence for the reporter explaining the decision ' +
  '(e.g. "Plastic bags and household waste dumped beside the road." or "The photo shows a clean street, not dumped waste."). ' +
  'summary describes the scene in one sentence. labels are up to 6 short lowercase tags.';

const WASTE_SCHEMA = {
  name: 'waste_photo_check',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['isGarbage', 'confidence', 'category', 'severity', 'labels', 'summary', 'reason'],
    properties: {
      isGarbage: { type: 'boolean' },
      confidence: { type: 'number' },
      category: { type: 'string', enum: REPORT_CATEGORIES },
      severity: { type: 'string', enum: REPORT_SEVERITIES },
      labels: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' },
      reason: { type: 'string' },
    },
  },
};

const wasteResult = (provider, out) => ({
  analyzed: true,
  provider,
  verified: Boolean(out.isGarbage),
  confidence: clamp01(out.confidence),
  labels: strList(out.labels),
  summary: sentence(out.summary, 200),
  reason: sentence(out.reason),
  suggestedCategory: oneOf(out.category, REPORT_CATEGORIES, undefined),
  suggestedSeverity: oneOf(out.severity, REPORT_SEVERITIES, undefined),
});

/**
 * Checks that a report photo shows garbage. Never throws: if every provider fails
 * the report is simply left for staff to review.
 */
export async function analyzeWasteImage(buffer, mime) {
  if (openaiOn()) {
    try {
      const text = await openaiGenerate({
        schema: WASTE_SCHEMA,
        maxTokens: 1500,
        messages: [{ role: 'user', content: [{ type: 'text', text: WASTE_PROMPT }, openaiImage(buffer, mime, 'low')] }],
      });
      return wasteResult('openai', parseJson(text) || {});
    } catch (err) {
      console.error('[ai] waste check (openai) failed:', err.message);
    }
  }

  const labels = await visionLabels(buffer);
  if (labels) {
    const { matched, confidence } = matchLabels(labels, GARBAGE_LABELS);
    const seen = labels.slice(0, 3).map((l) => l.description).join(', ');
    return {
      analyzed: true,
      provider: 'vision',
      verified: matched,
      confidence,
      labels: labels.slice(0, 8).map((l) => l.description),
      reason: matched ? `Garbage detected in the photo (${seen}).` : `No garbage detected — the photo looks like: ${seen || 'something else'}.`,
    };
  }

  if (geminiOn()) {
    try {
      const text = await geminiGenerate({
        json: true,
        temperature: 0.1,
        maxOutputTokens: 1024,
        contents: [
          {
            role: 'user',
            parts: [
              geminiImage(buffer, mime),
              {
                text:
                  `${WASTE_PROMPT} Reply with JSON only: {"isGarbage": boolean, "confidence": number, ` +
                  `"category": one of ${JSON.stringify(REPORT_CATEGORIES)}, "severity": one of ${JSON.stringify(REPORT_SEVERITIES)}, ` +
                  '"labels": string[], "summary": string, "reason": string}',
              },
            ],
          },
        ],
      });
      return wasteResult('gemini', parseJson(text) || {});
    } catch (err) {
      console.error('[ai] waste check (gemini) failed:', err.message);
    }
  }
  return NOT_ANALYZED;
}

// ---------------------------------------------------------------------------
// Food check + listing autofill
// ---------------------------------------------------------------------------

const FOOD_PROMPT =
  'You help restaurants in India list surplus food for NGOs. Check the photo and fill in a listing. ' +
  'isFood is true only if edible food is clearly visible. confidence is your certainty in that decision (0-1). ' +
  'reason is one short sentence explaining the decision (e.g. "A tray of vegetable biryani." or "The photo shows a parked car, not food."). ' +
  'title: short dish name (max 60 chars). description: one sentence about the food and roughly how much there is. ' +
  'estimatedQuantity: integer amount in the chosen unit. estimatedPricePerUnit: typical Indian restaurant menu price per unit in INR (integer). ' +
  'allergens: only those likely present. labels: up to 6 short lowercase tags. ' +
  'If it is not food, still return the fields with your best guesses (they will be ignored).';

const FOOD_SCHEMA = {
  name: 'food_photo_check',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'isFood', 'confidence', 'reason', 'title', 'description', 'category', 'dietType',
      'estimatedQuantity', 'unit', 'allergens', 'estimatedPricePerUnit', 'labels',
    ],
    properties: {
      isFood: { type: 'boolean' },
      confidence: { type: 'number' },
      reason: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      category: { type: 'string', enum: FOOD_CATEGORIES },
      dietType: { type: 'string', enum: DIET_TYPES },
      estimatedQuantity: { type: 'integer' },
      unit: { type: 'string', enum: FOOD_UNITS },
      allergens: { type: 'array', items: { type: 'string', enum: ALLERGENS } },
      estimatedPricePerUnit: { type: 'integer' },
      labels: { type: 'array', items: { type: 'string' } },
    },
  },
};

function foodResult(provider, out) {
  const quantity = Math.round(Number(out.estimatedQuantity));
  const price = Math.round(Number(out.estimatedPricePerUnit));
  return {
    analyzed: true,
    provider,
    isFood: Boolean(out.isFood),
    verified: Boolean(out.isFood),
    confidence: clamp01(out.confidence),
    reason: sentence(out.reason),
    labels: strList(out.labels),
    suggestion: {
      title: typeof out.title === 'string' ? out.title.slice(0, 60) : '',
      description: typeof out.description === 'string' ? out.description.slice(0, 300) : '',
      category: oneOf(out.category, FOOD_CATEGORIES, 'cooked_meal'),
      dietType: oneOf(out.dietType, DIET_TYPES, 'veg'),
      quantity: quantity > 0 && quantity < 1000 ? quantity : null,
      unit: oneOf(out.unit, FOOD_UNITS, 'servings'),
      allergens: strList(out.allergens, 9).filter((a) => ALLERGENS.includes(a)),
      pricePerUnit: price > 0 && price < 5000 ? price : null,
    },
  };
}

const foodCache = new Map();
const FOOD_CACHE_TTL = 30 * 60 * 1000;

export async function analyzeFoodImage(buffer, mime, cacheKey) {
  if (cacheKey) {
    const hit = foodCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.value;
  }
  const value = await analyzeFoodUncached(buffer, mime);
  if (cacheKey && value.analyzed) {
    if (foodCache.size > 200) foodCache.delete(foodCache.keys().next().value);
    foodCache.set(cacheKey, { value, expires: Date.now() + FOOD_CACHE_TTL });
  }
  return value;
}

async function analyzeFoodUncached(buffer, mime) {
  if (openaiOn()) {
    try {
      const text = await openaiGenerate({
        schema: FOOD_SCHEMA,
        maxTokens: 2000,
        messages: [{ role: 'user', content: [{ type: 'text', text: FOOD_PROMPT }, openaiImage(buffer, mime, 'auto')] }],
      });
      return foodResult('openai', parseJson(text) || {});
    } catch (err) {
      console.error('[ai] food check (openai) failed:', err.message);
    }
  }

  if (geminiOn()) {
    try {
      const text = await geminiGenerate({
        json: true,
        temperature: 0.2,
        maxOutputTokens: 1024,
        contents: [
          {
            role: 'user',
            parts: [
              geminiImage(buffer, mime),
              {
                text:
                  `${FOOD_PROMPT} Reply with JSON only with keys: isFood, confidence, reason, title, description, ` +
                  `category (one of ${JSON.stringify(FOOD_CATEGORIES)}), dietType (one of ${JSON.stringify(DIET_TYPES)}), ` +
                  `estimatedQuantity, unit (one of ${JSON.stringify(FOOD_UNITS)}), allergens (from ${JSON.stringify(ALLERGENS)}), ` +
                  'estimatedPricePerUnit, labels.',
              },
            ],
          },
        ],
      });
      return foodResult('gemini', parseJson(text) || {});
    } catch (err) {
      console.error('[ai] food check (gemini) failed:', err.message);
    }
  }

  const labels = await visionLabels(buffer);
  if (labels) {
    const { matched, confidence } = matchLabels(labels, FOOD_LABELS);
    const top = labels.find((l) => !FOOD_LABELS.has(l.description)) || labels[0];
    const seen = labels.slice(0, 3).map((l) => l.description).join(', ');
    return {
      analyzed: true,
      provider: 'vision',
      isFood: matched,
      verified: matched,
      confidence,
      reason: matched ? `Food detected in the photo (${seen}).` : `No food detected — the photo looks like: ${seen || 'something else'}.`,
      labels: labels.slice(0, 8).map((l) => l.description),
      suggestion: { title: top ? top.description.replace(/\b\w/g, (c) => c.toUpperCase()) : '' },
    };
  }

  return { ...NOT_ANALYZED, isFood: null, suggestion: {} };
}
