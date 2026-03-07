import { Link } from 'react-router-dom'
import CatMiniAvatar from '../../components/CatMiniAvatar'
import { assistants } from '../../data'

const cats = assistants.slice(0, 5)

export const LandCta = () => {
  return (
    <section className="py-24 md:py-40 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-primary-400 rounded-[40px] p-12 md:p-20 text-center relative overflow-hidden">

          <div className="relative z-10">
            <div className="flex justify-center -space-x-2 mb-8">
              {cats.map(cat => (
                <div
                  key={cat.id}
                  className="w-12 h-12 rounded-full bg-white/20 border-2 border-white/10 flex items-center justify-center hover:-translate-y-1 transition-transform"
                >
                  <CatMiniAvatar size={32} colors={cat.catColors} />
                </div>
              ))}
              <div className="w-12 h-12 rounded-full bg-white/20 border-2 border-white/10 flex items-center justify-center text-white text-sm font-bold">
                +{assistants.length - 5}
              </div>
            </div>

            <h2 className="text-4xl md:text-5xl text-white font-semibold mb-6">
              立即组建你的猫猫军团
            </h2>

            <p className="text-base md:text-lg text-white/70 max-w-lg mx-auto mb-10 font-medium leading-relaxed">
              挑选猫猫、配置技能、编排工作流，<br className="hidden md:block" />
              让 AI 自动化从此变得简单又有趣。
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="w-full sm:w-auto px-10 py-4 text-base font-bold bg-white text-primary-600 rounded-2xl hover:scale-105 active:scale-95 transition-all"
              >
                申请内测
              </Link>
              <Link
                to="/login"
                className="w-full sm:w-auto px-10 py-4 text-base font-bold text-white bg-white/10 rounded-2xl border border-white/20 hover:bg-white/20 transition-all"
              >
                已有账号？登录
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
