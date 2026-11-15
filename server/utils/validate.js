/* =========================================================
   CREOTASK — Request validation
   ---------------------------------------------------------
   Small declarative validator. Only keys PRESENT in the input are
   returned, so PATCH-style updates can tell "leave alone" (absent)
   from "clear" (null) — the old COALESCE approach could not clear.
   Field spec:
     { type: 'string'|'text'|'int'|'number'|'bool'|'url'|'enum'|'array'|'timezone',
       required, nullable, min, max, values, items, label }
   ========================================================= */
"use strict";
const { httpError } = require("../middleware/errorHandler");

function isValidTimezone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; }
  catch { return false; }
}

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname;
  } catch { return false; }
}

function checkValue(key, v, spec) {
  const label = spec.label || key;
  switch (spec.type) {
    case "string":
    case "text": {
      if (typeof v !== "string") return `${label} must be text.`;
      const t = v.trim();
      if (spec.min && t.length < spec.min) return `${label} must be at least ${spec.min} characters.`;
      if (spec.max && t.length > spec.max) return `${label} must be ${spec.max} characters or fewer.`;
      return { value: t };
    }
    case "int": {
      const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      if (!Number.isInteger(n)) return `${label} must be a whole number.`;
      if (spec.min != null && n < spec.min) return `${label} must be at least ${spec.min}.`;
      if (spec.max != null && n > spec.max) return `${label} must be at most ${spec.max}.`;
      return { value: n };
    }
    case "number": {
      const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
      if (typeof n !== "number" || !isFinite(n)) return `${label} must be a number.`;
      if (spec.min != null && n < spec.min) return `${label} must be at least ${spec.min}.`;
      if (spec.max != null && n > spec.max) return `${label} must be at most ${spec.max}.`;
      return { value: n };
    }
    case "bool":
      if (typeof v !== "boolean") return `${label} must be true or false.`;
      return { value: v };
    case "url":
      if (typeof v !== "string" || !isHttpUrl(v.trim())) return `${label} must be a valid http(s) link.`;
      if (v.length > 500) return `${label} is too long.`;
      return { value: v.trim() };
    case "enum":
      if (!spec.values.includes(v)) return `${label} must be one of: ${spec.values.join(", ")}.`;
      return { value: v };
    case "timezone":
      if (!isValidTimezone(v)) return `${label} must be a valid IANA timezone (e.g. Asia/Kolkata).`;
      return { value: v };
    case "array": {
      if (!Array.isArray(v)) return `${label} must be a list.`;
      if (spec.max != null && v.length > spec.max) return `${label} can have at most ${spec.max} items.`;
      const out = [];
      for (const item of v) {
        const r = checkValue(`${label} item`, item, spec.items || { type: "string", max: 100 });
        if (typeof r === "string") return r;
        if (!out.includes(r.value)) out.push(r.value); // de-duplicate
      }
      return { value: out };
    }
    default:
      throw new Error(`Unknown validator type for ${key}`);
  }
}

/**
 * Validate `input` against `schema`. Throws 400 VALIDATION_FAILED with
 * a per-field `fields` map. Returns only keys present in input.
 * Unknown keys are ignored (never written).
 */
function validate(input, schema, { partial = false } = {}) {
  const body = input && typeof input === "object" ? input : {};
  const values = {};
  const fields = {};
  for (const [key, spec] of Object.entries(schema)) {
    const present = Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
    if (!present) {
      if (spec.required && !partial) fields[key] = `${spec.label || key} is required.`;
      continue;
    }
    let v = body[key];
    if (v === null || (typeof v === "string" && v.trim() === "" && spec.type !== "bool")) {
      if (spec.required) { fields[key] = `${spec.label || key} is required.`; continue; }
      if (spec.nullable === false) { fields[key] = `${spec.label || key} cannot be empty.`; continue; }
      values[key] = null;
      continue;
    }
    const r = checkValue(key, v, spec);
    if (typeof r === "string") fields[key] = r;
    else values[key] = r.value;
  }
  if (Object.keys(fields).length) {
    const err = httpError(400, Object.values(fields)[0], "VALIDATION_FAILED");
    err.fields = fields;
    throw err;
  }
  return values;
}

module.exports = { validate, isHttpUrl, isValidTimezone };
