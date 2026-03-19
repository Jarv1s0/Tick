import dayjs from 'dayjs';
import { HolidayDataSource, setHolidayDataSource } from './dateCalculator';

const HOLIDAY_CACHE_KEY = 'tick_holiday_data_cache_v1';
const HOLIDAY_REMOTE_URL = 'https://cdn.jsdelivr.net/npm/chinese-days@latest/dist/chinese-days.json';

interface HolidayDataCache extends HolidayDataSource {
  fetchedAt: string;
  source: string;
}

export interface HolidayDataStatus {
  mode: 'builtin' | 'online';
  fetchedAt?: string;
  source?: string;
  yearRange?: string;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === 'string');
}

function parseHolidayData(raw: unknown): HolidayDataSource | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const value = raw as Record<string, unknown>;
  if (!isStringRecord(value.holidays) || !isStringRecord(value.workdays)) return null;

  return {
    holidays: value.holidays,
    workdays: value.workdays,
    inLieuDays: isStringRecord(value.inLieuDays) ? value.inLieuDays : {},
  };
}

function getYearRange(data: HolidayDataSource): string | undefined {
  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = Number.NEGATIVE_INFINITY;

  const updateRange = (dateKey: string) => {
    const year = Number.parseInt(dateKey.slice(0, 4), 10);
    if (!Number.isFinite(year)) return;
    if (year < minYear) minYear = year;
    if (year > maxYear) maxYear = year;
  };

  Object.keys(data.holidays).forEach(updateRange);
  Object.keys(data.workdays).forEach(updateRange);

  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear)) return undefined;
  return `${minYear}-${maxYear}`;
}

function toStatus(mode: HolidayDataStatus['mode'], cache?: HolidayDataCache): HolidayDataStatus {
  if (!cache) return { mode };
  return {
    mode,
    fetchedAt: cache.fetchedAt,
    source: cache.source,
    yearRange: getYearRange(cache),
  };
}

function loadHolidayDataCache(): HolidayDataCache | null {
  try {
    const raw = localStorage.getItem(HOLIDAY_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const data = parseHolidayData(parsed);
    if (!data) return null;

    return {
      ...data,
      fetchedAt: typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : '',
      source: typeof parsed.source === 'string' ? parsed.source : HOLIDAY_REMOTE_URL,
    };
  } catch {
    return null;
  }
}

export function initializeHolidayData(): HolidayDataStatus {
  const cache = loadHolidayDataCache();
  if (!cache) {
    setHolidayDataSource(null);
    return toStatus('builtin');
  }

  setHolidayDataSource(cache);
  return toStatus('online', cache);
}

export function formatHolidayUpdatedAt(value?: string): string {
  if (!value) return '未更新';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : value;
}

export async function refreshHolidayDataOnline(): Promise<HolidayDataStatus> {
  const response = await fetch(HOLIDAY_REMOTE_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`请求失败（${response.status}）`);
  }

  const payload = parseHolidayData(await response.json());
  if (!payload) {
    throw new Error('返回数据格式不正确');
  }

  const cache: HolidayDataCache = {
    ...payload,
    fetchedAt: new Date().toISOString(),
    source: HOLIDAY_REMOTE_URL,
  };

  localStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify(cache));
  setHolidayDataSource(cache);
  return toStatus('online', cache);
}
