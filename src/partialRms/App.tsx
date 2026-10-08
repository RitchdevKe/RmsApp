
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { supabase } from './utils/supabaseClient';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { DataProvider, useData } from './context/DataContext';
import Auth from './components/Auth';
import SignUp from './components/SignUp';
import Icon from './components/Icon';
import { User, StaffProfile, TenantProfile } from '@/types';
import { MaintenanceScreen, shouldShowMaintenance } from '../../components/common/MaintenanceScreen';

// ── Always-needed (small, shown on every page) ─────────────────────────────
import Dashboard from './components/Dashboard';
import QuickStats from './components/QuickStats';

// ── Static Imports for High-Frequency Core Modules (Performance Optimization) ──
import RegistrationOverview from './components/registration/Overview';
import Users from './components/registration/Users';
import PaymentSetup from './components/registration/PaymentSetup';
import Properties from './components/registration/Properties';
import TenantsOverview from './components/tenants/Overview';
import LandlordsOverview from './components/landlords/Overview';
import PaymentsOverview from './components/payments/Overview';
import ActiveTenants from './components/tenants/ActiveTenants';
import ActiveLandlords from './components/landlords/ActiveLandlords';

// ── Lazy-loaded route chunks (Medium/Low frequency routes) ───────────────────

const _lazyLoadMap: (() => Promise<any>)[]  = [];
function preloadableLazy<T extends React.ComponentType<any>>(importFunc: () => Promise<{ default: T }>) {
  _lazyLoadMap.push(importFunc);
  return React.lazy(importFunc);
}

// Each group becomes a separate JS chunk loaded only when first visited.
// Registration
const Commissions           = preloadableLazy(() => import('../../components/registration/Commissions'));
const GeospatialMapping     = preloadableLazy(() => import('../../components/registration/GeospatialMapping'));
const QuickSearch           = preloadableLazy(() => import('./components/registration/QuickSearch'));

// Tenants
const Applications       = preloadableLazy(() => import('../../components/tenants/Applications'));
const FinesAndPenalties  = preloadableLazy(() => import('./components/tenants/FinesAndPenalties'));
const TenantInsights     = preloadableLazy(() => import('./components/tenants/TenantInsights'));
const Offboarding        = preloadableLazy(() => import('./components/tenants/Offboarding'));

// Landlords
const LandlordApplications = preloadableLazy(() => import('./components/landlords/Applications'));
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
const Inbound                = preloadableLazy(() => import('./components/payments/Inbound'));
const Outbound               = preloadableLazy(() => import('./components/payments/Outbound'));
const Invoices               = preloadableLazy(() => import('./components/payments/Invoices'));
const PaymentReconciliation  = preloadableLazy(() => import('./components/payments/Reconciliation'));
const LandlordPayouts        = preloadableLazy(() => import('./components/payments/LandlordPayouts'));
const Overpayments           = preloadableLazy(() => import('./components/payments/Overpayments'));
const PaymentProcessing      = preloadableLazy(() => import('./components/payments/PaymentProcessing'));

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
const ReportsOverview             = preloadableLazy(() => import('../../components/reports/Overview'));
const TenancyReports              = preloadableLazy(() => import('../../components/reports/TenancyReports'));
const PropertyReports             = preloadableLazy(() => import('../../components/reports/PropertyReports'));
const FinancialReports            = preloadableLazy(() => import('../../components/reports/FinancialReports'));
const TaskAndOperationsReports    = preloadableLazy(() => import('../../components/reports/TaskAndOperationsReports'));
const ComplianceAndTaxReports     = preloadableLazy(() => import('../../components/reports/ComplianceAndTaxReports'));
const CustomReports               = preloadableLazy(() => import('./components/reports/CustomReports'));
const VacancyReports              = preloadableLazy(() => import('../../components/reports/VacancyReports'));
const HouseStatusAlertsReport     = preloadableLazy(() => import('../../components/reports/HouseStatusAlertsReport'));

// User App Portal
const TenantPortal    = preloadableLazy(() => import('../../components/userAppPortal/TenantPortal'));
const LandlordsPortal = preloadableLazy(() => import('./components/userAppPortal/LandlordsPortal'));
const CaretakerPortal = preloadableLazy(() => import('../../components/userAppPortal/CaretakerPortal'));
const ContractorPortal = preloadableLazy(() => import('../../components/userAppPortal/ContractorPortal'));
const UserProfile     = preloadableLazy(() => import('../../components/userAppPortal/UserProfile'));

// Settings
const Profile           = preloadableLazy(() => import('../../components/settings/Profile'));
const Roles             = preloadableLazy(() => import('../../components/settings/RolesAndPermissions'));
const Permissions       = preloadableLazy(() => import('../../components/settings/Permissions'));
const Widgets           = preloadableLazy(() => import('../../components/settings/Widgets'));
const RatesAndRules     = preloadableLazy(() => import('../../components/settings/RatesAndRules'));
const Constants         = preloadableLazy(() => import('../../components/settings/Constants'));
const SettingsAuditTrail = preloadableLazy(() => import('../../components/settings/AuditTrail'));

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
            onClick={() => window.location.hash = '#/partial-rms/dashboard'}
            className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-black transition-colors"
        >
            Return to Dashboard
        </button>
    </div>
);

const AppContent: React.FC = () => {
  // Initialize Sidebar state based on window width
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const [currentPath, setCurrentPath] = useState(window.location.hash || '#/partial-rms/dashboard');
  
  const { currentUser, setCurrentUser, roles, systemSettings } = useData();

  const handleLogout = async () => {
    localStorage.removeItem('taskme_session_cache');
    supabase.auth.signOut().catch(console.error);
    setCurrentUser(null);
  };

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(window.location.hash || '#/partial-rms/dashboard');
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

  if (!currentUser) {
      const handleAuthLogin = (u: User | StaffProfile | TenantProfile) => {
          setCurrentUser(u as User | StaffProfile | TenantProfile);

          const redirectPath = '#/dashboard';

          window.location.hash = redirectPath;
          setCurrentPath(redirectPath);
      };

      if (currentPath === '#/partial-rms/signup') {
          return <SignUp onLogin={handleAuthLogin} />;
      }
      return <Auth onLogin={handleAuthLogin} />;
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
      if (!currentRoleDef) {
          return false;
      }
      return currentRoleDef.accessibleSubmodules.includes(requiredModulePath);
  };

  const renderContent = () => {
    const path = currentPath;

    // Dashboard
    if (path === '#/partial-rms/' || path === '#/partial-rms/dashboard') {
        // Fallback for role-based home if they manually navigate to root
        const role = currentUser!.role;
        if (role === 'Tenant') return <TenantPortal />;
        if (role === 'Landlord') return <LandlordsPortal />;
        if (role === 'Caretaker') return <CaretakerPortal />;
        if (role === 'Contractor') return <ContractorPortal />;

        return checkAccess('Dashboard/Dashboard') ? <Dashboard /> : <AccessDenied />;
    }
    if (path.startsWith('#/partial-rms/dashboard/stats')) return checkAccess('Dashboard/Quick Stats') ? <QuickStats /> : <AccessDenied />;
    if (path.startsWith('#/partial-rms/dashboard/search')) return checkAccess('Dashboard/Quick Search') ? <QuickSearch /> : <AccessDenied />;

    // Registration
    if (path.startsWith('#/partial-rms/registration')) {
        if (path === '#/partial-rms/registration/overview' && !checkAccess('Registration/Overview')) return <AccessDenied />;
        if (path === '#/partial-rms/registration/users' && !checkAccess('Registration/Users')) return <AccessDenied />;
        if (path === '#/partial-rms/registration/payment-setup' && !checkAccess('Registration/Payment Setup')) return <AccessDenied />;
        if (path === '#/partial-rms/registration/commissions' && !checkAccess('Registration/Commissions')) return <AccessDenied />;
        if (path === '#/partial-rms/registration/geospatial-mapping' && !checkAccess('Registration/Geospatial Mapping')) return <AccessDenied />;
        if (path === '#/partial-rms/registration/properties' && !checkAccess('Registration/Properties')) return <AccessDenied />;

        switch (path) {
            case '#/partial-rms/registration/overview': return <RegistrationOverview />;
            case '#/partial-rms/registration/users': return <Users />;
            case '#/partial-rms/registration/payment-setup': return <PaymentSetup />;
            case '#/partial-rms/registration/commissions': return <Commissions />;
            case '#/partial-rms/registration/geospatial-mapping': return <GeospatialMapping />;
            case '#/partial-rms/registration/properties': return <Properties />;
            default: return checkAccess('Registration/Overview') ? <RegistrationOverview /> : <AccessDenied />;
        }
    }

    // Tenants
    if (path.startsWith('#/partial-rms/tenants')) {
        if (path.startsWith('#/partial-rms/tenants/active-tenants') && !checkAccess('Tenants/Active Tenants')) return <AccessDenied />;
        if (path === '#/partial-rms/tenants/overview' && !checkAccess('Tenants/Overview')) return <AccessDenied />;
        if (path === '#/partial-rms/tenants/applications' && !checkAccess('Tenants/Applications')) return <AccessDenied />;
        if (path === '#/partial-rms/tenants/fines-penalties' && !checkAccess('Tenants/Fines & Penalties')) return <AccessDenied />;
        if (path === '#/partial-rms/tenants/tenant-insights' && !checkAccess('Tenants/Tenant Insights')) return <AccessDenied />;
        if (path === '#/partial-rms/tenants/offboarding' && !checkAccess('Tenants/Offboarding')) return <AccessDenied />;

        if (path.startsWith('#/partial-rms/tenants/active-tenants')) return <ActiveTenants />;
        switch (path) {
            case '#/partial-rms/tenants/overview': return <TenantsOverview />;
            case '#/partial-rms/tenants/applications': return <Applications />;
            case '#/partial-rms/tenants/fines-penalties': return <FinesAndPenalties />;
            case '#/partial-rms/tenants/tenant-insights': return <TenantInsights />;
            case '#/partial-rms/tenants/offboarding': return <Offboarding />;
            default: return checkAccess('Tenants/Overview') ? <TenantsOverview /> : <AccessDenied />;
        }
    }

    // Landlords
    if (path.startsWith('#/partial-rms/landlords')) {
        if (path === '#/partial-rms/landlords/overview' && !checkAccess('Landlords/Overview')) return <AccessDenied />;
        if (path === '#/partial-rms/landlords/applications' && !checkAccess('Landlords/Applications')) return <AccessDenied />;
        if (path.startsWith('#/partial-rms/landlords/active-landlords') && !checkAccess('Landlords/Active Landlords')) return <AccessDenied />;
        if (path === '#/partial-rms/landlords/deductions' && !checkAccess('Landlords/Deductions')) return <AccessDenied />;
        if (path === '#/partial-rms/landlords/offboarding' && !checkAccess('Landlords/Offboarding')) return <AccessDenied />;

        if (path.startsWith('#/partial-rms/landlords/active-landlords')) return <ActiveLandlords />;
        switch (path) {
            case '#/partial-rms/landlords/overview': return <LandlordsOverview />;
            case '#/partial-rms/landlords/applications': return <LandlordApplications />;
            case '#/partial-rms/landlords/active-landlords': return <ActiveLandlords />;
            case '#/partial-rms/landlords/deductions': return <Deductions />;
            case '#/partial-rms/landlords/offboarding': return <LandlordOffboarding />;
            default: return checkAccess('Landlords/Overview') ? <LandlordsOverview /> : <AccessDenied />;
        }
    }

    // Operations
    if (path.startsWith('#/partial-rms/operations')) {
        
        // Maintenance
        if (path.startsWith('#/partial-rms/operations/maintenance')) {
             if (!checkAccess('Operations/Maintenance')) return <AccessDenied />;

             if (path === '#/partial-rms/operations/maintenance') return <MaintenanceOverview />;
             if (path === '#/partial-rms/operations/maintenance/work-orders') return <WorkOrders />;
             if (path === '#/partial-rms/operations/maintenance/request-intake') return <RequestIntake />;
             if (path === '#/partial-rms/operations/maintenance/vendor-management') return <VendorManagement />;
             if (path === '#/partial-rms/operations/maintenance/preventive-maintenance') return <PreventiveMaintenance />;
             if (path === '#/partial-rms/operations/maintenance/cost-tracking') return <CostTracking />;
             if (path === '#/partial-rms/operations/maintenance/quality-control') return <QualityControl />;
             if (path === '#/partial-rms/operations/maintenance/reporting') return <MaintenanceReporting />;
             return <MaintenanceOverview />;
        }

        // Communications
        if (path.startsWith('#/partial-rms/operations/communications')) {
             if (!checkAccess('Operations/Communications')) return <AccessDenied />;
             if (path === '#/partial-rms/operations/communications') return <CommunicationOverview />;
             if (path === '#/partial-rms/operations/communications/inbound') return <Messages folderFilter="Inbox" />;
             if (path === '#/partial-rms/operations/communications/outbound') return <Messages folderFilter="Sent" />;
             if (path === '#/partial-rms/operations/communications/templates') return <Templates />;
             if (path === '#/partial-rms/operations/communications/automation') return <CommunicationAutomation />;
             return <CommunicationOverview />;
        }

        // Leases
        if (path.startsWith('#/partial-rms/operations/leases')) {
            if (!checkAccess('Operations/Leases')) return <AccessDenied />;
            switch (path) {
                case '#/partial-rms/operations/leases': return <LeasesOverview />;
                case '#/partial-rms/operations/leases/active-leases': return <ActiveLeases />;
                case '#/partial-rms/operations/leases/lease-templates': return <LeaseTemplates />;
                case '#/partial-rms/operations/leases/esignature': return <Esignature />;
                case '#/partial-rms/operations/leases/renewals': return <Renewals />;
                case '#/partial-rms/operations/leases/amendments': return <Amendments />;
                case '#/partial-rms/operations/leases/terminations': return <Terminations />;
                case '#/partial-rms/operations/leases/tenants-without-leases': return <TenantsWithoutLeases />;
                case '#/partial-rms/operations/leases/lease-documents': return <LeaseDocuments />;
                case '#/partial-rms/operations/leases/reporting': return <LeasesReporting />;
                default: return <LeasesOverview />;
            }
        }

        // General Ops
        if (path === '#/partial-rms/operations/field-agents' && !checkAccess('Operations/Field Agents')) return <AccessDenied />;
        if (path === '#/partial-rms/operations/affiliates' && !checkAccess('Operations/Affiliates')) return <AccessDenied />;
        if (path === '#/partial-rms/operations/caretakers' && !checkAccess('Operations/Caretakers')) return <AccessDenied />;
        if (path === '#/partial-rms/operations/properties' && !checkAccess('Operations/Properties')) return <AccessDenied />;
        if (path === '#/partial-rms/operations/board' && !checkAccess('Operations/Task Management')) return <AccessDenied />;
        
        switch (path) {
            case '#/partial-rms/operations/overview': return checkAccess('Operations/Task Management') ? <OperationsOverview /> : <AccessDenied />;
            case '#/partial-rms/operations/field-agents': return <FieldAgents />;
            case '#/partial-rms/operations/affiliates': return <Affiliates />;
            case '#/partial-rms/operations/caretakers': return <Caretakers />;
            case '#/partial-rms/operations/properties': return <FieldProperties />;
            case '#/partial-rms/operations/task-management': return <OperationsOverview />;
            case '#/partial-rms/operations/board': return <TaskManagement />;
            case '#/partial-rms/operations/workflows': return <Workflows />;
            case '#/partial-rms/operations/automation': return <Automation />;
            case '#/partial-rms/operations/escalation-rules': return <EscalationRules />;
            case '#/partial-rms/operations/audit-trail': return <AuditTrail />;
            case '#/partial-rms/operations/reporting': return <OperationsReporting />;
            default: return checkAccess('Operations/Field Agents') ? <FieldAgents /> : <AccessDenied />;
        }
    }

    // Payments
    if (path.startsWith('#/partial-rms/payments')) {
        if (path === '#/partial-rms/payments/overview' && !checkAccess('Payments/Overview')) return <AccessDenied />;
        if (path === '#/partial-rms/payments/inbound' && !checkAccess('Payments/Inbound')) return <AccessDenied />;
        if (path === '#/partial-rms/payments/outbound' && !checkAccess('Payments/Outbound')) return <AccessDenied />;
        if (path === '#/partial-rms/payments/invoices' && !checkAccess('Payments/Invoices')) return <AccessDenied />;
        if (path === '#/partial-rms/payments/reconciliation' && !checkAccess('Payments/Reconciliation')) return <AccessDenied />;
        if (path === '#/partial-rms/payments/landlord-payouts' && !checkAccess('Payments/Landlord Payouts')) return <AccessDenied />;
        if (path === '#/partial-rms/payments/overpayments' && !checkAccess('Payments/Overpayments')) return <AccessDenied />;
        if (path === '#/partial-rms/payments/payment-processing' && !checkAccess('Payments/Payment Processing')) return <AccessDenied />;

        switch (path) {
            case '#/partial-rms/payments/overview': return <PaymentsOverview />;
            case '#/partial-rms/payments/inbound': return <Inbound />;
            case '#/partial-rms/payments/outbound': return <Outbound />;
            case '#/partial-rms/payments/invoices': return <Invoices />;
            case '#/partial-rms/payments/reconciliation': return <PaymentReconciliation />;
            case '#/partial-rms/payments/landlord-payouts': return <LandlordPayouts />;
            case '#/partial-rms/payments/overpayments': return <Overpayments />;
            case '#/partial-rms/payments/payment-processing': return <PaymentProcessing />;
            default: return checkAccess('Payments/Overview') ? <PaymentsOverview /> : <AccessDenied />;
        }
    }

    // Accounting
    if (path.startsWith('#/partial-rms/accounting')) {
        if (path === '#/partial-rms/accounting/overview' && !checkAccess('Accounting/Overview')) return <AccessDenied />;
        if (path === '#/partial-rms/accounting/income' && !checkAccess('Accounting/Income')) return <AccessDenied />;
        if (path === '#/partial-rms/accounting/expenses' && !checkAccess('Accounting/Expenses')) return <AccessDenied />;
        if (path === '#/partial-rms/accounting/financial-statements' && !checkAccess('Accounting/Financial Statements')) return <AccessDenied />;
        if (path === '#/partial-rms/accounting/tax-compliance' && !checkAccess('Accounting/Tax Compliance')) return <AccessDenied />;
        if (path === '#/partial-rms/accounting/reconciliation' && !checkAccess('Accounting/Reconciliation')) return <AccessDenied />;
        if (path === '#/partial-rms/accounting/reporting' && !checkAccess('Accounting/Reporting')) return <AccessDenied />;

        switch (path) {
            case '#/partial-rms/accounting/overview': return <AccountingOverview />;
            case '#/partial-rms/accounting/income': return <Income />;
            case '#/partial-rms/accounting/expenses': return <Expenses />;
            case '#/partial-rms/accounting/financial-statements': return <FinancialStatements />;
            case '#/partial-rms/accounting/tax-compliance': return <TaxCompliance />;
            case '#/partial-rms/accounting/reconciliation': return <AccountingReconciliation />;
            case '#/partial-rms/accounting/reporting': return <AccountingReporting />;
            default: return checkAccess('Accounting/Overview') ? <AccountingOverview /> : <AccessDenied />;
        }
    }

    // Analytics & Reports
    if (path.startsWith('#/partial-rms/reports-analytics')) {
        if (path.startsWith('#/partial-rms/reports-analytics/analytics') && !checkAccess('Reports & Analytics/Analytics')) return <AccessDenied />;
        if (path.startsWith('#/partial-rms/reports-analytics/reports') && !checkAccess('Reports & Analytics/Reports')) return <AccessDenied />;

        if (path.startsWith('#/partial-rms/reports-analytics/analytics')) return <AnalyticsOverview />;
        if (path === '#/partial-rms/reports-analytics/reports') return <ReportsOverview />;
        
        if (path.startsWith('#/partial-rms/reports-analytics/reports/tenancy-reports')) return <TenancyReports />;
        if (path.startsWith('#/partial-rms/reports-analytics/reports/property-reports')) return <PropertyReports />;
        if (path.startsWith('#/partial-rms/reports-analytics/reports/financial-reports')) return <FinancialReports />;
        if (path.startsWith('#/partial-rms/reports-analytics/reports/task-operations-reports')) return <TaskAndOperationsReports />;
        if (path.startsWith('#/partial-rms/reports-analytics/reports/compliance-tax-reports')) return <ComplianceAndTaxReports />;
        if (path.startsWith('#/partial-rms/reports-analytics/reports/custom-reports')) return <CustomReports />;
        if (path.startsWith('#/partial-rms/reports-analytics/reports/vacancy-reports')) return <VacancyReports />; // New Route
        if (path.startsWith('#/partial-rms/reports-analytics/reports/house-status-alerts')) return <HouseStatusAlertsReport />;

        return <ReportsOverview />;
    }
    
    // Legacy support
    if (path.startsWith('#/partial-rms/reports')) return checkAccess('Reports & Analytics/Reports') ? <ReportsOverview /> : <AccessDenied />;
    if (path.startsWith('#/partial-rms/analytics')) return checkAccess('Reports & Analytics/Analytics') ? <AnalyticsOverview /> : <AccessDenied />;

    // User App Portal
    if (path.startsWith('#/partial-rms/user-app-portal')) {
        // Access checks are implicitly handled by the Sidebar/Navigation visibility for roles
        // and the role-based redirect on login. 
        // Additional explicit checks here:
        if (path === '#/partial-rms/user-app-portal/tenant-portal' && !checkAccess('User App Portal/Tenant Portal')) return <AccessDenied />;
        if (path === '#/partial-rms/user-app-portal/my-profile' && !checkAccess('User App Portal/My Profile')) return <AccessDenied />;

        // Handle Landlords Portal with sub-routes
        if (path.startsWith('#/partial-rms/user-app-portal/landlords-portal')) {
            if (!checkAccess('User App Portal/Landlords Portal')) return <AccessDenied />;
            return <LandlordsPortal />;
        }

        if (path === '#/partial-rms/user-app-portal/caretaker-portal' && !checkAccess('User App Portal/Caretaker Portal')) return <AccessDenied />;
        if (path === '#/partial-rms/user-app-portal/contractor-portal' && !checkAccess('User App Portal/Contractor Portal')) return <AccessDenied />;
        
        switch (path) {
            case '#/partial-rms/user-app-portal/tenant-portal': return <TenantPortal />;
            // landlords-portal handled above
            case '#/partial-rms/user-app-portal/caretaker-portal': return <CaretakerPortal />;
            case '#/partial-rms/user-app-portal/contractor-portal': return <ContractorPortal />;
            case '#/partial-rms/user-app-portal/my-profile': return <UserProfile />;
            default: return <TenantPortal />;
        }
    }

    // Settings
    if (path.startsWith('#/partial-rms/settings')) {
        if (path === '#/partial-rms/settings/profile' && !checkAccess('Settings/Profile')) return <AccessDenied />;
        if (path === '#/partial-rms/settings/roles' && !checkAccess('Settings/Roles')) return <AccessDenied />;
        if (path === '#/partial-rms/settings/permissions' && !checkAccess('Settings/Permissions')) return <AccessDenied />;
        if (path === '#/partial-rms/settings/widgets' && !checkAccess('Settings/Widgets')) return <AccessDenied />;
        if (path === '#/partial-rms/settings/rates-rules' && !checkAccess('Settings/Rates & Rules')) return <AccessDenied />;
        if (path === '#/partial-rms/settings/constants' && !checkAccess('Settings/Constants')) return <AccessDenied />;
        if (path === '#/partial-rms/settings/audit-trail' && !checkAccess('Settings/Audit Trail')) return <AccessDenied />;

        switch (path) {
            case '#/partial-rms/settings/profile': return <Profile />;
            case '#/partial-rms/settings/roles': return <Roles />;
            case '#/partial-rms/settings/permissions': return <Permissions />;
            case '#/partial-rms/settings/widgets': return <Widgets />;
            case '#/partial-rms/settings/rates-rules': return <RatesAndRules />;
            case '#/partial-rms/settings/constants': return <Constants />;
            case '#/partial-rms/settings/audit-trail': return <SettingsAuditTrail />;
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
                {renderContent()}
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
    return (
        <DataProvider>
            <AppContent />
        </DataProvider>
    );
};

export default App;
