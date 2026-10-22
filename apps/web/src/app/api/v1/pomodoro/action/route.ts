import { PomodoroActionSchema } from '@vndesign/core';
import { apiRoute, json, parseJson } from '@/server/http';
import { pomodoroAction } from '@/server/services/pomodoro';

/** POST /api/v1/pomodoro/action — pause, resume, skip (acabar já a fase), restart (a fase volta ao início) ou stop. */
export const POST = apiRoute(async (req, ctx) => {
  const { action } = await parseJson(req, PomodoroActionSchema);
  return json({ data: await pomodoroAction(ctx, action) });
});
