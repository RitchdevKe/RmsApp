// @ts-nocheck

import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';

// --- Extended Types for Rich Audit ---
interface DetailedLog {
    id: string;
    user: string;
    role: string;
    action: string;
    module: 'Finance' | 'Tenants' | 'Security' | 'Operations' | 'Settings' | 'Leasing';
    details: string;
    timestamp: string;
    ip: string;
    device: string;
    severity: 'Normal' | 'Warning' | 'Critical';
    status: 'Success' | 'Failed';
    metadata?: any;
}

function moduleFromAction(action: string): DetailedLog['module'] {
    const a = action.toLowerCase();
    if (a.includes('login') || a.includes('password') || a.includes('auth')) return 'Security';
    if (a.includes('invoice') || a.includes('payment') || a.includes('payout') || a.includes('bill')) return 'Finance';
    if (a.includes('lease')) return 'Leasing';
    if (a.includes('tenant')) return 'Tenants';
    if (a.includes('setting') || a.includes('config')) return 'Settings';
    return 'Operations';
}

function formatTs(iso: string): string {
    const s = String(iso || '');
    if (!s) return '—';
    return s.includes('T') ? s.replace('T', ' ').slice(0, 19) : s.slice(0, 19);
}

const SeverityBadge: React.FC<{ severity: DetailedLog['severity'] }> = ({ severity }) => {
    const styles = {
        'Critical': 'bg-red-100 text-red-700 border-red-200',
        'Warning': 'bg-yellow-100 text-yellow-800 border-yellow-200',
        'Normal': 'bg-blue-50 text-blue-700 border-blue-200'
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${styles[severity]}`}>
            {severity}
        </span>
    );
};

const StatusBadge: React.FC<{ status: DetailedLog['status'] }> = ({ status }) => {
    return (
        <span className={`flex items-center text-xs font-semibold ${status === 'Success' ? 'text-green-600' : 'text-red-600'}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${status === 'Success' ? 'bg-green-600' : 'bg-red-600'}`}></span>
            {status}
        </span>
    );
};

const LogDetailModal: React.FC<{ log: DetailedLog; onClose: () => void }> = ({ log, onClose }) => (
    <div className="fixed inset-0 bg-black/50 z-[1600] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${log.severity === 'Critical' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                        <Icon name="shield" className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Event Details</h3>
                        <p className="text-xs text-gray-500 font-mono">ID: {log.id}</p>
                    </div>
                </div>
                <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
            </div>
            
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Timestamp</p>
                        <p className="font-mono text-sm">{log.timestamp}</p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Module</p>
                        <p className="font-semibold text-sm">{log.module}</p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Actor</p>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">{log.user}</span>
                            <span className="text-xs bg-gray-100 px-1.5 rounded">{log.role}</span>
                        </div>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Status</p>
                        <StatusBadge status={log.status} />
                    </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Action Description</p>
                    <p className="text-gray-800 font-medium">{log.action}</p>
                    <p className="text-sm text-gray-600 mt-1">{log.details}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <p className="text-gray-500">IP Address</p>
                        <p className="font-mono">{log.ip}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">Device / User Agent</p>
                        <p className="font-mono truncate" title={log.device}>{log.device}</p>
                    </div>
                </div>

                {log.metadata && (
                    <div className="bg-gray-900 p-4 rounded-lg text-green-400 font-mono text-xs overflow-x-auto">
                        <p className="text-gray-500 mb-2">// Change Payload</p>
                        {JSON.stringify(log.metadata, null, 2)}
                    </div>
                )}
            </div>
            
            <div className="p-4 bg-gray-50 border-t text-right">
                <button className="text-xs font-bold text-red-600 hover:underline">Report as Suspicious</button>
            </div>
        </div>
    </div>
);

const OperationsAuditTrail: React.FC = () => {
    const { auditLogs } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [severityFilter, setSeverityFilter] = useState('All');
    const [selectedLog, setSelectedLog] = useState<DetailedLog | null>(null);

    const allLogs = useMemo((): DetailedLog[] => {
        return auditLogs.map((e) => ({
            id: e.id,
            user: e.user,
            role: '—',
            action: e.action,
            module: moduleFromAction(e.action),
            details: e.action,
            timestamp: formatTs(e.timestamp),
            ip: '—',
            device: '—',
            severity: 'Normal',
            status: 'Success',
        })).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    }, [auditLogs]);

    const filteredLogs = useMemo(() => {
        return allLogs.filter(log => {
            const matchesSearch = log.action.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                  log.details.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesSeverity = severityFilter === 'All' || log.severity === severityFilter;
            return matchesSearch && matchesSeverity;
        });
    }, [allLogs, searchQuery, severityFilter]);

    return (
        <div className="space-y-6">
            <button onClick={() => window.location.hash = '#/partial-rms/general-operations/task-management'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Operations
            </button>
            {/* Header / Dashboard */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Security & Audit Center</h1>
                    <p className="text-lg text-gray-500 mt-1">Comprehensive forensic trail of all system activities.</p>
                </div>
                <div className="flex gap-2">
                     <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200 text-center">
                        <p className="text-[10px] text-gray-400 uppercase font-bold">Threat Level</p>
                        <p className="text-green-600 font-bold">{auditLogs.length ? 'Low' : '—'}</p>
                     </div>
                     <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200 text-center">
                        <p className="text-[10px] text-gray-400 uppercase font-bold">Events</p>
                        <p className="text-blue-600 font-bold">{auditLogs.length}</p>
                     </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-96">
                    <input 
                        type="text" 
                        placeholder="Search logs (User, Action, IP)..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                    <div className="absolute left-3 top-2.5 text-gray-400"><Icon name="search" className="w-5 h-5" /></div>
                </div>
                
                <div className="flex gap-2 w-full md:w-auto">
                    <select 
                        value={severityFilter} 
                        onChange={e => setSeverityFilter(e.target.value)} 
                        className="px-3 py-2 border rounded-lg bg-gray-50 text-sm font-medium w-full md:w-auto"
                    >
                        <option value="All">All Severities</option>
                        <option value="Normal">Normal</option>
                        <option value="Warning">Warning</option>
                        <option value="Critical">Critical</option>
                    </select>
                    <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold flex items-center transition-colors">
                        <Icon name="download" className="w-4 h-4 mr-2" /> Export
                    </button>
                </div>
            </div>

            {/* Logs Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="px-6 py-4">Timestamp</th>
                                <th className="px-6 py-4">User / Actor</th>
                                <th className="px-6 py-4">Action</th>
                                <th className="px-6 py-4">Module</th>
                                <th className="px-6 py-4">IP Address</th>
                                <th className="px-6 py-4 text-center">Severity</th>
                                <th className="px-6 py-4 text-right">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50 transition-colors group cursor-pointer" onClick={() => setSelectedLog(log)}>
                                    <td className="px-6 py-4 text-gray-600 font-mono text-xs">{log.timestamp}</td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-800">{log.user}</div>
                                        <div className="text-xs text-gray-500">{log.role}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{log.action}</div>
                                        <div className="text-xs text-gray-500 truncate max-w-xs">{log.details}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">{log.module}</span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 font-mono text-xs">{log.ip}</td>
                                    <td className="px-6 py-4 text-center">
                                        <SeverityBadge severity={log.severity} />
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-primary hover:text-primary-dark font-bold text-xs opacity-0 group-hover:opacity-100 transition-opacity">View</button>
                                    </td>
                                </tr>
                            ))}
                            {filteredLogs.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-400">No logs found matching criteria.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedLog && <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
        </div>
    );
};

export default OperationsAuditTrail;
