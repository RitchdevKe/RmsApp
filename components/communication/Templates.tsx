
import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { CommunicationTemplate } from '../../types';
import Icon from '../Icon';

const CreateTemplateModal: React.FC<{ onClose: () => void; onSave: (t: Partial<CommunicationTemplate>) => void; }> = ({ onClose, onSave }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState<'SMS' | 'Email' | 'WhatsApp' | 'App'>('SMS');
    const [content, setContent] = useState('');

    const handleSubmit = () => {
        if (!name || !content) return alert("Name and Content required");
        onSave({ name, type, content });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                <h2 className="text-xl font-bold mb-4 text-gray-800">New Template</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                        <input value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border rounded-md" placeholder="e.g. Welcome Message" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
                        <select value={type} onChange={e => setType(e.target.value as any)} className="w-full p-2 border rounded-md bg-white">
                            <option>SMS</option>
                            <option>Email</option>
                            <option>WhatsApp</option>
                            <option>App</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                        <textarea value={content} onChange={e => setContent(e.target.value)} className="w-full p-2 border rounded-md h-32" placeholder="Hi {name}, ..." />
                        <p className="text-xs text-gray-500 mt-1">Use {'{name}'}, {'{unit}'} as placeholders.</p>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-md text-gray-700 hover:bg-gray-200">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark">Save Template</button>
                </div>
            </div>
        </div>
    );
};

const Templates: React.FC = () => {
    const { templates, addTemplate } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSave = (data: Partial<CommunicationTemplate>) => {
        addTemplate({ ...data, id: `temp-${Date.now()}` } as CommunicationTemplate);
        setIsModalOpen(false);
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/general-operations/communications'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Communications
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Templates</h1>
                    <p className="text-lg text-gray-500 mt-1">Standardize your messaging.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark shadow-sm flex items-center">
                    <Icon name="plus" className="w-4 h-4 mr-2" /> New Template
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map(t => (
                    <div key={t.id} className="bg-white p-5 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-gray-800">{t.name}</h3>
                            <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${t.type === 'App' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>{t.type}</span>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-3 bg-gray-50 p-2 rounded border border-gray-200 font-mono text-xs">{t.content}</p>
                    </div>
                ))}
                {templates.length === 0 && (
                    <div className="col-span-full text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500">
                        No templates found.
                    </div>
                )}
            </div>
            {isModalOpen && <CreateTemplateModal onClose={() => setIsModalOpen(false)} onSave={handleSave} />}
        </div>
    );
};

export default Templates;
