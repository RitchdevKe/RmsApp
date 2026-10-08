
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { Property, Unit, TenantProfile } from '../../types';
import Icon from '../Icon';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement, Filler } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { PropertyForm } from '../registration/Properties';
import { getMonthPrefix, sumPaidPaymentsForMonth } from '../../utils/paymentReporting';
import { fmtDate } from '../../utils/date';
import { computeTenantArrears } from '../../utils/tenantArrears';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

// --- HELPER COMPONENTS ---

const ChartContainer: React.FC<{ type: 'line' | 'bar'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
    return (
        <div className={`relative ${height} w-full`}>
            {type === 'line' ? <Line data={data} options={options} /> : <Bar data={data} options={options} />}
        </div>
    );
};

const UNIT_TYPES = ['Single Room', 'Double Room', 'Bedsitter', 'Studio', 'One Bedroom', 'Two Bedrooms', 'Three Bedrooms', 'Shop', 'Office'];
const BEDROOM_UNIT_TYPES = new Set(['One Bedroom', 'Two Bedrooms', 'Three Bedrooms']);

// Add Unit Modal for Field Ops
const AddUnitModal: React.FC<{ property: Property; onClose: () => void; onAdd: (unit: Partial<Unit>) => void }> = ({ property, onClose, onAdd }) => {
    const [unitType, setUnitType] = useState('');
    const [formData, setFormData] = useState({ unitNumber: '', bedrooms: '0', bathrooms: '0', floor: '', rent: property.defaultMonthlyRent ? String(property.defaultMonthlyRent) : '' });

    const isBedroomType = BEDROOM_UNIT_TYPES.has(unitType);

    const handleTypeChange = (type: string) => {
        setUnitType(type);
        const bc = type === 'One Bedroom' ? '1' : type === 'Two Bedrooms' ? '2' : type === 'Three Bedrooms' ? '3' : '0';
        setFormData(p => ({ ...p, bedrooms: bc, bathrooms: bc !== '0' ? '1' : '0' }));
    };

    const handleSubmit = () => {
        if(!formData.unitNumber) return alert("Unit Number Required");
        if(!unitType) return alert("Unit Type Required");
        onAdd({
            unitNumber: formData.unitNumber,
            unitType,
            bedrooms: parseInt(formData.bedrooms) || 0,
            bathrooms: parseInt(formData.bathrooms) || 0,
            floor: parseInt(formData.floor) || 0,
            rent: parseInt(formData.rent) || property.defaultMonthlyRent || 0
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500] p-4" onClick={onClose}>
             <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold mb-4">Add Unit to {property.name}</h3>
                <div className="space-y-3">
                    <input placeholder="Unit Number (e.g. A1)" value={formData.unitNumber} onChange={e => setFormData({...formData, unitNumber: e.target.value})} className="w-full p-2 border rounded"/>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">Unit Type</label>
                        <select value={unitType} onChange={e => handleTypeChange(e.target.value)} className="w-full p-2 border rounded bg-white">
                            <option value="">Select Type</option>
                            {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                         <div className="flex flex-col">
                            <label className="text-xs text-gray-500 mb-1">Floor</label>
                            <input type="number" value={formData.floor} onChange={e => setFormData({...formData, floor: e.target.value})} placeholder="0" className="p-2 border rounded"/>
                         </div>
                         <div className="flex flex-col">
                            <label className="text-xs text-gray-500 mb-1">Rent</label>
                            <input type="number" value={formData.rent} onChange={e => setFormData({...formData, rent: e.target.value})} placeholder="0" className="p-2 border rounded"/>
                         </div>
                    </div>
                    {isBedroomType && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col">
                                <label className="text-xs text-gray-500 mb-1">Bedrooms</label>
                                <input type="number" value={formData.bedrooms} onChange={e => setFormData({...formData, bedrooms: e.target.value})} className="p-2 border rounded"/>
                            </div>
                            <div className="flex flex-col">
                                <label className="text-xs text-gray-500 mb-1">Bathrooms</label>
                                <input type="number" value={formData.bathrooms} onChange={e => setFormData({...formData, bathrooms: e.target.value})} className="p-2 border rounded"/>
                            </div>
                        </div>
                    )}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-sm font-bold">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded text-sm font-bold">Add Unit</button>
                </div>
             </div>
        </div>
    )
}

// --- Sub-Components ---

const PropertyCard: React.FC<{ 
    property: Property; 
    landlordName: string;
    stats: { 
        totalUnits: number; 
        occupiedUnits: number; 
        occupancyRate: number; 
        expectedRent: number; 
        collectedRent: number; 
        collectionRate: number; 
    };
    onClick: () => void;
    onViewLandlord: (e: React.MouseEvent) => void;
}> = ({ property, landlordName, stats, onClick, onViewLandlord }) => {
    return (
        <div 
            onClick={onClick}
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 hover:shadow-lg transition-all cursor-pointer group relative overflow-hidden"
        >
            <div className="flex items-center gap-4 mb-4">
                <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold border border-blue-100 group-hover:scale-110 transition-transform">
                    {property.name.charAt(0)}
                </div>
                <div>
                    <h3 className="font-bold text-gray-800 text-lg group-hover:text-primary transition-colors">{property.name}</h3>
                    <p className="text-xs text-gray-500">{property.subLocation && property.zone ? `${property.subLocation} (${property.zone})` : (property.subLocation || property.zone || property.location || property.branch || '')}</p>
                </div>
            </div>

            <div className="mb-4">
                <button 
                    onClick={onViewLandlord}
                    className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors flex items-center w-fit border border-blue-100"
                >
                    <Icon name="user-circle" className="w-3 h-3 mr-1" />
                    Owner: {landlordName}
                </button>
            </div>

            <div className="flex justify-between items-center mb-6 bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div className="text-center flex-1 border-r border-gray-200">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Units</p>
                    <p className="text-lg font-bold text-gray-800">{stats.totalUnits}</p>
                </div>
                <div className="text-center flex-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Vacant</p>
                    <p className="text-lg font-bold text-gray-800">{stats.totalUnits - stats.occupiedUnits}</p>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <div className="flex justify-between items-end mb-1">
                        <span className="text-xs font-bold text-gray-600">Occupancy</span>
                        <span className={`text-xs font-bold ${stats.occupancyRate >= 90 ? 'text-green-600' : 'text-orange-500'}`}>{stats.occupancyRate}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                        <div 
                            className={`h-2 rounded-full ${stats.occupancyRate >= 90 ? 'bg-green-500' : 'bg-orange-400'}`} 
                            style={{ width: `${stats.occupancyRate}%` }}
                        ></div>
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-end mb-1">
                        <span className="text-xs font-bold text-gray-600">Collection (MTD)</span>
                        <span className={`text-xs font-bold ${stats.collectionRate >= 90 ? 'text-blue-600' : 'text-blue-500'}`}>{stats.collectionRate}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                        <div 
                            className="h-2 rounded-full bg-blue-600"
                            style={{ width: `${stats.collectionRate}%` }}
                        ></div>
                    </div>
                </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Amount Collected (MTD)</p>
                <div className="flex justify-between items-end">
                    <p className="text-xl font-extrabold text-gray-900">KES {(stats.collectedRent/1000).toFixed(1)}k</p>
                    <Icon name="chevron-down" className="w-5 h-5 text-gray-300 -rotate-90" />
                </div>
            </div>
        </div>
    );
};

const UnitBox: React.FC<{ 
    unit: Unit; 
    tenant?: TenantProfile; 
    isNewTenant?: boolean; 
    onManage?: () => void;
    onToggleLock?: () => void; // New callback for locking
}> = ({ unit, tenant, isNewTenant, onManage, onToggleLock }) => {
    const statusColor = useMemo(() => {
        // If unit is occupied by a tenant, tenant-state always wins (fixes
        // units that still carry a stale unit.status === 'Vacant' even after
        // a tenant has been allocated to them).
        if (tenant) {
            if (tenant.status === 'Notice') return 'bg-orange-50 border-orange-200 text-orange-800';
            if (tenant.status === 'Overdue') return 'bg-red-50 border-red-200 text-red-900';
            return 'bg-green-50 border-green-200 text-green-800';
        }
        // Unit status priorities (no tenant)
        if (unit.status === 'Unhabitable') return 'bg-gray-800 border-gray-900 text-white';
        if (unit.status === 'Distressed') return 'bg-purple-50 border-purple-200 text-purple-800';
        if (unit.status === 'Under Maintenance') return 'bg-yellow-50 border-yellow-200 text-yellow-800';
        return 'bg-red-50 border-red-200 text-red-800';
    }, [unit.status, tenant]);

    const handleClick = () => {
        if (tenant) {
            window.location.hash = `#/tenants/active-tenants?tenantId=${tenant.id}`;
        } else if (onManage) {
            onManage();
        }
    };

    return (
        <div 
            className={`p-3 rounded-lg border ${statusColor} flex flex-col justify-between h-28 text-xs relative group cursor-pointer transition-all hover:shadow-md overflow-hidden`} 
            onClick={handleClick}
        >
            <div className="flex justify-between items-start">
                <span className="font-bold text-lg">{unit.unitNumber}</span>
                <span className="opacity-70 bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{unit.unitType || `${unit.bedrooms}BR`}</span>
            </div>
           
            <div className="mt-1">
                {tenant ? (
                    <>
                        <p className="font-semibold truncate text-sm" title={tenant.name}>{tenant.name}</p>
                        {isNewTenant && (
                            <div className="inline-block bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded mt-1 font-bold uppercase shadow-sm animate-pulse">
                                New Tenant
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex items-center justify-between">
                        <span className="italic opacity-80 text-sm font-semibold">{unit.status}</span>
                        {/* Lock Toggle for Vacant Units */}
                        {unit.status === 'Vacant' && onToggleLock && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
                                className={`text-[10px] px-2 py-0.5 rounded border transition-colors flex items-center ${unit.isLocked ? 'bg-black text-white border-black' : 'bg-white text-red-600 border-red-200 hover:bg-red-50'}`}
                                title={unit.isLocked ? "Unlock Unit" : "Lock Unit"}
                            >
                                <Icon name={unit.isLocked ? "keys" : "tools"} className="w-3 h-3 mr-1" />
                                {unit.isLocked ? 'LOCKED' : 'Open'}
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-auto pt-2 border-t border-black/5 flex justify-between items-center">
                <span className="opacity-80 font-mono">{unit.rent ? `KES ${unit.rent.toLocaleString()}` : '-'}</span>
                {tenant?.leaseEnd && (
                    <span className="text-[9px] opacity-70">
                        End: {fmtDate(tenant.leaseEnd)}
                    </span>
                )}
            </div>

            {/* Badges */}
            {(!tenant && unit.status !== 'Occupied' && unit.status !== 'Vacant') && (
                <div className="absolute top-0 right-0 bg-gray-900 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold opacity-80">
                    {unit.status.toUpperCase()}
                </div>
            )}
            {tenant?.status === 'Notice' && (
                <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold">
                    VACATING
                </div>
            )}
             {tenant?.status === 'Overdue' && (
                <div className="absolute top-0 right-0 bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold">
                    ARREARS
                </div>
            )}
            
            {/* Visual indicator for locked vacant unit */}
            {unit.status === 'Vacant' && unit.isLocked && (
                <div className="absolute bottom-1 right-1 opacity-20">
                     <Icon name="keys" className="w-8 h-8 text-black" />
                </div>
            )}
        </div>
    );
};

// --- Detailed View ---

const PropertyDetailView: React.FC<{ property: Property; onClose: () => void }> = ({ property, onClose }) => {
    const { tenants, landlords, tasks, addUnitToProperty, updateProperty, updateTenant, fines } = useData() as any;
    const [activeTab, setActiveTab] = useState<'Overview' | 'Units' | 'Financials' | 'Communication'>('Overview');
    const [period, setPeriod] = useState(getCurrentMonthIso()); // YYYY-MM
    const [selectedDayFilter, setSelectedDayFilter] = useState<number>(30); 
    const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);

    // --- Stats Calculation ---
    const totalUnits = property.units.length;
    const occupiedUnits = property.units.filter(u => u.status === 'Occupied').length;
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
    const vacantCount = totalUnits - occupiedUnits;

    // Tenants in this property
    const propTenants = useMemo(() => tenants.filter(t => t.propertyId === property.id), [tenants, property.id]);
    const landlord = landlords.find(l => l.id === property.landlordId);
    
    // Financials
    const expectedRent = propTenants.filter(t => t.status !== 'Vacated' && t.status !== 'Evicted').reduce((sum, t) => sum + (t.rentAmount || 0), 0);
    
    const collectedRent = propTenants.reduce((sum, t) => sum + sumPaidPaymentsForMonth(t, period), 0);

    const collectionRate = expectedRent > 0 ? Math.round((collectedRent / expectedRent) * 100) : 0;
    const currentMonthIsoForArrears = getCurrentMonthIso();
    const propArrearsList = propTenants.map(t => {
        try { return computeTenantArrears(t, currentMonthIsoForArrears, { allTenants: tenants }).totalArrears || 0; }
        catch { return 0; }
    });
    const arrearsCount = propArrearsList.filter(a => a > 0).length;
    const arrearsAmount = propArrearsList.reduce((s, a) => s + a, 0);

    // Graph Data Logic (Simplified for brevity as it's same as Landlord Portal)
    const paymentPerformanceLogic = useMemo(() => {
        // ... (Same logic as Landlord Portal - kept simple here for focus on locking)
        return { graphData: [], tablePayments: [], currentPercentage: 0 };
    }, []);

    // Unit Map
    const floors: Record<number, Unit[]> = {};
    if (property.floors) { for(let i=0; i<property.floors; i++) floors[i] = []; }
    property.units.forEach(u => {
        const floorNum = u.floor !== undefined ? u.floor : 0;
        if (!floors[floorNum]) floors[floorNum] = [];
        floors[floorNum].push(u);
    });

    const handleAddUnit = (unit: Partial<Unit>) => {
        const newUnit: Unit = {
            id: `u-${Date.now()}`,
            unitNumber: unit.unitNumber || '',
            floor: unit.floor || 0,
            bedrooms: unit.bedrooms || 1,
            bathrooms: unit.bathrooms || 1,
            rent: unit.rent || property.defaultMonthlyRent,
            status: 'Vacant',
            amenities: []
        };
        addUnitToProperty(property.id, newUnit);
    };

    const handleViewLandlord = () => {
        if (landlord) {
            window.location.hash = `#/landlords/active-landlords?id=${landlord.id}`;
        }
    };

    const handleToggleLock = (unit: Unit) => {
        const willBeLocked = !unit.isLocked;
        const updatedUnits = property.units.map(u =>
            u.id === unit.id ? { ...u, isLocked: willBeLocked } : u
        );
        updateProperty(property.id, { units: updatedUnits });

        // When locking, charge the tenant occupying this unit a Lock Fee
        // sourced from the global Fines & Penalties catalog (defaults to KES 200).
        if (willBeLocked) {
            const tenant = tenants.find((t: any) => t.unitId === unit.id || t.unit === unit.unitNumber);
            if (tenant) {
                const rule = (fines || []).find((f: any) => /lock\s*fee/i.test(f.type));
                const amount = rule?.basis === 'Fixed Fee' ? Number(rule?.value || 200) : 200;
                const newFine = {
                    id: `fine-lock-${unit.id}-${Date.now()}`,
                    type: 'Lock Fee Charges',
                    amount,
                    date: getTodayIsoDate(),
                    status: 'Pending',
                    description: `Unit ${unit.unitNumber} locked at ${property.name}`,
                } as any;
                updateTenant(tenant.id, {
                    outstandingFines: [...(tenant.outstandingFines || []), newFine],
                });
                alert(`Unit ${unit.unitNumber} LOCKED. KES ${amount.toLocaleString()} Lock Fee charged to ${tenant.name}.`);
                return;
            }
        }
        alert(`Unit ${unit.unitNumber} is now ${willBeLocked ? 'LOCKED' : 'UNLOCKED'}.`);
    };

    const propTasks = tasks.filter(t => t.property === property.name);

    return (
        <div className="fixed inset-0 bg-black/60 z-[1300] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-white flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-2xl font-bold border-2 border-blue-100">
                            {property.name.charAt(0)}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
                            <p className="text-sm text-gray-500 flex items-center gap-2">
                                <Icon name="branch" className="w-4 h-4" /> {property.subLocation && property.zone ? `${property.subLocation} (${property.zone})` : (property.subLocation || property.zone || property.location || property.branch || '')}
                                <span className="text-gray-300">|</span>
                                <button onClick={handleViewLandlord} className="text-primary hover:underline font-bold flex items-center">
                                    <Icon name="landlords" className="w-4 h-4 mr-1" />
                                    {landlord ? landlord.name : 'Unknown Landlord'}
                                </button>
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <Icon name="close" className="w-6 h-6 text-gray-400 hover:text-gray-600" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-6 bg-gray-50 border-b">
                    <div className="flex gap-6">
                        {['Overview', 'Units', 'Financials', 'Communication'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={`py-4 text-sm font-bold border-b-2 transition-colors capitalize ${
                                    activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'
                                }`}
                            >
                                {tab === 'portfolio' ? 'Properties & Units' : tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-grow overflow-y-auto p-8 bg-gray-50/50">
                    
                    {activeTab === 'Overview' && (
                        <div className="space-y-8 animate-fade-in">
                            {/* Top Stats Row */}
                            <div className="grid grid-cols-4 gap-6">
                                <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm">
                                    <p className="text-xs font-bold text-blue-800 uppercase">Total Units</p>
                                    <p className="text-3xl font-extrabold text-blue-900 mt-1">{totalUnits}</p>
                                    <p className="text-xs text-blue-600 mt-1">Portfolio Size</p>
                                </div>
                                <div className="bg-green-50 p-4 rounded-xl border border-green-200 shadow-sm">
                                    <p className="text-xs font-bold text-green-800 uppercase">Occupancy</p>
                                    <p className="text-3xl font-extrabold text-green-900 mt-1">{occupancyRate}%</p>
                                    <p className="text-xs text-green-700 mt-1">{occupiedUnits} Occupied</p>
                                </div>
                                <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 shadow-sm">
                                    <p className="text-xs font-bold text-purple-800 uppercase">Collection (MTD)</p>
                                    <p className="text-3xl font-extrabold text-purple-900 mt-1">KES {(collectedRent/1000).toFixed(1)}k</p>
                                    <p className="text-xs text-purple-700 mt-1">{collectionRate}% of Expected</p>
                                </div>
                                {/* Dynamic Alert Card */}
                                {arrearsCount > 0 ? (
                                    <div className="bg-red-50 p-4 rounded-xl border border-red-200 shadow-sm">
                                        <p className="text-xs font-bold text-red-800 uppercase">Collections Alert</p>
                                        <p className="text-lg font-bold text-red-900 mt-1">KES {arrearsAmount.toLocaleString()}</p>
                                        <p className="text-xs text-red-700 mt-1">Outstanding from {arrearsCount} tenants.</p>
                                    </div>
                                ) : vacantCount > 0 ? (
                                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-200 shadow-sm">
                                        <p className="text-xs font-bold text-orange-800 uppercase">Vacancy Alert</p>
                                        <p className="text-3xl font-bold text-orange-900 mt-1">{vacantCount}</p>
                                        <p className="text-xs text-orange-700 mt-1">Units available to let.</p>
                                    </div>
                                ) : (
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <p className="text-xs font-bold text-gray-500 uppercase">Status</p>
                                        <p className="text-xl font-bold text-gray-800 mt-1">Healthy</p>
                                        <p className="text-xs text-green-600 mt-1">No critical issues.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'Units' && (
                         <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-fade-in">
                            <div className="flex justify-between items-center mb-6 border-b pb-4">
                                <h3 className="text-xl font-bold text-gray-800">Stacking Plan <span className="font-normal text-gray-500 text-sm ml-2">Visual Layout</span></h3>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full font-bold">ACTIVE</span>
                                    <button onClick={() => setIsAddUnitOpen(true)} className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded hover:bg-primary-dark shadow-sm">
                                        + Add Unit
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {Object.entries(floors).sort((a,b) => Number(a[0]) - Number(b[0])).map(([floorNum, units]: [string, Unit[]]) => (
                                    <div key={floorNum}>
                                        <div className="flex justify-between items-center mb-3">
                                            <h4 className="text-xs font-bold text-gray-400 uppercase flex items-center">
                                                <span className="w-2 h-2 bg-gray-300 rounded-full mr-2"></span>
                                                {Number(floorNum) === 0 ? 'Ground Floor' : `Floor ${floorNum}`}
                                            </h4>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                            {units.map(u => {
                                                const t = propTenants.find(tn => tn.unitId === u.id);
                                                const isNew = t ? (new Date(t.onboardingDate) >= new Date(new Date().setDate(new Date().getDate() - 30))) : false;
                                                return <UnitBox 
                                                            key={u.id} 
                                                            unit={u} 
                                                            tenant={t} 
                                                            isNewTenant={isNew} 
                                                            onToggleLock={() => handleToggleLock(u)}
                                                        />;
                                            })}
                                        </div>
                                    </div>
                                ))}
                                {Object.keys(floors).length === 0 && <div className="text-center py-10 text-gray-400">No floors/units defined.</div>}
                            </div>
                        </div>
                    )}
                    
                </div>
            </div>
            {isAddUnitOpen && <AddUnitModal property={property} onClose={() => setIsAddUnitOpen(false)} onAdd={handleAddUnit} />}
        </div>
    );
};

const FieldProperties: React.FC = () => {
    const { properties, landlords, addProperty, updateProperty, addUnitToProperty, staff, tenants, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate = isSuperAdmin || checkPermission('Properties', 'create');
    const canEdit = isSuperAdmin || checkPermission('Properties', 'edit');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const filteredProperties = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return properties
            .filter(p => !q || p.name.toLowerCase().includes(q) || (p.subLocation || '').toLowerCase().includes(q) || (p.zone || '').toLowerCase().includes(q) || (p.location || '').toLowerCase().includes(q) || (p.branch || '').toLowerCase().includes(q))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [properties, searchQuery]);

    const getPropertyStats = (prop: Property) => {
        const propTenants = tenants.filter(t => t.propertyId === prop.id);
        const activeTenantUnitIds = new Set(
            propTenants
                .filter(t => !['Vacated', 'Evicted'].includes(t.status))
                .map(t => t.unitId)
                .filter(Boolean) as string[]
        );
        const totalUnits = prop.units.length;
        // Count a unit as occupied if either unit.status === 'Occupied' OR an
        // active tenant currently maps to that unit (handles stale unit.status).
        const occupiedUnits = prop.units.filter(u => u.status === 'Occupied' || activeTenantUnitIds.has(u.id)).length;
        const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

        const currentMonth = getMonthPrefix();

        // Expected Rent: Sum of rent amounts for tenants currently in the property (Active, Overdue, Notice)
        const expectedRent = propTenants
            .filter(t => ['Active', 'Overdue', 'Notice'].includes(t.status))
            .reduce((sum, t) => sum + (t.rentAmount || 0), 0);

        // Collected Rent: Sum of payments in current month
        const collectedRent = propTenants.reduce((sum, t) => sum + sumPaidPaymentsForMonth(t, currentMonth), 0);

        const collectionRate = expectedRent > 0 ? Math.min(100, Math.round((collectedRent / expectedRent) * 100)) : 0;

        return {
            totalUnits,
            occupiedUnits,
            occupancyRate,
            expectedRent,
            collectedRent,
            collectionRate
        };
    };

    const insightsBanners = useMemo(() => {
        if (properties.length === 0) return { top: [] as Array<{ p: Property; stats: ReturnType<typeof getPropertyStats> }>, attention: [] as Array<{ p: Property; stats: ReturnType<typeof getPropertyStats> }> };
        const scored = properties.map(p => ({ p, stats: getPropertyStats(p) }));
        const top = [...scored]
            .sort((a, b) => b.stats.collectionRate - a.stats.collectionRate || b.stats.occupancyRate - a.stats.occupancyRate)
            .slice(0, 3);
        const attention = [...scored]
            .filter(
                ({ stats }) =>
                    stats.totalUnits > 0 &&
                    (stats.occupancyRate < 70 || (stats.expectedRent > 0 && stats.collectionRate < 70)),
            )
            .sort(
                (a, b) =>
                    a.stats.occupancyRate - b.stats.occupancyRate ||
                    a.stats.collectionRate - b.stats.collectionRate,
            )
            .slice(0, 3);
        return { top, attention };
    }, [properties, tenants]);

    const handleViewLandlord = (e: React.MouseEvent, landlordId: string) => {
        e.stopPropagation();
        // Redirect logic if needed
    };

    const handleSaveNewProperty = (prop: Property) => {
        if (prop.id && !canEdit) return alert('You do not have permission to edit properties.');
        if (!prop.id && !canCreate) return alert('You do not have permission to create properties.');
        if (prop.id) updateProperty(prop.id, prop);
        else addProperty({ ...prop, id: `prop-${Date.now()}`, units: [] });
        setIsCreating(false);
    };

    if (isCreating) {
        return (
            <PropertyForm 
                property={null} 
                onCancel={() => setIsCreating(false)} 
                onSave={handleSaveNewProperty}
                landlords={landlords}
                staff={staff}
            />
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                 <div>
                    <h1 className="text-3xl font-bold text-gray-800">Properties (Field View)</h1>
                    <p className="text-lg text-gray-500 mt-1">Operational status and health of managed assets.</p>
                </div>
                {canCreate && <button
                    onClick={() => setIsCreating(true)}
                    className="px-6 py-2 bg-primary text-white font-bold rounded-lg shadow-sm hover:bg-primary-dark flex items-center"
                >
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Add Property
                </button>}
            </div>

            {/* Search bar */}
            <div className="relative max-w-md">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search properties by name, location or branch…"
                    className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>


            {/* Field Insights Banner */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                    <h4 className="font-bold text-green-800 mb-3 flex items-center"><Icon name="check" className="w-4 h-4 mr-2" /> Top Performing Assets</h4>
                    <div className="space-y-2">
                        {insightsBanners.top.length === 0 ? (
                            <p className="text-sm text-gray-600">No performance data yet.</p>
                        ) : (
                            insightsBanners.top.map(({ p, stats }) => (
                                <div key={p.id} className="bg-white p-2 rounded shadow-sm flex justify-between text-sm gap-2">
                                    <span className="font-medium truncate">{p.name}</span>
                                    <span className="text-green-600 font-bold whitespace-nowrap">{stats.occupancyRate}% occ. · {stats.collectionRate}% coll.</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                    <h4 className="font-bold text-red-800 mb-3 flex items-center"><Icon name="arrears" className="w-4 h-4 mr-2" /> Requires Attention</h4>
                     <div className="space-y-2">
                        {insightsBanners.attention.length === 0 ? (
                            <p className="text-sm text-gray-600">No assets below thresholds.</p>
                        ) : (
                            insightsBanners.attention.map(({ p, stats }) => (
                                <div key={p.id} className="bg-white p-2 rounded shadow-sm flex justify-between text-sm gap-2">
                                    <span className="font-medium truncate">{p.name}</span>
                                    <span className="text-red-600 font-bold whitespace-nowrap">{stats.occupancyRate}% occ. · {stats.collectionRate}% coll.</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Property Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredProperties.map(prop => {
                    const stats = getPropertyStats(prop);
                    const landlordName = landlords.find(l => l.id === prop.landlordId)?.name || 'Unknown';
                    return (
                        <PropertyCard 
                            key={prop.id} 
                            property={prop} 
                            landlordName={landlordName}
                            stats={stats} 
                            onClick={() => setSelectedProperty(prop)}
                            onViewLandlord={(e) => handleViewLandlord(e, prop.landlordId)}
                        />
                    );
                })}
            </div>

            {selectedProperty && (
                <PropertyDetailView 
                    property={selectedProperty} 
                    onClose={() => setSelectedProperty(null)} 
                />
            )}
        </div>
    );
};

export default FieldProperties;
