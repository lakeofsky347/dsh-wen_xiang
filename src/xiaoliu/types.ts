import type { CastEnvironment, Element, LunarMoment } from '../core/types.ts';

export type XiaoliuPalaceName = '大安' | '留连' | '速喜' | '赤口' | '小吉' | '空亡';
export type XiaoliuCategory = '感情' | '事业' | '财运' | '健康' | '出行' | '寻物' | '学业' | '人际' | '决策' | '综合';
export interface XiaoliuReading {
  category: XiaoliuCategory;
  summary: string;
  heaven: string;
  earth: string;
  human: string;
  relations: string;
  advice: string;
}
export interface XiaoliuPalace {
  number: number;
  name: XiaoliuPalaceName;
  element: Element;
  spirit: string;
  keywords: readonly string[];
  meaning: string;
}
export interface XiaoliuInput { question: string; environment: CastEnvironment }
export interface XiaoliuResult {
  algorithmVersion: 'xiaoliu-month-day-hour-v1';
  input: XiaoliuInput;
  lunar: LunarMoment;
  monthPalace: XiaoliuPalace;
  dayPalace: XiaoliuPalace;
  hourPalace: XiaoliuPalace;
  name: XiaoliuPalaceName;
  element: Element;
  meaning: string;
  reading: XiaoliuReading;
  steps: readonly string[];
  conventions: readonly string[];
}
