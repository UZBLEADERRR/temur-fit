import type { Telegraf } from 'telegraf';
import type { Tenant } from '@prisma/client';
import { prisma } from './db';
import { getUserTodayDateStr } from './time';
import { tenantWebAppUrl } from './config';

// ====== Jadval matnini yasash ======
function header(tenant: Tenant, dateStr: string): string {
    let table = `📅 Sana: ${dateStr}\n💪 ${tenant.name} ratsion jadvali\n\n`;
    table += `No | Ism          | N | A | K\n`;
    table += `────────────────────────────\n`;
    return table;
}

function row(idx: number, name: string, n: string, a: string, k: string): string {
    const safeName = name.padEnd(12).substring(0, 12);
    return `${String(idx + 1).padStart(2)}. ${safeName} | ${n} | ${a} | ${k}\n`;
}

function webAppKeyboard(tenant: Tenant) {
    return {
        inline_keyboard: [[
            { text: "📊 Jadvalni ko'rish", url: tenantWebAppUrl(tenant.id) }
        ]]
    };
}

/**
 * Tenantning pinlangan jadvalini yangilaydi (edit; agar xabar o'chgan bo'lsa qayta yaratadi).
 */
export async function updatePinnedTable(bot: Telegraf, tenant: Tenant): Promise<void> {
    const settings = await prisma.settings.findUnique({ where: { tenantId: tenant.id } });
    const groupId = tenant.groupId || settings?.groupId;
    if (!settings || !groupId || !settings.pinnedMessageId) return;

    const displayDate = getUserTodayDateStr('Asia/Tashkent');
    const usersRaw = await prisma.user.findMany({ where: { tenantId: tenant.id }, orderBy: { id: 'asc' } });
    if (usersRaw.length === 0) return;

    const users = await Promise.all(
        usersRaw.map(async (user) => {
            const userDate = getUserTodayDateStr(user.timezone);
            const mealRecords = await prisma.mealRecord.findMany({
                where: { userId: user.id, date: userDate }
            });
            return { ...user, mealRecords };
        })
    );

    let table = header(tenant, displayDate);
    users.forEach((user, idx) => {
        const getStatus = (type: string) => {
            const r = user.mealRecords.find(rec => rec.mealType === type);
            if (!r) return '✖';
            return r.status === 'late' ? '⚠' : '●';
        };
        table += row(idx, user.name, getStatus('nonushta'), getStatus('abed'), getStatus('kechki_ovqat'));
    });

    try {
        await bot.telegram.editMessageText(groupId, settings.pinnedMessageId, undefined, table, {
            reply_markup: webAppKeyboard(tenant)
        });
    } catch (e) {
        // Xabar o'chirilgan bo'lishi mumkin — qayta yaratamiz
        try {
            const msg = await bot.telegram.sendMessage(groupId, table, { reply_markup: webAppKeyboard(tenant) });
            await bot.telegram.pinChatMessage(groupId, msg.message_id, { disable_notification: true });
            await prisma.settings.update({ where: { tenantId: tenant.id }, data: { pinnedMessageId: msg.message_id } });
        } catch (e2) {
            console.error(`[${tenant.name}] Jadvalni yangilashda xato:`, e2);
        }
    }
}

/**
 * Yangi (bo'sh) kunlik jadval yaratib pinlaydi.
 */
export async function createDailyTable(bot: Telegraf, tenant: Tenant): Promise<void> {
    const settings = await prisma.settings.findUnique({ where: { tenantId: tenant.id } });
    const groupId = tenant.groupId || settings?.groupId;
    if (!settings || !groupId) return;

    const dateStr = getUserTodayDateStr('Asia/Tashkent');

    if (settings.pinnedMessageId) {
        try { await bot.telegram.unpinChatMessage(groupId, settings.pinnedMessageId); } catch { /* ignore */ }
    }

    const users = await prisma.user.findMany({ where: { tenantId: tenant.id }, orderBy: { id: 'asc' } });
    let table = header(tenant, dateStr);
    users.forEach((user, idx) => {
        table += row(idx, user.name, '✖', '✖', '✖');
    });

    const msg = await bot.telegram.sendMessage(groupId, table, { reply_markup: webAppKeyboard(tenant) });
    await bot.telegram.pinChatMessage(groupId, msg.message_id, { disable_notification: false });
    await prisma.settings.update({
        where: { tenantId: tenant.id },
        data: { pinnedMessageId: msg.message_id, lastDailyUpdateStr: dateStr }
    });
}
