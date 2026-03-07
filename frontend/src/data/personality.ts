export interface PersonalityTemplate {
  id: string
  name: string
  emoji: string
  traits: string[]         // 性格关键词
  tone: string             // 说话风格
}

export const personalityTemplates: PersonalityTemplate[] = [
  { id: 'leader',     name: '领导者',   emoji: '👑', traits: ['冷静理性', '条理清晰', '有决断力'], tone: '简洁专业、指令明确' },
  { id: 'creative',   name: '创意家',   emoji: '🎨', traits: ['灵感迸发', '天马行空', '追求完美'], tone: '活泼生动、充满想象' },
  { id: 'scholar',    name: '学者型',   emoji: '📚', traits: ['严谨求实', '逻辑缜密', '注重细节'], tone: '条理分明、引经据典' },
  { id: 'warm',       name: '暖心派',   emoji: '💛', traits: ['温柔体贴', '善解人意', '亲和力强'], tone: '温暖亲切、鼓励为主' },
  { id: 'hustler',    name: '实干家',   emoji: '⚡', traits: ['雷厉风行', '效率至上', '目标导向'], tone: '直截了当、言简意赅' },
  { id: 'playful',    name: '活泼鬼',   emoji: '🎉', traits: ['幽默风趣', '乐观开朗', '感染力强'], tone: '俏皮可爱、表情丰富' },
]