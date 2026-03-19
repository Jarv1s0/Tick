import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import './DatePickerInput.css';

interface DatePickerInputProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function toDateOnly(date: Dayjs): Dayjs {
  return dayjs(date.format('YYYY-MM-DD'));
}

export default function DatePickerInput({
  value,
  onChange,
  min,
  max,
  placeholder = '选择日期',
}: DatePickerInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    value ? dayjs(value).startOf('month') : dayjs().startOf('month'),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = value ? dayjs(value) : null;
  const minDate = useMemo(() => (min ? toDateOnly(dayjs(min)) : null), [min]);
  const maxDate = useMemo(() => (max ? toDateOnly(dayjs(max)) : null), [max]);

  useEffect(() => {
    if (!isOpen) return;
    if (!value) return;
    const selectedDate = dayjs(value);
    if (!selectedDate.isValid()) return;
    setViewMonth(selectedDate.startOf('month'));
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [isOpen]);

  const isOutOfRange = (date: Dayjs): boolean => {
    if (minDate && date.isBefore(minDate, 'day')) return true;
    if (maxDate && date.isAfter(maxDate, 'day')) return true;
    return false;
  };

  const handleSelect = (date: Dayjs) => {
    const normalized = toDateOnly(date);
    if (isOutOfRange(normalized)) return;
    onChange(normalized.format('YYYY-MM-DD'));
    setIsOpen(false);
  };

  const cells = useMemo(() => {
    const monthStart = viewMonth.startOf('month');
    const monthEnd = viewMonth.endOf('month');
    const leadingEmpty = (monthStart.day() + 6) % 7;
    const days: Array<Dayjs | null> = [];

    for (let i = 0; i < leadingEmpty; i += 1) {
      days.push(null);
    }

    for (let d = 1; d <= monthEnd.date(); d += 1) {
      days.push(viewMonth.date(d));
    }

    while (days.length % 7 !== 0) {
      days.push(null);
    }

    return days;
  }, [viewMonth]);

  const years = useMemo(() => {
    const center = viewMonth.year();
    return Array.from({ length: 11 }, (_, i) => center - 5 + i);
  }, [viewMonth]);

  return (
    <div className="dp-root" ref={rootRef}>
      <button type="button" className="dp-trigger" onClick={() => setIsOpen((prev) => !prev)}>
        {selected && selected.isValid() ? selected.format('YYYY/MM/DD') : placeholder}
      </button>

      {isOpen && (
        <div className="dp-popover">
          <div className="dp-header">
            <button type="button" onClick={() => setViewMonth((prev) => prev.subtract(1, 'month'))}>
              ‹
            </button>
            <div className="dp-header-selects">
              <select
                value={viewMonth.year()}
                onChange={(e) => {
                  const nextYear = Number(e.target.value);
                  setViewMonth((prev) => prev.year(nextYear));
                }}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}年
                  </option>
                ))}
              </select>
              <select
                value={viewMonth.month()}
                onChange={(e) => {
                  const nextMonth = Number(e.target.value);
                  setViewMonth((prev) => prev.month(nextMonth));
                }}
              >
                {Array.from({ length: 12 }, (_, i) => i).map((month) => (
                  <option key={month} value={month}>
                    {month + 1}月
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => setViewMonth((prev) => prev.add(1, 'month'))}>
              ›
            </button>
          </div>

          <div className="dp-week">
            {WEEK_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="dp-grid">
            {cells.map((date, index) => {
              if (!date) {
                return <span key={`empty-${index}`} className="dp-empty" />;
              }

              const dateKey = date.format('YYYY-MM-DD');
              const isSelected = !!selected && selected.isValid() && selected.isSame(date, 'day');
              const isToday = date.isSame(dayjs(), 'day');
              const disabled = isOutOfRange(date);

              return (
                <button
                  type="button"
                  key={dateKey}
                  className={`dp-day${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                  onClick={() => handleSelect(date)}
                  disabled={disabled}
                >
                  {date.date()}
                </button>
              );
            })}
          </div>

          <div className="dp-actions">
            <button type="button" onClick={() => handleSelect(dayjs())} disabled={isOutOfRange(toDateOnly(dayjs()))}>
              今天
            </button>
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
            >
              清空
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
