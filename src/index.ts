import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'path';
import { prisma } from './db';
import { startScheduler } from './scheduler';
import { SUPER_ADMIN_ID, MASTER_BOT_TOKEN } from './config';
import { validateInitData } from './telegramAuth';
import { launchMasterBot } from './masterBot';
import * as botManager from './botManager';

const app = express();
app.use(cors());
app.use(express.json());

// ====================================================================
// Helpers
// ====================================================================

function getInitData(req: Request): string | undefined {
    return (req.headers['x-telegram-init-data'] as string) || (req.body?.initData as string) || undefined;
}

// Super-admin tekshiruvi — master bot tokeni bilan initData validatsiyasi
function requireSuper(req: Request): { ok: boolean; userId?: string } {
    const result = validateInitData(getInitData(req), MASTER_BOT_TOKEN);
    if (!result.ok) return { ok: false };
    if (result.userId !== SUPER_ADMIN_ID) return { ok: false };
    return { ok: true, userId: result.userId };
}

// Tenant admin tekshiruvi — telegramId guruh admini/yaratuvchisimi yoki role=admin
async function isTenantAdmin(tenantId: number, telegramId: string): Promise<boolean> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return false;
    if (tenant.ownerTelegramId === telegramId) return true;

    const user = await prisma.user.findUnique({ where: { tenantId_telegramId: { tenantId, telegramId } } });
    if (user?.role === 'admin') return true;

    const groupId = tenant.groupId;
    const bot = botManager.getInstance(tenantId);
    if (groupId && bot) {
        try {
            const member = await bot.telegram.getChatMember(groupId, Number(telegramId));
            if (member.status === 'creator' || member.status === 'administrator') return true;
        } catch { /* ignore */ }
    }
    return false;
}

// Tenant mutatsiyalari uchun: initData (tenant tokeni) validatsiyasi + admin
async function requireTenantAdmin(req: Request, tenantId: number): Promise<{ ok: boolean; userId?: string }> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return { ok: false };

    const result = validateInitData(getInitData(req), tenant.botToken);
    if (!result.ok || !result.userId) return { ok: false };

    const admin = await isTenantAdmin(tenantId, result.userId);
    return { ok: admin, userId: result.userId };
}

// ====================================================================
// SUPER ADMIN API
// ====================================================================

// Super-admin ekanligini tekshirish
app.get('/api/super/me', (req, res) => {
    const s = requireSuper(req);
    res.json({ isSuper: s.ok });
});

// Barcha tenantlar (botlar) ro'yxati
app.get('/api/super/tenants', async (req, res) => {
    if (!requireSuper(req).ok) return res.status(403).json({ error: 'Ruxsat yo\'q' });
    try {
        const tenants = await prisma.tenant.findMany({
            orderBy: { id: 'asc' },
            include: { _count: { select: { users: true } } }
        });
        const running = new Set(botManager.getRunningTenantIds());
        res.json(tenants.map(t => ({
            id: t.id,
            name: t.name,
            botUsername: t.botUsername,
            groupId: t.groupId,
            active: t.active,
            running: running.has(t.id),
            userCount: t._count.users,
            createdAt: t.createdAt,
            tokenPreview: t.botToken.slice(0, 8) + '…' + t.botToken.slice(-4)
        })));
    } catch (e) {
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// Yangi tenant (bot) qo'shish
app.post('/api/super/tenants', async (req, res) => {
    if (!requireSuper(req).ok) return res.status(403).json({ error: 'Ruxsat yo\'q' });
    try {
        const { botToken, groupId, name } = req.body as { botToken?: string; groupId?: string; name?: string };
        if (!botToken || !botToken.trim()) return res.status(400).json({ error: 'Bot token kerak' });

        const token = botToken.trim();
        const exists = await prisma.tenant.findUnique({ where: { botToken: token } });
        if (exists) return res.status(409).json({ error: 'Bu token allaqachon qo\'shilgan' });

        // Tokenni tekshirish + username olish
        let username = '';
        try {
            const me = await botManager.verifyToken(token);
            username = me.username;
        } catch {
            return res.status(400).json({ error: 'Token noto\'g\'ri — Telegram qabul qilmadi' });
        }

        const tenant = await prisma.tenant.create({
            data: {
                botToken: token,
                botUsername: username,
                groupId: groupId?.trim() || null,
                name: (name?.trim() || `@${username}` || 'Temur.fit'),
                active: true,
                settings: { create: { groupId: groupId?.trim() || null } }
            }
        });

        await botManager.launchTenant(tenant);
        res.json({ id: tenant.id, name: tenant.name, botUsername: tenant.botUsername });
    } catch (e) {
        console.error('Tenant qo\'shish xatosi:', e);
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// Tenantni yangilash (nom, guruh, faollik)
app.patch('/api/super/tenants/:id', async (req, res) => {
    if (!requireSuper(req).ok) return res.status(403).json({ error: 'Ruxsat yo\'q' });
    try {
        const id = Number(req.params.id);
        const { name, groupId, active } = req.body as { name?: string; groupId?: string; active?: boolean };

        const data: any = {};
        if (typeof name === 'string') data.name = name.trim();
        if (typeof groupId === 'string') data.groupId = groupId.trim() || null;
        if (typeof active === 'boolean') data.active = active;

        const tenant = await prisma.tenant.update({ where: { id }, data });
        if (typeof groupId === 'string') {
            await prisma.settings.updateMany({ where: { tenantId: id }, data: { groupId: tenant.groupId } });
        }

        if (typeof active === 'boolean') {
            if (active) await botManager.reloadTenant(tenant);
            else botManager.stopTenant(id, 'deactivated');
        } else if (tenant.active) {
            await botManager.reloadTenant(tenant);
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Tenant yangilash xatosi:', e);
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// Tenantni o'chirish
app.delete('/api/super/tenants/:id', async (req, res) => {
    if (!requireSuper(req).ok) return res.status(403).json({ error: 'Ruxsat yo\'q' });
    try {
        const id = Number(req.params.id);
        botManager.stopTenant(id, 'deleted');
        await prisma.tenant.delete({ where: { id } });
        res.json({ success: true });
    } catch (e) {
        console.error('Tenant o\'chirish xatosi:', e);
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// ====================================================================
// TENANT (guruh admin) API — tid bo'yicha
// ====================================================================

// Tenant haqida ommaviy ma'lumot (panel sarlavhasi uchun)
app.get('/api/tenant/:tid/info', async (req, res) => {
    try {
        const tenantId = Number(req.params.tid);
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) return res.status(404).json({ error: 'Topilmadi' });
        res.json({ id: tenant.id, name: tenant.name, botUsername: tenant.botUsername });
    } catch {
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// Joriy foydalanuvchi tenant admini ekanmi
app.get('/api/tenant/:tid/me', async (req, res) => {
    try {
        const tenantId = Number(req.params.tid);
        const check = await requireTenantAdmin(req, tenantId);
        res.json({ isAdmin: check.ok });
    } catch {
        res.status(500).json({ isAdmin: false });
    }
});

// Userlar + sana bo'yicha ovqat hisobotlari
app.get('/api/tenant/:tid/users-by-date/:date', async (req, res) => {
    try {
        const tenantId = Number(req.params.tid);
        const dateStr = req.params.date;
        const users = await prisma.user.findMany({
            where: { tenantId },
            include: { mealRecords: { where: { date: dateStr } }, reminderOverrides: true },
            orderBy: { id: 'asc' }
        });
        res.json(users);
    } catch {
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// Sozlamalarni olish
app.get('/api/tenant/:tid/settings', async (req, res) => {
    try {
        const tenantId = Number(req.params.tid);
        let s = await prisma.settings.findUnique({ where: { tenantId } });
        if (!s) s = await prisma.settings.create({ data: { tenantId } });
        res.json(s);
    } catch {
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// Sozlamalarni saqlash (admin)
app.post('/api/tenant/:tid/settings', async (req, res) => {
    try {
        const tenantId = Number(req.params.tid);
        const check = await requireTenantAdmin(req, tenantId);
        if (!check.ok) return res.status(403).json({ error: 'Ruxsat yo\'q' });

        const { breakfastTime, lunchTime, dinnerTime, reminderInterval,
            breakfastWords, lunchWords, dinnerWords, maxReminders } = req.body;

        const s = await prisma.settings.update({
            where: { tenantId },
            data: { breakfastTime, lunchTime, dinnerTime, reminderInterval, breakfastWords, lunchWords, dinnerWords, maxReminders }
        });
        res.json(s);
    } catch {
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// Eslatma yoqish/o'chirish (admin)
app.post('/api/tenant/:tid/reminder-overrides', async (req, res) => {
    try {
        const tenantId = Number(req.params.tid);
        const check = await requireTenantAdmin(req, tenantId);
        if (!check.ok) return res.status(403).json({ error: 'Ruxsat yo\'q' });

        const { userId, mealType, muted } = req.body;
        // Userning shu tenantga tegishliligini tekshirish
        const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
        if (!user) return res.status(404).json({ error: 'User topilmadi' });

        if (muted) {
            const override = await prisma.reminderOverride.upsert({
                where: { userId_mealType: { userId, mealType } },
                create: { userId, mealType, muted: true },
                update: { muted: true }
            });
            res.json(override);
        } else {
            await prisma.reminderOverride.deleteMany({ where: { userId, mealType } });
            res.json({ success: true });
        }
    } catch {
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// ====================================================================
// STATIC (React WebApp)
// ====================================================================
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));
app.get('/{*path}', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ====================================================================
// BOOTSTRAP
// ====================================================================
async function bootstrap() {
    try {
        await prisma.$connect();
        console.log('✅ Database ulandi');

        const PORT = process.env.PORT || 3000;
        app.listen(Number(PORT), '0.0.0.0', () => console.log(`🚀 Server ${PORT} portda ishlamoqda`));

        startScheduler();
        console.log('⏰ Scheduler ishga tushdi');

        // Botlar fon rejimida — 3s kutib ishga tushadi
        setTimeout(async () => {
            await launchMasterBot();
            await botManager.launchAllTenants();
        }, 3000);

        const shutdown = async (signal: string) => {
            console.log(`⏹ ${signal} qabul qilindi, yopilmoqda...`);
            botManager.stopAll(signal);
            await prisma.$disconnect();
            process.exit(0);
        };
        process.once('SIGINT', () => shutdown('SIGINT'));
        process.once('SIGTERM', () => shutdown('SIGTERM'));
    } catch (e) {
        console.error('❌ Bootstrap xatosi:', e);
        process.exit(1);
    }
}

bootstrap();
