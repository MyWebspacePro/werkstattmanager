import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth.js";
import { Button } from "./ui.js";

const navItems = [
  { to: "/", key: "nav.dashboard", icon: "📊" },
  { to: "/planer", key: "nav.planner", icon: "📅" },
  { to: "/auftraege", key: "nav.workorders", icon: "🔧" },
  { to: "/kostenvoranschlaege", key: "nav.quotes", icon: "📋" },
  { to: "/kunden", key: "nav.customers", icon: "👥" },
  { to: "/teile", key: "nav.parts", icon: "📦" },
  { to: "/rechnungen", key: "nav.invoices", icon: "🧾" },
];

// Phase 2 — jetzt implementiert
const phase2Items = [
  { to: "/reifenhotel", key: "nav.tyreHotel", icon: "🛞", disabled: false },
  { to: "/leihwagen", key: "nav.loaners", icon: "🚗", disabled: false },
  { to: "/ankauf", key: "nav.sales", icon: "🏷️", disabled: false },
];

export default function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const item = (to: string, label: string, icon: string, disabled = false) => (
    <NavLink
      key={to}
      to={to}
      onClick={(e) => disabled && e.preventDefault()}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg min-h-11 text-sm font-medium ${
          disabled
            ? "text-slate-400 cursor-not-allowed"
            : isActive
              ? "bg-blue-600 text-white"
              : "text-slate-700 hover:bg-slate-200"
        }`
      }
    >
      <span className="text-lg">{icon}</span>
      {label}
    </NavLink>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col p-3">
        <div className="px-4 py-3 text-lg font-bold text-slate-900">{t("app.title")}</div>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((n) => item(n.to, t(n.key), n.icon))}
          <div className="my-2 border-t border-slate-200" />
          {phase2Items.map((n) => item(n.to, t(n.key), n.icon))}
          <div className="my-2 border-t border-slate-200" />
          {item("/einstellungen", t("nav.settings"), "⚙️")}
        </nav>
        <div className="px-4 py-2 text-sm text-slate-600 border-t border-slate-200">
          {user?.name} <span className="text-slate-400">({user?.role})</span>
          <Button variant="ghost" className="block mt-1 text-sm" onClick={() => { logout(); navigate("/login"); }}>
            {t("app.logout")}
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
