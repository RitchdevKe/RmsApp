
import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { CommunicationTemplate } from '../../types';
import Icon from '../Icon';

const TemplateEditor: React.FC<{ template: CommunicationTemplate; onClose: () => void; onSave: (val: string) => void }> = ({ template, onClose, onSave }) => {
    const [content, setContent] = useState(template.content);

    return (
        <div className="fixed inset-0 bg-black/60 z-[1300] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="font-bold text-gray-800">Edit Template: {template.name}</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="flex-grow p-0">
                    <textarea 
                        value={content} 
                        onChange={e => setContent(e.target.value)} 
                        className="w-full h-full p-6 outline-none font-mono text-sm resize-none"
                    />
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-between items-center rounded-b-xl">
                    <span className="text-xs text-gray-500">Available variables: {'{tenant_name}'}, {'{unit}'}, {'{rent_amount}'}, {'{start_date}'}</span>
                    <button onClick={() => { onSave(content); onClose(); }} className="px-6 py-2 bg-primary text-white font-bold rounded hover:bg-primary-dark">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

const LeaseTemplates: React.FC = () => {
    const { templates, updateTemplate } = useData();
    const [editingTemplate, setEditingTemplate] = useState<CommunicationTemplate | null>(null);

    // Mock filtering for "Lease" type templates if category existed, or just using existing templates for demo
    const leaseTemplates = templates; 

    const handleSave = (content: string) => {
        if (editingTemplate) {
            updateTemplate(editingTemplate.id, { content });
        }
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/general-operations/leases'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Lease Management
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Lease Templates</h1>
                <p className="text-lg text-gray-500 mt-1">Standardize your agreements with reusable, dynamic templates.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {leaseTemplates.map(tpl => (
                    <div key={tpl.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-all group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
                                <Icon name="stack" className="w-6 h-6" />
                            </div>
                            <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded uppercase">{tpl.type}</span>
                        </div>
                        <h3 className="font-bold text-lg text-gray-800 mb-2">{tpl.name}</h3>
                        <p className="text-sm text-gray-500 line-clamp-3 mb-4 font-mono bg-gray-50 p-2 rounded">{tpl.content}</p>
                        
                        <button 
                            onClick={() => setEditingTemplate(tpl)}
                            className="w-full py-2 border border-gray-300 rounded text-gray-700 font-bold hover:bg-gray-50 transition-colors"
                        >
                            Edit Template
                        </button>
                    </div>
                ))}
                
                {/* Add New Placeholder */}
                <button className="border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center p-8 text-gray-400 hover:text-primary hover:border-primary transition-colors min-h-[250px]">
                    <Icon name="plus" className="w-10 h-10 mb-2" />
                    <span className="font-bold">Create New Template</span>
                </button>
            </div>

            {editingTemplate && <TemplateEditor template={editingTemplate} onClose={() => setEditingTemplate(null)} onSave={handleSave} />}
        </div>
    );
};

export default LeaseTemplates;
