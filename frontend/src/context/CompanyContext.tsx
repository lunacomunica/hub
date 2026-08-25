import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

export interface Company {
  id: number;
  name: string;
  slug: string;
  color: string;
}

interface CompanyContextType {
  companies: Company[];
  currentCompany: Company | null;
  switchCompany: (company: Company) => void;
  loadingCompanies: boolean;
}

const CompanyContext = createContext<CompanyContextType>({
  companies: [],
  currentCompany: null,
  switchCompany: () => {},
  loadingCompanies: true,
});

function authFetch(url: string) {
  const token = localStorage.getItem('auth-token');
  return fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  useEffect(() => {
    if (!user) {
      setCompanies([]);
      setCurrentCompany(null);
      setLoadingCompanies(false);
      return;
    }
    setLoadingCompanies(true);
    authFetch('/api/companies')
      .then(r => r.json())
      .then((data: Company[]) => {
        if (!Array.isArray(data)) return;
        setCompanies(data);
        const storedId = Number(localStorage.getItem('current-company-id'));
        const stored = storedId ? data.find(c => c.id === storedId) : null;
        setCurrentCompany(stored ?? data[0] ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingCompanies(false));
  }, [user]);

  const switchCompany = (company: Company) => {
    setCurrentCompany(company);
    localStorage.setItem('current-company-id', String(company.id));
  };

  return (
    <CompanyContext.Provider value={{ companies, currentCompany, switchCompany, loadingCompanies }}>
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
