
import React, { useState, useEffect, useMemo } from 'react';
import Icon from '../Icon';
import { Fund, BoQItem } from '../../types';
import { useData } from '../../context/DataContext';
import { exportToCSV } from '../../utils/exportHelper';
import { getTodayIsoDate } from '../../utils/timezone';

const INITIAL_FUNDS: Fund[] = [
    {
        id: 'fund-1',
        name: 'Urban Renewal Fund I',
        description: 'Financing the renovation of 20 residential units in Nairobi CBD.',
        targetApy: '14-16%',
        capitalRaised: 12500000,
        targetCapital: 20000000,
        investors: 45,
        status: 'Active',
        riskProfile: 'Medium',
        projectedCompletion: 'Dec 2026',
        landlordType: 'Internal',
        landlordName: 'Peter Owner',
        propertyType: 'Residential',
        clientInterestRate: 1.5,
        boq: [
            { id: 'bq1', description: 'Paint Work', unit: 'SqM', quantity: 500, rate: 450, amount: 225000 },
            { id: 'bq2', description: 'Tiling', unit: 'SqM', quantity: 200, rate: 1200, amount: 240000 }
        ]
    }
];

const StatCard: React.FC<{ title: string; value: string; icon: string; color: string }> = ({ title, value, icon, color }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border-l-4" style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-center">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase">{title}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
            </div>
            <div className="p-2 rounded-full bg-gray-50">
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const CreateEditFundModal: React.FC<{ 
    fund?: Fund | null; 
    onClose: () => void;
    onSave: (fund: Fund) => void;
}> = ({ fund, onClose, onSave }) => {
    const { landlords } = useData();
    const [activeTab, setActiveTab] = useState<'details' | 'landlord' | 'bq' | 'docs'>('details');
    
    // Form State
    const [formData, setFormData] = useState<Partial<Fund>>({
        name: '', description: '', targetApy: '', targetCapital: 0, 
        riskProfile: 'Medium', status: 'Active',
        landlordType: 'Internal', propertyType: 'Residential',
        clientInterestRate: 0, boq: [], documents: []
    });

    // BQ State
    const [boqItems, setBoqItems] = useState<BoQItem[]>([]);

    useEffect(() => {
        if (fund) {
            setFormData(fund);
            setBoqItems(fund.boq || []);
        } else {
            // Default BQ Item
            setBoqItems([{ id: `bq-${Date.now()}`, description: '', unit: '', quantity: 0, rate: 0, amount: 0 }]);
        }
    }, [fund]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleLandlordSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedId = e.target.value;
        const landlord = landlords.find(l => l.id === selectedId);
        if (landlord) {
            setFormData(prev => ({
                ...prev,
                landlordId: selectedId,
                landlordName: landlord.name,
                landlordContact: landlord.phone,
                landlordPic: landlord.avatarUrl // Assuming avatarUrl exists on User
            }));
        }
    };

    // BQ Logic
    const updateBoqItem = (id: string, field: keyof BoQItem, value: any) => {
        setBoqItems(prev => prev.map(item => {
            if (item.id === id) {
                const updated = { ...item, [field]: value };
                if (field === 'quantity' || field === 'rate') {
                    updated.amount = (parseFloat(updated.quantity as any) || 0) * (parseFloat(updated.rate as any) || 0);
                }
                return updated;
            }
            return item;
        }));
    };

    const addBoqItem = () => {
        setBoqItems([...boqItems, { id: `bq-${Date.now()}`, description: '', unit: '', quantity: 0, rate: 0, amount: 0 }]);
    };

    const removeBoqItem = (id: string) => {
        setBoqItems(boqItems.filter(i => i.id !== id));
    };

    const boqTotal = boqItems.reduce((sum, item) => sum + item.amount, 0);

    // File Upload Simulation
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'projectPic' | 'landlordPic' | 'document') => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                if (field === 'document') {
                    setFormData(prev => ({
                        ...prev,
                        documents: [...(prev.documents || []), { name: file.name, url: '#', date: getTodayIsoDate() }]
                    }));
                } else {
                    setFormData(prev => ({ ...prev, [field]: reader.result as string }));
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        const finalData: Fund = {
            ...formData,
            id: fund?.id || `fund-${Date.now()}`,
            capitalRaised: fund?.capitalRaised || 0,
            investors: fund?.investors || 0,
            boq: boqItems,
        } as Fund;
        onSave(finalData);
    };

    const handleDownloadBQ = () => {
        exportToCSV(boqItems.map(i => ({ Description: i.description, Unit: i.unit, Qty: i.quantity, Rate: i.rate, Amount: i.amount })), `BQ_${formData.name}`);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-900">{fund ? 'Edit Fund & Project' : 'Create New Fund'}</h2>
                    <button onClick={onClose}><Icon name="close" className="w-6 h-6 text-gray-500" /></button>
                </div>

                <div className="flex border-b bg-gray-50">
                    {['details', 'landlord', 'bq', 'docs'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-6 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === tab ? 'bg-white text-primary border-t-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {tab === 'bq' ? 'Bill of Quantities' : tab === 'docs' ? 'Documents' : tab}
                        </button>
                    ))}
                </div>

                <div className="flex-grow overflow-y-auto p-8">
                    {activeTab === 'details' && (
                        <div className="space-y-6">
                            <div className="flex gap-6">
                                <div className="w-32 h-32 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group">
                                    {formData.projectPic ? (
                                        <img src={formData.projectPic} className="w-full h-full object-cover" alt="Project" />
                                    ) : (
                                        <>
                                            <Icon name="branch" className="w-8 h-8 text-gray-400" />
                                            <span className="text-xs text-gray-500 mt-1">Project Pic</span>
                                        </>
                                    )}
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleFileUpload(e, 'projectPic')} />
                                </div>
                                <div className="flex-grow space-y-4">
                                    <input name="name" value={formData.name} onChange={handleChange} placeholder="Project / Fund Name" className="w-full p-3 border rounded-lg font-bold text-lg" />
                                    <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Description & Strategy" rows={2} className="w-full p-3 border rounded-lg" />
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Capital (KES)</label>
                                    <input type="number" name="targetCapital" value={formData.targetCapital} onChange={handleChange} className="w-full p-2 border rounded" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Target APY (Return)</label>
                                    <input name="targetApy" value={formData.targetApy} onChange={handleChange} className="w-full p-2 border rounded" placeholder="e.g. 14-16%" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
                                    <select name="propertyType" value={formData.propertyType} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                        <option>Residential</option>
                                        <option>Commercial</option>
                                        <option>Mixed Use</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Risk Profile</label>
                                    <select name="riskProfile" value={formData.riskProfile} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                        <option>Low</option>
                                        <option>Medium</option>
                                        <option>High</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Renovation Start</label>
                                    <input type="date" name="renovationStartDate" value={formData.renovationStartDate} onChange={handleChange} className="w-full p-2 border rounded" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Renovation End (Est.)</label>
                                    <input type="date" name="renovationEndDate" value={formData.renovationEndDate} onChange={handleChange} className="w-full p-2 border rounded" />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'landlord' && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Landlord Source</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center p-3 border rounded cursor-pointer bg-gray-50 hover:bg-white">
                                        <input type="radio" name="landlordType" value="Internal" checked={formData.landlordType === 'Internal'} onChange={handleChange} className="mr-2" />
                                        Internal (Existing)
                                    </label>
                                    <label className="flex items-center p-3 border rounded cursor-pointer bg-gray-50 hover:bg-white">
                                        <input type="radio" name="landlordType" value="External" checked={formData.landlordType === 'External'} onChange={handleChange} className="mr-2" />
                                        External (New/Partner)
                                    </label>
                                </div>
                            </div>

                            {formData.landlordType === 'Internal' ? (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Landlord</label>
                                    <select onChange={handleLandlordSelect} className="w-full p-3 border rounded bg-white">
                                        <option value="">-- Search Landlord --</option>
                                        {landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </select>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <input name="landlordName" value={formData.landlordName} onChange={handleChange} placeholder="Landlord Name" className="w-full p-2 border rounded" />
                                    <input name="landlordContact" value={formData.landlordContact} onChange={handleChange} placeholder="Contact Phone/Email" className="w-full p-2 border rounded" />
                                </div>
                            )}

                            <div className="flex gap-6 items-center border-t pt-6">
                                <div className="w-24 h-24 bg-gray-100 rounded-full border flex items-center justify-center overflow-hidden relative group">
                                    {formData.landlordPic ? <img src={formData.landlordPic} className="w-full h-full object-cover" alt="Landlord"/> : <Icon name="user-circle" className="w-12 h-12 text-gray-400"/>}
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleFileUpload(e, 'landlordPic')} />
                                </div>
                                <div className="flex-grow">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Client Interest Rate (% per month)</label>
                                    <input type="number" step="0.1" name="clientInterestRate" value={formData.clientInterestRate} onChange={handleChange} className="w-full p-2 border rounded max-w-xs" placeholder="e.g. 1.5" />
                                    <p className="text-xs text-gray-500 mt-1">Interest charged to the landlord on the renovation capital.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'bq' && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-800">Bill of Quantities</h3>
                                <div className="flex gap-2">
                                    <button onClick={handleDownloadBQ} className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200 text-gray-700">Download CSV</button>
                                    <button onClick={addBoqItem} className="text-sm bg-primary text-white px-3 py-1 rounded hover:bg-primary-dark">+ Add Item</button>
                                </div>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-2 text-left">Description</th>
                                            <th className="px-4 py-2 w-20">Unit</th>
                                            <th className="px-4 py-2 w-24 text-right">Qty</th>
                                            <th className="px-4 py-2 w-32 text-right">Rate</th>
                                            <th className="px-4 py-2 w-32 text-right">Amount</th>
                                            <th className="px-4 py-2 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {boqItems.map((item, index) => (
                                            <tr key={item.id} className="border-t">
                                                <td className="p-2"><input value={item.description} onChange={e => updateBoqItem(item.id, 'description', e.target.value)} className="w-full p-1 border rounded" /></td>
                                                <td className="p-2"><input value={item.unit} onChange={e => updateBoqItem(item.id, 'unit', e.target.value)} className="w-full p-1 border rounded" /></td>
                                                <td className="p-2"><input type="number" value={item.quantity} onChange={e => updateBoqItem(item.id, 'quantity', e.target.value)} className="w-full p-1 border rounded text-right" /></td>
                                                <td className="p-2"><input type="number" value={item.rate} onChange={e => updateBoqItem(item.id, 'rate', e.target.value)} className="w-full p-1 border rounded text-right" /></td>
                                                <td className="p-2 text-right font-mono">{item.amount.toLocaleString()}</td>
                                                <td className="p-2 text-center"><button onClick={() => removeBoqItem(item.id)} className="text-red-500 hover:text-red-700 font-bold">&times;</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-100 font-bold">
                                        <tr>
                                            <td colSpan={4} className="p-3 text-right">Total Estimated Cost</td>
                                            <td className="p-3 text-right text-primary">KES {boqTotal.toLocaleString()}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'docs' && (
                        <div className="space-y-4">
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                                <Icon name="stack" className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                                <p className="text-gray-500 mb-4">Upload Contracts, Agreements, or Blueprints</p>
                                <label className="bg-white border border-gray-300 px-4 py-2 rounded-md cursor-pointer hover:bg-gray-50">
                                    Select File
                                    <input type="file" className="hidden" onChange={e => handleFileUpload(e, 'document')} />
                                </label>
                            </div>
                            <div className="space-y-2">
                                {formData.documents?.map((doc, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-3 bg-white border rounded shadow-sm">
                                        <div className="flex items-center">
                                            <Icon name="stack" className="w-5 h-5 text-blue-500 mr-3" />
                                            <div>
                                                <p className="font-medium text-sm">{doc.name}</p>
                                                <p className="text-xs text-gray-500">{doc.date}</p>
                                            </div>
                                        </div>
                                        <button className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-100">Cancel</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-lg">Save Project</button>
                </div>
            </div>
        </div>
    );
};

const InvestmentPlans: React.FC = () => {
    const [funds, setFunds] = useState<Fund[]>(INITIAL_FUNDS);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingFund, setEditingFund] = useState<Fund | null>(null);

    const totalAUM = funds.reduce((acc, f) => acc + f.capitalRaised, 0);
    const totalInvestors = funds.reduce((acc, f) => acc + f.investors, 0);

    const handleSaveFund = (fund: Fund) => {
        if (editingFund) {
            setFunds(prev => prev.map(f => f.id === fund.id ? fund : f));
        } else {
            setFunds(prev => [...prev, fund]);
        }
        setIsModalOpen(false);
        setEditingFund(null);
    };

    const handleEdit = (fund: Fund) => {
        setEditingFund(fund);
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setEditingFund(null);
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-10 pb-10">
            <button onClick={() => window.location.hash = '#/dashboard'} className="group flex items-center text-sm font-bold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Dashboard
            </button>
            
            <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                <div>
                    <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Renovation Fund Manager</h1>
                    <p className="text-lg text-gray-500 mt-2">Oversee capital allocation, fund performance, and investor relations.</p>
                </div>
                <button 
                    onClick={handleCreate}
                    className="px-6 py-3 bg-gray-900 text-white font-bold rounded-xl shadow-lg hover:bg-black hover:shadow-xl transition-all flex items-center"
                >
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Create New Fund
                </button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total AUM" value={`KES ${(totalAUM/1000000).toFixed(1)}M`} icon="revenue" color="#10b981" />
                <StatCard title="Active Funds" value={funds.length.toString()} icon="branch" color="#3b82f6" />
                <StatCard title="Total Investors" value={totalInvestors.toString()} icon="hr" color="#f59e0b" />
                <StatCard title="Avg. Return" value="14.2%" icon="analytics" color="#8b5cf6" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {funds.map(fund => (
                    <div key={fund.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden group">
                        <div className="p-6 flex-grow">
                            <div className="flex justify-between items-start mb-4">
                                <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wide ${
                                    fund.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                    {fund.status}
                                </span>
                                <button onClick={() => handleEdit(fund)} className="text-gray-400 hover:text-primary">
                                    <Icon name="settings" className="w-5 h-5" />
                                </button>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">{fund.name}</h3>
                            <p className="text-gray-500 text-sm mb-4 line-clamp-2">{fund.description}</p>
                            
                            {/* Progress Bar */}
                            <div className="space-y-1 mb-4">
                                <div className="flex justify-between text-xs font-bold text-gray-600">
                                    <span>Raised: KES {(fund.capitalRaised/1000000).toFixed(1)}M</span>
                                    <span>{Math.round((fund.capitalRaised/fund.targetCapital)*100)}%</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-primary" style={{ width: `${(fund.capitalRaised/fund.targetCapital)*100}%` }}></div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
                                <div>
                                    <p className="text-gray-400 text-xs uppercase">Landlord</p>
                                    <p className="font-semibold text-gray-800">{fund.landlordName || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400 text-xs uppercase">Interest</p>
                                    <p className="font-semibold text-green-600">{fund.clientInterestRate || 0}% / mo</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && <CreateEditFundModal fund={editingFund} onClose={() => setIsModalOpen(false)} onSave={handleSaveFund} />}
        </div>
    );
};

export default InvestmentPlans;
