import { Property } from '../types';
import { isAgencyRevenueStream, type RevenueStream } from './revenueSplit';

export const PAYEE_LANDLORD = 'PAYEE_LANDLORD';
export const PAYEE_AGENCY = 'PAYEE_AGENCY';

export function determinePayee(
    category: string, 
    property: Partial<Property> | null | undefined, 
    isFirstMonthRent: boolean = false
): 'PAYEE_LANDLORD' | 'PAYEE_AGENCY' {
    const normalized = category.toLowerCase();
    const stream: RevenueStream = normalized.includes('placement') || (normalized.includes('rent') && isFirstMonthRent)
        ? 'placementFee'
        : normalized.includes('management')
            ? 'managementFee'
            : normalized.includes('deposit')
                ? 'deposit'
                : normalized.includes('late')
                    ? 'lateFee'
                    : normalized.includes('fine') || normalized.includes('penalt')
                        ? 'fines'
                        : normalized.includes('bill') || normalized.includes('rmi') || normalized.includes('mri')
                            ? 'billsRmi'
                            : normalized.includes('maintenance')
                                ? 'maintenance'
                                : 'rent';

    return isAgencyRevenueStream(property, stream) ? PAYEE_AGENCY : PAYEE_LANDLORD;
}
