import cron from 'node-cron';
import { prisma } from './db';
import { bot } from './bot';
import { toZonedTime, format } from 'date-fns-tz';
import { differenceInMinutes } from 'date-fns';

const MEAL_LABELS: Record<string, string> = {
    nonushta: 'Nonushta',
    abed: 'Tushlik',
    kechki_ovqat: 'Kechki ovqat'
};

async function updatePinnedTable() {
    const settings = await prisma.settings.findFirst();
    if (!settings || !settings.groupId) return;

    const koreaTime = toZonedTime(new Date(), 'Asia/Seoul');
    const dateStr = format(koreaTime, 'yyyy-MM-dd', { timeZone: 'Asia/Seoul' });

    const users = await prisma.user.findMany({
        include: {
            mealRecords: {
                where: { date: dateStr }
            }
        },
        orderBy: { id: 'asc' }
    });

    if (users.length === 0) return;

    let table = `📅 Sana: ${dateStr}\n💪 Temur.fit ratsion jadvali\n\n`;
    table += `No | Ism          | N | A | K\n`;
    table += `────────────────────────────\n`;

    users.forEach((user, idx) => {
        const getStatus = (type: string) => {
            const record = user.mealRecords.find(r => r.mealType === type);
            if (!record) return '✖';
            return record.status === 'late' ? '⚠' : '●';
        };
        const n = getStatus('nonushta');
        const a = getStatus('abed');
        const k = getStatus('kechki_ovqat');
        const name = user.name.padEnd(12).substring(0, 12);
        table += `${String(idx + 1).padStart(2)}. ${name} | ${n} | ${a} | ${k}\n`;
    });

    try {
        if (settings.pinnedMessageId) {
            // Tahrirlash
            try {
                await bot.telegram.editMessageText(
                    settings.groupId,
                    settings.pinnedMessageId,
                    undefined,
                    table,
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: "📊 Jadvalni ko'rish", web_app: { url: process.env.WEBAPP_URL || 'https://google.com' } }
                            ]]
                        }
                    }
                );
            } catch (e) {
                // Agar xabar o'chirilgan bo'lsa, yangi yaratamiz
                const msg = await bot.telegram.sendMessage(settings.groupId, table, {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: "📊 Jadvalni ko'rish", web_app: { url: process.env.WEBAPP_URL || 'https://google.com' } }
                        ]]
                    }
                });
                await bot.telegram.pinChatMessage(settings.groupId, msg.message_id, { disable_notification: true });
                await prisma.settings.update({ where: { id: 1 }, data: { pinnedMessageId: msg.message_id } });
            }
        }
    } catch (e) {
        console.error('Pinned jadval yangilash xatosi:', e);
    }
}

export function startScheduler() {
    // ===== Har 1 daqiqada eslatma tekshiruvchi =====
    cron.schedule('* * * * *', async () => {
        try {
            const settings = await prisma.settings.findFirst();
            const groupId = process.env.ALLOWED_GROUP_ID || settings?.groupId;
            if (!settings || !groupId) return;

            const users = await prisma.user.findMany();
            const reminderInterval = settings.reminderInterval || 60;

            for (const user of users) {
                const localTime = toZonedTime(new Date(), user.timezone);
                const currentDateStr = format(localTime, 'yyyy-MM-dd', { timeZone: user.timezone });
                const mTotalCurrent = localTime.getHours() * 60 + localTime.getMinutes();

                const meals = [
                    { type: 'nonushta', time: settings.breakfastTime, start: settings.breakfastStart, end: settings.breakfastEnd },
                    { type: 'abed', time: settings.lunchTime, start: settings.lunchStart, end: settings.lunchEnd },
                    { type: 'kechki_ovqat', time: settings.dinnerTime, start: settings.dinnerStart, end: settings.dinnerEnd }
                ];

                for (const meal of meals) {
                    const [sH, sM] = meal.start.split(':').map(Number);
                    const [eH, eM] = meal.end.split(':').map(Number);
                    const mStart = sH * 60 + sM;
                    const mEnd = eH * 60 + eM;

                    let isOutsideBounds = false;
                    if (mStart <= mEnd) {
                        if (mTotalCurrent < mStart || mTotalCurrent > mEnd) isOutsideBounds = true;
                    } else {
                        if (mTotalCurrent < mStart && mTotalCurrent > mEnd) isOutsideBounds = true;
                    }

                    if (isOutsideBounds) continue;

                    // Allaqachon yuborgan bo'lsa — skip
                    const record = await prisma.mealRecord.findUnique({
                        where: { userId_date_mealType: { userId: user.id, date: currentDateStr, mealType: meal.type } }
                    });
                    if (record) continue;

                    // Oxirgi eslatmani tekshirish
                    const existingMention = await prisma.mention.findUnique({
                        where: { userId_mealType_date: { userId: user.id, mealType: meal.type, date: currentDateStr } }
                    });

                    if (existingMention) {
                        // Max reminder ga yetib qolgan bo'lsa
                        if (existingMention.count >= settings.maxReminders) continue;

                        // updatedAt dan beri interval vaqt o'tdimi?
                        const minutesSinceLast = differenceInMinutes(new Date(), existingMention.updatedAt);
                        if (minutesSinceLast < reminderInterval) continue;

                        // Eski eslatmani o'chirish
                        try {
                            await bot.telegram.deleteMessage(groupId, existingMention.messageId);
                        } catch (e) { /* xabar allaqachon o'chirilgan */ }
                    }

                    // Yangi eslatma yuborish
                    const mealLabel = MEAL_LABELS[meal.type] || meal.type;
                    const text = `⚠️ <a href="tg://user?id=${user.telegramId}">${user.name}</a> ${mealLabel}ni jo'natmadingiz! Tezroq bo'ling, Temurning jahli chiqyapti! 😤`;

                    try {
                        const sentMsg = await bot.telegram.sendMessage(groupId, text, { parse_mode: 'HTML' });

                        await prisma.mention.upsert({
                            where: { userId_mealType_date: { userId: user.id, mealType: meal.type, date: currentDateStr } },
                            create: {
                                userId: user.id,
                                mealType: meal.type,
                                date: currentDateStr,
                                messageId: sentMsg.message_id,
                                count: 1
                            },
                            update: {
                                messageId: sentMsg.message_id,
                                updatedAt: new Date(),
                                count: { increment: 1 }
                            }
                        });
                    } catch (e) {
                        console.error(`Eslatma yuborishda xato (${user.name}):`, e);
                    }
                }
            }
        } catch (e) {
            console.error('Scheduler xatosi:', e);
        }
    });

    // ===== Koreya vaqti bilan ertalab 06:00 da yangi kunlik jadval =====
    cron.schedule('0 6 * * *', async () => {
        try {
            const settings = await prisma.settings.findFirst();
            const groupId = process.env.ALLOWED_GROUP_ID || settings?.groupId;
            if (!settings || !groupId) return;

            const koreaTime = toZonedTime(new Date(), 'Asia/Seoul');
            const dateStr = format(koreaTime, 'yyyy-MM-dd', { timeZone: 'Asia/Seoul' });

            // Eski pin ni olib tashlash
            if (settings.pinnedMessageId) {
                try {
                    await bot.telegram.unpinChatMessage(groupId, settings.pinnedMessageId);
                } catch (e) { /* ignore */ }
            }

            // Yangi jadval yaratish
            const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
            let table = `📅 Sana: ${dateStr}\n💪 Temur.fit ratsion jadvali\n\n`;
            table += `No | Ism          | N | A | K\n`;
            table += `────────────────────────────\n`;

            users.forEach((user, idx) => {
                const name = user.name.padEnd(12).substring(0, 12);
                table += `${String(idx + 1).padStart(2)}. ${name} | ✖ | ✖ | ✖\n`;
            });

            const msg = await bot.telegram.sendMessage(groupId, table, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: "📊 Jadvalni ko'rish", web_app: { url: process.env.WEBAPP_URL || 'https://google.com' } }
                    ]]
                }
            });

            await bot.telegram.pinChatMessage(groupId, msg.message_id, { disable_notification: false });

            await prisma.settings.update({
                where: { id: 1 },
                data: { pinnedMessageId: msg.message_id, lastDailyUpdateStr: dateStr }
            });

            console.log(`Yangi kunlik jadval yuborildi: ${dateStr}`);
        } catch (e) {
            console.error('Kunlik jadval xatosi:', e);
        }
    }, {
        timezone: 'Asia/Seoul'
    });
}

export { updatePinnedTable };
