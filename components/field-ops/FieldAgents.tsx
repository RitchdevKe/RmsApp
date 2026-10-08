// @ts-nocheck

import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { supabase } from '../../utils/supabaseClient';
import { hashPassword } from '../../utils/security';
import { StaffProfile, Property, Task, User, TenantProfile, TenantApplication, TaskStatus, TaskPriority, LandlordApplication } from '../../types';
import Icon from '../Icon';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement, ArcElement, RadialLinearScale } from 'chart.js';
import { Line, Doughnut, Radar, Bar } from 'react-chartjs-2';
import { PropertyForm } from '../registration/Properties';
import { CollectionManagerModal } from '../operations/TaskManagement';
import { ApplicationFormModal, UnifiedRecord } from '../tenants/Applications';
import { NewApplicationModal, ExtendedLandlordApp } from '../landlords/Applications';
import { ComposeModal } from '../operations/communication/Messages';
import { communicationApi } from '../../utils/communicationApi';
import { getMonthPrefix, sumPaidPaymentsForMonth } from '../../utils/paymentReporting';
import { fmtDate } from '../../utils/date';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, RadialLinearScale, Title, Tooltip, Legend);

// --- Card Style ---
const AGENT_CARD_CLASSES = "bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 cursor-pointer overflow-hidden group relative flex flex-col";

// --- Components ---

const AIInsightCard: React.FC<{ title: string; description: string; type: 'success' | 'warning' | 'info' | 'critical'; icon: string }> = ({ title, description, type, icon }) => {
    const styles = {
        success: 'bg-green-50 border-green-200 text-green-800',
        warning: 'bg-orange-50 border-orange-200 text-orange-800',
        info: 'bg-blue-50 border-blue-200 text-blue-800',
        critical: 'bg-red-50 border-red-200 text-red-800'
    };

    return (
        <div className={`p-4 rounded-xl border ${styles[type]} shadow-sm flex items-start gap-3 bg-white`}>
            <div className="mt-1 flex-shrink-0 p-1.5 rounded-lg bg-white/50">
                 <Icon name={icon} className="w-5 h-5" />
            </div>
            <div>
                <h4 className="font-bold text-sm mb-1">{title}</h4>
                <p className="text-xs opacity-90 leading-relaxed">{description}</p>
            </div>
        </div>
    );
};

// Task Detail Modal (Local Definition)
const TaskDetailModal: React.FC<{ task: Task; onClose: () => void; onUpdate: (task: Task) => void }> = ({ task, onClose, onUpdate }) => {
    const [status, setStatus] = useState(task.status);
    const [notes, setNotes] = useState('');

    const handleSave = () => {
        const updatedTask = { 
            ...task, 
            status, 
            history: [...task.history, { id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: `Status updated to ${status}. Note: ${notes}` }]
        };
        onUpdate(updatedTask);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1700] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Manage Task</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                
                <div className="space-y-4">
                    <div className="bg-gray-50 p-3 rounded border">
                        <p className="font-bold text-gray-800">{task.title}</p>
                        <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                        <div className="flex gap-2 mt-2 text-xs text-gray-500">
                            <span>{task.property}</span> • <span>{task.tenant.name}</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Status</label>
                        <select value={status} onChange={e => setStatus(e.target.value as any)} className="w-full p-2 border rounded bg-white">
                            <option value="Issued">Issued</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Update Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-2 border rounded" rows={3} placeholder="Describe work done or status update..."></textarea>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-bold">Cancel</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded font-bold">Update Task</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 1. Add Agent Modal
const AddAgentModal: React.FC<{ onClose: () => void; onSave: (agent: StaffProfile) => void }> = ({ onClose, onSave }) => {
    const [formData, setFormData] = useState<Partial<StaffProfile>>({
        name: '',
        email: '',
        phone: '',
        role: 'Field Agent',
        status: 'Active',
        branch: 'Headquarters',
        department: 'Rental Management',
        salaryConfig: { type: 'Target Based', amount: 50000 },
        leaveBalance: { annual: 21 },
        commissions: []
    });
    const [initialPassword, setInitialPassword] = useState('123456');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async () => {
        if (!formData.name || !formData.email) return alert("Name and Email required");
        if (!initialPassword || initialPassword.length < 6) return alert('Password must be at least 6 characters.');

        setIsSaving(true);
        try {
            const nameParts = String(formData.name ?? '').trim().split(/\s+/).filter(Boolean);
            const firstName = nameParts[0] ?? null;
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;
            const fullName = String(formData.name ?? formData.email);

            const { data: createdId, error } = await supabase.rpc('admin_create_auth_user', {
                p_email: formData.email!,
                p_password: initialPassword,
                p_role: 'Field Agent',
                p_full_name: fullName,
                p_first_name: firstName,
                p_last_name: lastName,
                p_phone: formData.phone ?? null,
                p_id_number: null,
            });

            if (error) throw error;
            if (!createdId) throw new Error('Auth account was not created.');

            const id = String(createdId);
            const pwdHash = await hashPassword(initialPassword);
            const newAgent: StaffProfile = {
                ...formData,
                id,
                email: formData.email!,
                phone: formData.phone || '',
                payrollInfo: { baseSalary: formData.salaryConfig?.amount || 0, nextPaymentDate: getTodayIsoDate() },
                avatar: formData.name?.charAt(0).toUpperCase() || 'A',
                passwordHash: pwdHash,
            } as StaffProfile;

            onSave(newAgent);
        } catch (e: any) {
            console.warn('Field Agent creation failed', e);
            alert(e?.message ?? e ?? 'Failed to create agent account.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1500] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800">New Field Agent</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="space-y-4">
                    <input 
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                        placeholder="Full Name"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                    <input 
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                        placeholder="Email Address"
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                    <input 
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                        placeholder="Phone Number"
                        value={formData.phone}
                        onChange={e => setFormData({...formData, phone: e.target.value})}
                    />
                    <select 
                        className="w-full p-3 border rounded-lg bg-white"
                        value={formData.branch}
                        onChange={e => setFormData({...formData, branch: e.target.value})}
                    >
                        <option>Headquarters</option>
                        <option>Kericho Branch</option>
                        <option>Kisii Branch</option>
                    </select>
                    <div className="pt-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Target Salary (KES)</label>
                        <input 
                            type="number"
                            className="w-full p-3 border rounded-lg mt-1"
                            value={formData.salaryConfig?.amount ?? ''}
                            placeholder="e.g. 50000"
                            onChange={e => setFormData({...formData, salaryConfig: { type: 'Target Based', amount: e.target.value === '' ? '' as any : Number(e.target.value) }})}
                        />
                    </div>
                    <div className="pt-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Initial login password</label>
                        <input
                            type="password"
                            className="w-full p-3 border rounded-lg mt-1"
                            value={initialPassword}
                            onChange={e => setInitialPassword(e.target.value)}
                            placeholder="Min 6 characters"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">Creates a real Supabase login (same as Registration → Users).</p>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg text-gray-700 font-bold">Cancel</button>
                    <button type="button" disabled={isSaving} onClick={handleSubmit} className="px-6 py-2 bg-primary text-white rounded-lg font-bold hover:bg-primary-dark disabled:opacity-50">
                        {isSaving ? 'Creating...' : 'Create Agent'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AgentCard: React.FC<{ agent: StaffProfile; stats: any; onClick: () => void }> = ({ agent, stats, onClick }) => {
    return (
        <div onClick={onClick} className={AGENT_CARD_CLASSES}>
            <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-blue-600 to-indigo-700 opacity-90"></div>
            <div className="absolute top-3 right-3 text-white text-xs font-bold bg-white/20 backdrop-blur-sm px-2 py-1 rounded">
                {agent.branch}
            </div>
            
            <div className="px-6 pt-12 pb-6 relative z-10 flex flex-col items-center flex-grow">
                <div className="w-20 h-20 rounded-full border-4 border-white shadow-md bg-white flex items-center justify-center overflow-hidden mb-3">
                    {agent.avatar ? (
                         <span className="text-2xl font-bold text-gray-700">{agent.avatar}</span>
                    ) : (
                        <Icon name="user-circle" className="w-12 h-12 text-gray-300" />
                    )}
                </div>
                
                <h3 className="text-lg font-bold text-gray-800">{agent.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{agent.role}</p>

                <div className="grid grid-cols-3 gap-2 w-full text-center text-xs mb-4">
                    <div className="bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <p className="text-gray-400 font-bold uppercase text-[9px]">Props</p>
                        <p className="font-bold text-gray-800 text-base">{stats.portfolioSize}</p>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <p className="text-gray-400 font-bold uppercase text-[9px]">Occ.</p>
                        <p className={`font-bold text-base ${stats.occupancy >= 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                            {stats.occupancy}%
                        </p>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <p className="text-gray-400 font-bold uppercase text-[9px]">Tasks</p>
                        <p className="font-bold text-blue-600 text-base">{stats.tasksCount}</p>
                    </div>
                </div>

                <div className="w-full mt-auto space-y-3">
                     <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500">Task Completion</span>
                            <span className="font-bold text-gray-700">{stats.taskCompletion}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className="bg-green-500 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${stats.taskCompletion}%` }}></div>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500">Avg. Collection (MTD)</span>
                            <span className={`font-bold ${stats.collectionRate >= 90 ? 'text-blue-600' : 'text-orange-500'}`}>{stats.collectionRate}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full transition-all duration-1000 ${stats.collectionRate >= 90 ? 'bg-blue-500' : 'bg-orange-400'}`} style={{ width: `${stats.collectionRate}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-xs font-medium text-gray-500">
                <span className={`flex items-center ${agent.status === 'Active' ? 'text-green-600' : 'text-gray-400'}`}>
                    <span className={`w-2 h-2 rounded-full mr-1.5 ${agent.status === 'Active' ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                    {agent.status}
                </span>
                <span className="group-hover:text-primary transition-colors flex items-center">
                    View Dashboard <Icon name="chevron-down" className="w-3 h-3 ml-1 -rotate-90" />
                </span>
            </div>
        </div>
    );
};

const AgentDetailView: React.FC<{ agent: StaffProfile; onClose: () => void }> = ({ agent, onClose }) => {
    const { 
        properties, tasks, tenants, landlords, addProperty, updateProperty, 
        landlords: allLandlords, staff, addApplication, addLandlord, updateTask, updateTenant, addMessage, addTenant, addLandlordApplication, systemSettings
    } = useData();
    
    // Fixed: Added 'Payments' to the union type to match the UI tab rendering
    const [activeTab, setActiveTab] = useState<'Overview' | 'Portfolio' | 'Tenants' | 'Landlords' | 'Tasks' | 'Payments'>('Overview');
    const [viewMode, setViewMode] = useState<'Dashboard' | 'Report'>('Dashboard');
    
    // Ensure we are using the live version of the agent from the context
    const liveAgent = useMemo(() => staff.find(s => s.id === agent.id) || agent, [staff, agent.id]);

    // Filters
    const [tenantFilter, setTenantFilter] = useState('All');
    const [taskTypeFilter, setTaskTypeFilter] = useState<'Work Orders' | 'Collections'>('Work Orders');
    
    // Action States
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [selectedCollectionTenant, setSelectedCollectionTenant] = useState<TenantProfile | null>(null);

    // Modal Visibility States
    const [isAddPropOpen, setIsAddPropOpen] = useState(false);
    const [isAddTenantOpen, setIsAddTenantOpen] = useState(false);
    const [isAddLandlordOpen, setIsAddLandlordOpen] = useState(false);
    const [isComposeOpen, setIsComposeOpen] = useState(false);

    // Message handler
    const handleSendMessage = async (to: string, content: string, channel: string, isGroup = false, count = 1) => {
        let apiResult;
        if (channel === 'SMS') apiResult = await communicationApi.sendSMS(to, content, 'TASKME', systemSettings?.bulkSmsEnabled);
        else if (channel === 'Email') apiResult = await communicationApi.sendEmail(to, 'New Message', content, 'noreply@taskme.re');
        else if (channel === 'WhatsApp') apiResult = await communicationApi.sendWhatsApp(to, content);
        else apiResult = await communicationApi.sendInApp(to, content);

        if (apiResult.success) {
            addMessage({
                id: `msg-${Date.now()}`,
                recipient: { name: to, phone: to },
                content,
                channel,
                timestamp: new Date().toLocaleString(),
                isIncoming: false,
                status: 'Sent'
            });
            alert('Message sent successfully');
        } else {
            alert(`Failed to send: ${apiResult.error || 'Unknown error'}`);
        }
    };

    // --- Aggregated Data ---
    const agentProperties = useMemo(() => properties.filter(p => p.assignedAgentId === liveAgent.id), [properties, liveAgent.id]);
    const agentPropertyIds = useMemo(() => agentProperties.map(p => p.id), [agentProperties]);
    const agentTasks = useMemo(() => tasks.filter(t => t.assignedTo === liveAgent.name), [tasks, liveAgent.name]);
    
    // Agent Tenants: Tenants living in properties assigned to this agent
    const agentTenants = useMemo(() => tenants.filter(t => t.propertyId && agentPropertyIds.includes(t.propertyId)), [tenants, agentPropertyIds]);
    
    // Agent Landlords: Landlords who own properties assigned to this agent
    const agentLandlords = useMemo(() => landlords.filter(l => agentProperties.some(p => p.landlordId === l.id)), [landlords, agentProperties]);

    // --- Derived List Calculations ---
    const agentPayments = useMemo(() => {
        const currentMonth = getMonthPrefix();
        return agentTenants.flatMap(t => t.paymentHistory.filter(p => p.date.startsWith(currentMonth)).map(p => ({
            ...p,
            tenantName: t.name,
            property: t.propertyName,
            unit: t.unit
        }))).slice(0, 10);
    }, [agentTenants]);

    const filteredAgentTenants = useMemo(() => {
        let result = agentTenants;
        switch (tenantFilter) {
            case 'Arrears': return result.filter(t => t.status === 'Overdue');
            case 'Fines': return result.filter(t => t.outstandingFines.some(f => f.status === 'Pending'));
            case 'Partial':
                return result.filter(t => {
                    if (t.status !== 'Overdue') return false;
                    const currentMonth = getMonthPrefix();
                    const paid = sumPaidPaymentsForMonth(t, currentMonth);
                    return paid > 0 && paid < t.rentAmount;
                });
            case 'No Deposit': return result.filter(t => (t.depositPaid || 0) <= 0);
            case 'No Lease': return result.filter(t => t.leaseType === 'Open' || !t.leaseEnd);
            default: return result;
        }
    }, [agentTenants, tenantFilter]);

    const collectionTasks = useMemo(() => agentTenants.filter(t => t.status === 'Overdue'), [agentTenants]);

    // --- Performance Metrics ---
    const totalUnits = agentProperties.reduce((sum, p) => sum + p.units.length, 0);
    const occupiedUnits = agentProperties.reduce((sum, p) => sum + p.units.filter(u => u.status === 'Occupied').length, 0);
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
    
    const completedTasks = agentTasks.filter(t => t.status === 'Completed' || t.status === 'Closed').length;
    const pendingTasks = agentTasks.length - completedTasks;
    const completionRate = agentTasks.length > 0 ? Math.round((completedTasks / agentTasks.length) * 100) : 0;

    // Financials — denominator = current rent + deposit owed + outstanding bills/fines (with arrears).
    const currentMonth = getMonthPrefix();
    const sumOutstandingItems = (items: any[] | undefined) =>
        Array.isArray(items) ? items.filter(i => i && i.status !== 'Paid').reduce((s, i) => s + (Number(i.amount) || 0), 0) : 0;
    const expectedCollection = agentTenants
        .filter(t => ['Active', 'Overdue', 'Notice'].includes(t.status))
        .reduce((sum, t) => {
            const rent = Number(t.rentAmount || 0);
            const depositOwed = Math.max(0, Number((t as any).depositExpected || 0) - Number((t as any).depositPaid || 0));
            const billsOwed = sumOutstandingItems((t as any).outstandingBills);
            const finesOwed = sumOutstandingItems((t as any).outstandingFines);
            return sum + rent + depositOwed + billsOwed + finesOwed;
        }, 0);

    const actualCollection = agentTenants.reduce((sum, t) => sum + sumPaidPaymentsForMonth(t, currentMonth), 0);

    const collectionRate = expectedCollection > 0 ? Math.min(100, Math.round((actualCollection / expectedCollection) * 100)) : 0;

    // Insights Generation
    const insights = useMemo(() => {
        const list = [];
        if (collectionRate < 80) list.push({ type: 'critical', title: 'Revenue Risk', text: `Collection is below target (${collectionRate}%). Prioritize following up with ${agentTenants.filter(t => t.status === 'Overdue').length} overdue tenants.` });
        if (occupancyRate < 85) list.push({ type: 'warning', title: 'Vacancy Alert', text: `Occupancy is ${occupancyRate}%. ${totalUnits - occupiedUnits} units are vacant. Recommend scheduling viewings.` });
        if (pendingTasks > 5) list.push({ type: 'warning', title: 'Task Backlog', text: `${pendingTasks} tasks are pending. Average resolution time might increase.` });
        if (list.length === 0) list.push({ type: 'success', title: 'Top Performance', text: "Excellent work! All metrics are above targets. Consider requesting a referral from happy tenants." });
        
        // Add a generic one if list is short
        if (list.length < 3) {
             list.push({ type: 'info', title: 'Market Trend', text: 'Rental inquiries in this region are up 12% this month. Good time to list vacant units.', icon: 'analytics' });
        }
        
        return list;
    }, [collectionRate, occupancyRate, pendingTasks, agentTenants, totalUnits, occupiedUnits, agentProperties]);

    // Charts Data
    const financialChartData = {
        labels: ['Expected', 'Collected'],
        datasets: [{
            label: 'Rent (KES)',
            data: [expectedCollection, actualCollection],
            backgroundColor: ['#e5e7eb', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'],
            borderRadius: 5,
            barThickness: 40
        }]
    };

    const occupancyChartData = {
        labels: ['Occupied', 'Vacant'],
        datasets: [{
            data: [occupiedUnits, totalUnits - occupiedUnits],
            backgroundColor: ['#3b82f6', '#f3f4f6'],
            borderWidth: 0
        }]
    };

    // Calculate Task Data for Doughnut Chart
    const taskData = {
        labels: ['Completed', 'Pending', 'In Progress'],
        datasets: [{
            data: [
                agentTasks.filter(t => t.status === 'Completed' || t.status === 'Closed').length,
                agentTasks.filter(t => t.status === 'Issued' || t.status === 'Pending').length,
                agentTasks.filter(t => t.status === 'In Progress').length
            ],
            backgroundColor: ['#10b981', '#f59e0b', '#3b82f6'],
            borderWidth: 0
        }]
    };

    const handleSaveProperty = (p: Property) => {
        if (p.id) updateProperty(p.id, p);
        else addProperty({ ...p, id: `prop-${Date.now()}`, units: [], assignedAgentId: liveAgent.id }); 
        setIsAddPropOpen(false);
    };

    const handleSaveTenant = (data: UnifiedRecord) => {
        if (data.recordType === 'Application') {
             const newApp: TenantApplication = {
                id: `app-${Date.now()}`,
                name: data.name || '',
                phone: data.phone || '',
                email: data.email || '',
                property: data.propertyName || '',
                propertyId: data.propertyId,
                unit: data.unit || '',
                unitId: data.unitId,
                status: 'New',
                submittedDate: getTodayIsoDate(),
                source: 'Agent',
                rentAmount: data.rentAmount,
                depositPaid: data.depositPaid
            };
            addApplication(newApp);
            alert("Tenant application submitted for review.");
        } else {
             // Direct registration by a field agent → goes through admin
             // approval first; never appears as Active immediately.
             const newTenant: TenantProfile = {
                 id: data.id || `t-${Date.now()}`,
                 name: data.name || '',
                 email: data.email || '',
                 phone: data.phone || '',
                 status: 'PendingApproval',
                 propertyId: data.propertyId,
                 propertyName: data.propertyName,
                 unitId: data.unitId,
                 unit: data.unit || '',
                 rentAmount: data.rentAmount || 0,
                 depositPaid: data.depositPaid || 0,
                 rentStartDate: data.rentStartDate || getTodayIsoDate(),
                 onboardingDate: data.rentStartDate || getTodayIsoDate(),
                 idNumber: data.idNumber || '',
                 paymentHistory: [],
                 outstandingBills: [],
                 outstandingFines: [],
                 maintenanceRequests: [],
                 notes: [],
                 leaseType: 'Fixed',
                 rentDueDate: 5
             };
             addTenant(newTenant);
             alert("Tenant submitted for approval.");
        }
        setIsAddTenantOpen(false);
    };

    const handleSaveLandlord = (app: ExtendedLandlordApp) => {
        addLandlordApplication(app as unknown as LandlordApplication);
        setIsAddLandlordOpen(false);
        alert("Landlord application submitted successfully.");
    };

    const handleUpdateTask = (updatedTask: Task) => {
        updateTask(updatedTask.id, updatedTask); 
        setSelectedTask(null);
    };

    const handlePrint = () => {
        window.print();
    };

    // Render Logic for Report Mode
    if (viewMode === 'Report') {
        return (
            <div className="fixed inset-0 bg-white z-[2000] overflow-y-auto w-full h-full flex flex-col">
                 {/* Full Screen Report Header with Back Button */}
                 <div className="bg-white border-b sticky top-0 z-50 px-6 py-4 flex justify-between items-center shadow-sm no-print">
                     <button onClick={() => setViewMode('Dashboard')} className="flex items-center text-gray-600 hover:text-primary font-bold transition-colors">
                        <Icon name="chevron-down" className="w-5 h-5 mr-2 rotate-90" />
                        Back to Dashboard
                    </button>
                    <div className="flex gap-3">
                         <button onClick={handlePrint} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark font-bold flex items-center">
                            <Icon name="download" className="w-4 h-4 mr-2" /> Print / PDF
                        </button>
                    </div>
                 </div>

                <div className="max-w-4xl mx-auto p-12 flex-grow">
                    <div className="flex justify-between items-center mb-8 border-b pb-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">Agent Performance Report</h1>
                            <p className="text-gray-500">Generated on {fmtDate(new Date())}</p>
                        </div>
                    </div>

                    {/* Agent Info */}
                    <div className="flex items-center gap-6 mb-10">
                        <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center text-3xl font-bold text-gray-500">
                            {liveAgent.name.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-800">{liveAgent.name}</h2>
                            <p className="text-gray-600">{liveAgent.role} • {liveAgent.branch}</p>
                            <p className="text-gray-600">{liveAgent.email} | {liveAgent.phone}</p>
                        </div>
                        <div className="ml-auto text-right">
                             <div className="text-sm font-bold text-gray-500 uppercase">Overall Score</div>
                             <div className="text-4xl font-extrabold text-blue-600">{Math.round((occupancyRate + collectionRate)/2)}/100</div>
                        </div>
                    </div>

                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-4 gap-6 mb-10">
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="text-xs font-bold text-gray-500 uppercase">Properties</p>
                            <p className="text-2xl font-bold">{agentProperties.length}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="text-xs font-bold text-gray-500 uppercase">Units Managed</p>
                            <p className="text-2xl font-bold">{totalUnits}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="text-xs font-bold text-gray-500 uppercase">Occupancy</p>
                            <p className={`text-2xl font-bold ${occupancyRate < 90 ? 'text-red-600' : 'text-green-600'}`}>{occupancyRate}%</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="text-xs font-bold text-gray-500 uppercase">Collection Rate</p>
                            <p className={`text-2xl font-bold ${collectionRate < 90 ? 'text-orange-600' : 'text-blue-600'}`}>{collectionRate}%</p>
                        </div>
                    </div>

                    {/* Financials Section */}
                    <div className="mb-10">
                        <h3 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Financial Performance (MTD)</h3>
                        <div className="grid grid-cols-2 gap-8">
                             <div>
                                <p className="mb-2"><strong>Expected Revenue:</strong> KES {Number(expectedCollection ?? 0).toLocaleString()}</p>
                                <p className="mb-2"><strong>Actual Collected:</strong> KES {Number(actualCollection ?? 0).toLocaleString()}</p>
                                <p className="mb-2 text-red-600"><strong>Outstanding:</strong> KES {(Number(expectedCollection ?? 0) - Number(actualCollection ?? 0)).toLocaleString()}</p>
                             </div>
                             <div className="h-48">
                                <Bar data={financialChartData} options={{ responsive: true, maintainAspectRatio: false }} />
                             </div>
                        </div>
                    </div>

                    {/* Portfolio Details Table */}
                    <div className="mb-10">
                        <h3 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">Portfolio Breakdown</h3>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 font-bold">
                                <tr>
                                    <th className="p-3">Property</th>
                                    <th className="p-3">Landlord</th>
                                    <th className="p-3 text-center">Units</th>
                                    <th className="p-3 text-center">Occ %</th>
                                    <th className="p-3 text-right">Revenue</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {agentProperties.map(p => {
                                    const occ = p.units.length > 0 ? Math.round((p.units.filter(u => u.status === 'Occupied').length / p.units.length)*100) : 0;
                                    const rev = agentTenants.filter(t => t.propertyId === p.id).reduce((s, t) => s + t.rentAmount, 0);
                                    return (
                                        <tr key={p.id}>
                                            <td className="p-3">{p.name}</td>
                                            <td className="p-3">{allLandlords.find(l => l.id === p.landlordId)?.name}</td>
                                            <td className="p-3 text-center">{p.units.length}</td>
                                            <td className="p-3 text-center">{occ}%</td>
                                            <td className="p-3 text-right">KES {rev.toLocaleString()}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                     {/* Insights */}
                     <div className="bg-blue-50 p-6 rounded-lg border border-blue-100">
                        <h3 className="text-lg font-bold text-blue-800 mb-3">AI Insights & Recommendations</h3>
                        <ul className="space-y-2">
                             {insights.map((insight, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-blue-900">
                                     <span className="font-bold">•</span> {insight.text}
                                </li>
                             ))}
                        </ul>
                    </div>
                </div>
            </div>
        );
    }

    // Default Dashboard Modal View
    return (
        <div className="flex flex-col h-[calc(100vh-100px)] bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in"> 
            {/* Header */}
            <div className="relative bg-gradient-to-r from-gray-900 to-blue-900 text-white p-8 flex-shrink-0">
                <button onClick={onClose} className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-sm font-bold">
                    <Icon name="chevron-down" className="w-4 h-4 rotate-90" /> Back
                </button>
                
                <div className="flex items-center gap-6">
                    <div className="w-24 h-24 rounded-full border-4 border-white/20 bg-white/10 flex items-center justify-center text-3xl font-bold backdrop-blur-md shadow-xl">
                        {liveAgent.avatar || liveAgent.name.charAt(0)}
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold mb-1">{liveAgent.name}</h2>
                        <div className="flex items-center gap-4 text-sm text-blue-200 mb-4">
                            <span className="flex items-center"><Icon name="branch" className="w-4 h-4 mr-1" /> {liveAgent.branch}</span>
                            <span className="flex items-center"><Icon name="hr" className="w-4 h-4 mr-1" /> {liveAgent.role}</span>
                            <span className="bg-green-500/20 text-green-300 px-2 py-0.5 rounded text-xs font-bold border border-green-500/30">
                                {liveAgent.status.toUpperCase()}
                            </span>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setIsComposeOpen(true)} className="px-4 py-2 bg-white text-blue-900 font-bold rounded-lg hover:bg-gray-100 transition-colors flex items-center text-sm shadow-md">
                                <Icon name="communication" className="w-4 h-4 mr-2" /> Message
                            </button>
                            <button 
                                onClick={() => setViewMode('Report')}
                                className="px-4 py-2 bg-blue-600/30 text-white font-bold rounded-lg hover:bg-blue-600/50 transition-colors flex items-center text-sm border border-white/10"
                            >
                                <Icon name="reports" className="w-4 h-4 mr-2" /> Full Report
                            </button>
                        </div>
                    </div>
                    
                    {/* Header Stats */}
                    <div className="ml-auto hidden lg:flex gap-8 text-center">
                        <div>
                            <p className="text-xs text-blue-300 uppercase font-bold tracking-wider">Properties</p>
                            <p className="text-3xl font-extrabold">{agentProperties.length}</p>
                        </div>
                        <div>
                            <p className="text-xs text-blue-300 uppercase font-bold tracking-wider">Units</p>
                            <p className="text-3xl font-extrabold">{totalUnits}</p>
                        </div>
                        <div>
                            <p className="text-xs text-blue-300 uppercase font-bold tracking-wider">Occupancy</p>
                            <p className={`text-3xl font-extrabold ${occupancyRate >= 90 ? 'text-green-400' : 'text-yellow-400'}`}>{occupancyRate}%</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <div className="flex border-b bg-gray-50 px-8 overflow-x-auto flex-shrink-0">
                {['Overview', 'Payments', 'Portfolio', 'Tenants', 'Landlords', 'Tasks'].map(tab => (
                    <button 
                        key={tab} 
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-6 py-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                            activeTab === tab ? 'border-primary text-primary bg-white' : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-grow overflow-y-auto p-8 bg-gray-50/50 min-h-0">
                
                {activeTab === 'Overview' && (
                    <div className="space-y-6">
                        
                         {/* TaskMe AI Intelligence Card */}
                        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 rounded-xl p-5 text-white shadow-md relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-6 opacity-10">
                                <Icon name="analytics" className="w-32 h-32 text-white" />
                            </div>
                            <div className="relative z-10">
                                <h3 className="text-sm font-bold mb-3 flex items-center uppercase tracking-wider opacity-90">
                                    <Icon name="analytics" className="w-4 h-4 mr-2 text-yellow-400" />
                                    TaskMe AI Intelligence
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-800">
                                     {insights.map((insight: any, i: number) => (
                                        <AIInsightCard 
                                            key={i}
                                            title={insight.title} 
                                            description={insight.text}
                                            type={insight.type}
                                            icon={insight.type === 'critical' ? 'arrears' : insight.type === 'warning' ? 'task-escalated' : 'check'}
                                        />
                                     ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <p className="text-xs text-gray-500 font-bold uppercase">Properties</p>
                                <p className="text-3xl font-extrabold text-gray-800 mt-1">{agentProperties.length}</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <p className="text-xs text-gray-500 font-bold uppercase">Total Units</p>
                                <p className="text-3xl font-extrabold text-gray-800 mt-1">{totalUnits}</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <p className="text-xs text-gray-500 font-bold uppercase">Occupancy Rate</p>
                                <p className={`text-3xl font-extrabold mt-1 ${occupancyRate > 90 ? 'text-green-600' : 'text-orange-500'}`}>{occupancyRate}%</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <p className="text-xs text-gray-500 font-bold uppercase">Open Tasks</p>
                                <p className="text-3xl font-extrabold text-blue-600 mt-1">{agentTasks.filter(t => t.status !== 'Completed').length}</p>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* 1. Collections & Financials */}
                            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center">
                                    <Icon name="revenue" className="w-5 h-5 mr-2 text-green-600"/> Financial Performance
                                </h3>
                                <div className="flex items-center gap-8 mb-6">
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase font-bold">Expected</p>
                                        <p className="text-2xl font-extrabold text-gray-400">KES {expectedCollection.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase font-bold">Collected</p>
                                        <p className="text-3xl font-extrabold text-green-600">KES {actualCollection.toLocaleString()}</p>
                                    </div>
                                    <div className="ml-auto text-right">
                                         <p className="text-xs text-gray-500 uppercase font-bold">Collection Rate</p>
                                         <p className={`text-2xl font-bold ${collectionRate < 90 ? 'text-orange-500' : 'text-blue-600'}`}>{collectionRate}%</p>
                                    </div>
                                </div>
                                {/* Progress Bar */}
                                <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
                                    <div className={`h-3 rounded-full ${collectionRate < 80 ? 'bg-orange-500' : 'bg-green-500'}`} style={{ width: `${collectionRate}%` }}></div>
                                </div>
                                <p className="text-xs text-gray-400 text-right">Target: 95% by 10th of month</p>
                            </div>

                            {/* 2. Occupancy Health */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                                <div>
                                    <h3 className="font-bold text-gray-800 mb-1">Occupancy Health</h3>
                                    <p className="text-sm text-gray-500">{occupiedUnits} out of {totalUnits} units occupied.</p>
                                    <div className="mt-4 flex gap-4">
                                        <div className="flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-full bg-blue-500"></span> <span className="text-sm font-bold text-gray-700">Occupied ({occupiedUnits})</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-full bg-gray-200"></span> <span className="text-sm font-bold text-gray-700">Vacant ({totalUnits - occupiedUnits})</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-32 h-32 relative">
                                    <Doughnut data={occupancyChartData} options={{ cutout: '75%', plugins: { legend: { display: false } } }} />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-xl font-bold text-gray-800">{occupancyRate}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sidebar Stats */}
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="font-bold text-gray-800 mb-4 flex justify-between items-center">
                                    Task Status
                                    {/* Add Button here */}
                                    <button 
                                        onClick={() => setActiveTab('Tasks')} 
                                        className="text-xs font-bold text-primary hover:underline border border-gray-200 rounded px-2 py-1 bg-gray-50 hover:bg-gray-100 transition-colors"
                                    >
                                        View All Tasks
                                    </button>
                                </h3>
                                <div className="h-48 flex justify-center">
                                    <Doughnut data={taskData} options={{ cutout: '70%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } } }} />
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-xl text-white shadow-lg">
                                <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Commissions Earned</p>
                                <p className="text-3xl font-extrabold mb-4">KES 45,200</p>
                                <p className="text-xs opacity-90 border-t border-white/20 pt-3">
                                    Based on performance metrics and successful lease closures this month.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'Payments' && (
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="font-bold text-gray-800 mb-4">Recent Payments</h3>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                                    <tr>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Tenant</th>
                                        <th className="px-4 py-3">Property</th>
                                        <th className="px-4 py-3 text-right">Amount</th>
                                        <th className="px-4 py-3 text-center">Method</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {agentPayments.map((p, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-gray-600">{p.date}</td>
                                            <td className="px-4 py-3 font-medium">{p.tenantName}</td>
                                            <td className="px-4 py-3 text-gray-600">{p.property} - {p.unit}</td>
                                            <td className="px-4 py-3 text-right font-bold text-green-600">{p.amount}</td>
                                            <td className="px-4 py-3 text-center">{p.method}</td>
                                        </tr>
                                    ))}
                                    {agentPayments.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">No payment history found.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'Portfolio' && (
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-800">Assigned Properties</h3>
                            <button onClick={() => setIsAddPropOpen(true)} className="text-xs bg-primary text-white px-3 py-1.5 rounded font-bold hover:bg-primary-dark">
                                + Add Property
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {agentProperties.map(p => (
                                <div key={p.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                                    <h4 className="font-bold text-gray-800">{p.name}</h4>
                                    <p className="text-xs text-gray-500">{p.location}</p>
                                    <div className="mt-2 flex justify-between text-xs font-medium text-gray-600 bg-gray-50 p-2 rounded">
                                        <span>{p.units.length} Units</span>
                                        <span className={p.status === 'Active' ? 'text-green-600' : 'text-red-600'}>{p.status}</span>
                                    </div>
                                </div>
                            ))}
                            {agentProperties.length === 0 && <p className="col-span-3 text-center text-gray-400 py-4">No properties assigned.</p>}
                        </div>
                    </div>
                )}

                {activeTab === 'Tenants' && (
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                            <h3 className="font-bold text-gray-800">Managed Tenants</h3>
                            <div className="flex flex-wrap gap-2 items-center">
                                <button 
                                    onClick={() => setIsAddTenantOpen(true)}
                                    className="bg-primary text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm hover:bg-primary-dark flex items-center mr-2"
                                >
                                    <Icon name="plus" className="w-3 h-3 mr-1"/> Register Tenant
                                </button>
                                {['All', 'Arrears', 'Fines', 'Partial', 'No Deposit', 'No Lease'].map(filter => (
                                    <button
                                        key={filter}
                                        onClick={() => setTenantFilter(filter)}
                                        className={`px-3 py-1 text-xs font-bold rounded-full border transition-colors ${
                                            tenantFilter === filter 
                                            ? 'bg-primary text-white border-primary' 
                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        {filter}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                                    <tr>
                                        <th className="px-4 py-3">Name</th>
                                        <th className="px-4 py-3">Property</th>
                                        <th className="px-4 py-3">Unit</th>
                                        <th className="px-4 py-3">Rent</th>
                                        <th className="px-4 py-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredAgentTenants.map(t => (
                                        <tr key={t.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                                            <td className="px-4 py-3 text-gray-600">{t.propertyName}</td>
                                            <td className="px-4 py-3 text-gray-600">{t.unit}</td>
                                            <td className="px-4 py-3 text-gray-800 font-bold">KES {t.rentAmount.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded text-xs font-bold ${t.status === 'Active' ? 'bg-green-100 text-green-700' : t.status === 'Overdue' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{t.status}</span></td>
                                        </tr>
                                    ))}
                                    {filteredAgentTenants.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">No tenants found for filter "{tenantFilter}".</td></tr>}
                                </tbody>
                            </table>
                        </div>
                     </div>
                )}

                {activeTab === 'Landlords' && (
                     <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                         <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800">Associated Landlords</h3>
                            <button 
                                onClick={() => setIsAddLandlordOpen(true)}
                                className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm hover:bg-purple-700 flex items-center"
                            >
                                <Icon name="plus" className="w-3 h-3 mr-1"/> Register Landlord
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {agentLandlords.map(({ id, name }) => (
                                <div key={id} className="p-4 border rounded-lg flex items-center gap-4 hover:shadow-sm">
                                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold">
                                        {name.charAt(0)}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-800">{name}</h4>
                                        <p className="text-xs text-gray-500">
                                            <span className="font-bold text-gray-400 uppercase tracking-wide">Apartment: </span>
                                            {agentProperties.filter(p => p.landlordId === id).map(p => p.name).join(', ') || 'No properties assigned'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {agentLandlords.length === 0 && <p className="col-span-2 text-center text-gray-400 py-4">No landlords associated.</p>}
                        </div>
                    </div>
                )}
                
                {activeTab === 'Tasks' && (
                     <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
                        <div className="p-4 border-b flex gap-4 bg-gray-50">
                            <button 
                                onClick={() => setTaskTypeFilter('Work Orders')}
                                className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${taskTypeFilter === 'Work Orders' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
                            >
                                Work Orders ({agentTasks.filter(t => t.status !== 'Completed').length})
                            </button>
                            <button 
                                onClick={() => setTaskTypeFilter('Collections')}
                                className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${taskTypeFilter === 'Collections' ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border'}`}
                            >
                                Collections ({collectionTasks.length})
                            </button>
                        </div>

                        {taskTypeFilter === 'Work Orders' && (
                            <div className="overflow-auto flex-grow p-4">
                                <table className="min-w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                                        <tr>
                                            <th className="px-6 py-3">Task</th>
                                            <th className="px-6 py-3">Property</th>
                                            <th className="px-6 py-3">Priority</th>
                                            <th className="px-6 py-3">Due Date</th>
                                            <th className="px-6 py-3 text-center">Status</th>
                                            <th className="px-6 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {agentTasks.map(t => (
                                            <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={(e) => { e.stopPropagation(); setSelectedTask(t); }}>
                                                <td className="px-6 py-4 font-bold text-gray-800">{t.title}</td>
                                                <td className="px-6 py-4 text-gray-600">{t.property}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${
                                                        t.priority === 'High' || t.priority === 'Very High' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                                                    }`}>{t.priority}</span>
                                                </td>
                                                <td className="px-6 py-4 text-gray-600 font-mono text-xs">{fmtDate(t.dueDate)}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${
                                                        t.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-700'
                                                    }`}>{t.status}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setSelectedTask(t); }} 
                                                        className="text-xs text-blue-600 hover:underline font-bold"
                                                    >
                                                        Manage
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {agentTasks.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">No tasks found.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {taskTypeFilter === 'Collections' && (
                            <div className="p-4 grid grid-cols-1 gap-4 overflow-auto flex-grow">
                                {collectionTasks.map(tenant => (
                                    <div key={tenant.id} className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h4 className="font-bold text-gray-800">{tenant.name}</h4>
                                                <p className="text-xs text-gray-500">{tenant.propertyName} - {tenant.unit}</p>
                                            </div>
                                            <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Overdue</span>
                                        </div>
                                        <div className="bg-red-50 p-2 rounded text-red-800 font-bold text-lg mb-3 text-center">
                                            KES {tenant.rentAmount.toLocaleString()}
                                        </div>
                                        
                                        {/* History Snippet */}
                                        {tenant.collectionHistory && tenant.collectionHistory.length > 0 && (
                                            <div className="mb-3 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                                                <p className="font-bold text-gray-400 uppercase text-[10px]">Last Interaction:</p>
                                                <p>{tenant.collectionHistory[0].date.split(',')[0]} - {tenant.collectionHistory[0].outcome}</p>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-2">
                                             <a href={`tel:${tenant.phone}`} className="flex items-center justify-center py-2 border border-gray-300 rounded hover:bg-gray-50 font-bold text-xs text-gray-700">
                                                <Icon name="communication" className="w-3 h-3 mr-1"/> Call
                                            </a>
                                            <button 
                                                onClick={() => setSelectedCollectionTenant(tenant)} 
                                                className="flex items-center justify-center py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold text-xs"
                                            >
                                                Log Feedback
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {collectionTasks.length === 0 && (
                                    <div className="col-span-full p-8 text-center text-gray-400 bg-green-50 rounded-lg border border-green-100">
                                        <Icon name="check" className="w-12 h-12 text-green-300 mx-auto mb-2" />
                                        <p>No collection tasks! All assigned tenants are up to date.</p>
                                    </div>
                                )}
                            </div>
                        )}
                     </div>
                )}
            </div>

            {/* Modals for Adding Entities */}
            {isAddPropOpen && <PropertyForm property={{ assignedAgentId: liveAgent.id }} onCancel={() => setIsAddPropOpen(false)} onSave={handleSaveProperty} landlords={allLandlords} staff={staff} />}
            {selectedTask && <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={handleUpdateTask} />}
            {selectedCollectionTenant && (
                <CollectionManagerModal 
                    tenant={selectedCollectionTenant} 
                    onClose={() => setSelectedCollectionTenant(null)} 
                    onUpdateTenant={updateTenant} 
                    onSendMessage={addMessage} 
                />
            )}
            {isAddTenantOpen && (
                <ApplicationFormModal 
                    onClose={() => setIsAddTenantOpen(false)} 
                    onSave={handleSaveTenant} 
                    properties={agentProperties} 
                    record={{ recordType: 'Application', displayStatus: 'New', source: 'Agent' }}
                />
            )}
            {isAddLandlordOpen && (
                <NewApplicationModal 
                    onClose={() => setIsAddLandlordOpen(false)} 
                    onSave={handleSaveLandlord} 
                />
            )}
            {isComposeOpen && <ComposeModal onClose={() => setIsComposeOpen(false)} onSend={handleSendMessage} initialRecipient={{ name: liveAgent.name, phone: liveAgent.phone }} />}
        </div>
    );
};

const FieldAgents: React.FC = () => {
    const { staff, properties, tasks, addStaff, deleteStaff, tenants, landlords, checkPermission } = useData();
    const canDelete = checkPermission('Users', 'delete');
    const [selectedAgent, setSelectedAgent] = useState<StaffProfile | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddAgentModalOpen, setIsAddAgentModalOpen] = useState(false);

    const handleDeleteAgent = (agent: StaffProfile, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(`Permanently delete ${agent.name}? This cannot be undone.`)) return;
        deleteStaff(agent.id);
    };

    const agents = useMemo(() => 
        staff.filter(s => s.role === 'Field Agent' && s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    , [staff, searchQuery]);

     // Global Stats for all field agents
    const globalStats = useMemo(() => {
        // Filter agents
        const fieldAgentIds = staff.filter(s => s.role === 'Field Agent').map(s => s.id);
        const fieldAgentNames = staff.filter(s => s.role === 'Field Agent').map(s => s.name);
        
        // Filter properties managed by these agents
        const relevantProperties = properties.filter(p => fieldAgentIds.includes(p.assignedAgentId || ''));
        const relevantPropertyIds = relevantProperties.map(p => p.id);
        
        // Filter tenants in these properties
        const relevantTenants = tenants.filter(t => t.propertyId && relevantPropertyIds.includes(t.propertyId));

        // Occupancy across managed properties
        const totalUnits = relevantProperties.reduce((sum, p) => sum + (p.units?.length || 0), 0);
        const occupiedUnits = relevantProperties.reduce(
            (sum, p) => sum + (p.units || []).filter(u => u.status === 'Occupied').length,
            0
        );
        const occupancy = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

        const currentMonth = getCurrentMonthIso();
        
        // Calculate Expected
        const expected = relevantTenants
            .filter(t => ['Active', 'Overdue', 'Notice'].includes(t.status))
            .reduce((sum, t) => sum + (t.rentAmount || 0), 0);

        // Calculate Collected
        const collected = relevantTenants.reduce((sum, t) => sum + sumPaidPaymentsForMonth(t, currentMonth), 0);

        const rate = expected > 0 ? Math.round((collected / expected) * 100) : 0;

        // Task velocity: completion rate for tasks assigned to field agents
        const agentTasks = tasks.filter(t => fieldAgentNames.includes(t.assignedTo || ''));
        const done = agentTasks.filter(t => t.status === 'Completed' || t.status === 'Closed').length;
        const taskVelocity = agentTasks.length > 0 ? Math.round((done / agentTasks.length) * 100) : 0;

        return { collected, rate, occupancy, taskVelocity };
    }, [staff, properties, tenants, tasks]);

    const getAgentStats = (agentId: string, agentName: string) => {
        const props = properties.filter(p => p.assignedAgentId === agentId);
        const totalUnits = props.reduce((sum, p) => sum + p.units.length, 0);
        const occupied = props.reduce((sum, p) => sum + p.units.filter(u => u.status === 'Occupied').length, 0);
        
        const myTasks = tasks.filter(t => t.assignedTo === agentName);
        const completed = myTasks.filter(t => t.status === 'Completed').length;

        // Collection Logic — denominator includes current-month rent + deposits
        // + outstanding bills/fines + all prior arrears across these tenants.
        const agentPropIds = props.map(p => p.id);
        const agentTenants = tenants.filter(t => t.propertyId && agentPropIds.includes(t.propertyId));
        const currentMonth = getCurrentMonthIso();

        const sumOutstanding = (items: any[] | undefined) =>
            Array.isArray(items)
                ? items.filter(i => i && i.status !== 'Paid').reduce((s, i) => s + (Number(i.amount) || 0), 0)
                : 0;

        const expectedRent = agentTenants
            .filter(t => ['Active', 'Overdue', 'Notice'].includes(t.status))
            .reduce((sum, t) => {
                const rent = Number(t.rentAmount || 0);
                const depositOwed = Math.max(0, Number((t as any).depositExpected || 0) - Number((t as any).depositPaid || 0));
                const billsOwed = sumOutstanding((t as any).outstandingBills);
                const finesOwed = sumOutstanding((t as any).outstandingFines);
                return sum + rent + depositOwed + billsOwed + finesOwed;
            }, 0);

        const collectedRent = agentTenants.reduce((sum, t) => sum + sumPaidPaymentsForMonth(t, currentMonth), 0);

        const rawRate = expectedRent > 0 ? (collectedRent / expectedRent) * 100 : 0;
        const collectionRate = Math.min(100, Math.round(rawRate));

        return {
            portfolioSize: props.length,
            occupancy: totalUnits > 0 ? Math.round((occupied/totalUnits)*100) : 0,
            tasksCount: myTasks.length,
            taskCompletion: myTasks.length > 0 ? Math.round((completed/myTasks.length)*100) : 0,
            collectionRate
        };
    };

    const handleAddAgent = (newAgent: StaffProfile) => {
        addStaff(newAgent);
        setIsAddAgentModalOpen(false);
    };

    if (selectedAgent) {
        return <AgentDetailView agent={selectedAgent} onClose={() => setSelectedAgent(null)} />;
    }

    return (
        <div className="space-y-8 animate-fade-in">
             {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                    <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Field Team</h1>
                    <p className="text-lg text-gray-500 mt-2">Manage performance, assignments, and operations.</p>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <input 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search agents..." 
                            className="pl-10 pr-4 py-3 border border-gray-200 rounded-xl w-64 focus:ring-2 focus:ring-primary/20 outline-none shadow-sm"
                        />
                        <Icon name="search" className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
                    </div>
                    <button 
                        onClick={() => {
                            // Shortcut to primary Field Agent registration (Registration > Users > Field Agents)
                            try {
                                window.location.hash = '#/registration/users?category=field';
                            } catch {
                                setIsAddAgentModalOpen(true);
                            }
                        }}
                        className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-black transition-transform active:scale-95 flex items-center"
                    >
                        <Icon name="plus" className="w-5 h-5 mr-2" /> New Agent
                    </button>
                </div>
            </div>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Icon name="hr" className="w-6 h-6" /></div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Total Agents</p>
                        <p className="text-2xl font-extrabold text-gray-900">{agents.length}</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-3 bg-green-50 text-green-600 rounded-xl"><Icon name="check" className="w-6 h-6" /></div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Avg. Occupancy</p>
                        <p className="text-2xl font-extrabold text-gray-900">{globalStats.occupancy}%</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl"><Icon name="task-completed" className="w-6 h-6" /></div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Task Velocity</p>
                        <p className="text-2xl font-extrabold text-gray-900">{globalStats.taskVelocity}%</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="p-3 bg-orange-50 text-orange-600 rounded-xl"><Icon name="revenue" className="w-6 h-6" /></div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase">Avg. Collection (MTD)</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-extrabold text-gray-900">KES {(globalStats.collected / 1000000).toFixed(1)}M</p>
                            <span className={`text-sm font-bold ${globalStats.rate >= 90 ? 'text-green-600' : 'text-orange-500'}`}>
                                {globalStats.rate}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Agent Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {agents.map(agent => {
                    const stats = getAgentStats(agent.id, agent.name);
                    return (
                        <div key={agent.id} className="relative group/wrap">
                            <AgentCard
                                agent={agent}
                                stats={stats}
                                onClick={() => setSelectedAgent(agent)}
                            />
                            {canDelete && (
                                <button
                                    onClick={(e) => handleDeleteAgent(agent, e)}
                                    title="Delete agent"
                                    className="absolute top-2 left-2 z-20 opacity-0 group-hover/wrap:opacity-100 transition-opacity bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 shadow-lg"
                                >
                                    <Icon name="close" className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {isAddAgentModalOpen && <AddAgentModal onClose={() => setIsAddAgentModalOpen(false)} onSave={handleAddAgent} />}
        </div>
    );
};

export default FieldAgents;
