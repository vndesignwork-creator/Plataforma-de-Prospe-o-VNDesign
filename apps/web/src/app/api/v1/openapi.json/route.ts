import { NextResponse } from 'next/server';
import { getOpenApiDocument } from '@/server/openapi';

/** GET /api/v1/openapi.json — especificação OpenAPI (pública, sem dados). */
export function GET() {
  return NextResponse.json(getOpenApiDocument());
}
