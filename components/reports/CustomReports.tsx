
import React, { useState } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { supabase } from '../../utils/supabaseClient';
import { fmtDate } from '../../utils/date';

const CustomReports: React.FC = () => {
    const [reportType, setReportType] = useState('Tenancy');
    const [generatedData, setGeneratedData] = useState<any[] | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const { tenants, tasks } = useData();
    
    const handleGenerate = () => {
        setIsGenerating(true);
        setGeneratedData(null);

        // Simulate network request / heavy calculation
        setTimeout(async () => {
            try {
                const count = 5;
                if (reportType === 'Tenancy') {
                    const rows = tenants.slice(0, count).map((t, i) => ({
                        id: t.id || i,
                        col1: t.name,
                        col2: t.unit,
                        col3: t.status,
                        col4: fmtDate(t.onboardingDate)
                    }));
                    setGeneratedData(rows);
                } else if (reportType === 'Financial') {
                    const { data: authData } = await supabase.auth.getUser();
                    const userId = authData?.user?.id;
                    if (!userId) {
                        setGeneratedData([]);
                    } else {
                        const { data, error } = await supabase
                            .from('payments')
                            .select('id, amount, status, created_at')
                            .eq('user_id', userId)
                            .order('created_at', { ascending: false })
                            .limit(count);
                        if (error) throw error;
                        const rows = (data || []).map((p: any) => ({
                            id: p.id,
                            col1: `Transaction ${String(p.id).slice(0, 8)}`,
                            col2: `KES ${Number(p.amount ?? 0).toLocaleString()}`,
                            col3: p.status,
                            col4: fmtDate(p.created_at)
                        }));
                        setGeneratedData(rows);
                    }
                } else if (reportType === 'Operational') {
                    const rows = tasks.slice(0, count).map((t, i) => ({
                        id: t.id || i,
                        col1: t.title,
                        col2: t.property,
                        col3: t.status,
                        col4: fmtDate(t.dueDate)
                    }));
                    setGeneratedData(rows);
                } else {
                    const rows = tasks
                        .filter(t => t.title.toLowerCase().includes('maintenance'))
                        .slice(0, count)
                        .map((t, i) => ({
                            id: t.id || i,
                            col1: t.title,
                            col2: t.property,
                            col3: t.status,
                            col4: fmtDate(t.dueDate)
                        }));
                    setGeneratedData(rows);
                }
            } catch (e) {
                console.warn('[CustomReports] Failed to generate report', e);
                setGeneratedData([]);
            } finally {
                setIsGenerating(false);
            }
        }, 1500);
    };

    const handleSaveTemplate = () => {
        alert("Report configuration saved as 'My New Template'.");
    };

    return (
        <div className="space-y-8 pb-10">
            <button onClick={() => window.location.hash = '#/reports-analytics/reports'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Reports Center
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Custom Reports</h1>
                <p className="text-lg text-gray-500 mt-1">Build and save your own reports with the data that matters most to you.</p>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-sm space-y-8 border border-gray-200">
                <div className="flex flex-col md:flex-row gap-8">
                    <div className="flex-1 space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">1. Select Data Source</label>
                            <select value={reportType} onChange={e => setReportType(e.target.value)} className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-primary/50 outline-none transition-shadow">
                                <option value="Tenancy">Tenancy & Leasing</option>
                                <option value="Financial">Financial Transactions</option>
                                <option value="Operational">Tasks & Operations</option>
                                <option value="Maintenance">Maintenance Log</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">2. Apply Filters</label>
                            <div className="grid grid-cols-2 gap-4">
                                <select className="p-3 border rounded-lg bg-gray-50 text-sm outline-none"><option>Branch: All</option><option>Kericho</option><option>Kisii</option></select>
                                <select className="p-3 border rounded-lg bg-gray-50 text-sm outline-none"><option>Date Range: All Time</option><option>Last 30 Days</option></select>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex-1">
                        <label className="block text-sm font-bold text-gray-700 mb-2">3. Columns to Include</label>
                        <div className="grid grid-cols-2 gap-2 p-4 border rounded-lg bg-gray-50 h-full max-h-60 overflow-y-auto">
                            {['Reference / ID', 'Description / Name', 'Status', 'Value / Date', 'Assigned Agent', 'Category', 'Notes', 'Priority', 'Payment Method', 'Due Date'].map((col, i) => (
                                <label key={i} className="flex items-center cursor-pointer hover:bg-gray-100 p-2 rounded transition-colors">
                                    <input type="checkbox" className="mr-3 h-4 w-4 text-primary rounded border-gray-300 focus:ring-primary" defaultChecked={i < 4} />
                                    <span className="text-sm text-gray-700">{col}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
                
                 <div className="pt-6 flex justify-end space-x-3 border-t">
                    <button onClick={handleSaveTemplate} className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition-colors">
                        Save as Template
                    </button>
                    <button 
                        onClick={handleGenerate} 
                        disabled={isGenerating}
                        className="px-8 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-md disabled:bg-primary/70 flex items-center transition-all"
                    >
                        {isGenerating ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Generating...
                            </>
                        ) : (
                            <>
                                <Icon name="analytics" className="w-4 h-4 mr-2" /> Generate Report
                            </>
                        )}
                    </button>
                </div>
            </div>

            {generatedData && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-fadeIn">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800">Results Preview: {reportType} Report</h3>
                        <button className="text-sm text-primary hover:underline font-bold flex items-center">
                            <Icon name="download" className="w-4 h-4 mr-1" /> Download CSV
                        </button>
                    </div>
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Name / Reference</th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Value / Unit</th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Status</th>
                                    <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {generatedData.map((row) => (
                                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 text-gray-800 font-medium">{row.col1}</td>
                                        <td className="px-4 py-3 text-gray-600">{row.col2}</td>
                                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-bold ${row.col3 === 'Active' || row.col3 === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{row.col3}</span></td>
                                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.col4}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.4s ease-out forwards;
                }
            `}</style>
        </div>
    );
};

export default CustomReports;
