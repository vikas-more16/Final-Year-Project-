import OpenAI from 'openai'

/**
 * Thin wrapper over any OpenAI-compatible chat API (Groq, OpenRouter, Ollama, OpenAI...).
 * Agents only ever call chatJSON(): a schema-constrained request that returns parsed data.
 */
const config = {
  baseURL: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,
  models: {
    planner: process.env.LLM_MODEL_PLANNER || 'openai/gpt-oss-120b',
    fast: process.env.LLM_MODEL_FAST || process.env.LLM_MODEL_PLANNER || 'openai/gpt-oss-20b',
  },
  tpmLimit: Number(process.env.LLM_TPM_LIMIT ?? 8000),
}

export const llmConfigured = Boolean(config.apiKey || config.baseURL?.includes('localhost'))
export const llmModels = config.models

const client = llmConfigured
  ? new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey || 'not-needed', maxRetries: 6, timeout: 180_000 })
  : null

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const estimateTokens = (text) => Math.ceil(text.length / 3.5)

/**
 * Keeps each model under its tokens-per-minute budget so a long planning run paces itself
 * instead of hammering the provider with requests that will be rejected.
 */
class TokenBudget {
  constructor(limit) {
    this.limit = limit
    this.window = [] // { at, tokens }
    this.queue = Promise.resolve()
  }

  /** Serialises calls per model and waits until `estimate` tokens fit in the last 60 seconds. */
  run(estimate, fn) {
    const job = this.queue.then(async () => {
      if (this.limit > 0) {
        for (;;) {
          const now = Date.now()
          this.window = this.window.filter((e) => now - e.at < 60_000)
          const used = this.window.reduce((sum, e) => sum + e.tokens, 0)
          if (this.window.length === 0 || used + estimate <= this.limit) break
          await sleep(60_000 - (now - this.window[0].at) + 250)
        }
      }
      const entry = { at: Date.now(), tokens: estimate }
      this.window.push(entry)
      const result = await fn()
      entry.tokens = result.usage?.total_tokens ?? estimate
      return result
    })
    this.queue = job.catch(() => {})
    return job
  }
}

const budgets = new Map()
const budgetFor = (model) => {
  if (!budgets.has(model)) budgets.set(model, new TokenBudget(config.tpmLimit))
  return budgets.get(model)
}

export class LLMError extends Error {}

/**
 * Sends a schema-constrained chat request and returns { data, usage }.
 * @param {'planner'|'fast'} tier which configured model to use
 */
export async function chatJSON({ tier = 'planner', system, user, schemaName, schema, maxTokens = 4000, reasoning = 'medium' }) {
  if (!client) throw new LLMError('No LLM is configured. Set LLM_BASE_URL and LLM_API_KEY in server/.env.')
  const other = tier === 'planner' ? 'fast' : 'planner'
  // Models occasionally emit output the provider cannot parse against the schema. Retry once,
  // then try the other model, then fall back to plain JSON mode validated in code.
  const attempts = [
    { tier, strict: true },
    { tier, strict: true },
    ...(config.models[other] !== config.models[tier] ? [{ tier: other, strict: true }] : []),
    { tier, strict: false },
  ]
  let maxOut = maxTokens
  let lastError
  for (const attempt of attempts) {
    const model = config.models[attempt.tier]
    const request = {
      model,
      temperature: 0.2,
      max_tokens: maxOut,
      messages: [
        { role: 'system', content: attempt.strict ? system : `${system}\n\nReply with a single JSON object that matches this JSON Schema exactly:\n${JSON.stringify(schema)}` },
        { role: 'user', content: user },
      ],
      response_format: attempt.strict
        ? { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } }
        : { type: 'json_object' },
      // gpt-oss models spend output tokens on reasoning; keep it proportionate to the task.
      ...(model.includes('gpt-oss') && { reasoning_effort: reasoning }),
    }
    const estimate = estimateTokens(request.messages[0].content + user) + Math.min(maxOut, 3000)
    let completion
    try {
      completion = await budgetFor(model).run(estimate, () => client.chat.completions.create(request))
    } catch (err) {
      lastError = err
      // 400 = the provider rejected the generation (e.g. schema parse failure): try the next attempt.
      if (err.status && err.status !== 400 && err.status < 500) throw new LLMError(`LLM request failed: ${err.message}`)
      continue
    }
    const choice = completion.choices[0]
    if (choice.finish_reason === 'length') {
      maxOut = Math.min(maxOut * 2, 16_000)
      lastError = new LLMError('The model ran out of output tokens')
      continue
    }
    try {
      const data = JSON.parse(choice.message.content)
      if (!attempt.strict) assertShape(data, schema)
      return { data, usage: completion.usage?.total_tokens ?? 0 }
    } catch (err) {
      lastError = new LLMError(`The model returned invalid JSON (${err.message})`)
    }
  }
  throw new LLMError(`LLM call failed after ${attempts.length} attempts: ${lastError?.message ?? 'unknown error'}`)
}

/** Minimal structural check for non-strict replies: required keys present with the right basic types. */
function assertShape(value, schema, path = '$') {
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
  if (schema.type === 'object') {
    if (type !== 'object') throw new Error(`${path} should be an object`)
    for (const key of schema.required ?? []) {
      if (!(key in value)) throw new Error(`${path}.${key} is missing`)
      assertShape(value[key], schema.properties[key], `${path}.${key}`)
    }
  } else if (schema.type === 'array') {
    if (type !== 'array') throw new Error(`${path} should be an array`)
    value.forEach((v, i) => assertShape(v, schema.items, `${path}[${i}]`))
  } else if (schema.type === 'string') {
    if (type !== 'string') throw new Error(`${path} should be a string`)
    if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path} must be one of ${schema.enum.join(', ')}`)
  } else if (schema.type === 'number' && type !== 'number') {
    throw new Error(`${path} should be a number`)
  } else if (schema.type === 'boolean' && type !== 'boolean') {
    throw new Error(`${path} should be a boolean`)
  }
}

// ---- JSON-schema helpers (strict mode needs every property listed as required) ----

export const str = (description) => ({ type: 'string', ...(description && { description }) })
export const num = (description) => ({ type: 'number', ...(description && { description }) })
export const bool = (description) => ({ type: 'boolean', ...(description && { description }) })
export const arr = (items, description) => ({ type: 'array', items, ...(description && { description }) })
export const oneOf = (values, description) => ({ type: 'string', enum: values, ...(description && { description }) })
export const obj = (properties) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
