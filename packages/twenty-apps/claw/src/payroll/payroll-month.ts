import { todayInTashkent } from 'src/pricing/dates';

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export const monthOf = (date: string): string => date.slice(0, 7);

export const currentMonthInTashkent = (now: Date = new Date()): string =>
  monthOf(todayInTashkent(now));

export const shiftMonth = (month: string, delta: number): string => {
  const [year, monthNumber] = month.split('-').map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
};

export const formatMonthLabel = (month: string): string => {
  const [year, monthNumber] = month.split('-').map(Number);

  return `${MONTH_NAMES[monthNumber - 1]} ${year}`;
};
