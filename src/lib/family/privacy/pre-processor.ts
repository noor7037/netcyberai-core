/**
 * Privacy Pre-Processor for Family AI Requests
 * Enforces DPDP minimization: strips phone numbers, email addresses,
 * 12-digit Aadhaar pattern runs, and student identifiers before any AI request.
 */

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;
// 12-digit runs with optional spaces/dashes (Aadhaar number screening)
const AADHAAR_PATTERN = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;

export interface CleanedPromptPayload {
  cleanedText: string;
  hasRedactions: boolean;
  redactionTypes: string[];
}

export function cleanTextForAI(rawText: string, childFirstName?: string): CleanedPromptPayload {
  let cleaned = rawText;
  const redactions: string[] = [];

  if (EMAIL_PATTERN.test(cleaned)) {
    cleaned = cleaned.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
    redactions.push('email');
  }

  if (PHONE_PATTERN.test(cleaned)) {
    cleaned = cleaned.replace(PHONE_PATTERN, '[REDACTED_PHONE]');
    redactions.push('phone');
  }

  if (AADHAAR_PATTERN.test(cleaned)) {
    cleaned = cleaned.replace(AADHAAR_PATTERN, '[REDACTED_ID]');
    redactions.push('government_id');
  }

  // Strip child's name if explicitly present in prompt query
  if (childFirstName && childFirstName.trim().length > 2) {
    const nameRegex = new RegExp(`\\b${childFirstName.trim()}\\b`, 'gi');
    if (nameRegex.test(cleaned)) {
      cleaned = cleaned.replace(nameRegex, 'Student');
      redactions.push('child_name');
    }
  }

  return {
    cleanedText: cleaned,
    hasRedactions: redactions.length > 0,
    redactionTypes: Array.from(new Set(redactions)),
  };
}
