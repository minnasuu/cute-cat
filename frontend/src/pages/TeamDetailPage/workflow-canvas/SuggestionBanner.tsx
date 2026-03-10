import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CatMiniAvatar from '../../../components/CatMiniAvatar';
import type { SuggestedCat, SuggestedSkill } from '../handleAiGenerateWorkflow';

interface TeamCat {
  id: string; name: string; role: string; catColors: any; skills: any[]; accent: string;
}

interface SuggestionBannerProps {
  summary: string;
  suggestedCats: SuggestedCat[];
  suggestedSkills: SuggestedSkill[];
  cats: TeamCat[];
  teamId: string;
  onDismiss: () => void;
}

const SuggestionBanner: React.FC<SuggestionBannerProps> = ({
  summary, suggestedCats, suggestedSkills, cats, teamId, onDismiss,
}) => {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="absolute top-0 left-0 right-0 z-20">
      {/* 主横幅 */}
      <div className="mx-4 mt-3 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/90 backdrop-blur-sm shadow-lg">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-6 h-6 rounded-full bg-amber-400 text-white text-xs font-bold flex items-center justify-center shrink-0">!</span>
          <span className="text-xs font-bold text-amber-800 flex-1 truncate">{summary}</span>
          {(suggestedCats.length > 0 || suggestedSkills.length > 0) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold hover:bg-amber-200 transition-colors cursor-pointer shrink-0"
            >
              {expanded ? '收起' : '查看建议'}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="text-amber-400 hover:text-amber-600 transition-colors p-1 cursor-pointer shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* 展开的建议内容 */}
        {expanded && (
          <div className="px-4 pb-3 space-y-3 border-t border-amber-200/50 mt-1 pt-3">
            {suggestedCats.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">建议添加猫猫</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedCats.map((sc, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl bg-white/70 border border-amber-200 px-3 py-2">
                      <span className="text-sm">🐱</span>
                      <div>
                        <span className="text-[11px] font-bold text-gray-900">{sc.role}</span>
                        <span className="text-[10px] text-gray-500 ml-1.5">{sc.reason}</span>
                      </div>
                      <button
                        onClick={() => navigate(`/teams/${teamId}/cats/new`)}
                        className="px-2.5 py-1 bg-amber-500 text-white text-[10px] font-bold rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
                      >
                        去添加
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {suggestedSkills.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">建议补充技能</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedSkills.map((ss, i) => {
                    const cat = cats.find(c => c.id === ss.agentId);
                    return (
                      <div key={i} className="flex items-center gap-2 rounded-xl bg-white/70 border border-amber-200 px-3 py-2">
                        {cat && <CatMiniAvatar colors={cat.catColors} size={18} />}
                        <div>
                          <span className="text-[11px] font-bold text-gray-900">{ss.agentName}</span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-bold ml-1.5">{ss.skillName}</span>
                        </div>
                        <button
                          onClick={() => navigate(`/teams/${teamId}/cats/${ss.agentId}`)}
                          className="px-2.5 py-1 bg-amber-500 text-white text-[10px] font-bold rounded-lg hover:bg-amber-600 transition-colors cursor-pointer"
                        >
                          去配置
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SuggestionBanner;
