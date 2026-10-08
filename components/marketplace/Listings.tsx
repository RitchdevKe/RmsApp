
import React, { useMemo, useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { MarketplaceListing, Unit, Property } from '../../types';
import { computePlacement, markCollected, markDisbursed } from '../../utils/thirdPartyPlacements';
import { generateThirdPartyPaymentTag, isPaymentTagUnique } from '../../utils/thirdPartyPaymentTag';

// --- Types for Form ---
type ListingType = 'Rent' | 'Sale' | 'AirBnB';

// --- MODAL: Add/Edit Listing ---
const ListingModal: React.FC<{ 
    listing?: MarketplaceListing | null; 
    onClose: () => void; 
    onSave: (l: MarketplaceListing) => void;
    properties: Property[];
    landlords: any[];
    staff: any[];
    allListings: MarketplaceListing[];
}> = ({ listing, onClose, onSave, properties, landlords, staff, allListings }) => {
    // Determine initial entry mode
    const isSystemProp = listing ? properties.some(p => p.id === listing.propertyId) : true;
    
    // Stage 1: Select Type
    const [type, setType] = useState<ListingType>(listing?.type || 'Rent');
    const [entryMode, setEntryMode] = useState<'System' | 'Manual'>(isSystemProp ? 'System' : 'Manual');
    
    // Stage 2: Select Unit (if new)
    const [selectedPropId, setSelectedPropId] = useState(listing?.propertyId || '');
    const [selectedUnitId, setSelectedUnitId] = useState(listing?.unitId || '');

    // Stage 3: Details
    const [formData, setFormData] = useState<Partial<MarketplaceListing>>(listing || {
        title: '', description: '', price: 0, currency: 'KES', features: [], images: [], status: 'Draft',
        propertyId: '', propertyName: '', unitId: '', unitNumber: '', location: '', zone: '',
        airbnbConfig: { cleaningFee: 0, checkInTime: '14:00', checkOutTime: '11:00', maxGuests: 2, houseRules: '', amenities: [] },
        saleConfig: { titleDeedType: 'Freehold', landSize: '', financingAvailable: false, propertyCategory: 'House', usageType: 'Residential' },
        ownerDetails: { name: '', contact: '', email: '', rating: 5, reviews: 0 },
        rentConfig: { depositAmount: 0, placementFeeModel: 'FirstMonthRent', furnished: 'Unfurnished' },
        ownerPayout: { payoutMethod: 'M-Pesa' },
    });

    // Auto-generate the payment tag the first time the user toggles to Manual + Rent.
    useEffect(() => {
        if (type === 'Rent' && entryMode === 'Manual' && !formData.paymentTag) {
            const tag = generateThirdPartyPaymentTag(properties, allListings);
            setFormData(prev => ({ ...prev, paymentTag: tag }));
        }
    }, [type, entryMode, formData.paymentTag, properties, allListings]);

    // Valid Units (Vacant) - Though now we primarily edit existing auto-listings
    const availableProperties = properties.filter(p => p.units.some(u => u.status === 'Vacant'));
    const selectedProperty = properties.find(p => p.id === selectedPropId);
    const availableUnits = selectedProperty?.units.filter(u => u.status === 'Vacant' || u.id === listing?.unitId) || [];

    // Auto-fill Owner Details & Title when Unit Selected (Only for System mode)
    useEffect(() => {
        if (entryMode === 'System' && selectedPropId && selectedUnitId && !listing) {
            const prop = properties.find(p => p.id === selectedPropId);
            const unit = prop?.units.find(u => u.id === selectedUnitId);
            const landlord = landlords.find(l => l.id === prop?.landlordId);
            const assignedAgent = staff.find((s: any) => s.id === prop?.assignedAgentId);
            const affiliate = landlords.find(l => l.role === 'Affiliate' && l.id === prop?.landlordId);
            const contactOwner = assignedAgent || affiliate || landlord;

            if (prop && unit) {
                setFormData(prev => ({
                    ...prev,
                    title: `${prop.name} - ${unit.unitNumber}`,
                    description: `${unit.bedrooms} Bedroom unit in ${prop.subLocation && prop.zone ? `${prop.subLocation} (${prop.zone})` : (prop.subLocation || prop.zone || prop.location || prop.branch || '')}.`,
                    price: type === 'Rent' ? (unit.rent || prop.defaultMonthlyRent || 0) : 0, // Default rent price
                    propertyName: prop.name,
                    unitNumber: unit.unitNumber,
                    location: prop.subLocation && prop.zone ? `${prop.subLocation} (${prop.zone})` : (prop.subLocation || prop.zone || prop.location || prop.branch || ''),
                    zone: prop.zone || '',
                    pinLocationUrl: prop.pinLocationUrl || '',
                    ownerDetails: {
                        name: contactOwner?.name || 'Management',
                        contact: contactOwner?.phone || '',
                        email: contactOwner?.email || '',
                        rating: 5,
                        reviews: 0
                    }
                }));
            }
        }
    }, [selectedPropId, selectedUnitId, properties, landlords, staff, listing, type, entryMode]);

    const handleFeatures = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Simple comma split
        const val = e.target.value;
        setFormData(prev => ({ ...prev, features: val.split(',') }));
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            const promises = files.map(file => {
                return new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            });

            Promise.all(promises).then(base64Images => {
                setFormData(prev => ({ ...prev, images: [...(prev.images || []), ...base64Images] }));
            });
        }
    };

    const removeImage = (index: number) => {
        setFormData(prev => ({
            ...prev,
            images: prev.images?.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = () => {
        // Validation
        if (entryMode === 'System' && (!selectedPropId || !selectedUnitId)) {
            alert("Please select a property and unit.");
            return;
        }
        if (entryMode === 'Manual' && (!formData.propertyName || !formData.location)) {
            alert("Please enter Property Name and Location.");
            return;
        }
        if (!formData.title || !formData.price) {
            alert("Please complete Title and Price.");
            return;
        }
        // Extra validation for third-party Rent listings
        if (entryMode === 'Manual' && type === 'Rent') {
            if (!formData.rentConfig?.depositAmount) {
                alert('Please enter the deposit amount.');
                return;
            }
            if (!formData.ownerDetails?.name || !formData.ownerDetails?.contact) {
                alert('Owner name and contact phone are required for third-party listings.');
                return;
            }
            const pm = formData.ownerPayout?.payoutMethod;
            if (pm === 'M-Pesa' && !formData.ownerPayout?.mpesaNumber) {
                alert('Please enter the M-Pesa number for owner payout.'); return;
            }
            if (pm === 'Bank' && (!formData.ownerPayout?.bankName || !formData.ownerPayout?.bankAccountNumber)) {
                alert('Please enter bank name and account number for owner payout.'); return;
            }
            const tag = (formData.paymentTag || '').trim().toUpperCase();
            if (!tag) { alert('A payment account tag is required (used for STK / C2B routing).'); return; }
            if (!isPaymentTagUnique(tag, properties, allListings, listing?.id)) {
                alert(`Payment tag "${tag}" is already in use. Please choose another.`);
                return;
            }
        }

        const finalListing: MarketplaceListing = {
            id: listing?.id || `lst-${Date.now()}`,
            propertyId: entryMode === 'System' ? selectedPropId : (listing?.propertyId || `manual-prop-${Date.now()}`),
            propertyName: formData.propertyName || '',
            unitId: entryMode === 'System' ? selectedUnitId : (listing?.unitId || `manual-unit-${Date.now()}`),
            unitNumber: formData.unitNumber || (entryMode === 'Manual' ? 'Main' : ''),
            type,
            status: formData.status || 'Draft',
            price: Number(formData.price),
            currency: formData.currency || 'KES',
            description: formData.description || '',
            title: formData.title || '',
            location: formData.location || '',
            zone: formData.zone || '',
            pinLocationUrl: formData.pinLocationUrl || '',
            images: formData.images || [],
            features: formData.features?.map(s => s.trim()) || [],
            airbnbConfig: type === 'AirBnB' ? formData.airbnbConfig : undefined,
            saleConfig: type === 'Sale' ? formData.saleConfig : undefined,
            ownerDetails: formData.ownerDetails || { name: 'Owner', contact: '', email: '' },
            dateCreated: listing?.dateCreated || new Date().toISOString(),
            // Third-party metadata. Manual entries are always third-party.
            source: entryMode === 'Manual' ? 'ThirdParty' : (listing?.source || 'Managed'),
            rentConfig: (entryMode === 'Manual' && type === 'Rent') ? formData.rentConfig : listing?.rentConfig,
            ownerPayout: (entryMode === 'Manual' && type === 'Rent') ? formData.ownerPayout : listing?.ownerPayout,
            placement: listing?.placement,
            paymentTag: (entryMode === 'Manual' && type === 'Rent')
                ? (formData.paymentTag || '').trim().toUpperCase()
                : listing?.paymentTag,
            tempTenantId: listing?.tempTenantId,
        };

        onSave(finalListing);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1500] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="text-xl font-bold text-gray-800">{listing ? 'Edit Listing' : 'Create New Listing'}</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>

                <div className="flex-grow overflow-y-auto p-8 space-y-6">
                    {/* Listing Type */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Listing Type</label>
                        <div className="flex gap-4">
                            {['Rent', 'Sale', 'AirBnB'].map(t => (
                                <button 
                                    key={t}
                                    onClick={() => !listing && setType(t as any)} // Disable change if editing existing
                                    disabled={!!listing}
                                    className={`flex-1 py-3 border rounded-xl text-sm font-bold transition-all ${
                                        type === t ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Entry Mode Toggle (Only for new or when applicable) */}
                    <div className="flex items-center gap-4 bg-gray-100 p-2 rounded-lg">
                            <button 
                                onClick={() => setEntryMode('System')}
                                className={`flex-1 py-2 text-xs font-bold rounded-md ${entryMode === 'System' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
                            >
                                Link to Managed Unit
                            </button>
                            <button 
                                onClick={() => setEntryMode('Manual')}
                                className={`flex-1 py-2 text-xs font-bold rounded-md ${entryMode === 'Manual' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
                            >
                                Manual Entry (Third-party)
                            </button>
                    </div>
                    {entryMode === 'Manual' && (
                        <div className="text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded p-3">
                            <strong>Third-party listing:</strong> this property is marketed but not managed.
                            It will not appear in Properties / Units. {type === 'Rent' && 'The agency will collect rent + deposit, retain the placement fee, and disburse the balance to the owner.'}
                        </div>
                    )}

                    {/* Unit Selection / Manual Entry */}
                    {entryMode === 'System' ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Property</label>
                                    <select 
                                        value={selectedPropId} 
                                        onChange={e => setSelectedPropId(e.target.value)} 
                                        disabled={!!listing}
                                        className="w-full p-2.5 border rounded-lg bg-white"
                                    >
                                        <option value="">Select Property</option>
                                        {availableProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Unit</label>
                                    <select 
                                        value={selectedUnitId} 
                                        onChange={e => setSelectedUnitId(e.target.value)} 
                                        disabled={!selectedPropId || !!listing}
                                        className="w-full p-2.5 border rounded-lg bg-white"
                                    >
                                        <option value="">Select Unit</option>
                                        {availableUnits.map(u => <option key={u.id} value={u.id}>{u.unitNumber} ({u.unitType || `${u.bedrooms}BR`})</option>)}
                                    </select>
                                </div>
                            </div>
                            {selectedUnitId && (
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Location</label>
                                        <input
                                            value={formData.location || ''}
                                            onChange={e => setFormData({...formData, location: e.target.value})}
                                            className="w-full p-2.5 border rounded-lg"
                                            placeholder="e.g. Kericho"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Zone</label>
                                        <input
                                            value={formData.zone || ''}
                                            onChange={e => setFormData({...formData, zone: e.target.value})}
                                            className="w-full p-2.5 border rounded-lg"
                                            placeholder="e.g. Brooke"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                             <div className="col-span-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Manual Property Details</div>
                             <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Property Name</label>
                                <input 
                                    value={formData.propertyName}
                                    onChange={e => setFormData({...formData, propertyName: e.target.value})}
                                    className="w-full p-2.5 border rounded-lg"
                                    placeholder="e.g. Sunset Villa"
                                />
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Unit Number/Name</label>
                                <input 
                                    value={formData.unitNumber}
                                    onChange={e => setFormData({...formData, unitNumber: e.target.value})}
                                    className="w-full p-2.5 border rounded-lg"
                                    placeholder="e.g. House No. 5"
                                />
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Location</label>
                                <input 
                                    value={formData.location}
                                    onChange={e => setFormData({...formData, location: e.target.value})}
                                    className="w-full p-2.5 border rounded-lg"
                                    placeholder="e.g. Kericho"
                                />
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Zone</label>
                                <input 
                                    value={formData.zone || ''}
                                    onChange={e => setFormData({...formData, zone: e.target.value})}
                                    className="w-full p-2.5 border rounded-lg"
                                    placeholder="e.g. Brooke"
                                />
                             </div>
                        </div>
                    )}

                    {/* Image Upload */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Images <span className="text-gray-400 font-normal">(Min 3 recommended)</span></label>
                        <div className="grid grid-cols-4 gap-3 mb-2">
                            {formData.images?.map((img, idx) => (
                                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group">
                                    <img src={img} className="w-full h-full object-cover" />
                                    <button 
                                        onClick={() => removeImage(idx)} 
                                        className="absolute top-1 right-1 bg-black/50 hover:bg-red-600 text-white rounded-full p-1 transition-colors"
                                    >
                                        <Icon name="close" className="w-3 h-3"/>
                                    </button>
                                </div>
                            ))}
                            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 aspect-square transition-colors hover:border-primary">
                                <Icon name="plus" className="w-8 h-8 text-gray-400" />
                                <span className="text-xs text-gray-500 mt-2 font-bold">Add Photos</span>
                                <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
                            </label>
                        </div>
                    </div>

                    {/* Core Details */}
                    <div className="space-y-4 border-t pt-4">
                        <input 
                            value={formData.title} 
                            onChange={e => setFormData({...formData, title: e.target.value})}
                            className="w-full p-3 text-lg font-bold border-b focus:border-primary outline-none"
                            placeholder="Listing Title (e.g. Luxury 2BR in Kilimani)"
                        />
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                    {type === 'Rent' ? 'Monthly Rent' : type === 'Sale' ? 'Sale Price' : 'Nightly Rate'} (KES)
                                </label>
                                <input 
                                    type="number"
                                    value={formData.price || ''} 
                                    onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                                    className="w-full p-2 border rounded-lg font-mono text-gray-800 font-bold"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Publish Status</label>
                                <select 
                                    value={formData.status} 
                                    onChange={e => setFormData({...formData, status: e.target.value as any})}
                                    className="w-full p-2 border rounded-lg bg-white"
                                >
                                    <option value="Draft">Draft (Hidden)</option>
                                    <option value="Published">Published (Live)</option>
                                </select>
                            </div>
                        </div>
                        <textarea 
                            value={formData.description} 
                            onChange={e => setFormData({...formData, description: e.target.value})}
                            className="w-full p-3 border rounded-lg text-sm"
                            rows={3}
                            placeholder="Detailed description..."
                        />
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Google / Pin Location URL</label>
                            <input
                                value={formData.pinLocationUrl || ''}
                                onChange={e => setFormData({ ...formData, pinLocationUrl: e.target.value })}
                                className="w-full p-2 border rounded-lg text-sm"
                                placeholder="https://maps.google.com/..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Features (comma separated)</label>
                            <input 
                                value={formData.features?.join(',')} 
                                onChange={handleFeatures}
                                className="w-full p-2 border rounded-lg text-sm"
                                placeholder="WiFi, Gym, Parking, Balcony..."
                            />
                        </div>
                    </div>

                    {/* AirBnB Specifics */}
                    {type === 'AirBnB' && (
                        <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 space-y-4">
                            <h4 className="font-bold text-purple-800 text-sm">AirBnB Settings</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                     <input 
                                        type="number" 
                                        placeholder="Cleaning Fee" 
                                        value={formData.airbnbConfig?.cleaningFee || ''}
                                        onChange={e => setFormData({
                                            ...formData, 
                                            airbnbConfig: { ...formData.airbnbConfig!, cleaningFee: e.target.value === '' ? '' as any : Number(e.target.value) }
                                        })}
                                        className="w-full p-2 border rounded text-sm"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">One-time fee per booking.</p>
                                </div>
                                <div>
                                    <input 
                                        type="number" 
                                        placeholder="Max Guests" 
                                        value={formData.airbnbConfig?.maxGuests || ''}
                                        onChange={e => setFormData({
                                            ...formData, 
                                            airbnbConfig: { ...formData.airbnbConfig!, maxGuests: e.target.value === '' ? '' as any : Number(e.target.value) }
                                        })}
                                        className="w-full p-2 border rounded text-sm"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Maximum occupancy.</p>
                                </div>
                                <div>
                                    <input 
                                        placeholder="Check-in (e.g. 14:00)" 
                                        value={formData.airbnbConfig?.checkInTime}
                                        onChange={e => setFormData({
                                            ...formData, 
                                            airbnbConfig: { ...formData.airbnbConfig!, checkInTime: e.target.value }
                                        })}
                                        className="w-full p-2 border rounded text-sm"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Earliest arrival time.</p>
                                </div>
                                <div>
                                    <input 
                                        placeholder="Check-out (e.g. 11:00)" 
                                        value={formData.airbnbConfig?.checkOutTime}
                                        onChange={e => setFormData({
                                            ...formData, 
                                            airbnbConfig: { ...formData.airbnbConfig!, checkOutTime: e.target.value }
                                        })}
                                        className="w-full p-2 border rounded text-sm"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Latest departure time.</p>
                                </div>
                            </div>
                            <textarea 
                                placeholder="House Rules..." 
                                value={formData.airbnbConfig?.houseRules}
                                onChange={e => setFormData({
                                    ...formData, 
                                    airbnbConfig: { ...formData.airbnbConfig!, houseRules: e.target.value }
                                })}
                                className="w-full p-2 border rounded text-sm h-20"
                            />
                        </div>
                    )}

                    {/* Sale Specifics */}
                    {type === 'Sale' && (
                         <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-4">
                            <h4 className="font-bold text-blue-800 text-sm">Sale Settings</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-blue-800/70 uppercase mb-1">Property Category</label>
                                    <select 
                                        value={formData.saleConfig?.propertyCategory || 'House'}
                                        onChange={e => setFormData({ ...formData, saleConfig: { ...formData.saleConfig!, propertyCategory: e.target.value as any } })}
                                        className="w-full p-2 border rounded text-sm bg-white"
                                    >
                                        <option value="House">House</option>
                                        <option value="Apartment">Apartment</option>
                                        <option value="Land">Land</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-blue-800/70 uppercase mb-1">Usage Type</label>
                                    <select 
                                        value={formData.saleConfig?.usageType || 'Residential'}
                                        onChange={e => setFormData({ ...formData, saleConfig: { ...formData.saleConfig!, usageType: e.target.value as any } })}
                                        className="w-full p-2 border rounded text-sm bg-white"
                                    >
                                        <option value="Residential">Residential</option>
                                        <option value="Commercial">Commercial</option>
                                        <option value="Mixed">Mixed</option>
                                    </select>
                                </div>
                                <div>
                                     <label className="block text-xs font-bold text-blue-800/70 uppercase mb-1">Title Type</label>
                                     <select 
                                        value={formData.saleConfig?.titleDeedType}
                                        onChange={e => setFormData({
                                            ...formData, 
                                            saleConfig: { ...formData.saleConfig!, titleDeedType: e.target.value }
                                        })}
                                        className="w-full p-2 border rounded text-sm bg-white"
                                    >
                                        <option>Freehold</option>
                                        <option>Leasehold</option>
                                        <option>Sectional Title</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-blue-800/70 uppercase mb-1">Land/Floor Size</label>
                                    <input 
                                        placeholder="e.g. 0.5 Acre / 150sqm" 
                                        value={formData.saleConfig?.landSize}
                                        onChange={e => setFormData({
                                            ...formData, 
                                            saleConfig: { ...formData.saleConfig!, landSize: e.target.value }
                                        })}
                                        className="w-full p-2 border rounded text-sm"
                                    />
                                </div>
                            </div>
                            <label className="flex items-center text-sm text-blue-900 font-medium">
                                <input 
                                    type="checkbox" 
                                    checked={formData.saleConfig?.financingAvailable}
                                    onChange={e => setFormData({
                                        ...formData, 
                                        saleConfig: { ...formData.saleConfig!, financingAvailable: e.target.checked }
                                    })}
                                    className="mr-2 h-4 w-4 text-blue-600 rounded"
                                />
                                Financing / Mortgage Available
                            </label>
                        </div>
                    )}

                    {/* Rent Settings (third-party manual entry) */}
                    {type === 'Rent' && entryMode === 'Manual' && (
                        <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 space-y-4">
                            <h4 className="font-bold text-orange-800 text-sm">Rent Settings (Third-party)</h4>
                            <div>
                                <label className="block text-xs font-bold text-orange-800/70 uppercase mb-1">M-Pesa / STK Account Tag</label>
                                <input value={formData.paymentTag || ''}
                                    onChange={e => setFormData({ ...formData, paymentTag: e.target.value.toUpperCase() })}
                                    className="w-full p-2 border rounded text-sm font-mono"
                                    placeholder="TP-001" />
                                <p className="text-[10px] text-orange-800/70 mt-1">Auto-generated. Used as the tenant's payment account number for STK push / C2B. Must be unique.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-orange-800/70 uppercase mb-1">Deposit (KES)</label>
                                    <input type="number" value={formData.rentConfig?.depositAmount ?? ''}
                                        onChange={e => setFormData({ ...formData, rentConfig: { ...(formData.rentConfig || { placementFeeModel: 'FirstMonthRent', depositAmount: 0 }), depositAmount: parseFloat(e.target.value) || 0 } })}
                                        className="w-full p-2 border rounded text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-orange-800/70 uppercase mb-1">Lease Term (months)</label>
                                    <input type="number" value={formData.rentConfig?.leaseTermMonths ?? ''}
                                        onChange={e => setFormData({ ...formData, rentConfig: { ...(formData.rentConfig || { placementFeeModel: 'FirstMonthRent', depositAmount: 0 }), leaseTermMonths: parseInt(e.target.value) || undefined } })}
                                        className="w-full p-2 border rounded text-sm" placeholder="e.g. 12" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-orange-800/70 uppercase mb-1">Furnished</label>
                                    <select value={formData.rentConfig?.furnished || 'Unfurnished'}
                                        onChange={e => setFormData({ ...formData, rentConfig: { ...(formData.rentConfig || { placementFeeModel: 'FirstMonthRent', depositAmount: 0 }), furnished: e.target.value as any } })}
                                        className="w-full p-2 border rounded text-sm bg-white">
                                        <option>Unfurnished</option><option>Semi</option><option>Furnished</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-orange-800/70 uppercase mb-1">Available From</label>
                                    <input type="date" value={formData.rentConfig?.availableFrom || ''}
                                        onChange={e => setFormData({ ...formData, rentConfig: { ...(formData.rentConfig || { placementFeeModel: 'FirstMonthRent', depositAmount: 0 }), availableFrom: e.target.value } })}
                                        className="w-full p-2 border rounded text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-orange-800/70 uppercase mb-1">Bedrooms</label>
                                    <input type="number" value={formData.rentConfig?.bedrooms ?? ''}
                                        onChange={e => setFormData({ ...formData, rentConfig: { ...(formData.rentConfig || { placementFeeModel: 'FirstMonthRent', depositAmount: 0 }), bedrooms: parseInt(e.target.value) || undefined } })}
                                        className="w-full p-2 border rounded text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-orange-800/70 uppercase mb-1">Bathrooms</label>
                                    <input type="number" value={formData.rentConfig?.bathrooms ?? ''}
                                        onChange={e => setFormData({ ...formData, rentConfig: { ...(formData.rentConfig || { placementFeeModel: 'FirstMonthRent', depositAmount: 0 }), bathrooms: parseInt(e.target.value) || undefined } })}
                                        className="w-full p-2 border rounded text-sm" />
                                </div>
                            </div>
                            <div className="border-t border-orange-200 pt-3">
                                <label className="block text-xs font-bold text-orange-800/70 uppercase mb-1">Placement Fee Model</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {([
                                        { v: 'FirstMonthRent', l: '1st Month Rent' },
                                        { v: 'PercentOfRent', l: '% of Rent' },
                                        { v: 'FlatFee', l: 'Flat KES' },
                                    ] as const).map(opt => (
                                        <button key={opt.v} type="button"
                                            onClick={() => setFormData({ ...formData, rentConfig: { ...(formData.rentConfig || { depositAmount: 0, placementFeeModel: 'FirstMonthRent' }), placementFeeModel: opt.v } })}
                                            className={`py-2 text-xs font-bold rounded border ${formData.rentConfig?.placementFeeModel === opt.v ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                                            {opt.l}
                                        </button>
                                    ))}
                                </div>
                                {formData.rentConfig?.placementFeeModel === 'PercentOfRent' && (
                                    <input type="number" placeholder="% of monthly rent (e.g. 100)" value={formData.rentConfig?.placementFeePercent ?? ''}
                                        onChange={e => setFormData({ ...formData, rentConfig: { ...(formData.rentConfig || { depositAmount: 0, placementFeeModel: 'PercentOfRent' }), placementFeePercent: parseFloat(e.target.value) || 0 } })}
                                        className="w-full p-2 border rounded text-sm mt-2" />
                                )}
                                {formData.rentConfig?.placementFeeModel === 'FlatFee' && (
                                    <input type="number" placeholder="Flat fee (KES)" value={formData.rentConfig?.placementFeeFlat ?? ''}
                                        onChange={e => setFormData({ ...formData, rentConfig: { ...(formData.rentConfig || { depositAmount: 0, placementFeeModel: 'FlatFee' }), placementFeeFlat: parseFloat(e.target.value) || 0 } })}
                                        className="w-full p-2 border rounded text-sm mt-2" />
                                )}
                            </div>
                            <textarea placeholder="Internal notes about this third-party listing…" value={formData.rentConfig?.notes || ''}
                                onChange={e => setFormData({ ...formData, rentConfig: { ...(formData.rentConfig || { depositAmount: 0, placementFeeModel: 'FirstMonthRent' }), notes: e.target.value } })}
                                className="w-full p-2 border rounded text-sm h-16" />
                        </div>
                    )}

                    {/* Owner Payout (third-party Rent only) */}
                    {type === 'Rent' && entryMode === 'Manual' && (
                        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 space-y-3">
                            <h4 className="font-bold text-emerald-800 text-sm">Owner Payout Details</h4>
                            <p className="text-xs text-emerald-800/70">Where the deposit (less placement fee) will be sent to the property owner.</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-emerald-800/70 uppercase mb-1">Payout Method</label>
                                    <select value={formData.ownerPayout?.payoutMethod || 'M-Pesa'}
                                        onChange={e => setFormData({ ...formData, ownerPayout: { ...(formData.ownerPayout || {}), payoutMethod: e.target.value as any } })}
                                        className="w-full p-2 border rounded text-sm bg-white">
                                        <option>M-Pesa</option><option>Bank</option><option>Cash</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-emerald-800/70 uppercase mb-1">Owner ID/KRA</label>
                                    <input value={formData.ownerPayout?.idNumber || ''}
                                        onChange={e => setFormData({ ...formData, ownerPayout: { ...(formData.ownerPayout || { payoutMethod: 'M-Pesa' }), idNumber: e.target.value } })}
                                        className="w-full p-2 border rounded text-sm" />
                                </div>
                                {(formData.ownerPayout?.payoutMethod === 'M-Pesa') && (
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-emerald-800/70 uppercase mb-1">M-Pesa Number</label>
                                        <input value={formData.ownerPayout?.mpesaNumber || ''}
                                            onChange={e => setFormData({ ...formData, ownerPayout: { ...(formData.ownerPayout || { payoutMethod: 'M-Pesa' }), mpesaNumber: e.target.value } })}
                                            className="w-full p-2 border rounded text-sm" placeholder="07…" />
                                    </div>
                                )}
                                {(formData.ownerPayout?.payoutMethod === 'Bank') && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold text-emerald-800/70 uppercase mb-1">Bank Name</label>
                                            <input value={formData.ownerPayout?.bankName || ''}
                                                onChange={e => setFormData({ ...formData, ownerPayout: { ...(formData.ownerPayout || { payoutMethod: 'Bank' }), bankName: e.target.value } })}
                                                className="w-full p-2 border rounded text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-emerald-800/70 uppercase mb-1">Branch</label>
                                            <input value={formData.ownerPayout?.bankBranch || ''}
                                                onChange={e => setFormData({ ...formData, ownerPayout: { ...(formData.ownerPayout || { payoutMethod: 'Bank' }), bankBranch: e.target.value } })}
                                                className="w-full p-2 border rounded text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-emerald-800/70 uppercase mb-1">Account Name</label>
                                            <input value={formData.ownerPayout?.bankAccountName || ''}
                                                onChange={e => setFormData({ ...formData, ownerPayout: { ...(formData.ownerPayout || { payoutMethod: 'Bank' }), bankAccountName: e.target.value } })}
                                                className="w-full p-2 border rounded text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-emerald-800/70 uppercase mb-1">Account Number</label>
                                            <input value={formData.ownerPayout?.bankAccountNumber || ''}
                                                onChange={e => setFormData({ ...formData, ownerPayout: { ...(formData.ownerPayout || { payoutMethod: 'Bank' }), bankAccountNumber: e.target.value } })}
                                                className="w-full p-2 border rounded text-sm" />
                                        </div>
                                    </>
                                )}
                            </div>
                            <textarea placeholder="Payout notes (e.g. payout day, conditions)…" value={formData.ownerPayout?.payoutNotes || ''}
                                onChange={e => setFormData({ ...formData, ownerPayout: { ...(formData.ownerPayout || { payoutMethod: 'M-Pesa' }), payoutNotes: e.target.value } })}
                                className="w-full p-2 border rounded text-sm h-14" />
                        </div>
                    )}

                    {/* Owner Details (Read Only Review or Manual Input if not system) */}
                    <div className="p-4 bg-gray-50 rounded border border-gray-200 text-sm text-gray-500">
                        {entryMode === 'System' ? (
                            <><strong>Owner Contact (For Inquiries):</strong> {formData.ownerDetails?.name} | {formData.ownerDetails?.contact}</>
                        ) : (
                            <div className="space-y-4">
                                <p className="text-xs font-bold text-gray-500 uppercase">Owner Details (Manual)</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block font-bold mb-1 text-xs">Owner Name</label>
                                        <input 
                                            value={formData.ownerDetails?.name}
                                            onChange={e => setFormData({...formData, ownerDetails: {...formData.ownerDetails!, name: e.target.value}})}
                                            className="w-full p-2 border rounded bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold mb-1 text-xs">Contact Phone</label>
                                        <input 
                                            value={formData.ownerDetails?.contact}
                                            onChange={e => setFormData({...formData, ownerDetails: {...formData.ownerDetails!, contact: e.target.value}})}
                                            className="w-full p-2 border rounded bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold mb-1 text-xs">Email Address</label>
                                        <input 
                                            type="email"
                                            value={formData.ownerDetails?.email}
                                            onChange={e => setFormData({...formData, ownerDetails: {...formData.ownerDetails!, email: e.target.value}})}
                                            className="w-full p-2 border rounded bg-white"
                                        />
                                    </div>
                                     <div>
                                        <label className="block font-bold mb-1 text-xs">Rating (0-5)</label>
                                        <input 
                                            type="number"
                                            max={5}
                                            min={0}
                                            step={0.1}
                                            value={formData.ownerDetails?.rating}
                                            onChange={e => setFormData({...formData, ownerDetails: {...formData.ownerDetails!, rating: parseFloat(e.target.value) || 0}})}
                                            className="w-full p-2 border rounded bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-bold mb-1 text-xs">Review Count</label>
                                        <input 
                                            type="number"
                                            value={formData.ownerDetails?.reviews ?? ''}
                                            onChange={e => setFormData({...formData, ownerDetails: {...formData.ownerDetails!, reviews: e.target.value === '' ? '' as any : parseInt(e.target.value) || 0}})}
                                            className="w-full p-2 border rounded bg-white"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                    <button onClick={onClose} className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-100">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-md">
                        {formData.status === 'Published' ? 'Publish Now' : 'Save Draft'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Temporary tenant registration (third-party listings) ---
const RegisterTempTenantModal: React.FC<{
    listing: MarketplaceListing;
    onClose: () => void;
    onSave: (tenant: NonNullable<MarketplaceListing['tempTenant']>) => void;
}> = ({ listing, onClose, onSave }) => {
    const existing = listing.tempTenant;
    const [name, setName] = useState(existing?.name || '');
    const [phone, setPhone] = useState(existing?.phone || '');
    const [email, setEmail] = useState(existing?.email || '');
    const [idNumber, setIdNumber] = useState(existing?.idNumber || '');
    const [moveInDate, setMoveInDate] = useState(existing?.moveInDate || '');
    const [notes, setNotes] = useState(existing?.notes || '');

    const submit = () => {
        if (!name.trim() || !phone.trim()) { alert('Name and phone are required.'); return; }
        onSave({
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
            idNumber: idNumber.trim() || undefined,
            moveInDate: moveInDate || undefined,
            notes: notes.trim() || undefined,
            registeredAt: existing?.registeredAt || new Date().toISOString(),
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1600] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Register Temporary Tenant</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded p-3 text-xs mb-3">
                    <div className="font-bold text-gray-800">{listing.propertyName} · {listing.unitNumber}</div>
                    {listing.paymentTag && (
                        <div className="mt-1 font-mono text-purple-800">Pay account: <strong>{listing.paymentTag}</strong></div>
                    )}
                    <div className="mt-1 text-gray-600">Payments via STK/C2B will be matched to this tenant.</div>
                </div>
                <div className="space-y-3 text-sm">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name *</label>
                        <input value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border rounded" placeholder="e.g. Jane Mwangi" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone *</label>
                            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-2 border rounded" placeholder="07..." />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ID Number</label>
                            <input value={idNumber} onChange={e => setIdNumber(e.target.value)} className="w-full p-2 border rounded" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-2 border rounded" placeholder="optional" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Move-in Date</label>
                        <input type="date" value={moveInDate} onChange={e => setMoveInDate(e.target.value)} className="w-full p-2 border rounded" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-2 border rounded" rows={2} />
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-medium">Cancel</button>
                    <button onClick={submit} className="px-4 py-2 bg-purple-600 text-white rounded font-bold hover:bg-purple-700">Save Tenant</button>
                </div>
            </div>
        </div>
    );
};

const ListingCard: React.FC<{ listing: MarketplaceListing; onEdit: () => void; onDelete: () => void; onMarkOccupied: () => void; onCollectPlacement?: () => void; onDisburse?: () => void; onRegisterTenant?: () => void }> = ({ listing, onEdit, onDelete, onMarkOccupied, onCollectPlacement, onDisburse, onRegisterTenant }) => (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 group flex flex-col h-full relative">
        <div className="h-40 bg-gray-200 relative overflow-hidden">
            {listing.images[0] ? (
                <img src={listing.images[0]} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={listing.title} />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-100">
                    <Icon name="vacant-house" className="w-12 h-12 opacity-20" />
                </div>
            )}
            <div className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded shadow-sm uppercase ${
                listing.status === 'Published' ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'
            }`}>
                {listing.status}
            </div>
             <div className={`absolute top-3 left-3 text-[10px] font-bold px-2 py-1 rounded shadow-sm uppercase ${
                listing.type === 'AirBnB' ? 'bg-pink-500 text-white' : 
                listing.type === 'Sale' ? 'bg-blue-600 text-white' : 
                'bg-orange-500 text-white'
            }`}>
                {listing.type}
            </div>
            {listing.source === 'ThirdParty' && (
                <div className="absolute top-9 left-3 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm uppercase bg-purple-600 text-white">
                    Third-party
                </div>
            )}
            {listing.source === 'ThirdParty' && listing.status === 'Published' && (
                <div className="absolute top-[60px] left-3 text-[9px] font-bold px-2 py-0.5 rounded shadow-sm uppercase bg-indigo-600 text-white">
                    Featured · External
                </div>
            )}
            {listing.images.length > 1 && (
                 <div className="absolute bottom-3 right-3 bg-black/50 text-white text-[10px] px-2 py-1 rounded-full flex items-center">
                     <Icon name="stack" className="w-3 h-3 mr-1" /> {listing.images.length}
                 </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-8">
                <p className="text-white font-bold text-lg">KES {Number(listing.price ?? 0).toLocaleString()}</p>
            </div>
        </div>
        
        <div className="p-5 flex-grow flex flex-col">
            <h3 className="font-bold text-gray-800 text-sm mb-1 line-clamp-1">{listing.title}</h3>
            <p className="text-xs text-gray-500 mb-3 flex items-center">
                <Icon name="branch" className="w-3 h-3 mr-1 text-gray-400"/> {listing.location}
            </p>
            
            {listing.type === 'AirBnB' && (
                <div className="text-xs text-gray-600 mb-3 bg-pink-50 p-2 rounded">
                    Guests: {listing.airbnbConfig?.maxGuests} • Rules: {listing.airbnbConfig?.houseRules ? 'Yes' : 'No'}
                </div>
            )}
            {listing.type === 'Sale' && (
                <div className="text-xs text-gray-600 mb-3 bg-blue-50 p-2 rounded flex flex-wrap gap-2">
                    <span>{listing.saleConfig?.propertyCategory}</span>
                    <span>•</span>
                    <span>{listing.saleConfig?.usageType}</span>
                    <span>•</span>
                    <span>{listing.saleConfig?.titleDeedType}</span>
                </div>
            )}
            {listing.type === 'Rent' && (
                <div className="text-xs text-gray-700 mb-3 bg-blue-50 p-2 rounded">
                    {listing.rentConfig?.unitType && (
                        <div className="mb-1 font-bold text-blue-800">Type: {listing.rentConfig.unitType}</div>
                    )}
                    {Number(listing.rentConfig?.depositAmount) > 0 && (
                        <div className="mb-1">Deposit: KES {Number(listing.rentConfig?.depositAmount || 0).toLocaleString()}</div>
                    )}
                    {listing.source === 'ThirdParty' && (
                        <div className="mt-2 pt-1 border-t border-blue-100">
                            {listing.paymentTag && (
                                <div className="mb-1 font-mono font-bold text-purple-800">Pay to: {listing.paymentTag}</div>
                            )}
                            Fee: {listing.rentConfig?.placementFeeModel === 'FirstMonthRent' ? '1st month' : listing.rentConfig?.placementFeeModel === 'PercentOfRent' ? `${listing.rentConfig?.placementFeePercent || 0}%` : `KES ${(listing.rentConfig?.placementFeeFlat || 0).toLocaleString()}`}
                            {listing.placement?.status && (
                                <span className={`ml-2 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${listing.placement.status === 'Disbursed' ? 'bg-green-600 text-white' : listing.placement.status === 'Collected' ? 'bg-amber-500 text-white' : 'bg-gray-300 text-gray-700'}`}>
                                    {listing.placement.status}
                                </span>
                            )}
                            {listing.tempTenant && (
                                <div className="mt-1 pt-1 border-t border-purple-100 text-[11px] text-purple-900">
                                    <span className="font-bold">Temp tenant:</span> {listing.tempTenant.name} · {listing.tempTenant.phone}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="mt-auto flex gap-2 pt-3 border-t border-gray-50">
                <button onClick={onEdit} className="flex-1 py-1.5 bg-gray-100 text-gray-700 text-xs font-bold rounded hover:bg-gray-200 transition-colors">
                    Edit Details
                </button>
                <button onClick={onDelete} className="px-2 py-1.5 bg-white border border-red-200 text-red-500 text-xs font-bold rounded hover:bg-red-50">
                    <Icon name="trash" className="w-3 h-3" />
                </button>
            </div>
            
            {listing.status === 'Published' && listing.source !== 'ThirdParty' && (
                <button onClick={onMarkOccupied} className="w-full mt-2 py-2 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 shadow-sm">
                    Mark Occupied / Sold
                </button>
            )}
            {listing.source === 'ThirdParty' && listing.type === 'Rent' && onCollectPlacement && (
                (!listing.placement || listing.placement.status === 'Pending') ? (
                    !listing.tempTenant && onRegisterTenant ? (
                        <button onClick={onRegisterTenant} className="w-full mt-2 py-2 bg-purple-600 text-white text-xs font-bold rounded hover:bg-purple-700 shadow-sm">
                            Register Temporary Tenant
                        </button>
                    ) : (
                        <button onClick={onCollectPlacement} className="w-full mt-2 py-2 bg-amber-600 text-white text-xs font-bold rounded hover:bg-amber-700 shadow-sm">
                            Collect Placement Payment
                        </button>
                    )
                ) : listing.placement.status === 'Collected' && onDisburse ? (
                    <button onClick={onDisburse} className="w-full mt-2 py-2 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 shadow-sm">
                        Mark Owner Disbursed (KES {Number(listing.placement.ownerPayable || 0).toLocaleString()})
                    </button>
                ) : (
                    <div className="w-full mt-2 py-2 bg-green-50 text-green-700 text-xs font-bold rounded text-center">
                        Disbursed · Ref {listing.placement.disbursementRef}
                    </div>
                )
            )}
            {listing.status === 'Published' && listing.pinLocationUrl && (
                <a
                    href={listing.pinLocationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full mt-2 py-2 bg-blue-50 text-blue-700 text-xs font-bold rounded hover:bg-blue-100 shadow-sm text-center block"
                >
                    Open Map Pin
                </a>
            )}
        </div>
    </div>
);

// --- MAIN COMPONENT ---

const Listings: React.FC = () => {
    const { properties, landlords, staff, marketplaceListings, addMarketplaceListing, updateMarketplaceListing, deleteMarketplaceListing, markUnitOccupied } = useData();
    
    // UI State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingListing, setEditingListing] = useState<MarketplaceListing | null>(null);
    const [filterType, setFilterType] = useState('All');
    const [filterSource, setFilterSource] = useState<'All' | 'Managed' | 'ThirdParty'>('All');
    const [collectFor, setCollectFor] = useState<MarketplaceListing | null>(null);
    const [disburseFor, setDisburseFor] = useState<MarketplaceListing | null>(null);
    const [registerFor, setRegisterFor] = useState<MarketplaceListing | null>(null);

    // Search and advanced filtering state
    const [searchUnit, setSearchUnit] = useState('');
    const [searchPrice, setSearchPrice] = useState('');
    const [searchProperty, setSearchProperty] = useState('');
    const [searchLocation, setSearchLocation] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    // --- Derived Data ---
    
    // Auto-populated listing logic is handled in DataContext now.
    // marketplaceListings contains automatically created listings from vacant units.
    
    const displayedListings = useMemo(() => {
        return marketplaceListings.filter(l => {
            if (filterType !== 'All' && l.type !== filterType) return false;
            const src = l.source || 'Managed';
            if (filterSource !== 'All' && src !== filterSource) return false;
            
            // Search filters
            if (searchUnit.trim() && !l.unitNumber?.toLowerCase().includes(searchUnit.toLowerCase())) return false;
            if (searchProperty.trim() && !l.propertyName?.toLowerCase().includes(searchProperty.toLowerCase())) return false;
            if (searchLocation.trim() && !l.location?.toLowerCase().includes(searchLocation.toLowerCase())) return false;
            if (searchPrice.trim()) {
                const maxPrice = parseFloat(searchPrice);
                if (!isNaN(maxPrice) && l.price > maxPrice) return false;
            }
            
            return true;
        });
    }, [marketplaceListings, filterType, filterSource, searchUnit, searchProperty, searchLocation, searchPrice]);

    // --- Actions ---

    const handleSave = (listing: MarketplaceListing) => {
        if (editingListing) {
            updateMarketplaceListing(listing.id, listing);
        } else {
            addMarketplaceListing(listing);
        }
        setIsModalOpen(false);
        setEditingListing(null);
    };

    const handleDelete = (id: string) => {
        if (confirm("Delete this listing? If the unit is still vacant, it may auto-repopulate.")) {
            deleteMarketplaceListing(id);
        }
    };

    const handleMarkOccupied = (listing: MarketplaceListing) => {
        const action = listing.type === 'Sale' ? 'Sold' : 'Occupied';
        if (confirm(`Mark this unit as ${action}? This will remove the listing and update property records.`)) {
            markUnitOccupied(listing.propertyId, listing.unitId);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Listings Manager</h1>
                    <p className="text-lg text-gray-500 mt-1">
                        Control public inventory. Vacant units are 
                        <span className="text-green-600 font-bold ml-1">automatically added</span> here.
                    </p>
                </div>
                <div className="flex bg-green-50 p-2 rounded-xl border border-green-200 text-green-800 text-sm font-bold items-center">
                    <Icon name="check" className="w-4 h-4 mr-2" />
                    Auto-Sync Active: Vacancies are pushed to Website API.
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {['All', 'Rent', 'Sale', 'AirBnB'].map(type => (
                            <button 
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                                    filterType === type ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                    <span className="hidden sm:inline-block w-px h-5 bg-gray-200 self-center" />
                    <div className="flex flex-wrap items-center gap-1.5">
                        {(['All', 'Managed', 'ThirdParty'] as const).map(s => (
                            <button key={s} onClick={() => setFilterSource(s)}
                                className={`px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${filterSource === s ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                                {s === 'ThirdParty' ? 'Third-party' : s}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
                    <button
                        onClick={() => setShowSearch(prev => !prev)}
                        className={`px-4 py-2 rounded-lg font-bold text-sm shadow-sm flex items-center transition-colors border ${
                            showSearch || searchUnit || searchPrice || searchProperty || searchLocation
                                ? 'bg-amber-50 text-amber-700 border-amber-300' 
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        <Icon name="search" className="w-4 h-4 mr-2" />
                        Search / Filter{(searchUnit || searchPrice || searchProperty || searchLocation) ? ' (Active)' : ''}
                    </button>
                    <button 
                        onClick={() => { setEditingListing(null); setIsModalOpen(true); }}
                        className="bg-primary text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-primary-dark shadow-sm flex items-center whitespace-nowrap"
                    >
                        <Icon name="plus" className="w-4 h-4 mr-2" /> New Listing
                    </button>
                </div>
            </div>

            {/* Search Panel */}
            {showSearch && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-inner grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 animate-fadeIn">
                    <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase">Property Name</label>
                        <div className="relative">
                            <input
                                type="text"
                                className="w-full p-2 pl-8 border rounded-lg bg-white text-sm"
                                placeholder="e.g. Kilimani Oasis"
                                value={searchProperty}
                                onChange={e => setSearchProperty(e.target.value)}
                            />
                            <span className="absolute left-2.5 top-2.5 text-gray-400">
                                <Icon name="register" className="w-4 h-4" />
                            </span>
                            {searchProperty && (
                                <button onClick={() => setSearchProperty('')} className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
                                    <Icon name="close" className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase">Unit Number</label>
                        <div className="relative">
                            <input
                                type="text"
                                className="w-full p-2 pl-8 border rounded-lg bg-white text-sm"
                                placeholder="e.g. B4, 302"
                                value={searchUnit}
                                onChange={e => setSearchUnit(e.target.value)}
                            />
                            <span className="absolute left-2.5 top-2.5 text-gray-400">
                                <Icon name="dashboard" className="w-4 h-4" />
                            </span>
                            {searchUnit && (
                                <button onClick={() => setSearchUnit('')} className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
                                    <Icon name="close" className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase">Location / Area</label>
                        <div className="relative">
                            <input
                                type="text"
                                className="w-full p-2 pl-8 border rounded-lg bg-white text-sm"
                                placeholder="e.g. Hurlingham"
                                value={searchLocation}
                                onChange={e => setSearchLocation(e.target.value)}
                            />
                            <span className="absolute left-2.5 top-2.5 text-gray-400">
                                <Icon name="map-pin" className="w-4 h-4" />
                            </span>
                            {searchLocation && (
                                <button onClick={() => setSearchLocation('')} className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
                                    <Icon name="close" className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase">Max Budget (Price)</label>
                        <div className="relative">
                            <input
                                type="number"
                                min={0}
                                className="w-full p-2 pl-12 border rounded-lg bg-white text-sm"
                                placeholder="e.g. 50000"
                                value={searchPrice}
                                onChange={e => setSearchPrice(e.target.value)}
                            />
                            <span className="absolute left-2.5 top-2.5 text-xs font-bold text-gray-400">
                                KES
                            </span>
                            {searchPrice && (
                                <button onClick={() => setSearchPrice('')} className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
                                    <Icon name="close" className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {(searchProperty || searchUnit || searchLocation || searchPrice) && (
                        <div className="sm:col-span-2 md:col-span-4 flex justify-end">
                            <button
                                onClick={() => {
                                    setSearchProperty('');
                                    setSearchUnit('');
                                    setSearchLocation('');
                                    setSearchPrice('');
                                }}
                                className="text-xs text-red-500 font-bold hover:underline flex items-center gap-1"
                            >
                                <Icon name="trash" className="w-3.5 h-3.5" /> Clear Search Filters
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Listings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {displayedListings.map(l => (
                    <ListingCard 
                        key={l.id} 
                        listing={l} 
                        onEdit={() => { setEditingListing(l); setIsModalOpen(true); }}
                        onDelete={() => handleDelete(l.id)}
                        onMarkOccupied={() => handleMarkOccupied(l)}
                        onCollectPlacement={() => setCollectFor(l)}
                        onDisburse={() => setDisburseFor(l)}
                        onRegisterTenant={() => setRegisterFor(l)}
                    />
                ))}
                {displayedListings.length === 0 && (
                    <div className="col-span-full py-20 text-center text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                        <Icon name="search" className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No listings found. Vacant units will appear here automatically.</p>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <ListingModal 
                    listing={editingListing} 
                    onClose={() => setIsModalOpen(false)} 
                    onSave={handleSave} 
                    properties={properties}
                    landlords={landlords}
                    staff={staff}
                    allListings={marketplaceListings}
                />
            )}
            {collectFor && (
                <CollectPlacementModal listing={collectFor} onClose={() => setCollectFor(null)}
                    onSave={(amount) => {
                        const placement = markCollected(collectFor, amount);
                        updateMarketplaceListing(collectFor.id, { ...collectFor, placement, status: 'Rented' });
                        setCollectFor(null);
                    }} />
            )}
            {disburseFor && (
                <DisburseModal listing={disburseFor} onClose={() => setDisburseFor(null)}
                    onSave={(ref) => {
                        const placement = markDisbursed(disburseFor, ref);
                        updateMarketplaceListing(disburseFor.id, { ...disburseFor, placement });
                        setDisburseFor(null);
                    }} />
            )}
            {registerFor && (
                <RegisterTempTenantModal listing={registerFor} onClose={() => setRegisterFor(null)}
                    onSave={(tenant) => {
                        updateMarketplaceListing(registerFor.id, { ...registerFor, tempTenant: tenant, tempTenantId: registerFor.tempTenantId || `tmp-${Date.now()}` });
                        setRegisterFor(null);
                    }} />
            )}
        </div>
    );
};

export default Listings;

// --- Placement collection modal ---
const CollectPlacementModal: React.FC<{ listing: MarketplaceListing; onClose: () => void; onSave: (amount: number) => void }> = ({ listing, onClose, onSave }) => {
    const expected = Number(listing.price || 0) + Number(listing.rentConfig?.depositAmount || 0);
    const [amount, setAmount] = useState<number>(expected);
    const b = computePlacement(listing, amount);
    return (
        <div className="fixed inset-0 bg-black/60 z-[1600] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Collect Placement Payment</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="space-y-3 text-sm">
                    <div className="bg-purple-50 border border-purple-100 rounded p-3">
                        <div className="font-bold text-gray-800">{listing.propertyName} · {listing.unitNumber}</div>
                        <div className="text-xs text-gray-600 mt-1">Owner: {listing.ownerDetails?.name} ({listing.ownerDetails?.contact})</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-gray-50 rounded p-2"><div className="text-gray-500">Rent</div><div className="font-bold">KES {b.rent.toLocaleString()}</div></div>
                        <div className="bg-gray-50 rounded p-2"><div className="text-gray-500">Deposit</div><div className="font-bold">KES {b.deposit.toLocaleString()}</div></div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount Collected (KES)</label>
                        <input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} className="w-full p-2 border rounded" />
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded p-3 space-y-1 text-xs">
                        <div className="flex justify-between"><span>Placement fee (agency keeps)</span><span className="font-bold">KES {b.placementFee.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span>Owner payable (deposit to owner)</span><span className="font-bold text-green-700">KES {b.ownerPayable.toLocaleString()}</span></div>
                        {b.shortfall > 0 && <div className="flex justify-between text-rose-600"><span>Shortfall vs expected</span><span className="font-bold">KES {b.shortfall.toLocaleString()}</span></div>}
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-medium">Cancel</button>
                    <button onClick={() => amount > 0 && onSave(amount)} className="px-4 py-2 bg-amber-600 text-white rounded font-bold hover:bg-amber-700">Record Collection</button>
                </div>
            </div>
        </div>
    );
};

const DisburseModal: React.FC<{ listing: MarketplaceListing; onClose: () => void; onSave: (ref: string) => void }> = ({ listing, onClose, onSave }) => {
    const [ref, setRef] = useState('');
    const payable = Number(listing.placement?.ownerPayable || 0);
    return (
        <div className="fixed inset-0 bg-black/60 z-[1600] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Disburse to Owner</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="space-y-3 text-sm">
                    <div className="bg-emerald-50 border border-emerald-100 rounded p-3 text-xs space-y-1">
                        <div><strong>Owner:</strong> {listing.ownerDetails?.name}</div>
                        <div><strong>Method:</strong> {listing.ownerPayout?.payoutMethod}</div>
                        {listing.ownerPayout?.payoutMethod === 'M-Pesa' && <div><strong>M-Pesa:</strong> {listing.ownerPayout?.mpesaNumber}</div>}
                        {listing.ownerPayout?.payoutMethod === 'Bank' && (
                            <div><strong>Bank:</strong> {listing.ownerPayout?.bankName} · {listing.ownerPayout?.bankAccountNumber} ({listing.ownerPayout?.bankAccountName})</div>
                        )}
                        <div className="pt-1 text-base"><strong>Amount:</strong> KES {payable.toLocaleString()}</div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Payment Reference</label>
                        <input value={ref} onChange={e => setRef(e.target.value)} placeholder="MPESA ref / Bank TXN" className="w-full p-2 border rounded" />
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-medium">Cancel</button>
                    <button onClick={() => ref.trim() ? onSave(ref.trim()) : alert('Enter a reference.')} className="px-4 py-2 bg-green-600 text-white rounded font-bold hover:bg-green-700">Confirm Disbursement</button>
                </div>
            </div>
        </div>
    );
};
