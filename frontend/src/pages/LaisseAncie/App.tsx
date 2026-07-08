// @ts-nocheck
/**
 * /laisse-ancie 子应用入口 —— 已合并到通用团队工作台(/dashboard)。
 *
 * 旧 /laisse-ancie/* 路由由 frontend/src/main.tsx 重定向到 /dashboard,
 * 本保留为 thin shell,避免老书签 404。
 */
import { Navigate } from "react-router-dom";

export default function LaisseAncieApp() {
  return <Navigate to="/dashboard" replace />;
}
