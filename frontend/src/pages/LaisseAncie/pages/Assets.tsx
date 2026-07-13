// @ts-nocheck
/**
 * AssetsPage —— 品牌信息(原「品牌资产」/「视觉资产」)。
 *
 * 仅保留品牌信息资产(品牌色 / 标识 / 调性 / AI 系统提示等);
 * 视觉资产(印花 / 插画 / KV 等)已下线。
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { teamApi } from "../lib/api";
import { useCurrentTeam } from "../../../contexts/CurrentTeamContext";
import { BrandLogo } from "../components/ui";

export default function AssetsPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
      <BrandInfoAssets />
    </div>
  );
}

/* ── 品牌信息 ─────────────────────────────────────────────── */

function BrandInfoAssets() {
  const { teamId } = useCurrentTeam();
  const [profile, setProfile] = useState<any>(null);
  const [colors, setColors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    teamApi(teamId).getBrand().then((r) => {
      setProfile(r.profile);
      setColors(r.colors || []);
    }).catch(() => {
      setProfile(null);
      setColors([]);
    }).finally(() => setLoading(false));
  }, []);

  const profileFields = profile ?? {
    nameZh: "来兮·安兮", nameEn: "Laisse Ancie", cnFont: "站酷xiaowei体", enFont: "Poller One",
    sloganZh: "既来之，则安之", sloganEn: "Just Open Yourself, Enjoy Life & Love.",
    greetingEn: "Good morning, It's another beautiful day!", voice: ["优雅", "松弛", "乐趣"],
    audienceAgeMin: 18, audienceAgeMax: 30, priceMin: 20, priceMax: 500,
    systemSnippet: "You are Laisse Ancie (来兮·安兮, typeset Poller One on the English side, 站酷xiaowei on the Chinese side), a young-contemporary fashion brand whose north-slogan is \"既来之，则安之\" — \"Come, be at ease.\"",
  };

  const grouped: { group: string; rows: { label: string; value: ReactNode }[] }[] = [
    {
      group: "基本信息", rows: [
        { label: "中文名", value: <span className="text-2xl font-medium">{profileFields.nameZh}</span> },
        { label: "英文名", value: <span className="italic text-2xl text-primary-600">{profileFields.nameEn}</span> },
        { label: "中文字体", value: profileFields.cnFont },
        { label: "英文字体", value: profileFields.enFont },
      ]
    },
    {
      group: "标识系统", rows: [
        { label: "图形标识", value: <div className="w-24 h-24 rounded-xl border border-gray-200 bg-white p-2 flex items-center justify-center overflow-hidden"><BrandLogo /></div> },
        { label: "中文理念", value: <span className="text-xl font-medium">{profileFields.sloganZh}</span> },
        { label: "English concept", value: <span className="text-lg">{profileFields.sloganEn}</span> },
        { label: "Morning greeting", value: <span className="text-primary-600">{profileFields.greetingEn}</span> },
      ]
    },
    {
      group: "调性 · 定位", rows: [
        { label: "品牌调性", value: <div className="flex gap-2">{(profileFields.voice ?? ["优雅", "松弛", "乐趣"]).map((v: string) => <span key={v} className="text-[30px] text-primary-600">{v}</span>)}</div> },
        { label: "目标客群", value: `${profileFields.audienceAgeMin}-${profileFields.audienceAgeMax} 岁 · 独立自我的年轻女性` },
        { label: "价格带", value: `¥${profileFields.priceMin} — ¥${profileFields.priceMax} · 根据产品成本调控` },
      ]
    },
    {
      group: "品牌色", rows: [
        {
          label: "色彩对照表", value:
            <table className="w-full text-[12px] border-collapse mt-1">
              <thead><tr className="text-left text-gray-500"><Th>用途</Th><Th>背景</Th><Th>字色</Th><Th>预览</Th></tr></thead>
              <tbody>
                {colors.map((p: any) => (
                  <tr key={p.bg + p.fg} className="border-t border-gray-200">
                    <Td className="text-gray-600">{p.usage}</Td>
                    <Td className="font-mono">{p.bg}</Td>
                    <Td className="font-mono">{p.fg}</Td>
                    <Td><span className="inline-flex rounded-lg overflow-hidden border border-gray-200">
                      <span className="px-3 py-1.5" style={{ background: p.bg, color: p.fg }}>Laisse</span>
                      <span className="px-3 py-1.5" style={{ background: p.fg, color: p.bg }}>Ancie</span>
                    </span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
        },
      ]
    },
    {
      group: "下游配置", rows: [
        { label: "AI 系统提示片段", value: <pre className="text-[11px] leading-relaxed text-gray-600 whitespace-pre-wrap font-sans bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-72 overflow-auto">{profileFields.systemSnippet}</pre> },
      ]
    },
  ];

  if (loading) return <div className="text-gray-500">加载中…</div>;

  return (
    <div className="space-y-6">
      {grouped.map((g) => (
        <section key={g.group}>
          <h3 className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">{g.group}</h3>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden">
            <table className="w-full text-[13px]">
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={r.label} className={i > 0 ? "border-t border-gray-200" : ""}>
                    <th className="text-left align-top text-gray-500 font-medium px-5 py-3 w-[18%] whitespace-nowrap">{r.label}</th>
                    <td className="text-gray-800 px-5 py-3">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) { return <th className="text-left text-[10px] uppercase tracking-wider font-medium px-5 py-2.5">{children}</th>; }
function Td({ children, className = "" }: { children: ReactNode; className?: string }) { return <td className={`px-5 py-3 align-top ${className}`}>{children}</td>; }
