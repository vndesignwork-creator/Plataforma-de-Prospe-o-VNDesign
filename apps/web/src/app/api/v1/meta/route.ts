import {
  ACTIVITY_TYPE_LABELS,
  DUPLICATE_REASON_LABELS,
  LEAD_CHANNEL_META,
  LEAD_CHANNELS,
  LEAD_FIELD_LABELS,
  LEAD_STATUS_META,
  LEAD_STATUSES,
  MOBILE_STATUS_META,
  MOBILE_STATUSES,
} from '@vndesign/core';
import { apiRoute, json } from '@/server/http';
import { listSectors } from '@/server/services/sectors';

/** GET /api/v1/meta — valores fixos com rótulos pt-PT + setores (útil para a app móvel). */
export const GET = apiRoute(async (_req, ctx) =>
  json({
    data: {
      statuses: LEAD_STATUSES.map((code) => ({ code, ...LEAD_STATUS_META[code] })),
      channels: LEAD_CHANNELS.map((code) => ({ code, ...LEAD_CHANNEL_META[code] })),
      mobile: MOBILE_STATUSES.map((code) => ({ code, ...MOBILE_STATUS_META[code] })),
      activity_types: ACTIVITY_TYPE_LABELS,
      duplicate_reasons: DUPLICATE_REASON_LABELS,
      lead_fields: LEAD_FIELD_LABELS,
      sectors: await listSectors(ctx),
    },
  }),
);
