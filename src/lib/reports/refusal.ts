import type { NextResponse } from 'next/server';
import { jsonError, ruleError } from '@/lib/frameworks/route';
import type { AskedReport } from './load';

// What a refused report answers (docs/26 slice 8h, C207), for the rows and for the CSV alike. The standard
// refusals are rules of the error catalogue; the two that are a report's own carry a code the screen says in the
// person's language (`rpt.err.<code>`).
export function reportRefusal(reason: Extract<AskedReport, { ok: false }>['reason']): NextResponse {
  switch (reason) {
    case 'not_found':
      return ruleError(404, 'not_found');
    case 'not_allowed':
      return ruleError(403, 'not_allowed');
    case 'module_off':
      return ruleError(403, 'module_off');
    case 'range':
      return jsonError(400, 'Choose two dates, the first not after the second, at most 366 days apart.', { code: 'range' });
    case 'too_many_rows':
      return jsonError(400, 'These days hold more rows than one report reads. Choose fewer days.', { code: 'too_many_rows' });
  }
}
