import React, { useState, useEffect, useMemo } from 'react';
import { fmtDate } from '../../utils/date';
import Icon from '../Icon';
import { Fund, BoQItem, RenovationInvestor, Investment } from '../../types';
import { useData } from '../../context/DataContext';
import { exportToCSV } from '../../utils/exportHelper';
import { getTodayIsoDate } from '../../utils/timezone';

// --- Stat Card ---
export const StatCard: React.FC<{ title: string; value: string; icon: string; color: string }> = ({ title, value, icon, color }) => (
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

// --- Add Investor Modal ---
const AddInvestorModal: React.FC<{ 
    investor?: RenovationInvestor | null;
    onClose: () => void; 
    onSave: (inv: RenovationInvestor) => void 
}> = ({ investor, onClose, onSave }) => {
    const [formData, setFormData] = useState<Partial<RenovationInvestor>>(investor || {
        name: '', email: '', phone: '', idNumber: '', residency: '', kraPin: '',
        nextOfKin: { name: '', phone: '', relationship: '' },
        authorizedRep: { name: '', phone: '', role: '' },
        groupMembersCount: 0,
        paymentDetails: { bankName: '', accountNumber: '', mpesaNumber: '' },
        status: 'Active', joinDate: getTodayIsoDate(),
        investorType: 'Individual'
    });

    useEffect(() => {
        if(investor) {
            setFormData(investor);
        }
    }, [investor]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = () => {
        if (!formData.name || !formData.phone) return alert("Name and Phone are required.");
        onSave({ ...formData, id: investor?.id || `inv-${Date.now()}` } as RenovationInvestor);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1300] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800">{investor ? 'Edit Investor' : 'Add Investor'}</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                    <input name="name" value={formData.name} onChange={handleChange} placeholder="Full Name" className="w-full p-2 border rounded" />
                    <input name="email" value={formData.email} onChange={handleChange} placeholder="Email" className="w-full p-2 border rounded" />
                    <input name="phone" value={formData.phone} onChange={handleChange} placeholder="Phone" className="w-full p-2 border rounded" />
                    <input name="idNumber" value={formData.idNumber} onChange={handleChange} placeholder="ID Number" className="w-full p-2 border rounded" />
                    <select name="investorType" value={formData.investorType} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                        <option value="Individual">Individual</option>
                        <option value="Chama">Chama</option>
                        <option value="Sacco">Sacco</option>
                        <option value="Corporate">Corporate</option>
                    </select>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded font-bold">Save Investor</button>
                </div>
            </div>
        </div>
    );
};

// --- Create/Edit Fund Modal ---
const CreateEditFundModal: React.FC<{ 
    fund?: Fund | null; 
    onClose: () => void;
    onSave: (fund: Fund) => void;
}> = ({ fund, onClose, onSave }) => {
    const { properties, landlords } = useData();
    const [activeTab, setActiveTab] = useState<'details' | 'stakeholder' | 'financials' | 'bq' | 'progress'>('details');
    
    // Form State
    const [formData, setFormData] = useState<Partial<Fund>>({
        name: '', description: '', targetApy: '30%', targetCapital: 0, 
        riskProfile: 'Medium', status: 'Active',
        landlordType: 'Internal', propertyType: 'Residential',
        clientInterestRate: 0, 
        renovationStartDate: '', renovationEndDate: '', 
        boq: [], documents: [], 
        progressUpdates: [],
        projectPic: ''
    });

    const [boqItems, setBoqItems] = useState<BoQItem[]>([]);
    const [progressUpdates, setProgressUpdates] = useState<any[]>([]);
    const [selectedPropertyId, setSelectedPropertyId] = useState('');

    // New Progress Update Form
    const [newUpdate, setNewUpdate] = useState({ date: getTodayIsoDate(), caption: '', imageUrl: '' });

    useEffect(() => {
        if (fund) {
            setFormData(fund);
            setBoqItems(fund.boq || []);
            setProgressUpdates(fund.progressUpdates || []);
        } else {
            setBoqItems([{ id: `bq-${Date.now()}`, description: '', unit: '', quantity: 0, rate: 0, amount: 0 }]);
        }
    }, [fund]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePropertySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const propId = e.target.value;
        setSelectedPropertyId(propId);
        const prop = properties.find(p => p.id === propId);
        if (prop) {
            const landlord = landlords.find(l => l.id === prop.landlordId);
            setFormData(prev => ({
                ...prev,
                landlordType: 'Internal',
                landlordId: landlord?.id,
                landlordName: landlord?.name || 'Unknown',
                landlordContact: landlord?.phone,
                propertyType: prop.type as any
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

    // Progress Logic
    const handleAddUpdate = () => {
        if (!newUpdate.caption) return alert("Caption required");
        const update = {
            id: `prog-${Date.now()}`,
            ...newUpdate
        };
        setProgressUpdates([update, ...progressUpdates]);
        setNewUpdate({ date: getTodayIsoDate(), caption: '', imageUrl: '' });
    };

    const removeUpdate = (id: string) => {
        setProgressUpdates(prev => prev.filter(u => u.id !== id));
    };

    // File Upload Simulation
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'projectPic' | 'landlordPic' | 'document' | 'progress') => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                const res = reader.result as string;
                if (field === 'document') {
                    setFormData(prev => ({
                        ...prev,
                        documents: [...(prev.documents || []), { name: file.name, url: '#', date: getTodayIsoDate() }]
                    }));
                } else if (field === 'progress') {
                    setNewUpdate(prev => ({ ...prev, imageUrl: res }));
                } else {
                    setFormData(prev => ({ ...prev, [field]: res }));
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
            progressUpdates: progressUpdates,
        } as Fund;
        onSave(finalData);
    };

    const handleDownloadBQ = () => {
        exportToCSV(boqItems.map(i => ({ Description: i.description, Unit: i.unit, Qty: i.quantity, Rate: i.rate, Amount: i.amount })), `BQ_${formData.name}`);
    };

    const boqTotal = boqItems.reduce((sum, item) => sum + item.amount, 0);

    return (
        <div className="fixed inset-0 bg-black/60 z-[1200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-900">{fund ? 'Edit Fund & Project' : 'Create New Fund'}</h2>
                    <button onClick={onClose}><Icon name="close" className="w-6 h-6 text-gray-500" /></button>
                </div>

                <div className="flex border-b bg-gray-50 overflow-x-auto">
                    {['details', 'stakeholder', 'financials', 'bq', 'progress'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-6 py-3 text-sm font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${activeTab === tab ? 'bg-white text-primary border-t-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {tab === 'bq' ? 'Bill of Quantities' : tab}
                        </button>
                    ))}
                </div>

                <div className="flex-grow overflow-y-auto p-8 bg-gray-50/50">
                    {/* DETAILS TAB */}
                    {activeTab === 'details' && (
                        <div className="space-y-6">
                            <div className="flex gap-6">
                                <div className="w-40 h-32 bg-gray-200 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group hover:border-primary">
                                    {formData.projectPic ? (
                                        <img src={formData.projectPic} className="w-full h-full object-cover" alt="Project" />
                                    ) : (
                                        <>
                                            <Icon name="branch" className="w-8 h-8 text-gray-400" />
                                            <span className="text-xs text-gray-500 mt-1">Project Display Pic</span>
                                        </>
                                    )}
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleFileUpload(e, 'projectPic')} accept="image/*" />
                                </div>
                                <div className="flex-grow space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Project Name</label>
                                        <input name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Urban Renewal Phase 1" className="w-full p-3 border rounded-lg" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Status</label>
                                        <select name="status" value={formData.status} onChange={handleChange} className="w-full p-3 border rounded-lg bg-white">
                                            <option value="Active">Active (Raising)</option>
                                            <option value="Fully Funded">Fully Funded</option>
                                            <option value="Closing Soon">Closing Soon</option>
                                            <option value="Project Completed">Project Completed</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Description & Strategy</label>
                                <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Detailed description of the investment opportunity..." rows={4} className="w-full p-3 border rounded-lg" />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Property Type</label>
                                    <select name="propertyType" value={formData.propertyType} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                        <option>Residential</option>
                                        <option>Commercial</option>
                                        <option>Mixed Use</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Risk Profile</label>
                                    <select name="riskProfile" value={formData.riskProfile} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                        <option>Low</option>
                                        <option>Medium</option>
                                        <option>High</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STAKEHOLDER TAB */}
                    {activeTab === 'stakeholder' && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Landlord Source</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center p-3 border rounded cursor-pointer bg-white hover:bg-gray-50 w-1/2">
                                        <input type="radio" name="landlordType" value="Internal" checked={formData.landlordType === 'Internal'} onChange={handleChange} className="mr-2" />
                                        Existing Landlord
                                    </label>
                                    <label className="flex items-center p-3 border rounded cursor-pointer bg-white hover:bg-gray-50 w-1/2">
                                        <input type="radio" name="landlordType" value="External" checked={formData.landlordType === 'External'} onChange={handleChange} className="mr-2" />
                                        External Partner
                                    </label>
                                </div>
                            </div>

                            {formData.landlordType === 'Internal' ? (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Property</label>
                                    <select onChange={handlePropertySelect} value={selectedPropertyId} className="w-full p-3 border rounded bg-white">
                                        <option value="">-- Link to Property --</option>
                                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">This will auto-fill the landlord details.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Landlord Name</label>
                                        <input name="landlordName" value={formData.landlordName} onChange={handleChange} className="w-full p-2 border rounded" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact Info</label>
                                        <input name="landlordContact" value={formData.landlordContact} onChange={handleChange} className="w-full p-2 border rounded" />
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-6 items-center border-t pt-6">
                                <div className="w-24 h-24 bg-gray-100 rounded-full border flex items-center justify-center overflow-hidden relative group">
                                    {formData.landlordPic ? <img src={formData.landlordPic} className="w-full h-full object-cover" alt="Landlord"/> : <Icon name="user-circle" className="w-12 h-12 text-gray-400"/>}
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleFileUpload(e, 'landlordPic')} accept="image/*" />
                                </div>
                                <div className="flex-grow">
                                    <h4 className="font-bold text-gray-800">Stakeholder Profile</h4>
                                    <p className="text-sm text-gray-500">Name: {formData.landlordName || 'N/A'}</p>
                                    <p className="text-sm text-gray-500">Contact: {formData.landlordContact || 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* FINANCIALS TAB */}
                    {activeTab === 'financials' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Target Capital (KES)</label>
                                    <input type="number" name="targetCapital" value={formData.targetCapital} onChange={handleChange} className="w-full p-3 border rounded-lg font-mono" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Target APY (%)</label>
                                    <input name="targetApy" value={formData.targetApy} onChange={handleChange} className="w-full p-3 border rounded-lg" placeholder="e.g. 14-16%" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Renovation Start</label>
                                    <input type="date" name="renovationStartDate" value={formData.renovationStartDate} onChange={handleChange} className="w-full p-3 border rounded-lg" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Renovation End (Est.)</label>
                                    <input type="date" name="renovationEndDate" value={formData.renovationEndDate} onChange={handleChange} className="w-full p-3 border rounded-lg" />
                                </div>
                            </div>

                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <label className="block text-sm font-bold text-blue-800 mb-1">Client Interest Rate (% Monthly)</label>
                                <input type="number" step="0.1" name="clientInterestRate" value={formData.clientInterestRate} onChange={handleChange} className="w-full p-2 border border-blue-200 rounded max-w-xs" placeholder="e.g. 1.5" />
                                <p className="text-xs text-blue-600 mt-2">Interest charged to the landlord on the renovation capital advanced.</p>
                            </div>
                        </div>
                    )}

                    {/* BOQ TAB */}
                    {activeTab === 'bq' && (
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-800">Bill of Quantities</h3>
                                <div className="flex gap-2">
                                    <button onClick={handleDownloadBQ} className="text-sm bg-gray-100 px-3 py-1 rounded hover:bg-gray-200 text-gray-700">Download CSV</button>
                                    <button onClick={addBoqItem} className="text-sm bg-primary text-white px-3 py-1 rounded hover:bg-primary-dark">+ Add Item</button>
                                </div>
                            </div>
                            <div className="border rounded-lg overflow-hidden shadow-sm">
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
                                    <tbody className="bg-white">
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

                    {/* PROGRESS TAB */}
                    {activeTab === 'progress' && (
                        <div className="space-y-6">
                            {/* Add Update Form */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <h4 className="text-sm font-bold text-gray-700 mb-3 uppercase">Add Progress Update</h4>
                                <div className="flex gap-4 items-start">
                                    <div className="w-24 h-24 bg-white border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer relative overflow-hidden">
                                        {newUpdate.imageUrl ? <img src={newUpdate.imageUrl} className="w-full h-full object-cover" /> : <span className="text-xs text-gray-400">Add Photo</span>}
                                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleFileUpload(e, 'progress')} accept="image/*" />
                                    </div>
                                    <div className="flex-grow space-y-2">
                                        <input type="date" value={newUpdate.date} onChange={e => setNewUpdate({...newUpdate, date: e.target.value})} className="w-full p-2 border rounded" />
                                        <input value={newUpdate.caption} onChange={e => setNewUpdate({...newUpdate, caption: e.target.value})} placeholder="Caption (e.g. Foundation complete)" className="w-full p-2 border rounded" />
                                        <button onClick={handleAddUpdate} className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700">Add Update</button>
                                    </div>
                                </div>
                            </div>

                            {/* Timeline */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-gray-700 uppercase">Timeline</h4>
                                {progressUpdates.length > 0 ? (
                                    progressUpdates.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(update => (
                                        <div key={update.id} className="flex gap-4 p-3 border rounded-lg bg-white shadow-sm relative group">
                                            <img src={update.imageUrl} alt="Update" className="w-20 h-20 object-cover rounded-md bg-gray-200" />
                                            <div>
                                                <p className="text-xs text-gray-500 font-bold">{update.date}</p>
                                                <p className="text-sm text-gray-800 mt-1">{update.caption}</p>
                                            </div>
                                            <button onClick={() => removeUpdate(update.id)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"><Icon name="close" className="w-4 h-4" /></button>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-gray-400 text-sm italic">No progress updates yet.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-white rounded-b-2xl flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-100 rounded-lg text-gray-700 font-bold hover:bg-gray-200">Cancel</button>
                    <button onClick={handleSave} className="px-8 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-lg">Save Project</button>
                </div>
            </div>
        </div>
    );
};

// --- Project Detail Modal (Exported) ---
export const ProjectDetailModal: React.FC<{ project: Fund; onClose: () => void }> = ({ project, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black/60 z-[1500] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl p-6 h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">{project.name}</h2>
                    <button onClick={onClose}><Icon name="close" className="w-6 h-6 text-gray-500" /></button>
                </div>
                
                {project.projectPic && (
                    <img src={project.projectPic} alt="Project" className="w-full h-48 object-cover rounded-xl mb-6 shadow-sm" />
                )}

                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard title="Target" value={`KES ${project.targetCapital.toLocaleString()}`} icon="revenue" color="#3b82f6" />
                        <StatCard title="Raised" value={`KES ${project.capitalRaised.toLocaleString()}`} icon="wallet" color="#10b981" />
                        <StatCard title="Investors" value={project.investors.toString()} icon="hr" color="#f59e0b" />
                        <StatCard title="APY" value={project.targetApy} icon="analytics" color="#8b5cf6" />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                            <h3 className="font-bold text-gray-700 mb-2">Project Description</h3>
                            <p className="text-sm text-gray-600">{project.description}</p>
                        </div>
                         
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                             <h3 className="font-bold text-gray-700 mb-2">Progress Gallery</h3>
                             <div className="flex gap-2 overflow-x-auto pb-2">
                                {project.progressUpdates && project.progressUpdates.length > 0 ? (
                                    project.progressUpdates.map((u, i) => (
                                        <div key={i} className="flex-shrink-0 w-24">
                                            <img src={u.imageUrl} className="w-24 h-24 object-cover rounded shadow-sm border border-gray-200" alt="Update"/>
                                            <p className="text-[10px] text-gray-500 truncate mt-1">{u.date}</p>
                                        </div>
                                    ))
                                ) : <p className="text-xs text-gray-400 italic">No updates yet.</p>}
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Record Investment Modal (Admin/Manager Use) ---
const RecordInvestmentModal: React.FC<{ 
    funds: Fund[]; 
    renovationInvestors: RenovationInvestor[];
    initialFundId?: string;
    onClose: () => void;
    onSubmit: (inv: Partial<Investment>) => void;
}> = ({ funds, renovationInvestors, initialFundId, onClose, onSubmit }) => {
    const [selectedFundId, setSelectedFundId] = useState(initialFundId || '');
    const [selectedInvestorId, setSelectedInvestorId] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(getTodayIsoDate());

    useEffect(() => {
        if (initialFundId) setSelectedFundId(initialFundId);
    }, [initialFundId]);

    const handleSubmit = () => {
        if (!selectedFundId || !selectedInvestorId || !amount) return alert("All fields required");
        const fundName = funds.find(f => f.id === selectedFundId)?.name || 'Unknown';
        
        onSubmit({
            fundId: selectedFundId,
            fundName,
            amount: parseFloat(amount),
            date,
            strategy: 'Monthly Payout',
            status: 'Active',
            accruedInterest: 0
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1400] p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-gray-800 mb-4">Record New Investment</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Select Investor</label>
                        <select value={selectedInvestorId} onChange={e => setSelectedInvestorId(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                            <option value="">-- Choose Investor --</option>
                            {renovationInvestors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Select Fund</label>
                        <select value={selectedFundId} onChange={e => setSelectedFundId(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                            <option value="">-- Choose Project --</option>
                            {funds.filter(f => f.status !== 'Fully Funded' && f.status !== 'Project Completed').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Amount (KES)</label>
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded-lg font-bold" placeholder="50,000"/>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded-lg" />
                    </div>
                    <button onClick={handleSubmit} className="w-full bg-green-600 text-white py-3 rounded-lg font-bold mt-4 shadow-md hover:bg-green-700">
                        Confirm Record
                    </button>
                </div>
            </div>
        </div>
    );
};

const InvestmentPlans: React.FC = () => {
    const { 
        funds, updateFund, addFund, deleteFund, 
        renovationInvestors, addRenovationInvestor, updateRenovationInvestor, deleteRenovationInvestor,
        addInvestment, checkPermission 
    } = useData();
    const [activeMainTab, setActiveMainTab] = useState<'Projects' | 'Investors'>('Projects');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isInvestorModalOpen, setIsInvestorModalOpen] = useState(false);
    const [isInvestRecordOpen, setIsInvestRecordOpen] = useState(false);
    const [editingFund, setEditingFund] = useState<Fund | null>(null);
    const [editingInvestor, setEditingInvestor] = useState<RenovationInvestor | null>(null);
    const [selectedFund, setSelectedFund] = useState<Fund | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [investFundId, setInvestFundId] = useState<string | undefined>(undefined);

    const totalAUM = funds.reduce((acc, f) => acc + f.capitalRaised, 0);
    const totalInvestors = renovationInvestors.length;
    const reserveFunds = totalAUM * 0.30;
    const availableFunds = totalAUM * 0.70;

    const canEdit = checkPermission('R-Reits', 'edit');
    const canDelete = checkPermission('R-Reits', 'delete');

    const handleSaveFund = (fund: Fund) => {
        if (editingFund) {
            updateFund(fund.id, fund);
        } else {
            addFund(fund);
        }
        setIsModalOpen(false);
        setEditingFund(null);
    };

    const handleSaveInvestor = (inv: RenovationInvestor) => {
        if (editingInvestor) {
            updateRenovationInvestor(inv.id, inv);
        } else {
            addRenovationInvestor(inv);
        }
        setIsInvestorModalOpen(false);
        setEditingInvestor(null);
    };
    
    const handleDeleteFund = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this project?")) {
            deleteFund(id);
        }
    };

    const handleDeleteInvestor = (id: string) => {
        if (confirm("Are you sure you want to delete this investor?")) {
            deleteRenovationInvestor(id);
        }
    };

    const handleEdit = (e: React.MouseEvent, fund: Fund) => {
        e.stopPropagation();
        setEditingFund(fund);
        setIsModalOpen(true);
    };

    const handleEditInvestor = (inv: RenovationInvestor) => {
        setEditingInvestor(inv);
        setIsInvestorModalOpen(true);
    };

    const handleCreate = () => {
        setEditingFund(null);
        setIsModalOpen(true);
    };

    const handleAddInvestor = () => {
        setEditingInvestor(null);
        setIsInvestorModalOpen(true);
    };

    const handleInvestClick = (e: React.MouseEvent, fund: Fund) => {
        e.stopPropagation();
        setInvestFundId(fund.id);
        setIsInvestRecordOpen(true);
    };

    const handleRecordInvestment = (inv: Partial<Investment>) => {
        const newInv: Investment = {
            ...inv,
            id: `inv-${Date.now()}`,
        } as Investment;
        
        // 1. Add Investment
        addInvestment(newInv);

        // 2. Update Fund Stats
        const targetFund = funds.find(f => f.id === newInv.fundId);
        if (targetFund) {
             const newCapital = targetFund.capitalRaised + (newInv.amount || 0);
             const newInvestors = targetFund.investors + 1;
             const newStatus = newCapital >= targetFund.targetCapital ? 'Fully Funded' : targetFund.status;
             updateFund(targetFund.id, {
                capitalRaised: newCapital,
                investors: newInvestors,
                status: newStatus
             });
        }
        setIsInvestRecordOpen(false);
    };

    const filteredInvestors = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return renovationInvestors.filter(i => i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q));
    }, [renovationInvestors, searchQuery]);

    return (
        <div className="space-y-10 pb-10">
             <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                <div>
                    <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">R-Reits Manager</h1>
                    <p className="text-lg text-gray-500 mt-2">Oversee capital allocation, fund performance, and investor relations.</p>
                </div>
                <div className="flex gap-3 bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setActiveMainTab('Projects')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeMainTab === 'Projects' ? 'bg-white text-primary shadow' : 'text-gray-600'}`}>Projects</button>
                    <button onClick={() => setActiveMainTab('Investors')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeMainTab === 'Investors' ? 'bg-white text-primary shadow' : 'text-gray-600'}`}>Investors</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total AUM" value={`KES ${(totalAUM/1000000).toFixed(1)}M`} icon="revenue" color="#10b981" />
                <StatCard title="Reserve Funds (30%)" value={`KES ${(reserveFunds/1000000).toFixed(1)}M`} icon="wallet" color="#6366f1" />
                <StatCard title="Available Funds (70%)" value={`KES ${(availableFunds/1000000).toFixed(1)}M`} icon="payments" color="#3b82f6" />
                <StatCard title="Total Investors" value={totalInvestors.toString()} icon="hr" color="#f59e0b" />
            </div>

            {activeMainTab === 'Projects' && (
                <>
                    <div className="flex justify-end">
                        {canEdit && (
                            <button onClick={handleCreate} className="px-6 py-2 bg-gray-900 text-white font-bold rounded-xl shadow-lg hover:bg-black hover:shadow-xl transition-all flex items-center">
                                <Icon name="plus" className="w-5 h-5 mr-2" /> Create New Fund
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {funds.map(fund => {
                            const isFunded = fund.capitalRaised >= fund.targetCapital;
                            const isComplete = fund.status === 'Project Completed';
                            
                            return (
                                <div key={fund.id} onClick={() => setSelectedFund(fund)} className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden group cursor-pointer h-full">
                                    {/* Cover Image */}
                                    <div className="h-40 bg-gray-200 relative">
                                        {fund.projectPic ? (
                                            <img src={fund.projectPic} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt={fund.name} />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-gray-400">
                                                <Icon name="branch" className="w-12 h-12 opacity-30" />
                                            </div>
                                        )}
                                        <div className="absolute top-3 right-3">
                                            <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wide shadow-sm ${
                                                fund.status === 'Active' ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'
                                            }`}>
                                                {fund.status}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-6 flex-grow flex flex-col">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="text-xl font-bold text-gray-900 group-hover:text-primary transition-colors line-clamp-1">{fund.name}</h3>
                                            <div className="flex gap-1">
                                                {canEdit && (
                                                    <button onClick={(e) => handleEdit(e, fund)} className="text-gray-400 hover:text-primary p-1 rounded-full hover:bg-gray-100" title="Edit">
                                                        <Icon name="settings" className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {canDelete && (
                                                     <button onClick={(e) => handleDeleteFund(e, fund.id)} className="text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-gray-100" title="Delete">
                                                        <Icon name="close" className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <p className="text-gray-500 text-sm mb-4 line-clamp-2 flex-grow">{fund.description}</p>
                                        
                                        <div className="space-y-1 mb-6">
                                            <div className="flex justify-between text-xs font-bold text-gray-600">
                                                <span>Raised: KES {(fund.capitalRaised/1000000).toFixed(1)}M</span>
                                                <span>{Math.round((fund.capitalRaised/fund.targetCapital)*100)}%</span>
                                            </div>
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (fund.capitalRaised/fund.targetCapital)*100)}%` }}></div>
                                            </div>
                                            <div className="text-right text-[10px] text-gray-400">Target: KES {(fund.targetCapital/1000000).toFixed(1)}M</div>
                                        </div>

                                        <div className="mt-auto">
                                            {isComplete ? (
                                                <button disabled className="w-full py-3 bg-gray-200 text-gray-500 font-bold rounded-lg cursor-not-allowed">
                                                    Project Complete
                                                </button>
                                            ) : isFunded ? (
                                                <button disabled className="w-full py-3 bg-green-100 text-green-700 font-bold rounded-lg cursor-not-allowed">
                                                    Fully Funded
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={(e) => handleInvestClick(e, fund)}
                                                    className="w-full py-3 bg-gray-900 text-white font-bold rounded-lg shadow-md hover:bg-black transition-colors flex items-center justify-center"
                                                >
                                                    <Icon name="revenue" className="w-4 h-4 mr-2" /> Invest Now
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {activeMainTab === 'Investors' && (
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex justify-between items-center mb-6">
                        <div className="relative w-full max-w-md">
                            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search investors..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary focus:border-primary" />
                            <div className="absolute left-3 top-2.5 text-gray-400"><Icon name="search" className="w-5 h-5" /></div>
                        </div>
                        {canEdit && (
                            <button onClick={handleAddInvestor} className="px-6 py-2 bg-primary text-white font-bold rounded-lg shadow hover:bg-primary-dark flex items-center">
                                <Icon name="plus" className="w-5 h-5 mr-2" /> Add Investor
                            </button>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-6 py-3">Name</th>
                                    <th className="px-6 py-3">Contact</th>
                                    <th className="px-6 py-3">ID / Residency</th>
                                    <th className="px-6 py-3">Joined</th>
                                    <th className="px-6 py-3 text-center">Status</th>
                                    {(canEdit || canDelete) && <th className="px-6 py-3 text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredInvestors.map(inv => (
                                    <tr key={inv.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">{inv.name}</td>
                                        <td className="px-6 py-4 text-gray-600">{inv.email}</td>
                                        <td className="px-6 py-4 text-gray-600">{inv.idNumber}</td>
                                        <td className="px-6 py-4 text-gray-600">{fmtDate(inv.joinDate)}</td>
                                        <td className="px-6 py-4 text-center"><span className="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">{inv.status}</span></td>
                                        {(canEdit || canDelete) && (
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {canEdit && (
                                                        <button onClick={() => handleEditInvestor(inv)} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50" title="Edit">
                                                            <Icon name="settings" className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button onClick={() => handleDeleteInvestor(inv.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50" title="Delete">
                                                            <Icon name="close" className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {isModalOpen && <CreateEditFundModal fund={editingFund} onClose={() => setIsModalOpen(false)} onSave={handleSaveFund} />}
            {isInvestorModalOpen && <AddInvestorModal investor={editingInvestor} onClose={() => setIsInvestorModalOpen(false)} onSave={handleSaveInvestor} />}
            {selectedFund && <ProjectDetailModal project={selectedFund} onClose={() => setSelectedFund(null)} />}
            {isInvestRecordOpen && (
                <RecordInvestmentModal 
                    funds={funds} 
                    renovationInvestors={renovationInvestors}
                    initialFundId={investFundId}
                    onClose={() => setIsInvestRecordOpen(false)}
                    onSubmit={handleRecordInvestment}
                />
            )}
        </div>
    );
};

export default InvestmentPlans;
