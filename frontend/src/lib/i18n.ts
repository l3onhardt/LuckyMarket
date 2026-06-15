const STRATEGY: Record<string, string> = {
  data_value: '数据价值',
  trend: '趋势',
  contrarian: '反向',
  market_maker: '做市',
};

const MARKET_STATUS: Record<string, string> = {
  open: '开放交易',
  closed: '已关闭',
  settled: '已结算',
};

// 已知英文分类的显示映射；未知分类原样展示（分类是用户自建自由文本）
const CATEGORY: Record<string, string> = {
  product: '产品',
  tech: '科技',
  sports: '体育',
  entertainment: '娱乐',
  attendance: '考勤',
  delivery: '交付',
  ops: '运维',
  quality: '质量',
};

export function strategyLabel(value: string): string {
  return STRATEGY[value] ?? value;
}

export function marketStatusLabel(value: string): string {
  return MARKET_STATUS[value] ?? value;
}

export function categoryLabel(value: string): string {
  return CATEGORY[value] ?? value;
}
