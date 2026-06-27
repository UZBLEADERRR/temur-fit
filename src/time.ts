import { toZonedTime, format } from 'date-fns-tz';

// Userning mahalliy vaqtidagi bugungi sana (yyyy-MM-dd)
export function getUserTodayDateStr(timezone: string): string {
    const localTime = toZonedTime(new Date(), timezone);
    return format(localTime, 'yyyy-MM-dd', { timeZone: timezone });
}

// Userning mahalliy vaqtidagi daqiqalar (0-1439)
export function getUserLocalMinutes(timezone: string): number {
    const localTime = toZonedTime(new Date(), timezone);
    return localTime.getHours() * 60 + localTime.getMinutes();
}
