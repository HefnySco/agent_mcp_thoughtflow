/**
 * Flexible argument resolution layer.
 *
 * LLM tool calls are unreliable about exact parameter names, order, and types.
 * Rather than betting on the LLM always matching a strict schema (and erroring
 * back to it when it doesn't), each tool declares its canonical field shape
 * once here, and every call is normalized against it before reaching the
 * actual service method. This is cheap, deterministic, and runs once per
 * call - far cheaper than a round-trip retry with the LLM.
 *
 * Supports:
 * - Named args under the canonical name OR any declared alias
 * - Positional args, e.g. task(1, "desc") resolved against field order
 * - A single bare scalar resolved to the first field, e.g. task("just-a-name")
 * - Loose type coercion (numeric strings, "true"/"false", scalar-to-array)
 * - Numeric shorthand for ref-style string fields, e.g. 1 -> "task-1"
 */

export interface ParamFieldSpec {
  /** The name the underlying handler/service actually expects */
  canonical: string;
  /** Alternate names an LLM might use instead of `canonical` */
  aliases?: string[];
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** For ref-style string fields: numeric shorthand N is formatted via this template, e.g. n => `task-${n}` */
  numericRefTemplate?: (n: number) => string;
}

function coerce(value: any, field: ParamFieldSpec): any {
  if (value === undefined || value === null) return value;

  switch (field.type) {
    case 'number': {
      if (typeof value === 'number') return value;
      if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
        return Number(value);
      }
      return value;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 1 || value === '1') return true;
      if (value === 'false' || value === 0 || value === '0') return false;
      return value;
    }
    case 'array': {
      return Array.isArray(value) ? value : [value];
    }
    case 'string': {
      if (typeof value === 'number' && field.numericRefTemplate) {
        return field.numericRefTemplate(value);
      }
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return value;
    }
    default:
      return value;
  }
}

/**
 * Normalize raw tool-call arguments against a field spec, in place of
 * requiring the LLM to match canonical names/order/types exactly.
 */
export function resolveArgs(rawArgs: any, spec: ParamFieldSpec[]): Record<string, any> {
  const result: Record<string, any> = {};

  // Positional form: task(1, "desc") - map by declared field order
  if (Array.isArray(rawArgs)) {
    spec.forEach((field, i) => {
      if (i < rawArgs.length && rawArgs[i] !== undefined) {
        result[field.canonical] = coerce(rawArgs[i], field);
      }
    });
    return result;
  }

  // Named-object form: match canonical name or any alias, case-insensitively
  if (rawArgs && typeof rawArgs === 'object') {
    const rawKeys = Object.keys(rawArgs);
    const consumedKeys = new Set<string>();

    for (const field of spec) {
      const candidates = [field.canonical, ...(field.aliases || [])].map(n => n.toLowerCase());
      const matchKey = rawKeys.find(k => candidates.includes(k.toLowerCase()));
      if (matchKey !== undefined && rawArgs[matchKey] !== undefined) {
        result[field.canonical] = coerce(rawArgs[matchKey], field);
        consumedKeys.add(matchKey);
      }
    }

    // Pass through anything unrecognized rather than silently dropping it
    // (e.g. forward-compatible fields, or metadata the spec doesn't enumerate)
    for (const key of rawKeys) {
      if (!consumedKeys.has(key) && !(key in result)) {
        result[key] = rawArgs[key];
      }
    }

    return result;
  }

  // Bare scalar: task("just-a-name") resolves to the first field
  if (spec.length > 0) {
    result[spec[0].canonical] = coerce(rawArgs, spec[0]);
  }

  return result;
}
