
import { NavItem, QuickStat, GeospatialData, Fund, BoQItem } from './types';

export const AGENT_TARGET_OPTIONS = [
    'Rent Collection', 
    'Occupancy', 
    'Signed Leases', 
    'Task Completion',
    'Inventory Checklists', 
    'Vacant House Locking', 
    'Deposit Collection'
] as const;

export const NAVIGATION_ITEMS: NavItem[] = [
  { name: 'Dashboard', icon: 'dashboard', subModules: ['Dashboard', 'Quick Stats', 'Quick Search'] },
  { name: 'Registration', icon: 'register', subModules: ['Overview', 'Users', 'Payment Setup', 'Commissions', 'Geospatial Mapping', 'Properties'] },
  { name: 'Landlords', icon: 'landlords', subModules: ['Overview', 'Applications', 'Active Landlords', 'Deductions', 'Offboarding'] },
  { name: 'Tenants', icon: 'tenants', subModules: ['Overview', 'Applications', 'Active Tenants', 'Fines & Penalties', 'Tenant Insights', 'Offboarding'] },
  { name: 'Operations', icon: 'operations', subModules: ['Field Agents', 'Affiliates', 'Caretakers', 'Properties', 'Maintenance', 'Task Management', 'Communications', 'Leases'] },
  { name: 'Payments', icon: 'payments', subModules: ['Overview', 'Inbound', 'Outbound', 'Invoices', 'Reconciliation', 'Landlord Payouts', 'Overpayments', 'Payment Processing'] },
  { name: 'Accounting', icon: 'accounting', subModules: ['Overview', 'Income', 'Expenses', 'Financial Statements', 'Tax Compliance', 'Reconciliation', 'Reporting'] },
  { name: 'HR & Payroll', icon: 'hr', subModules: ['Staff Management', 'Payroll Processing', 'Commissions', 'Leave & Attendance', 'Performance', 'Reporting'] },
  { name: 'Reports & Analytics', icon: 'analytics', subModules: ['Reports', 'Analytics'] },
  { name: 'Marketplace', icon: 'marketplace', subModules: ['Listings', 'Leads', 'Affiliates', 'MyFundiHub', 'Referral Program', 'Marketing Banners', 'Reporting'] },
  { name: 'R-Reits', icon: 'reits', subModules: ['Overview', 'Investment Plans', 'Project Accounting', 'Investor Dashboard', 'RF Payments', 'Portfolio Performance', 'Referrals', 'Compliance & KYC'] },
  { name: 'User App Portal', icon: 'user-app', subModules: ['Tenant Portal', 'Agent Portal', 'Landlords Portal', 'Affiliate Portal', 'Investors Portal', 'Caretaker Portal', 'Contractor Portal', 'Referral Landing', 'Refer & Earn', 'My Profile'] },
  { name: 'Settings', icon: 'settings', subModules: ['Profile', 'Roles', 'Permissions', 'Widgets', 'Rates & Rules', 'Constants', 'Audit Trail'] },
];

/**
 * Maps navigation module names to permission module names for checkPermission().
 * This ensures consistent permission checking regardless of UI naming differences.
 */
export const PERMISSION_MODULE_MAPPING: Record<string, string> = {
  'Dashboard': 'Dashboard',
  'Registration': 'Users',
  'Landlords': 'Landlords',
  'Tenants': 'Tenants',
  'Operations': 'Properties',
  'Payments': 'Financials',
  'Accounting': 'Financials',
  'HR & Payroll': 'Users',
  'Reports & Analytics': 'Reports',
  'Marketplace': 'Properties',
  'R-Reits': 'R-Reits',
  'User App Portal': 'Users',
  'Settings': 'Settings',
  // Specific submodule mappings
  'Properties': 'Properties',
  'Maintenance': 'Maintenance',
  'Task Management': 'Maintenance',
  'Communications': 'Properties',
  'Leases': 'Tenants',
  'Inbound': 'Financials',
  'Outbound': 'Financials',
  'Invoices': 'Financials',
  'Reconciliation': 'Financials',
  'Landlord Payouts': 'Financials',
  'Staff Management': 'Users',
  'Payroll Processing': 'Users',
  'Commissions': 'Financials',
  'Leave & Attendance': 'Users',
  'Performance': 'Users',
  'Income': 'Financials',
  'Expenses': 'Financials',
  'Financial Statements': 'Financials',
  'Tax Compliance': 'Financials',
  'Reporting': 'Reports',
};

export const WIDGET_REGISTRY: Record<string, { id: string; name: string }[]> = {
    'Dashboard': [
        { id: 'dash_welcome', name: 'Welcome Banner' },
        { id: 'dash_search', name: 'Search & Filter Bar' },
        { id: 'dash_house_alerts', name: 'House Status Alerts' },
        { id: 'dash_key_stats', name: 'Key Statistics Cards' },
        { id: 'dash_quick_stats', name: 'Quick Stats Grid' },
        { id: 'dash_financial_chart', name: 'Financial Health Chart' },
        { id: 'dash_recent_activity', name: 'Recent Activities' },
        { id: 'dash_upcoming_payments', name: 'Upcoming Payments' },
        { id: 'dash_my_tasks', name: 'My Tasks' }
    ],
    'Registration': [
        { id: 'reg_user_stats', name: 'User Statistics' },
        { id: 'reg_quick_actions', name: 'Quick Actions' }
    ],
    'Tenants': [
        { id: 'ten_kpi', name: 'Tenant KPI Cards' },
        { id: 'ten_status_dist', name: 'Status Distribution Chart' },
        { id: 'ten_lease_struct', name: 'Lease Structure Chart' },
        { id: 'ten_expiring', name: 'Expiring Leases List' },
        { id: 'ten_financials', name: 'Financial Health Shortcut' }
    ],
    'Landlords': [
        { id: 'land_kpi', name: 'KPI Cards' },
        { id: 'land_collection', name: 'Collection Performance Chart' },
        { id: 'land_alerts', name: 'Insight Alerts' },
        { id: 'land_quick_actions', name: 'Quick Actions' }
    ],
    'Operations': [
        { id: 'ops_kpi', name: 'Pending Tasks & Efficiency' },
        { id: 'ops_nav', name: 'Module Navigation Cards' }
    ],
    'Payments': [
        { id: 'pay_kpi', name: 'Collection & Expenses KPIs' },
        { id: 'pay_income_chart', name: 'Income vs Expense Chart' },
        { id: 'pay_methods_chart', name: 'Payment Methods Doughnut' },
        { id: 'pay_recent', name: 'Recent Transactions Table' }
    ],
    'Reports': [
        { id: 'rep_modules', name: 'Report Modules Grid' },
        { id: 'rep_health', name: 'System Health Status' },
        { id: 'rep_insights', name: 'Quick Insights Cards' }
    ]
};

export const QUICK_STATS_DATA: QuickStat[] = [
    { title: "Total Tenants", thisMonth: "1,240", icon: "tenants", color: "blue" },
    { title: "Occupancy Rate", thisMonth: "94%", icon: "vacant-house", color: "green" },
    { title: "Revenue (MTD)", thisMonth: "KES 4.2M", icon: "revenue", color: "green" },
    { title: "Pending Tasks", thisMonth: "12", icon: "operations", color: "red" }
];


// --- UPDATED GEOSPATIAL DATA (KENYAN CONTEXT) ---
export const GEOSPATIAL_DATA: GeospatialData = {
    'Nairobi': { 
        'Westlands': { 
            'Parklands': { 
                'Zone A': ['Highridge', '3rd Parklands'],
                'Zone B': ['Kitsuru', 'Spring Valley'] 
            },
            'Kangemi': {
                'Olympic': ['Village A', 'Village B'],
                'Mountain View': ['Estate 1', 'Estate 2']
            }
        },
        'Kasarani': {
            'Roysambu': {
                'Zimmerman': ['Base', 'Kamiti'],
                'Githurai 44': ['Mokorino', 'Police Post']
            }
        },
        'Kibra': {
            'Woodley': {
                'Jamhuri': ['Estate Phase 1', 'Estate Phase 2'],
                'Kenyatta Golf Course': ['Ngummo']
            }
        }
    },
    'Kisii': { 
        'Kitutu Chache South': { 
            'Township': { 
                'Mwembe': ['Mwembe Tayari', 'Jogoo'],
                'CBD': ['Capital', 'Hospital Rd']
            },
            'Nyanchwa': {
                'Nyanchwa Estate': ['Section A', 'Section B'],
                'Daraja Mbili': ['Market Area']
            }
        },
        'Nyaribari Chache': {
            'Central': {
                'Kisii Town': ['Main Stage', 'Stadium']
            }
        }
    },
    'Kericho': { 
        'Ainamoi': { 
            'Township': { 
                'CBD': ['Temple Road', 'Uhuru Gardens'],
                'Majengo': ['Area 1', 'Area 2']
            },
            'Kipchimchim': {
                'Kipchimchim': ['Market', 'School']
            }
        } 
    },
    'Mombasa': {
        'Nyali': {
            'Nyali': {
                'Beach Road': ['Links Rd', 'Moyne Dr'],
                'Kongowea': ['Karama', 'Uwanja wa Ndege']
            }
        },
        'Likoni': {
            'Likoni': {
                'Shelly Beach': ['Timbwani'],
                'Mtongwe': ['Ferry']
            }
        }
    },
    'Nakuru': {
        'Nakuru Town East': {
            'CBD': {
                'Bondeni': ['Section 58', 'Kaptembwa'],
                'Milimani': ['State House Rd']
            }
        },
        'Naivasha': {
            'Viwandani': {
                'Town': ['Area 1'],
                'Industrial': ['Plant']
            }
        }
    },
    'Kiambu': {
        'Thika': {
            'Township': {
                'Section 9': ['A', 'B'],
                'Makongeni': ['Phase 1']
            }
        },
        'Ruiru': {
            'Biashara': {
                'Kimbo': ['Matangi'],
                'Githurai 45': ['Progress']
            }
        }
    }
};


export const INITIAL_FUNDS: Fund[] = [
    {
        id: 'fund-1',
        name: 'Urban Renewal Fund I',
        description: 'Financing the modern renovation of 20 residential units in Nairobi West to increase rental yield.',
        targetApy: '30%',
        capitalRaised: 12500000,
        targetCapital: 20000000,
        investors: 45,
        status: 'Active',
        riskProfile: 'Medium',
        projectedCompletion: 'Dec 2026',
        landlordType: 'Internal',
        landlordName: 'Peter Owner',
        propertyType: 'Residential',
        clientInterestRate: 5.0,
        projectPic: 'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', // Modern Villa/Apartment
        boq: [
            { id: 'bq1', description: 'Paint Work', unit: 'SqM', quantity: 500, rate: 450, amount: 225000 },
            { id: 'bq2', description: 'Tiling', unit: 'SqM', quantity: 200, rate: 1200, amount: 240000 }
        ],
        progressUpdates: [
             { id: 'pu-1', date: '2025-10-15', imageUrl: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80', caption: 'Site clearing and initial prep' },
             { id: 'pu-2', date: '2025-11-01', imageUrl: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?ixlib=rb-4.0.3&auto=format&fit=crop&w=200&q=80', caption: 'Foundation reinforcement complete' }
        ]
    },
    {
        id: 'fund-2',
        name: 'Riverside Expansion',
        description: 'Adding a new wing to the Riverside commercial complex, increasing retail space by 40%.',
        targetApy: '30%',
        capitalRaised: 45000000,
        targetCapital: 50000000,
        investors: 120,
        status: 'Closing Soon',
        riskProfile: 'Low',
        projectedCompletion: 'Jun 2026',
        landlordType: 'External',
        landlordName: 'Riverside Holdings',
        propertyType: 'Commercial',
        clientInterestRate: 5.0,
        projectPic: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', // Commercial Building
        boq: []
    },
    {
        id: 'fund-3',
        name: 'Sunset Plaza Facelift',
        description: 'Complete exterior and interior renovation of the iconic Sunset Plaza to attract premium tenants.',
        targetApy: '30%',
        capitalRaised: 5000000,
        targetCapital: 15000000,
        investors: 25,
        status: 'Active',
        riskProfile: 'Medium',
        projectedCompletion: 'Aug 2026',
        landlordType: 'Internal',
        landlordName: 'Sunset Group',
        propertyType: 'Commercial',
        clientInterestRate: 5.0,
        projectPic: 'https://images.unsplash.com/photo-1554995207-c18c203602cb?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', // Modern Plaza Interior/Exterior
        boq: []
    },
    {
        id: 'fund-4',
        name: 'Green Heights Commercial',
        description: 'Conversion of mixed-use block into high-end office suites with modern amenities.',
        targetApy: '30%',
        capitalRaised: 8000000,
        targetCapital: 30000000,
        investors: 60,
        status: 'Active',
        riskProfile: 'High',
        projectedCompletion: 'Feb 2027',
        landlordType: 'External',
        landlordName: 'Green Heights Ltd',
        propertyType: 'Commercial',
        clientInterestRate: 5.0,
        projectPic: 'https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', // Modern Office Building
        boq: []
    },
    {
        id: 'fund-5',
        name: 'Lakeside Villas Renovation',
        description: 'Restoration of 5 luxury lakefront villas for high-yield holiday rentals.',
        targetApy: '30%',
        capitalRaised: 2000000,
        targetCapital: 25000000,
        investors: 10,
        status: 'Active',
        riskProfile: 'Medium',
        projectedCompletion: 'Nov 2026',
        landlordType: 'External',
        landlordName: 'Lakeview Resorts',
        propertyType: 'Residential',
        clientInterestRate: 5.0,
        projectPic: 'https://images.unsplash.com/photo-1613490493576-2f5037657918?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', // Luxury Villa
        boq: []
    },
    {
        id: 'fund-closed-1',
        name: 'Highland Mall Expansion',
        description: 'Successful addition of 3rd floor retail space.',
        targetApy: '28%',
        capitalRaised: 60000000,
        targetCapital: 60000000,
        investors: 150,
        status: 'Project Completed',
        riskProfile: 'Low',
        projectedCompletion: 'Jan 2025',
        landlordType: 'Internal',
        landlordName: 'Highland Properties',
        propertyType: 'Commercial',
        clientInterestRate: 5.0,
        projectPic: 'https://images.unsplash.com/photo-1519567241046-7f570eee3c9e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', // Completed Mall
        boq: []
    }
];

