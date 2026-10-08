
import { Dispatch, ReactNode, SetStateAction } from 'react';

export interface NavItem {
  name: string;
  icon: string;
  subModules: string[];
}

export interface QuickStat {
  title: string;
  thisMonth: string;
  icon: string;
  color: string;
  today?: string;
  thisWeek?: string;
  reportUrl?: string;
}

export interface RecentActivity {
  category: string;
  description: string;
  time: string;
  color: string;
  link?: string;
}

export interface UpcomingPayment {
  id: string;
  name: string;
  unit: string;
  amount: string;
  dueDate: string;
  status: 'Overdue' | 'Due Soon';
}

export const TaskStatus = {
  Issued: 'Issued',
  InProgress: 'In Progress',
  Pending: 'Pending',
  Completed: 'Completed',
  Closed: 'Closed',
  Escalated: 'Escalated',
  Received: 'Received'
} as const;

export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus];

export const TaskPriority = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
  VeryHigh: 'Very High'
} as const;

export type TaskPriority = typeof TaskPriority[keyof typeof TaskPriority];

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  sla?: number;
  assignedTo?: string;
  tenant: { name: string; unit: string };
  property: string;
  comments?: Array<{ user: string; text: string; date: string }>;
  history: Array<{ id: string; timestamp: string; event: string }>;
  attachments?: string[];
  source?: 'Internal' | 'External' | 'Preventive';
  costs?: { labor: number; materials: number; travel: number };
  completionAttachments?: string[];
  paymentMethod?: 'LandlordDirect' | 'AgencyPaysInvoice';
  landlordApproval?: 'Pending' | 'Approved' | 'Rejected' | 'N/A';
  visibleToLandlord?: boolean;
}

export type TenantStatus =
  | 'PendingApproval'
  | 'PendingAllocation'
  | 'PendingPayment'
  | 'Active'
  | 'Overdue'
  | 'Notice'
  | 'Vacated'
  | 'Evicted'
  | 'Blacklisted'
  | 'Inactive'
  /** Legacy — backfilled to PendingAllocation or PendingPayment. Still accepted for compatibility. */
  | 'Pending';

export type TenantOnboardingType = 'New' | 'Existing';

/** Lease term presets available on the application Property & Rent tab. */
export type LeaseTermType = 'MonthToMonth' | 'Quarterly' | 'SemiAnnual' | 'Yearly' | 'Manual';

/** Months represented by each fixed lease term preset. */
export const LEASE_TERM_MONTHS: Record<Exclude<LeaseTermType, 'Manual'>, number> = {
  MonthToMonth: 1,
  Quarterly: 3,
  SemiAnnual: 6,
  Yearly: 12,
};

export const LEASE_TERM_LABELS: Record<LeaseTermType, string> = {
  MonthToMonth: 'Month by Month',
  Quarterly: 'Quarterly (3 months)',
  SemiAnnual: '6 Months',
  Yearly: 'Yearly (12 months)',
  Manual: 'Manual (specify duration)',
};


export interface ExistingTenantRentLedgerItem {
  period: string;
  expected: number;
  paid: number;
  /** Optional specific date the historical rent was paid (YYYY-MM-DD). Falls back to period+rentDueDate when blank. */
  paidDate?: string;
}

export interface ExistingTenantFineLedgerItem {
  date: string;
  type: string;
  amount: number;
  status: 'Pending' | 'Paid';
}

export interface ExistingTenantSetup {
  occupancyStartDate: string;
  depositAlreadyPaid: number;
  /** Specific date the deposit was paid (YYYY-MM-DD). Defaults to occupancyStartDate when omitted. */
  depositPaidDate?: string;
  rentLedger: ExistingTenantRentLedgerItem[];
  fineLedger: ExistingTenantFineLedgerItem[];
}

export interface TenantProfile {
  id: string;
  name: string;
  username?: string;
  email: string;
  phone: string;
  /** Optional alternative contact number. */
  alternativePhone?: string;
  /** Next of kin fields — all optional. */
  nextOfKinName?: string;
  nextOfKinPhone?: string;
  nextOfKinRelationship?: 'Spouse' | 'Parent' | 'Sibling' | 'Child' | 'Other' | string;
  /** KYC: tenant's profession / line of work (e.g. "Software Engineer"). */
  profession?: string;
  /** KYC: tenant's workplace / employer name. */
  workplace?: string;
  idNumber: string;
  status: TenantStatus;
  propertyId?: string;
  propertyName?: string;
  unitId?: string;
  unit: string;
  rentAmount: number;
  /** Rent due on this day of month (1–28). Default 1. */
  rentDueDate?: number;
  /** Grace days after due day before late fees accrue. Default 5 (due 1 + 5 → fines from day 6). */
  rentGraceDays?: number;
  depositPaid?: number;
  /** Total deposit expected from this tenant (rent × depositMonths, or the
   *  sum of prorated installments). Used by the deposit card to compute
   *  the remaining deposit balance. */
  depositExpected?: number;
  /** ISO date the tenant first reached Active status. Used to gate late-fee
   *  accrual (fees start 6th of the month AFTER this date's month). */
  activationDate?: string;
  /** Prorated rent for the first (join) month only. Set at approval when the
   *  tenant's join day is 10 or later; absent/zero means full rent from day 1. */
  firstMonthRent?: number;
  /** Next rent due date derived from successful payments. */
  nextDueDate?: string;
  rentStartDate?: string;
  onboardingDate: string;
  /** Carried from application docs flow (signed checkbox + uploaded signed lease). */
  leaseSigned?: boolean;
  /** Lease start date (defaults to signing date unless edited). */
  leaseStartDate?: string;
  leaseEnd?: string;
  leaseType?: 'Fixed' | 'Open';
  /** Lease term selection: month-to-month, quarterly, 6 months, yearly or a manual term. */
  leaseTermType?: LeaseTermType;
  /** Resolved lease length in months (1 = month to month). Drives leaseEnd. */
  leaseTermMonths?: number;

  paymentHistory: {
    date: string;
    amount: string;
    status: 'Paid' | 'Pending' | 'Failed';
    method: string;
    reference: string;
    day?: number; // Derived often
    /** For multi-occupancy payments made through the Main account, records which billing month(s) this receipt clears on the Sub unit. */
    allocationLines?: { monthIso: string; amount: number; kind?: string }[];
  }[];
  outstandingBills: BillItem[];
  outstandingFines: FineItem[];
  /** ISO YYYY-MM months for which the automated late fee has been waived by a super admin. */
  waivedLateFeeMonths?: string[];
  maintenanceRequests: string[]; // IDs
  notes?: string[];
  notices?: Notice[];
  requests?: TenantRequest[];
  dateRegistered?: string;
  houseStatus?: string[];
  collectionHistory?: CollectionLog[];
  recurringBills?: RecurringBillSettings;
  /**
   * Tracks how much has been paid against each recurring bill key for the
   * current billing month (ISO YYYY-MM). Reset to {} at the start of each
   * new period. Keys mirror RecurringBillSettings (e.g. 'garbage', 'waterFixed').
   * Used to derive per-row Paid / Partial / Unpaid badges in the Balance Overview.
   */
  recurringBillsPaidThisMonth?: {
    period: string; // ISO YYYY-MM
    amounts: Partial<Record<keyof RecurringBillSettings, number>>;
  };
  avatar?: string;
  profilePicture?: string; // Alias for avatar sometimes used
  kraPin?: string;
  arrears?: number;
  role?: string; // Optional for unification
  passwordHash?: string;
  referrerId?: string; // ID of who referred this tenant
  referralCode?: string;
  referralConfig?: {
      rateType: '%' | 'KES';
      rateValue: number;
  };
  tenantOnboardingType?: TenantOnboardingType;
  existingTenantSetup?: ExistingTenantSetup;
  /** When set, used for M-Pesa ledger (auth.users.id). Falls back to `id` if it looks like a UUID. */
  authUserId?: string;

  // ── Multi-Occupancy ──────────────────────────────────────────────────────
  /**
   * Multi-occupancy support: a single payer can hold multiple units. One
   * tenant row is marked `Main`; the others are `Sub` and reference the
   * Main via `mainTenantId`. Single tenants leave both fields undefined
   * (or `occupancyType: 'Single'`) and take the existing code paths.
   */
  occupancyType?: 'Single' | 'Main' | 'Sub';
  /** Set on `Sub` rows — points to the Main tenant id. */
  mainTenantId?: string;

  // ── Deposit special-case fields ──────────────────────────────────────────
  /** When true, tenant pays rent only — no deposit collected. */
  depositExempt?: boolean;
  /** ISO date when an admin restored a previously waived deposit. Used to
   *  flag restored deposits in the UI and to ensure pre-restore payments
   *  do not retroactively cover the freshly-restored deposit. */
  depositRestoredAt?: string;
  /**
   * Number of deposit months required (default 1).
   * Mutually exclusive with proratedDeposit.
   * depositPaid = rentAmount × depositMonths when multi-month.
   */
  depositMonths?: number;
  /**
   * Prorated deposit: tenant pays deposit in monthly installments alongside rent.
   * Mutually exclusive with depositMonths > 1.
   */
  proratedDeposit?: {
    enabled: boolean;
    totalDepositAmount: number;
    monthlyInstallment: number;
    durationMonths: number;
    monthsPaid: number;
    amountPaidSoFar: number;
  };
  /**
   * Rent extension: tenant pays deposit upfront; first rent is deferred to a
   * specific date (no grace period after that date; subsequent rent follows
   * the standard 1st-of-month schedule).
   */
  rentExtension?: {
    enabled: boolean;
    /** ISO date: rent is due on this date; no grace period applies. */
    rentDeferredUntil: string;
    depositPaidUpfront: number;
    /** Stored to restore after the extension period ends. */
    originalGraceDays?: number;
  };
  // ── Utility deposit fields ──────────────────────────────────────────────
  /** Water connection deposit — one-time, refundable. */
  waterDeposit?: { required: boolean; exempt: boolean; amount: number; paid: number };
  /** Electricity connection deposit — one-time, refundable. */
  electricityDeposit?: { required: boolean; exempt: boolean; amount: number; paid: number };

  // ── Temporary (third-party) tenant ────────────────────────────────────
  /**
   * True for tenants registered against a third-party Marketplace listing.
   * These do NOT have a managed Property/Unit; their payments are routed
   * via the listing's `paymentTag`. Can later be promoted to a full tenant
   * when the property owner onboards with the agency.
   */
  isTemporary?: boolean;
  /** When isTemporary, ID of the MarketplaceListing this tenant pays into. */
  thirdPartyListingId?: string;
  /** Custom source label for reporting (e.g. 'ThirdParty'). */
  tenantSource?: 'Managed' | 'ThirdParty';
}

export interface Property {
  id: string;
  name: string;
  type: string; // Residential, Commercial, Mixed-Use
  ownership: string; // In-house, Affiliate
  branch: string;
  status: 'Active' | 'Suspended' | 'Decommissioned';
  landlordId: string;
  assignedAgentId?: string;
  location?: string;
  defaultMonthlyRent?: number;
  floors?: number;
  units: Unit[];
  assets?: PropertyAsset[];
  defaultUnitType?: string;
  rentIsUniform?: boolean;
  rentType?: 'Inclusive' | 'Exclusive';
  deposit?: { required: boolean; months: number };
  /** Utility deposits collected once at tenancy start (separate from monthly bills). */
  utilityDeposit?: {
    water?: { required: boolean; amount: number };
    electricity?: { required: boolean; amount: number };
  };
  placementFee?: boolean; // If true, agency collects a placement fee on new tenants
  /**
   * Controls how the placement fee is computed when `placementFee` is true:
   *   'FirstMonthRent'         – Entire first month rent goes to agency (default, legacy behaviour).
   *   'Flat'                   – Fixed KES amount set in `placementFeeFlat`.
   *   'PercentOfFirstMonth'    – `placementFeePercent` % of first month rent.
   */
  placementFeeMode?: 'FirstMonthRent' | 'Flat' | 'PercentOfFirstMonth';
  placementFeeFlat?: number;
  placementFeePercent?: number;
  /**
   * managementType controls the financial flow for this property:
   *   'Full'    – Agency collects rent, deducts fees, remits net to landlord (default).
   *   'Partial' – Landlord collects rent via their own paybill; agency invoices the
   *               landlord end-of-month for placement fee + management fee + bills/maintenance.
   * Defaults to 'Full' when absent (backward-compatible).
   */
  managementType?: 'Full' | 'Partial';
  /** M-Pesa paybill/till for the landlord. Required when managementType = 'Partial'. */
  landlordPaybill?: string;
  collectionSplit?: {
    type:
      | 'LANDLORD_RENT_ONLY'
      | 'LANDLORD_RENT_BILLS_DEPOSIT_MAINTENANCE'
      | 'LANDLORD_ALL_REVENUE_AGENT_INVOICES'
      | 'Rent+Deposit+Bills (Landlord)'
      | 'Rent+Bills (Landlord) | Deposit (Agency)'
      | 'Rent (Landlord) | Deposit+Bills (Agency)';
    placementFeeTo: 'Agency' | 'Landlord';
  };
  /**
   * Per-property agency commission. When `agencyCommissionType` is 'flat',
   * `agencyCommissionFlat` is a fixed KES amount per period. Otherwise
   * `agencyCommissionPercent` (e.g. 10 = 10%) applies to collected rent.
   * Overrides the global 'Rent Collection' CommissionRule.
   */
  agencyCommissionType?: 'percent' | 'flat';
  agencyCommissionPercent?: number;
  agencyCommissionFlat?: number;
  bills?: {
      [key: string]: { applicable: boolean; amount: number };
  };
  remittanceType?: 'Collection Based' | 'Occupancy Based';
  remittanceCutoffDay?: number;
  nearestLandmark?: string;
  county?: string;
  subCounty?: string;
  zone?: string;
  subLocation?: string;
  /** Google Maps share link / pin URL (coordinates, plus code, or map link). */
  pinLocationUrl?: string;
  /** Public listing URL on the website (e.g. https://task-me.ke/properties/baraka-heights). Used for share links. */
  websiteListingUrl?: string;
  profilePictureUrl?: string;
  rentByType?: Record<string, number>;
  floorplan?: FloorPlan[];
  /** Monthly Rental Income Tax rate for residential (e.g. 7.5 = 7.5%). */
  monthlyRentalIncomeTaxPercent?: number;
  /** VAT rate for commercial (e.g. 16 = 16%). */
  commercialVatPercent?: number;
}

export interface Unit {
  id: string;
  unitNumber: string;
  floor: number;
  bedrooms: number;
  bathrooms: number;
  status: 'Vacant' | 'Occupied' | 'Under Maintenance' | 'Reserved' | 'Distressed' | 'Unhabitable' | 'Landlords residence';
  rent?: number;
  unitType?: string;
  amenities?: string[];
  isLocked?: boolean; // New: For tracking 'Vacant Locked' KPI
  /**
   * Indicates a landlord's residence which coexists with or acts as a primary status.
   */
  landlordResidence?: boolean;
  /**
   * Indicates a caretaker has been assigned to oversee this unit.
   * This is an ADDITIONAL flag that can coexist with any primary
   * status (Vacant, Under Maintenance, Distressed, Unhabitable, etc.)
   * and is shown as a chip alongside the main status.
   */
  caretakerAssigned?: boolean;
  caretakerName?: string;
  /**
   * Indicates this (vacant) unit is currently being used as a storage
   * room / store. Additive flag — coexists with the primary status
   * (Vacant, Under Maintenance, Distressed, Unhabitable) and the
   * caretakerAssigned flag.
   */
  usedAsStore?: boolean;
  /**
   * Human-typable account reference printed on invoices and shown to the
   * tenant. At the M-Pesa Paybill prompt the customer enters this exact
   * string as the account number (BillRefNumber). Must be unique across
   * the organisation so the C2B confirmation handler can match a payment
   * back to a specific unit → tenant. Example: "MSK/05".
   */
  unitTag?: string;
}

export interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  phone: string;
  idNumber: string;
  kraPin?: string;
  role: UserRole | string;
  status: 'Active' | 'Inactive' | 'Suspended';
  joinDate?: string;
  branch?: string;
  avatarUrl?: string;
  passwordHash?: string;
  referrerId?: string;
  referralCode?: string;
  source?: string;
  contractPeriod?: number;
  /** Management contract start date (ISO). Drives referral commission accrual window. */
  contractStartDate?: string;
  referralConfig?: {
      rateType: '%' | 'KES';
      rateValue: number;
  };
  managementType?: 'Full RMS' | 'Partial RMS';
  mpesaConfig?: {
      shortcode: string;
      passkey: string;
      consumerKey: string;
      consumerSecret: string;
  };
  appScope?: 'Full' | 'Partial' | 'Both';
  settledPeriods?: string[];
  payment_config?: {
      mpesaPaybill: string;
      mpesaConsumerKey?: string;
      mpesaConsumerSecret?: string;
      mpesaPasskey?: string;
      mpesaEnvironment?: string;
      payoutBank?: string;
      payoutBankAccount?: string;
  };
}

export type UserRole = 'Super Admin' | 'Branch Manager' | 'Field Agent' | 'Accountant' | 'Caretaker' | 'Landlord' | 'Tenant' | 'Contractor' | 'Fundi' | 'Affiliate' | 'Investor';

export interface Quotation {
  id: string;
  taskId: string;
  contractorName: string;
  totalAmount: number;
  items: QuotationItem[];
  status: 'Pending' | 'Approved' | 'Rejected';
  notes?: string;
  submittedDate: string;
}

export interface QuotationItem {
  description: string;
  amount: number;
  type: 'Labor' | 'Materials' | 'Travel';
}

export interface TenantApplication {
  id: string;
  name: string;
  phone: string;
  email: string;
  idNumber?: string;
  kraPin?: string;
  property?: string; // Legacy/Display
  propertyId?: string;
  propertyName?: string;
  unit?: string; // Legacy/Display
  unitId?: string;
  status: 'New' | 'Under Review' | 'Approved' | 'Rejected';
  submittedDate: string;
  source?: string;
  rentStartDate?: string;
  rentAmount?: number;
  /** Carried to TenantProfile when approved/converted. */
  rentDueDate?: number;
  rentGraceDays?: number;
  depositPaid?: number;
  /** When true, a signed lease document must be uploaded. */
  leaseSigned?: boolean;
  /** Lease start date (defaults to signing date unless edited). */
  leaseStartDate?: string;
  /** Lease expiry date (defaults to 1 year after lease start unless edited). */
  leaseEnd?: string;
  /** Lease term selection carried to the tenant profile on approval. */
  leaseTermType?: LeaseTermType;
  /** Resolved lease length in months (1 = month to month). */
  leaseTermMonths?: number;

  /** When set, links this application to an auth.users user for STK payment polling. */
  authUserId?: string;
  documents?: Array<{ name: string; type: string; url: string }>;
  recurringBills?: RecurringBillSettings;
  avatar?: string;
  profilePicture?: string;
  tenantOnboardingType?: TenantOnboardingType;
  existingTenantSetup?: ExistingTenantSetup;
  referrerId?: string;
  /** The referral code belonging to the referrer. Stored alongside referrerId so
   *  resolveReferralCode can fall back to it if referrerId is absent. */
  referralCode?: string;
  /** The unit the referrer specifically directed this applicant to.
   *  Preserved even if a different unit is allocated at approval time,
   *  ensuring the referrer still earns commission on the signed lease. */
  referredUnitId?: string;
  
  // ── Multi-Occupancy & Next of Kin fields ─────────────────────────────────
  occupancyType?: 'Single' | 'Main' | 'Sub';
  mainTenantId?: string;
  _subUnitDrafts?: Array<{
    unitId: string;
    rentAmount: number;
    depositExpected: number;
    recurringBills?: RecurringBillSettings;
  }>;
  alternativePhone?: string;
  nextOfKinName?: string;
  nextOfKinPhone?: string;
  nextOfKinRelationship?: 'Spouse' | 'Parent' | 'Sibling' | 'Child' | 'Other' | string;

  // ── Deposit special-case fields (carried to TenantProfile on approval) ───
  depositExempt?: boolean;
  depositMonths?: number;
  proratedDeposit?: {
    enabled: boolean;
    totalDepositAmount: number;
    monthlyInstallment: number;
    durationMonths: number;
    monthsPaid: number;
    amountPaidSoFar: number;
  };
  rentExtension?: {
    enabled: boolean;
    rentDeferredUntil: string;
    depositPaidUpfront: number;
    originalGraceDays?: number;
  };
  // ── Utility deposit fields (carried to TenantProfile on approval) ────────
  waterDeposit?: { required: boolean; exempt: boolean; amount: number; paid: number };
  electricityDeposit?: { required: boolean; exempt: boolean; amount: number; paid: number };
}

export interface LandlordApplication {
  id: string;
  name: string;
  email: string;
  phone?: string;
  idNumber?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  date: string;
  proposedProperties: string[];
  notes?: string;
  location?: string;
  /** Primary use of the proposed property. */
  propertyUsageType?: 'Residential' | 'Commercial' | 'Mixed Use' | 'Airbnb';
  /** Building / structure type. */
  buildingType?: 'Standalone' | 'Apartment' | 'Single Unit' | 'Bungalow' | 'Maisonette' | 'Gated Community' | 'Other';
  propertyIds?: string[];
  referrerId?: string;
  referralCode?: string;
  source?: string;
  contractPeriod?: number; // in months
  paymentConfig?: {
      method: string;
      details: any;
  };
}

export interface LandlordOffboardingRecord {
  id: string;
  landlordId: string;
  landlordName: string;
  propertyCount: number;
  reason: string;
  status: 'Notice Served' | 'Handover in Progress' | 'Accounts Settled' | 'Contract Terminated';
  terminationDate: string;
  checklist?: {
    tenantsNotified: boolean;
    legalNoticeDelivered: boolean;
    keysHandedOver: boolean;
    utilityTransferInitiated: boolean;
  };
  financials?: {
    finalGrossRent: number;
    outstandingRepairs: number;
    legalFees: number;
    retainerRefund: number;
    netPayout: number;
  };
  documents?: Array<{ name: string; date: string }>;
}

export type BusinessUnit = 'Management' | 'Administration' | 'Security' | 'Rental Management' | 'R-Reits' | 'Cleaning' | 'Maintenance';
export type SalaryType = 'Monthly' | 'Target Based' | 'Commission' | 'Per Project';
export type LeaveType = 'Annual' | 'Sick' | 'Maternity' | 'Paternity' | 'Emergency' | 'Unpaid';
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected';

export interface LeaveRequest {
  id: string;
  staffId: string;
  staffName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  requestedDate: string;
  approvedBy?: string;
  notes?: string;
}

export interface StaffProfile {
  id: string;
  name: string;
  username?: string;
  role: UserRole;
  email: string;
  phone: string;
  branch: string;
  status: 'Active' | 'On Leave' | 'Terminated';
  avatar?: string;
  department?: BusinessUnit | string;
  salaryConfig?: {
      type: SalaryType;
      amount: number;
      commissionRate?: number;
      activeTargets?: string[]; // New: List of enabled KPIs for Target Based salary
  };
  bankDetails?: {
      bankName?: string;
      accountNumber?: string;
      kraPin?: string;
      defaultMethod: 'Bank' | 'M-Pesa';
      mpesaNumber?: string;
  };
  payrollInfo: {
      baseSalary: number;
      nextPaymentDate: string;
  };
  leaveBalance: {
      annual: number;
  };
  commissions?: Array<{ date: string; amount: number; source: string }>;
  deductions?: StaffDeduction[];
  attendanceRecord?: Record<string, number[]>; // YYYY-MM -> array of absent days
  leaveRequests?: LeaveRequest[];
  businessUnitAssignment?: string;
  passwordHash?: string;
  assignedPropertyId?: string;
  referralCode?: string;
  referralConfig?: {
      rateType: '%' | 'KES';
      rateValue: number;
  };
  appScope?: 'Full' | 'Partial' | 'Both';
}

export interface StaffDeduction {
  id: string;
  name: string;
  amount: number;
  type: 'Recurring' | 'One-Off';
  category: 'Sacco' | 'Chama' | 'Fine' | 'Lost Item' | 'Other';
  dateAdded: string;
}

export interface FineRule {
  id: string;
  type: string;
  basis: 'Fixed Fee' | 'Percentage' | 'Fixed Daily' | 'Percentage of Rent' | 'Percentage of Arrears';
  value: number;
  description: string;
  appliesTo: string;
  /** 'ALL' or a property id — restricts a rule to a specific property. Defaults to 'ALL'. */
  propertyId?: string;
  /** Grace days before the fine starts accruing (Late Fee rules only). */
  graceDays?: number;
  /** Optional cap on total fine. */
  capType?: 'none' | 'fixed' | 'percent_rent';
  capValue?: number;
  active?: boolean;
}

export interface OffboardingRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  unit: string;
  noticeDate: string;
  moveOutDate: string;
  status: 'Notice Given' | 'Inspection Pending' | 'Completed' | 'Cancelled';
  inspectionStatus: 'Pending' | 'Passed' | 'Failed';
  utilityClearance: boolean;
  depositRefunded: boolean;
  keysReturned: boolean;
  finalBillAmount?: number;
  propertyId?: string;
  securityDepositForfeited?: boolean;
  /** True when management and tenant mutually agreed to waive the 30-day notice period. */
  negotiated?: boolean;
}

export interface GeospatialData {
  [county: string]: {
      [subCounty: string]: {
          [location: string]: {
              [zone: string]: string[]; // villages/sub-locations
          }
      }
  };
}

export type CommissionTrigger = 'Rent Collection' | 'Tenancy Referral' | 'Property Management Referral' | 'Property Sale';

export interface CommissionRule {
  id: string;
  trigger: CommissionTrigger;
  rateType: '%' | 'KES';
  rateValue: number;
  description: string;
  appliesTo: string;
  deadlineDay?: number;
}

export interface DeductionRule {
  id: string;
  name: string;
  type: 'Percentage' | 'Fixed';
  value: number;
  frequency: 'Monthly' | 'Yearly' | 'One-Off';
  applicability: 'Global' | 'Specific Landlord' | 'Specific Property';
  targetId?: string;
  status: 'Active' | 'Inactive';
  description?: string;
  date?: string; // e.g. YYYY-MM
}

export interface Bill {
  id: string;
  vendor: string;
  category: string;
  amount: number;
  invoiceDate: string;
  dueDate: string;
  status: 'Paid' | 'Unpaid' | 'Overdue' | 'Initiated' | 'Under Review';
  propertyId: string;
  description?: string;
  metadata?: any;
}

export interface BillItem {
  id: string;
  type: string;
  amount: number;
  originalAmount?: number;
  date: string;
  status: 'Pending' | 'Paid';
  description?: string;
  meterReadings?: {
      previous: number;
      current: number;
      units: number;
      rate: number;
      period: string;
  };
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  category: 'Inbound' | 'Outbound';
  tenantName: string; // Or Recipient/Vendor
  unit?: string;
  amount: number;
  dueDate: string;
  status: 'Due' | 'Paid' | 'Overdue';
  items?: Array<{ description: string; amount: number; quantity?: number; unitPrice?: number }>;
  email?: string;
  phone?: string;
  billingAddress?: string;
  attachmentUrl?: string;
}

export interface Vendor {
  id: string;
  name: string;
  username?: string;
  specialty: string;
  rating: number;
  email?: string;
  phone?: string;
  referralCode?: string;
  passwordHash?: string;
  // Fundi Hub specific fields
  location?: string;
  dailyRate?: number;
  verified?: boolean;
  completedJobs?: number;
  avatarUrl?: string;
  summary?: string;
  certifications?: string[];
  eta?: string;
  available?: boolean;
  portfolioImages?: string[]; // Added portfolio images
  // Discriminator between Contractor and Fundi (both stored as Vendor records).
  userRole?: 'Contractor' | 'Fundi';
  appScope?: 'Full' | 'Partial' | 'Both';
}

export interface FundiJob {
    id: string;
    fundiId: string;
    fundiName: string;
    clientName: string;
    clientPhone: string;
    location: string;
    description: string;
    status: 'Pending' | 'Accepted' | 'Completed' | 'Declined';
    date: string;
    amount?: number;
    source: 'Website' | 'App';
}

export interface Message {
  id: string;
  recipient: { name: string; contact: string };
  content: string;
  channel: 'SMS' | 'Email' | 'WhatsApp' | 'App';
  status: 'Sent' | 'Delivered' | 'Read' | 'Failed';
  timestamp: string;
  priority: 'Normal' | 'High';
  isIncoming?: boolean;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  type: 'Success' | 'Warning' | 'Alert' | 'Info';
  recipientRole: string;
}

export interface CommunicationTemplate {
  id: string;
  name: string;
  type: 'SMS' | 'Email' | 'WhatsApp' | 'App';
  content: string;
  /** When false the scheduled-rent-reminders job skips this template entirely (no queueing). Defaults to true. */
  enabled?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  trigger: string;
  steps: string[];
}

export interface CommunicationAutomationRule {
  id: string;
  name: string;
  trigger: string;
  templateName: string;
  channels: string[];
  enabled: boolean;
  /** Message body sent when the rule fires. Supports tokens like {{tenant_name}}, {{amount}}, {{due_date}}. */
  message?: string;
  /** Days offset relative to the trigger event (negative = before, positive = after). */
  scheduleOffsetDays?: number;
  /** Time of day to send in HH:MM 24h format. */
  scheduleTime?: string;
}

export interface EscalationRule {
  id: string;
  condition: string;
  action: string;
  assignedTo?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  user: string;
}

export interface ExternalTransaction {
  id: string;
  date: string;
  reference: string;
  transactionCode?: string;
  amount: number;
  name: string;
  account: string;
  type: 'M-Pesa' | 'Bank';
  matched: boolean;
  matchedTenantId?: string;
}

export interface Overpayment {
  id: string;
  tenantName: string;
  unit: string;
  amount: number;
  reference: string;
  dateReceived: string;
  appliedMonth: string;
  status: 'Held' | 'Applied';
  holdingAccount?: 'Agency' | 'Landlord';
}

export interface SystemSettings {
  companyName: string;
  logo: string | null;
  profilePic: string | null;
  address?: string;
  phone?: string;
  shortcode?: string;
  /** Agency's primary M-Pesa paybill — used for Full Management rent collection. */
  agencyPaybill?: string;
  /** Airtel Money partner ID for agency collections. */
  agencyAirtelPartnerId?: string;
  /** Arbitrary integration/API fields for Settings → Constants (persisted with system settings). */
  softwareConstants?: Record<string, string>;
  /** Master on/off switch for Bulk SMS (manual and automated). Defaults to false if unset. */
  bulkSmsEnabled?: boolean;
  /** Master switch to prevent any user logins if there's an uncleared developer invoice. */
  saasBillingPreventsLogin?: boolean;
}

export interface PreventiveTask {
  id: string;
  title: string;
  asset: string;
  frequency: 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
  nextDueDate: string;
}

export interface IncomeSource {
  id: string;
  name: string;
  type: string;
}

export interface Fund {
  id: string;
  name: string;
  description: string;
  targetApy: string;
  capitalRaised: number;
  targetCapital: number;
  investors: number;
  status: 'Active' | 'Closing Soon' | 'Project Completed' | 'Fully Funded';
  riskProfile: 'Low' | 'Medium' | 'High';
  projectedCompletion?: string;
  landlordType?: 'Internal' | 'External';
  landlordName?: string;
  landlordId?: string;
  landlordContact?: string;
  landlordPic?: string;
  propertyType?: 'Residential' | 'Commercial' | 'Mixed Use';
  clientInterestRate?: number;
  projectPic?: string;
  renovationStartDate?: string;
  renovationEndDate?: string;
  boq?: BoQItem[];
  documents?: Array<{ name: string; url: string; date: string }>;
  progressUpdates?: Array<{ id: string; date: string; caption: string; imageUrl: string }>;
}

export interface BoQItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface Investment {
  id: string;
  fundId: string;
  fundName: string;
  amount: number;
  date: string;
  strategy: 'Monthly Payout' | 'Compound';
  status: 'Active' | 'Closed';
  accruedInterest: number;
  investorId?: string;
}

export interface WithdrawalRequest {
  id: string;
  investorName: string;
  amount: number;
  requestDate: string;
  type: 'Interest' | 'Capital' | 'Partial Capital';
  method: 'M-Pesa' | 'Bank';
  status: 'Pending Approval' | 'Paid' | 'Rejected';
  destinationAccount?: string;
  notes?: string;
}

export interface RenovationInvestor {
  id: string;
  name: string;
  username?: string;
  email: string;
  phone: string;
  idNumber: string;
  status: 'Active' | 'Pending' | 'Verified' | 'Rejected';
  joinDate: string;
  nextOfKin?: { name: string; phone: string; relationship: string };
  paymentDetails?: { bankName?: string; accountNumber?: string; mpesaNumber?: string };
  investorType?: 'Individual' | 'Chama' | 'Sacco' | 'Corporate';
  groupMembersCount?: number;
  residency?: string;
  kraPin?: string;
  authorizedRep?: { name: string; phone: string; role: string };
  referrerId?: string;
  referrerType?: string;
  referralCode?: string;
  passwordHash?: string;
  appScope?: 'Full' | 'Partial' | 'Both';
}

export interface RFTransaction {
  id: string;
  date: string;
  type: 'Investment' | 'Loan Payback' | 'Management Fee' | 'Withdrawal' | 'Interest Payout' | 'Expense' | 'Invoice' | 'Referral Commission';
  category: 'Inbound' | 'Outbound';
  amount: number;
  partyName: string;
  reference: string;
  status: 'Completed' | 'Pending';
  description?: string;
}

export interface RenovationProjectBill {
  id: string;
  projectId: string;
  vendor: string;
  description: string;
  amount: number;
  date: string;
  status: 'Paid' | 'Pending';
  category: 'Material' | 'Labor' | 'Permits' | 'Other';
  invoiceNumber?: string;
  attachmentUrl?: string;
}

export interface SearchResult {
  id: string;
  type: 'Tenant' | 'Property';
  title: string;
  subtitle: string;
  status?: string;
}

export interface PropertyAsset {
  name: string;
  type: 'doc' | 'image';
  category: 'Document' | 'Image';
  url: string;
}

export interface FloorPlan {
  floorNumber: number;
  compositionType: 'Uniform' | 'Mixed';
  unitType?: string;
  unitCount?: number;
  mixedComposition?: Record<string, number>;
}

export type UnitType = 'Single Room' | 'Double Room' | 'Bedsitter' | 'Studio' | 'One Bedroom' | 'Two Bedrooms' | 'Three Bedrooms' | 'Shop' | 'Office';

export interface RecurringBillSettings {
  serviceCharge: number;
  garbage: number;
  security: number;
  waterFixed: number;
  other: number;
}

export interface FineItem {
  id: string;
  type: string;
  amount: number;
  date: string;
  status: 'Pending' | 'Paid';
}

export interface TenantRequest {
  id: string;
  type: 'General' | 'Maintenance' | 'Eviction' | 'Inquiry' | 'Complaint';
  title: string;
  description: string;
  date: string;
  status: 'Pending' | 'Approved' | 'Converted to Task' | 'Under Review';
  priority: TaskPriority;
  messages?: RequestMessage[];
  images?: string[];
  taskId?: string;
}

export interface RequestMessage {
  id: string;
  sender: string;
  text: string;
  date: string;
}

export interface Notice {
  id: string;
  type: 'Warning' | 'Vacation' | 'Eviction';
  origin: 'System' | 'Client';
  dateIssued: string;
  effectiveDate: string;
  reason: string;
  status: 'Active' | 'Resolved';
}

export interface CollectionLog {
  id: string;
  date: string;
  type: 'Call' | 'Message' | 'Visit';
  feedback: string;
  outcome: 'Promise to Pay' | 'No Answer' | 'Refusal' | 'Left Message' | 'Paid';
  expectedCompletionDate?: string;
  loggedBy: string;
}

export type ExpenseCategory = 'Maintenance' | 'Transaction Costs' | 'Tax' | 'Legal' | 'Marketing' | 'Office Rent' | 'Other' | 'Salary' | 'Cleaning' | 'Vendor' | 'Internet' | 'Licences' | 'Deposit Refund' | 'Landlord Payout' | 'Security' | 'Water' | 'Electricity' | 'Garbage' | 'Gas' | 'Service Charge' | 'Referral Commission';
export type RevenueStreamCategory = 'Agency Management Commission' | 'Fines & Penalties' | 'Late Payment Fine' | 'Bills' | 'Maintenance Interest (15%)' | 'Tenancy Placement Fee';

export interface Payslip {
  id: string;
  staffId: string;
  month: string;
  basic: number;
  deductions: number;
  net: number;
}

export interface TaxRecord {
  id: string;
  type: string;
  description: string;
  amount: number;
  date: string;
  status: 'Due' | 'Paid';
}

export interface LeaseTemplate {
  id: string;
  name: string;
  type: 'Residential' | 'Commercial';
  content: string;
}

export interface RoleAwareKpis {
  welcomeMessage: string;
  summaryCards: Array<{ text: string; value: string; icon: string }>;
}

export interface OccupancyMetric {
  // Mock interface to satisfy export if unused
  id?: string;
}

export interface StaffLeaderboardEntry {
  rank: number;
  name: string;
  metricName: string;
  metricValue: string;
}

export interface PropertyInsight {
  id: string;
  name: string;
  occupancy: number;
}

export interface ReitMetric {
  title: string;
  value: string;
  change: string;
}

export interface ScheduledReport {
  id: string;
  name: string;
  frequency: 'Daily' | 'Weekly' | 'Monthly';
}

// --- MARKETPLACE & LISTING TYPES ---
export interface MarketplaceListing {
  id: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  type: 'Rent' | 'Sale' | 'AirBnB';
  status: 'Published' | 'Draft' | 'Sold' | 'Rented';
  price: number; // Rent per month, Sale price, or Nightly rate
  currency: string;
  description: string;
  title: string;
  location: string;
  zone?: string;
  /** Google map pin/share URL for live listings. */
  pinLocationUrl?: string;
  images: string[];
  features: string[]; // "WiFi", "Pool", "Title Deed Ready"
  
  // Specific Configs
  airbnbConfig?: {
      cleaningFee: number;
      checkInTime: string;
      checkOutTime: string;
      maxGuests: number;
      houseRules: string;
      amenities: string[];
  };
  saleConfig?: {
      titleDeedType: string; // Freehold, Leasehold
      landSize: string;
      financingAvailable: boolean;
      propertyCategory?: 'House' | 'Apartment' | 'Land'; // New
      usageType?: 'Residential' | 'Commercial' | 'Mixed'; // New
  };
  
  ownerDetails: {
      name: string;
      contact: string;
      email: string;
      rating?: number; // 0-5
      reviews?: number; // Count of reviews
  };
  
  dateCreated: string;

  // Third-party / marketed-only extensions (all optional, backward compatible).
  source?: ListingSource;
  rentConfig?: ListingRentConfig;
  ownerPayout?: ListingOwnerPayout;
  placement?: ListingPlacement;

  /**
   * Payment account tag (auto: "TP-001"…). Used as the M-Pesa / STK push
   * account number for third-party Rent listings. Unique across managed
   * unit_tags and other listing paymentTags.
   */
  paymentTag?: string;

  /** Reference to a temporary Tenant record created for this listing. */
  tempTenantId?: string;

  /**
   * Lightweight inline temporary-tenant record for third-party Rent listings.
   * Captured by the agent at placement time. Once the owner onboards with
   * the agency this can be promoted to a full TenantProfile.
   */
  tempTenant?: {
    name: string;
    phone: string;
    email?: string;
    idNumber?: string;
    registeredAt: string; // ISO date
    moveInDate?: string;
    notes?: string;
  };
}

// --- Third-party (marketed-only) listing extensions ---
// These fields let the agency market a property it does NOT manage.
// They are stored only on the MarketplaceListing record — no Property/Unit
// row is ever created, so managed inventory is never polluted.
export type ListingSource = 'Managed' | 'ThirdParty';

export interface ListingRentConfig {
  depositAmount: number;
  leaseTermMonths?: number;
  furnished?: 'Furnished' | 'Semi' | 'Unfurnished';
  bedrooms?: number;
  bathrooms?: number;
  availableFrom?: string;
  placementFeeModel: 'FirstMonthRent' | 'PercentOfRent' | 'FlatFee';
  placementFeePercent?: number;
  placementFeeFlat?: number;
  notes?: string;
}

export interface ListingOwnerPayout {
  payoutMethod: 'M-Pesa' | 'Bank' | 'Cash';
  mpesaNumber?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankBranch?: string;
  idNumber?: string;
  payoutNotes?: string;
}

export interface ListingPlacement {
  status: 'Pending' | 'Collected' | 'Disbursed';
  leadId?: string;
  collectedOn?: string;
  amountCollected?: number;
  placementFee?: number;
  ownerPayable?: number;
  disbursedOn?: string;
  disbursementRef?: string;
}


export interface Listing {
  id: string;
  title: string;
  price: string | number;
  status: 'Available' | 'Rented' | 'Sold';
  type: 'For Rent' | 'For Sale';
  location: string;
  agent: { name: string };
  houseType?: string;
  image?: string;
  beds?: number;
  baths?: number;
  size?: string;
  purpose: 'Rent' | 'Sale';
}

export interface Lead {
  id: string;
  tenantName: string;
  status: 'New' | 'Contacted' | 'Viewing' | 'Negotiation' | 'Closed' | 'Lost';
  assignedAgent: string;
  listingTitle: string;
  contact?: string;
  email?: string;
  interest?: string;
  date?: string;
  source?: 'Website' | 'Walk-in' | 'Referral' | 'Social Media';
  notes?: string;
  referrerId?: string; // ID of the affiliate/user who referred this lead
  serviceType?: 'Security' | 'Cleaning' | 'Maintenance';
  estimatedValue?: number;
  commissionPercent?: number;
  leadType?: 'Tenant' | 'Landlord' | 'Investor' | 'Security' | 'Cleaning' | 'Maintenance';
  serviceSubtype?: string;
  linkedApplicationId?: string; // LandlordApplication or RenovationInvestor id, when created via Add Lead
  propertyName?: string; // manual property name for Landlord / Maintenance leads
  location?: string; // area / town for Landlord / Maintenance leads
  expectedMonthlyCollection?: number; // Landlord — expected avg monthly collection (KES)
  totalUnits?: number; // Landlord — total units in proposed property
}

export interface Affiliate {
  id: string;
  name: string;
  referralCode: string;
  stats: { leadsReferred: number; leasesSigned: number; totalEarned: number };
  referrals: Array<{ date: string; tenantName: string; status: 'Signed' | 'Pending'; commission: number }>;
}

export interface DeveloperProject {
  id: string;
  name: string;
  unitsSold: number;
  totalUnits: number;
}

export interface KycRecord {
  id: string;
  investorName: string;
  idNumber: string;
  phone: string;
  joinDate: string;
  status: 'Verified' | 'Pending' | 'Rejected';
}

export interface RolePermissions {
    [module: string]: {
        create: boolean;
        edit: boolean;
        delete: boolean;
        view: boolean;
        approve: boolean;
        import: boolean;
        activate: boolean;
        deactivate: boolean;
        publish: boolean;
        pay: boolean;
        resolve: boolean;
        cancel: boolean;
    };
}

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: RolePermissions;
  accessibleSubmodules: string[];
  widgetAccess?: string[];
}

export interface WidgetConfig {
  id: string;
  name: string;
  enabled: boolean;
}

export interface RateRule {
  id: string;
  name: string;
  value: number;
  unit: string;
}

export interface SystemConstant {
  id: string;
  category: string;
  value: string;
}

export interface CompanyStructureNode {
  name: string;
  type: string;
}

export interface LandlordStatement {
  id: string;
  period: string;
  gross: number;
  deductions: number;
  netPayout: number;
  status: 'Paid' | 'Pending';
}

export interface Distribution {
  id: string;
  date: string;
  amount: number;
  investorName: string;
  method: string;
  status: 'Paid' | 'Pending';
}

export interface InvestorProfile {
  id: string;
  name: string;
  totalInvested: number;
  balance: number;
  totalReturns: number;
  nextPayout: { amount: number; date: string };
  transactions: Array<{ id: string; date: string; type: string; amount: number; status: string; category: string; partyName: string; reference: string }>;
}

export interface OperationsKpi {
  title: string;
  value: number;
  unit: string;
}

export interface Lease {
  id: string;
  tenantName: string;
  property: string;
  unit: string;
  startDate: string;
  endDate: string;
  rent: number;
  status: LeaseStatus;
  history: any[];
}

export enum LeaseStatus {
  Active = 'Active',
  ExpiringSoon = 'Expiring Soon',
  Renewed = 'Renewed',
  Terminated = 'Terminated',
  Evicted = 'Evicted'
}

export interface ReportCardData {
  title: string;
  value: string;
  icon: string;
  link?: string;
  color: 'primary' | 'secondary' | 'red' | 'green' | 'blue' | 'gray';
  subtext?: string;
  chartData?: any;
  chartType?: 'bar' | 'line';
}

export interface PaymentKpi {
  title: string;
  value: string;
  change?: string;
  changeType?: 'increase' | 'decrease';
}

/** Marketing banner templates persisted in app_state (tm_marketing_banners_v11). */
export interface MarketingBannerTemplate {
  id: string;
  title: string;
  type: 'Rent' | 'Sale' | 'Investment' | 'General';
  imageUrl: string;
  description: string;
}

export interface LedgerEntry {
  id: string;
  date: string;
  property: string;
  description: string;
  totalAmount: number;
  agencyAmount: number;
  landlordAmount: number;
  category: string;
  type: 'Income' | 'Expense';
}

export interface DataContextType {
    tenants: TenantProfile[];
    properties: Property[];
    landlords: User[];
    tasks: Task[];
    quotations: Quotation[];
    applications: TenantApplication[];
    landlordApplications: LandlordApplication[];
    staff: StaffProfile[];
    fines: FineRule[];
    offboardingRecords: OffboardingRecord[];
    landlordOffboardingRecords: LandlordOffboardingRecord[];
    geospatialData: GeospatialData;
    commissionRules: CommissionRule[];
    deductionRules: DeductionRule[];
    bills: Bill[];
    invoices: Invoice[];
    vendors: Vendor[];
    messages: Message[];
    notifications: Notification[];
    templates: CommunicationTemplate[];
    workflows: Workflow[];
    automationRules: CommunicationAutomationRule[];
    escalationRules: EscalationRule[];
    auditLogs: AuditLogEntry[];
    externalTransactions: ExternalTransaction[];
    overpayments: Overpayment[];
    systemSettings: SystemSettings;
    preventiveTasks: PreventiveTask[];
    incomeSources: IncomeSource[];
    funds: Fund[];
    investments: Investment[];
    withdrawals: WithdrawalRequest[];
    renovationInvestors: RenovationInvestor[];
    rfTransactions: RFTransaction[];
    renovationProjectBills: RenovationProjectBill[];
    roles: Role[];
    currentUser: User | StaffProfile | TenantProfile | null;
    scheduledReports: ScheduledReport[];
    taxRecords: TaxRecord[];
    marketplaceListings: MarketplaceListing[];
    leads: Lead[];
    fundiJobs: FundiJob[]; // Added fundiJobs
    marketingBanners: MarketingBannerTemplate[];
    setMarketingBanners: Dispatch<SetStateAction<MarketingBannerTemplate[]>>;
    users: User[]; // Unified list of all users
    updateUser: (id: string, data: Partial<User>) => void; // Unified update
    rawTenants: TenantProfile[];
    rawProperties: Property[];

    isSupabaseEnabled: boolean;
    isDataLoading: boolean;

    setCurrentUser: (user: User | StaffProfile | TenantProfile | null) => void;
    addTenant: (tenant: TenantProfile) => void | Promise<void>;
    updateTenant: (id: string, data: Partial<TenantProfile>) => void | Promise<void>;
    deleteTenant: (id: string) => void;
    addProperty: (p: Property) => void;
    updateProperty: (id: string, d: Partial<Property>) => void;
    deleteProperty: (id: string) => void;
    addUnitToProperty: (propId: string, unit: Unit) => void;
    addTask: (t: Task) => void;
    updateTask: (id: string, d: Partial<Task>) => void;
    addQuotation: (q: Quotation) => void;
    updateQuotation: (id: string, d: Partial<Quotation>) => void;
    addApplication: (a: TenantApplication) => void;
    updateApplication: (id: string, d: Partial<TenantApplication>) => void;
    deleteApplication: (id: string, options?: { keepTenant?: boolean; keepAuthUser?: boolean }) => void;
    addLandlordApplication: (a: LandlordApplication) => void;
    updateLandlordApplication: (id: string, d: Partial<LandlordApplication>) => void;
    deleteLandlordApplication: (id: string) => void;
    addLandlord: (u: User) => void | Promise<void>;
    updateLandlord: (id: string, d: Partial<User>) => void | Promise<void>;
    deleteLandlord: (id: string) => void;
    addStaff: (s: StaffProfile) => void | Promise<void>;
    updateStaff: (id: string, d: Partial<StaffProfile>) => void | Promise<void>;
    deleteStaff: (id: string) => void;
    addFine: (f: FineRule) => void;
    updateFine: (id: string, d: Partial<FineRule>) => void;
    deleteFine: (id: string) => void;
    addOffboardingRecord: (r: OffboardingRecord) => void;
    updateOffboardingRecord: (id: string, d: Partial<OffboardingRecord>) => void;
    deleteOffboardingRecord: (id: string) => void;
    addLandlordOffboardingRecord: (r: LandlordOffboardingRecord) => void;
    updateLandlordOffboardingRecord: (id: string, d: Partial<LandlordOffboardingRecord>) => void;
    deleteLandlordOffboardingRecord: (id: string) => void;
    addGeospatialNode: (level: any, parentPath: any, name: any) => void;
    addCommissionRule: (r: CommissionRule) => void;
    updateCommissionRule: (id: string, d: Partial<CommissionRule>) => void;
    deleteCommissionRule: (id: string) => void;
    addDeductionRule: (r: DeductionRule) => void;
    updateDeductionRule: (id: string, d: Partial<DeductionRule>) => void;
    deleteDeductionRule: (id: string) => void;
    addBill: (b: Bill) => void;
    updateBill: (id: string, d: Partial<Bill>) => void;
    deleteBill: (id: string) => void;
    addTenantBill: (tid: string, b: BillItem) => void;
    addInvoice: (i: Invoice) => void;
    updateInvoice: (id: string, d: Partial<Invoice>) => void;
    addMessage: (m: Message) => void;
    updateMessageStatus: (id: string, status: Message['status']) => void;
    addNotification: (n: Notification) => void;
    markAllNotificationsRead: () => void;
    dismissNotification: (id: string) => void;
    clearOldNotifications: () => void;
    addVendor: (v: Vendor) => void | Promise<void>;
    updateVendor: (id: string, d: Partial<Vendor>) => void | Promise<void>;
    deleteVendor: (id: string) => void;
    addAuditLog: (log: AuditLogEntry) => void;
    updateExternalTransaction: (id: string, d: Partial<ExternalTransaction>) => void;
    addOverpayment: (o: Overpayment) => void;
    updateOverpayment: (id: string, d: Partial<Overpayment>) => void;
    moveTenantPayment: (f: string, t: string, r: string) => Promise<void>;
    deleteTenantPayment: (tenantId: string, reference: string) => Promise<void>;
    addWorkflow: (w: Workflow) => void;
    updateWorkflow: (id: string, d: Partial<Workflow>) => void;
    addAutomationRule: (r: CommunicationAutomationRule) => void;
    updateAutomationRule: (id: string, d: Partial<CommunicationAutomationRule>) => void;
    addEscalationRule: (r: EscalationRule) => void;
    updateEscalationRule: (id: string, d: Partial<EscalationRule>) => void;
    updateSystemSettings: (settings: Partial<SystemSettings>) => void;
    addPreventiveTask: (t: PreventiveTask) => void;
    addTemplate: (t: CommunicationTemplate) => void;
    updateTemplate: (id: string, d: Partial<CommunicationTemplate>) => void;
    deleteTemplate: (id: string) => void;
    addIncomeSource: (s: IncomeSource) => void;
    updateIncomeSource: (id: string, d: Partial<IncomeSource>) => void;
    addFund: (f: Fund) => void;
    updateFund: (id: string, d: Partial<Fund>) => void;
    deleteFund: (id: string) => void;
    addInvestment: (inv: Investment) => void;
    updateInvestment: (id: string, d: Partial<Investment>) => void;
    addWithdrawal: (req: WithdrawalRequest) => void;
    updateWithdrawal: (id: string, d: Partial<WithdrawalRequest>) => void;
    addRenovationInvestor: (inv: RenovationInvestor) => void | Promise<void>;
    updateRenovationInvestor: (id: string, d: Partial<RenovationInvestor>) => void | Promise<void>;
    deleteRenovationInvestor: (id: string) => void;
    addRFTransaction: (tx: RFTransaction) => void;
    updateRFTransaction: (id: string, d: Partial<RFTransaction>) => void;
    addRenovationProjectBill: (bill: RenovationProjectBill) => void;
    updateRenovationProjectBill: (id: string, d: Partial<RenovationProjectBill>) => void;
    addRole: (r: Role) => void;
    updateRole: (id: string, d: Partial<Role>) => void;
    deleteRole: (id: string) => void;
    addScheduledReport: (r: ScheduledReport) => void;
    deleteScheduledReport: (id: string) => void;
    addTaxRecord: (record: TaxRecord) => void;
    updateTaxRecord: (id: string, d: Partial<TaxRecord>) => void;
    
    // Marketplace CRUD
    addMarketplaceListing: (listing: MarketplaceListing) => void;
    updateMarketplaceListing: (id: string, d: Partial<MarketplaceListing>) => void;
    deleteMarketplaceListing: (id: string) => void;
    markUnitOccupied: (propertyId: string, unitId: string) => void;

    // Leads CRUD
    addLead: (lead: Lead) => void;
    updateLead: (id: string, d: Partial<Lead>) => void;
    deleteLead: (id: string) => void;
    syncWebsiteLeads: () => Promise<void>;

    // Fundi Jobs CRUD
    addFundiJob: (job: FundiJob) => void;
    updateFundiJob: (id: string, d: Partial<FundiJob>) => void;
    syncFundiJobs: () => Promise<void>;

    // New Helper to check permissions
    checkPermission: (module: string, action: string) => boolean;

    getOccupancyRate: () => number;
    getTotalRevenue: () => number;
}