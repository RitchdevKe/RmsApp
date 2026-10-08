
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { supabase } from './utils/supabaseClient';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { DataProvider, useData } from './context/DataContext';
import Auth from './components/Auth';
import SignUp from './components/SignUp';
import Icon from './components/Icon';
import { User, StaffProfile, TenantProfile } from './types';
import { MaintenanceScreen, shouldShowMaintenance } from './components/common/MaintenanceScreen';
import { RouteErrorBoundary } from './components/common/RouteErrorBoundary';

const _lazyLoadMap: (() => Promise<any>)[]  = [];
function preloadableLazy<T extends React.ComponentType<any>>(importFunc: () => Promise<{ default: T }>) {
  _lazyLoadMap.push(importFunc);
  return React.lazy(importFunc);
}

const PartialApp = preloadableLazy(() => import('./src/partialRms/App'));

// ── Always-needed (small, shown on every page) ─────────────────────────────
import Dashboard from './components/Dashboard';
import QuickStats from './components/QuickStats';

// ── Lazy-loaded route chunks ────────────────────────────────────────────────
// Each group becomes a separate JS chunk loaded only when first visited.
// Registration
const RegistrationOverview  = preloadableLazy(() => import('./components/registration/Overview'));
const Users                 = preloadableLazy(() => import('./components/registration/Users'));
const PaymentSetup          = preloadableLazy(() => import('./components/registration/PaymentSetup'));
const Commissions           = preloadableLazy(() => import('./components/registration/Commissions'));
const GeospatialMapping     = preloadableLazy(() => import('./components/registration/GeospatialMapping'));
const Properties            = preloadableLazy(() => import('./components/registration/Properties'));
const QuickSearch           = preloadableLazy(() => import('./components/registration/QuickSearch'));

// Tenants
const TenantsOverview    = preloadableLazy(() => import('./components/tenants/Overview'));
const Applications       = preloadableLazy(() => import('./components/tenants/Applications'));
const ActiveTenants      = preloadableLazy(() => import('./components/tenants/ActiveTenants'));
const FinesAndPenalties  = preloadableLazy(() => import('./components/tenants/FinesAndPenalties'));
const TenantInsights     = preloadableLazy(() => import('./components/tenants/TenantInsights'));
const Offboarding        = preloadableLazy(() => import('./components/tenants/Offboarding'));

// Landlords
const LandlordsOverview    = preloadableLazy(() => import('./components/landlords/Overview'));
const LandlordApplications = preloadableLazy(() => import('./components/landlords/Applications'));
const ActiveLandlords      = preloadableLazy(() => import('./components/landlords/ActiveLandlords'));
const Deductions           = preloadableLazy(() => import('./components/landlords/Deductions'));
const LandlordOffboarding  = preloadableLazy(() => import('./components/landlords/Offboarding'));

// Operations / Field Ops
const OperationsOverview = preloadableLazy(() => import('./components/operations/OperationsOverview'));
const FieldAgents        = preloadableLazy(() => import('./components/field-ops/FieldAgents'));
const Affiliates         = preloadableLazy(() => import('./components/field-ops/Affiliates'));
const Caretakers         = preloadableLazy(() => import('./components/field-ops/Caretakers'));
const FieldProperties    = preloadableLazy(() => import('./components/field-ops/Properties'));

// Maintenance
const MaintenanceOverview   = preloadableLazy(() => import('./components/field-ops/maintenance/MaintenanceOverview'));
const WorkOrders            = preloadableLazy(() => import('./components/field-ops/maintenance/WorkOrders'));
const RequestIntake         = preloadableLazy(() => import('./components/field-ops/maintenance/RequestIntake'));
const VendorManagement      = preloadableLazy(() => import('./components/field-ops/maintenance/VendorManagement'));
const PreventiveMaintenance = preloadableLazy(() => import('./components/field-ops/maintenance/PreventiveMaintenance'));
const CostTracking          = preloadableLazy(() => import('./components/field-ops/maintenance/CostTracking'));
const QualityControl        = preloadableLazy(() => import('./components/field-ops/maintenance/QualityControl'));
const MaintenanceReporting  = preloadableLazy(() => import('./components/field-ops/maintenance/Reporting'));

// Task Management & Ops
const TaskManagement     = preloadableLazy(() => import('./components/operations/TaskManagement'));
const Workflows          = preloadableLazy(() => import('./components/operations/Workflows'));
const Automation         = preloadableLazy(() => import('./components/operations/Automation'));
const EscalationRules    = preloadableLazy(() => import('./components/operations/EscalationRules'));
const AuditTrail         = preloadableLazy(() => import('./components/operations/AuditTrail'));
const OperationsReporting = preloadableLazy(() => import('./components/operations/Reporting'));

// Communication
const CommunicationOverview   = preloadableLazy(() => import('./components/operations/communication/CommunicationOverview'));
const Messages                = preloadableLazy(() => import('./components/operations/communication/Messages'));
const Templates               = preloadableLazy(() => import('./components/operations/communication/Templates'));
const CommunicationAutomation = preloadableLazy(() => import('./components/operations/communication/Automation'));

// Leases
const LeasesOverview       = preloadableLazy(() => import('./components/operations/leases/LeasesOverview'));
const ActiveLeases         = preloadableLazy(() => import('./components/operations/leases/ActiveLeases'));
const LeaseTemplates       = preloadableLazy(() => import('./components/operations/leases/LeaseTemplates'));
const Esignature           = preloadableLazy(() => import('./components/operations/leases/Esignature'));
const Renewals             = preloadableLazy(() => import('./components/operations/leases/Renewals'));
const Amendments           = preloadableLazy(() => import('./components/operations/leases/Amendments'));
const Terminations         = preloadableLazy(() => import('./components/operations/leases/Terminations'));
const TenantsWithoutLeases = preloadableLazy(() => import('./components/operations/leases/TenantsWithoutLeases'));
const LeaseDocuments       = preloadableLazy(() => import('./components/operations/leases/LeaseDocuments'));
const LeasesReporting      = preloadableLazy(() => import('./components/operations/leases/Reporting'));

// Payments
const PaymentsOverview       = preloadableLazy(() => import('./components/payments/Overview'));
const Inbound                = preloadableLazy(() => import('./components/payments/Inbound'));
const Outbound               = preloadableLazy(() => import('./components/payments/Outbound'));
const Invoices               = preloadableLazy(() => import('./components/payments/Invoices'));
const PaymentReconciliation  = preloadableLazy(() => import('./components/payments/Reconciliation'));
const LandlordPayouts        = preloadableLazy(() => import('./components/payments/LandlordPayouts'));
const Overpayments           = preloadableLazy(() => import('./components/payments/Overpayments'));
const PaymentProcessing      = preloadableLazy(() => import('./components/payments/PaymentProcessing'));

// HR
const StaffManagement  = preloadableLazy(() => import('./components/hr/StaffManagement'));
const PayrollProcessing = preloadableLazy(() => import('./components/hr/PayrollProcessing'));
const HRCommissions    = preloadableLazy(() => import('./components/hr/Commissions'));
const LeaveAttendance  = preloadableLazy(() => import('./components/hr/LeaveAttendance'));
const Performance      = preloadableLazy(() => import('./components/hr/Performance'));
const HRReporting      = preloadableLazy(() => import('./components/hr/Reporting'));

// Accounting
const AccountingOverview       = preloadableLazy(() => import('./components/accounting/Overview'));
const Income                   = preloadableLazy(() => import('./components/accounting/Income'));
const Expenses                 = preloadableLazy(() => import('./components/accounting/Expenses'));
const FinancialStatements      = preloadableLazy(() => import('./components/accounting/FinancialStatements'));
const TaxCompliance            = preloadableLazy(() => import('./components/accounting/TaxCompliance'));
const AccountingReconciliation = preloadableLazy(() => import('./components/accounting/Reconciliation'));
const AccountingReporting      = preloadableLazy(() => import('./components/accounting/Reporting'));

// Analytics
const AnalyticsOverview = preloadableLazy(() => import('./components/analytics/Overview'));

// Reports
const ReportsOverview             = preloadableLazy(() => import('./components/reports/Overview'));
const TenancyReports              = preloadableLazy(() => import('./components/reports/TenancyReports'));
const PropertyReports             = preloadableLazy(() => import('./components/reports/PropertyReports'));
const FinancialReports            = preloadableLazy(() => import('./components/reports/FinancialReports'));
const StaffReports                = preloadableLazy(() => import('./components/reports/StaffReports'));
const TaskAndOperationsReports    = preloadableLazy(() => import('./components/reports/TaskAndOperationsReports'));
const ReitReports                 = preloadableLazy(() => import('./components/reports/ReitReports'));
const ComplianceAndTaxReports     = preloadableLazy(() => import('./components/reports/ComplianceAndTaxReports'));
const CustomReports               = preloadableLazy(() => import('./components/reports/CustomReports'));
const VacancyReports              = preloadableLazy(() => import('./components/reports/VacancyReports'));
const HouseStatusAlertsReport     = preloadableLazy(() => import('./components/reports/HouseStatusAlertsReport'));

// User App Portal
const TenantPortal    = preloadableLazy(() => import('./components/userAppPortal/TenantPortal'));
const AgentPortal     = preloadableLazy(() => import('./components/userAppPortal/AgentPortal'));
const LandlordsPortal = preloadableLazy(() => import('./components/userAppPortal/LandlordsPortal'));
const AffiliatePortal = preloadableLazy(() => import('./components/userAppPortal/AffiliatePortal'));
const InvestorsPortal = preloadableLazy(() => import('./components/userAppPortal/InvestorsPortal'));
const CaretakerPortal = preloadableLazy(() => import('./components/userAppPortal/CaretakerPortal'));
const ContractorPortal = preloadableLazy(() => import('./components/userAppPortal/ContractorPortal'));
const ReferralLanding = preloadableLazy(() => import('./components/userAppPortal/ReferralLanding'));
const ReferAndGrow    = preloadableLazy(() => import('./components/userAppPortal/ReferAndGrow'));
const UserProfile     = preloadableLazy(() => import('./components/userAppPortal/UserProfile'));

// Marketplace
const Listings              = preloadableLazy(() => import('./components/marketplace/Listings'));
const Leads                 = preloadableLazy(() => import('./components/marketplace/Leads'));
const MarketplaceAffiliates = preloadableLazy(() => import('./components/marketplace/Affiliates'));
const MyFundiHub            = preloadableLazy(() => import('./components/marketplace/DeveloperPortal'));
const ReferralProgram       = preloadableLazy(() => import('./components/marketplace/ReferralProgram'));
const MarketplaceReporting  = preloadableLazy(() => import('./components/marketplace/Reporting'));
const MarketingBanners      = preloadableLazy(() => import('./components/marketplace/MarketingBanners'));

// R-Reits
const RReitsOverview        = preloadableLazy(() => import('./components/r-reits/Overview'));
const InvestmentPlans       = preloadableLazy(() => import('./components/r-reits/InvestmentPlans'));
const RenovationAccounting  = preloadableLazy(() => import('./components/r-reits/RenovationAccounting'));
const InvestorDashboard     = preloadableLazy(() => import('./components/r-reits/InvestorDashboard'));
const RFPayments            = preloadableLazy(() => import('./components/r-reits/RFPayments'));
const PortfolioPerformance  = preloadableLazy(() => import('./components/r-reits/PortfolioPerformance'));
const Referrals             = preloadableLazy(() => import('./components/r-reits/Referrals'));
const ComplianceAndKYC      = preloadableLazy(() => import('./components/r-reits/ComplianceAndKYC'));

// Settings
const Profile           = preloadableLazy(() => import('./components/settings/Profile'));
const Roles             = preloadableLazy(() => import('./components/settings/RolesAndPermissions'));
const Permissions       = preloadableLazy(() => import('./components/settings/Permissions'));
const Widgets           = preloadableLazy(() => import('./components/settings/Widgets'));
const RatesAndRules     = preloadableLazy(() => import('./components/settings/RatesAndRules'));
const Constants         = preloadableLazy(() => import('./components/settings/Constants'));
const SettingsAuditTrail = preloadableLazy(() => import('./components/settings/AuditTrail'));

const RedirectTo: React.FC<{ to: string }> = ({ to }) => {
    useEffect(() => { window.location.hash = to; }, [to]);
    return null;
};

const AccessDenied: React.FC = () => (
    <div className="flex flex-col items-center justify-center h-[80vh] text-center animate-fade-in">
        <div className="bg-red-50 p-6 rounded-full mb-4">
             <Icon name="shield" className="w-16 h-16 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h2>
        <p className="text-gray-500 max-w-md mb-6">
            You do not have permission to view this module. Please contact your system administrator if you believe this is an error.
        </p>
        <button 
            onClick={() => window.location.hash = '#/dashboard'}
            className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-black transition-colors"
        >
            Return to Dashboard
        </button>
    </div>
);

const getInitialRedirectPath = (user: any): string => {
    const hash = window.location.hash || '#/dashboard';
    if (!user) return hash;

    // If they are on a non-root / non-dashboard path, let them load that path
    if (hash !== '#/' && hash !== '#/dashboard' && hash !== '') {
        return hash;
    }

    // Default portal-only users landing page to prevent loading super-admin dashboard first
    const role = user.role;
    if (role === 'Tenant') return '#/user-app-portal/tenant-portal';
    if (role === 'Landlord') return '#/user-app-portal/landlords-portal';
    if (role === 'Field Agent') return '#/user-app-portal/agent-portal';
    if (role === 'Caretaker') return '#/user-app-portal/caretaker-portal';
    if (role === 'Investor') return '#/r-reits/investor-dashboard';
    if (role === 'Affiliate') return '#/user-app-portal/affiliate-portal';
    if (role === 'Contractor' || role === 'Fundi') return '#/user-app-portal/contractor-portal';

    return hash;
};

const AppContent: React.FC = () => {
  // Initialize Sidebar state based on window width
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const [currentPath, setCurrentPath] = useState(() => {
    let cachedUser: any = null;
    try {
      const raw = localStorage.getItem('taskme_session_cache');
      if (raw) {
        cachedUser = JSON.parse(raw)?.user;
      }
    } catch {}
    const path = getInitialRedirectPath(cachedUser);
    if (window.location.hash !== path && (window.location.hash === '#/dashboard' || !window.location.hash)) {
      window.location.hash = path;
    }
    return path;
  });
  
  const { currentUser, setCurrentUser, roles, systemSettings, isDataLoading } = useData();

  const handleLogout = async () => {
    localStorage.removeItem('taskme_session_cache');
    setCurrentUser(null);
    supabase.auth.signOut().catch(console.error);
  };

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(window.location.hash || '#/dashboard');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (shouldShowMaintenance(systemSettings?.saasBillingPreventsLogin)) {
    return <MaintenanceScreen />;
  }

  const handleMainClick = () => {
    if (window.innerWidth < 1024 && isSidebarOpen) {
        setIsSidebarOpen(false);
    }
  };

  // --- ACCESS CONTROL LAYER ---

  // Check if current path is public
  const isPublicRoute = currentPath.startsWith('#/user-app-portal/referral-landing');

  if (!currentUser) {
      if (isPublicRoute) {
          return (
              <div className="app-layout bg-white font-sans text-gray-900">
                 <ReferralLanding />
              </div>
          );
      }
      const handleAuthLogin = (u: User | StaffProfile | TenantProfile) => {
          setCurrentUser(u as User | StaffProfile | TenantProfile);

          let redirectPath = '#/dashboard';
          if (u.role === 'Tenant') redirectPath = '#/user-app-portal/tenant-portal';
          else if (u.role === 'Landlord') redirectPath = '#/user-app-portal/landlords-portal';
          else if (u.role === 'Field Agent') redirectPath = '#/user-app-portal/agent-portal';
          else if (u.role === 'Caretaker') redirectPath = '#/user-app-portal/caretaker-portal';
          else if (u.role === 'Investor') redirectPath = '#/r-reits/investor-dashboard';
          else if (u.role === 'Affiliate') redirectPath = '#/user-app-portal/affiliate-portal';
          else if (u.role === 'Contractor' || u.role === 'Fundi') redirectPath = '#/user-app-portal/contractor-portal';

          window.location.hash = redirectPath;
          setCurrentPath(redirectPath);
      };

      if (currentPath === '#/signup') {
          return <SignUp onLogin={handleAuthLogin} />;
      }
      return <Auth onLogin={handleAuthLogin} />;
  }

  // Show a clean, professional loading state if roles or core metadata are still loading for a logged-in user
  // and we do NOT have cached essentials in localStorage. If we do, bypass this block and let the App mount
  // immediately so the cached dashboard can render.
  const hasCachedEssentials = (() => {
      try {
          return !!localStorage.getItem('taskme_cache_tm_system_settings_v11') && !!localStorage.getItem('taskme_cache_roles');
      } catch {
          return false;
      }
  })();

  if (isDataLoading && !hasCachedEssentials) {
      return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
              <div className="flex flex-col items-center gap-3 text-gray-400">
                  <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span className="text-sm font-medium">Securing session and loading workspace...</span>
              </div>
          </div>
      );
  }

  // Only fully Inactive accounts are blocked from signing in.
  // Suspended, PendingApproval, Offboarded, Terminated, etc. can still log in.
  if (currentUser && currentUser.status === 'Inactive') {
      return (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
              <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-sm">
                  <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                      <Icon name="close" className="w-8 h-8" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 mb-2">Account Inactive</h2>
                  <p className="text-gray-500 mb-6">Your account has been marked inactive. Please contact support.</p>
                  <button onClick={handleLogout} className="px-6 py-2 bg-gray-800 text-white font-bold rounded-lg hover:bg-black">Logout</button>
              </div>
          </div>
      );
  }

  // Get current role definition to check live permissions
  const currentRoleDef = roles.find(r => r.name === currentUser!.role);
  const isSuperAdmin = currentUser!.role === 'Super Admin';

  const checkAccess = (requiredModulePath: string): boolean => {
      if (isSuperAdmin) return true;

      const role = currentUser!.role;

      // Safe global fallbacks for common user app portal features (Profile, Referral programs)
      if ([
          'User App Portal/Refer & Earn',
          'User App Portal/My Profile',
          'User App Portal/Referral Landing'
      ].includes(requiredModulePath)) {
          if (['Tenant', 'Landlord', 'Field Agent', 'Caretaker', 'Investor', 'Affiliate', 'Contractor', 'Fundi'].includes(role)) {
              return true;
          }
      }

      // Safe role-specific fallbacks to prevent scary "Access Denied" if roles are not loaded or defined in DB
      if (role === 'Tenant' && requiredModulePath === 'User App Portal/Tenant Portal') return true;
      if (role === 'Landlord' && requiredModulePath === 'User App Portal/Landlords Portal') return true;
      if (role === 'Field Agent' && requiredModulePath === 'User App Portal/Agent Portal') return true;
      if (role === 'Caretaker' && requiredModulePath === 'User App Portal/Caretaker Portal') return true;
      if (role === 'Investor' && requiredModulePath === 'User App Portal/Investors Portal') return true;
      if (role === 'Affiliate' && requiredModulePath === 'User App Portal/Affiliate Portal') return true;
      if ((role === 'Contractor' || role === 'Fundi') && requiredModulePath === 'User App Portal/Contractor Portal') return true;

      // Staff roles / Admin landing page fallback
      const PORTAL_ONLY_ROLES = new Set(['Tenant', 'Landlord', 'Investor', 'Caretaker', 'Affiliate', 'Contractor', 'Fundi', 'Field Agent']);
      if (!PORTAL_ONLY_ROLES.has(role) && requiredModulePath === 'Dashboard/Dashboard') {
          return true; // Any non-portal user can always access the landing dashboard
      }
      
      // Automatic permission fallbacks for Investor role
      if (role === 'Investor') {
          if ([
              'User App Portal/Investors Portal',
              'User App Portal/Refer & Earn',
              'User App Portal/My Profile',
              'User App Portal/Referral Landing',
              'R-Reits/Investment Plans',
              'R-Reits/Investor Dashboard',
              'R-Reits/RF Payments',
              'R-Reits/Portfolio Performance',
              'R-Reits/Referrals',
              'R-Reits/Compliance & KYC'
          ].includes(requiredModulePath)) {
              return true;
          }
      }

      if (!currentRoleDef) {
          // Fallback for staff and portal-only users when role rows are temporarily loading/unavailable.
          if (!PORTAL_ONLY_ROLES.has(role)) {
              return true; // Staff/Admin roles get optimistic access while roles load from DB
          }
          if (role === 'Field Agent') {
              return [
                  'User App Portal/Agent Portal',
                  'User App Portal/Refer & Earn',
                  'User App Portal/My Profile',
                  'User App Portal/Referral Landing',
              ].includes(requiredModulePath);
          }
          return false;
      }
      // Allow access to Refer & Earn, Profile for all roles that have access to User App Portal features
      if (requiredModulePath === 'User App Portal/Refer & Earn' || requiredModulePath === 'User App Portal/My Profile' || requiredModulePath === 'User App Portal/Referral Landing') {
          return currentRoleDef.accessibleSubmodules.some(p => p.startsWith('User App Portal'));
      }
      return currentRoleDef.accessibleSubmodules.includes(requiredModulePath);
  };

  const renderContent = () => {
    const path = currentPath.split('?')[0];

    // Dashboard
    if (path === '#/' || path === '#/dashboard') {
        // Fallback for role-based home if they manually navigate to root
        const role = currentUser!.role;
        if (role === 'Tenant') return <RedirectTo to="#/user-app-portal/tenant-portal" />;
        if (role === 'Landlord') return <RedirectTo to="#/user-app-portal/landlords-portal" />;
        if (role === 'Field Agent') return <RedirectTo to="#/user-app-portal/agent-portal" />;
        if (role === 'Caretaker') return <RedirectTo to="#/user-app-portal/caretaker-portal" />;
        if (role === 'Investor') return <RedirectTo to="#/r-reits/investor-dashboard" />;
        if (role === 'Affiliate') return <RedirectTo to="#/user-app-portal/affiliate-portal" />;
        if (role === 'Contractor' || role === 'Fundi') return <RedirectTo to="#/user-app-portal/contractor-portal" />;

        return checkAccess('Dashboard/Dashboard') ? <Dashboard /> : <AccessDenied />;
    }
    if (path.startsWith('#/dashboard/stats')) return checkAccess('Dashboard/Quick Stats') ? <QuickStats /> : <AccessDenied />;
    if (path.startsWith('#/dashboard/search')) return checkAccess('Dashboard/Quick Search') ? <QuickSearch /> : <AccessDenied />;

    // Registration
    if (path.startsWith('#/registration')) {
        if (path === '#/registration/overview' && !checkAccess('Registration/Overview')) return <AccessDenied />;
        if (path === '#/registration/users' && !checkAccess('Registration/Users')) return <AccessDenied />;
        if (path === '#/registration/payment-setup' && !checkAccess('Registration/Payment Setup')) return <AccessDenied />;
        if (path === '#/registration/commissions' && !checkAccess('Registration/Commissions')) return <AccessDenied />;
        if (path === '#/registration/geospatial-mapping' && !checkAccess('Registration/Geospatial Mapping')) return <AccessDenied />;
        if (path === '#/registration/properties' && !checkAccess('Registration/Properties')) return <AccessDenied />;

        switch (path) {
            case '#/registration/overview': return <RegistrationOverview />;
            case '#/registration/users': return <Users />;
            case '#/registration/payment-setup': return <PaymentSetup />;
            case '#/registration/commissions': return <Commissions />;
            case '#/registration/geospatial-mapping': return <GeospatialMapping />;
            case '#/registration/properties': return <Properties />;
            default: return checkAccess('Registration/Overview') ? <RegistrationOverview /> : <AccessDenied />;
        }
    }

    // Tenants
    if (path.startsWith('#/tenants')) {
        if (path.startsWith('#/tenants/active-tenants') && !checkAccess('Tenants/Active Tenants')) return <AccessDenied />;
        if (path === '#/tenants/overview' && !checkAccess('Tenants/Overview')) return <AccessDenied />;
        if (path === '#/tenants/applications' && !checkAccess('Tenants/Applications')) return <AccessDenied />;
        if (path === '#/tenants/fines-penalties' && !checkAccess('Tenants/Fines & Penalties')) return <AccessDenied />;
        if (path === '#/tenants/tenant-insights' && !checkAccess('Tenants/Tenant Insights')) return <AccessDenied />;
        if (path === '#/tenants/offboarding' && !checkAccess('Tenants/Offboarding')) return <AccessDenied />;

        if (path.startsWith('#/tenants/active-tenants')) return <ActiveTenants />;
        switch (path) {
            case '#/tenants/overview': return <TenantsOverview />;
            case '#/tenants/applications': return <Applications />;
            case '#/tenants/fines-penalties': return <FinesAndPenalties />;
            case '#/tenants/tenant-insights': return <TenantInsights />;
            case '#/tenants/offboarding': return <Offboarding />;
            default: return checkAccess('Tenants/Overview') ? <TenantsOverview /> : <AccessDenied />;
        }
    }

    // Landlords
    if (path.startsWith('#/landlords')) {
        if (path === '#/landlords/overview' && !checkAccess('Landlords/Overview')) return <AccessDenied />;
        if (path === '#/landlords/applications' && !checkAccess('Landlords/Applications')) return <AccessDenied />;
        if (path.startsWith('#/landlords/active-landlords') && !checkAccess('Landlords/Active Landlords')) return <AccessDenied />;
        if (path === '#/landlords/deductions' && !checkAccess('Landlords/Deductions')) return <AccessDenied />;
        if (path === '#/landlords/offboarding' && !checkAccess('Landlords/Offboarding')) return <AccessDenied />;

        if (path.startsWith('#/landlords/active-landlords')) return <ActiveLandlords />;
        switch (path) {
            case '#/landlords/overview': return <LandlordsOverview />;
            case '#/landlords/applications': return <LandlordApplications />;
            case '#/landlords/active-landlords': return <ActiveLandlords />;
            case '#/landlords/deductions': return <Deductions />;
            case '#/landlords/offboarding': return <LandlordOffboarding />;
            default: return checkAccess('Landlords/Overview') ? <LandlordsOverview /> : <AccessDenied />;
        }
    }

    // Operations
    if (path.startsWith('#/operations')) {
        
        // Maintenance
        if (path.startsWith('#/operations/maintenance')) {
             if (!checkAccess('Operations/Maintenance')) return <AccessDenied />;

             if (path === '#/operations/maintenance') return <MaintenanceOverview />;
             if (path === '#/operations/maintenance/work-orders') return <WorkOrders />;
             if (path === '#/operations/maintenance/request-intake') return <RequestIntake />;
             if (path === '#/operations/maintenance/vendor-management') return <VendorManagement />;
             if (path === '#/operations/maintenance/preventive-maintenance') return <PreventiveMaintenance />;
             if (path === '#/operations/maintenance/cost-tracking') return <CostTracking />;
             if (path === '#/operations/maintenance/quality-control') return <QualityControl />;
             if (path === '#/operations/maintenance/reporting') return <MaintenanceReporting />;
             return <MaintenanceOverview />;
        }

        // Communications
        if (path.startsWith('#/operations/communications')) {
             if (!checkAccess('Operations/Communications')) return <AccessDenied />;
             if (path === '#/operations/communications') return <CommunicationOverview />;
             if (path === '#/operations/communications/inbound') return <Messages folderFilter="Inbox" />;
             if (path === '#/operations/communications/outbound') return <Messages folderFilter="Sent" />;
             if (path === '#/operations/communications/templates') return <Templates />;
             if (path === '#/operations/communications/automation') return <CommunicationAutomation />;
             return <CommunicationOverview />;
        }

        // Leases
        if (path.startsWith('#/operations/leases')) {
            if (!checkAccess('Operations/Leases')) return <AccessDenied />;
            switch (path) {
                case '#/operations/leases': return <LeasesOverview />;
                case '#/operations/leases/active-leases': return <ActiveLeases />;
                case '#/operations/leases/lease-templates': return <LeaseTemplates />;
                case '#/operations/leases/esignature': return <Esignature />;
                case '#/operations/leases/renewals': return <Renewals />;
                case '#/operations/leases/amendments': return <Amendments />;
                case '#/operations/leases/terminations': return <Terminations />;
                case '#/operations/leases/tenants-without-leases': return <TenantsWithoutLeases />;
                case '#/operations/leases/lease-documents': return <LeaseDocuments />;
                case '#/operations/leases/reporting': return <LeasesReporting />;
                default: return <LeasesOverview />;
            }
        }

        // General Ops
        if (path === '#/operations/field-agents' && !checkAccess('Operations/Field Agents')) return <AccessDenied />;
        if (path === '#/operations/affiliates' && !checkAccess('Operations/Affiliates')) return <AccessDenied />;
        if (path === '#/operations/caretakers' && !checkAccess('Operations/Caretakers')) return <AccessDenied />;
        if (path === '#/operations/properties' && !checkAccess('Operations/Properties')) return <AccessDenied />;
        if (path === '#/operations/board' && !checkAccess('Operations/Task Management')) return <AccessDenied />;
        
        switch (path) {
            case '#/operations/overview': return checkAccess('Operations/Task Management') ? <OperationsOverview /> : <AccessDenied />;
            case '#/operations/field-agents': return <FieldAgents />;
            case '#/operations/affiliates': return <Affiliates />;
            case '#/operations/caretakers': return <Caretakers />;
            case '#/operations/properties': return <FieldProperties />;
            case '#/operations/task-management': return <OperationsOverview />;
            case '#/operations/board': return <TaskManagement />;
            case '#/operations/workflows': return <Workflows />;
            case '#/operations/automation': return <Automation />;
            case '#/operations/escalation-rules': return <EscalationRules />;
            case '#/operations/audit-trail': return <AuditTrail />;
            case '#/operations/reporting': return <OperationsReporting />;
            default: return checkAccess('Operations/Field Agents') ? <FieldAgents /> : <AccessDenied />;
        }
    }

    // Payments
    if (path.startsWith('#/payments')) {
        if (path === '#/payments/overview' && !checkAccess('Payments/Overview')) return <AccessDenied />;
        if (path === '#/payments/inbound' && !checkAccess('Payments/Inbound')) return <AccessDenied />;
        if (path === '#/payments/outbound' && !checkAccess('Payments/Outbound')) return <AccessDenied />;
        if (path === '#/payments/invoices' && !checkAccess('Payments/Invoices')) return <AccessDenied />;
        if (path === '#/payments/reconciliation' && !checkAccess('Payments/Reconciliation')) return <AccessDenied />;
        if (path === '#/payments/landlord-payouts' && !checkAccess('Payments/Landlord Payouts')) return <AccessDenied />;
        if (path === '#/payments/overpayments' && !checkAccess('Payments/Overpayments')) return <AccessDenied />;
        if (path === '#/payments/payment-processing' && !checkAccess('Payments/Payment Processing')) return <AccessDenied />;

        switch (path) {
            case '#/payments/overview': return <PaymentsOverview />;
            case '#/payments/inbound': return <Inbound />;
            case '#/payments/outbound': return <Outbound />;
            case '#/payments/invoices': return <Invoices />;
            case '#/payments/reconciliation': return <PaymentReconciliation />;
            case '#/payments/landlord-payouts': return <LandlordPayouts />;
            case '#/payments/overpayments': return <Overpayments />;
            case '#/payments/payment-processing': return <PaymentProcessing />;
            default: return checkAccess('Payments/Overview') ? <PaymentsOverview /> : <AccessDenied />;
        }
    }

    // HR & Payroll
    if (path.startsWith('#/hr-payroll')) {
        if (path === '#/hr-payroll/staff-management' && !checkAccess('HR & Payroll/Staff Management')) return <AccessDenied />;
        if (path === '#/hr-payroll/payroll-processing' && !checkAccess('HR & Payroll/Payroll Processing')) return <AccessDenied />;
        if (path === '#/hr-payroll/commissions' && !checkAccess('HR & Payroll/Commissions')) return <AccessDenied />;
        if (path === '#/hr-payroll/leave-attendance' && !checkAccess('HR & Payroll/Leave & Attendance')) return <AccessDenied />;
        if (path === '#/hr-payroll/performance' && !checkAccess('HR & Payroll/Performance')) return <AccessDenied />;
        if (path === '#/hr-payroll/reporting' && !checkAccess('HR & Payroll/Reporting')) return <AccessDenied />;

        switch (path) {
            case '#/hr-payroll/staff-management': return <StaffManagement />;
            case '#/hr-payroll/payroll-processing': return <PayrollProcessing />;
            case '#/hr-payroll/commissions': return <HRCommissions />;
            case '#/hr-payroll/leave-attendance': return <LeaveAttendance />;
            case '#/hr-payroll/performance': return <Performance />;
            case '#/hr-payroll/reporting': return <HRReporting />;
            default: return checkAccess('HR & Payroll/Staff Management') ? <StaffManagement /> : <AccessDenied />;
        }
    }

    // Accounting
    if (path.startsWith('#/accounting')) {
        if (path === '#/accounting/overview' && !checkAccess('Accounting/Overview')) return <AccessDenied />;
        if (path === '#/accounting/income' && !checkAccess('Accounting/Income')) return <AccessDenied />;
        if (path === '#/accounting/expenses' && !checkAccess('Accounting/Expenses')) return <AccessDenied />;
        if (path === '#/accounting/financial-statements' && !checkAccess('Accounting/Financial Statements')) return <AccessDenied />;
        if (path === '#/accounting/tax-compliance' && !checkAccess('Accounting/Tax Compliance')) return <AccessDenied />;
        if (path === '#/accounting/reconciliation' && !checkAccess('Accounting/Reconciliation')) return <AccessDenied />;
        if (path === '#/accounting/reporting' && !checkAccess('Accounting/Reporting')) return <AccessDenied />;

        switch (path) {
            case '#/accounting/overview': return <AccountingOverview />;
            case '#/accounting/income': return <Income />;
            case '#/accounting/expenses': return <Expenses />;
            case '#/accounting/financial-statements': return <FinancialStatements />;
            case '#/accounting/tax-compliance': return <TaxCompliance />;
            case '#/accounting/reconciliation': return <AccountingReconciliation />;
            case '#/accounting/reporting': return <AccountingReporting />;
            default: return checkAccess('Accounting/Overview') ? <AccountingOverview /> : <AccessDenied />;
        }
    }

    // Analytics & Reports
    if (path.startsWith('#/reports-analytics')) {
        if (path.startsWith('#/reports-analytics/analytics') && !checkAccess('Reports & Analytics/Analytics')) return <AccessDenied />;
        if (path.startsWith('#/reports-analytics/reports') && !checkAccess('Reports & Analytics/Reports')) return <AccessDenied />;

        if (path.startsWith('#/reports-analytics/analytics')) return <AnalyticsOverview />;
        if (path === '#/reports-analytics/reports') return <ReportsOverview />;
        
        if (path.startsWith('#/reports-analytics/reports/tenancy-reports')) return <TenancyReports />;
        if (path.startsWith('#/reports-analytics/reports/property-reports')) return <PropertyReports />;
        if (path.startsWith('#/reports-analytics/reports/financial-reports')) return <FinancialReports />;
        if (path.startsWith('#/reports-analytics/reports/staff-reports')) return <StaffReports />;
        if (path.startsWith('#/reports-analytics/reports/task-operations-reports')) return <TaskAndOperationsReports />;
        if (path.startsWith('#/reports-analytics/reports/r-reits-fund')) return <ReitReports />;
        if (path.startsWith('#/reports-analytics/reports/compliance-tax-reports')) return <ComplianceAndTaxReports />;
        if (path.startsWith('#/reports-analytics/reports/custom-reports')) return <CustomReports />;
        if (path.startsWith('#/reports-analytics/reports/vacancy-reports')) return <VacancyReports />; // New Route
        if (path.startsWith('#/reports-analytics/reports/house-status-alerts')) return <HouseStatusAlertsReport />;

        return <ReportsOverview />;
    }
    
    // Legacy support
    if (path.startsWith('#/reports')) return checkAccess('Reports & Analytics/Reports') ? <ReportsOverview /> : <AccessDenied />;
    if (path.startsWith('#/analytics')) return checkAccess('Reports & Analytics/Analytics') ? <AnalyticsOverview /> : <AccessDenied />;

    // User App Portal
    if (path.startsWith('#/user-app-portal')) {
        // Access checks are implicitly handled by the Sidebar/Navigation visibility for roles
        // and the role-based redirect on login. 
        // Additional explicit checks here:
        if (path === '#/user-app-portal/tenant-portal' && !checkAccess('User App Portal/Tenant Portal')) return <AccessDenied />;
        if (path === '#/user-app-portal/agent-portal' && !checkAccess('User App Portal/Agent Portal')) return <AccessDenied />;
        if (path === '#/user-app-portal/refer-earn' && !checkAccess('User App Portal/Refer & Earn')) return <AccessDenied />;
        if (path === '#/user-app-portal/my-profile' && !checkAccess('User App Portal/My Profile')) return <AccessDenied />;
        if (path.startsWith('#/user-app-portal/referral-landing') && !checkAccess('User App Portal/Referral Landing')) return <AccessDenied />;

        // Handle Landlords Portal with sub-routes
        if (path.startsWith('#/user-app-portal/landlords-portal')) {
            if (!checkAccess('User App Portal/Landlords Portal')) return <AccessDenied />;
            return <LandlordsPortal />;
        }

        // Handle Referral Landing with query params (?type=&id=&ref=)
        if (path.startsWith('#/user-app-portal/referral-landing')) {
            return <ReferralLanding />;
        }

        if (path === '#/user-app-portal/affiliate-portal' && !checkAccess('User App Portal/Affiliate Portal')) return <AccessDenied />;
        if (path === '#/user-app-portal/investors-portal' && !checkAccess('User App Portal/Investors Portal')) return <AccessDenied />;
        if (path === '#/user-app-portal/caretaker-portal' && !checkAccess('User App Portal/Caretaker Portal')) return <AccessDenied />;
        if (path === '#/user-app-portal/contractor-portal' && !checkAccess('User App Portal/Contractor Portal')) return <AccessDenied />;
        
        switch (path) {
            case '#/user-app-portal/tenant-portal': return <TenantPortal />;
            case '#/user-app-portal/agent-portal': return <AgentPortal />;
            // landlords-portal handled above
            case '#/user-app-portal/affiliate-portal': return <AffiliatePortal />;
            case '#/user-app-portal/investors-portal': return <InvestorsPortal />;
            case '#/user-app-portal/caretaker-portal': return <CaretakerPortal />;
            case '#/user-app-portal/contractor-portal': return <ContractorPortal />;
            case '#/user-app-portal/refer-earn': return <ReferAndGrow />;
            case '#/user-app-portal/my-profile': return <UserProfile />;
            default: return <TenantPortal />;
        }
    }

    // Marketplace
    if (path.startsWith('#/marketplace')) {
        if (path === '#/marketplace/listings' && !checkAccess('Marketplace/Listings')) return <AccessDenied />;
        if (path === '#/marketplace/leads' && !checkAccess('Marketplace/Leads')) return <AccessDenied />;
        if (path === '#/marketplace/affiliates' && !checkAccess('Marketplace/Affiliates')) return <AccessDenied />;
        if (path === '#/marketplace/myfundihub' && !checkAccess('Marketplace/MyFundiHub')) return <AccessDenied />;
        if (path === '#/marketplace/referral-program' && !checkAccess('Marketplace/Referral Program')) return <AccessDenied />;
        if (path === '#/marketplace/marketing-banners' && !checkAccess('Marketplace/Marketing Banners')) return <AccessDenied />;
        if (path === '#/marketplace/reporting' && !checkAccess('Marketplace/Reporting')) return <AccessDenied />;
        
        switch (path) {
            case '#/marketplace/listings': return <Listings />;
            case '#/marketplace/leads': return <Leads />;
            case '#/marketplace/affiliates': return <MarketplaceAffiliates />;
            case '#/marketplace/myfundihub': return <MyFundiHub />;
            case '#/marketplace/referral-program': return <ReferralProgram />;
            case '#/marketplace/marketing-banners': return <MarketingBanners />;
            case '#/marketplace/reporting': return <MarketplaceReporting />;
            default: return checkAccess('Marketplace/Listings') ? <Listings /> : <AccessDenied />;
        }
    }

    // R-Reits
    if (path.startsWith('#/r-reits')) {
         if (path === '#/r-reits/overview' && !checkAccess('R-Reits/Overview')) return <AccessDenied />;
         if (path === '#/r-reits/investment-plans' && !checkAccess('R-Reits/Investment Plans')) return <AccessDenied />;
         if (path === '#/r-reits/project-accounting' && !checkAccess('R-Reits/Project Accounting')) return <AccessDenied />;
         if (path === '#/r-reits/investor-dashboard' && !checkAccess('R-Reits/Investor Dashboard')) return <AccessDenied />;
         if (path === '#/r-reits/rf-payments' && !checkAccess('R-Reits/RF Payments')) return <AccessDenied />;
         if (path === '#/r-reits/portfolio-performance' && !checkAccess('R-Reits/Portfolio Performance')) return <AccessDenied />;
         if (path === '#/r-reits/referrals' && !checkAccess('R-Reits/Referrals')) return <AccessDenied />;
         if (path === '#/r-reits/compliance-kyc' && !checkAccess('R-Reits/Compliance & KYC')) return <AccessDenied />;

        switch (path) {
            case '#/r-reits/overview': return <RReitsOverview />;
            case '#/r-reits/investment-plans': return <InvestmentPlans />;
            case '#/r-reits/project-accounting': return <RenovationAccounting />;
            case '#/r-reits/investor-dashboard': return <InvestorDashboard />;
            case '#/r-reits/rf-payments': return <RFPayments />;
            case '#/r-reits/portfolio-performance': return <PortfolioPerformance />;
            case '#/r-reits/referrals': return <Referrals />;
            case '#/r-reits/compliance-kyc': return <ComplianceAndKYC />;
            default: return checkAccess('R-Reits/Overview') ? <RReitsOverview /> : <AccessDenied />;
        }
    }

    // Settings
    if (path.startsWith('#/settings')) {
        if (path === '#/settings/profile' && !checkAccess('Settings/Profile')) return <AccessDenied />;
        if (path === '#/settings/roles' && !checkAccess('Settings/Roles')) return <AccessDenied />;
        if (path === '#/settings/permissions' && !checkAccess('Settings/Permissions')) return <AccessDenied />;
        if (path === '#/settings/widgets' && !checkAccess('Settings/Widgets')) return <AccessDenied />;
        if (path === '#/settings/rates-rules' && !checkAccess('Settings/Rates & Rules')) return <AccessDenied />;
        if (path === '#/settings/constants' && !checkAccess('Settings/Constants')) return <AccessDenied />;
        if (path === '#/settings/audit-trail' && !checkAccess('Settings/Audit Trail')) return <AccessDenied />;

        switch (path) {
            case '#/settings/profile': return <Profile />;
            case '#/settings/roles': return <Roles />;
            case '#/settings/permissions': return <Permissions />;
            case '#/settings/widgets': return <Widgets />;
            case '#/settings/rates-rules': return <RatesAndRules />;
            case '#/settings/constants': return <Constants />;
            case '#/settings/audit-trail': return <SettingsAuditTrail />;
            default: return checkAccess('Settings/Profile') ? <Profile /> : <AccessDenied />;
        }
    }

    return <Dashboard />;
  };

  return (
      <div className="app-layout bg-gray-100 font-sans text-gray-900" data-sidebar-open={isSidebarOpen ? "true" : "false"}>
        <Header 
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
            isSidebarOpen={isSidebarOpen} 
            onLogout={handleLogout}
        />
        <Sidebar 
            activeRoute={currentPath} 
            isOpen={isSidebarOpen} 
            closeSidebarMobile={() => {
                if (window.innerWidth < 1024) {
                    setIsSidebarOpen(false);
                }
            }}
            onLogout={handleLogout}
        />

        
        {/* Mobile Backdrop */}
        {isSidebarOpen && (
            <div 
                className="fixed inset-0 bg-black/50 z-30 lg:hidden glass-backdrop" 
                onClick={() => setIsSidebarOpen(false)}
            />
        )}

        <main className="app-main bg-gray-100 relative" onClick={handleMainClick}>
            <Suspense fallback={
                <div className="flex items-center justify-center h-[60vh]">
                    <div className="flex flex-col items-center gap-3 text-gray-400">
                        <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        <span className="text-sm font-medium">Loading...</span>
                    </div>
                </div>
            }>
                <RouteErrorBoundary key={currentPath.split('?')[0]} routeName={currentPath}>
                    {renderContent()}
                </RouteErrorBoundary>
            </Suspense>
        </main>
      </div>
  );
};

const App: React.FC = () => {

    useEffect(() => {
        // Preload all chunks in parallel in the background, non-blocking
        const preload = async () => {
            // Wait for 1.5 seconds after initial mounting to let critical rendering and first queries settle
            await new Promise(resolve => setTimeout(resolve, 1500));
            // Preload all components concurrently in batches of 10 to be gentle but fast
            const batchSize = 10;
            for (let i = 0; i < _lazyLoadMap.length; i += batchSize) {
                const batch = _lazyLoadMap.slice(i, i + batchSize).map(loadFn => loadFn().catch(() => {}));
                await Promise.all(batch);
            }
            console.log('[App preloader] Finished preloading all pages in background.');
        };
        preload();
    }, []);
    const [path, setPath] = useState(window.location.hash || '#/dashboard');

    useEffect(() => {
        const handleHashChange = () => setPath(window.location.hash || '#/dashboard');
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    return (
        <>
            {path.startsWith('#/partial-rms') ? (
                <Suspense fallback={
                    <div className="flex items-center justify-center h-screen bg-gray-100">
                        <div className="flex flex-col items-center gap-3 text-gray-400">
                            <svg className="animate-spin h-10 w-10 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            <span className="text-sm font-medium animate-pulse">Switching to Partial RMS...</span>
                        </div>
                    </div>
                }>
                    <PartialApp />
                </Suspense>
            ) : (
                <DataProvider>
                    <AppContent />
                </DataProvider>
            )}
        </>
    );
}

export default App;
