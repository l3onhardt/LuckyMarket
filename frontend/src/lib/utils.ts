import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并 Tailwind CSS 类名
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 格式化数字（中文本地化）
 */
export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * 格式化相对日期（中文）
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  // Handle invalid dates
  if (isNaN(d.getTime())) {
    return '无效日期';
  }

  const now = new Date();
  const diff = now.getTime() - d.getTime();

  // Handle future dates
  if (diff < 0) {
    return d.toLocaleDateString('zh-CN');
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return d.toLocaleDateString('zh-CN');
  } else if (days > 0) {
    return `${days}天前`;
  } else if (hours > 0) {
    return `${hours}小时前`;
  } else if (minutes > 0) {
    return `${minutes}分钟前`;
  } else {
    return '刚刚';
  }
}

/**
 * 从池子数量计算结果价格
 */
export function calculatePrices(quantities: number[]): number[] {
  // Validate that all quantities are non-negative
  if (quantities.some(q => q < 0)) {
    throw new Error('Pool quantities must be non-negative');
  }

  const total = quantities.reduce((sum, q) => sum + q, 0);
  if (total === 0) return quantities.map(() => 0);
  return quantities.map(q => q / total);
}
