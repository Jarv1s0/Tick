import dayjs, { Dayjs } from 'dayjs';
import { isWorkday as isBuiltinWorkday } from 'chinese-days';

export type HolidayStrategy = 'next_workday' | 'previous_workday' | 'none';
export type CycleMode = 'fixed' | 'rolling';

export interface HolidayDataSource {
  holidays: Record<string, string>;
  workdays: Record<string, string>;
  inLieuDays?: Record<string, string>;
}

export interface TaskConfig {
  id: string;
  name: string;
  intervalDays: number;
  symbol: string;
  enabled: boolean;
}

export interface ScheduleOptions {
  includeStartRow: boolean;
  holidayStrategy: HolidayStrategy;
  cycleMode: CycleMode;
}

export interface TaskRecord {
  date: string;
  tasks: Record<string, boolean>;
  bootTime?: string;
}

const MAX_ITERATIONS = 10000;
let holidayDataSource: HolidayDataSource | null = null;

export function setHolidayDataSource(source: HolidayDataSource | null): void {
  holidayDataSource = source;
}

function isWorkday(dateKey: string): boolean {
  if (holidayDataSource?.workdays[dateKey]) return true;
  if (holidayDataSource?.holidays[dateKey]) return false;
  return isBuiltinWorkday(dateKey);
}

function getNextWorkday(targetDate: Dayjs): Dayjs {
  let current = targetDate;
  while (!isWorkday(current.format('YYYY-MM-DD'))) {
    current = current.add(1, 'day');
  }
  return current;
}

function getPreviousWorkday(targetDate: Dayjs): Dayjs {
  let current = targetDate;
  while (!isWorkday(current.format('YYYY-MM-DD'))) {
    current = current.subtract(1, 'day');
  }
  return current;
}

function adjustByHoliday(targetDate: Dayjs, strategy: HolidayStrategy): Dayjs {
  if (strategy === 'none') return targetDate;
  if (strategy === 'previous_workday') return getPreviousWorkday(targetDate);
  return getNextWorkday(targetDate);
}

function toDateKey(date: Dayjs): string {
  return date.format('YYYY-MM-DD');
}

function getOrCreateRecord(recordsMap: Map<string, TaskRecord>, date: Dayjs): TaskRecord {
  const key = toDateKey(date);
  const existing = recordsMap.get(key);
  if (existing) return existing;

  const record: TaskRecord = {
    date: key,
    tasks: {},
  };
  recordsMap.set(key, record);
  return record;
}

export function generateSchedule(
  start: string,
  end: string,
  taskConfigs: TaskConfig[],
  options: ScheduleOptions,
): TaskRecord[] {
  const recordsMap = new Map<string, TaskRecord>();
  const startDate = dayjs(start);
  const endDate = dayjs(end);
  const enabledTasks = taskConfigs.filter((task) => task.enabled && task.intervalDays > 0);

  const resolveExecutionDate = (plannedDate: Dayjs): Dayjs | null => {
    const executionDate = adjustByHoliday(plannedDate, options.holidayStrategy);
    if (executionDate.isAfter(endDate)) return null;
    return executionDate;
  };

  const markTask = (executionDate: Dayjs, taskId: string) => {
    const record = getOrCreateRecord(recordsMap, executionDate);
    record.tasks[taskId] = true;
  };

  if (options.includeStartRow) {
    const startRowDate = adjustByHoliday(startDate, options.holidayStrategy);
    if (!startRowDate.isAfter(endDate)) {
      getOrCreateRecord(recordsMap, startRowDate);
    }
  }

  for (const task of enabledTasks) {
    if (options.cycleMode === 'fixed') {
      for (let offset = task.intervalDays, count = 0; ; offset += task.intervalDays, count += 1) {
        const plannedDate = startDate.add(offset, 'day');
        if (plannedDate.isAfter(endDate)) break;
        const executionDate = resolveExecutionDate(plannedDate);
        if (!executionDate) break;
        markTask(executionDate, task.id);
        if (count >= MAX_ITERATIONS) break;
      }
      continue;
    }

    let plannedDate = startDate.add(task.intervalDays, 'day');
    for (let count = 0; count < MAX_ITERATIONS; count += 1) {
      if (plannedDate.isAfter(endDate)) break;
      const executionDate = resolveExecutionDate(plannedDate);
      if (!executionDate) break;
      markTask(executionDate, task.id);
      plannedDate = executionDate.add(task.intervalDays, 'day');
    }
  }

  return Array.from(recordsMap.values()).sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf());
}

export function previewTaskDates(
  start: string,
  task: TaskConfig,
  options: Pick<ScheduleOptions, 'holidayStrategy' | 'cycleMode'>,
  count = 4,
): string[] {
  if (!task.enabled || task.intervalDays <= 0 || count <= 0) return [];

  const startDate = dayjs(start);
  if (!startDate.isValid()) return [];

  const results: string[] = [];

  if (options.cycleMode === 'fixed') {
    for (let offset = task.intervalDays, step = 0; results.length < count && step < MAX_ITERATIONS; offset += task.intervalDays, step += 1) {
      const plannedDate = startDate.add(offset, 'day');
      const executionDate = adjustByHoliday(plannedDate, options.holidayStrategy);
      results.push(toDateKey(executionDate));
    }
    return results;
  }

  let plannedDate = startDate.add(task.intervalDays, 'day');
  for (let step = 0; results.length < count && step < MAX_ITERATIONS; step += 1) {
    const executionDate = adjustByHoliday(plannedDate, options.holidayStrategy);
    results.push(toDateKey(executionDate));
    plannedDate = executionDate.add(task.intervalDays, 'day');
  }

  return results;
}


