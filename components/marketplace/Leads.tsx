import React, { useMemo, useState, useEffect, useRef } from 'react';
import { fmtDate } from '../../utils/date';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { Lead, Property } from '../../types';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';
import { computeLandlordReferralAccrual, REFERRER_SHARE } from '../../utils/landlordReferralCommission';


ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const ChartContainer: React.FC<{ type: 'bar' | 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-48' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<any>(null);

    useEffect(() => {
        if (!canvasRef.current || !(window as any).Chart) return;
        if (chartRef.current) chartRef.current.destroy();

        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            chartRef.current = new (window as any).Chart(ctx, {
                type,
                data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    ...options
                },
            });
        }
        return () => chartRef.current?.destroy();
    }, [type, data, options]);

    return <div className={`relative ${height}`}><canvas ref={canvasRef}></canvas></div>;
};

const STAGES = ['New', 'Contacted', 'Viewing', 'Negotiation', 'Closed', 'Lost'];

const LeadCard: React.FC<{ lead: Lead; onMove: (id: string, stage: string) => void; onDelete: (id: string) => void; referrerName?: string }> = ({ lead, onMove, onDelete, referrerName }) => {
    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData("leadId", lead.id);
    };

    return (
        <div 
            draggable 
            onDragStart={handleDragStart}
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-all cursor-move group relative animate-fade-in"
        >
            <div className="flex justify-between items-start mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    lead.source === 'Referral' ? 'bg-purple-100 text-purple-700' :
                    lead.source === 'Website' ? 'bg-blue-100 text-blue-700' :
                    lead.source === 'Social Media' ? 'bg-pink-100 text-pink-700' :
                    'bg-gray-100 text-gray-700'
                }`}>
                    {lead.source || 'Walk-in'}
                </span>
                <span className="text-xs text-gray-400">{lead.date}</span>
            </div>
            
            <h4 className="font-bold text-gray-800 text-sm">{lead.tenantName}</h4>
            {referrerName && (
                <p className="text-[10px] text-purple-600 font-bold mb-0.5">via {referrerName}</p>
            )}
            <p className="text-xs text-gray-500 mb-1 font-medium">{lead.interest}</p>
            {lead.email && <p className="text-[10px] text-gray-400 truncate">{lead.email}</p>}
            
            <div className="flex items-center gap-2 mt-3">
                <a href={`tel:${lead.contact}`} className="p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors" title="Call">
                    <Icon name="communication" className="w-3 h-3" />
                </a>
                <a href={`mailto:${lead.email}`} className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors" title="Email">
                    <Icon name="mail" className="w-3 h-3" />
                </a>
                 <div className="ml-auto flex gap-1">
                     <button 
                        onClick={() => onDelete(lead.id)}
                        className="p-1.5 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete"
                     >
                        <Icon name="trash" className="w-3 h-3" />
                     </button>
                 </div>
            </div>

            {/* Quick Move Actions (Backup for non-drag) */}
            <div className="border-t pt-2 mt-2 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[9px] text-gray-400">Move:</span>
                <div className="flex gap-1">
                    {STAGES.filter(s => s !== lead.status).slice(0, 3).map(s => (
                        <button 
                            key={s} 
                            onClick={(e) => { e.stopPropagation(); onMove(lead.id, s); }}
                            className="w-4 h-4 rounded bg-gray-100 hover:bg-primary hover:text-white text-[8px] flex items-center justify-center font-bold"
                            title={`Move to ${s}`}
                        >
                            {s[0]}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

type LeadKind = 'Tenant' | 'Landlord' | 'Investor' | 'Security' | 'Cleaning' | 'Maintenance';

const SERVICE_SUBTYPES: Record<'Security' | 'Cleaning' | 'Maintenance', string[]> = {
    Security: ['Home Guards', 'Office Guards', 'Bodyguards', 'Bouncers', 'VIP Security'],
    Cleaning: [
        'House Cleaning', 
        'Office Cleaning', 
        'Government Office Cleaning', 
        'Post-construction Cleaning',
        'Property Cleaning',
        'Business/Mall cleaning',
        'After events cleaning'
    ],
    Maintenance: ['Residential Maintenance', 'Commercial Maintenance', 'Renovation', 'Interior Design'],
};

const LEAD_KINDS: { key: LeadKind; label: string; icon: string; color: string; blurb: string }[] = [
    { key: 'Tenant',      label: 'Tenant',      icon: 'tenants',    color: 'bg-blue-50 text-blue-700 border-blue-200',       blurb: 'Prospective tenant for a vacant unit' },
    { key: 'Landlord',    label: 'Landlord',    icon: 'landlords',  color: 'bg-amber-50 text-amber-700 border-amber-200',    blurb: 'Property owner wanting management' },
    { key: 'Investor',    label: 'Investor',    icon: 'reits',      color: 'bg-purple-50 text-purple-700 border-purple-200', blurb: 'Renovation-fund investor' },
    { key: 'Security',    label: 'Security',    icon: 'security',   color: 'bg-slate-50 text-slate-700 border-slate-200',    blurb: 'TaskMe Security gig referral' },
    { key: 'Maintenance', label: 'Maintenance', icon: 'maintenance',color: 'bg-orange-50 text-orange-700 border-orange-200', blurb: 'TaskMe Interiors — maintenance / renovation' },
    { key: 'Cleaning',    label: 'Cleaning',    icon: 'settings',   color: 'bg-teal-50 text-teal-700 border-teal-200',       blurb: 'TaskMe Cleaning gig referral' },
];

interface AddLeadModalProps {
    onClose: () => void;
    onSave: (lead: Lead, extras: { kind: LeadKind; landlordApp?: any; investor?: any; properties?: any[] }) => void;
    referrerOptions: Array<{ id: string; name: string; role: string }>;
    properties: Property[];
}

const AddLeadModal: React.FC<AddLeadModalProps> = ({ onClose, onSave, referrerOptions, properties }) => {
    const [kind, setKind] = useState<LeadKind>('Tenant');
    const [formData, setFormData] = useState<Partial<Lead>>({
        tenantName: '', contact: '', email: '', interest: '', status: 'New', source: 'Walk-in', notes: ''
    });
    const [selectedPropertyId, setSelectedPropertyId] = useState('');
    const [selectedUnitId, setSelectedUnitId] = useState('');
    const [selectedReferrerGroup, setSelectedReferrerGroup] = useState('');
    // Type-specific fields
    const [location, setLocation] = useState('');
    const [proposedProps, setProposedProps] = useState('');
    const [idNumber, setIdNumber] = useState('');
    const [investorType, setInvestorType] = useState<'Individual' | 'Institution'>('Individual');
    const [estValue, setEstValue] = useState('');
    const [subtype, setSubtype] = useState<string>('');
    const [expectedMonthly, setExpectedMonthly] = useState('');
    const [totalUnits, setTotalUnits] = useState('');

    const [landlordProperties, setLandlordProperties] = useState<Array<{ name: string; location: string; expectedMonthly: string; totalUnits: string }>>([
        { name: '', location: '', expectedMonthly: '', totalUnits: '' }
    ]);

    // Reset subtype whenever kind switches to a service kind
    React.useEffect(() => {
        if (kind === 'Security' || kind === 'Cleaning' || kind === 'Maintenance') {
            setSubtype(SERVICE_SUBTYPES[kind][0]);
        } else {
            setSubtype('');
        }
    }, [kind]);

    const REFERRER_GROUPS = [
        { label: 'Tenants',      match: (r: { role: string }) => r.role === 'Tenant' },
        { label: 'Landlords',    match: (r: { role: string }) => r.role === 'Landlord' },
        { label: 'Affiliates',   match: (r: { role: string }) => r.role === 'Affiliate' },
        { label: 'Field Agents', match: (r: { role: string }) => r.role === 'Field Agent' },
        { label: 'Caretakers',   match: (r: { role: string }) => r.role === 'Caretaker' },
        { label: 'Contractors',  match: (r: { role: string }) => r.role === 'Contractor' },
        { label: 'System Users', match: (r: { role: string }) => !['Tenant','Landlord','Affiliate','Field Agent','Caretaker','Contractor'].includes(r.role) },
    ];
    const activeGroups = REFERRER_GROUPS.filter(g => referrerOptions.some(r => g.match(r)));
    const groupMembers = selectedReferrerGroup
        ? referrerOptions.filter(r => {
            const g = REFERRER_GROUPS.find(x => x.label === selectedReferrerGroup);
            return g ? g.match(r) : false;
        })
        : [];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.tenantName || !formData.contact) return alert('Name and Contact are required.');

        const id = `lead-${kind.toLowerCase()}-${Date.now()}`;
        const today = getTodayIsoDate();
        let listingTitle = formData.interest || 'General Inquiry';
        let serviceType: Lead['serviceType'] | undefined;
        let extras: { kind: LeadKind; landlordApp?: any; investor?: any; properties?: any[] } = { kind };

        if (kind === 'Landlord') {
            const propsList = landlordProperties.filter(p => p.name.trim() !== '');
            if (propsList.length === 0) {
                return alert('Please enter at least one property name for the landlord.');
            }
            const landlordAppId = `la-${Date.now()}`;
            listingTitle = `Landlord — ${propsList.map(p => p.name.trim()).join(', ')}`;
            
            extras.landlordApp = {
                id: landlordAppId,
                name: formData.tenantName,
                email: formData.email || '',
                phone: formData.contact,
                status: 'Pending',
                date: new Date().toISOString(),
                proposedProperties: propsList.map(p => p.name.trim()),
                notes: [
                    formData.notes || 'Added from Marketplace > Leads',
                    ...propsList.map(p => 
                        `Property: ${p.name.trim()} (${p.location.trim() || 'No Location'}) · Expected Monthly: KES ${Number(p.expectedMonthly || 0).toLocaleString()} · Units: ${p.totalUnits || 0}`
                    )
                ].filter(Boolean).join(' | '),
                location: propsList[0]?.location?.trim() || '',
            };

            extras.properties = propsList.map((p, idx) => ({
                id: `prop-${Date.now()}-${idx}`,
                name: p.name.trim(),
                type: 'Residential',
                ownership: 'In-house',
                branch: 'Kericho Branch',
                status: 'Suspended',
                landlordId: landlordAppId,
                location: p.location.trim() || undefined,
                units: Array.from({ length: Number(p.totalUnits) || 0 }).map((_, uIdx) => ({
                    id: `unit-prop-${Date.now()}-${idx}-${uIdx}`,
                    unitNumber: String(uIdx + 1),
                    status: 'Vacant',
                    rent: 0,
                })),
                defaultMonthlyRent: 0,
            }));
        } else if (kind === 'Investor') {
            listingTitle = `Investor — ${investorType}${estValue ? ' · KES ' + Number(estValue).toLocaleString() : ''}`;
            extras.investor = {
                id: `inv-${Date.now()}`,
                name: formData.tenantName,
                email: formData.email || '',
                phone: formData.contact,
                idNumber: idNumber || '',
                status: 'Pending',
                joinDate: new Date().toISOString(),
                investorType,
                notes: formData.notes || 'Added from Marketplace > Leads',
            };
        } else if (kind === 'Security' || kind === 'Cleaning' || kind === 'Maintenance') {
            serviceType = kind;
            const locationSuffix = kind === 'Maintenance' && (proposedProps || location)
                ? ` — ${[proposedProps, location].filter(Boolean).join(', ')}`
                : '';
            listingTitle = `${kind} — ${subtype || 'Service Gig'}${locationSuffix}`;
        }

        const lead: Lead = {
            id,
            tenantName: formData.tenantName!,
            contact: formData.contact,
            email: formData.email,
            interest: kind === 'Tenant' ? (formData.interest || 'General Inquiry') : listingTitle,
            status: 'New',
            source: formData.source || 'Walk-in',
            notes: formData.notes,
            referrerId: formData.referrerId,
            date: today,
            assignedAgent: kind === 'Tenant' ? 'Unassigned' : `${kind === 'Landlord' || kind === 'Investor' ? kind + ' Desk' : 'Services Desk'}`,
            listingTitle,
            leadType: kind,
            serviceType,
            serviceSubtype: subtype || undefined,
            estimatedValue: estValue ? Number(estValue) : undefined,
            commissionPercent: (kind === 'Security' || kind === 'Cleaning' || kind === 'Maintenance') ? 10 : undefined,
            linkedApplicationId: extras.landlordApp?.id || extras.investor?.id,
            propertyName: proposedProps || undefined,
            location: location || undefined,
            expectedMonthlyCollection: expectedMonthly ? Number(expectedMonthly) : undefined,
            totalUnits: totalUnits ? Number(totalUnits) : undefined,
        };
        onSave(lead, extras);
    };

    const isService = kind === 'Security' || kind === 'Cleaning' || kind === 'Maintenance';

    return (
        <div className="fixed inset-0 bg-black/60 z-[1500] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Add Lead</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>

                {/* Lead type selector */}
                <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Lead Type</label>
                    <div className="grid grid-cols-3 gap-2">
                        {LEAD_KINDS.map(k => (
                            <button
                                key={k.key}
                                type="button"
                                onClick={() => setKind(k.key)}
                                className={`p-2 rounded-lg border-2 text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                                    kind === k.key ? `${k.color} border-current` : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                                title={k.blurb}
                            >
                                <Icon name={k.icon} className="w-4 h-4" />
                                {k.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">{LEAD_KINDS.find(k => k.key === kind)?.blurb}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <input className="w-full p-2 border rounded" placeholder={kind === 'Landlord' ? 'Landlord Name' : kind === 'Investor' ? 'Investor Name' : isService ? 'Client / Contact Name' : 'Prospect Name'} value={formData.tenantName} onChange={e => setFormData({...formData, tenantName: e.target.value})} required />
                    <input className="w-full p-2 border rounded" placeholder="Phone Number" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} required />
                    <input className="w-full p-2 border rounded" placeholder="Email (Optional)" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />

                    {kind === 'Tenant' && (
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase">Interest — Vacant Unit</label>
                            <select
                                className="w-full p-2 border rounded bg-white"
                                value={selectedPropertyId}
                                onChange={e => {
                                    setSelectedPropertyId(e.target.value);
                                    setSelectedUnitId('');
                                    setFormData(f => ({ ...f, interest: '' }));
                                }}
                            >
                                <option value="">-- Select Property --</option>
                                {properties
                                    .filter(p => p.units.some(u => u.status === 'Vacant'))
                                    .map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                                }
                            </select>
                            {selectedPropertyId && (() => {
                                const prop = properties.find(p => p.id === selectedPropertyId);
                                const vacantUnits = prop?.units.filter(u => u.status === 'Vacant') || [];
                                return (
                                    <select
                                        className="w-full p-2 border rounded bg-white"
                                        value={selectedUnitId}
                                        onChange={e => {
                                            const uid = e.target.value;
                                            setSelectedUnitId(uid);
                                            const unit = vacantUnits.find(u => u.id === uid);
                                            if (unit && prop) {
                                                setFormData(f => ({ ...f, interest: `Unit ${unit.unitNumber}${unit.unitType ? ' (' + unit.unitType + ')' : ''} — ${prop.name}` }));
                                            } else {
                                                setFormData(f => ({ ...f, interest: '' }));
                                            }
                                        }}
                                    >
                                        <option value="">-- Select Unit --</option>
                                        {vacantUnits.map(u => (
                                            <option key={u.id} value={u.id}>
                                                {u.unitNumber}{u.unitType ? ` — ${u.unitType}` : ''}{u.rent ? ` · KES ${u.rent.toLocaleString()}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                );
                            })()}
                            <input
                                className="w-full p-2 border rounded text-sm text-gray-600"
                                placeholder="Or type custom interest..."
                                value={formData.interest || ''}
                                onChange={e => {
                                    setSelectedUnitId('');
                                    setFormData(f => ({ ...f, interest: e.target.value }));
                                }}
                            />
                        </div>
                    )}

                    {kind === 'Landlord' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Registered Properties</label>
                                <button
                                    type="button"
                                    onClick={() => setLandlordProperties(prev => [...prev, { name: '', location: '', expectedMonthly: '', totalUnits: '' }])}
                                    className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
                                >
                                    <Icon name="plus" className="w-3 h-3 text-primary" /> Add another property
                                </button>
                            </div>
                            {landlordProperties.map((prop, idx) => (
                                <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200 relative space-y-2">
                                    {landlordProperties.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => setLandlordProperties(prev => prev.filter((_, i) => i !== idx))}
                                            className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                                            title="Remove Property"
                                        >
                                            <Icon name="trash" className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <p className="text-xs font-bold text-gray-400">Property #{idx + 1}</p>
                                    <input
                                        className="w-full p-2 border rounded bg-white text-sm"
                                        placeholder="Property / Estate Name"
                                        value={prop.name}
                                        onChange={e => setLandlordProperties(prev => prev.map((p, i) => i === idx ? { ...p, name: e.target.value } : p))}
                                        required
                                    />
                                    <input
                                        className="w-full p-2 border rounded bg-white text-sm"
                                        placeholder="Location / Area (e.g. Kilimani)"
                                        value={prop.location}
                                        onChange={e => setLandlordProperties(prev => prev.map((p, i) => i === idx ? { ...p, location: e.target.value } : p))}
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="number"
                                            min={0}
                                            className="w-full p-2 border rounded bg-white text-sm"
                                            placeholder="Expected Avg Monthly (KES)"
                                            value={prop.expectedMonthly}
                                            onChange={e => setLandlordProperties(prev => prev.map((p, i) => i === idx ? { ...p, expectedMonthly: e.target.value } : p))}
                                        />
                                        <input
                                            type="number"
                                            min={0}
                                            className="w-full p-2 border rounded bg-white text-sm"
                                            placeholder="Total Units"
                                            value={prop.totalUnits}
                                            onChange={e => setLandlordProperties(prev => prev.map((p, i) => i === idx ? { ...p, totalUnits: e.target.value } : p))}
                                        />
                                    </div>
                                </div>
                            ))}
                            <p className="text-[11px] text-gray-500">Will create a Landlord Application (Pending) and draft Properties under Registration &gt; Properties.</p>
                        </div>
                    )}

                    {kind === 'Investor' && (
                        <>
                            <input className="w-full p-2 border rounded" placeholder="ID / KRA Number (optional)" value={idNumber} onChange={e => setIdNumber(e.target.value)} />
                            <select className="w-full p-2 border rounded bg-white" value={investorType} onChange={e => setInvestorType(e.target.value as any)}>
                                <option value="Individual">Individual</option>
                                <option value="Institution">Institution</option>
                            </select>
                            <input type="number" className="w-full p-2 border rounded" placeholder="Est. Investment Amount (KES)" value={estValue} onChange={e => setEstValue(e.target.value)} />
                            <p className="text-[11px] text-gray-500">Will also register a Pending Renovation-Fund Investor.</p>
                        </>
                    )}

                    {isService && (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Service</label>
                                <select className="w-full p-2 border rounded bg-white" value={subtype} onChange={e => setSubtype(e.target.value)}>
                                    {SERVICE_SUBTYPES[kind].map(s => (<option key={s} value={s}>{s}</option>))}
                                </select>
                            </div>
                            {kind === 'Maintenance' && (
                                <div className="grid grid-cols-1 gap-2">
                                    <input className="w-full p-2 border rounded" placeholder="Property / Site Name" value={proposedProps} onChange={e => setProposedProps(e.target.value)} />
                                    <input className="w-full p-2 border rounded" placeholder="Location / Area" value={location} onChange={e => setLocation(e.target.value)} />
                                </div>
                            )}
                            <input type="number" className="w-full p-2 border rounded" placeholder={kind === 'Maintenance' ? 'Estimated Cost (KES, optional)' : 'Est. Gig Value (KES, optional)'} value={estValue} onChange={e => setEstValue(e.target.value)} />
                            <p className="text-[11px] text-gray-500">10% commission accrues to the referrer when the gig is paid.</p>
                        </>
                    )}


                    <select className="w-full p-2 border rounded bg-white" value={formData.source} onChange={e => {
                        const src = e.target.value as any;
                        setFormData({...formData, source: src, referrerId: src !== 'Referral' ? undefined : formData.referrerId});
                        if (src !== 'Referral') { setSelectedReferrerGroup(''); }
                    }}>
                        <option>Walk-in</option>
                        <option>Referral</option>
                        <option>Social Media</option>
                        <option>Website</option>
                    </select>
                    {formData.source === 'Referral' && (
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase">Referrer</label>
                            <select
                                className="w-full p-2 border rounded bg-white"
                                value={selectedReferrerGroup}
                                onChange={e => {
                                    setSelectedReferrerGroup(e.target.value);
                                    setFormData(f => ({ ...f, referrerId: undefined }));
                                }}
                            >
                                <option value="">-- Select Group --</option>
                                {activeGroups.map(g => (
                                    <option key={g.label} value={g.label}>{g.label}</option>
                                ))}
                            </select>
                            {selectedReferrerGroup && (
                                <select
                                    className="w-full p-2 border rounded bg-white"
                                    value={formData.referrerId || ''}
                                    onChange={e => setFormData(f => ({ ...f, referrerId: e.target.value || undefined }))}
                                >
                                    <option value="">-- Select {selectedReferrerGroup.slice(0, -1)} --</option>
                                    {groupMembers.map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}
                    <textarea className="w-full p-2 border rounded" rows={3} placeholder="Notes..." value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-medium">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-primary text-white rounded font-bold hover:bg-primary-dark">Save Lead</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const PayCommissionModal: React.FC<{
    referrerName: string;
    referredName: string;
    defaultAmount: number;
    onClose: () => void;
    onPay: (amount: number, reference: string, date: string) => void;
}> = ({ referrerName, referredName, defaultAmount, onClose, onPay }) => {
    const [amount, setAmount] = useState(String(defaultAmount || ''));
    const [reference, setReference] = useState('');
    const [date, setDate] = useState(getTodayIsoDate());
    return (
        <div className="fixed inset-0 bg-black/60 z-[1600] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Pay Commission</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="space-y-4">
                    <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-sm">
                        <p className="text-gray-600">Referrer: <span className="font-bold text-gray-800">{referrerName}</span></p>
                        <p className="text-gray-600">Referred: <span className="font-bold text-gray-800">{referredName}</span></p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount (KES)</label>
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded" min={0} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Payment Date</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Reference / Note</label>
                        <input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. MPESA REF or Bank TXN" className="w-full p-2 border rounded" />
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-medium">Cancel</button>
                    <button
                        onClick={() => {
                            const parsedAmt = parseFloat(amount) || 0;
                            if (!parsedAmt || parsedAmt <= 0) return alert('Enter a valid amount.');
                            if (!reference.trim()) return alert('Enter a payment reference.');
                            onPay(parsedAmt, reference.trim(), date);
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded font-bold hover:bg-green-700"
                    >
                        Confirm Payment
                    </button>
                </div>
            </div>
        </div>
    );
};

const Leads: React.FC = () => {
    const { leads, addLead, updateLead, deleteLead, syncWebsiteLeads, staff, landlords, tenants, renovationInvestors, commissionRules, rfTransactions, addRFTransaction, addBill, checkPermission, currentUser, properties, addLandlordApplication, addRenovationInvestor, investments, addProperty } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate = isSuperAdmin || checkPermission('Marketplace', 'create');
    const canEdit = isSuperAdmin || checkPermission('Marketplace', 'edit');
    const canDelete = isSuperAdmin || checkPermission('Marketplace', 'delete');
    const referrerOptions = useMemo(() => [
        ...(staff || []).map(s => ({ id: s.id, name: s.name, role: s.role, referralConfig: s.referralConfig })),
        ...(landlords || []).filter(l => l.role === 'Affiliate' || l.role === 'Landlord').map(l => ({ id: l.id, name: l.name, role: l.role, referralConfig: l.referralConfig })),
        ...(tenants || []).map(t => ({ id: t.id, name: t.name, role: 'Tenant', referralConfig: t.referralConfig })),
        ...(renovationInvestors || []).map(i => ({ id: i.id, name: i.name, role: 'Investor', referralConfig: (i as any).referralConfig })),
    ], [staff, landlords, tenants, renovationInvestors]);

    const [activeTab, setActiveTab] = useState<'pipeline' | 'tenants' | 'investors' | 'landlords'>('pipeline');
    const [payModalData, setPayModalData] = useState<null | { referrerName: string; referredName: string; defaultAmount: number }>(null);
    const [expandedLandlord, setExpandedLandlord] = useState<string | null>(null);


    // Show referred tenants once they're approved (any status other than
    // PendingApproval). Approval = lead has converted into a real tenancy,
    // which is the moment commission becomes owed.
    const tenantReferrals = useMemo(() => (tenants || []).filter(t => !!t.referrerId && t.status !== 'PendingApproval'), [tenants]);
    const investorReferrals = useMemo(() => (renovationInvestors || []).filter(i => !!i.referrerId), [renovationInvestors]);
    const landlordReferrals = useMemo(() => (landlords || []).filter(l => !!l.referrerId), [landlords]);

    // Default tenant-referral commission per business rule: KES 200 per approved referral.
    const TENANT_REFERRAL_DEFAULT_KES = 200;

    const getCommissionOwed = (
        referralConfig: { rateType: '%' | 'KES'; rateValue: number } | undefined,
        baseAmount: number,
        kind: 'tenant' | 'investor' | 'landlord' = 'tenant'
    ): number => {
        if (referralConfig && referralConfig.rateValue > 0) {
            return referralConfig.rateType === 'KES' ? referralConfig.rateValue : Math.round((referralConfig.rateValue / 100) * baseAmount);
        }
        // Prefer a rule tagged for this kind (e.g. "tenant referral"), fall back
        // to a generic referral rule.
        const rules = commissionRules || [];
        let triggerName = '';
        if (kind === 'tenant') triggerName = 'Tenancy Referral';
        else if (kind === 'landlord') triggerName = 'Property Management Referral';
        else if (kind === 'investor') triggerName = 'Investor Referral';

        let rule = rules.find((r: any) => r.trigger === triggerName);
        if (!rule) {
            rule = rules.find((r: any) => {
                const blob = `${r.description || ''} ${r.name || ''} ${r.category || ''} ${r.type || ''}`.toLowerCase();
                return blob.includes('referral') && blob.includes(kind);
            }) || rules.find((r: any) => {
                const blob = `${r.description || ''} ${r.name || ''} ${r.category || ''} ${r.type || ''}`.toLowerCase();
                return blob.includes('referral');
            });
        }
        if (rule) {
            if (rule.rateType === '%') return Math.round((rule.rateValue / 100) * baseAmount);
            return rule.rateValue || 0;
        }
        if (kind === 'tenant') return TENANT_REFERRAL_DEFAULT_KES;
        // Other referral types have no default until a rule is set.
        return 0;
    };

    const getCommissionPaid = (referredName: string, referrerName: string): number =>
        (rfTransactions || []).filter(tx =>
            tx.type === 'Referral Commission' &&
            tx.partyName === referrerName &&
            String(tx.description || '').toLowerCase().includes(referredName.toLowerCase())
        ).reduce((s, tx) => s + tx.amount, 0);

    const handlePayCommission = (amount: number, reference: string, date: string) => {
        if (!payModalData) return;
        addRFTransaction({
            id: `rftx-comm-${Date.now()}`,
            date,
            type: 'Referral Commission',
            category: 'Outbound',
            amount,
            partyName: payModalData.referrerName,
            reference,
            description: `Referral Commission — ${payModalData.referredName}`,
            status: 'Completed',
        } as any);
        addBill({
            id: `bill-comm-${Date.now()}`,
            vendor: payModalData.referrerName,
            category: 'Referral Commission',
            amount,
            invoiceDate: date,
            dueDate: date,
            status: 'Paid',
            description: `Referral Commission — ${payModalData.referredName}`,
            propertyId: '',
        } as any);
        alert(`Commission of KES ${amount.toLocaleString()} paid to ${payModalData.referrerName}.`);
        setPayModalData(null);
    };

    const [isSyncing, setIsSyncing] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

    // --- ANALYTICS ---
    const stats = useMemo(() => {
        const total = leads.length;
        const newLeads = leads.filter(l => l.status === 'New').length;
        const active = leads.filter(l => ['Contacted', 'Viewing', 'Negotiation'].includes(l.status)).length;
        const closed = leads.filter(l => l.status === 'Closed').length;
        const lost = leads.filter(l => l.status === 'Lost').length;
        
        const conversionRate = total > 0 ? Math.round((closed / total) * 100) : 0;
        
        // Source Data
        const sourceCounts: Record<string, number> = {};
        leads.forEach(l => {
            const src = l.source || 'Unknown';
            sourceCounts[src] = (sourceCounts[src] || 0) + 1;
        });

        return { total, newLeads, active, closed, lost, conversionRate, sourceCounts };
    }, [leads]);

    const sourceChartData = {
        labels: Object.keys(stats.sourceCounts),
        datasets: [{
            data: Object.values(stats.sourceCounts),
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'],
            borderWidth: 0
        }]
    };

    const statusChartData = {
        labels: ['New', 'Active', 'Closed', 'Lost'],
        datasets: [{
            label: 'Leads',
            data: [stats.newLeads, stats.active, stats.closed, stats.lost],
            backgroundColor: ['#3b82f6', '#f59e0b', '#10b981', '#ef4444'],
            borderRadius: 4
        }]
    };

    const handleSync = async () => {
        setIsSyncing(true);
        await syncWebsiteLeads();
        setIsSyncing(false);
    };

    const handleSaveLead = (lead: Lead, extras?: { kind: string; landlordApp?: any; investor?: any; properties?: any[] }) => {
        if (!canCreate) return alert('You do not have permission to add leads.');
        addLead(lead);
        if (extras?.landlordApp) {
            try { addLandlordApplication(extras.landlordApp); } catch (e) { console.warn('[leads] landlord app failed', e); }
        }
        if (extras?.investor) {
            try { addRenovationInvestor(extras.investor); } catch (e) { console.warn('[leads] investor failed', e); }
        }
        if (extras?.properties && Array.isArray(extras.properties)) {
            extras.properties.forEach(p => {
                try { addProperty(p); } catch (e) { console.warn('[leads] addProperty failed', e); }
            });
        }
        const kindLabel = extras?.kind && extras.kind !== 'Tenant' ? ` (${extras.kind})` : '';
        const landlordAppAndPropsMsg = extras?.properties && extras.properties.length > 0 
            ? ` — Landlord Application created & ${extras.properties.length} draft property(s) added to Registration > Properties.` 
            : '';
        alert(`Lead saved${kindLabel}${extras?.landlordApp ? landlordAppAndPropsMsg : extras?.investor ? ' — Investor registered as Pending.' : ''}`);
        setIsModalOpen(false);
    };

    const handleMoveLead = (id: string, stage: string) => {
        if (!canEdit) return alert('You do not have permission to update leads.');
        updateLead(id, { status: stage as any });
    };

    const handleDrop = (e: React.DragEvent, stage: string) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData("leadId");
        if (leadId) {
            handleMoveLead(leadId, stage);
        }
        setDragOverColumn(null);
    };

    const handleDragOver = (e: React.DragEvent, stage: string) => {
        e.preventDefault();
        setDragOverColumn(stage);
    };

    return (
        <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
            <div className="flex justify-between items-center flex-shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Sales Pipeline</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage inquiries from website, walk-ins, and referrals.</p>
                </div>
                <div className="flex gap-3">
                     <button 
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-50 shadow-sm flex items-center transition-all"
                    >
                        <Icon name={isSyncing ? "time" : "website"} className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : 'text-blue-500'}`} />
                        {isSyncing ? 'Syncing...' : 'Fetch Website Leads'}
                    </button>
                    <button 
                        onClick={() => setIsModalOpen(true)}
                        className="bg-primary text-white px-4 py-2 rounded-lg font-bold hover:bg-primary-dark shadow-sm flex items-center"
                    >
                        <Icon name="plus" className="w-4 h-4 mr-2" /> Add Lead
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl flex-shrink-0">
                {([  
                    { key: 'pipeline', label: 'Sales Pipeline', count: leads.length },
                    { key: 'tenants', label: 'Tenant Referrals', count: tenantReferrals.length },
                    { key: 'investors', label: 'Investor Referrals', count: investorReferrals.length },
                    { key: 'landlords', label: 'Landlord Referrals', count: landlordReferrals.length },
                ] as const).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key as any)}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
                            activeTab === tab.key ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {tab.label}
                        {tab.count > 0 && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === tab.key ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600'}`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {activeTab === 'pipeline' && (<>
            {/* Overview Dashboard */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex-shrink-0">
                 <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
                     <div className="bg-white p-4 rounded-lg shadow-sm border border-blue-100 flex items-center justify-between">
                         <div>
                             <p className="text-xs font-bold text-gray-400 uppercase">Total Leads</p>
                             <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
                         </div>
                         <div className="p-2 bg-blue-50 text-blue-600 rounded-full"><Icon name="tenants" className="w-5 h-5"/></div>
                     </div>
                     <div className="bg-white p-4 rounded-lg shadow-sm border border-green-100 flex items-center justify-between">
                         <div>
                             <p className="text-xs font-bold text-gray-400 uppercase">Converted</p>
                             <p className="text-2xl font-bold text-green-600">{stats.closed}</p>
                         </div>
                         <div className="p-2 bg-green-50 text-green-600 rounded-full"><Icon name="check" className="w-5 h-5"/></div>
                     </div>
                     <div className="bg-white p-4 rounded-lg shadow-sm border border-orange-100 flex items-center justify-between">
                         <div>
                             <p className="text-xs font-bold text-gray-400 uppercase">Conversion Rate</p>
                             <p className="text-2xl font-bold text-orange-600">{stats.conversionRate}%</p>
                         </div>
                         <div className="p-2 bg-orange-50 text-orange-600 rounded-full"><Icon name="analytics" className="w-5 h-5"/></div>
                     </div>
                     <div className="bg-white p-4 rounded-lg shadow-sm border border-red-100 flex items-center justify-between">
                         <div>
                             <p className="text-xs font-bold text-gray-400 uppercase">Lost Opportunities</p>
                             <p className="text-2xl font-bold text-red-600">{stats.lost}</p>
                         </div>
                         <div className="p-2 bg-red-50 text-red-600 rounded-full"><Icon name="close" className="w-5 h-5"/></div>
                     </div>
                 </div>
                 
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                     <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col justify-center">
                         <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Lead Sources</h4>
                         <div className="h-32 flex justify-center">
                             <ChartContainer type="doughnut" data={sourceChartData} options={{ cutout: '70%', plugins: { legend: { position: 'right', labels: { boxWidth: 10 } } } }} height="h-32" />
                         </div>
                     </div>
                     <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col justify-center">
                         <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Pipeline Status</h4>
                         <div className="h-32">
                             <ChartContainer type="bar" data={statusChartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false } } } }} height="h-32" />
                         </div>
                     </div>
                 </div>
            </div>
            
            <div className="flex-grow overflow-x-auto pb-4">
                <div className="flex gap-4 h-full min-w-[1400px]">
                    {STAGES.map(stage => {
                        const stageLeads = leads.filter(l => l.status === stage);
                        const isDragOver = dragOverColumn === stage;

                        return (
                            <div 
                                key={stage} 
                                onDragOver={(e) => handleDragOver(e, stage)}
                                onDrop={(e) => handleDrop(e, stage)}
                                onDragLeave={() => setDragOverColumn(null)}
                                className={`flex-1 rounded-xl border flex flex-col transition-colors duration-200 ${
                                    isDragOver ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' : 'bg-gray-50 border-gray-200'
                                }`}
                            >
                                <div className={`p-4 border-b border-gray-200 flex justify-between items-center rounded-t-xl bg-white sticky top-0 z-10 shadow-sm`}>
                                    <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">{stage}</h3>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold text-white shadow-sm ${
                                        stage === 'New' ? 'bg-blue-500' : 
                                        stage === 'Closed' ? 'bg-green-500' : 
                                        stage === 'Lost' ? 'bg-gray-400' :
                                        'bg-gray-400'
                                    }`}>
                                        {stageLeads.length}
                                    </span>
                                </div>
                                <div className="p-3 space-y-3 overflow-y-auto flex-grow custom-scrollbar">
                                    {stageLeads.map(lead => {
                                        const ref = lead.referrerId ? referrerOptions.find(r => r.id === lead.referrerId) : undefined;
                                        return (
                                        <LeadCard 
                                            key={lead.id} 
                                            lead={lead} 
                                            onMove={handleMoveLead} 
                                            onDelete={canDelete ? deleteLead : () => alert('You do not have permission to delete leads.')}
                                            referrerName={ref?.name}
                                        />
                                        );
                                    })}
                                    {stageLeads.length === 0 && (
                                        <div className="h-24 flex items-center justify-center text-gray-300 text-xs italic border-2 border-dashed border-gray-200 rounded-lg">
                                            Drop items here
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            </>)}

            {activeTab === 'tenants' && (
                <div className="flex-grow overflow-auto">
                    {tenantReferrals.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                            <p className="font-bold">No referred tenants on record.</p>
                            <p className="text-sm mt-1">Tenants referred via invite link or manual registration appear here.</p>
                        </div>
                    ) : (
                        <table className="min-w-full text-sm text-left bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                            <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-4 py-3">Name</th>
                                    <th className="px-4 py-3">Referred By</th>
                                    <th className="px-4 py-3">Unit</th>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Rent</th>
                                    <th className="px-4 py-3 text-right">Commission Owed</th>
                                    <th className="px-4 py-3 text-right">Commission Paid</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {tenantReferrals.map(t => {
                                    const referrer = referrerOptions.find(r => r.id === t.referrerId);
                                    const owed = getCommissionOwed(referrer?.referralConfig || t.referralConfig, Number(t.rentAmount || 0), 'tenant');
                                    const paid = getCommissionPaid(t.name, referrer?.name || '');
                                    const outstanding = Math.max(0, owed - paid);
                                    return (
                                        <tr key={t.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium text-gray-800">{t.name}</td>
                                            <td className="px-4 py-3 text-purple-700 font-medium">{referrer?.name || <span className="text-gray-400 italic text-xs">Unknown</span>}</td>
                                            <td className="px-4 py-3 text-gray-600 font-medium">{t.unit || '—'}{t.propertyName ? ` (${t.propertyName})` : ''}</td>
                                            <td className="px-4 py-3 text-gray-500">{fmtDate(t.onboardingDate)}</td>
                                            <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${t.status === 'Active' ? 'bg-green-100 text-green-700' : t.status === 'Overdue' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{t.status}</span></td>
                                            <td className="px-4 py-3 text-right">KES {Number(t.rentAmount || 0).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-bold text-orange-600">KES {owed.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-bold text-green-600">KES {paid.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right">
                                                {outstanding > 0 && referrer ? (
                                                    <button onClick={() => setPayModalData({ referrerName: referrer.name, referredName: t.name, defaultAmount: outstanding })} className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700">Pay Commission</button>
                                                ) : <span className="text-xs text-green-700 font-bold">Settled</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {activeTab === 'investors' && (
                <div className="flex-grow overflow-auto">
                    {investorReferrals.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                            <p className="font-bold">No referred investors on record.</p>
                            <p className="text-sm mt-1">Investors referred via invite link or manual registration appear here.</p>
                        </div>
                    ) : (
                        <table className="min-w-full text-sm text-left bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                            <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-4 py-3">Name</th>
                                    <th className="px-4 py-3">Referred By</th>
                                    <th className="px-4 py-3">Join Date</th>
                                    <th className="px-4 py-3 text-right">Commission Owed</th>
                                    <th className="px-4 py-3 text-right">Commission Paid</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {investorReferrals.map(inv => {
                                    const referrer = referrerOptions.find(r => r.id === inv.referrerId);
                                    const investorInvestments = (investments || []).filter(ins => ins.investorId === inv.id);
                                    const totalInvested = investorInvestments.reduce((sum, ins) => sum + (ins.amount || 0), 0);
                                    const baseAmount = totalInvested || 100000;
                                    const owed = getCommissionOwed(referrer?.referralConfig || inv.referralConfig, baseAmount, 'investor');
                                    const paid = getCommissionPaid(inv.name, referrer?.name || '');
                                    const outstanding = Math.max(0, owed - paid);
                                    return (
                                        <tr key={inv.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium text-gray-800">{inv.name}</td>
                                            <td className="px-4 py-3 text-purple-700 font-medium">{referrer?.name || <span className="text-gray-400 italic text-xs">Unknown</span>}</td>
                                            <td className="px-4 py-3 text-gray-500">{fmtDate(inv.joinDate)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-orange-600">KES {owed.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-bold text-green-600">KES {paid.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right">
                                                {outstanding > 0 && referrer ? (
                                                    <button onClick={() => setPayModalData({ referrerName: referrer.name, referredName: inv.name, defaultAmount: outstanding })} className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700">Pay Commission</button>
                                                ) : <span className="text-xs text-green-700 font-bold">Settled</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {activeTab === 'landlords' && (
                <div className="flex-grow overflow-auto">
                    {landlordReferrals.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                            <p className="font-bold">No referred landlords on record.</p>
                            <p className="text-sm mt-1">Landlords referred via invite link or manual registration appear here.</p>
                        </div>
                    ) : (
                        <table className="min-w-full text-sm text-left bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                            <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-3 py-3">Name</th>
                                    <th className="px-3 py-3">Referred By</th>
                                    <th className="px-3 py-3">Contract</th>
                                    <th className="px-3 py-3 text-right">Months Accrued</th>
                                    <th className="px-3 py-3 text-right">Collection MTD</th>
                                    <th className="px-3 py-3 text-right">Agency Fee MTD</th>
                                    <th className="px-3 py-3 text-right">This Month</th>
                                    <th className="px-3 py-3 text-right">Total Accrued</th>
                                    <th className="px-3 py-3 text-right">Paid</th>
                                    <th className="px-3 py-3 text-right">Action</th>
                                </tr>

                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {landlordReferrals.map(l => {
                                    const referrer = referrerOptions.find(r => r.id === l.referrerId);
                                    const accrual = computeLandlordReferralAccrual({
                                        landlord: l,
                                        properties: properties || [],
                                        tenants: tenants || [],
                                        currentPeriod: getCurrentMonthIso().slice(0, 7),
                                    });
                                    const paid = getCommissionPaid(l.name, referrer?.name || '');
                                    const outstanding = Math.max(0, accrual.totalCommission - paid);
                                    const expanded = expandedLandlord === l.id;
                                    return (
                                        <React.Fragment key={l.id}>
                                        <tr className="hover:bg-gray-50">
                                            <td className="px-3 py-3 font-medium text-gray-800">
                                                <button onClick={() => setExpandedLandlord(expanded ? null : l.id)} className="text-left hover:text-primary">
                                                    <span className="mr-1 text-gray-400">{expanded ? '▾' : '▸'}</span>{l.name}
                                                </button>
                                            </td>
                                            <td className="px-3 py-3 text-purple-700 font-medium">{referrer?.name || <span className="text-gray-400 italic text-xs">Unknown</span>}</td>
                                            <td className="px-3 py-3 text-xs text-gray-600">
                                                {accrual.contractPeriodMonths ? `${accrual.contractPeriodMonths} mo` : 'Ongoing'}
                                                <span className="block text-[10px] text-gray-400">
                                                    {accrual.contractStart} → {accrual.contractEndPeriod || 'open'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-right text-xs text-gray-700">
                                                {accrual.monthsAccrued}
                                                {accrual.contractPeriodMonths ? ` / ${accrual.contractPeriodMonths}` : ''}
                                                {accrual.isExpired && <span className="block text-[10px] text-red-500 font-bold">Contract ended</span>}
                                            </td>
                                            <td className="px-3 py-3 text-right text-gray-700">KES {Math.round(accrual.collectionMTD).toLocaleString()}</td>
                                            <td className="px-3 py-3 text-right text-blue-700 font-medium">KES {Math.round(accrual.agencyFeeMTD).toLocaleString()}</td>
                                            <td className="px-3 py-3 text-right font-semibold text-gray-800">KES {accrual.currentMonthCommission.toLocaleString()}</td>
                                            <td className="px-3 py-3 text-right font-bold text-orange-600">KES {accrual.totalCommission.toLocaleString()}</td>
                                            <td className="px-3 py-3 text-right font-bold text-green-600">KES {paid.toLocaleString()}</td>
                                            <td className="px-3 py-3 text-right">
                                                {outstanding > 0 && referrer ? (
                                                    <button onClick={() => setPayModalData({ referrerName: referrer.name, referredName: l.name, defaultAmount: outstanding })} className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700">Pay KES {outstanding.toLocaleString()}</button>
                                                ) : <span className="text-xs text-green-700 font-bold">Settled</span>}
                                            </td>
                                        </tr>
                                        {expanded && (
                                            <tr className="bg-gray-50/70">
                                                <td colSpan={10} className="px-6 py-3">
                                                    <p className="text-[11px] font-bold text-gray-500 uppercase mb-2">Monthly accrual ({REFERRER_SHARE * 100}% of agency fee, recurring for the contract duration)</p>
                                                    <table className="min-w-full text-xs">
                                                        <thead className="text-gray-400 uppercase">
                                                            <tr>
                                                                <th className="py-1 text-left">Month</th>
                                                                <th className="py-1 text-right">Collected</th>
                                                                <th className="py-1 text-right">Agency Fee</th>
                                                                <th className="py-1 text-right">Commission</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {accrual.months.map(m => (
                                                                <tr key={m.period} className="border-t border-gray-200">
                                                                    <td className="py-1 font-medium text-gray-700">{m.period}</td>
                                                                    <td className="py-1 text-right text-gray-600">KES {Math.round(m.collected).toLocaleString()}</td>
                                                                    <td className="py-1 text-right text-blue-700">KES {Math.round(m.agencyFee).toLocaleString()}</td>
                                                                    <td className="py-1 text-right font-bold text-orange-600">KES {m.commission.toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </td>
                                            </tr>
                                        )}
                                        </React.Fragment>
                                    );
                                })}

                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {isModalOpen && <AddLeadModal onClose={() => setIsModalOpen(false)} onSave={handleSaveLead} referrerOptions={referrerOptions} properties={properties} />}
            {payModalData && (
                <PayCommissionModal
                    referrerName={payModalData.referrerName}
                    referredName={payModalData.referredName}
                    defaultAmount={payModalData.defaultAmount}
                    onClose={() => setPayModalData(null)}
                    onPay={handlePayCommission}
                />
            )}
        </div>
    );
};

export default Leads;
