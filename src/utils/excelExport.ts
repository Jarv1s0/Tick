import XLSX from 'xlsx-js-style';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { TaskConfig, TaskRecord } from './dateCalculator';

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[\\/:*?"<>|]/g, '_').trim();
}

export async function exportToExcel(
  records: TaskRecord[],
  taskConfigs: TaskConfig[],
  tableTitle: string,
): Promise<boolean> {
  const enabledTasks = taskConfigs.filter((task) => task.enabled);
  const normalizedTitle = tableTitle.trim() || '计划表';
  const headers = ['日期', ...enabledTasks.map((task) => `${task.name} (${task.intervalDays}天)`), '开机时间', '备注'];

  const data: string[][] = [
    [normalizedTitle],
    headers,
    ...records.map((record) => [
      record.date,
      ...enabledTasks.map((task) => (record.tasks[task.id] ? task.symbol : '')),
      record.bootTime || '',
      '',
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const lastColumnIndex = headers.length - 1;
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastColumnIndex } }];
  const wscols = [{ wch: 15 }, ...enabledTasks.map(() => ({ wch: 20 })), { wch: 14 }, { wch: 20 }];
  worksheet['!cols'] = wscols;

  const titleCellRef = XLSX.utils.encode_cell({ r: 0, c: 0 });
  const titleCell = worksheet[titleCellRef];
  if (titleCell) {
    (titleCell as XLSX.CellObject & { s?: Record<string, unknown> }).s = {
      alignment: { horizontal: 'center', vertical: 'center' },
      font: { bold: true, sz: 14 },
    };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '计划表');

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });

  const filePath = await save({
    filters: [{
      name: 'Excel',
      extensions: ['xlsx']
    }],
    defaultPath: `${sanitizeFileName(normalizedTitle) || '计划表'}.xlsx`
  });

  if (!filePath) {
    return false;
  }

  await writeFile(filePath, new Uint8Array(excelBuffer));
  return true;
}
