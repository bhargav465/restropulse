/**
 * Public grader routes — NO auth. This is the lead-generation funnel:
 * anonymous restaurant owners scan themselves, see a blurred report, and
 * unlock it with a promo code (which is where we capture the lead).
 *
 * Cost guardrails: each scan costs real Places calls, so scans are
 * rate-limited per IP (in-memory — adequate for one instance; revisit if the
 * API ever scales out) and the pipeline never calls Claude.
 */

import express, { Request, Response } from 'express';
import { handle } from '../middleware/async-handler.js';
import { runGraderScan, unlockGraderScan, type GraderResult } from '../services/intelligence/grader.js';
import { createLogger } from '@restropulse/telemetry/server';

const log = createLogger('grader');
const router = express.Router();

const SCANS_PER_HOUR_PER_IP = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
    const now = Date.now();
    const windowStart = now - 3600_000;
    const list = (hits.get(ip) ?? []).filter((t) => t > windowStart);
    if (list.length >= SCANS_PER_HOUR_PER_IP) {
        hits.set(ip, list);
        return true;
    }
    list.push(now);
    hits.set(ip, list);
    return false;
}

interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

router.post('/scan', handle(async (req: Request, res: Response<ApiResponse<GraderResult>>) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    if (rateLimited(ip)) {
        return res.status(429).json({ success: false, error: 'Too many scans from this connection — try again in an hour.' });
    }
    const { name, city } = (req.body ?? {}) as { name?: unknown; city?: unknown };
    if (typeof name !== 'string' || !name.trim() || typeof city !== 'string' || !city.trim()) {
        return res.status(400).json({ success: false, error: 'Restaurant name and city are required.' });
    }
    const result = await runGraderScan(name.trim().slice(0, 120), city.trim().slice(0, 80));
    if (!result) {
        return res.status(404).json({ success: false, error: `We couldn't find "${name.trim()}" on Google in ${city.trim()}. Try the exact name from your Google listing.` });
    }
    log.info({ scanId: result.scanId, score: result.score, problems: result.problems.length }, 'Grader scan completed');
    // The locked response hides the details the unlock reveals — the numbers the
    // teaser needs stay (score, loss, counts, top problem, top-3 board).
    res.json({
        success: true,
        data: {
            ...result,
            problems: result.problems.slice(0, 4),
            leaderboard: result.leaderboard.slice(0, 4),
            searches: result.searches.map((s, i) => (i === 0 ? s : { ...s, topResult: '••••••', yourPosition: s.yourPosition })),
        },
    });
}));

router.post('/unlock', handle(async (req: Request, res: Response<ApiResponse<GraderResult>>) => {
    const { scanId, promoCode, phone, email, name } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof scanId !== 'string' || typeof promoCode !== 'string' || !promoCode.trim()) {
        return res.status(400).json({ success: false, error: 'scanId and promoCode are required.' });
    }
    // The lead IS the product of this page: at least one way to reach them.
    const cleanPhone = typeof phone === 'string' && phone.trim() ? phone.trim().slice(0, 20) : undefined;
    const cleanEmail = typeof email === 'string' && /.+@.+\..+/.test(email.trim()) ? email.trim().slice(0, 120) : undefined;
    if (!cleanPhone && !cleanEmail) {
        return res.status(422).json({ success: false, error: 'Enter a phone number or email so we can send your report.' });
    }
    const out = await unlockGraderScan(scanId, promoCode, {
        ...(cleanPhone ? { phone: cleanPhone } : {}),
        ...(cleanEmail ? { email: cleanEmail } : {}),
        ...(typeof name === 'string' && name.trim() ? { name: name.trim().slice(0, 80) } : {}),
    });
    if (!out.ok) return res.status(422).json({ success: false, error: out.error });
    log.info({ scanId }, 'Grader report unlocked (lead captured)');
    res.json({ success: true, data: out.result });
}));

export default router;
