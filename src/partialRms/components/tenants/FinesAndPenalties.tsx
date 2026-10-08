import React, { useState } from 'react';
import { FineRule } from '../../types';
import { useData } from '../../context/DataContext';

const FinesAndPenalties: React.FC = () => {
    const { fines, addFine, updateFine, deleteFine } = useData();
    const [isEditing, setIsEditing] = useState(false);
    const [currentFine, setCurrentFine] = useState<Partial<FineRule>>({});

    const handleAddNew = () => {
        setCurrentFine({ type: 'Other', basis: 'Fixed Fee', description: '', appliesTo: 'Tenant' });
        setIsEditing(true);
    };

    const handleEdit = (fine: FineRule) => {
        setCurrentFine(fine);
        setIsEditing(true);
    };

    const handleSave = () => {
        if (currentFine.id) {
             updateFine(currentFine.id, currentFine);
        } else {
             addFine({ ...currentFine, id: `fine-${Date.now()}` } as FineRule);
        }
        setIsEditing(false);
    };

    return (
        <div className="space-y-8 animate-fade-in p-2 md:p-4">
            <button onClick={() => window.location.hash = '#/partial-rms/tenants/overview'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Overview
            </button>
            <div>
                <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">Fines & Penalties Configuration <span className="text-sm font-semibold bg-primary/10 text-primary px-2.5 py-1 rounded ml-1 uppercase">Partial RMS</span></h1>
                <p className="text-lg text-gray-500 mt-1">
                    Define rules for automated fines and penalty charges. Late rent on the tenant grid also uses each tenant's due day, grace period, and default per-day estimate from the lease configuration.
                </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border shadow-sm">
                <div className="flex justify-end mb-4">
                     <button onClick={handleAddNew} className="px-4 py-2 bg-primary text-white rounded-lg shadow-sm hover:bg-primary-dark font-bold">Add Rule</button>
                </div>
                <ul className="space-y-3">
                    {fines.map(fine => (
                        <li key={fine.id} className="p-4 border border-gray-200 rounded-xl flex justify-between items-center hover:shadow-sm transition-shadow bg-white">
                            <div>
                                <p className="font-bold text-gray-800 text-lg">{fine.type}</p>
                                <p className="text-sm text-gray-600 mt-0.5">{fine.description}</p>
                                <span className="inline-block mt-2 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded">{fine.appliesTo}</span>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-xl text-red-600">{fine.basis === 'Fixed Fee' ? `KES ${fine.value.toLocaleString()}` : `${fine.value}%`}</p>
                                <div className="flex gap-2 justify-end items-center mt-1">
                                    <button onClick={() => handleEdit(fine)} className="text-primary text-sm hover:underline font-bold">Edit</button>
                                    <button onClick={() => { if (window.confirm(`Are you sure you want to delete the fine rule "${fine.type}"?`)) deleteFine(fine.id); }} className="text-red-500 hover:text-red-700 text-sm hover:underline font-bold">Delete</button>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            {isEditing && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4 text-gray-800">{currentFine.id ? 'Edit' : 'New'} Fine Rule</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Rule Type</label>
                                <input placeholder="e.g. Late Payment" value={currentFine.type} onChange={e => setCurrentFine({...currentFine, type: e.target.value as any})} className="w-full p-2 border rounded-lg focus:ring-primary focus:border-primary"/>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                                <input placeholder="Description" value={currentFine.description} onChange={e => setCurrentFine({...currentFine, description: e.target.value})} className="w-full p-2 border rounded-lg focus:ring-primary focus:border-primary"/>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Basis</label>
                                    <select value={currentFine.basis} onChange={e => setCurrentFine({...currentFine, basis: e.target.value as any})} className="w-full p-2 border rounded-lg bg-white focus:ring-primary focus:border-primary">
                                        <option>Fixed Fee</option>
                                        <option>Percentage</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Value</label>
                                    <input type="number" placeholder="Value" value={currentFine.value ?? ''} onChange={e => setCurrentFine({...currentFine, value: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0)})} className="w-full p-2 border rounded-lg focus:ring-primary focus:border-primary"/>
                                </div>
                            </div>
                        </div>
                         <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Cancel</button>
                            <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark font-bold">Save Rule</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinesAndPenalties;
