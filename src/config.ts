import dotenv from 'dotenv';
dotenv.config();

// Super-admin Telegram ID — faqat shu odam super panelga kira oladi
export const SUPER_ADMIN_ID = (process.env.SUPER_ADMIN_ID || '1669809576').trim();

// Master (boshqaruv) bot tokeni. SAAS uchun alohida bot.
// Eski deploylar uchun BOT_TOKEN ham qabul qilinadi.
export const MASTER_BOT_TOKEN = (process.env.MASTER_BOT_TOKEN || process.env.BOT_TOKEN || '').trim();

// WebApp (React) joylashgan asosiy URL. Telegram webApp tugmasi https talab qiladi.
const WEBAPP_BASE = (process.env.WEBAPP_URL || 'https://example.com').trim();

function withQuery(base: string, query: string): string {
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}${query}`;
}

// Tenant (guruh) admin paneli URL
export function tenantWebAppUrl(tenantId: number): string {
    return withQuery(WEBAPP_BASE, `tid=${tenantId}`);
}

// Super-admin paneli URL
export function superWebAppUrl(): string {
    return withQuery(WEBAPP_BASE, `super=1`);
}
