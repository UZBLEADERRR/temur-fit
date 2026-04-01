import express from 'express';
import cors from 'cors';
import { bot } from './bot';
import { startScheduler } from './scheduler';
import { prisma } from './db';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/users', async (req, res) => {
    const users = await prisma.user.findMany({ include: { mealRecords: true } });
    res.json(users);
});

app.get('/api/settings', async (req, res) => {
    const s = await prisma.settings.findFirst();
    res.json(s);
});

app.post('/api/settings', async (req, res) => {
    const { breakfastTime, lunchTime, dinnerTime, reminderInterval } = req.body;
    const s = await prisma.settings.upsert({
        where: { id: 1 },
        update: { breakfastTime, lunchTime, dinnerTime, reminderInterval },
        create: { breakfastTime, lunchTime, dinnerTime, reminderInterval }
    });
    res.json(s);
});

async function bootstrap() {
    await prisma.$connect();
    console.log("DB connected");

    bot.launch()
       .then(() => console.log('Bot is running'))
       .catch(e => console.error("Bot fail:", e));

    startScheduler();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`API running on port ${PORT}`));

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

bootstrap();
