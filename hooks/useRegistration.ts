import { useData } from '../context/DataContext';
import { User, LandlordApplication, RenovationInvestor, Vendor, StaffProfile } from '../types';
import { generateUserReferralCode } from '../utils/referralCode';

export const useRegistration = () => {
    const { 
        addLandlordApplication, 
        addRenovationInvestor, 
        addVendor, 
        addLandlord, // Used for Affiliates as they are Users
        users // To check for duplicates if needed (though add functions usually just push)
    } = useData();

    const registerLandlord = (data: Partial<LandlordApplication>) => {
        const newApp: LandlordApplication = {
            id: `la-${Date.now()}`,
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            status: 'Pending',
            date: new Date().toISOString(),
            proposedProperties: [],
            notes: data.notes || 'Web Registration',
            location: data.location || '',
            ...data
        };
        addLandlordApplication(newApp);
        return newApp;
    };

    const registerInvestor = (data: Partial<RenovationInvestor>) => {
        const newInvestor: RenovationInvestor = {
            id: `inv-${Date.now()}`,
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            idNumber: data.idNumber || '',
            status: 'Pending',
            joinDate: new Date().toISOString(),
            investorType: 'Individual',
            ...data
        };
        addRenovationInvestor(newInvestor);
        return newInvestor;
    };

    const registerContractor = (data: Partial<Vendor>) => {
        const newVendorId = `vnd-${Date.now()}`;
        const newVendor: Vendor = {
            id: newVendorId,
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            specialty: data.specialty || 'General',
            rating: 0,
            verified: false,
            completedJobs: 0,
            available: true,
            referralCode: generateUserReferralCode(data.name || '', newVendorId),
            ...data
        };
        addVendor(newVendor);
        return newVendor;
    };

    const registerFundi = (data: Partial<Vendor>) => {
        const newVendorId = `fundi-${Date.now()}`;
        const newVendor: Vendor = {
            id: newVendorId,
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            specialty: data.specialty || 'General',
            rating: 0,
            verified: false,
            completedJobs: 0,
            available: true,
            referralCode: generateUserReferralCode(data.name || '', newVendorId),
            userRole: 'Fundi',
            ...data,
        };
        addVendor(newVendor);
        return newVendor;
    };

    const registerAffiliate = (data: Partial<User>) => {
        // Affiliates are stored as Users with role 'Affiliate'
        // In DataContext, 'landlords' is often used as a generic User bucket for non-staff/non-tenant users
        const newAffiliateId = `aff-${Date.now()}`;
        const newAffiliate: User = {
            id: newAffiliateId,
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            idNumber: data.idNumber || '',
            role: 'Affiliate',
            status: 'Active', // Auto-activate or Pending if you prefer
            branch: 'Headquarters',
            passwordHash: 'default_hash', // In real app, handle password
            referralCode: generateUserReferralCode(data.name || '', newAffiliateId),
            ...data
        };
        addLandlord(newAffiliate); // Using addLandlord as it adds to the 'landlords' (User[]) state
        return newAffiliate;
    };

    return {
        registerLandlord,
        registerInvestor,
        registerContractor,
        registerFundi,
        registerAffiliate
    };
};
