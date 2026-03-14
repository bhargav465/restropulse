/**
 * Razorpay Setup Command
 *
 * Creates Razorpay subscription plans for all tiers and billing cycles,
 * then writes the resulting plan IDs to:
 *   1. MongoDB subscriptionPlans collection (immediate effect)
 *   2. src/data/default-data.ts (so every future `reset` includes the IDs)
 *
 * Idempotent: skips plans that already have a Razorpay ID set in MongoDB.
 * Use --force to overwrite existing IDs.
 *
 * Usage:
 *   npm run razorpay:setup --filter=@restropulse/db-cli
 *   npm run razorpay:setup --filter=@restropulse/db-cli -- --dry-run
 *   npm run razorpay:setup --filter=@restropulse/db-cli -- --force
 *   npm run razorpay:setup:main --filter=@restropulse/db-cli
 */

import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connect, getConfig, disconnect } from '../config/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_PATH = resolve(__dirname, '../data/default-data.ts');

interface RazorpaySetupOptions {
    dryRun?: boolean;
    force?: boolean;
    main?: boolean;
}

interface PlanDefinition {
    slug: string;
    cycle: 'monthly' | 'annual';
    dbId: string;
    razorpayName: string;
    razorpayDescription: string;
    period: 'monthly' | 'yearly';
    interval: number;
    amountPaise: number;
}

const PLAN_DEFINITIONS: PlanDefinition[] = [
    {
        slug: 'starter',
        cycle: 'monthly',
        dbId: 'plan-starter-v1',
        razorpayName: 'RestroPulse Starter - Monthly',
        razorpayDescription: 'Starter plan: 2 Instagram posts, 1 carousel, 1 reel per week',
        period: 'monthly',
        interval: 1,
        amountPaise: 299900,
    },
    {
        slug: 'starter',
        cycle: 'annual',
        dbId: 'plan-starter-v1',
        razorpayName: 'RestroPulse Starter - Annual',
        razorpayDescription: 'Starter plan: 2 Instagram posts, 1 carousel, 1 reel per week (annual)',
        period: 'yearly',
        interval: 1,
        amountPaise: 2999000,
    },
    {
        slug: 'growth',
        cycle: 'monthly',
        dbId: 'plan-growth-v1',
        razorpayName: 'RestroPulse Growth - Monthly',
        razorpayDescription: 'Growth plan: 5 Instagram posts, 3 carousels, 2 reels per week',
        period: 'monthly',
        interval: 1,
        amountPaise: 999900,
    },
    {
        slug: 'growth',
        cycle: 'annual',
        dbId: 'plan-growth-v1',
        razorpayName: 'RestroPulse Growth - Annual',
        razorpayDescription: 'Growth plan: 5 Instagram posts, 3 carousels, 2 reels per week (annual)',
        period: 'yearly',
        interval: 1,
        amountPaise: 9999000,
    },
    {
        slug: 'premium',
        cycle: 'monthly',
        dbId: 'plan-premium-v1',
        razorpayName: 'RestroPulse Premium - Monthly',
        razorpayDescription: 'Premium plan: 20 Instagram posts, 10 carousels, 5 reels per week',
        period: 'monthly',
        interval: 1,
        amountPaise: 1699900,
    },
    {
        slug: 'premium',
        cycle: 'annual',
        dbId: 'plan-premium-v1',
        razorpayName: 'RestroPulse Premium - Annual',
        razorpayDescription: 'Premium plan: 20 Instagram posts, 10 carousels, 5 reels per week (annual)',
        period: 'yearly',
        interval: 1,
        amountPaise: 16999000,
    },
];

function getAuthHeader(keyId: string, keySecret: string): string {
    return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

async function createRazorpayPlan(
    plan: PlanDefinition,
    keyId: string,
    keySecret: string,
): Promise<string> {
    const response = await fetch('https://api.razorpay.com/v1/plans', {
        method: 'POST',
        headers: {
            Authorization: getAuthHeader(keyId, keySecret),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            period: plan.period,
            interval: plan.interval,
            item: {
                name: plan.razorpayName,
                amount: plan.amountPaise,
                currency: 'INR',
                description: plan.razorpayDescription,
            },
            notes: {
                slug: plan.slug,
                cycle: plan.cycle,
                db_id: plan.dbId,
            },
        }),
    });

    const data = await response.json() as any;

    if (!response.ok) {
        const msg = data?.error?.description || data?.message || `HTTP ${response.status}`;
        throw new Error(`Razorpay plan creation failed: ${msg}`);
    }

    return data.id as string;
}

/**
 * Patches default-data.ts in-place, replacing the razorpayPlanIds for a given
 * plan slug with the provided monthly and annual IDs.
 *
 * Targets the block identified by `_id: 'plan-{slug}-v1'` and replaces the
 * razorpayPlanIds line within it. Safe to call multiple times (idempotent).
 */
function patchDefaultData(
    slug: string,
    dbId: string,
    monthlyId: string,
    annualId: string,
): void {
    let content = readFileSync(DEFAULT_DATA_PATH, 'utf-8');

    // Match the plan block by its _id, then replace its razorpayPlanIds line.
    // The regex captures up to the razorpayPlanIds key within the same block.
    const regex = new RegExp(
        `(_id: '${dbId}'[\\s\\S]*?razorpayPlanIds: \\{ monthly: ')[^']*(',\\s*annual: ')[^']*('\\s*\\})`,
    );

    if (!regex.test(content)) {
        throw new Error(`Could not locate razorpayPlanIds for slug '${slug}' (dbId: ${dbId}) in default-data.ts`);
    }

    content = content.replace(regex, `$1${monthlyId}$2${annualId}$3`);
    writeFileSync(DEFAULT_DATA_PATH, content, 'utf-8');
}

export async function razorpaySetupCommand(options: RazorpaySetupOptions): Promise<void> {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        console.error(chalk.red('Error: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in apps/api/.env'));
        process.exit(1);
    }

    const dbConfig = getConfig();
    const dbName = options.main ? dbConfig.mainDatabase : dbConfig.testDatabase;
    const spinner = ora();

    console.log(chalk.cyan(`\nTarget database: ${chalk.bold(dbName)}`));
    if (options.dryRun) {
        console.log(chalk.yellow('Dry-run mode -- no API calls, DB writes, or file changes\n'));
    }
    if (options.force) {
        console.log(chalk.yellow('Force mode -- existing Razorpay plan IDs will be overwritten\n'));
    }

    try {
        spinner.start('Connecting to MongoDB...');
        const client = await connect();
        spinner.succeed('Connected to MongoDB');

        const db = client.db(dbName);
        const plansCol = db.collection('subscriptionPlans');

        // Print plan table
        console.log(chalk.cyan('\nPlans to create:'));
        console.log(chalk.gray('  Slug       Cycle    Amount (INR)  Razorpay Period'));
        console.log(chalk.gray('  ---------  -------  ------------  ---------------'));
        for (const plan of PLAN_DEFINITIONS) {
            const amountInr = (plan.amountPaise / 100).toLocaleString('en-IN');
            console.log(chalk.gray(`  ${plan.slug.padEnd(9)}  ${plan.cycle.padEnd(7)}  ${amountInr.padStart(12)}  ${plan.period}/${plan.interval}`));
        }
        console.log('');

        const results: { plan: PlanDefinition; razorpayId: string; action: string }[] = [];

        for (const plan of PLAN_DEFINITIONS) {
            const label = `${plan.slug} (${plan.cycle})`;
            spinner.start(`Processing ${label}...`);

            // Fetch current DB doc
            const dbDoc = await plansCol.findOne({ _id: plan.dbId as any, isCurrentVersion: true });

            if (!dbDoc) {
                spinner.warn(`${label}: DB document not found (id: ${plan.dbId}) -- run reset first`);
                continue;
            }

            const existingId: string = plan.cycle === 'monthly'
                ? dbDoc.razorpayPlanIds?.monthly
                : dbDoc.razorpayPlanIds?.annual;

            if (existingId && !options.force) {
                spinner.succeed(`${label}: already set (${existingId}) -- skipped`);
                results.push({ plan, razorpayId: existingId, action: 'skipped' });
                continue;
            }

            if (options.dryRun) {
                spinner.succeed(`${label}: would create Razorpay plan (dry-run)`);
                results.push({ plan, razorpayId: '(dry-run)', action: 'would-create' });
                continue;
            }

            // Create plan in Razorpay
            let razorpayId: string;
            try {
                razorpayId = await createRazorpayPlan(plan, keyId, keySecret);
            } catch (err: any) {
                spinner.fail(`${label}: ${err.message}`);
                continue;
            }

            // Write ID back to MongoDB
            const field = plan.cycle === 'monthly'
                ? 'razorpayPlanIds.monthly'
                : 'razorpayPlanIds.annual';

            await plansCol.updateOne(
                { _id: plan.dbId as any },
                { $set: { [field]: razorpayId, updatedAt: new Date() } },
            );

            spinner.succeed(`${label}: created ${chalk.green(razorpayId)}`);
            results.push({ plan, razorpayId, action: 'created' });
        }

        // Patch default-data.ts for every slug that had at least one ID created/updated.
        // Collect the final IDs per slug (prefer newly created, fall back to existing skipped).
        const created = results.filter(r => r.action === 'created');

        if (created.length > 0) {
            spinner.start('Patching default-data.ts with new plan IDs...');

            // Gather all IDs per slug (merge skipped + created to get a full picture)
            const allResults = results.filter(r => r.action === 'created' || r.action === 'skipped');
            const idsBySlug: Record<string, { monthly: string; annual: string; dbId: string }> = {};

            for (const r of allResults) {
                if (!idsBySlug[r.plan.slug]) {
                    idsBySlug[r.plan.slug] = { monthly: '', annual: '', dbId: r.plan.dbId };
                }
                if (r.plan.cycle === 'monthly') {
                    idsBySlug[r.plan.slug].monthly = r.razorpayId;
                } else {
                    idsBySlug[r.plan.slug].annual = r.razorpayId;
                }
            }

            let patchCount = 0;
            for (const [slug, ids] of Object.entries(idsBySlug)) {
                if (!ids.monthly || !ids.annual) continue;
                try {
                    patchDefaultData(slug, ids.dbId, ids.monthly, ids.annual);
                    patchCount++;
                } catch (err: any) {
                    spinner.warn(`Could not patch default-data.ts for ${slug}: ${err.message}`);
                }
            }

            spinner.succeed(`Patched default-data.ts (${patchCount} plan(s) updated)`);
        }

        // Summary
        const skipped = results.filter(r => r.action === 'skipped');
        const wouldCreate = results.filter(r => r.action === 'would-create');

        console.log(chalk.cyan('\n--- Summary ---'));
        if (options.dryRun) {
            console.log(chalk.yellow(`  Would create: ${wouldCreate.length}`));
            console.log(chalk.gray(`  Already set (would skip): ${skipped.length}`));
        } else {
            console.log(chalk.green(`  Created: ${created.length}`));
            console.log(chalk.gray(`  Skipped (already set): ${skipped.length}`));
        }

        if (created.length > 0) {
            console.log(chalk.cyan('\n--- Razorpay Plan IDs ---'));
            for (const r of created) {
                console.log(chalk.gray(`  ${r.plan.slug} ${r.plan.cycle}: ${chalk.white(r.razorpayId)}`));
            }
            console.log(chalk.green('\nRazorpay setup complete.'));
            console.log(chalk.gray('  - Plan IDs saved to MongoDB'));
            console.log(chalk.gray('  - default-data.ts updated -- future resets will include these IDs'));
            console.log(chalk.gray('  - Commit default-data.ts to lock in the IDs for the team'));
        } else if (!options.dryRun) {
            console.log(chalk.gray('\nNo new plans created. All IDs already set.'));
        }

    } catch (err: any) {
        spinner.fail('Razorpay setup failed');
        console.error(chalk.red(`Error: ${err.message}`));
        process.exit(1);
    } finally {
        await disconnect();
    }
}
