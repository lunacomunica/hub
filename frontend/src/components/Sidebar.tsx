import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, TrendingDown, Users, Calculator,
  Target, Briefcase, BarChart2, FileText, UserX, Package,
  ClipboardList, Sun, Moon, ChevronLeft, ChevronRight,
  UsersRound, LogOut, CreditCard, UserRound, Settings, ListChecks,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { useState, useEffect, useRef } from 'react';

const FINANCEIRO_ITEMS = [
  { to: '/dashboard',    label: 'Dashboard',        icon: LayoutDashboard },
  { to: '/receitas',     label: 'Receitas',          icon: TrendingUp },
  { to: '/despesas',     label: 'Despesas',          icon: TrendingDown },
  { to: '/dre',          label: 'DRE',               icon: FileText },
  { to: '/cenarios',     label: 'Cenários',          icon: BarChart2 },
  { to: '/cartoes',      label: 'Cartões',           icon: CreditCard },
  { to: '/relatorio',    label: 'Relatório Mensal',  icon: ClipboardList },
];

const PESSOAS_ITEMS = [
  { to: '/pessoas', label: 'Gestão de Pessoas', icon: UserRound },
];

const COMERCIAL_ITEMS = [
  { to: '/produtos',      label: 'Produtos & Serviços', icon: Package },
  { to: '/vendas',        label: 'Planejamento',        icon: Target },
  { to: '/oportunidades', label: 'Oportunidades',       icon: Briefcase },
  { to: '/rotina',        label: 'Rotina Comercial',    icon: ListChecks },
];

export default function Sidebar() {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const { companies, currentCompany, switchCompany } = useCompany();
  const navigate = useNavigate();
  const [companyOpen, setCompanyOpen] = useState(false);
  const companyRef = useRef<HTMLDivElement>(null);

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (companyRef.current && !companyRef.current.contains(e.target as Node)) {
        setCompanyOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const role = user?.role;

  const financieroItems = role === 'admin'
    ? [...FINANCEIRO_ITEMS, { to: '/usuarios', label: 'Usuários', icon: UsersRound }]
    : FINANCEIRO_ITEMS;

  const modules = [];
  if (role === 'admin' || role === 'financeiro') {
    modules.push({ label: 'Financeiro', items: financieroItems });
  }
  if (role === 'admin') {
    modules.push({ label: 'Pessoas', items: PESSOAS_ITEMS });
  }
  if (role === 'admin' || role === 'comercial') {
    modules.push({ label: 'Comercial', items: COMERCIAL_ITEMS });
  }

  return (
    <aside
      style={{
        width: collapsed ? '56px' : '248px',
        flexShrink: 0,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(180deg, var(--bg-sidebar-from) 0%, var(--bg-sidebar-to) 100%)`,
        borderRight: '1px solid var(--border-sidebar)',
        transition: 'width 0.22s cubic-bezier(.4,0,.2,1)',
        overflow: 'hidden',
      }}
    >
      {/* Logo + toggle */}
      <div
        className="flex items-center shrink-0"
        style={{
          borderBottom: '1px solid var(--border-sidebar)',
          padding: collapsed ? '12px 0' : '10px 12px',
          justifyContent: collapsed ? 'center' : 'space-between',
          minHeight: '60px',
        }}
      >
        {/* Logo expandido */}
        {!collapsed && (
          <img
            src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
            alt="Luna Comunica"
            style={{ height: '38px', width: 'auto', maxWidth: '160px', objectFit: 'contain', objectPosition: 'left center' }}
          />
        )}

        {/* Ícone colapsado — logo luna.ia */}
        {collapsed && (
          <img
            src="/luna-icon.png"
            alt="Luna"
            style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
          />
        )}

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="shrink-0 rounded-md p-1 transition-colors"
            style={{ color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            title="Recolher menu"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Company switcher */}
      {companies.length > 0 && (
        <div ref={companyRef} style={{ padding: collapsed ? '8px 0' : '8px 8px', borderBottom: '1px solid var(--border-sidebar)', position: 'relative' }}>
          {!collapsed ? (
            <button
              onClick={() => companies.length > 1 && setCompanyOpen(p => !p)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 8px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)', cursor: companies.length > 1 ? 'pointer' : 'default',
              }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: currentCompany?.color || '#3b82f6', flexShrink: 0 }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentCompany?.name || '—'}
              </span>
              {companies.length > 1 && (
                <ChevronRight size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0, transform: companyOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
              )}
            </button>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: currentCompany?.color || '#3b82f6' }} />
            </div>
          )}

          {/* Dropdown */}
          {companyOpen && companies.length > 1 && (
            <div style={{
              position: 'absolute', top: '100%', left: 8, right: 8, zIndex: 100,
              background: 'var(--bg-card)', border: '1px solid var(--border-card)',
              borderRadius: '10px', padding: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              {companies.map(c => (
                <button
                  key={c.id}
                  onClick={() => { switchCompany(c); setCompanyOpen(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '7px 10px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                    background: currentCompany?.id === c.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                    color: currentCompany?.id === c.id ? '#93c5fd' : 'var(--text-primary)',
                  }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 500, textAlign: 'left', flex: 1 }}>{c.name}</span>
                  {currentCompany?.id === c.id && <span style={{ fontSize: '0.65rem', color: '#93c5fd' }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: collapsed ? '12px 0' : '12px 8px' }}>
        {modules.map((mod) => (
          <div key={mod.label} className="mb-4">
            {/* Module label */}
            {!collapsed && (
              <div
                style={{
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--text-label)',
                  padding: '0 8px 6px',
                  opacity: 0.8,
                }}
              >
                {mod.label}
              </div>
            )}
            {collapsed && (
              <div style={{ height: '1px', background: 'var(--border-sidebar)', margin: '4px 10px 8px' }} />
            )}

            <div className="space-y-0.5">
              {mod.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: collapsed ? 0 : '10px',
                    padding: collapsed ? '8px 0' : '7px 10px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    borderRadius: '8px',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                    color: isActive ? 'var(--blue)' : 'var(--text-nav-inactive)',
                    background: isActive ? 'var(--bg-nav-active)' : 'transparent',
                    border: isActive ? '1px solid var(--border-nav-active)' : '1px solid transparent',
                    whiteSpace: 'nowrap',
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={15} className={`shrink-0 ${isActive ? 'icon-blue' : ''}`} />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="shrink-0"
        style={{
          borderTop: '1px solid var(--border-sidebar)',
          padding: collapsed ? '10px 0' : '10px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          alignItems: collapsed ? 'center' : 'stretch',
        }}
      >
        {/* Expand button when collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title="Expandir menu"
            style={{
              background: 'var(--bg-btn-ghost)',
              border: '1px solid var(--border-input)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronRight size={14} />
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
          style={{
            background: 'var(--bg-btn-ghost)',
            border: '1px solid var(--border-input)',
            borderRadius: '8px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: collapsed ? '6px' : '7px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '8px',
            fontSize: '0.8125rem',
            fontWeight: 500,
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          {!collapsed && (theme === 'dark' ? 'Modo Claro' : 'Modo Escuro')}
        </button>

        {/* Settings */}
        <button
          onClick={() => navigate('/configuracoes')}
          title="Configurações"
          style={{
            background: 'var(--bg-btn-ghost)',
            border: '1px solid var(--border-input)',
            borderRadius: '8px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: collapsed ? '6px' : '7px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '8px',
            fontSize: '0.8125rem',
            fontWeight: 500,
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
            width: '100%',
          }}
        >
          <Settings size={14} />
          {!collapsed && 'Configurações'}
        </button>

        {/* User info + logout */}
        {!collapsed && user && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '8px',
              background: 'var(--bg-btn-ghost)',
              border: '1px solid var(--border-input)',
              gap: '8px',
              minWidth: 0,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sair"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                borderRadius: '6px',
                transition: 'color 0.15s',
              }}
            >
              <LogOut size={14} />
            </button>
          </div>
        )}

        {collapsed && user && (
          <button
            onClick={handleLogout}
            title="Sair"
            style={{
              background: 'var(--bg-btn-ghost)',
              border: '1px solid var(--border-input)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LogOut size={14} />
          </button>
        )}

      </div>
    </aside>
  );
}
