import { useState } from 'react'
import CatSVG from '../../components/CatSVG'
import { appearanceTemplates } from '../../data/themes'
import { presetCombos } from '../../data/cats'
import { personalityTemplates } from '../../data/personality'
import { getVisibleSkillGroups } from '../../data/skills'
import { AppIcon } from '../../components/icons'

export const LandFeatureRoles = () => {
  const skillGroups = getVisibleSkillGroups(false)
  const [activePreset, setActivePreset] = useState(0)
  const combo = presetCombos[activePreset]
  const appearance = appearanceTemplates.find(a => a.id === combo.appearance)!
  const personality = personalityTemplates.find(p => p.id === combo.personality)!
  const group = skillGroups.find(g => g.id === combo.skillGroupId)!

  return (
    <section id="roles" className="py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="mb-16 text-center">
          <p className="text-sm font-bold text-primary-500 uppercase tracking-widest mb-4">角色系统</p>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-6">
            外形 × 性格 × 技能组，自由组合
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            猫猫角色由三层独立模版组合而成，每一层都支持内置选择和自定义创建。
          </p>
        </div>

        {/* Formula Bar */}
        <div className="flex items-center justify-center gap-3 mb-14 flex-wrap">
          <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-surface-secondary border border-border">
            <span className="text-primary-600 inline-flex"><AppIcon symbol="Palette" size={22} /></span>
            <div>
              <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">外形模版</p>
              <p className="text-sm font-black">{appearanceTemplates.length} 种配色</p>
            </div>
          </div>
          <span className="text-2xl font-black text-text-tertiary">×</span>
          <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-surface-secondary border border-border">
            <span className="text-primary-600 inline-flex"><AppIcon symbol="MessageCircle" size={22} /></span>
            <div>
              <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">性格模版</p>
              <p className="text-sm font-black">{personalityTemplates.length} 种性格</p>
            </div>
          </div>
          <span className="text-2xl font-black text-text-tertiary">×</span>
          <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-surface-secondary border border-border">
            <span className="text-primary-600 inline-flex"><AppIcon symbol="Zap" size={22} /></span>
            <div>
              <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">技能组</p>
              <p className="text-sm font-black">{skillGroups.length} 个预设组</p>
            </div>
          </div>
          <span className="text-2xl font-black text-text-tertiary">=</span>
          <div className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-primary-50 border border-primary-200">
            <span className="text-primary-600 inline-flex"><AppIcon symbol="Cat" size={22} /></span>
            <div>
              <p className="text-[10px] font-bold text-primary-400 uppercase tracking-widest">你的专属猫猫</p>
              <p className="text-sm font-black text-primary-600">无限可能</p>
            </div>
          </div>
        </div>

        {/* Preset Showcase */}
        <div className="flex flex-col lg:flex-row gap-8 items-center">
          {/* Left: Preview Card */}
          <div className="w-full lg:w-[360px] flex-shrink-0">
            <div
              className="rounded-[32px] border border-border-strong p-8 bg-surface transition-all duration-500"
              style={{ boxShadow: `0 8px 40px ${appearance.colors.apron}20` }}
            >
              <div className="flex justify-center mb-6">
                <CatSVG colors={appearance.colors} size={140} />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-black mb-2">{combo.name}</h3>
                <div className="flex items-center justify-center gap-2 flex-wrap mb-4">
                  <span className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ background: appearance?.colors.apron }}>
                    {appearance?.name}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-surface-tertiary border border-border">
                    {personality?.emoji} {personality?.name}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ background: group.color }}>
                    <span className="inline-flex items-center gap-1.5">
                      <AppIcon symbol={group.icon} size={16} />
                      {group.name}
                    </span>
                  </span>
                </div>
                <p className="text-sm text-text-secondary font-medium leading-relaxed">
                  {combo.description}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Preset Switcher + Details */}
          <div className="flex-1 min-w-0">
            {/* Preset Tabs */}
            <div className="flex gap-3 mb-8">
              {presetCombos.map((p, i) => {
                const app = appearanceTemplates.find(a => a.id === p.appearance)!
                return (
                  <button
                    key={p.name}
                    onClick={() => setActivePreset(i)}
                    className={`flex items-center gap-3 px-5 py-3 rounded-2xl border transition-all ${
                      i === activePreset
                        ? 'bg-surface border-border-strong shadow-lg ring-2 ring-primary-200'
                        : 'bg-surface-secondary border-transparent hover:border-border hover:bg-surface'
                    }`}
                  >
                    <CatSVG colors={app.colors} size={36} />
                    <span className="text-sm font-bold">{p.name}</span>
                  </button>
                )
              })}
            </div>

            {/* Detail: Traits + Skills */}
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-surface-secondary border border-border">
                <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest mb-3">性格特征</p>
                <div className="flex flex-wrap gap-2">
                  {personality.traits.map(t => (
                    <span key={t} className="px-3 py-1.5 rounded-full bg-surface border border-border-strong text-xs font-bold">
                      {t}
                    </span>
                  ))}
                  <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-xs font-medium text-text-tertiary">
                    说话风格：{personality.tone}
                  </span>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-surface-secondary border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-bold text-text-tertiary uppercase tracking-widest">技能组</p>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: group.color }}>
                    <span className="inline-flex items-center gap-1.5">
                      <AppIcon symbol={group.icon} size={16} />
                      {group.name}
                    </span>
                  </span>
                </div>
                <p className="text-xs text-text-secondary font-medium mb-3">{group.description}</p>
              </div>

              <p className="text-xs text-text-tertiary font-medium text-center">
                以上只是预设示例——外形、性格、技能组均可自由替换和自定义创建
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
