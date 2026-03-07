// 所有数据已迁移到 data/ 文件夹，此文件作为兼容层重新导出
export {
  // 类型
  type Assistant,
  type Skill,
  type Workflow,
  type WorkflowStep,
  type HistoryItem,
  type SkillOutputType,
  type SkillInputType,
  type CatColors,
  // 主题
  DefaultCatTheme,
  huajiaoTheme,
  lanmaoTheme,
  heimaotaxueTheme,
  // 猫猫数组
  assistants,
  // 工作流 & 历史
  workflows,
  workHistory,
  // 每只猫猫的独立导出
  huajiao, huajiaoSkills, huajiaoMessages,
  alan, alanSkills, alanMessages,
  xue, xueSkills, xueMessages,
  niannian, niannianSkills, niannianMessages, niannianColors,
  xiaohu, xiaohuSkills, xiaohuMessages, xiaohuColors,
  pixel, pixelSkills, pixelMessages, pixelColors,
  huangjin, huangjinSkills, huangjinMessages, huangjinColors,
  mimi, mimiSkills, mimiMessages, mimiColors,
  xiaobai, xiaobaiSkills, xiaobaiMessages, xiaobaiColors,
  fafa, fafaSkills, fafaMessages, fafaColors,
} from './data/index';
