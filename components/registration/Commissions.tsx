
import React, { useState, useEffect } from 'react';
import { CommissionRule, CommissionTrigger } from '../../types';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';

const RuleFormModal: React.FC<{ 
    rule?: CommissionRule | null; 
    onClose: () => void; 
    onSave: (rule: CommissionRule) => void; 
}> = ({ rule, onClose, onSave }) => {
    const [formData, setFormData] = useState<Partial<CommissionRule>>({
        trigger: 'Rent Collection',
        rateType: '%',
        rateValue: '' as any,
        description: '',
        appliesTo: 'Agent',
        deadlineDay: undefined
    });

    useEffect(() => {
        if (rule) {
            setFormData({ ...rule, rateValue: String(rule.rateValue ?? '') as any, deadlineDay: rule.deadlineDay !== undefined ? String(rule.deadlineDay) as any : undefined });
        } else {
            // Defaults for new rule
            setFormData({
                trigger: 'Rent Collection',
                rateType: '%',
                rateValue: '' as any,
                description: '',
                appliesTo: 'Agent'
            });
        }
    }, [rule]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const parsedRate = parseFloat(String(formData.rateValue ?? ''));
        if (!formData.trigger || isNaN(parsedRate)) {
            alert("Trigger and Rate Value are required.");
            return;
        }
        const parsedDeadline = formData.deadlineDay !== undefined ? parseFloat(String(formData.deadlineDay)) : undefined;
        const finalRule = {
            ...formData,
            rateValue: parsedRate,
            deadlineDay: parsedDeadline,
            id: rule?.id || `rule-${Date.now()}`
        } as CommissionRule;
        onSave(finalRule);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                <h2 className="text-xl font-bold mb-4">{rule ? 'Edit Rule' : 'Add New Commission Rule'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Event</label>
                        <select name="trigger" value={formData.trigger} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                            <option value="Rent Collection">Rent Collection</option>
                            <option value="Tenancy Referral">Tenancy Referral</option>
                            <option value="Property Management Referral">Property Management Referral</option>
                            <option value="Property Sale">Property Sale</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Applies To</label>
                        <select name="appliesTo" value={formData.appliesTo} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                            <option value="Agent">Agent</option>
                            <option value="Affiliate">Affiliate</option>
                            <option value="Tenant">Tenant</option>
                            <option value="Staff">Staff</option>
                            <option value="Landlord">Landlord</option>
                            <option value="Tenant, Agent, Affiliate">Tenant, Agent, Affiliate</option>
                            <option value="Landlord, Staff, Agent, Affiliate">Landlord, Staff, Agent, Affiliate</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Who is eligible for this commission?</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rate Type</label>
                            <select name="rateType" value={formData.rateType} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                <option value="%">Percentage (%)</option>
                                <option value="KES">Fixed Amount (KES)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                            <input 
                                type="number" 
                                name="rateValue" 
                                value={formData.rateValue} 
                                onChange={handleChange} 
                                className="w-full p-2 border rounded" 
                                placeholder="e.g. 10" 
                            />
                        </div>
                    </div>

                    {formData.trigger === 'Rent Collection' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Deadline Day (Optional)</label>
                            <input 
                                type="number" 
                                name="deadlineDay" 
                                value={formData.deadlineDay || ''} 
                                onChange={handleChange} 
                                className="w-full p-2 border rounded" 
                                placeholder="e.g. 5 (for 5th of month)" 
                            />
                            <p className="text-xs text-gray-500 mt-1">Commission applies if collected on or before this day.</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea 
                            name="description" 
                            value={formData.description} 
                            onChange={handleChange} 
                            rows={3} 
                            className="w-full p-2 border rounded" 
                            placeholder="Details about this rule..." 
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark">Save Rule</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const Commissions: React.FC = () => {
    const { commissionRules, addCommissionRule, updateCommissionRule } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);

    const handleBack = () => {
        const isPartial = window.location.hash.startsWith('#/partial-rms');
        window.location.hash = isPartial ? '#/partial-rms/registration/overview' : '#/registration/overview';
    };

    const handleAddRule = () => {
        setEditingRule(null);
        setIsModalOpen(true);
    };

    const handleEditRule = (rule: CommissionRule) => {
        setEditingRule(rule);
        setIsModalOpen(true);
    };

    const handleSave = (rule: CommissionRule) => {
        if (editingRule) {
            updateCommissionRule(rule.id, rule);
        } else {
            addCommissionRule(rule);
        }
        setIsModalOpen(false);
    };

    const getAppliesToColor = (appliesTo: string) => {
        if (appliesTo.includes('Agent')) return 'bg-blue-100 text-blue-800';
        if (appliesTo.includes('Affiliate')) return 'bg-purple-100 text-purple-800';
        if (appliesTo.includes('Tenant')) return 'bg-green-100 text-green-800';
        return 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Commissions & Fees</h1>
                    <p className="text-lg text-gray-500 mt-1">Set up referral structures and performance incentives.</p>
                </div>
                <button onClick={handleAddRule} className="px-6 py-2 bg-primary text-white font-semibold rounded-md shadow-sm hover:bg-primary-dark">
                    + Add New Rule
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trigger Event</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Applies To</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {commissionRules.map((rule) => (
                                <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{rule.trigger}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getAppliesToColor(rule.appliesTo)}`}>
                                            {rule.appliesTo}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-800">
                                        {rule.rateType === 'KES' ? `KES ${rule.rateValue.toLocaleString()}` : `${rule.rateValue}%`}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{rule.description}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button 
                                            onClick={() => handleEditRule(rule)}
                                            className="text-primary hover:text-primary-dark font-semibold"
                                        >
                                            Edit
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {commissionRules.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500">No commission rules configured yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <RuleFormModal 
                    rule={editingRule} 
                    onClose={() => setIsModalOpen(false)} 
                    onSave={handleSave} 
                />
            )}
        </div>
    );
};

export default Commissions;
