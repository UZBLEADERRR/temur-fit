import cron from 'node-cron';
import { prisma } from './db';
import { differenceInMinutes } from 'date-fns';
import { getUserTodayDateStr, getUserLocalMinutes } from './time';
import { getInstance } from './botManager';
import { createDailyTable } from './tableUtils';

const MEAL_LABELS: Record<string, string> = {
    nonushta: 'Nonushta',
    abed: 'Tushlik',
    kechki_ovqat: 'Kechki ovqat'
};

// ====== Bitta tenant uchun eslatma tekshiruvi ======
async function processTenantReminders(tenantId: number) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || !tenant.active) return;

    const bot = getInstance(tenantId);
    if (!bot) return;

    const settings = await prisma.settings.findUnique({ where: { tenantId } });
    const groupId = tenant.groupId || settings?.groupId;
    if (!settings || !groupId) return;

    const users = await prisma.user.findMany({ where: { tenantId } });
    const reminderInterval = settings.reminderInterval || 60;

    for (const user of users) {
        const userTimezone = user.timezone || 'Asia/Tashkent';
        const currentDateStr = getUserTodayDateStr(userTimezone);
        const userMinutes = getUserLocalMinutes(userTimezone);

        const meals = [
            { type: 'nonushta', time: settings.breakfastTime, nextTime: settings.lunchTime },
            { type: 'abed', time: settings.lunchTime, nextTime: settings.dinnerTime },
            { type: 'kechki_ovqat', time: settings.dinnerTime, nextTime: '23:59' }
        ];

        for (const meal of meals) {
            const [tH, tM] = meal.time.split(':').map(Number);
            const [nH, nM] = meal.nextTime.split(':').map(Number);
            const mTarget = tH * 60 + tM;
            const mNext = nH * 60 + nM;

            if (userMinutes <= mTarget || userMinutes > mNext) continue;

            const override = await prisma.reminderOverride.findUnique({
                where: { userId_mealType: { userId: user.id, mealType: meal.type } }
            });
            if (override?.muted) continue;

            const record = await prisma.mealRecord.findUnique({
                where: { userId_date_mealType: { userId: user.id, date: currentDateStr, mealType: meal.type } }
            });
            if (record) continue;

            const existingMention = await prisma.mention.findUnique({
                where: { userId_mealType_date: { userId: user.id, mealType: meal.type, date: currentDateStr } }
            });

            if (existingMention) {
                if (existingMention.count >= settings.maxReminders) continue;
                const minutesSinceLast = differenceInMinutes(new Date(), existingMention.updatedAt);
                if (minutesSinceLast < reminderInterval) continue;
                try { await bot.telegram.deleteMessage(groupId, existingMention.messageId); } catch { /* ignore */ }
            }

            const mealLabel = MEAL_LABELS[meal.type] || meal.type;
            const tzLabel = userTimezone === 'Asia/Seoul' ? '🇰🇷' : '🇺🇿';
            const text = `⚠️ <a href="tg://user?id=${user.telegramId}">${user.name}</a> ${mealLabel}ni jo'natmadingiz! Tezroq bo'ling! 😤 ${tzLabel}`;

            try {
                const sentMsg = await bot.telegram.sendMessage(groupId, text, { parse_mode: 'HTML' });
                await prisma.mention.upsert({
                    where: { userId_mealType_date: { userId: user.id, mealType: meal.type, date: currentDateStr } },
                    create: { userId: user.id, mealType: meal.type, date: currentDateStr, messageId: sentMsg.message_id, count: 1 },
                    update: { messageId: sentMsg.message_id, updatedAt: new Date(), count: { increment: 1 } }
                });
            } catch (e) {
                console.error(`[${tenant.name}] Eslatma yuborishda xato (${user.name}):`, e);
            }
        }
    }
}

export function startScheduler() {
    // ===== Har 1 daqiqada — barcha faol tenantlar bo'yicha eslatma =====
    cron.schedule('* * * * *', async () => {
        try {
            const tenants = await prisma.tenant.findMany({ where: { active: true } });
            for (const tenant of tenants) {
                await processTenantReminders(tenant.id).catch(e =>
                    console.error(`[${tenant.name}] reminder xatosi:`, e)
                );
            }
        } catch (e) {
            console.error('Scheduler xatosi:', e);
        }
    });

    // ===== O'zbekiston vaqti 06:00 — barcha tenantlar uchun yangi kunlik jadval =====
    cron.schedule('0 6 * * *', async () => {
        try {
            const tenants = await prisma.tenant.findMany({ where: { active: true } });
            for (const tenant of tenants) {
                const bot = getInstance(tenant.id);
                if (!bot) continue;
                try {
                    await createDailyTable(bot, tenant);
                    console.log(`[${tenant.name}] Yangi kunlik jadval yuborildi`);
                } catch (e) {
                    console.error(`[${tenant.name}] Kunlik jadval xatosi:`, e);
                }
            }
        } catch (e) {
            console.error('Kunlik jadval xatosi:', e);
        }
    }, { timezone: 'Asia/Tashkent' });
}
