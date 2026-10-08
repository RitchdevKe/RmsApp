
import React, { useState, useMemo } from 'react';
import { StaffProfile, LeaveRequest, LeaveType, LeaveStatus } from '../../types';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

const LEAVE_TYPES: LeaveType[] = ['Annual', 'Sick', 'Maternity', 'Paternity', 'Emergency', 'Unpaid'];

const LEAVE_COLORS: Record<LeaveType, string> = {
    Annual:    'bg-blue-100 text-blue-800',
    Sick:      'bg-red-100 text-red-800',
    Maternity: 'bg-pink-100 text-pink-800',
    Paternity: 'bg-indigo-100 text-indigo-800',
    Emergency: 'bg-orange-100 text-orange-800',
    Unpaid:    'bg-gray-100 text-gray-600',
};

const STATUS_COLORS: Record<LeaveStatus, string> = {
    Pending:  'bg-yellow-100 text-yellow-800',
    Approved: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
};

function calcDays(start: string, end: string): number {
    if (!start || !end) return 0;
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1);
}

// ─── Manage Leave Modal ──────────────────────────────────────────────────────
const LeaveManageModal: React.FC<{
    staff: StaffProfile;
    onClose: () => void;
    onUpdate: (s: StaffProfile) => void;
}> = ({ staff, onClose, onUpdate }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'requests' | 'add'>('overview');

    // Form state for adding a new request
    const [form, setForm] = useState({
        type: 'Annual' as LeaveType,
        startDate: '',
        endDate: '',
        reason: '',
    });
    const [formError, setFormError] = useState('');

    const requests: LeaveRequest[] = staff.leaveRequests || [];
    const pending = requests.filter(r => r.status === 'Pending');
    const approved = requests.filter(r => r.status === 'Approved');

    const days = calcDays(form.startDate, form.endDate);

    const handleAdd = () => {
        setFormError('');
        if (!form.startDate || !form.endDate) return setFormError('Start and end dates are required.');
        if (new Date(form.endDate) < new Date(form.startDate)) return setFormError('End date must be after start date.');
        if (!form.reason.trim()) return setFormError('Please provide a reason.');

        const newReq: LeaveRequest = {
            id: `leave-${Date.now()}`,
            staffId: staff.id,
            staffName: staff.name,
            type: form.type,
            startDate: form.startDate,
            endDate: form.endDate,
            days,
            reason: form.reason.trim(),
            status: 'Pending',
            requestedDate: getTodayIsoDate(),
        };
        onUpdate({ ...staff, leaveRequests: [newReq, ...requests] });
        setForm({ type: 'Annual', startDate: '', endDate: '', reason: '' });
        setActiveTab('requests');
    };

    const handleApprove = (id: string) => {
        const req = requests.find(r => r.id === id);
        if (!req) return;
        const updated = requests.map(r =>
            r.id === id ? { ...r, status: 'Approved' as LeaveStatus, approvedBy: 'Manager' } : r
        );
        // Deduct from annual balance only for Annual leave type
        const currentAnnual = staff.leaveBalance?.annual ?? 21;
        const newAnnual = req.type === 'Annual'
            ? Math.max(0, currentAnnual - req.days)
            : currentAnnual;
        onUpdate({ ...staff, leaveRequests: updated, leaveBalance: { ...(staff.leaveBalance || { annual: 21 }), annual: newAnnual } });
    };

    const handleReject = (id: string, notes = '') => {
        const updated = requests.map(r =>
            r.id === id ? { ...r, status: 'Rejected' as LeaveStatus, notes } : r
        );
        onUpdate({ ...staff, leaveRequests: updated });
    };

    const handleDelete = (id: string) => {
        onUpdate({ ...staff, leaveRequests: requests.filter(r => r.id !== id) });
    };

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'requests', label: `Requests ${pending.length > 0 ? `(${pending.length})` : ''}` },
        { id: 'add',      label: 'Add Request' },
    ] as const;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1600] backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 border-b flex justify-between items-start">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Leave Management</h3>
                        <p className="text-sm text-gray-500">{staff.name} · {staff.role}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 mt-1"><Icon name="close" className="w-5 h-5" /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b px-6">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                            className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="space-y-4">
                            {/* Leave Balances */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-blue-50 rounded-xl p-4 text-center">
                                    <p className="text-3xl font-black text-blue-700">{staff.leaveBalance?.annual ?? 21}</p>
                                    <p className="text-xs text-blue-600 font-semibold mt-1">Annual Leave Days</p>
                                    <p className="text-xs text-gray-400">Remaining</p>
                                </div>
                                <div className="bg-yellow-50 rounded-xl p-4 text-center">
                                    <p className="text-3xl font-black text-yellow-700">{pending.length}</p>
                                    <p className="text-xs text-yellow-600 font-semibold mt-1">Pending Requests</p>
                                    <p className="text-xs text-gray-400">Awaiting approval</p>
                                </div>
                                <div className="bg-green-50 rounded-xl p-4 text-center">
                                    <p className="text-3xl font-black text-green-700">{approved.length}</p>
                                    <p className="text-xs text-green-600 font-semibold mt-1">Approved Leaves</p>
                                    <p className="text-xs text-gray-400">Total approved</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-4 text-center">
                                    <p className="text-3xl font-black text-gray-700">
                                        {approved.reduce((s, r) => s + r.days, 0)}
                                    </p>
                                    <p className="text-xs text-gray-600 font-semibold mt-1">Days Taken</p>
                                    <p className="text-xs text-gray-400">Approved total</p>
                                </div>
                            </div>

                            {/* Leave type breakdown */}
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-bold mb-2">Leave Types Available</p>
                                <div className="flex flex-wrap gap-2">
                                    {LEAVE_TYPES.map(t => (
                                        <span key={t} className={`text-xs font-semibold px-3 py-1 rounded-full ${LEAVE_COLORS[t]}`}>{t}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Quick adjust annual balance */}
                            <div className="bg-gray-50 rounded-xl p-4">
                                <p className="text-xs text-gray-500 uppercase font-bold mb-3">Adjust Annual Leave Balance</p>
                                <div className="flex gap-3 items-center">
                                    <input
                                        type="number"
                                        min={0}
                                        defaultValue={staff.leaveBalance?.annual ?? 21}
                                        id={`annual-adj-${staff.id}`}
                                        className="w-24 border rounded-lg p-2 text-center font-bold text-lg focus:ring-2 focus:ring-blue-200 outline-none"
                                    />
                                    <span className="text-sm text-gray-500">days</span>
                                    <button
                                        onClick={() => {
                                            const el = document.getElementById(`annual-adj-${staff.id}`) as HTMLInputElement;
                                            const v = parseInt(el?.value || '0');
                                            if (!isNaN(v) && v >= 0) onUpdate({ ...staff, leaveBalance: { ...(staff.leaveBalance || { annual: 21 }), annual: v } });
                                        }}
                                        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        Update
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* REQUESTS TAB */}
                    {activeTab === 'requests' && (
                        <div className="space-y-3">
                            {requests.length === 0 ? (
                                <div className="text-center py-10 text-gray-400">
                                    <Icon name="calendar" className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                    <p>No leave requests yet.</p>
                                </div>
                            ) : requests.map(r => (
                                <div key={r.id} className={`rounded-xl border p-4 ${r.status === 'Pending' ? 'border-yellow-200 bg-yellow-50' : r.status === 'Approved' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${LEAVE_COLORS[r.type]}`}>{r.type}</span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                                        </div>
                                        <span className="text-xs text-gray-400">{r.requestedDate}</span>
                                    </div>
                                    <p className="text-sm font-semibold text-gray-800">{r.startDate} → {r.endDate} <span className="text-gray-500 font-normal">({r.days} day{r.days !== 1 ? 's' : ''})</span></p>
                                    <p className="text-xs text-gray-600 mt-1">{r.reason}</p>
                                    {r.notes && <p className="text-xs text-gray-400 italic mt-1">Note: {r.notes}</p>}
                                    {r.status === 'Pending' && (
                                        <div className="flex gap-2 mt-3">
                                            <button onClick={() => handleApprove(r.id)}
                                                className="flex-1 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors">
                                                ✓ Approve
                                            </button>
                                            <button onClick={() => handleReject(r.id)}
                                                className="flex-1 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-colors">
                                                ✗ Reject
                                            </button>
                                        </div>
                                    )}
                                    {r.status !== 'Pending' && (
                                        <button onClick={() => handleDelete(r.id)}
                                            className="mt-2 text-xs text-gray-400 hover:text-red-500 transition-colors">
                                            Remove record
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ADD REQUEST TAB */}
                    {activeTab === 'add' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-500 uppercase font-bold mb-1">Leave Type</label>
                                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as LeaveType }))}
                                    className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-blue-200 outline-none bg-white">
                                    {LEAVE_TYPES.map(t => <option key={t} value={t}>{t} Leave</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 uppercase font-bold mb-1">Start Date</label>
                                    <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                                        className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-blue-200 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 uppercase font-bold mb-1">End Date</label>
                                    <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                                        className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-blue-200 outline-none" />
                                </div>
                            </div>
                            {form.startDate && form.endDate && days > 0 && (
                                <div className="bg-blue-50 rounded-xl px-4 py-2 text-center">
                                    <span className="text-sm font-bold text-blue-700">{days} day{days !== 1 ? 's' : ''} requested</span>
                                    {form.type === 'Annual' && <span className="text-xs text-blue-500 ml-2">(Balance: {staff.leaveBalance?.annual ?? 21} days)</span>}
                                </div>
                            )}
                            <div>
                                <label className="block text-xs text-gray-500 uppercase font-bold mb-1">Reason / Notes</label>
                                <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                                    rows={3} placeholder="Provide reason for leave request..."
                                    className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-blue-200 outline-none resize-none" />
                            </div>
                            {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
                            <button onClick={handleAdd}
                                className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-md">
                                Submit Leave Request
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Main Leave & Attendance Component ──────────────────────────────────────
const LeaveAttendance: React.FC = () => {
    const { staff, updateStaff, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canEdit = isSuperAdmin || checkPermission('Users', 'edit');
    const [managingStaff, setManagingStaff] = useState<StaffProfile | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'On Leave'>('All');
    const [filterType, setFilterType] = useState<'All' | LeaveType>('All');

    const filteredStaff = useMemo(() =>
        staff.filter(s => {
            const sName = s.name || '';
            const sRole = s.role || '';
            const matchesSearch = sName.toLowerCase().includes(searchQuery.toLowerCase()) || sRole.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus = filterStatus === 'All' || s.status === filterStatus;
            return matchesSearch && matchesStatus;
        }),
        [staff, searchQuery, filterStatus]
    );

    const allRequests = useMemo(() =>
        staff.flatMap(s => (s.leaveRequests || []).map(r => ({ ...r, staffName: s.name || 'Staff Member', staffRole: s.role || 'Staff' }))),
        [staff]
    );

    const pendingAll = allRequests.filter(r => r.status === 'Pending');
    const approvedThisMonth = allRequests.filter(r => {
        const now = getCurrentMonthIso();
        return r.status === 'Approved' && r.startDate.startsWith(now);
    });
    const onLeaveCount = staff.filter(s => s.status === 'On Leave').length;

    const handleUpdate = (updated: StaffProfile) => {
        if (!canEdit) return alert('You do not have permission to update staff leave records.');
        updateStaff(updated.id, updated);
        setManagingStaff(updated);
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/hr-payroll/staff-management'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Staff Management
            </button>

            <div>
                <h1 className="text-3xl font-bold text-gray-800">Leave & Attendance</h1>
                <p className="text-lg text-gray-500 mt-1">Manage staff leave requests and time off.</p>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Staff', value: staff.length, icon: 'user-circle', color: 'bg-blue-50 text-blue-700' },
                    { label: 'Currently On Leave', value: onLeaveCount, icon: 'calendar', color: 'bg-orange-50 text-orange-700' },
                    { label: 'Pending Requests', value: pendingAll.length, icon: 'pending', color: 'bg-yellow-50 text-yellow-700' },
                    { label: 'Approved This Month', value: approvedThisMonth.length, icon: 'check', color: 'bg-green-50 text-green-700' },
                ].map(({ label, value, icon, color }) => (
                    <div key={label} className={`rounded-xl p-4 flex items-center gap-4 ${color.split(' ')[0]}`}>
                        <div className={`p-2 rounded-lg bg-white/60`}>
                            <Icon name={icon} className={`w-5 h-5 ${color.split(' ')[1]}`} />
                        </div>
                        <div>
                            <p className={`text-2xl font-black ${color.split(' ')[1]}`}>{value}</p>
                            <p className="text-xs font-semibold text-gray-600">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Pending Requests Banner */}
            {pendingAll.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                            <Icon name="pending" className="w-4 h-4 text-yellow-700" />
                        </div>
                        <div>
                            <p className="font-bold text-yellow-800">{pendingAll.length} pending leave request{pendingAll.length !== 1 ? 's' : ''}</p>
                            <p className="text-xs text-yellow-600">
                                {pendingAll.slice(0, 3).map(r => r.staffName).join(', ')}{pendingAll.length > 3 ? ` +${pendingAll.length - 3} more` : ''}
                            </p>
                        </div>
                    </div>
                    <span className="text-xs text-yellow-700 font-semibold">Click Manage to action</span>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search staff..." className="w-full pl-9 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-200 outline-none text-sm" />
                </div>
                <div className="flex gap-2">
                    {(['All', 'Active', 'On Leave'] as const).map(s => (
                        <button key={s} onClick={() => setFilterStatus(s)}
                            className={`px-3 py-2 text-xs font-bold rounded-lg transition-colors ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Staff Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStaff.map(s => {
                    const requests = s.leaveRequests || [];
                    const pending = requests.filter(r => r.status === 'Pending').length;
                    const approved = requests.filter(r => r.status === 'Approved');
                    const daysTaken = approved.reduce((sum, r) => sum + r.days, 0);

                    return (
                        <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-sm">
                                        {(s.name || 'S').charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-800 text-sm">{s.name || 'Unnamed Staff'}</p>
                                        <p className="text-xs text-gray-500">{s.role || 'Employee'}</p>
                                    </div>
                                </div>
                                <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${s.status === 'Active' ? 'bg-green-100 text-green-800' : s.status === 'On Leave' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'}`}>
                                    {s.status || 'Active'}
                                </span>
                            </div>

                            {/* Leave Balance Row */}
                            <div className="grid grid-cols-3 gap-2 mb-4">
                                <div className="text-center bg-blue-50 rounded-lg py-2">
                                    <p className="text-lg font-black text-blue-700">{s.leaveBalance?.annual ?? 21}</p>
                                    <p className="text-[10px] text-blue-500 font-semibold">Annual Left</p>
                                </div>
                                <div className="text-center bg-gray-50 rounded-lg py-2">
                                    <p className="text-lg font-black text-gray-700">{daysTaken}</p>
                                    <p className="text-[10px] text-gray-500 font-semibold">Days Taken</p>
                                </div>
                                <div className="text-center bg-yellow-50 rounded-lg py-2">
                                    <p className="text-lg font-black text-yellow-700">{pending}</p>
                                    <p className="text-[10px] text-yellow-500 font-semibold">Pending</p>
                                </div>
                            </div>

                            {/* Recent leave types used */}
                            {approved.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-3">
                                    {[...new Set(approved.map(r => r.type))].slice(0, 3).map(t => (
                                        <span key={t} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LEAVE_COLORS[t]}`}>{t}</span>
                                    ))}
                                </div>
                            )}

                            <button onClick={() => setManagingStaff(s)}
                                className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5">
                                <Icon name="settings" className="w-3.5 h-3.5" />
                                Manage
                                {pending > 0 && (
                                    <span className="bg-yellow-400 text-yellow-900 text-[10px] font-black px-1.5 py-0.5 rounded-full ml-1">{pending}</span>
                                )}
                            </button>
                        </div>
                    );
                })}
                {filteredStaff.length === 0 && (
                    <div className="col-span-3 text-center py-12 text-gray-400">
                        <Icon name="user-circle" className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>No staff found.</p>
                    </div>
                )}
            </div>

            {/* Leave Manage Modal */}
            {managingStaff && (
                <LeaveManageModal
                    staff={managingStaff}
                    onClose={() => setManagingStaff(null)}
                    onUpdate={handleUpdate}
                />
            )}
        </div>
    );
};

export default LeaveAttendance;
