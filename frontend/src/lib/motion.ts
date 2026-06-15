import { cubicBezier } from 'framer-motion';

// 液体感缓动（spec §交互设计）；用 helper 避免 TS 元组类型摩擦
const liquid = cubicBezier(0.4, 0, 0.2, 1);

export const pageFade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: liquid },
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } },
};

export const listItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: liquid } },
};
