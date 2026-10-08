
import React, { useState, useEffect } from 'react';
import { useData } from '../../../context/DataContext';
import { CommunicationTemplate } from '@/types';
import Icon from '../../Icon';

const SYSTEM_TEMPLATE_IDS = ['sms-rent-25th', 'sms-rent-1st', 'sms-rent-5th', 'sms-rent-7th'];

const DEFAULT_RENT_TEMPLATES: CommunicationTemplate[] = [
    {
        id: 'sms-rent-25th',
        name: 'Rent Upcoming (25th)',
        type: 'SMS',
        enabled: true,
        content: 'Dear {name}, this is a friendly reminder that your rent of KES {amount} for {unit} is due by the 30th. Please ensure timely payment to avoid late penalties. Thank you. - TaskMe Realty',
    },
    {
        id: 'sms-rent-1st',
        name: 'Rent Due Today (1st)',
        type: 'SMS',
        enabled: true,
        content: 'Dear {name}, your rent of KES {amount} for {unit} is due today. Kindly pay on time to avoid late fee charges. M-Pesa Paybill: {paybill}, Account: {account}. Thank you. - TaskMe Realty',
    },
    {
        id: 'sms-rent-5th',
        name: 'Last Day to Pay (5th)',
        type: 'SMS',
        enabled: true,
        content: 'Dear {name}, today is the LAST DAY to pay your rent of KES {amount} for {unit} without penalty. Late fees will begin accruing from tomorrow (6th). Pay now via M-Pesa Paybill: {paybill}, Account: {account}. - TaskMe Realty',
    },
    {
        id: 'sms-rent-7th',
        name: 'Arrears & Fines Notice (7th)',
        type: 'SMS',
        enabled: true,
        content: 'Dear {name}, your rent for {unit} is now in ARREARS. Outstanding: Rent KES {rent_balance} + Fines KES {fines}. Total due: KES {total_due}. Please settle immediately to avoid further action. - TaskMe Realty',
    },
];

const SCHEDULE_INFO: Record<string, string> = {
    'sms-rent-25th': 'Sent: 25th of month at 4:00 PM',
    'sms-rent-1st':  'Sent: 1st of month at 9:00 AM',
    'sms-rent-5th':  'Sent: 5th of month',
    'sms-rent-7th':  'Sent: 7th of month',
};

const EditTemplateModal: React.FC<{ template: CommunicationTemplate; onClose: () => void; onSave: (content: string) => void }> = ({ template, onClose, onSave }) => {
    const [content, setContent] = useState(template.content);
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Edit — {template.name}</h2>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                </div>
                {SCHEDULE_INFO[template.id] && (
                    <p className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded mb-4 inline-block">
                        🕐 {SCHEDULE_INFO[template.id]} · Unpaid tenants only
                    </p>
                )}
                <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    className="w-full p-3 border rounded-lg h-36 font-mono text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">Base Placeholders: {'{name}'}, {'{unit}'}, {'{amount}'}, {'{rent_balance}'}, {'{fines}'}, {'{total_due}'}, {'{paybill}'}, {'{account}'}</p>
                <div className="bg-indigo-50 border border-indigo-100 p-2.5 rounded-lg mt-3 text-[11px] leading-relaxed text-indigo-900">
                    <span className="font-bold block uppercase tracking-wide text-[9px] text-indigo-750 mb-1">⚡ Partial RMS Smart Split Placeholders</span>
                    <ul className="list-disc list-inside space-y-0.5 font-mono text-[10px]">
                        <li><strong>{'{landlord_paybill}'}</strong>: Dynamic Landlord mpesa number</li>
                        <li><strong>{'{landlord_amount}'}</strong>: Exact rent portion due to direct owner</li>
                        <li><strong>{'{agency_amount}'}</strong>: Exact fee/deposit portion due to agency</li>
                        <li><strong>{'{deposit_holder}'}</strong>: Holds status of deposit (Landlord vs Agency)</li>
                        <li><strong>{'{landlord_name}'}</strong>: Registered direct landlord name</li>
                    </ul>
                </div>
                <div className="mt-5 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200 font-medium">Cancel</button>
                    <button onClick={() => { onSave(content); onClose(); }} className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark font-bold shadow-sm">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

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
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">New Template</h2>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                </div>
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
                        <p className="text-xs text-gray-500 mt-1">Use {'{name}'}, {'{unit}'}, {'{landlord_paybill}'}, {'{landlord_amount}'}, {'{agency_amount}'}, {'{deposit_holder}'} as placeholders.</p>
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
    const { templates, addTemplate, updateTemplate, deleteTemplate } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<CommunicationTemplate | null>(null);

    useEffect(() => {
        DEFAULT_RENT_TEMPLATES.forEach(def => {
            if (!templates.some(t => t.id === def.id)) {
                addTemplate(def);
            }
        });
    }, []);

    const handleSave = (data: Partial<CommunicationTemplate>) => {
        addTemplate({ ...data, id: `temp-${Date.now()}` } as CommunicationTemplate);
        setIsModalOpen(false);
    };

    const systemTemplates = templates.filter(t => SYSTEM_TEMPLATE_IDS.includes(t.id));
    const customTemplates = templates.filter(t => !SYSTEM_TEMPLATE_IDS.includes(t.id));

    const toggleChannel = (t: CommunicationTemplate) => {
        const next = t.type === 'App' ? 'SMS' : 'App';
        updateTemplate(t.id, { type: next });
    };

    const renderCard = (t: CommunicationTemplate, isSystem = false) => {
        const isEnabled = t.enabled !== false;
        return (
        <div key={t.id} className={`bg-white p-5 rounded-xl shadow-sm border hover:shadow-md transition-all ${isSystem ? 'border-blue-100' : 'border-gray-100'} ${!isEnabled ? 'opacity-60' : ''}`}>
            <div className="flex justify-between items-start mb-2 gap-2">
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-800 truncate">{t.name}</h3>
                    {isSystem && SCHEDULE_INFO[t.id] && (
                        <p className="text-xs text-blue-500 font-semibold mt-0.5">{SCHEDULE_INFO[t.id]}</p>
                    )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {isSystem && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">SYSTEM</span>}
                    <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${t.type === 'App' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`}>{t.type === 'App' ? 'In-App' : t.type}</span>
                </div>
            </div>
            <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-200 font-mono line-clamp-3 mb-3">{t.content}</p>

            {isSystem && (
                <>
                    <div className="mb-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Delivery Channel</p>
                        <div className="flex bg-gray-100 rounded-lg p-0.5">
                            <button
                                onClick={() => updateTemplate(t.id, { type: 'SMS' })}
                                className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${t.type === 'SMS' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Bulk SMS
                            </button>
                            <button
                                onClick={() => updateTemplate(t.id, { type: 'App' })}
                                className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${t.type === 'App' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                In-App
                            </button>
                        </div>
                    </div>

                    <div className="mb-3 flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <div>
                            <p className="text-xs font-bold text-gray-700">Reminder {isEnabled ? 'Enabled' : 'Disabled'}</p>
                            <p className="text-[10px] text-gray-500">{isEnabled ? 'Will send on schedule' : 'Skipped — nothing queued'}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => updateTemplate(t.id, { enabled: !isEnabled })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                            aria-label={isEnabled ? 'Disable reminder' : 'Enable reminder'}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                </>
            )}

            <div className="flex gap-2">
                <button
                    onClick={() => setEditingTemplate(t)}
                    className="flex-1 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center justify-center gap-1"
                >
                    <Icon name="settings" className="w-3 h-3" /> Edit
                </button>
                {!isSystem && (
                    <button
                        onClick={() => { if (window.confirm('Delete this template?')) deleteTemplate(t.id); }}
                        className="py-1.5 px-3 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                    >
                        <Icon name="close" className="w-3 h-3" />
                    </button>
                )}
            </div>
        </div>
        );
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/partial-rms/operations/communications'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Communications
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Templates</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage automated rent reminders and custom messages.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark shadow-sm flex items-center">
                    <Icon name="plus" className="w-4 h-4 mr-2" /> New Template
                </button>
            </div>

            {/* Rent Schedule System Templates */}
            <div>
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Icon name="time" className="w-4 h-4" /> Automated Rent Reminder Schedule
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {systemTemplates.length > 0
                        ? systemTemplates.map(t => renderCard(t, true))
                        : DEFAULT_RENT_TEMPLATES.map(t => renderCard(t, true))
                    }
                </div>
            </div>

            {/* Custom Templates */}
            {customTemplates.length > 0 && (
                <div>
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Custom Templates</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {customTemplates.map(t => renderCard(t, false))}
                    </div>
                </div>
            )}

            {isModalOpen && <CreateTemplateModal onClose={() => setIsModalOpen(false)} onSave={handleSave} />}
            {editingTemplate && (
                <EditTemplateModal
                    template={editingTemplate}
                    onClose={() => setEditingTemplate(null)}
                    onSave={(content) => updateTemplate(editingTemplate.id, { content })}
                />
            )}
        </div>
    );
};

export default Templates;
