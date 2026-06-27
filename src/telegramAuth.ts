import crypto from 'crypto';

export interface InitDataResult {
    ok: boolean;
    userId?: string;
    firstName?: string;
}

/**
 * Telegram WebApp `initData` (raw query string) ni HMAC orqali tekshiradi.
 * Algoritm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * secret_key = HMAC_SHA256("WebAppData", bot_token)
 * hash       = HMAC_SHA256(secret_key, data_check_string)
 */
export function validateInitData(initData: string | undefined, botToken: string): InitDataResult {
    if (!initData || !botToken) return { ok: false };

    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return { ok: false };

        const pairs: string[] = [];
        params.forEach((value, key) => {
            if (key === 'hash') return;
            pairs.push(`${key}=${value}`);
        });
        pairs.sort();
        const dataCheckString = pairs.join('\n');

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        if (calculatedHash !== hash) return { ok: false };

        // (ixtiyoriy) eskirganlikni tekshirish — 24 soat
        const authDate = Number(params.get('auth_date') || 0);
        if (authDate > 0) {
            const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
            if (ageSeconds > 60 * 60 * 24) return { ok: false };
        }

        const userRaw = params.get('user');
        if (!userRaw) return { ok: true };
        const user = JSON.parse(userRaw);
        return { ok: true, userId: String(user.id), firstName: user.first_name };
    } catch {
        return { ok: false };
    }
}
