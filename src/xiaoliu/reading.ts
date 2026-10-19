import type { Element, LunarMoment } from '../core/types.ts';
import type { XiaoliuCategory, XiaoliuPalace, XiaoliuPalaceName, XiaoliuReading } from './types.ts';

/**
 * 道传小六壬的死六神排宫。六神固定不随时辰转动：
 * 大安青龙木、留连腾蛇土、速喜朱雀火、赤口白虎金、小吉玄武水、空亡勾陈土。
 * 活六神是另一套按时辰起转的辅助取象法，本版不混用。
 */
const GENERATES: Record<Element, Element> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CONTROLS: Record<Element, Element> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

const PACE: Record<XiaoliuPalaceName, string> = {
  大安: '稳起',
  留连: '绕起',
  速喜: '快起',
  赤口: '冲起',
  小吉: '缓起',
  空亡: '停起',
};

const OVERALL: Record<XiaoliuPalaceName, string> = {
  大安: '先稳后进',
  留连: '以缓制拖',
  速喜: '快中求准',
  赤口: '先解摩擦',
  小吉: '小步推进',
  空亡: '先补条件',
};

interface PalaceProfile {
  heaven: string;
  earth: string;
  human: string;
  advice: string;
}

const PROFILE: Record<XiaoliuPalaceName, PalaceProfile> = {
  大安: {
    heaven: '起因多半不是突发事件，而是原有安排、旧关系或一个已经存在的平台；外部节奏偏慢，先手不一定在你这边。',
    earth: '经过有稳定的底子，事情不会一下子散掉，但也容易停在“看起来没问题”的位置，缺少真正的推进。',
    human: '落点偏向守住现状或按部就班；能成的事多在小步推进，不宜一次把筹码压满。',
    advice: '先稳住已有安排，把可以确认的条件列出来；想动也只动一小步，观察对方是否接住。',
  },
  留连: {
    heaven: '起因里带着旧事、传话或没有说清的部分；信息在几个人之间转了一圈，真正的起点反而不显眼。',
    earth: '经过容易拖长：流程、审批、回消息或人情牵绊，都会让事情在原地打转。',
    human: '落点偏向暂缓或反复；不是完全没机会，而是现在这一下还推不动，硬推容易把关系弄僵。',
    advice: '先补信息、拆小步骤，把“谁在等谁”写清楚；不要用催促代替核对，也不要在同一天反复改主意。',
  },
  速喜: {
    heaven: '起因多由消息、通知、介绍或一次快速互动触发；机会来得急，热度也集中在前半段。',
    earth: '经过推进得快，适合抢时间窗口；但火势后劲有限，快不等于稳，细节容易跟不上。',
    human: '落点偏向速成或很快见分晓；适合短周期、能当场反馈的事，拖久了反而生变。',
    advice: '给自己一个短窗口，先做再说；同时把关键细节留成文字，别让“快”吃掉“准”。',
  },
  赤口: {
    heaven: '起因里已经有分歧、竞争或一句没说好的话；外部压力偏硬，容易一开口就带锋芒。',
    earth: '经过的摩擦集中在表达、边界和规则上；事情本身未必难，难的是各方愿不愿意各退半步。',
    human: '落点偏向口舌、争执或需要划清边界；能书面就不口头，能第三方在场就不要两个人硬碰。',
    advice: '先把事实、诉求和底线分开写；该留的证据留好，能不在情绪里做决定就先缓一晚。',
  },
  小吉: {
    heaven: '起因里有可商量的人情或小范围的机会；不是大风口，更像一条能走通的小路。',
    earth: '经过适合小步试水、先拿一个小结果；资源不算厚，但愿意配合的人能起到作用。',
    human: '落点偏向小成或局部缓和；别期待一次解决全部，先让事情往前挪一格。',
    advice: '先做一个具体的小动作——约一次、问一句、递一个具体的提议；看对方怎么接，再决定要不要加码。',
  },
  空亡: {
    heaven: '起因里有一块信息是缺的，或者条件看着在、实际没有到位；现在看到的未必是全貌。',
    earth: '经过容易停住或落空：约不成、批不下来、对方态度不明，都会让事情悬在半空。',
    human: '落点偏向未定或难落地；不是一定没有，而是此刻还缺少让它成立的关键条件。',
    advice: '暂缓承诺，先确认最关键的那个条件是否真的存在；如果确认不了，就把期待收小，另留一条退路。',
  },
};

interface CategoryLens {
  heaven: string;
  earth: string;
  human: string;
  hints: Partial<Record<XiaoliuPalaceName, string>>;
  closing?: string;
}

const CATEGORY: Record<Exclude<XiaoliuCategory, '综合'>, CategoryLens> = {
  感情: {
    heaven: '对方的状态与缘分的起点',
    earth: '两人当下的相处与阻碍',
    human: '你在这段关系里的位置与走向',
    hints: {
      大安: '关系底子不差，但双方都容易停在原位，等对方先动。',
      留连: '旧事、冷战或说不清的情绪还在拉扯，别指望一次谈完。',
      速喜: '消息、介绍或一次快速互动是引线，热度来得快，也要看能不能接住。',
      赤口: '争执点多半在表达方式和边界，话赶话最容易伤人。',
      小吉: '有缓和空间，但需要一方先给出小而具体的动作。',
      空亡: '对方或关系的真实态度还有一块没露出来，先别替对方下结论。',
    },
  },
  事业: {
    heaven: '环境、上级或项目源头',
    earth: '手头条件、协作与推进',
    human: '你自身的动作与结果',
    hints: {
      大安: '平台稳，但别把稳定当成不用动；先守住基本盘。',
      留连: '流程、审批或跨部门协作容易拖，先把责任人盯清。',
      速喜: '消息来得快，适合抢时间窗口；先把能交付的部分做出来。',
      赤口: '竞争、评审或口舌是主要摩擦，重要结论尽量留书面。',
      小吉: '适合小步试水、先拿一个小结果，用结果换下一步资源。',
      空亡: '资源或授权可能没有真正到位，先确认再投入。',
    },
  },
  财运: {
    heaven: '财源与外部条件',
    earth: '经营、渠道与风险',
    human: '到手与否、如何守',
    hints: {
      大安: '守成可取，扩张不宜；先把已有现金流看住。',
      留连: '回款或决策容易拖，账期要提前确认。',
      速喜: '快进快出，别恋战；到手的部分先落袋。',
      赤口: '易有纠纷、破财或价格战，合同和数字要抠细。',
      小吉: '因人得财或小额进账，适合先做小单。',
      空亡: '账面上的数字未必落袋，别把预期当现金。',
    },
  },
  健康: {
    heaven: '诱因与上焦、头面',
    earth: '中焦、脾胃与过程',
    human: '下焦、肾与恢复结果',
    hints: {
      大安: '多与久坐、劳倦、肝胆有关，先调作息。',
      留连: '脾胃、湿滞或反复的小问题，饮食要收一收。',
      速喜: '心火、血压、睡眠偏急，别把节奏拉太满。',
      赤口: '外伤、炎症、呼吸或需要检查的部位，别硬扛。',
      小吉: '肾水、代谢或精力透支，适合慢慢补。',
      空亡: '检查不出明确器质问题，或恢复偏慢，先观察再复查。',
    },
    closing: '身体不适请以医生诊断为准。',
  },
  出行: {
    heaven: '天气、方向与出发条件',
    earth: '路途、交通与中转',
    human: '到达与整体体验',
    hints: {
      大安: '宜近不宜远，行程偏稳，按原计划走即可。',
      留连: '延误、改签或路上反复，时间要留余量。',
      速喜: '成行快，别拖；适合短途或当天往返。',
      赤口: '注意交通摩擦、争执或意外，证件和保险先查。',
      小吉: '一路顺当，适合轻装；多留一点机动时间。',
      空亡: '可能不成行或途中受阻，先确认票务和目的地。',
    },
  },
  寻物: {
    heaven: '物品的状态与藏处',
    earth: '位置变化与方位',
    human: '能否找回',
    hints: {
      大安: '多在家中或东方，先回原位附近找。',
      留连: '偏南，可能在移动中或夹层、抽屉里。',
      速喜: '正南偏西，显眼处或近火、电器的地方。',
      赤口: '正西，易被压住或与金属、利器放在一起。',
      小吉: '西南，近水或低处。',
      空亡: '难寻，可能已不在原处，先扩大范围。',
    },
    closing: '方位是象意，先从最符合描述的角落找。',
  },
  学业: {
    heaven: '考试或申请的外部条件',
    earth: '准备过程与资料',
    human: '临场与结果',
    hints: {
      大安: '基础稳，按部就班即可，别临时换方法。',
      留连: '复习容易拖，先把资料收拢、进度排出来。',
      速喜: '适合冲刺，临场发挥快；注意别漏细节。',
      赤口: '注意审题、表达和竞争，模拟一遍流程。',
      小吉: '小进步可期，别求一口吃成。',
      空亡: '有落空或发挥不稳的风险，先把底线守住。',
    },
  },
  人际: {
    heaven: '关系里的对方与环境',
    earth: '互动方式与误会',
    human: '你的位置与结果',
    hints: {
      大安: '保持礼数和距离即可，不必急着表态。',
      留连: '旧账或传话容易让事情绕圈，尽量直接沟通。',
      速喜: '把话说开，快刀斩乱麻，但别在气头上说。',
      赤口: '少争一句，先留证据；能第三方在场更好。',
      小吉: '找中间人缓冲，或先做一件小事示好。',
      空亡: '对方态度不明，先别押注，保留自己的位置。',
    },
  },
  决策: {
    heaven: '事情的起点与外部约束',
    earth: '你手里的条件与代价',
    human: '行动后的走向',
    hints: {
      大安: '可守，不必急；先看清不动会怎样。',
      留连: '信息不全，先补条件，别在焦虑里做决定。',
      速喜: '窗口短，决定要快；先定一个可逆的小步骤。',
      赤口: '先处理分歧和风险，再谈要不要做。',
      小吉: '可以先小规模试，用结果代替争论。',
      空亡: '暂缓，别在信息不足时下注。',
    },
  },
};

const GENERIC: CategoryLens = {
  heaven: '事情的起点与外部环境',
  earth: '经过与手头条件',
  human: '落点与你的动作',
  hints: {},
};

/** 主题只补充“下一步怎么做”，不改变落宫与生克。 */
const CATEGORY_ADVICE: Record<XiaoliuCategory, string> = {
  感情: '用一次具体沟通验证对方的真实态度，不要替对方下结论。',
  事业: '把可交付的一步写下来，先给结果，再谈资源和下一步。',
  财运: '先算清最坏情况的现金流，再决定投入多少。',
  健康: '把症状和时间线记下来，必要时先做检查；不要只靠象意。',
  出行: '先确认票务、证件和天气，再决定出发时间。',
  寻物: '按天盘的状态、地盘的方位、人盘的可寻性分三处找，不要只翻一个地方。',
  学业: '把复习范围缩到可执行的一小块，先做一套限时练习。',
  人际: '把事实和感受分开说，先用一次低冲突的沟通试探。',
  决策: '把“不动”和“动”的代价各写一条，先选可逆的那条。',
  综合: '先把能确认的条件列出来，再决定下一步。',
};

const KEYWORDS: Record<Exclude<XiaoliuCategory, '综合'>, readonly string[]> = {
  感情: ['感情', '恋爱', '婚姻', '结婚', '复合', '分手', '喜欢', '桃花', '对象', '男友', '女友', '伴侣', '相亲', '暗恋', '前任', '暧昧'],
  事业: ['工作', '事业', '项目', '升职', '跳槽', '面试', '老板', '同事', '合作', '创业', '生意', '公司', '客户', '辞职', '离职', '入职'],
  财运: ['钱', '财', '投资', '收入', '奖金', '买卖', '贷款', '欠款', '回款', '股票', '基金', '赚', '亏', '预算'],
  健康: ['身体', '健康', '病', '疼', '医院', '检查', '手术', '失眠', '焦虑', '恢复', '怀孕', '备孕', '药', '治疗'],
  出行: ['出行', '旅行', '出差', '搬家', '移民', '签证', '航班', '交通', '远行', '回国', '出国', '机票', '行程'],
  寻物: ['丢', '找', '失物', '不见', '落在哪', '找不到', '钥匙', '手机', '钱包', '文件', '首饰', '包'],
  学业: ['考试', '学习', '考研', '考公', '证书', '申请', '论文', '答辩', '录取', '学校', '成绩', '面试'],
  人际: ['朋友', '家人', '父母', '孩子', '关系', '小人', '官司', '纠纷', '争吵', '沟通', '误会', '亲戚', '邻居'],
  决策: ['要不要', '该不该', '选择', '决定', '继续', '放弃', '换', '搬', '签', '买', '卖', '保留', '开始', '结束'],
};
const PRIORITY: Exclude<XiaoliuCategory, '综合'>[] = ['感情', '事业', '财运', '健康', '出行', '寻物', '学业', '人际', '决策'];

/** 以问题中的关键词粗分主题；没有命中时按“综合”处理，不强行套模板。 */
export function detectXiaoliuCategory(question: string): XiaoliuCategory {
  const text = question.trim();
  if (!text) return '综合';
  let best: XiaoliuCategory = '综合';
  let bestScore = 0;
  for (const category of PRIORITY) {
    let score = 0;
    for (const word of KEYWORDS[category]) {
      let index = text.indexOf(word);
      while (index !== -1) {
        score += 1;
        index = text.indexOf(word, index + word.length);
      }
    }
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

function hint(lens: CategoryLens, palace: XiaoliuPalaceName): string {
  const value = lens.hints[palace];
  return value ? `；${value}` : '';
}

/** 只描述两宫之间的生克方向，不把生克改写成落宫的吉凶。 */
export function xiaoliuRelationText(fromLabel: string, from: Element, toLabel: string, to: Element): string {
  if (from === to) return `${fromLabel}与${toLabel}同属${from}，比和`;
  if (GENERATES[from] === to) return `${fromLabel}${from}生${toLabel}${to}`;
  if (GENERATES[to] === from) return `${toLabel}${to}生${fromLabel}${from}`;
  if (CONTROLS[from] === to) return `${fromLabel}${from}克${toLabel}${to}`;
  return `${toLabel}${to}克${fromLabel}${from}`;
}

function overallRelation(heaven: Element, earth: Element, human: Element): string {
  if (GENERATES[earth] === human) return '地盘生人盘，落点有托底，可以主动去接。';
  if (GENERATES[heaven] === human) return '天盘生人盘，大环境对你有利，别自己先退。';
  if (CONTROLS[earth] === human) return '地盘克人盘，阻力在过程里，先化再进。';
  if (CONTROLS[heaven] === human) return '天盘克人盘，外部压力偏硬，先保边界。';
  if (GENERATES[human] === earth) return '人盘生地盘，你在为局面输血，注意消耗。';
  if (CONTROLS[human] === earth) return '人盘克地盘，你能推动，但要挑关键处。';
  return '三才比和，力量相近，先看彼此是不是同路。';
}

function relationAdvice(earth: Element, human: Element): string {
  if (GENERATES[earth] === human) return '地盘在生人盘，过程里有可借的力，主动去接。';
  if (GENERATES[human] === earth) return '人盘生地盘，你在为这件事持续投入，先设一个止损点。';
  if (CONTROLS[earth] === human) return '地盘克人盘，阻力在过程里，先做减法。';
  if (CONTROLS[human] === earth) return '人盘克地盘，你能推动，但会耗力，挑最关键的一处动。';
  return '地盘与人盘比和，先看对方是不是同路人。';
}

/**
 * 按“天盘（月）→ 地盘（日）→ 人盘（时）”生成一段可核对的本地解读。
 * 每一段都落在实际宫位、死六神与五行上；主题词只调整观察角度，不改变落宫。
 */
export function composeXiaoliuReading(input: {
  question: string;
  monthPalace: XiaoliuPalace;
  dayPalace: XiaoliuPalace;
  hourPalace: XiaoliuPalace;
  lunar: LunarMoment;
}): XiaoliuReading {
  const { question, monthPalace: heaven, dayPalace: earth, hourPalace: human, lunar } = input;
  const category = detectXiaoliuCategory(question);
  const lens = category === '综合' ? GENERIC : CATEGORY[category];

  const heavenText = `${heaven.name}（${heaven.element}·${heaven.spirit}）落天盘，看${lens.heaven}：${PROFILE[heaven.name].heaven}${hint(lens, heaven.name)}`;
  const earthText = `${earth.name}（${earth.element}·${earth.spirit}）落地盘，看${lens.earth}：${PROFILE[earth.name].earth}${hint(lens, earth.name)} ${xiaoliuRelationText('天盘', heaven.element, '地盘', earth.element)}。`;
  const humanText = `${human.name}（${human.element}·${human.spirit}）落人盘，看${lens.human}：${PROFILE[human.name].human}${hint(lens, human.name)} ${xiaoliuRelationText('地盘', earth.element, '人盘', human.element)}。`;

  const summary = `天${heaven.name} → 地${earth.name} → 人${human.name}：${PACE[heaven.name]}、${PACE[earth.name]}、${PACE[human.name]}，整体是“${OVERALL[human.name]}”。${lens.hints[human.name] ?? PROFILE[human.name].human}`;
  const relations = `${xiaoliuRelationText('天盘', heaven.element, '地盘', earth.element)}；${xiaoliuRelationText('地盘', earth.element, '人盘', human.element)}。${overallRelation(heaven.element, earth.element, human.element)}`;
  const advice = `${PROFILE[human.name].advice} ${CATEGORY_ADVICE[category]} ${relationAdvice(earth.element, human.element)}${lens.closing ? ` ${lens.closing}` : ''}`;

  return {
    category,
    summary,
    heaven: `${heavenText}（${lunar.hourBranch}时起课，天盘先定起因。）`,
    earth: earthText,
    human: humanText,
    relations,
    advice,
  };
}
