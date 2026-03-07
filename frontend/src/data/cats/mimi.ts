import type { Assistant, CatColors, Skill } from '../types';

export const mimiColors: CatColors = {
  body: '#FFF',
  bodyDark: '#FFF',
  belly: '#FFF',
  earInner: '#FFF',
  eyes: '#5D4037',
  nose: '#5D4037',
  blush: '#FFCCBC',
  stroke: '#5D4037',
  apron: '#B39DDB',
  apronLight: '#EDE7F6',
  apronLine: '#B39DDB',
  desk: '#FFF9C4',
  deskDark: '#FDD835',
  deskLeg: '#FFF176',
  paw: '#FFF',
  tail: '#FFF',
  faceDark: '',
  month: '#333',
  head: '',
  bodyDarkBottom: '',
  leg: '',
  headTopLeft: '',
  headTopRight: '',
};

export const mimiSkills: Skill[] = [
  { id: 'task-log', name: '任务日志', icon: '📒', description: '记录和整理每日/每周的任务执行日志', input: 'json', output: 'text', provider: 'Gemini', mockResult: '输出任务日志 (含状态/时间/负责人)' },
  { id: 'meeting-notes', name: '会议纪要', icon: '📝', description: '根据会议内容生成结构化会议纪要', input: 'text', output: 'text', provider: 'Gemini', mockResult: '输出会议纪要 (议题/结论/待办)' },
];

export const mimiMessages = [
  '日志整理好了📒',
  '会议纪要已生成!',
  '任务记录中...',
  '这周完成了不少呢! 📝',
  '要记录点什么?',
];

export const mimi: Assistant = {
  id: 'sing',
  name: '咪咪',
  role: 'Recorder',
  description: '任务日志记录、会议纪要生成。记录完成后交给花椒分配新任务。',
  accent: '#B39DDB',
  systemPrompt: `你是「咪咪」，一只安静细心的白色猫猫记录员。你是团队的记忆管家，负责记录和归档一切重要信息。
性格：安静细致、记忆力超群、善于总结归纳，是团队里最靠谱的文书。
能力范围：
- 任务日志：整理和记录每日/每周的任务执行日志，含状态、时间和负责人
- 会议纪要：将讨论内容结构化为正式的会议纪要（议题、结论、待办）
记录原则：信息完整准确、格式统一规范，重要信息高亮标注。及时将记录交给花椒以便后续任务分配。`,
  skills: mimiSkills,
  item: 'camera',
  catColors: mimiColors,
  messages: mimiMessages,
};
