import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import {
  generateSchedule,
  previewTaskDates,
  ScheduleOptions,
  TaskConfig,
  TaskRecord,
} from './utils/dateCalculator';
import {
  formatHolidayUpdatedAt,
  HolidayDataStatus,
  initializeHolidayData,
  refreshHolidayDataOnline,
} from './utils/holidayData';
import { exportToExcel } from './utils/excelExport';
import DatePickerInput from './components/DatePickerInput';
import './App.css';

const TASKS_STORAGE_KEY = 'tick_task_configs_v1';
const OPTIONS_STORAGE_KEY = 'tick_schedule_options_v1';
const TABLE_TITLE_STORAGE_KEY = 'tick_table_title_v1';
const BOOT_TIME_RANGE_STORAGE_KEY = 'tick_boot_time_range_v1';
const DEFAULT_TABLE_TITLE = '计划表';
const DEFAULT_BOOT_TIME_RANGE = {
  start: '08:00',
  end: '09:00',
};

const DEFAULT_TASKS: TaskConfig[] = [
  { id: 'password', name: '修改密码', intervalDays: 7, symbol: '√', enabled: true },
  { id: 'antivirus', name: '升级/查杀病毒', intervalDays: 14, symbol: '□', enabled: true },
  { id: 'log', name: '查看日志', intervalDays: 30, symbol: '○', enabled: true },
];

const DEFAULT_OPTIONS: ScheduleOptions = {
  includeStartRow: true,
  holidayStrategy: 'next_workday',
  cycleMode: 'fixed',
};

type SettingsTab = 'tasks' | 'rules';
type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  type: ToastType;
  message: string;
}

interface BootTimeRange {
  start: string;
  end: string;
}

function createTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function loadTaskConfigs(): TaskConfig[] {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return DEFAULT_TASKS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_TASKS;

    const normalized = parsed
      .map((item) => ({
        id: String(item.id || createTaskId()),
        name: String(item.name || '').trim(),
        intervalDays: Number(item.intervalDays),
        symbol: String(item.symbol || '').trim(),
        enabled: item.enabled !== false,
      }))
      .filter((item) => item.name && Number.isFinite(item.intervalDays) && item.intervalDays > 0);

    return normalized.length > 0 ? normalized : DEFAULT_TASKS;
  } catch {
    return DEFAULT_TASKS;
  }
}

function loadScheduleOptions(): ScheduleOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    const parsed = JSON.parse(raw);
    const cycleMode = parsed?.cycleMode === 'rolling' ? 'rolling' : 'fixed';
    const holidayStrategy = ['next_workday', 'previous_workday', 'none'].includes(parsed?.holidayStrategy)
      ? parsed.holidayStrategy
      : 'next_workday';

    return {
      includeStartRow: parsed?.includeStartRow ?? true,
      cycleMode,
      holidayStrategy,
    };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

function loadTableTitle(): string {
  try {
    const raw = localStorage.getItem(TABLE_TITLE_STORAGE_KEY);
    const normalized = (raw || '').trim();
    return normalized || DEFAULT_TABLE_TITLE;
  } catch {
    return DEFAULT_TABLE_TITLE;
  }
}

function isValidTimeValue(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function parseTimeToMinutes(value: string): number | null {
  if (!isValidTimeValue(value)) return null;
  const [hoursText, minutesText] = value.split(':');
  return Number(hoursText) * 60 + Number(minutesText);
}

function loadBootTimeRange(): BootTimeRange {
  try {
    const raw = localStorage.getItem(BOOT_TIME_RANGE_STORAGE_KEY);
    if (!raw) return DEFAULT_BOOT_TIME_RANGE;
    const parsed = JSON.parse(raw);
    const start = typeof parsed?.start === 'string' ? parsed.start : '';
    const end = typeof parsed?.end === 'string' ? parsed.end : '';
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);
    if (startMinutes === null || endMinutes === null || startMinutes > endMinutes) {
      return DEFAULT_BOOT_TIME_RANGE;
    }
    return { start, end };
  } catch {
    return DEFAULT_BOOT_TIME_RANGE;
  }
}

function formatMinutesToTime(totalMinutes: number): string {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function generateRandomBootTime(range: BootTimeRange): string {
  const startMinutes = parseTimeToMinutes(range.start);
  const endMinutes = parseTimeToMinutes(range.end);
  if (startMinutes === null || endMinutes === null || startMinutes > endMinutes) {
    return '';
  }

  // 在用户设定的时间段内按分钟随机生成开机时间，保证页面和导出结果一致。
  const offset = Math.floor(Math.random() * (endMinutes - startMinutes + 1));
  return formatMinutesToTime(startMinutes + offset);
}

function App() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [records, setRecords] = useState<TaskRecord[]>([]);
  const [taskConfigs, setTaskConfigs] = useState<TaskConfig[]>(() => loadTaskConfigs());
  const [scheduleOptions, setScheduleOptions] = useState<ScheduleOptions>(() => loadScheduleOptions());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('tasks');
  const [draftTasks, setDraftTasks] = useState<TaskConfig[]>([]);
  const [draftOptions, setDraftOptions] = useState<ScheduleOptions>(DEFAULT_OPTIONS);
  const [tableTitle, setTableTitle] = useState(() => loadTableTitle());
  const [draftTableTitle, setDraftTableTitle] = useState(DEFAULT_TABLE_TITLE);
  const [bootTimeRange, setBootTimeRange] = useState<BootTimeRange>(() => loadBootTimeRange());
  const [draftBootTimeRange, setDraftBootTimeRange] = useState<BootTimeRange>(DEFAULT_BOOT_TIME_RANGE);
  const [holidayDataStatus, setHolidayDataStatus] = useState<HolidayDataStatus>(() => initializeHolidayData());
  const [isHolidayDataUpdating, setIsHolidayDataUpdating] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const datePanelRef = useRef<HTMLDivElement | null>(null);
  const [tableHeight, setTableHeight] = useState(360);

  const enabledTasks = taskConfigs.filter((task) => task.enabled);
  const tableColumnCount = enabledTasks.length + 3;
  const isDateRangeInvalid =
    !!startDate &&
    !!endDate &&
    dayjs(endDate).isBefore(dayjs(startDate), 'day');
  const dateSpanDays =
    startDate && endDate && !isDateRangeInvalid
      ? dayjs(endDate).diff(dayjs(startDate), 'day') + 1
      : 0;
  const canCalculate = !!startDate && !!endDate && !isDateRangeInvalid;
  const previewStartDate = startDate || dayjs().format('YYYY-MM-DD');
  const previewRows = draftTasks
    .filter((task) => task.enabled && task.intervalDays > 0 && task.name.trim())
    .slice(0, 5)
    .map((task) => ({
      task,
      fixedDates: previewTaskDates(
        previewStartDate,
        task,
        { holidayStrategy: draftOptions.holidayStrategy, cycleMode: 'fixed' },
        4,
      ),
      rollingDates: previewTaskDates(
        previewStartDate,
        task,
        { holidayStrategy: draftOptions.holidayStrategy, cycleMode: 'rolling' },
        4,
      ),
    }));
  const holidayDataModeText =
    holidayDataStatus.mode === 'online'
      ? `在线缓存（覆盖年份：${holidayDataStatus.yearRange || '未知'}）`
      : '内置离线数据（随应用版本）';
  const holidayDataUpdatedAtText = formatHolidayUpdatedAt(holidayDataStatus.fetchedAt);
  const holidayDataInlineText = `当前来源：${holidayDataModeText} | 最近更新：${holidayDataUpdatedAtText}`;

  const showToast = (type: ToastType, message: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    const id = Date.now();
    setToast({ id, type, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 2200);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (records.length === 0) return;

    const updateTableHeight = () => {
      const panelBottom = datePanelRef.current?.getBoundingClientRect().bottom ?? 0;
      const viewportHeight = window.innerHeight;
      const bottomSpacing = 20;
      const availableHeight = viewportHeight - panelBottom - bottomSpacing;
      setTableHeight(Math.max(240, Math.floor(availableHeight)));
    };

    updateTableHeight();
    window.addEventListener('resize', updateTableHeight);

    const observer = typeof ResizeObserver !== 'undefined' && datePanelRef.current
      ? new ResizeObserver(updateTableHeight)
      : null;
    if (observer && datePanelRef.current) {
      observer.observe(datePanelRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateTableHeight);
      observer?.disconnect();
    };
  }, [records.length]);

  const handleCalculate = () => {
    if (!startDate || !endDate) return;
    if (new Date(startDate) > new Date(endDate)) {
      showToast('error', '结束日期不能早于开始日期');
      return;
    }

    const result = generateSchedule(startDate, endDate, taskConfigs, scheduleOptions).map((record) => ({
      ...record,
      bootTime: generateRandomBootTime(bootTimeRange),
    }));
    setRecords(result);
    if (result.length === 0) {
      showToast('info', '当前条件下没有生成记录');
      return;
    }
    showToast('success', `已生成 ${result.length} 条记录`);
  };

  const handleExport = async () => {
    if (records.length === 0) return;
    try {
      const exported = await exportToExcel(records, taskConfigs, tableTitle);
      if (exported) {
        showToast('success', '导出成功');
      }
    } catch (error) {
      console.error('导出失败:', error);
      showToast('error', `导出失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handlePrint = () => {
    if (records.length === 0) return;
    window.print();
  };

  const openSettings = () => {
    setDraftTasks(taskConfigs.map((task) => ({ ...task })));
    setDraftOptions({ ...scheduleOptions });
    setDraftTableTitle(tableTitle);
    setDraftBootTimeRange({ ...bootTimeRange });
    setSettingsError('');
    setSettingsTab('tasks');
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = () => {
    if (draftTasks.length === 0) {
      setSettingsError('请至少保留一个项目');
      return;
    }

    const normalizedTasks = draftTasks.map((task) => ({
      ...task,
      name: task.name.trim(),
      symbol: task.symbol.trim() || '√',
      intervalDays: Number(task.intervalDays),
    }));

    const hasInvalid = normalizedTasks.some(
      (task) => !task.name || !Number.isInteger(task.intervalDays) || task.intervalDays <= 0,
    );
    if (hasInvalid) {
      setSettingsError('项目名称不能为空，周期必须是大于 0 的整数');
      return;
    }

    setTaskConfigs(normalizedTasks);
    setScheduleOptions(draftOptions);
    const normalizedTableTitle = draftTableTitle.trim() || DEFAULT_TABLE_TITLE;
    const startMinutes = parseTimeToMinutes(draftBootTimeRange.start);
    const endMinutes = parseTimeToMinutes(draftBootTimeRange.end);
    if (startMinutes === null || endMinutes === null) {
      setSettingsError('开机时间段必须使用 HH:mm 格式');
      return;
    }
    if (startMinutes > endMinutes) {
      setSettingsError('开机开始时间不能晚于结束时间');
      return;
    }
    const normalizedBootTimeRange = {
      start: draftBootTimeRange.start,
      end: draftBootTimeRange.end,
    };
    setTableTitle(normalizedTableTitle);
    setBootTimeRange(normalizedBootTimeRange);
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(normalizedTasks));
    localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(draftOptions));
    localStorage.setItem(TABLE_TITLE_STORAGE_KEY, normalizedTableTitle);
    localStorage.setItem(BOOT_TIME_RANGE_STORAGE_KEY, JSON.stringify(normalizedBootTimeRange));
    setIsSettingsOpen(false);
    setRecords([]);
    showToast('success', '设置已保存');
  };

  const handleRefreshHolidayData = async () => {
    setIsHolidayDataUpdating(true);
    try {
      const nextStatus = await refreshHolidayDataOnline();
      setHolidayDataStatus(nextStatus);
      setRecords([]);
      showToast('success', `节假日数据已更新（${nextStatus.yearRange || '年份未知'}）`);
    } catch (error) {
      showToast('error', `更新失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsHolidayDataUpdating(false);
    }
  };

  const updateDraftTask = (id: string, patch: Partial<TaskConfig>) => {
    setDraftTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  };

  const addDraftTask = () => {
    setDraftTasks((prev) => [
      ...prev,
      { id: createTaskId(), name: '', intervalDays: 7, symbol: '√', enabled: true },
    ]);
  };

  const removeDraftTask = (id: string) => {
    setDraftTasks((prev) => prev.filter((task) => task.id !== id));
  };

  const applyQuickRange = (days: number) => {
    const start = dayjs().format('YYYY-MM-DD');
    const end = dayjs().add(days - 1, 'day').format('YYYY-MM-DD');
    setStartDate(start);
    setEndDate(end);
  };

  const applyCurrentMonth = () => {
    setStartDate(dayjs().startOf('month').format('YYYY-MM-DD'));
    setEndDate(dayjs().endOf('month').format('YYYY-MM-DD'));
  };

  const swapDates = () => {
    if (!startDate || !endDate) return;
    setStartDate(endDate);
    setEndDate(startDate);
  };

  return (
    <div className="container">
      <div className="date-panel" ref={datePanelRef}>
        <div className="date-grid">
          <div className="date-field">
            <label>开始日期</label>
            <DatePickerInput
              value={startDate}
              max={endDate || undefined}
              placeholder="选择开始日期"
              onChange={setStartDate}
            />
          </div>

          <div className="date-field">
            <label>结束日期</label>
            <DatePickerInput
              value={endDate}
              min={startDate || undefined}
              placeholder="选择结束日期"
              onChange={setEndDate}
            />
          </div>
        </div>

        <div className="quick-range-row">
          <button className="ghost-btn" onClick={() => applyQuickRange(7)}>近7天</button>
          <button className="ghost-btn" onClick={() => applyQuickRange(30)}>近30天</button>
          <button className="ghost-btn" onClick={() => applyQuickRange(90)}>近90天</button>
          <button className="ghost-btn" onClick={applyCurrentMonth}>本月</button>
          <button className="ghost-btn" onClick={swapDates} disabled={!startDate || !endDate}>交换日期</button>
        </div>

        <div className="date-toolbar">
          <div className={`date-summary ${isDateRangeInvalid ? 'date-summary-error' : ''}`}>
            {isDateRangeInvalid
              ? '结束日期不能早于开始日期'
              : canCalculate
                ? `当前区间：${dateSpanDays} 天`
                : '请选择开始日期和结束日期'}
          </div>

          <div className="action-row">
            <button className="primary-btn" onClick={handleCalculate} disabled={!canCalculate}>生成计划表</button>
            {records.length > 0 && (
              <>
                <button onClick={handlePrint} className="print-btn">打印</button>
                <button onClick={handleExport} className="success-btn">导出 Excel</button>
              </>
            )}
            <button className="secondary-btn" onClick={openSettings}>设置</button>
          </div>
        </div>
      </div>


      {records.length > 0 && (
        <div className="table-wrap" style={{ height: `${tableHeight}px` }}>
          <table className="schedule-table">
            <thead>
              <tr className="table-title-row">
                <th className="table-title-cell" colSpan={tableColumnCount}>{tableTitle}</th>
              </tr>
              <tr>
                <th className="date-col">日期</th>
                {enabledTasks.map((task) => (
                  <th key={task.id}>
                    {task.name} ({task.intervalDays}天)
                  </th>
                ))}
                <th>开机时间</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {records.map((row, index) => (
                <tr key={index}>
                  <td className="date-col-cell">{row.date}</td>
                  {enabledTasks.map((task) => (
                    <td key={task.id}>{row.tasks[task.id] ? task.symbol : ''}</td>
                  ))}
                  <td>{row.bootTime || ''}</td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>设置</h3>
            <div className="settings-tabs">
              <button
                className={settingsTab === 'tasks' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setSettingsTab('tasks')}
              >
                项目配置
              </button>
              <button
                className={settingsTab === 'rules' ? 'tab-btn active' : 'tab-btn'}
                onClick={() => setSettingsTab('rules')}
              >
                计算方式与预览
              </button>
            </div>

            {settingsTab === 'tasks' && (
              <>
                <div className="settings-section title-config-section">
                  <div className="title-config-stack">
                    <div className="title-config-row">
                      <label htmlFor="table-title-input">标题行设置</label>
                      <input
                        id="table-title-input"
                        type="text"
                        placeholder="例如：设备维护计划表"
                        value={draftTableTitle}
                        onChange={(e) => setDraftTableTitle(e.target.value)}
                      />
                    </div>
                    <div className="title-config-row">
                      <label>开机时间段设置</label>
                      <div className="time-range-inputs">
                        <input
                          type="time"
                          value={draftBootTimeRange.start}
                          onChange={(e) =>
                            setDraftBootTimeRange((prev) => ({ ...prev, start: e.target.value }))
                          }
                        />
                        <span className="time-range-separator">至</span>
                        <input
                          type="time"
                          value={draftBootTimeRange.end}
                          onChange={(e) =>
                            setDraftBootTimeRange((prev) => ({ ...prev, end: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="settings-section">
                  {draftTasks.map((task) => (
                    <div className="task-row" key={task.id}>
                      <input
                        type="text"
                        placeholder="项目名称"
                        value={task.name}
                        onChange={(e) => updateDraftTask(task.id, { name: e.target.value })}
                      />
                      <input
                        type="number"
                        min={1}
                        value={task.intervalDays}
                        onChange={(e) => updateDraftTask(task.id, { intervalDays: Number(e.target.value) })}
                      />
                      <input
                        type="text"
                        className="symbol-input"
                        maxLength={2}
                        value={task.symbol}
                        onChange={(e) => updateDraftTask(task.id, { symbol: e.target.value })}
                      />
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={task.enabled}
                          onChange={(e) => updateDraftTask(task.id, { enabled: e.target.checked })}
                        />
                        启用
                      </label>
                      <button className="danger-btn" onClick={() => removeDraftTask(task.id)}>删除</button>
                    </div>
                  ))}
                  <button className="secondary-btn" onClick={addDraftTask}>+ 添加项目</button>
                </div>
              </>
            )}

            {settingsTab === 'rules' && (
              <div className="settings-section">
                <div className="help-tip">
                  <div>
                    固定周期：每次都按“开始日期 + 周期天数 * N”计算，节假日调整不会影响下一次基准日。
                  </div>
                  <div>
                    滚动周期：下一次按“上一次实际执行日 + 周期天数”计算，节假日调整会传递到后续日期。
                  </div>
                </div>
                <div className="option-row holiday-data-row">
                  <label>节假日数据</label>
                  <div className="holiday-data-panel">
                    <div className="holiday-data-action-row">
                      <button
                        className="holiday-refresh-btn"
                        onClick={handleRefreshHolidayData}
                        disabled={isHolidayDataUpdating}
                      >
                        {isHolidayDataUpdating ? '更新中...' : '更新节假日数据'}
                      </button>
                      <span className="holiday-data-inline">{holidayDataInlineText}</span>
                    </div>
                  </div>
                </div>
                <div className="option-row">
                  <label>周期模式</label>
                  <select
                    value={draftOptions.cycleMode}
                    onChange={(e) => setDraftOptions((prev) => ({ ...prev, cycleMode: e.target.value as 'fixed' | 'rolling' }))}
                  >
                    <option value="fixed">固定周期（按开始日期）</option>
                    <option value="rolling">滚动周期（按实际执行日）</option>
                  </select>
                </div>
                <div className="option-row">
                  <label>非工作日策略</label>
                  <select
                    value={draftOptions.holidayStrategy}
                    onChange={(e) =>
                      setDraftOptions((prev) => ({
                        ...prev,
                        holidayStrategy: e.target.value as 'next_workday' | 'previous_workday' | 'none',
                      }))
                    }
                  >
                    <option value="next_workday">顺延到下个工作日</option>
                    <option value="previous_workday">提前到上个工作日</option>
                    <option value="none">不调整</option>
                  </select>
                </div>
                <div className="option-row option-switch-row">
                  <label htmlFor="include-start-row-switch">包含开始日期空行</label>
                  <div className="option-switch-control">
                    <input
                      id="include-start-row-switch"
                      className="native-switch"
                      type="checkbox"
                      checked={draftOptions.includeStartRow}
                      onChange={(e) => setDraftOptions((prev) => ({ ...prev, includeStartRow: e.target.checked }))}
                    />
                  </div>
                </div>

                <div className="preview-box">
                  <div className="preview-title">
                    示例预览（基准开始日：{previewStartDate}，当前非工作日策略生效）
                  </div>
                  {previewRows.length === 0 ? (
                    <div className="preview-empty">请先添加并启用至少一个有效项目以查看预览。</div>
                  ) : (
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th>项目</th>
                          <th>固定周期（前4次）</th>
                          <th>滚动周期（前4次）</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map(({ task, fixedDates, rollingDates }) => (
                          <tr key={task.id}>
                            <td>{task.name}（{task.intervalDays}天）</td>
                            <td>{fixedDates.join(' / ')}</td>
                            <td>{rollingDates.join(' / ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {settingsError && <div className="settings-error">{settingsError}</div>}

            <div className="modal-actions">
              <button className="secondary-btn" onClick={() => setIsSettingsOpen(false)}>取消</button>
              <button className="primary-btn" onClick={handleSaveSettings}>保存设置</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`} key={toast.id}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
