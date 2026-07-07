// @ts-nocheck
import { Routes, Route, Navigate, NavLink } from "react-router-dom";
import { DesignStoreProvider } from "./store/design";
import { SkillStoreProvider } from "./store/skill";
import { VisualAssetStoreProvider } from "./store/visual-asset";
import DesignLandingPage from "./pages/DesignLanding";
import ComposerPage from "./pages/Composer";
import InspirationsPage from "./pages/Inspirations";
import MaterialsPage from "./pages/Materials";
import AssetsPage from "./pages/Assets";
import SkillsPage from "./pages/Skills";
import LookbookPage from "./pages/Lookbook";

const laiRoutes = [
  { to: "/laisse-ancie", label: "仪表盘", end: true },
  { to: "/laisse-ancie/design", label: "设计" },
  { to: "/laisse-ancie/inspirations", label: "灵感" },
  { to: "/laisse-ancie/lookbook", label: "Lookbook" },
  { to: "/laisse-ancie/materials", label: "材料" },
  { to: "/laisse-ancie/assets", label: "资产" },
  { to: "/laisse-ancie/skills", label: "知识库" },
];

export default function LaisseAncieApp() {
  return (
    <SkillStoreProvider>
      <DesignStoreProvider>
        <VisualAssetStoreProvider>
          <div className="min-h-screen bg-[#fafafa] text-gray-900">
            <nav className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
              <div className="max-w-7xl mx-auto flex gap-1 p-2 overflow-x-auto">
                {laiRoutes.map((r) => (
                  <NavLink key={r.to} to={r.to} end={r.end}
                    className={({ isActive }) =>
                      `px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${isActive ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-blue-50 hover:text-blue-700"}`
                    }>
                    {r.label}
                  </NavLink>
                ))}
              </div>
            </nav>
            <Routes>
              <Route index element={<Navigate to="/laisse-ancie/design" replace />} />
              <Route path="/design" element={<DesignLandingPage />} />
              <Route path="/design/:mode" element={<ComposerPage />} />
              <Route path="/inspirations" element={<InspirationsPage />} />
              <Route path="/lookbook" element={<LookbookPage />} />
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/assets" element={<AssetsPage />} />
              <Route path="/skills" element={<SkillsPage />} />
            </Routes>
          </div>
        </VisualAssetStoreProvider>
      </DesignStoreProvider>
    </SkillStoreProvider>
  );
}
