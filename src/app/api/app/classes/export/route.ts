import type { NextRequest } from 'next/server';
import { listExport } from '@/lib/export/lists';
import { appRoute } from '@/lib/frameworks/route';

// GET ?format=xlsx|csv: the classes list as a spreadsheet, for the principal and the school admin; audited (C235-D,
// src/lib/export/lists.ts).
export async function GET(req: NextRequest) {
  return appRoute(req, (ctx) => listExport(ctx, req, 'classes'));
}
