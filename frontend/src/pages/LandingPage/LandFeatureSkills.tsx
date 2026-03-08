import { getVisibleSkillPool, getVisibleSkillGroups } from "../../data/skills"

export const LandFeatureSkills = () => {
  const visibleSkills = getVisibleSkillPool(false)
  const skillGroups = getVisibleSkillGroups(false)
  return (
    <section id="skills" className="py-24 md:py-32 bg-surface-secondary/40">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="mb-16 text-center">
          <p className="text-sm font-bold text-accent-500 uppercase tracking-widest mb-4">技能系统</p>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
            {visibleSkills.length}+ 内置技能，按需装配
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            技能不与猫猫绑定——任何角色都能装配任何技能。
            用「技能组」一键装配，也支持自定义创建。
          </p>
        </div>

        {/* Skill Groups Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
          {skillGroups.map(group => {
            const groupSkills = visibleSkills.filter(s => group.skillIds.includes(s.id))
            return (
              <div
                key={group.id}
                className="group rounded-2xl p-6 bg-surface border border-border hover:border-border-strong hover:shadow-lg transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: `${group.color}15` }}
                  >
                    {group.icon}
                  </div>
                  <div>
                    <h4 className="text-base font-black">{group.name}</h4>
                    <p className="text-[11px] text-text-tertiary font-medium">{groupSkills.length} 项技能</p>
                  </div>
                </div>
                <p className="text-xs text-text-secondary font-medium mb-4 leading-relaxed">
                  {group.description}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {groupSkills.slice(0, 4).map(skill => (
                    <span
                      key={skill.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-secondary border border-border text-[11px] font-bold"
                    >
                      {skill.icon} {skill.name}
                    </span>
                  ))}
                  {groupSkills.length > 4 && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-tertiary text-[11px] font-bold text-text-tertiary">
                      +{groupSkills.length - 4}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom Hint */}
        <div className="text-center space-y-2">
          <p className="text-sm text-text-secondary font-medium">
            技能可跨组复用，也支持 <span className="font-bold text-text-primary">自定义技能</span> 和 <span className="font-bold text-text-primary">自定义技能组</span>
          </p>
          <p className="text-xs text-text-tertiary">
            内置技能覆盖内容创作、数据分析、视觉生成、沟通协作、开发运维、管理调度 6 大领域
          </p>
        </div>
      </div>
    </section>
  )
}
