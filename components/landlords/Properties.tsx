
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GEOSPATIAL_DATA } from '../../constants';
import { Property, Unit, User, PropertyAsset, FloorPlan, UnitType, StaffProfile } from '../../types';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';

const UNIT_TYPES: string[] = ['Single Room', 'Double Room', 'Bedsitter', 'Studio', 'One Bedroom', 'Two Bedrooms', 'Three Bedrooms', 'Shop', 'Office'];
const BEDROOM_UNIT_TYPES = new Set(['One Bedroom', 'Two Bedrooms', 'Three Bedrooms']);

const PropertyListItem: React.FC<{ property: Property; onEdit: (p: Property) => void; onAddUnit: (p: Property) => void; canEdit: boolean }> = ({ property, onEdit, onAddUnit, canEdit }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const statusClasses = {
        Active: 'bg-green-100 text-green-800',
        Suspended: 'bg-yellow-100 text-yellow-800',
        Decommissioned: 'bg-red-100 text-red-800',
    };
    const unitStatusClasses = {
        Vacant: 'bg-green-100 text-green-800',
        Occupied: 'bg-blue-100 text-blue-800',
        'Under Maintenance': 'bg-yellow-100 text-yellow-800',
        Reserved: 'bg-purple-100 text-purple-800'
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-all hover:shadow-md">
            <div className="p-4 flex items-center justify-between cursor-pointer bg-white hover:bg-gray-50" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex items-center space-x-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary overflow-hidden">
                        {property.profilePictureUrl ? (
                            <img src={property.profilePictureUrl} alt={property.name} className="h-full w-full object-cover" />
                        ) : (
                            <Icon name="branch" className="w-5 h-5" />
                        )}
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800">{property.name}</h3>
                        <p className="text-sm text-gray-500">{property.type} • {property.branch}</p>
                    </div>
                </div>
                <div className="flex items-center space-x-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusClasses[property.status]}`}>{property.status}</span>
                    {canEdit && <button onClick={(e) => { e.stopPropagation(); onEdit(property); }} className="text-sm font-semibold text-primary hover:text-primary-dark">Edit</button>}
                    <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} className="w-5 h-5 text-gray-400" />
                </div>
            </div>
            {isExpanded && (
                <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-xs text-gray-500 uppercase tracking-wider">Units ({property.units.length})</h4>
                        {canEdit && <button onClick={() => onAddUnit(property)} className="text-xs font-bold text-primary hover:underline flex items-center">
                            <Icon name="register" className="w-3 h-3 mr-1" /> Add Unit
                        </button>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2">
                        {property.units.map(unit => (
                            <div key={unit.id} className="flex justify-between items-center p-2 bg-white border border-gray-200 rounded-md text-sm">
                                <div>
                                    <span className="font-semibold text-gray-700">{unit.unitNumber}</span>
                                    <span className="text-gray-400 mx-2">|</span>
                                    <span className="text-gray-500">{unit.unitType || `${unit.bedrooms}BR / ${unit.bathrooms}BA`}</span>
                                </div>
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${unitStatusClasses[unit.status]}`}>{unit.status}</span>
                            </div>
                        ))}
                        {property.units.length === 0 && <p className="text-sm text-gray-400 italic">No units configured.</p>}
                    </div>
                </div>
            )}
        </div>
    );
};

const PropertyForm: React.FC<{ 
    property: Partial<Property> | null; 
    onCancel: () => void; 
    onSave: (p: Property) => void;
    landlords: User[];
    staff: StaffProfile[];
}> = ({ property, onCancel, onSave, landlords, staff }) => {
    const [activeTab, setActiveTab] = useState('details');
    const [formData, setFormData] = useState<Partial<Property>>({});
    const [activeFloorIndex, setActiveFloorIndex] = useState(0);
    const [baseRent, setBaseRent] = useState<number>(0); // Local state for calculator
    const [docFiles, setDocFiles] = useState<FileList | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

    // Geospatial options state
    const [subCountyOptions, setSubCountyOptions] = useState<string[]>([]);
    const [locationOptions, setLocationOptions] = useState<string[]>([]);
    const [zoneOptions, setZoneOptions] = useState<string[]>([]);
    const [subLocationOptions, setSubLocationOptions] = useState<string[]>([]);

    useEffect(() => {
        const isNew = !property;
        const defaults: Partial<Property> = {
            type: 'Residential', 
            ownership: 'In-house', 
            branch: 'Kericho Branch', 
            status: 'Active',
            units: [],
            assets: [],
            floorplan: [],
            floors: isNew ? 1 : 0,
            rentIsUniform: true,
            rentType: 'Exclusive',
            deposit: { required: true, months: 1 },
            bills: {
                water: { applicable: false, amount: 0 },
                electricity: { applicable: false, amount: 0 },
                garbage: { applicable: false, amount: 0 },
                serviceCharge: { applicable: false, amount: 0 },
                securityFee: { applicable: false, amount: 0 },
                cleaningFee: { applicable: false, amount: 0 },
                caretakerFee: { applicable: false, amount: 0 },
            },
            remittanceType: 'Collection Based',
            remittanceCutoffDay: 4,
            nearestLandmark: '',
            assignedAgentId: '',
        };
        const initialData = { ...defaults, ...property };
        if (property && property.floors !== undefined) {
          initialData.floors = property.floors;
        }
        setFormData(initialData);
        
        // Reverse calculate Base Rent if editing
        const totalBills = initialData.rentType === 'Inclusive' && initialData.bills
            ? Object.values(initialData.bills).reduce<number>((acc, b: any) => acc + (b?.applicable ? (Number(b?.amount) || 0) : 0), 0)
            : 0;
        setBaseRent((initialData.defaultMonthlyRent || 0) - totalBills);

        setActiveTab('details');
        setActiveFloorIndex(0);
    }, [property]);

    // Floorplan auto-generation
    useEffect(() => {
        const numFloors = formData.floors || 0;
        const currentPlan = formData.floorplan || [];
        const defaultType = formData.defaultUnitType || 'Single Room';

        if (numFloors === currentPlan.length) return;
        if (activeFloorIndex >= numFloors && numFloors > 0) setActiveFloorIndex(numFloors - 1);

        const newPlan = Array.from({ length: numFloors }, (_, i) => {
            return currentPlan[i] || { 
                floorNumber: i, 
                compositionType: 'Uniform' as const, 
                unitType: defaultType, 
                unitCount: 0 
            } as FloorPlan;
        });
        setFormData(prev => ({ ...prev, floorplan: newPlan }));
    }, [formData.floors, activeFloorIndex, formData.defaultUnitType]);

    // Cascading Geospatial Logic
    useEffect(() => {
        if (formData.county && GEOSPATIAL_DATA[formData.county]) setSubCountyOptions(Object.keys(GEOSPATIAL_DATA[formData.county]));
        else setSubCountyOptions([]);
    }, [formData.county]);

    useEffect(() => {
        if (formData.county && formData.subCounty && GEOSPATIAL_DATA[formData.county]?.[formData.subCounty]) 
            setLocationOptions(Object.keys(GEOSPATIAL_DATA[formData.county][formData.subCounty]));
        else setLocationOptions([]);
    }, [formData.county, formData.subCounty]);

    useEffect(() => {
        if (formData.county && formData.subCounty && formData.location && GEOSPATIAL_DATA[formData.county]?.[formData.subCounty]?.[formData.location]) 
            setZoneOptions(Object.keys(GEOSPATIAL_DATA[formData.county][formData.subCounty][formData.location]));
        else setZoneOptions([]);
    }, [formData.county, formData.subCounty, formData.location]);

    useEffect(() => {
        if (formData.county && formData.subCounty && formData.location && formData.zone && GEOSPATIAL_DATA[formData.county]?.[formData.subCounty]?.[formData.location]?.[formData.zone]) 
            setSubLocationOptions(GEOSPATIAL_DATA[formData.county][formData.subCounty][formData.location][formData.zone]);
        else setSubLocationOptions([]);
    }, [formData.county, formData.subCounty, formData.location, formData.zone]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isNumber = type === 'number';
        setFormData(prev => ({ ...prev, [name]: isNumber ? parseInt(value) || 0 : value }));
    };

    const handleRentByTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target as { name: string, value: string };
        setFormData(prev => ({
            ...prev,
            rentByType: {
                ...(prev.rentByType || {}),
                [name]: parseInt(value) || 0
            } as Record<string, number>
        }));
    };

    const handleGeospatialChange = (field: string, value: string) => {
        setFormData(prev => {
            const newState: any = { ...prev, [field]: value };
            const resetFields = (f: string) => {
                if(f === 'county') { newState.subCounty=''; newState.location=''; newState.zone=''; newState.subLocation=''; }
                if(f === 'subCounty') { newState.location=''; newState.zone=''; newState.subLocation=''; }
                if(f === 'location') { newState.zone=''; newState.subLocation=''; }
                if(f === 'zone') { newState.subLocation=''; }
            };
            resetFields(field);
            return newState;
        });
    };

    const handleProfilePicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, profilePictureUrl: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDocsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newDocs = Array.from(e.target.files).map((file: File) => ({
                name: file.name,
                type: 'doc' as const,
                category: 'Document' as const,
                url: '#'
            }));
            setFormData(prev => ({ ...prev, assets: [...(prev.assets || []), ...newDocs] }));
        }
    };

    const removeAsset = (idx: number) => {
        setFormData(prev => ({ ...prev, assets: prev.assets?.filter((_, i) => i !== idx) }));
    };

    const handleBillChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, checked, type } = e.target;
        const [billKey, prop] = name.split('_') as [keyof NonNullable<Property['bills']>, 'applicable' | 'amount'];
        
        setFormData(prev => {
            const newBills = {
                ...(prev.bills || {}),
                [billKey]: {
                    ...(prev.bills?.[billKey] || { applicable: false, amount: 0 }),
                    [prop]: type === 'checkbox' ? checked : parseInt(value) || 0,
                }
            };
            
            // Auto-recalculate gross rent if Uniform and Inclusive
            if (prev.rentIsUniform && prev.rentType === 'Inclusive') {
                const totalBills = Object.values(newBills).reduce<number>((acc, b: any) => acc + (b?.applicable ? (Number(b?.amount) || 0) : 0), 0);
                return { ...prev, bills: newBills, defaultMonthlyRent: baseRent + totalBills };
            }

            return { ...prev, bills: newBills };
        });
    };

    const handleBaseRentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newBase = parseFloat(e.target.value) || 0;
        setBaseRent(newBase);
        
        if (formData.rentIsUniform) {
            if (formData.rentType === 'Inclusive') {
                const totalBills = Object.values(formData.bills || {}).reduce<number>((acc, b: any) => acc + (b?.applicable ? (Number(b?.amount) || 0) : 0), 0);
                setFormData(prev => ({ ...prev, defaultMonthlyRent: newBase + totalBills }));
            } else {
                setFormData(prev => ({ ...prev, defaultMonthlyRent: newBase }));
            }
        }
    };

    const handleRentTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newType = e.target.value as 'Inclusive' | 'Exclusive';
        
        setFormData(prev => {
            const totalBills = Object.values(prev.bills || {}).reduce<number>((acc, b: any) => acc + (b?.applicable ? (Number(b?.amount) || 0) : 0), 0);
            const newGross = newType === 'Inclusive' ? baseRent + totalBills : baseRent;
            return { ...prev, rentType: newType, defaultMonthlyRent: newGross };
        });
    };

    const handleSave = () => {
        if (!formData.name || !formData.assignedAgentId) {
            alert('Property Name and Field Agent are required.');
            return;
        }
        onSave(formData as Property);
    };

    const totalIncludedBills = Object.values(formData.bills || {}).reduce<number>((acc, b: any) => acc + (b?.applicable ? (Number(b?.amount) || 0) : 0), 0);

    // Filter staff for Field Agents
    const fieldAgents = staff.filter(s => s.role === 'Field Agent');

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm">
            <div className="flex items-center mb-6">
                <button onClick={onCancel} className="mr-4 text-gray-500 hover:text-primary transition-colors flex items-center gap-1 text-sm font-medium">
                    <Icon name="chevron-down" className="w-4 h-4 rotate-90" /> Back
                </button>
                <h2 className="text-2xl font-bold text-gray-800">{property?.id ? 'Edit Property' : 'Create New Property'}</h2>
            </div>
            
            <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-6">
                    {['details', 'units', 'documents'].map(tab => (
                        <button 
                            key={tab} 
                            onClick={() => setActiveTab(tab)} 
                            className={`capitalize py-2 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            {tab === 'documents' ? 'Documents & Media' : tab === 'units' ? 'Units & Rent' : tab}
                        </button>
                    ))}
                </nav>
            </div>

            {activeTab === 'details' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Property Name*</label>
                            <input name="name" value={formData.name || ''} onChange={handleChange} className="w-full p-2 border rounded"/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                <select name="type" value={formData.type} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                    <option>Residential</option><option>Commercial</option><option>Mixed-Use</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Landlord*</label>
                                <select name="landlordId" value={formData.landlordId || ''} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                    <option value="">Select Landlord</option>
                                    {[...landlords].sort((a, b) => a.name.localeCompare(b.name)).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                            </div>
                        </div>
                        
                        {/* Assigned Agent (New) */}
                        <div>
                            <label className="block text-sm font-bold text-blue-700 mb-1">Assigned Field Agent*</label>
                            <select name="assignedAgentId" value={formData.assignedAgentId || ''} onChange={handleChange} className="w-full p-2 border border-blue-200 rounded bg-blue-50 text-gray-800 font-medium">
                                <option value="">-- Select Agent --</option>
                                {fieldAgents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">This agent will be responsible for occupancy & collection targets.</p>
                        </div>

                        {/* Financial & Remittance Section */}
                        <div className="pt-4 mt-2 border-t">
                            <h4 className="text-sm font-bold text-gray-700 mb-3">Financial & Remittance</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Remittance Type</label>
                                    <select name="remittanceType" value={formData.remittanceType || 'Collection Based'} onChange={handleChange} className="w-full p-2 border rounded bg-white text-sm">
                                        <option>Collection Based</option>
                                        <option>Occupancy Based</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Cutoff Day</label>
                                    <input type="number" name="remittanceCutoffDay" value={formData.remittanceCutoffDay || ''} onChange={handleChange} placeholder="e.g. 5" className="w-full p-2 border rounded text-sm"/>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                            <select name="branch" value={formData.branch} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                <option>Kericho Branch</option><option>Kisii Branch</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select name="status" value={formData.status} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                <option>Active</option><option>Suspended</option><option>Decommissioned</option>
                            </select>
                        </div>
                    </div>

                    <div className="md:col-span-2 mt-2">
                        <h3 className="font-bold text-gray-800 mb-3 border-b pb-2">Location & Mapping</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <select name="county" value={formData.county || ''} onChange={e => handleGeospatialChange('county', e.target.value)} className="p-2 border rounded bg-white">
                                <option value="">County</option>{Object.keys(GEOSPATIAL_DATA).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <select name="subCounty" value={formData.subCounty || ''} onChange={e => handleGeospatialChange('subCounty', e.target.value)} disabled={!formData.county} className="p-2 border rounded bg-white disabled:bg-gray-100">
                                <option value="">Sub-County</option>{subCountyOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <select name="location" value={formData.location || ''} onChange={e => handleGeospatialChange('location', e.target.value)} disabled={!formData.subCounty} className="p-2 border rounded bg-white disabled:bg-gray-100">
                                <option value="">Location</option>{locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <select name="zone" value={formData.zone || ''} onChange={e => handleGeospatialChange('zone', e.target.value)} disabled={!formData.location} className="p-2 border rounded bg-white disabled:bg-gray-100">
                                <option value="">Zone</option>{zoneOptions.map(z => <option key={z} value={z}>{z}</option>)}
                            </select>
                            <select name="subLocation" value={formData.subLocation || ''} onChange={e => handleGeospatialChange('subLocation', e.target.value)} disabled={!formData.zone} className="p-2 border rounded bg-white disabled:bg-gray-100">
                                <option value="">Sub-Location / Village</option>{subLocationOptions.map(sl => <option key={sl} value={sl}>{sl}</option>)}
                            </select>
                            <input 
                                name="nearestLandmark" 
                                value={formData.nearestLandmark || ''} 
                                onChange={handleChange} 
                                placeholder="Nearest Road / Landmark" 
                                className="p-2 border rounded bg-white w-full"
                            />
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'units' && (
                <div className="space-y-6">
                    
                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                            <Icon name="revenue" className="w-5 h-5 mr-2 text-primary" />
                            Rent Configuration & Calculator
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Structure</label>
                                        <select name="rentIsUniform" value={formData.rentIsUniform ? 'true' : 'false'} onChange={(e) => setFormData(p => ({...p, rentIsUniform: e.target.value === 'true'}))} className="w-full p-2 border rounded bg-white shadow-sm">
                                            <option value="true">Uniform Rent (Same for all)</option>
                                            <option value="false">Variable Rent (Per Unit Type)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Rent Type</label>
                                        <select name="rentType" value={formData.rentType || 'Exclusive'} onChange={handleRentTypeChange} className="w-full p-2 border rounded bg-white shadow-sm">
                                            <option value="Exclusive">Exclusive (Bills Separate)</option>
                                            <option value="Inclusive">Inclusive (Bills Included)</option>
                                        </select>
                                    </div>
                                </div>

                                {formData.rentType !== 'Exclusive' && <div>
                                    <label className="block text-sm font-medium text-gray-800 mb-2">Utilities & Bills Checklist</label>
                                    <div className="bg-white border rounded-lg divide-y divide-gray-100 shadow-sm">
                                        {(['water', 'electricity', 'garbage', 'serviceCharge', 'securityFee', 'cleaningFee', 'caretakerFee'] as const).map(billKey => (
                                            <div key={billKey} className="flex items-center justify-between p-3">
                                                <label className="flex items-center space-x-3 cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        name={`${billKey}_applicable`} 
                                                        checked={formData.bills?.[billKey]?.applicable || false} 
                                                        onChange={handleBillChange} 
                                                        className="h-4 w-4 text-primary rounded focus:ring-primary" 
                                                    />
                                                    <span className="capitalize text-gray-700 font-medium">{billKey.replace(/([A-Z])/g, ' $1')}</span>
                                                </label>
                                                {formData.bills?.[billKey]?.applicable && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-gray-500">
                                                            {formData.rentType === 'Inclusive' ? 'Included Amount:' : 'Standard Charge:'}
                                                        </span>
                                                        <div className="relative w-24">
                                                            <span className="absolute left-2 top-1.5 text-xs text-gray-400">KES</span>
                                                            <input 
                                                                name={`${billKey}_amount`} 
                                                                type="number" 
                                                                value={formData.bills?.[billKey]?.amount || ''} 
                                                                onChange={handleBillChange} 
                                                                className="w-full p-1 pl-8 border rounded text-sm font-semibold text-right"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>}

                                <div>
                                    <label className="block text-sm font-medium text-gray-800 mb-2">Utility Deposits (One-Time, Refundable)</label>
                                    <div className="bg-white border rounded-lg divide-y divide-gray-100 shadow-sm">
                                        {(['water', 'electricity'] as const).map(key => {
                                            const dep = (formData as any).utilityDeposit?.[key];
                                            const isRequired = dep?.required ?? false;
                                            return (
                                                <div key={key} className="flex items-center justify-between p-3">
                                                    <label className="flex items-center space-x-3 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={isRequired}
                                                            onChange={e => {
                                                                const enabled = e.target.checked;
                                                                setFormData((prev: any) => ({
                                                                    ...prev,
                                                                    utilityDeposit: {
                                                                        ...(prev.utilityDeposit || {}),
                                                                        [key]: { required: enabled, amount: dep?.amount ?? 0 },
                                                                    },
                                                                }));
                                                            }}
                                                            className="h-4 w-4 text-primary rounded focus:ring-primary"
                                                        />
                                                        <span className="capitalize text-gray-700 font-medium">{key} Deposit</span>
                                                    </label>
                                                    {isRequired && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-gray-500">Standard Amount:</span>
                                                            <div className="relative w-28">
                                                                <span className="absolute left-2 top-1.5 text-xs text-gray-400">KES</span>
                                                                <input
                                                                    type="number"
                                                                    value={dep?.amount || ''}
                                                                    onChange={e => {
                                                                        const val = Number(e.target.value) || 0;
                                                                        setFormData((prev: any) => ({
                                                                            ...prev,
                                                                            utilityDeposit: {
                                                                                ...(prev.utilityDeposit || {}),
                                                                                [key]: { required: true, amount: val },
                                                                            },
                                                                        }));
                                                                    }}
                                                                    placeholder="0"
                                                                    className="w-full p-1 pl-8 border rounded text-sm font-semibold text-right"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">These are collected once at the start of tenancy — separate from monthly bills.</p>
                                </div>
                            </div>

                            {formData.rentIsUniform ? (
                                <div className="bg-white p-5 rounded-lg border border-blue-100 shadow-sm flex flex-col justify-between">
                                    <div>
                                        <h4 className="font-bold text-blue-800 mb-2 border-b border-blue-100 pb-2">Rent Breakdown Calculator</h4>
                                        <p className="text-xs text-gray-500 mb-4">
                                            {formData.rentType === 'Inclusive' 
                                                ? 'Calculates Gross Rent based on Base Rent + Bills.' 
                                                : 'Calculates Total Monthly Cost (Rent + Bills).'}
                                        </p>
                                        
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <label className="text-sm font-medium text-gray-700">Base Rent (For MRI/Tax Calc)</label>
                                                <div className="relative w-32">
                                                    <span className="absolute left-3 top-2 text-gray-500 text-sm">KES</span>
                                                    <input 
                                                        type="number" 
                                                        value={baseRent || ''} 
                                                        onChange={handleBaseRentChange}
                                                        placeholder="0"
                                                        className="w-full p-2 pl-10 border border-blue-300 rounded-md font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    />
                                                </div>
                                            </div>

                                            {totalIncludedBills > 0 && (
                                                <div className="flex justify-between items-center text-sm text-gray-600 bg-gray-50 p-2 rounded">
                                                    <span>{formData.rentType === 'Inclusive' ? '+ Included Bills' : '+ Separate Bills'}</span>
                                                    <span className="font-semibold">KES {totalIncludedBills.toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-6 pt-4 border-t border-dashed border-gray-300">
                                        <div className="flex justify-between items-end">
                                            <span className="text-sm font-bold text-gray-500 uppercase">
                                                {formData.rentType === 'Inclusive' ? 'Total Gross Rent' : 'Total Monthly Cost'}
                                            </span>
                                            <span className="text-3xl font-extrabold text-primary">
                                                KES {((baseRent || 0) + (formData.rentType === 'Inclusive' ? totalIncludedBills : totalIncludedBills)).toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="text-right text-xs text-gray-400 mt-1">
                                            {formData.rentType === 'Inclusive' ? 'Amount payable by tenant (Single Payment)' : 'Total cost to tenant (Rent + Bills)'}
                                        </p>
                                        <p className="text-right text-xs text-gray-400 mt-1 italic">
                                            Used for calculating Monthly Rental Income Tax. Landlord payout is Gross Rent minus applicable deductions.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
                                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
                                        <h4 className="font-bold text-gray-800 text-sm">Variable Rent Configuration</h4>
                                        <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{formData.rentType} Mode</span>
                                    </div>
                                    
                                    {formData.rentType === 'Inclusive' && totalIncludedBills > 0 && (
                                        <div className="mb-4 p-3 bg-blue-50 text-blue-800 text-xs rounded border border-blue-100 flex items-start">
                                            <Icon name="info" className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <strong>Inclusive Pricing Active:</strong> <br/>
                                                Bills totaling <span className="font-bold">KES {totalIncludedBills.toLocaleString()}</span> are included. 
                                                The amounts below are the Gross Rent payable by tenants. Net Rent (Base) is calculated automatically.
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                                        {UNIT_TYPES.map(unitType => {
                                            const grossRent = formData.rentByType?.[unitType] || 0;
                                            const netRent = formData.rentType === 'Inclusive' ? Math.max(0, grossRent - totalIncludedBills) : grossRent;
                                            const totalCost = formData.rentType === 'Inclusive' ? grossRent : grossRent + totalIncludedBills;

                                            return (
                                                <div key={unitType} className="p-3 bg-gray-50 rounded border border-gray-200 hover:border-primary/30 transition-colors">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <label className="text-xs font-bold text-gray-700">{unitType}</label>
                                                        {formData.rentType === 'Inclusive' && (
                                                            <span className="text-[10px] text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded">
                                                                Base (Taxable): KES {netRent.toLocaleString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-2 text-gray-400 text-xs">KES</span>
                                                        <input 
                                                            name={unitType}
                                                            type="number"
                                                            value={formData.rentByType?.[unitType] || ''}
                                                            onChange={handleRentByTypeChange}
                                                            placeholder="0"
                                                            className="w-full p-1.5 pl-10 border rounded text-sm font-semibold text-gray-900 focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>
                                                    {formData.rentType === 'Exclusive' && totalIncludedBills > 0 && (
                                                        <p className="text-[10px] text-gray-400 mt-1 text-right">
                                                            + KES {totalIncludedBills.toLocaleString()} Bills = Total KES {totalCost.toLocaleString()}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-6 border-t">
                        <h3 className="font-bold text-gray-800 mb-4">Property Structure</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Total Floors</label>
                                <input type="number" name="floors" value={formData.floors || ''} onChange={e => {
                                    const newCount = parseInt(e.target.value) || 0;
                                    const hasExistingConfig = (formData.floorplan || []).some(f => f.unitCount > 0);
                                    if (hasExistingConfig && newCount !== (formData.floors || 0)) {
                                        if (!window.confirm('Changing the floor count will delete existing floor/unit configuration that has already been set up. Continue?')) return;
                                    }
                                    handleChange(e);
                                }} className="w-full p-2 border rounded max-w-xs"/>
                                <p className="text-xs text-gray-500 mt-1">Floors are auto-generated based on this count.</p>
                            </div>
                            {formData.rentIsUniform && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Unit Type</label>
                                    <select 
                                        name="defaultUnitType" 
                                        value={formData.defaultUnitType as string || ''} 
                                        onChange={handleChange} 
                                        className="w-full p-2 border rounded bg-white max-w-xs"
                                    >
                                        <option value="">Select Type</option>
                                        {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Floor Tabs */}
                    {formData.floors ? (
                        <div className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm">
                            <div className="flex space-x-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
                                {formData.floorplan?.map((_, index) => (
                                    <button key={index} onClick={() => setActiveFloorIndex(index)} className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${activeFloorIndex === index ? 'bg-primary text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                        {index === 0 ? 'Ground Floor' : `Floor ${index}`}
                                    </button>
                                ))}
                            </div>
                            {formData.floorplan && formData.floorplan[activeFloorIndex] && (
                                <div className="animate-fade-in">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="block text-xs font-bold text-gray-500 uppercase">Configuration for {activeFloorIndex === 0 ? 'Ground Floor' : `Floor ${activeFloorIndex}`}</label>
                                        <div className="text-xs text-gray-400">
                                            {formData.floorplan[activeFloorIndex].compositionType === 'Uniform' 
                                                ? `${formData.floorplan[activeFloorIndex].unitCount} Units` 
                                                : 'Mixed Units'}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Composition Type</label>
                                            <select 
                                                value={formData.floorplan[activeFloorIndex].compositionType}
                                                onChange={(e) => {
                                                    const newPlan = [...formData.floorplan!];
                                                    newPlan[activeFloorIndex] = { ...newPlan[activeFloorIndex], compositionType: e.target.value as any };
                                                    setFormData(p => ({ ...p, floorplan: newPlan }));
                                                }}
                                                className="w-full p-2 border rounded bg-gray-50"
                                            >
                                                <option value="Uniform">Uniform (Same Unit Type)</option>
                                                <option value="Mixed">Mixed (Various Types)</option>
                                            </select>
                                        </div>

                                        {formData.floorplan[activeFloorIndex].compositionType === 'Uniform' ? (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">Unit Type</label>
                                                    <select 
                                                        value={formData.floorplan[activeFloorIndex].unitType || ''}
                                                        onChange={(e) => {
                                                            const newPlan = [...formData.floorplan!];
                                                            newPlan[activeFloorIndex] = { ...newPlan[activeFloorIndex], unitType: e.target.value as UnitType };
                                                            setFormData(p => ({ ...p, floorplan: newPlan }));
                                                        }}
                                                        className="w-full p-2 border rounded bg-white"
                                                    >
                                                        <option value="">Select Type</option>{UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">Unit Count</label>
                                                    <input 
                                                        type="number" 
                                                        placeholder="#"
                                                        value={formData.floorplan[activeFloorIndex].unitCount || ''}
                                                        onChange={(e) => {
                                                            const newPlan = [...formData.floorplan!];
                                                            newPlan[activeFloorIndex] = { ...newPlan[activeFloorIndex], unitCount: parseInt(e.target.value) || 0 };
                                                            setFormData(p => ({ ...p, floorplan: newPlan }));
                                                        }}
                                                        className="w-full p-2 border rounded"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-gray-50 p-3 rounded border border-gray-200 col-span-1 md:col-span-2">
                                                <p className="text-xs font-bold text-gray-500 mb-2">Enter count per type:</p>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    {UNIT_TYPES.map(type => (
                                                        <div key={type}>
                                                            <label className="block text-[10px] text-gray-500 mb-0.5">{type}</label>
                                                            <input 
                                                                type="number" 
                                                                value={formData.floorplan?.[activeFloorIndex].mixedComposition?.[type] || ''} 
                                                                onChange={(e) => {
                                                                    const newPlan = [...formData.floorplan!];
                                                                    const currentMixed = newPlan[activeFloorIndex].mixedComposition || {};
                                                                    newPlan[activeFloorIndex] = { 
                                                                        ...newPlan[activeFloorIndex], 
                                                                        mixedComposition: { ...currentMixed, [type]: parseInt(e.target.value) || 0 } 
                                                                    };
                                                                    setFormData(p => ({ ...p, floorplan: newPlan }));
                                                                }}
                                                                className="w-full p-1.5 border rounded text-sm"
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            )}

            {activeTab === 'documents' && (
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Profile Picture</label>
                        <div className="flex items-center gap-4">
                            <div 
                                className="w-32 h-32 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-gray-50"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {formData.profilePictureUrl ? (
                                    <img src={formData.profilePictureUrl} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-center p-2">
                                        <Icon name="branch" className="w-8 h-8 text-gray-400 mx-auto mb-1" />
                                        <span className="text-xs text-gray-500">Upload Photo</span>
                                    </div>
                                )}
                            </div>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*" 
                                onChange={handleProfilePicUpload} 
                            />
                            <div>
                                <button 
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()} 
                                    className="text-sm bg-white border border-gray-300 px-3 py-1.5 rounded font-medium hover:bg-gray-50 shadow-sm"
                                >
                                    Choose Image
                                </button>
                                <p className="text-xs text-gray-500 mt-1">Recommended: 400x400px</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t">
                        <div className="flex justify-between items-center mb-3">
                            <label className="block text-sm font-medium text-gray-700">Documents & Attachments</label>
                            <button 
                                type="button"
                                onClick={() => docInputRef.current?.click()} 
                                className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded font-bold hover:bg-primary/20 flex items-center"
                            >
                                <Icon name="plus" className="w-3 h-3 mr-1" /> Add Documents
                            </button>
                            <input 
                                type="file" 
                                ref={docInputRef} 
                                className="hidden" 
                                multiple 
                                onChange={handleDocsUpload} 
                            />
                        </div>
                        
                        <div className="space-y-2">
                            {formData.assets && formData.assets.length > 0 ? (
                                formData.assets.map((asset, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                                        <div className="flex items-center overflow-hidden">
                                            <Icon name="stack" className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium text-gray-800 truncate">{asset.name}</p>
                                                <p className="text-xs text-gray-500 uppercase">{asset.type}</p>
                                            </div>
                                        </div>
                                        <button onClick={() => removeAsset(idx)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                            <Icon name="close" className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-300 rounded-lg">
                                    <p className="text-sm text-gray-500">No documents attached yet.</p>
                                    <p className="text-xs text-gray-400">Upload Titles, Agreements, etc.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-8 flex justify-end space-x-3 border-t pt-4">
                <button onClick={onCancel} className="px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-md hover:bg-gray-200">Cancel</button>
                <button onClick={handleSave} className="px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark shadow-sm">Save Property</button>
            </div>
        </div>
    );
};

const UnitModal: React.FC<{ property: Property; onClose: () => void; onAddUnit: (propertyId: string, unit: Unit) => void; }> = ({ property, onClose, onAddUnit }) => {
    const [unitData, setUnitData] = useState<Partial<Unit>>({ bedrooms: 0, bathrooms: 1, status: 'Vacant' });
    const [selectedType, setSelectedType] = useState('');

    const isBedroomType = BEDROOM_UNIT_TYPES.has(selectedType);

    const handleTypeChange = (type: string) => {
        setSelectedType(type);
        const bedroomCount = type === 'One Bedroom' ? 1 : type === 'Two Bedrooms' ? 2 : type === 'Three Bedrooms' ? 3 : 0;
        setUnitData(p => ({ ...p, unitType: type, bedrooms: bedroomCount, bathrooms: bedroomCount > 0 ? 1 : 0 }));
    };

    const handleAdd = () => {
        if (!unitData.unitNumber) return alert('Unit Number is required');
        if (!selectedType) return alert('Unit Type is required');
        onAddUnit(property.id, { id: `u-${Date.now()}`, ...unitData } as Unit);
    };

    return (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">Add Unit</h2>
                <div className="space-y-3">
                    <input onChange={e => setUnitData(p => ({...p, unitNumber: e.target.value}))} placeholder="Unit Number (e.g. A1)" className="w-full p-2 border rounded"/>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Unit Type</label>
                        <select value={selectedType} onChange={e => handleTypeChange(e.target.value)} className="w-full p-2 border rounded bg-white">
                            <option value="">Select Type</option>
                            {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    {isBedroomType && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Bedrooms</label>
                                <input type="number" value={unitData.bedrooms ?? ''} placeholder="0" onChange={e => setUnitData(p => ({...p, bedrooms: e.target.value === '' ? '' as any : parseInt(e.target.value) || 0}))} className="w-full p-2 border rounded"/>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Bathrooms</label>
                                <input type="number" value={unitData.bathrooms ?? ''} placeholder="0" onChange={e => setUnitData(p => ({...p, bathrooms: e.target.value === '' ? '' as any : parseInt(e.target.value) || 0}))} className="w-full p-2 border rounded"/>
                            </div>
                        </div>
                    )}
                </div>
                <div className="mt-6 flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700">Cancel</button>
                    <button onClick={handleAdd} className="px-4 py-2 bg-primary text-white rounded font-semibold">Add Unit</button>
                </div>
            </div>
        </div>
    );
};

const Properties: React.FC = () => {
    const { properties, addProperty, updateProperty, addUnitToProperty, landlords, staff, checkPermission, currentUser } = useData();
    const [view, setView] = useState<'list' | 'form'>('list');
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
    const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
    const [propertyForUnit, setPropertyForUnit] = useState<Property | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate = isSuperAdmin || checkPermission('Properties', 'create');
    const canEdit = isSuperAdmin || checkPermission('Properties', 'edit');

    const filteredProperties = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return properties.filter(p => {
            const landlord = landlords.find(l => l.id === p.landlordId);
            const landlordName = (landlord?.name || '').toLowerCase();
            return p.name.toLowerCase().includes(query) ||
                p.branch.toLowerCase().includes(query) ||
                p.type.toLowerCase().includes(query) ||
                landlordName.includes(query);
        });
    }, [properties, searchQuery, landlords]);

    const handleEdit = (p: Property) => {
        if (!canEdit) return alert('You do not have permission to edit properties.');
        setSelectedProperty(p);
        setView('form');
    };

    const handleAddUnit = (propertyId: string, unit: Unit) => {
        if (!canEdit) return alert('You do not have permission to edit properties.');
        addUnitToProperty(propertyId, unit);
        setIsUnitModalOpen(false);
    };

    const handleSave = (p: Property) => {
        if (p.id && !canEdit) return alert('You do not have permission to edit properties.');
        if (!p.id && !canCreate) return alert('You do not have permission to create properties.');
        if (p.id) updateProperty(p.id, p);
        else addProperty({ ...p, id: `prop-${Date.now()}`, units: [] });
        setView('list');
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/landlords/overview'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Overview
            </button>
            
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Properties</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage properties, units, and assets.</p>
                </div>
                {view === 'list' && canCreate && (
                    <button onClick={() => { setSelectedProperty(null); setView('form'); }} className="px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark shadow-sm flex items-center">
                        <Icon name="branch" className="w-5 h-5 mr-2" /> New Property
                    </button>
                )}
            </div>
            
            {view === 'list' ? (
                <div className="space-y-4">
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Search properties..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-primary focus:border-primary shadow-sm"
                        />
                        <div className="absolute left-3 top-3.5 text-gray-400">
                            <Icon name="search" className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="grid gap-4">
                        {filteredProperties.map(p => (
                            <PropertyListItem
                                key={p.id}
                                property={p}
                                onEdit={handleEdit}
                                onAddUnit={(prop) => { setPropertyForUnit(prop); setIsUnitModalOpen(true); }}
                                canEdit={canEdit}
                            />
                        ))}
                        {filteredProperties.length === 0 && <p className="text-center text-gray-500 py-10">No properties found.</p>}
                    </div>
                </div>
            ) : (
                <PropertyForm 
                    property={selectedProperty} 
                    onCancel={() => setView('list')} 
                    onSave={handleSave}
                    landlords={landlords}
                    staff={staff}
                />
            )}

            {isUnitModalOpen && propertyForUnit && (
                <UnitModal property={propertyForUnit} onClose={() => setIsUnitModalOpen(false)} onAddUnit={handleAddUnit} />
            )}
        </div>
    );
};

export default Properties;
