import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.js";
import { useAuth } from "./lib/auth.js";
import LoginPage from "./pages/LoginPage.js";
import DashboardPage from "./pages/DashboardPage.js";
import CustomersPage from "./pages/CustomersPage.js";
import PlannerPage from "./pages/PlannerPage.js";
import WorkOrdersPage from "./pages/WorkOrdersPage.js";
import PartsPage from "./pages/PartsPage.js";
import InvoicesPage from "./pages/InvoicesPage.js";
import SettingsPage from "./pages/SettingsPage.js";
import TyreHotelPage from "./pages/TyreHotelPage.js";
import LoanersPage from "./pages/LoanersPage.js";
import SalesPage from "./pages/SalesPage.js";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-slate-500">Lädt…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/planer" element={<PlannerPage />} />
        <Route path="/auftraege" element={<WorkOrdersPage />} />
        <Route path="/kunden" element={<CustomersPage />} />
        <Route path="/teile" element={<PartsPage />} />
        <Route path="/rechnungen" element={<InvoicesPage />} />
        <Route path="/reifenhotel" element={<TyreHotelPage />} />
        <Route path="/leihwagen" element={<LoanersPage />} />
        <Route path="/ankauf" element={<SalesPage />} />
        <Route path="/einstellungen" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
