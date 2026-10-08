
import React, { useState } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { MarketingBannerTemplate } from '../../types';

const MarketingBanners: React.FC = () => {
    const { marketingBanners, setMarketingBanners } = useData();
    
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [newTemplate, setNewTemplate] = useState<Partial<MarketingBannerTemplate>>({ title: '', type: 'Rent', description: '', imageUrl: '' });

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewTemplate(prev => ({ ...prev, imageUrl: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        if (!newTemplate.title || !newTemplate.imageUrl) return alert("Title and Image required.");
        const row: MarketingBannerTemplate = { ...newTemplate, id: `tpl-${Date.now()}` } as MarketingBannerTemplate;
        setMarketingBanners(prev => [...prev, row]);
        setIsUploadOpen(false);
        setNewTemplate({ title: '', type: 'Rent', description: '', imageUrl: '' });
    };

    const handleDelete = (id: string) => {
        if (confirm("Delete this template?")) {
            setMarketingBanners(prev => prev.filter(t => t.id !== id));
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Marketing Banners</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage templates available for download in user portals. Banners persist to your workspace.</p>
                </div>
                <button 
                    onClick={() => setIsUploadOpen(true)}
                    className="bg-primary text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-primary-dark flex items-center"
                >
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Upload Template
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {marketingBanners.length === 0 && (
                    <div className="col-span-full py-16 text-center text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                        <p className="font-medium text-gray-700">No banner templates yet.</p>
                        <p className="text-sm mt-1">Upload images to add real marketing creatives.</p>
                    </div>
                )}
                {marketingBanners.map(tpl => (
                    <div key={tpl.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden group">
                        <div className="h-48 relative">
                            <img src={tpl.imageUrl} alt={tpl.title} className="w-full h-full object-cover" />
                            <div className="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded text-xs font-bold shadow-sm">
                                {tpl.type}
                            </div>
                            <button 
                                onClick={() => handleDelete(tpl.id)}
                                className="absolute top-2 left-2 bg-red-600 text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Icon name="close" className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-4">
                            <h3 className="font-bold text-gray-800">{tpl.title}</h3>
                            <p className="text-sm text-gray-500 mt-1">{tpl.description}</p>
                        </div>
                    </div>
                ))}
            </div>

            {isUploadOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold mb-4">Upload New Template</h3>
                        <div className="space-y-4">
                            <input 
                                className="w-full p-2 border rounded" 
                                placeholder="Template Title" 
                                value={newTemplate.title} 
                                onChange={e => setNewTemplate({...newTemplate, title: e.target.value})}
                            />
                            <select 
                                className="w-full p-2 border rounded bg-white"
                                value={newTemplate.type} 
                                onChange={e => setNewTemplate({...newTemplate, type: e.target.value as MarketingBannerTemplate['type']})}
                            >
                                <option value="Rent">For Rent</option>
                                <option value="Sale">For Sale</option>
                                <option value="Investment">Investment</option>
                                <option value="General">General</option>
                            </select>
                            <textarea 
                                className="w-full p-2 border rounded" 
                                placeholder="Description" 
                                rows={2}
                                value={newTemplate.description} 
                                onChange={e => setNewTemplate({...newTemplate, description: e.target.value})}
                            />
                            <div className="border-2 border-dashed border-gray-300 rounded p-4 text-center cursor-pointer hover:bg-gray-50 relative">
                                <span className="text-sm text-gray-500">{newTemplate.imageUrl ? 'Image Selected' : 'Click to Upload Image'}</span>
                                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
                            </div>
                            {newTemplate.imageUrl && <img src={newTemplate.imageUrl} className="h-20 w-full object-cover rounded" />}
                            
                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setIsUploadOpen(false)} className="px-4 py-2 bg-gray-100 rounded text-gray-700">Cancel</button>
                                <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded font-bold">Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MarketingBanners;
