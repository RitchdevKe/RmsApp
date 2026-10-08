import type { Property } from '../types';

export const REVENUE_SPLIT_TYPES = {
    landlordRentOnly: 'LANDLORD_RENT_ONLY',
    landlordCoreRevenue: 'LANDLORD_RENT_BILLS_DEPOSIT_MAINTENANCE',
    landlordAllAgentInvoices: 'LANDLORD_ALL_REVENUE_AGENT_INVOICES',
} as const;

export type RevenueSplitType = typeof REVENUE_SPLIT_TYPES[keyof typeof REVENUE_SPLIT_TYPES];
export type RevenueStream = 'rent' | 'managementFee' | 'placementFee' | 'deposit' | 'lateFee' | 'fines' | 'billsRmi' | 'maintenance';

const LEGACY_DEFAULT = 'Rent+Deposit+Bills (Landlord)';
const LEGACY_DEPOSIT_AGENCY = 'Rent+Bills (Landlord) | Deposit (Agency)';
const LEGACY_DEPOSIT_BILLS_AGENCY = 'Rent (Landlord) | Deposit+Bills (Agency)';

export function normalizeRevenueSplitType(type?: string | null): RevenueSplitType {
    if (type === REVENUE_SPLIT_TYPES.landlordRentOnly || type === LEGACY_DEPOSIT_BILLS_AGENCY) return REVENUE_SPLIT_TYPES.landlordRentOnly;
    if (type === REVENUE_SPLIT_TYPES.landlordCoreRevenue || type === LEGACY_DEFAULT) return REVENUE_SPLIT_TYPES.landlordCoreRevenue;
    if (type === REVENUE_SPLIT_TYPES.landlordAllAgentInvoices || type === LEGACY_DEPOSIT_AGENCY) return REVENUE_SPLIT_TYPES.landlordAllAgentInvoices;
    return REVENUE_SPLIT_TYPES.landlordRentOnly;
}

export function getRevenueSplitLabel(type?: string | null): string {
    const normalized = normalizeRevenueSplitType(type);
    if (normalized === REVENUE_SPLIT_TYPES.landlordCoreRevenue) return '2. Landlord: Rent + Bills/RMI + Deposit + Maintenance';
    if (normalized === REVENUE_SPLIT_TYPES.landlordAllAgentInvoices) return '3. All revenue to Landlord — Agent invoices';
    return '1. Landlord: Rent only';
}

export function getRevenueSplitBuckets(type?: string | null): { landlord: RevenueStream[]; agency: RevenueStream[]; agencyInvoices: boolean } {
    const normalized = normalizeRevenueSplitType(type);
    if (normalized === REVENUE_SPLIT_TYPES.landlordCoreRevenue) {
        return { landlord: ['rent', 'billsRmi', 'deposit', 'maintenance'], agency: ['managementFee', 'placementFee', 'lateFee', 'fines'], agencyInvoices: false };
    }
    if (normalized === REVENUE_SPLIT_TYPES.landlordAllAgentInvoices) {
        return { landlord: ['rent', 'deposit', 'managementFee', 'placementFee', 'lateFee', 'fines', 'billsRmi', 'maintenance'], agency: [], agencyInvoices: true };
    }
    return { landlord: ['rent'], agency: ['managementFee', 'placementFee', 'deposit', 'lateFee', 'fines', 'billsRmi', 'maintenance'], agencyInvoices: false };
}

export function revenueStreamPayee(property: Partial<Property> | null | undefined, stream: RevenueStream): 'Landlord' | 'Agency' {
    return getRevenueSplitBuckets(property?.collectionSplit?.type).agency.includes(stream) ? 'Agency' : 'Landlord';
}

export function isAgencyRevenueStream(property: Partial<Property> | null | undefined, stream: RevenueStream): boolean {
    return revenueStreamPayee(property, stream) === 'Agency';
}