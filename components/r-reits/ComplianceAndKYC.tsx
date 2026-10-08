// @ts-nocheck

import React, { useMemo, useState } from 'react';
import { fmtDate } from '../../utils/date';
import { KycRecord } from '../../types';
import { useData } from '../../context/DataContext';
import { getTodayIsoDate } from '../../utils/timezone';

function mapInvestorToKyc(inv: {
    id: string;
    name: string;
    idNumber: string;
    phone: string;
    joinDate: string;
    status: string;
}): KycRecord {
    let st: KycRecord['status'] = 'Pending';
    if (inv.status === 'Verified' || inv.status === 'Active') st = 'Verified';
    else if (inv.status === 'Rejected') st = 'Rejected';
    return {
        id: inv.id,
        investorName: inv.name,
        idNumber: inv.idNumber || '—',
        phone: inv.phone || '—',
        joinDate: inv.joinDate || '—',
        status: st,
    };
}

const ComplianceAndKYC: React.FC = () => {
    const { renovationInvestors, updateRenovationInvestor, staff, landlords, commissionRules, updateStaff, updateLandlord, addRFTransaction, investments } = useData();
    const [viewMode, setViewMode] = useState<'Pending' | 'Verified' | 'Rejected'>('Pending');

    const records = useMemo(
        () => (renovationInvestors || []).map(mapInvestorToKyc),
        [renovationInvestors]
    );

    const handleVerify = (id: string) => {
        if (!confirm("Are you sure you want to verify this investor?")) return;
        updateRenovationInvestor(id, { status: 'Verified' });

        // Auto-assign Investor Referral commission if referred
        const inv = (renovationInvestors || []).find(i => i.id === id);
        const referrerId = inv?.referrerId;
        if (referrerId) {
            const staffRef = staff.find(s => s.id === referrerId);
            const landlordRef = landlords.find(l => l.id === referrerId);
            const allPeople = [...tenants, ...(renovationInvestors as any[])];
            const otherRef = allPeople.find((p: any) => p.id === referrerId);
            const referrerObj = staffRef || landlordRef || otherRef;

            const referralConfig = referrerObj?.referralConfig || (inv as any).referralConfig;

            // Base amount for investor referral is their total invested capital
            const investorInvestments = (investments || []).filter(ins => ins.investorId === id);
            const totalInvested = investorInvestments.reduce((sum, ins) => sum + (ins.amount || 0), 0);
            const baseAmount = totalInvested || 100000; // default 100k capital if none yet

            let commissionAmount = 0;
            if (referralConfig && referralConfig.rateValue > 0) {
                commissionAmount = referralConfig.rateType === '%'
                    ? Math.round((referralConfig.rateValue / 100) * baseAmount)
                    : referralConfig.rateValue;
            } else {
                const rule = commissionRules.find(r => r.trigger === 'Investor Referral');
                if (rule && rule.rateValue > 0) {
                    commissionAmount = rule.rateType === '%'
                        ? Math.round((rule.rateValue / 100) * baseAmount)
                        : rule.rateValue;
                } else {
                    commissionAmount = 500; // default investor referral commission KES
                }
            }

            if (commissionAmount > 0) {
                const today = getTodayIsoDate();
                const source = `Investor Referral — ${inv?.name || id}`;
                if (staffRef) {
                    updateStaff(referrerId, {
                        commissions: [
                            { date: today, amount: commissionAmount, source },
                            ...(staffRef.commissions || []),
                        ],
                    });
                } else if (landlordRef) {
                    updateLandlord(referrerId, {
                        commissions: [
                            { date: today, amount: commissionAmount, source },
                            ...((landlordRef as any).commissions || []),
                        ],
                    } as any);
                } else {
                    addRFTransaction({
                        id: `rft-ref-${Date.now()}`,
                        date: today,
                        type: 'Referral Commission',
                        category: 'Outbound',
                        amount: commissionAmount,
                        partyName: referrerObj?.name || 'Referrer',
                        description: source,
                        reference: `REF-${id.slice(0, 8).toUpperCase()}`,
                        status: 'Pending',
                        notes: `Auto-generated on KYC verification of investor ${inv?.name || id}`,
                    } as any);
                }
            }
        }
    };

    const filteredRecords = records.filter(r => r.status === viewMode);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Compliance & KYC</h1>
                <p className="text-lg text-gray-500 mt-1">Verify investor identities from renovation fund registrations.</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex space-x-4 mb-6 border-b">
                    {(['Pending', 'Verified', 'Rejected'] as const).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setViewMode(mode)}
                            className={`pb-2 px-1 text-sm font-medium transition-colors ${viewMode === mode ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {mode} ({records.filter(r => r.status === mode).length})
                        </button>
                    ))}
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID Number</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Join Date</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredRecords.map(rec => (
                                <tr key={rec.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{rec.investorName}</td>
                                    <td className="px-6 py-4 text-gray-600">{rec.idNumber}</td>
                                    <td className="px-6 py-4 text-gray-600">{rec.phone}</td>
                                    <td className="px-6 py-4 text-gray-600">{fmtDate(rec.joinDate)}</td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button type="button" className="text-blue-600 hover:underline text-sm">View Docs</button>
                                        {rec.status === 'Pending' && (
                                            <button
                                                type="button"
                                                onClick={() => handleVerify(rec.id)}
                                                className="bg-green-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-green-600"
                                            >
                                                Verify
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredRecords.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No records found in this category.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ComplianceAndKYC;
