
import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { ScheduledReport } from '../../types';

const NewScheduleModal: React.FC<{ onClose: () => void; onSave: (r: ScheduledReport) => void }> = ({ onClose, onSave }) => {
    const [name, setName] = useState('');
    const [frequency, setFrequency] = useState<'Daily' | 'Weekly' | 'Monthly'>('Weekly');

    const handleSubmit = () => {
        if (!name) return alert("Report name required");
        onSave({ id: `rep-${Date.now()}`, name, frequency });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500] p-4">
            <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full">
                <h3 className="text-xl font-bold mb-4">New Schedule</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Report Name</label>
                        <input value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border rounded" placeholder="e.g. Monthly Revenue" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Frequency</label>
                        <select value={frequency} onChange={e => setFrequency(e.target.value as any)} className="w-full p-2 border rounded bg-white">
                            <option>Daily</option>
                            <option>Weekly</option>
                            <option>Monthly</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-bold">Cancel</button>
                        <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded font-bold">Save</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ScheduledReports: React.FC = () => {
    const { scheduledReports, addScheduledReport, deleteScheduledReport } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSave = (report: ScheduledReport) => {
        addScheduledReport(report);
        setIsModalOpen(false);
    };

    const handleDelete = (id: string) => {
        if (confirm("Delete this schedule?")) {
            deleteScheduledReport(id);
        }
    };

    return (
        <div className="space-y-8 pb-10">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Scheduled Reports</h1>
                    <p className="text-lg text-gray-500 mt-1">Automated insights delivered to your inbox.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="px-6 py-2 bg-primary text-white font-bold rounded-lg shadow-sm hover:bg-primary-dark flex items-center transition-transform hover:-translate-y-1">
                    <Icon name="plus" className="w-4 h-4 mr-2" /> New Schedule
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-gray-50 uppercase text-gray-500 text-xs font-bold">
                        <tr>
                            <th className="px-4 py-3">Report Name</th>
                            <th className="px-4 py-3">Frequency</th>
                            <th className="px-4 py-3">Recipients</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {scheduledReports.map(r => (
                            <tr key={r.id} className="hover:bg-gray-50">
                                <td className="px-4 py-4 font-bold text-gray-800">{r.name}</td>
                                <td className="px-4 py-4 text-gray-600">{r.frequency}</td>
                                <td className="px-4 py-4 text-gray-600">3 Recipients</td>
                                <td className="px-4 py-4 text-center">
                                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Active</span>
                                </td>
                                <td className="px-4 py-4 text-right">
                                    <button onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors">
                                        <Icon name="close" className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {scheduledReports.length === 0 && (
                            <tr><td colSpan={5} className="p-8 text-center text-gray-400">No scheduled reports.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isModalOpen && <NewScheduleModal onClose={() => setIsModalOpen(false)} onSave={handleSave} />}
        </div>
    );
};

export default ScheduledReports;
