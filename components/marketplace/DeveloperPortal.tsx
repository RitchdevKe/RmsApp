
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useData } from '../../context/DataContext';
import { fmtDate } from '../../utils/date';
import Icon from '../Icon';
import { Vendor, FundiJob } from '../../types';

// --- Types ---
interface FundiProfile extends Vendor {
    isPro: boolean;
}

// --- Components ---
const StarRating: React.FC<{ rating: number }> = ({ rating }) => {
  return (
    <div className="flex text-yellow-500">
      {[...Array(5)].map((_, i) => (
        <span key={i}>
            {i < Math.round(rating) ? <Icon name="star" className="w-3 h-3 fill-current" /> : <Icon name="star" className="w-3 h-3 text-gray-300" />}
        </span>
      ))}
    </div>
  );
};

const ProBadge: React.FC = () => (
  <div className="flex items-center gap-1 text-[10px] bg-purple-900 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-sm">
    <Icon name="star" className="w-3 h-3 fill-current text-yellow-400" /> Pro Fundi
  </div>
);

const VerifiedBadge: React.FC = () => (
    <div className="flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
      <Icon name="shield-check" className="w-3 h-3" /> Verified
    </div>
);

const FundiCard: React.FC<{ fundi: FundiProfile; onEdit: () => void }> = ({ fundi, onEdit }) => {
    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-lg transition-all overflow-hidden flex flex-col group h-full">
            <div className="relative h-32 bg-gray-200 overflow-hidden">
                {fundi.avatarUrl ? (
                    <img src={fundi.avatarUrl} alt={fundi.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                     <div className="w-full h-full flex items-center justify-center bg-gray-100">
                         <Icon name="user-circle" className="w-12 h-12 text-gray-300" />
                     </div>
                )}
                <div className="absolute top-2 left-2">
                    {fundi.rating >= 5 && <ProBadge />}
                </div>
            </div>
            
            <div className="p-4 flex flex-col flex-grow">
                <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-gray-800 text-lg truncate">{fundi.name}</h3>
                    {fundi.verified && <VerifiedBadge />}
                </div>
                <p className="text-sm text-gray-500 mb-2 font-medium">{fundi.specialty}</p>

                <div className="flex items-center gap-1 mb-3 text-sm">
                    <StarRating rating={fundi.rating} /> 
                    <span className="text-gray-400 text-xs ml-1">({fundi.completedJobs} Jobs)</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                    <Icon name="map-pin" className="w-3 h-3" /> {fundi.location || 'Nairobi'}
                </div>

                {fundi.portfolioImages && fundi.portfolioImages.length > 0 && (
                    <div className="mb-4">
                        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Portfolio Preview</p>
                        <div className="flex gap-1 overflow-hidden">
                            {fundi.portfolioImages.slice(0, 3).map((img, i) => (
                                <img key={i} src={img} className="w-8 h-8 rounded object-cover border border-gray-200" alt="Work" />
                            ))}
                            {fundi.portfolioImages.length > 3 && (
                                <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-[9px] text-gray-500 font-bold">
                                    +{fundi.portfolioImages.length - 3}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div className="text-purple-900 font-bold text-sm">
                        KES {fundi.dailyRate?.toLocaleString() || '1,000'} <span className="text-xs font-normal text-gray-400">/day</span>
                    </div>
                    <button 
                        onClick={onEdit}
                        className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors"
                    >
                        Edit
                    </button>
                </div>
            </div>
        </div>
    );
};

const JobRequestCard: React.FC<{ job: FundiJob; onProcess: (status: 'Accepted' | 'Declined') => void }> = ({ job, onProcess }) => (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
        <div className="flex justify-between items-start mb-2">
             <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                 job.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                 job.status === 'Accepted' ? 'bg-green-100 text-green-800' :
                 job.status === 'Completed' ? 'bg-blue-100 text-blue-800' :
                 'bg-gray-100 text-gray-600'
             }`}>
                 {job.status}
             </span>
             <span className="text-xs text-gray-400 font-mono">{fmtDate(job.date)}</span>
        </div>
        <h4 className="font-bold text-gray-800 text-sm mb-1">{job.description}</h4>
        <div className="text-xs text-gray-500 mb-3 space-y-1">
             <p className="flex items-center"><Icon name="user-circle" className="w-3 h-3 mr-1"/> {job.clientName} ({job.clientPhone})</p>
             <p className="flex items-center"><Icon name="map-pin" className="w-3 h-3 mr-1"/> {job.location}</p>
             <p className="flex items-center"><Icon name="tools" className="w-3 h-3 mr-1"/> Assigned: <span className="font-bold ml-1">{job.fundiName}</span></p>
        </div>
        
        {job.status === 'Pending' && (
             <div className="flex gap-2 pt-2 border-t border-gray-50">
                 <button onClick={() => onProcess('Accepted')} className="flex-1 py-1.5 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700">Approve</button>
                 <button onClick={() => onProcess('Declined')} className="flex-1 py-1.5 bg-red-50 text-red-600 text-xs font-bold rounded hover:bg-red-100">Decline</button>
             </div>
        )}
    </div>
);

const EditFundiModal: React.FC<{ 
    fundi?: Partial<Vendor>; 
    onClose: () => void; 
    onSave: (f: Partial<Vendor>) => void 
}> = ({ fundi, onClose, onSave }) => {
    const [formData, setFormData] = useState<Partial<Vendor>>(fundi || {
        name: '', specialty: '', dailyRate: 1000, location: '', rating: 5, verified: false, completedJobs: 0, summary: '', eta: '1h',
        email: '', phone: '', avatarUrl: '', portfolioImages: []
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const portfolioInputRef = useRef<HTMLInputElement>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        // @ts-ignore
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) : value }));
    };

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, avatarUrl: reader.result as string }));
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handlePortfolioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

            Promise.all(promises).then(images => {
                setFormData(prev => ({ 
                    ...prev, 
                    portfolioImages: [...(prev.portfolioImages || []), ...images] 
                }));
            });
        }
    };

    const removePortfolioImage = (index: number) => {
        setFormData(prev => ({
            ...prev,
            portfolioImages: prev.portfolioImages?.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ ...formData, id: fundi?.id });
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1500] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">{fundi?.id ? 'Edit Profile' : 'Add New Fundi'}</h2>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Avatar Upload - Prominently at Top */}
                    <div className="flex justify-center mb-6 border-b pb-6">
                        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            <div className="w-32 h-32 rounded-full bg-gray-100 border-4 border-white shadow-lg flex items-center justify-center overflow-hidden hover:border-purple-500 transition-colors">
                                {formData.avatarUrl ? (
                                    <img src={formData.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center text-gray-400">
                                        <Icon name="user-circle" className="w-12 h-12 mb-1" />
                                        <span className="text-[10px] font-bold uppercase">Upload Photo</span>
                                    </div>
                                )}
                            </div>
                            <div className="absolute bottom-1 right-1 bg-purple-600 text-white p-2 rounded-full shadow-md hover:bg-purple-700 transition-colors">
                                <Icon name="plus" className="w-4 h-4" />
                            </div>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name *</label>
                             <input name="name" value={formData.name} onChange={handleChange} className="w-full p-2 border rounded" required />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                             <input name="email" type="email" value={formData.email} onChange={handleChange} className="w-full p-2 border rounded" placeholder="Optional" />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
                             <input name="phone" value={formData.phone} onChange={handleChange} className="w-full p-2 border rounded" placeholder="Required for contact" />
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Trade / Specialty</label>
                             <select name="specialty" value={formData.specialty} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                 <option>Plumber</option><option>Electrician</option><option>Mason</option><option>Carpenter</option><option>Painter</option><option>Handyman</option><option>Tiler</option>
                             </select>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Daily Rate (KES)</label>
                             <input name="dailyRate" type="number" value={formData.dailyRate} onChange={handleChange} className="w-full p-2 border rounded" />
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Location</label>
                             <input name="location" value={formData.location} onChange={handleChange} className="w-full p-2 border rounded" placeholder="e.g. Westlands" />
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Avg Arrival (ETA)</label>
                             <input name="eta" value={formData.eta} onChange={handleChange} className="w-full p-2 border rounded" placeholder="e.g. 45m" />
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Profile Summary</label>
                        <textarea name="summary" value={formData.summary} onChange={handleChange} className="w-full p-2 border rounded" rows={3} placeholder="Brief bio..." />
                    </div>

                    {/* Portfolio Upload */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Previous Works (Min 5 recommended)</label>
                        <div className="grid grid-cols-4 gap-2 mb-2">
                            {formData.portfolioImages?.map((img, idx) => (
                                <div key={idx} className="relative aspect-square border rounded overflow-hidden group">
                                    <img src={img} className="w-full h-full object-cover" />
                                    <button 
                                        type="button"
                                        onClick={() => removePortfolioImage(idx)}
                                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Icon name="close" className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                            <div 
                                onClick={() => portfolioInputRef.current?.click()}
                                className="aspect-square border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 hover:border-purple-400 transition-colors"
                            >
                                <Icon name="plus" className="w-6 h-6 text-gray-400" />
                                <span className="text-[10px] text-gray-400 mt-1 font-bold">Add Photo</span>
                            </div>
                        </div>
                        <input type="file" ref={portfolioInputRef} className="hidden" multiple accept="image/*" onChange={handlePortfolioUpload} />
                        <p className="text-[10px] text-gray-400">Upload clear images of completed projects.</p>
                    </div>

                    <div className="flex items-center gap-4 bg-gray-50 p-3 rounded border border-gray-100">
                        <label className="flex items-center text-sm font-medium text-gray-700 cursor-pointer w-full">
                            <input type="checkbox" checked={!!formData.verified} onChange={e => setFormData({...formData, verified: e.target.checked})} className="mr-3 h-5 w-5 rounded text-purple-600 focus:ring-purple-500 border-gray-300" />
                            <span>Mark as Verified Pro</span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-bold hover:bg-gray-200 transition-colors">Cancel</button>
                        <button type="submit" className="px-6 py-2 bg-purple-900 text-white rounded font-bold hover:bg-black shadow-md transition-colors">Save Profile</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

const MyFundiHub: React.FC = () => {
    const { vendors, addVendor, updateVendor, fundiJobs, updateFundiJob, syncFundiJobs } = useData();
    const [activeTab, setActiveTab] = useState<'Directory' | 'Web Jobs' | 'Settings'>('Directory');
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingFundi, setEditingFundi] = useState<Partial<Vendor> | undefined>(undefined);
    const [isSyncing, setIsSyncing] = useState(false);

    // Sync jobs on load
    useEffect(() => {
        handleSync();
    }, []);

    const handleSync = async () => {
        setIsSyncing(true);
        await syncFundiJobs();
        setIsSyncing(false);
    };

    const fundis = useMemo(() => {
        return vendors.map(v => ({
            ...v,
            isPro: v.rating >= 4.5 && (v.completedJobs || 0) > 50,
            // Ensure fields exist for legacy data
            dailyRate: v.dailyRate || 1000,
            completedJobs: v.completedJobs || 0,
            location: v.location || 'Nairobi',
            verified: v.verified || false
        })).filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.specialty.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [vendors, searchQuery]);

    const handleSaveFundi = (data: Partial<Vendor>) => {
        if (data.id) {
            updateVendor(data.id, data);
        } else {
            addVendor({ ...data, id: `v-${Date.now()}`, rating: 5, completedJobs: 0 } as Vendor);
        }
        setIsModalOpen(false);
    };

    const handleProcessJob = (jobId: string, status: 'Accepted' | 'Declined') => {
        updateFundiJob(jobId, { status });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 pb-4 border-b">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">MyFundi Hub</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage contractors, verify profiles, and track website job requests.</p>
                </div>
                <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                    {['Directory', 'Web Jobs', 'Settings'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${
                                activeTab === tab ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-purple-600">
                    <p className="text-xs font-bold text-gray-400 uppercase">Total Pros</p>
                    <p className="text-2xl font-extrabold text-gray-800 mt-1">{fundis.length}</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-600">
                    <p className="text-xs font-bold text-gray-400 uppercase">Jobs (Web)</p>
                    <p className="text-2xl font-extrabold text-gray-800 mt-1">{fundiJobs.length}</p>
                </div>
                 <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-600">
                    <p className="text-xs font-bold text-gray-400 uppercase">Pending Requests</p>
                    <p className="text-2xl font-extrabold text-gray-800 mt-1">{fundiJobs.filter(j => j.status === 'Pending').length}</p>
                </div>
            </div>

            {/* Content Area */}
            {activeTab === 'Directory' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                        <div className="relative w-64">
                            <input 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search Name or Trade..." 
                                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                            <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                        </div>
                        <button 
                            onClick={() => { setEditingFundi(undefined); setIsModalOpen(true); }}
                            className="bg-purple-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md hover:bg-black transition-colors flex items-center"
                        >
                            <Icon name="plus" className="w-4 h-4 mr-2" /> Add Fundi
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {fundis.map(fundi => (
                            <FundiCard 
                                key={fundi.id} 
                                fundi={fundi} 
                                onEdit={() => { setEditingFundi(fundi); setIsModalOpen(true); }} 
                            />
                        ))}
                         {fundis.length === 0 && (
                            <div className="col-span-full py-12 text-center text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                <Icon name="tools" className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p>No Fundis found.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'Web Jobs' && (
                <div className="space-y-6 animate-fade-in">
                     <div className="flex justify-between items-center">
                        <h3 className="font-bold text-gray-700">Incoming Requests</h3>
                        <button 
                            onClick={handleSync} 
                            disabled={isSyncing}
                            className="text-sm font-bold text-blue-600 hover:underline flex items-center"
                        >
                            <Icon name={isSyncing ? "time" : "website"} className={`w-4 h-4 mr-1 ${isSyncing ? 'animate-spin' : ''}`} /> 
                            {isSyncing ? 'Syncing...' : 'Refresh Feed'}
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {fundiJobs.length > 0 ? fundiJobs.map(job => (
                            <JobRequestCard 
                                key={job.id} 
                                job={job} 
                                onProcess={(status) => handleProcessJob(job.id, status)} 
                            />
                        )) : (
                             <div className="col-span-full py-12 text-center text-gray-400 bg-white rounded-xl border border-gray-100">
                                <Icon name="website" className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p>No job requests from website yet.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {activeTab === 'Settings' && (
                <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 max-w-2xl animate-fade-in">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">Portal Configuration</h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div>
                                <h4 className="font-bold text-sm text-gray-700">Connect Fee</h4>
                                <p className="text-xs text-gray-500">Amount users pay to view contact details.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-600">KES</span>
                                <input className="w-16 p-1 border rounded text-right font-bold" defaultValue="100" />
                            </div>
                        </div>
                         <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div>
                                <h4 className="font-bold text-sm text-gray-700">Auto-Approve Verified</h4>
                                <p className="text-xs text-gray-500">Automatically accept jobs for verified Pros.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" defaultChecked />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                            </label>
                        </div>
                        <button className="w-full py-2 bg-gray-900 text-white rounded-lg font-bold mt-4 hover:bg-black">Save Settings</button>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <EditFundiModal 
                    fundi={editingFundi} 
                    onClose={() => setIsModalOpen(false)} 
                    onSave={handleSaveFundi} 
                />
            )}
        </div>
    );
};

export default MyFundiHub;
