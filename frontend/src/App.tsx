import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CompanyProvider } from './context/CompanyContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Revenues from './pages/Revenues';
import Expenses from './pages/Expenses';
import ClientHealth from './pages/ClientHealth';
import PricingCalculator from './pages/PricingCalculator';
import SalesPlanning from './pages/SalesPlanning';
import Opportunities from './pages/Opportunities';
import Scenarios from './pages/Scenarios';
import DRE from './pages/DRE';
import Churn from './pages/Churn';
import Products from './pages/Products';
import Cards from './pages/Cards';
import People from './pages/People';
import EmployeeDetail from './pages/EmployeeDetail';
import Relatorio from './pages/Relatorio';
import LoginPage from './pages/LoginPage';
import Usuarios from './pages/Usuarios';
import Configuracoes from './pages/Configuracoes';
import RotinaComericial from './pages/RotinaComericial';
import ProductDetail from './pages/ProductDetail';
import Consolidado from './pages/Consolidado';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Carregando...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <CompanyProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="receitas" element={<Revenues />} />
            <Route path="despesas" element={<Expenses />} />
            <Route path="clientes" element={<ClientHealth />} />
            <Route path="precificacao" element={<PricingCalculator />} />
            <Route path="vendas" element={<SalesPlanning />} />
            <Route path="oportunidades" element={<Opportunities />} />
            <Route path="cenarios" element={<Scenarios />} />
            <Route path="dre" element={<DRE />} />
            <Route path="churn" element={<Churn />} />
            <Route path="produtos" element={<Products />} />
            <Route path="produtos/:id" element={<ProductDetail />} />
            <Route path="cartoes" element={<Cards />} />
            <Route path="pessoas" element={<People />} />
            <Route path="pessoas/:id" element={<EmployeeDetail />} />
            <Route path="relatorio" element={<Relatorio />} />
            <Route path="rotina" element={<RotinaComericial />} />
            <Route path="consolidado" element={<Consolidado />} />
            <Route
              path="usuarios"
              element={
                <AdminRoute>
                  <Usuarios />
                </AdminRoute>
              }
            />
            <Route path="configuracoes" element={<Configuracoes />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </CompanyProvider>
    </AuthProvider>
  );
}
