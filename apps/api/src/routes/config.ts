import express, { Request, Response } from 'express';
import type { ApiResponse, FeatureFlags } from '@restropulse/shared';

const router = express.Router();

router.get('/features', (_req: Request, res: Response<ApiResponse<FeatureFlags>>) => {
  res.json({
    success: true,
    data: {
      deleteAccount: process.env.FEATURE_DELETE_ACCOUNT === 'true',
      topupCredits: process.env.FEATURE_TOPUP_CREDITS === 'true',
      updatesSection: process.env.FEATURE_UPDATES_SECTION === 'true',
      minScheduleAheadMins: parseInt(process.env.MIN_SCHEDULE_AHEAD_MINS ?? '150', 10),
      postApprovalBufferMins: parseInt(process.env.POST_APPROVAL_BUFFER_MINS ?? '120', 10),
      cycleApprovalBufferMins: parseInt(process.env.CYCLE_APPROVAL_BUFFER_MINS ?? '4320', 10),
    },
  });
});

export default router;
