// B-rep pre-validation checks performed before OCCT BinTools::Read.
// Rejects invalid input early, before the OCCT reader sees it.
export interface BRepValidationResult {
  valid: boolean;
  reason?: string;
}

// Maximum inline export size (64 MiB, matches ServerLimits.per_session_blob_quota)
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;

// B-rep binary section terminator byte
const BREP_TERMINATOR = 0x1a;

// STEP-21 file end marker (ISO 10303-21)
const STEP_END_MARKER = 'END-ISO-10303-21;';

export function validateBRep(data: Uint8Array): BRepValidationResult {
  if (data.length === 0) return { valid: false, reason: 'empty B-rep' };
  if (data.length > MAX_EXPORT_BYTES) return { valid: false, reason: 'B-rep too large' };
  // Truncation check: valid B-rep ends with section terminator 0x1a
  const lastByte = data[data.length - 1];
  if (lastByte !== BREP_TERMINATOR) return { valid: false, reason: 'truncated B-rep' };
  return { valid: true };
}

export interface StepValidationResult {
  valid: boolean;
  reason?: string;
}

// Pre-validation for STEP export output before serialization into the gRPC response.
// STEP is a text format (ISO 10303-21); files end with END-ISO-10303-21;.
export function validateStep(data: Uint8Array): StepValidationResult {
  const text = new TextDecoder().decode(data);
  if (data.length === 0) return { valid: false, reason: 'empty STEP' };
  if (data.length > MAX_EXPORT_BYTES) return { valid: false, reason: 'STEP too large' };
  if (!text.endsWith(STEP_END_MARKER)) return { valid: false, reason: 'truncated STEP' };
  return { valid: true };
}
