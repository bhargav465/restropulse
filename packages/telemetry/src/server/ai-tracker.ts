/**
 * AI usage tracking for cost visibility.
 *
 * Currently a schema definition + no-op metrics setup.
 * When content-engine integrates an AI API (OpenAI, Claude, etc.),
 * each API call wraps with trackAIUsage() to record token counts,
 * cost, and latency. These feed the AI Cost Dashboard.
 *
 * All AI metrics use OTel counters/histograms (pre-aggregated,
 * never sampled) and custom events (always collected) for exact
 * cost accounting.
 */

import { metrics } from '@opentelemetry/api';
import { trackEvent } from './events.js';
import { EventNames } from '../types.js';

const meter = metrics.getMeter('restropulse-ai');

const aiMetrics = {
    requestDuration: meter.createHistogram('ai.request.duration_ms', {
        description: 'AI API request duration',
        unit: 'ms',
    }),
    tokensInput: meter.createCounter('ai.tokens.input', {
        description: 'Total input tokens sent to AI models',
    }),
    tokensOutput: meter.createCounter('ai.tokens.output', {
        description: 'Total output tokens received from AI models',
    }),
    costUsd: meter.createCounter('ai.cost.usd', {
        description: 'Total AI API cost in USD',
    }),
};

export interface AIUsage {
    model: string;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    durationMs: number;
    postType?: string;
    restaurantId?: string;
}

/**
 * Record an AI API call's usage and cost.
 *
 * Usage (when AI is integrated):
 *   const start = Date.now();
 *   const result = await aiClient.generate(...);
 *   trackAIUsage({
 *     model: 'gpt-4o',
 *     operation: 'generate-caption',
 *     inputTokens: result.usage.input_tokens,
 *     outputTokens: result.usage.output_tokens,
 *     costUsd: calculateCost(result.usage),
 *     durationMs: Date.now() - start,
 *     postType: post.type,
 *   });
 */
export function trackAIUsage(usage: AIUsage): void {
    const labels = { model: usage.model, operation: usage.operation };

    aiMetrics.requestDuration.record(usage.durationMs, labels);
    aiMetrics.tokensInput.add(usage.inputTokens, labels);
    aiMetrics.tokensOutput.add(usage.outputTokens, labels);
    aiMetrics.costUsd.add(usage.costUsd, labels);

    trackEvent(EventNames.AI_REQUEST_COMPLETED, {
        model: usage.model,
        operation: usage.operation,
        inputTokens: String(usage.inputTokens),
        outputTokens: String(usage.outputTokens),
        costUsd: String(usage.costUsd),
        durationMs: String(usage.durationMs),
        postType: usage.postType || '',
    });
}
