// @ts-nocheck
/**
 * /dashboard 主入口 —— 通用团队工作台。
 *
 * 重构自旧 1597 行「电商/自媒体/互联网」三团队 workflow 流水线工作台。
 * 新版 = 以 Laisse Ancie 为第一队的通用团队工作台:
 *   - 默认主页 = 设计 Composer(主流程)
 *   - 团队切换入口:Navbar afterLogo(Laisse Ancie ▾)
 *   - 左侧导航:扩展 tab(灵感/Lookbook/材料) + 知识底座 tab(技能/资产)
 */
import React from 'react';
import { CurrentTeamProvider } from '../../contexts/CurrentTeamContext';
import { SkillStoreProvider } from '../LaisseAncie/store/skill';
import { DesignStoreProvider } from '../LaisseAncie/store/design';
import { VisualAssetStoreProvider } from '../LaisseAncie/store/visual-asset';
import TeamWorkbench from './TeamWorkbench';

const DashboardPage: React.FC = () => {
  return (
    <CurrentTeamProvider>
      <SkillStoreProvider>
        <DesignStoreProvider>
          <VisualAssetStoreProvider>
            <TeamWorkbench />
          </VisualAssetStoreProvider>
        </DesignStoreProvider>
      </SkillStoreProvider>
    </CurrentTeamProvider>
  );
};

export default DashboardPage;
