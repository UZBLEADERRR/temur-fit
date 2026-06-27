import type { Telegraf } from 'telegraf';
import type { Tenant } from '@prisma/client';
import { prisma } from './db';
import { createTenantBot } from './tenantBot';

// tenantId -> ishlab turgan Telegraf instansiyasi
const instances = new Map<number, Telegraf>();

export function getInstance(tenantId: number): Telegraf | undefined {
    return instances.get(tenantId);
}

export function getRunningTenantIds(): number[] {
    return [...instances.keys()];
}

/**
 * Bot tokenini tekshiradi va @username ni qaytaradi (getMe).
 * Noto'g'ri token bo'lsa xato tashlaydi.
 */
export async function verifyToken(botToken: string): Promise<{ username: string; id: number }> {
    const { Telegraf } = await import('telegraf');
    const probe = new Telegraf(botToken);
    const me = await probe.telegram.getMe();
    return { username: me.username || '', id: me.id };
}

/**
 * Tenant botini ishga tushiradi (agar allaqachon ishlamayotgan bo'lsa).
 * launch() promise'ini KUTMAYMIZ — u bot to'xtaguncha hal bo'lmaydi.
 */
export async function launchTenant(tenant: Tenant): Promise<void> {
    if (instances.has(tenant.id)) return;
    if (!tenant.active) return;

    const bot = createTenantBot(tenant);
    instances.set(tenant.id, bot);

    try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    } catch { /* ignore */ }

    bot.launch({ dropPendingUpdates: true })
        .then(() => console.log(`⏹ [${tenant.name}] bot to'xtadi`))
        .catch((e: any) => {
            console.error(`❌ [${tenant.name}] bot ishga tushmadi:`, e?.message || e);
            instances.delete(tenant.id);
        });

    console.log(`🤖 [${tenant.name}] bot ishga tushdi (tenant #${tenant.id})`);
}

/**
 * Tenant botini to'xtatadi.
 */
export function stopTenant(tenantId: number, reason = 'manual'): void {
    const bot = instances.get(tenantId);
    if (!bot) return;
    try { bot.stop(reason); } catch { /* ignore */ }
    instances.delete(tenantId);
    console.log(`⏹ tenant #${tenantId} boti to'xtatildi`);
}

/**
 * Tenantni qayta ishga tushiradi (sozlama o'zgargach).
 */
export async function reloadTenant(tenant: Tenant): Promise<void> {
    stopTenant(tenant.id, 'reload');
    // 409 conflict bo'lmasligi uchun qisqa pauza
    await new Promise(r => setTimeout(r, 1500));
    if (tenant.active) await launchTenant(tenant);
}

/**
 * Boshlanishida barcha faol tenantlarni ishga tushiradi.
 * 409 (conflict) bo'lmasligi uchun ketma-ket, kichik kechikish bilan.
 */
export async function launchAllTenants(): Promise<void> {
    const tenants = await prisma.tenant.findMany({ where: { active: true }, orderBy: { id: 'asc' } });
    for (const tenant of tenants) {
        await launchTenant(tenant);
        await new Promise(r => setTimeout(r, 800));
    }
    console.log(`✅ ${tenants.length} ta tenant bot ishga tushirildi`);
}

export function stopAll(reason = 'shutdown'): void {
    for (const id of [...instances.keys()]) stopTenant(id, reason);
}
