import cron from 'node-cron';
import { prisma } from './db';
import { bot } from './bot';
import { toZonedTime, format } from 'date-fns-tz';
import { differenceInMinutes } from 'date-fns';

export function startScheduler() {
    // Run every minute
    cron.schedule('* * * * *', async () => {
        const settings = await prisma.settings.findFirst();
        if (!settings || !settings.groupId) return;

        const users = await prisma.user.findMany();

        for (const user of users) {
             const localTime = toZonedTime(new Date(), user.timezone);
             const currentDateStr = format(localTime, 'yyyy-MM-dd', { timeZone: user.timezone });
             const currentTimeStr = format(localTime, 'HH:mm');
             const mTotalCurrent = localTime.getHours() * 60 + localTime.getMinutes();

             const meals = [
                 { type: 'nonushta', time: settings.breakfastTime, endHour: 12 }, 
                 { type: 'abed', time: settings.lunchTime, endHour: 15 },
                 { type: 'kechki_ovqat', time: settings.dinnerTime, endHour: 22 }
             ];

             for (const meal of meals) {
                 const [tH, tM] = meal.time.split(':').map(Number);
                 const mTotalTarget = tH * 60 + tM;

                 // If current local time is past the target time and before end hour
                 if (mTotalCurrent >= mTotalTarget && localTime.getHours() <= meal.endHour) {
                     // Check if sent
                     const record = await prisma.mealRecord.findUnique({
                         where: { userId_date_mealType: { userId: user.id, date: currentDateStr, mealType: meal.type } }
                     });

                     if (!record) {
                         // Needs reminder. Check if we mentioned them recently
                         const lastMention = await prisma.mention.findUnique({
                             where: { userId_mealType_date: { userId: user.id, mealType: meal.type, date: currentDateStr } }
                         });

                         let shouldRemind = false;
                         if (!lastMention) {
                             shouldRemind = true;
                         } else {
                             // Let's rely on updated_at or create a timestamp for Mention, but since it's just ID we can fetch standard
                             // Actually we need to add `lastRemindedAt` to Mention to accurately check the interval. Let's assume Mention happened at least reminderInterval ago. 
                             // Wait, I will just update the Mention model in schema to have `createdAt` or use memory.
                             // For now, let's keep it simple: We'll add updatedAt string to Mention, wait, Mention doesn't have it. Let's just update the schema below and push!
                         }
                     }
                 }
             }
        }
    });

    // At 06:00 AM Korea Time, send new Daily Pinned Table
    cron.schedule('0 6 * * *', async () => {
         const settings = await prisma.settings.findFirst();
         if (!settings || !settings.groupId) return;
         
         const koreTime = toZonedTime(new Date(), 'Asia/Seoul');
         const dateStr = format(koreTime, 'yyyy-MM-dd');

         const text = `📅 Sana: ${dateStr}\n💪 Temur.fit ratsion jadvali\n\nJadval ostidagi Web App orqali kengroq malumot oling!`;
         
         try {
             const prevMsg = settings.pinnedMessageId;
             if (prevMsg) {
                 try { await bot.telegram.unpinChatMessage(settings.groupId, prevMsg); } catch(e){}
             }
             
             const msg = await bot.telegram.sendMessage(settings.groupId, text, {
                  reply_markup: {
                      inline_keyboard: [[ { text: "Jadvalni ko'rish", web_app: { url: process.env.WEBAPP_URL || "https://google.com" } } ]]
                  }
             });
             
             await bot.telegram.pinChatMessage(settings.groupId, msg.message_id);
             
             await prisma.settings.update({
                  where: { id: 1 },
                  data: { pinnedMessageId: msg.message_id, lastDailyUpdateStr: dateStr }
             });
         } catch (e) {
             console.error("Pinned message error", e);
         }
    }, {
         timezone: "Asia/Seoul"
    });
}
