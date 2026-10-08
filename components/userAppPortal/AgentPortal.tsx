
import React, { useMemo, useState, useEffect } from 'react';
import * as LucideIcons from 'lucide-react';

import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { isUnitSafelyVacant, getUnitVacatingInfo } from '../../utils/unitOccupancy';
import { useProfileDisplay } from '../../hooks/useProfileDisplay';
import { supabase } from '../../utils/supabaseClient';
import { PropertyForm } from '../registration/Properties';
import { Property, TenantApplication, User, TenantProfile, Task, TaskStatus, TaskPriority, LandlordApplication, StaffProfile } from '../../types';
import { CollectionManagerModal } from '../operations/TaskManagement';
import { fmtDate } from '../../utils/date';
import { getEffectiveRentForMonth, getMonthPrefix, isTenantRentCoveredForMonth, sumPaidPaymentsForMonth } from '../../utils/paymentReporting';
import { getMonthlyRentStatus } from '../../utils/rentSchedule';
import { isLateFeeType } from '../../utils/lateFees';
import ReferTenantModal from './ReferTenantModal';
import { ApplicationFormModal, UnifiedRecord } from '../tenants/Applications';
import { NewApplicationModal, ExtendedLandlordApp } from '../landlords/Applications';
import AdBanners from './AdBanners';
import ReferralFliers from './ReferralFliers';
import ReferralCalculator from './ReferralCalculator';
import PortalShell from './PortalShell';
import { usePortalGrowthActions } from './PortalGrowthModals';
import { useUserPortalFinancials } from '../../hooks/useUserPortalFinancials';
import { getTodayIsoDate } from '../../utils/timezone';

// ... (Previous Helper Components like KpiCard and TaskDetailModal remain unchanged) ...
// Since I am modifying the full file to ensure context safety, I include them below.

const KpiCard: React.FC<{ title: string; value: string; subtext?: string; icon: string; color: string }> = ({ title, value, subtext, icon, color }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4`} style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
                {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
            </div>
            <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const TaskDetailModal: React.FC<{ task: Task; onClose: () => void; onUpdate: (task: Task) => void }> = ({ task, onClose, onUpdate }) => {
    const [status, setStatus] = useState(task.status);
    const [notes, setNotes] = useState('');
    const [newComment, setNewComment] = useState('');

    const handleSave = () => {
        const timestamp = new Date().toLocaleString();
        let updatedComments = [...(task.comments || [])];
        if (newComment.trim()) {
            updatedComments.push({
                user: 'Agent',
                text: newComment.trim(),
                date: timestamp
            });
        }

        const updatedTask = { 
            ...task, 
            status, 
            comments: updatedComments,
            history: [...task.history, { 
                id: `h-${Date.now()}`, 
                timestamp, 
                event: `Status updated to ${status}.${notes.trim() ? ` Note: ${notes}` : ''}${newComment.trim() ? ` Reply added: ${newComment}` : ''}` 
            }]
        };
        onUpdate(updatedTask);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1700] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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

                    {/* TWO-WAY FEEDBACK SYNC PANEL */}
                    <div className="border-t pt-4">
                        <h4 className="font-bold text-gray-700 mb-2 text-xs flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                            Two-Way Admin Feedback Chat
                        </h4>
                        
                        <div className="space-y-2 max-h-32 overflow-y-auto mb-3 bg-gray-50 p-2 rounded">
                            {task.comments && task.comments.length > 0 ? (
                                task.comments.map((c, i) => (
                                    <div key={i} className={`text-xs p-2 rounded border flex flex-col gap-0.5 ${c.user === 'Super Admin' ? 'bg-blue-50 border-blue-100 ml-4' : 'bg-white border-gray-100 mr-4'}`}>
                                        <div className="flex justify-between font-bold text-[9px] text-gray-500 uppercase tracking-tight">
                                            <span className={c.user === 'Super Admin' ? 'text-blue-700' : 'text-primary'}>{c.user}</span>
                                            <span className="font-mono">{c.date}</span>
                                        </div>
                                        <p className="text-gray-800 mt-0.5">{c.text}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-[10px] text-gray-400 italic text-center py-4">No comments found on this task.</p>
                            )}
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">Type reply log to Super Admin</label>
                            <textarea 
                                value={newComment} 
                                onChange={e => setNewComment(e.target.value)} 
                                className="w-full p-2 border rounded text-xs bg-white" 
                                rows={2} 
                                placeholder="Type feedback comments back to super admin portal..."
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Internal Log Notes</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full p-2 border rounded" rows={2} placeholder="Describe physical work done..."></textarea>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t mt-4">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-bold">Cancel</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded font-bold">Update Task</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const HouseStatusModal: React.FC<{ tenant: TenantProfile; onClose: () => void; onSave: (statuses: string[]) => void }> = ({ tenant, onClose, onSave }) => {
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(tenant.houseStatus || []);

    const availableStatuses = [
        'Locked',
        'Electricity Disconnected',
        'Water Disconnected',
        'Gate Access Revoked',
        'Gas Disconnected',
        'Eviction notice issued'
    ];

    const toggleStatus = (status: string) => {
        setSelectedStatuses(prev => prev.includes(status)
            ? prev.filter(s => s !== status)
            : [...prev, status]);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1700] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800">House Status</h3>
                        <p className="text-sm text-gray-500 mt-1">{tenant.name} • {tenant.propertyName} - {tenant.unit}</p>
                    </div>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="space-y-3 mb-6 max-h-[50vh] overflow-y-auto pr-1">
                    {availableStatuses.map(status => (
                        <label key={status} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded">
                            <input
                                type="checkbox"
                                checked={selectedStatuses.includes(status)}
                                onChange={() => toggleStatus(status)}
                                className="h-5 w-5 text-primary rounded focus:ring-primary"
                            />
                            <span className={`text-sm ${selectedStatuses.includes(status) ? 'text-red-600 font-bold' : 'text-gray-700'}`}>{status}</span>
                        </label>
                    ))}
                </div>
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-bold">Cancel</button>
                    <button onClick={() => onSave(selectedStatuses)} className="px-4 py-2 bg-primary text-white rounded font-bold">Save Status</button>
                </div>
            </div>
        </div>
    );
};

type TenantFinancialSnapshot = {
    isCollectible: boolean;
    effectiveRent: number;
    paidThisMonth: number;
    dueDatePassed: boolean;
    currentRentBalance: number;
    pendingBills: number;
    pendingRentBills: number;
    pendingNonLateFines: number;
    paidNonLateFines: number;
    pendingLateFines: number;
    paidLateFines: number;
    lateFeeDue: number;
    daysLateThisMonth: number;
    partialExpected: number;
    balanceDue: number;
    arrearsBalance: number;
    depositExpected: number;
    depositPaid: number;
    depositBalance: number;
};

type TenantFinancialDisplay = {
    expected: number;
    paid: number;
    balance: number;
    expectedHint: string;
    paidHint: string;
    balanceHint: string;
};

const RENT_COLLECTION_STATUSES = new Set(['Active', 'Overdue', 'Notice']);

const isRentLinkedBill = (type?: string, description?: string) => {
    const normalizedType = String(type || '').toLowerCase();
    const normalizedDescription = String(description || '').toLowerCase();
    return normalizedType === 'rent arrears' || normalizedType === 'rent' || normalizedDescription.includes('rent');
};

const AgentPortal: React.FC = () => {
    const { 
        staff, tasks, properties, applications, tenants, landlords, 
        addApplication, addLandlord, addProperty, updateProperty, 
        updateTask, addTenant, addMessage, updateTenant, addLandlordApplication,
        currentUser
    } = useData();
    
    // Updated tab state to include Vacancies and reordered
    const [activeTab, setActiveTab] = useState<'Dashboard' | 'Tasks' | 'Vacancies' | 'My Properties' | 'My Tenants' | 'My Landlords'>('Dashboard');
    
    const [modalOpen, setModalOpen] = useState<'none' | 'addTenant' | 'addLandlord' | 'addProperty'>('none');
    const [isReferModalOpen, setIsReferModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [selectedCollectionTenant, setSelectedCollectionTenant] = useState<TenantProfile | null>(null);
    const [selectedHouseStatusTenant, setSelectedHouseStatusTenant] = useState<TenantProfile | null>(null);
    const [taskTypeFilter, setTaskTypeFilter] = useState<'Work Orders' | 'Collections'>('Work Orders');
    const [tenantFilter, setTenantFilter] = useState('All');
    const [vacancySearch, setVacancySearch] = useState('');
    const [collectionSearchQuery, setCollectionSearchQuery] = useState('');
    const [tenantSearchQuery, setTenantSearchQuery] = useState('');

    const agent = useMemo(() => {
        if (currentUser && currentUser.role === 'Field Agent') {
            return currentUser as StaffProfile;
        }
        return staff.find(s => s.role === 'Field Agent') || staff[0];
    }, [staff, currentUser]);
    const { displayName: profileDisplayName, initial: profileInitial } = useProfileDisplay({ nameFallback: agent?.name });

    // Live Data Filters
    const myTasks = useMemo(() => tasks.filter(t => t.assignedTo === agent.name && t.status !== 'Closed'), [tasks, agent]);
    const myProperties = useMemo(() => properties.filter(p => p.assignedAgentId === agent.id), [properties, agent]);
    const myPropertyIds = useMemo(() => myProperties.map(p => p.id), [myProperties]);
    const myTenants = useMemo(() => tenants.filter(t => t.propertyId && myPropertyIds.includes(t.propertyId)), [tenants, myPropertyIds]);
    const myLandlords = useMemo(() => landlords.filter(l => myProperties.some(p => p.landlordId === l.id)), [landlords, myProperties]);

    // Vacant + Vacating-Soon Units. Agents may share/book ANY vacancy across
    // the platform (not just properties assigned to them), so we scan the full
    // properties list here. Units marked as their tenant's notice-given /
    // vacating-soon are included with a `vacatingSoon` flag + optional
    // `vacateDate` so they can be pre-booked ahead of tenant move-out.
    const myVacantUnits = useMemo(() => {
        return properties.flatMap(p => {
            const rows: any[] = [];
            p.units.forEach(u => {
                const rent = u.rent || p.defaultMonthlyRent || 0;
                const depReq = (p as any).deposit?.required !== false;
                const depMonths = Number((p as any).deposit?.months || 1);
                const deposit = depReq && rent > 0 ? rent * depMonths : 0;
                const base = {
                    ...u,
                    propertyName: p.name,
                    location: p.subLocation && p.zone ? `${p.subLocation} (${p.zone})` : (p.subLocation || p.zone || p.location || p.branch || ''),
                    defaultRent: rent,
                    deposit,
                    houseType: (u as any).unitType || (p as any).defaultUnitType || (p as any).type || '',
                    assignedAgentId: p.assignedAgentId,
                };
                if (isUnitSafelyVacant(u, tenants, p)) {
                    rows.push({ ...base, vacatingSoon: false });
                } else {
                    const info = getUnitVacatingInfo(u, tenants, p);
                    if (info.vacatingSoon) {
                        rows.push({ ...base, vacatingSoon: true, vacateDate: info.vacateDate, currentTenantName: info.tenantName });
                    }
                }
            });
            return rows;
        });
    }, [properties, tenants]);

    const filteredVacancies = useMemo(() => {
        const q = vacancySearch.trim().toLowerCase();
        if (!q) return myVacantUnits;
        return myVacantUnits.filter(u =>
            (u.location || '').toLowerCase().includes(q) ||
            ((u as any).houseType || (u as any).unitType || '').toLowerCase().includes(q) ||
            (u.unitNumber || '').toLowerCase().includes(q) ||
            (u.propertyName || '').toLowerCase().includes(q)
        );
    }, [myVacantUnits, vacancySearch]);

    const currentMonth = getMonthPrefix();

    const tenantFinancials = useMemo(() => {
        const today = new Date();
        const financials = new Map<string, TenantFinancialSnapshot>();

        myTenants.forEach(tenant => {
            const isCollectible = RENT_COLLECTION_STATUSES.has(tenant.status);
            const effectiveRent = isCollectible ? getEffectiveRentForMonth(tenant, currentMonth) : 0;
            const paidThisMonth = sumPaidPaymentsForMonth(tenant, currentMonth);
            const isRentCovered = isCollectible ? isTenantRentCoveredForMonth(tenant, currentMonth) : true;
            const rentStatus = getMonthlyRentStatus(tenant, { isRentPaidThisMonth: isRentCovered });
            const dueDate = new Date(today.getFullYear(), today.getMonth(), rentStatus.dueDay);
            const dueDatePassed = isCollectible && dueDate <= today;

            const pendingBills = (tenant.outstandingBills || [])
                .filter(bill => bill.status === 'Pending')
                .reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
            const pendingRentBills = (tenant.outstandingBills || [])
                .filter(bill => bill.status === 'Pending' && isRentLinkedBill(bill.type, bill.description))
                .reduce((sum, bill) => sum + Number(bill.amount || 0), 0);

            const pendingFineItems = (tenant.outstandingFines || []).filter(fine => fine.status === 'Pending');
            const paidFineItems = (tenant.outstandingFines || []).filter(fine => fine.status === 'Paid');
            const pendingLateFines = pendingFineItems
                .filter(fine => isLateFeeType(fine.type))
                .reduce((sum, fine) => sum + Number(fine.amount || 0), 0);
            const paidLateFines = paidFineItems
                .filter(fine => isLateFeeType(fine.type))
                .reduce((sum, fine) => sum + Number(fine.amount || 0), 0);
            const pendingNonLateFines = pendingFineItems
                .filter(fine => !isLateFeeType(fine.type))
                .reduce((sum, fine) => sum + Number(fine.amount || 0), 0);
            const paidNonLateFines = paidFineItems
                .filter(fine => !isLateFeeType(fine.type))
                .reduce((sum, fine) => sum + Number(fine.amount || 0), 0);

            const lateFeeDue = pendingLateFines + (pendingLateFines <= 0 ? rentStatus.automatedLateFine : 0);
            const currentRentBalance = dueDatePassed ? Math.max(0, effectiveRent - Math.min(paidThisMonth, effectiveRent)) : 0;
            const previousArrears = Number(tenant.arrears || 0);
            const partialExpected = effectiveRent + previousArrears + pendingBills + pendingNonLateFines + lateFeeDue;
            const balanceDue = Math.max(0, partialExpected - paidThisMonth);
            const arrearsBalance = Math.max(0, previousArrears + currentRentBalance + pendingBills + pendingNonLateFines + lateFeeDue);

            const explicitDepositExpected = Number(tenant.depositExpected ?? 0);
            const depositExpected = tenant.depositExempt
                ? 0
                : explicitDepositExpected > 0
                    ? explicitDepositExpected
                    : tenant.proratedDeposit?.enabled
                        ? Number(tenant.proratedDeposit.totalDepositAmount ?? 0)
                        : Number(tenant.rentAmount ?? 0) * Math.max(1, Number(tenant.depositMonths ?? 1));
            const depositPaid = tenant.proratedDeposit?.enabled
                ? Number(tenant.proratedDeposit.amountPaidSoFar ?? 0)
                : Number(tenant.depositPaid ?? 0);
            const depositBalance = Math.max(0, depositExpected - depositPaid);

            financials.set(tenant.id, {
                isCollectible,
                effectiveRent,
                paidThisMonth,
                dueDatePassed,
                currentRentBalance,
                pendingBills,
                pendingRentBills,
                pendingNonLateFines,
                paidNonLateFines,
                pendingLateFines,
                paidLateFines,
                lateFeeDue,
                daysLateThisMonth: rentStatus.daysLateThisMonth,
                partialExpected,
                balanceDue,
                arrearsBalance,
                depositExpected,
                depositPaid,
                depositBalance,
            });
        });

        return financials;
    }, [myTenants, currentMonth]);

    const filteredMyTenants = useMemo(() => {
        let result = myTenants;
        switch (tenantFilter) {
            case 'Unpaid':
                result = result.filter(t => {
                    const financial = tenantFinancials.get(t.id);
                    return !!financial
                        && financial.isCollectible
                        && financial.effectiveRent > 0
                        && financial.dueDatePassed
                        && financial.paidThisMonth <= 0;
                });
                break;
            case 'Arrears':
                result = result.filter(t => {
                    const financial = tenantFinancials.get(t.id);
                    return !!financial
                        && financial.arrearsBalance > 0
                        && (t.status === 'Overdue' || financial.pendingRentBills > 0 || financial.lateFeeDue > 0 || financial.pendingBills > 0 || financial.pendingNonLateFines > 0);
                });
                break;
            case 'Fines':
                result = result.filter(t => {
                    const financial = tenantFinancials.get(t.id);
                    return !!financial && financial.pendingNonLateFines > 0;
                });
                break;
            case 'Late Fee':
                result = result.filter(t => {
                    const financial = tenantFinancials.get(t.id);
                    return !!financial && financial.lateFeeDue > 0;
                });
                break;
            case 'Partial':
                result = result.filter(t => {
                    const financial = tenantFinancials.get(t.id);
                    return !!financial
                        && financial.isCollectible
                        && financial.partialExpected > 0
                        && financial.paidThisMonth > 0
                        && financial.paidThisMonth + 0.5 < financial.partialExpected;
                });
                break;
            case 'No Deposit':
                result = result.filter(t => {
                    const financial = tenantFinancials.get(t.id);
                    if (!financial || !financial.isCollectible || t.depositExempt) return false;
                    return financial.depositExpected > 0 && financial.depositPaid <= 0;
                });
                break;
            case 'No Lease':
                result = result.filter(t => {
                    if (!['Active', 'Overdue', 'Notice'].includes(t.status)) return false;
                    return !t.leaseSigned
                        || !String(t.leaseStartDate || '').trim()
                        || !String(t.leaseEnd || '').trim()
                        || t.leaseType === 'Open';
                });
                break;
            default:
                break;
        }

        const query = tenantSearchQuery.trim().toLowerCase();
        if (query) {
            result = result.filter(t => {
                const nameMatch = (t.name || '').toLowerCase().includes(query);
                const propertyMatch = (t.propertyName || '').toLowerCase().includes(query);
                const unitMatch = (t.unit || '').toLowerCase().includes(query);
                const phoneMatch = (t.phone || '').toLowerCase().includes(query);
                const idMatch = (t.idNumber || '').toLowerCase().includes(query);
                return nameMatch || propertyMatch || unitMatch || phoneMatch || idMatch;
            });
        }
        return result;
    }, [myTenants, tenantFilter, tenantFinancials, tenantSearchQuery]);

    const collectionTasks = useMemo(() => {
        return myTenants.filter(t => (tenantFinancials.get(t.id)?.arrearsBalance ?? 0) > 0);
    }, [myTenants, tenantFinancials]);

    const filteredCollectionTasks = useMemo(() => {
        const query = collectionSearchQuery.trim().toLowerCase();
        return collectionTasks.filter(t => {
            if (!query) return true;
            return (
                (t.name || '').toLowerCase().includes(query) ||
                (t.propertyName || '').toLowerCase().includes(query) ||
                (t.unit || '').toLowerCase().includes(query)
            );
        });
    }, [collectionTasks, collectionSearchQuery]);

    const collectionsGroupedByProperty = useMemo(() => {
        const groups: Record<string, typeof collectionTasks> = {};
        filteredCollectionTasks.forEach(t => {
            const propName = t.propertyName || 'Other Properties';
            if (!groups[propName]) {
                groups[propName] = [];
            }
            groups[propName].push(t);
        });
        return groups;
    }, [filteredCollectionTasks]);

    const tenantTableLabels = useMemo(() => {
        switch (tenantFilter) {
            case 'Unpaid':
                return { expected: 'Expected', paid: 'Paid %', balance: 'Remaining %' };
            case 'Arrears':
                return { expected: 'Expected', paid: 'Paid %', balance: 'Remaining %' };
            case 'Fines':
                return { expected: 'Expected', paid: 'Paid %', balance: 'Remaining %' };
            case 'Late Fee':
                return { expected: 'Expected', paid: 'Paid %', balance: 'Remaining %' };
            case 'Partial':
                return { expected: 'Expected', paid: 'Paid %', balance: 'Remaining %' };
            case 'No Deposit':
                return { expected: 'Expected', paid: 'Paid %', balance: 'Remaining %' };
            default:
                return { expected: 'Expected', paid: 'Paid %', balance: 'Remaining %' };
        }
    }, [tenantFilter]);

    const filteredTenantRows = useMemo(() => {
        return filteredMyTenants.map(tenant => {
            const financial = tenantFinancials.get(tenant.id) || {
                isCollectible: false,
                effectiveRent: 0,
                paidThisMonth: 0,
                dueDatePassed: false,
                currentRentBalance: 0,
                pendingBills: 0,
                pendingRentBills: 0,
                pendingNonLateFines: 0,
                paidNonLateFines: 0,
                pendingLateFines: 0,
                paidLateFines: 0,
                lateFeeDue: 0,
                daysLateThisMonth: 0,
                partialExpected: 0,
                balanceDue: 0,
                arrearsBalance: 0,
                depositExpected: 0,
                depositPaid: 0,
                depositBalance: 0,
            } satisfies TenantFinancialSnapshot;

            let display: TenantFinancialDisplay;

            switch (tenantFilter) {
                case 'Unpaid':
                    display = {
                        expected: financial.effectiveRent,
                        paid: financial.paidThisMonth,
                        balance: financial.currentRentBalance,
                        expectedHint: 'Current rent due',
                        paidHint: 'Collected this month',
                        balanceHint: financial.dueDatePassed ? 'Past due rent' : 'Awaiting due date',
                    };
                    break;
                case 'Arrears':
                    display = {
                        expected: financial.arrearsBalance + financial.paidThisMonth,
                        paid: financial.paidThisMonth,
                        balance: financial.arrearsBalance,
                        expectedHint: 'Rent, bills, fines, late fees',
                        paidHint: 'Collected this month',
                        balanceHint: financial.lateFeeDue > 0 ? 'Includes late fee due' : 'Outstanding cumulative balance',
                    };
                    break;
                case 'Fines':
                    display = {
                        expected: financial.pendingNonLateFines + financial.paidNonLateFines,
                        paid: financial.paidNonLateFines,
                        balance: financial.pendingNonLateFines,
                        expectedHint: 'All non-late fines',
                        paidHint: 'Settled fines',
                        balanceHint: 'Pending fines',
                    };
                    break;
                case 'Late Fee':
                    display = {
                        expected: financial.lateFeeDue + financial.paidLateFines,
                        paid: financial.paidLateFines,
                        balance: financial.lateFeeDue,
                        expectedHint: financial.daysLateThisMonth > 0 ? `${financial.daysLateThisMonth} day${financial.daysLateThisMonth === 1 ? '' : 's'} late` : 'Late fee ledger',
                        paidHint: 'Paid late fees',
                        balanceHint: financial.daysLateThisMonth > 0 ? 'Current late fee due' : 'Pending late fee balance',
                    };
                    break;
                case 'Partial':
                    display = {
                        expected: financial.partialExpected,
                        paid: financial.paidThisMonth,
                        balance: financial.balanceDue,
                        expectedHint: 'Rent plus open charges',
                        paidHint: 'Received this month',
                        balanceHint: 'Still outstanding',
                    };
                    break;
                case 'No Deposit':
                    display = {
                        expected: financial.depositExpected,
                        paid: financial.depositPaid,
                        balance: financial.depositBalance,
                        expectedHint: 'Required deposit',
                        paidHint: 'Deposit credited',
                        balanceHint: 'Deposit still due',
                    };
                    break;
                default:
                    display = {
                        expected: financial.effectiveRent + financial.arrearsBalance + financial.depositExpected,
                        paid: financial.paidThisMonth + financial.depositPaid,
                        balance: Math.max(0, (financial.effectiveRent + financial.arrearsBalance + financial.depositExpected) - (financial.paidThisMonth + financial.depositPaid)),
                        expectedHint: 'Rent + carry arrears + deposit',
                        paidHint: 'Rent & deposit received',
                        balanceHint: 'Total outstanding balance',
                    };
                    break;
            }

            return { tenant, financial, display };
        });
    }, [filteredMyTenants, tenantFilter, tenantFinancials]);

    const tenantFilterSummary = useMemo(() => {
        return filteredTenantRows.reduce((summary, row) => {
            summary.expected += row.display.expected;
            summary.paid += row.display.paid;
            summary.balance += row.display.balance;
            return summary;
        }, { expected: 0, paid: 0, balance: 0 });
    }, [filteredTenantRows]);

    const totalCommission = useMemo(() => {
        return (agent.commissions || []).reduce((sum, c) => sum + c.amount, 0);
    }, [agent]);

    const myLeads = useMemo(() => applications.filter(a => a.status === 'New' || a.status === 'Under Review'), [applications]);
    
    const occupancyRate = useMemo(() => {
        const totalUnits = myProperties.reduce((acc, p) => acc + p.units.length, 0);
        const occupied = myProperties.reduce((acc, p) => acc + p.units.filter(u => u.status === 'Occupied').length, 0);
        return totalUnits > 0 ? Math.round((occupied/totalUnits)*100) : 0;
    }, [myProperties, tenants]);

    const collectionStats = useMemo(() => {
        const expected = myTenants.reduce((sum, tenant) => {
            const financial = tenantFinancials.get(tenant.id);
            if (!financial?.isCollectible) return sum;
            return sum + financial.effectiveRent + financial.arrearsBalance + financial.depositExpected;
        }, 0);
        const collected = myTenants.reduce((sum, tenant) => {
            const financial = tenantFinancials.get(tenant.id);
            if (!financial?.isCollectible) return sum;
            return sum + financial.paidThisMonth + financial.depositPaid;
        }, 0);
        const rate = expected > 0 ? Math.round((collected/expected)*100) : 0;
        return { collected, rate };
    }, [myTenants, tenantFinancials]);

    const handleRegisterTenant = async (data: UnifiedRecord) => {
        if (data.recordType === 'Application') {
             const newApp: TenantApplication = {
                id: `app-${Date.now()}`,
                name: data.name || '',
                phone: data.phone || '',
                email: data.email || '',
                property: data.propertyName,
                propertyId: data.propertyId,
                unit: data.unit,
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
             const newTenant: TenantProfile = {
                 id: data.id || `t-${Date.now()}`,
                 name: data.name || '',
                 email: data.email || '',
                 phone: data.phone || '',
                 // Field-agent registrations require admin approval before
                 // they can become Active / Pending Payment.
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
             try {
                 const { error } = await supabase.from('tenants').insert({
                     id: newTenant.id,
                     created_by: agent.id,
                     name: newTenant.name,
                     email: newTenant.email,
                     phone: newTenant.phone,
                     id_number: newTenant.idNumber,
                     status: newTenant.status,
                     property_id: newTenant.propertyId,
                     property_name: newTenant.propertyName,
                     unit_id: newTenant.unitId,
                     unit: newTenant.unit,
                     rent_amount: newTenant.rentAmount,
                     deposit_paid: newTenant.depositPaid,
                     rent_start_date: newTenant.rentStartDate,
                     onboarding_date: newTenant.onboardingDate,
                     lease_type: newTenant.leaseType,
                     rent_due_date: newTenant.rentDueDate,
                     payment_history: newTenant.paymentHistory,
                     outstanding_bills: newTenant.outstandingBills,
                     outstanding_fines: newTenant.outstandingFines,
                     maintenance_requests: newTenant.maintenanceRequests,
                     notes: newTenant.notes,
                 });
                 if (error) throw error;
             } catch (e: any) {
                 console.warn('Insert into tenants failed, using app state only:', e?.message);
             }
             addTenant(newTenant);
             alert("Tenant submitted for approval.");
        }
        setModalOpen('none');
    };

    const handleRegisterLandlord = async (app: ExtendedLandlordApp) => {
        try {
            const { error } = await supabase.from('landlords').insert({
                id: app.id,
                created_by: agent.id,
                name: app.name,
                email: app.email,
                phone: app.phone,
                id_number: app.idNumber,
                status: app.status,
                date: app.date,
                proposed_properties: app.proposedProperties || [],
                notes: app.notes,
                location: app.location,
                property_ids: app.propertyIds || [],
                payment_config: app.paymentConfig,
            });
            if (error) throw error;
        } catch (e: any) {
            console.warn('Insert into landlords failed, using app state only:', e?.message);
        }
        addLandlordApplication(app as unknown as LandlordApplication);
        setModalOpen('none');
        alert("Landlord application submitted successfully.");
    };

    const handleAddProperty = async (prop: Property) => {
        const finalProp = prop.id ? prop : { ...prop, id: `prop-${Date.now()}`, units: [], assignedAgentId: agent.id };
        if (prop.id) {
            updateProperty(prop.id, prop);
        } else {
            try {
                const { error } = await supabase.from('properties').insert({
                    id: finalProp.id,
                    created_by: agent.id,
                    name: finalProp.name,
                    type: finalProp.type,
                    ownership: finalProp.ownership,
                    branch: finalProp.branch,
                    status: finalProp.status,
                    landlord_id: finalProp.landlordId,
                    assigned_agent_id: finalProp.assignedAgentId,
                    location: finalProp.location,
                    default_monthly_rent: finalProp.defaultMonthlyRent,
                    floors: finalProp.floors,
                    units: finalProp.units || [],
                    assets: finalProp.assets || [],
                    default_unit_type: finalProp.defaultUnitType,
                    rent_is_uniform: finalProp.rentIsUniform,
                    rent_type: finalProp.rentType,
                    deposit: finalProp.deposit,
                    placement_fee: finalProp.placementFee,
                    bills: finalProp.bills,
                    remittance_type: finalProp.remittanceType,
                    remittance_cutoff_day: finalProp.remittanceCutoffDay,
                    nearest_landmark: finalProp.nearestLandmark,
                    county: finalProp.county,
                    sub_county: finalProp.subCounty,
                    zone: finalProp.zone,
                    sub_location: finalProp.subLocation,
                    profile_picture_url: finalProp.profilePictureUrl,
                    rent_by_type: finalProp.rentByType,
                    floorplan: finalProp.floorplan || [],
                });
                if (error) throw error;
            } catch (e: any) {
                console.warn('Insert into properties failed, using app state only:', e?.message);
            }
            addProperty(finalProp);
        }
        setModalOpen('none');
        alert("Property added/updated successfully.");
    };

    const handleSaveHouseStatus = (statuses: string[]) => {
        if (!selectedHouseStatusTenant) return;
        updateTenant(selectedHouseStatusTenant.id, { houseStatus: statuses });
        setSelectedHouseStatusTenant(null);
    };

    const handleUpdateTask = (updatedTask: Task) => {
        updateTask(updatedTask.id, updatedTask);
        setSelectedTask(null);
    };

    const growth = usePortalGrowthActions();
    const wallet = useUserPortalFinancials();

    const [tabCollapsed, setTabCollapsed] = useState(false);

    const goToTab = (tab: typeof activeTab, extra?: () => void) => {
        setActiveTab(tab);
        setTabCollapsed(false);
        if (extra) extra();
        requestAnimationFrame(() => {
            document.getElementById('agent-tab-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };



    return (
        <div className="space-y-3 pb-16">
            <PortalShell
                cards={[
                    {
                        label: 'Wallet Balance',
                        value: `KES ${Number(wallet.walletBalance ?? 0).toLocaleString()}`,
                        sublabel: wallet.walletPending > 0
                            ? `KES ${Number(wallet.walletPending).toLocaleString()} pending payout`
                            : 'Paid commissions ready to withdraw',
                        iconNode: <LucideIcons.Wallet className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-primary via-primary to-primary-dark',
                        trend: wallet.walletThisMonth > 0 ? `+${Number(wallet.walletThisMonth).toLocaleString()} MTD` : 'KES 0 MTD',
                        trendTone: wallet.walletThisMonth > 0 ? 'up' : 'neutral',
                    },
                    {
                        label: 'Investments Balance',
                        value: `KES ${Number(wallet.investmentsBalance ?? 0).toLocaleString()}`,
                        sublabel: wallet.investmentsInterest > 0
                            ? `KES ${Number(wallet.investmentsInterest).toLocaleString()} interest earned`
                            : 'Renovation Fund balance',
                        iconNode: <LucideIcons.TrendingUp className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-amber-600 via-orange-600 to-rose-700',
                        onClick: () => growth.actions[1].onClick(),
                    },
                    {
                        label: 'My Chama Savings',
                        value: `KES ${Number(wallet.chamaSavings ?? 0).toLocaleString()}`,
                        sublabel: 'Task-Me Chama · launching soon',
                        iconNode: <LucideIcons.Users className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-emerald-600 via-emerald-700 to-teal-800',
                        onClick: () => growth.actions[0].onClick(),
                    },
                ]}
                actions={[
                    { label: 'Add Tenant',    iconNode: <LucideIcons.UserPlus className="w-full h-full" strokeWidth={1.8} />,   onClick: () => setModalOpen('addTenant') },
                    { label: 'Add Landlord',  iconNode: <LucideIcons.Building2 className="w-full h-full" strokeWidth={1.8} />,  onClick: () => setModalOpen('addLandlord') },
                    { label: 'Add Property',  iconNode: <LucideIcons.Home className="w-full h-full" strokeWidth={1.8} />,       onClick: () => setModalOpen('addProperty') },
                    { label: 'Vacancies',     iconNode: <LucideIcons.DoorOpen className="w-full h-full" strokeWidth={1.8} />,   onClick: () => goToTab('Vacancies'), badge: myVacantUnits.length || undefined },
                    { label: 'Tasks',         iconNode: <LucideIcons.ClipboardList className="w-full h-full" strokeWidth={1.8} />, onClick: () => goToTab('Tasks'), badge: myTasks.length || undefined },
                    { label: 'Refer Tenant',  iconNode: <LucideIcons.Share2 className="w-full h-full" strokeWidth={1.8} />,     onClick: () => setIsReferModalOpen(true) },
                    { label: 'Collections',   iconNode: <LucideIcons.HandCoins className="w-full h-full" strokeWidth={1.8} />,  onClick: () => goToTab('Tasks', () => setTaskTypeFilter('Collections')) },
                    { label: 'My Portfolio',  iconNode: <LucideIcons.LayoutGrid className="w-full h-full" strokeWidth={1.8} />, onClick: () => goToTab('My Properties') },
                    ...growth.actions,
                ]}
                metrics={[
                    { label: 'Properties', value: myProperties.length.toString() },
                    { label: 'Tenants',    value: myTenants.length.toString() },
                    { label: 'Occupancy',  value: `${occupancyRate}%`, tone: 'text-emerald-600' },
                    { label: 'Collected',  value: `${collectionStats.rate}%`, tone: collectionStats.rate >= 75 ? 'text-emerald-600' : collectionStats.rate >= 40 ? 'text-amber-600' : 'text-red-600' },
                ]}
            />
            {growth.modals}


            {/* Navigation Tabs — wrapped in a quick-actions style container */}
            <div id="agent-tab-section" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 scroll-mt-4">
                <div className="flex items-center gap-1.5">
                    <div className="flex gap-1.5 overflow-x-auto sidebar-nav-scroll flex-1">
                        {['Dashboard', 'Tasks', 'Vacancies', 'My Properties', 'My Tenants', 'My Landlords'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => { setActiveTab(tab as any); setTabCollapsed(false); }}
                                className={`relative px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap
                                    ${activeTab === tab && !tabCollapsed
                                        ? 'bg-white text-primary shadow ring-1 ring-primary/15'
                                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => setTabCollapsed(c => !c)}
                        title={tabCollapsed ? 'Show panel' : 'Collapse panel'}
                        aria-label={tabCollapsed ? 'Show panel' : 'Collapse panel'}
                        className="shrink-0 p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-50 ring-1 ring-gray-200"
                    >
                        <LucideIcons.ChevronUp className={`w-4 h-4 transition-transform ${tabCollapsed ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </div>

            {!tabCollapsed && activeTab === 'Dashboard' && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <KpiCard title="Commissions (YTD)" value={`KES ${Number(totalCommission ?? 0).toLocaleString()}`} subtext="Paid & Pending" icon="revenue" color="#10b981" />
                        <KpiCard title="Active Leads" value={myLeads.length.toString()} subtext="Potential Tenants" icon="tenants" color="#3b82f6" />
                        <KpiCard title="Collection Rate" value={`${collectionStats.rate}%`} subtext={`KES ${(collectionStats.collected/1000).toFixed(1)}k Collected`} icon="payments" color="#f59e0b" />
                        <KpiCard title="Portfolio Occ." value={`${occupancyRate}%`} subtext={`${myProperties.length} Properties`} icon="branch" color="#8b5cf6" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* High Priority Tasks */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                                <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                                Priority Tasks
                            </h3>
                            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                                {myTasks.length > 0 ? myTasks.slice(0, 5).map(task => (
                                    <div key={task.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedTask(task)}>
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${task.priority === 'High' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {task.priority}
                                            </span>
                                            <span className="text-xs text-gray-400 font-mono">{fmtDate(task.dueDate)}</span>
                                        </div>
                                        <h4 className="font-bold text-gray-800 text-sm">{task.title}</h4>
                                        <p className="text-xs text-gray-600 mt-1">{task.property} • {task.tenant.name}</p>
                                    </div>
                                )) : (
                                    <p className="text-center text-gray-400 py-8 text-sm">No active tasks assigned.</p>
                                )}
                            </div>
                        </div>

                        {/* Collections Snapshot */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                                 <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
                                 Overdue Collections ({collectionTasks.length})
                            </h3>
                            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                                 {collectionTasks.length > 0 ? collectionTasks.slice(0, 5).map(t => {
                                    const financial = tenantFinancials.get(t.id);
                                    return (
                                    <div key={t.id} className="flex items-center justify-between p-3 border-b last:border-0 hover:bg-gray-50 transition-colors">
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">{t.name}</p>
                                            <p className="text-xs text-red-500 font-bold">Balance: KES {Number(financial?.arrearsBalance ?? 0).toLocaleString()}</p>
                                            {(financial?.lateFeeDue ?? 0) > 0 && <p className="text-[10px] text-orange-600 font-bold">Late fee due: KES {Number(financial?.lateFeeDue ?? 0).toLocaleString()}</p>}
                                            <p className="text-[10px] text-gray-500">{t.unit} - {t.propertyName}</p>
                                        </div>
                                        <button onClick={() => setSelectedCollectionTenant(t)} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded text-xs font-bold hover:bg-blue-100">
                                            Action
                                        </button>
                                    </div>
                                    );
                                 }) : (
                                     <p className="text-center text-gray-400 py-8 text-sm">No pending collections.</p>
                                 )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {!tabCollapsed && activeTab === 'My Properties' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Assigned Portfolio</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {myProperties.map(prop => (
                            <div key={prop.id} className="p-4 border border-gray-200 rounded-lg hover:border-primary/50 transition-colors cursor-pointer group">
                                 <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-gray-800 group-hover:text-primary transition-colors">{prop.name}</h4>
                                    <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-600 font-bold">{prop.type}</span>
                                 </div>
                                 <p className="text-xs text-gray-500 mb-3">{prop.location || prop.branch}</p>
                                 <div className="flex justify-between text-xs font-medium text-gray-600 bg-gray-50 p-2 rounded">
                                     <span>{prop.units.length} Units</span>
                                     <span>{prop.units.filter(u => u.status === 'Occupied').length} Occupied</span>
                                 </div>
                            </div>
                        ))}
                        {myProperties.length === 0 && <p className="col-span-3 text-center text-gray-400 py-4">No properties assigned.</p>}
                    </div>
                </div>
            )}
            
            {/* NEW: Vacancies Tab */}
            {!tabCollapsed && activeTab === 'Vacancies' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center">
                            <Icon name="vacant-house" className="w-5 h-5 mr-2 text-red-500"/>
                            Available Vacancies ({myVacantUnits.length})
                        </h3>
                        <div className="relative w-full sm:w-72">
                            <Icon name="search" className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={vacancySearch}
                                onChange={e => setVacancySearch(e.target.value)}
                                placeholder="Search by location or house type..."
                                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-primary focus:border-primary outline-none"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredVacancies.length > 0 ? filteredVacancies.map(unit => {
                            const vacating = (unit as any).vacatingSoon;
                            const vacateLabel = (unit as any).vacateDate
                                ? `From ${fmtDate((unit as any).vacateDate)}`
                                : 'By end of month';
                            return (
                            <div key={unit.id} className={`p-4 border rounded-lg hover:shadow-md transition-shadow ${vacating ? 'border-amber-200 bg-amber-50/30' : 'border-red-200 bg-red-50/20'}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-bold text-gray-800">{unit.unitNumber}</h4>
                                    {vacating ? (
                                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-200 uppercase">Vacating · {vacateLabel}</span>
                                    ) : (
                                        <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">VACANT</span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-600 font-bold mb-1">{unit.propertyName}</p>
                                {(unit as any).houseType && (
                                    <p className="text-xs text-primary font-semibold mb-1">{(unit as any).houseType}</p>
                                )}
                                <p className="text-xs text-gray-500 mb-3">{unit.location}</p>
                                <div className="flex justify-between items-center border-t border-gray-100 pt-3">
                                    <div>
                                        <span className="font-bold text-blue-600 text-sm">KES {Number(unit.defaultRent ?? 0).toLocaleString()} <span className="font-normal text-gray-400 text-[10px]">/ mo</span></span>
                                        {Number((unit as any).deposit ?? 0) > 0 && (
                                            <p className="text-[11px] text-gray-500 mt-0.5">Deposit: <span className="font-semibold text-gray-700">KES {Number((unit as any).deposit).toLocaleString()}</span></p>
                                        )}
                                    </div>
                                    <button 
                                        className="text-[10px] bg-green-600 text-white px-3 py-1.5 rounded font-bold hover:bg-green-700"
                                        onClick={() => setModalOpen('addTenant')}
                                    >
                                        {vacating ? 'Pre-Book Tenant' : 'Register Tenant'}
                                    </button>
                                </div>
                            </div>
                            );
                        }) : (
                            <div className="col-span-full py-12 text-center">
                                <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600">
                                    <Icon name="check" className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-700">No Vacancies Right Now</h3>
                                <p className="text-gray-500 text-sm">All units are occupied and no notices are pending.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!tabCollapsed && activeTab === 'My Tenants' && (
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                        <h3 className="text-lg font-bold text-gray-800">Managed Tenants</h3>
                        <div className="flex flex-wrap gap-2 items-center">
                            <button 
                                onClick={() => setModalOpen('addTenant')}
                                className="bg-primary text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm hover:bg-primary-dark flex items-center mr-2"
                            >
                                <Icon name="plus" className="w-3 h-3 mr-1"/> Register Tenant
                            </button>
                            {['All', 'Unpaid', 'Arrears', 'Fines', 'Late Fee', 'Partial', 'No Deposit', 'No Lease'].map(filter => (
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
                    {/* Managed Tenants Search Bar */}
                    <div className="mb-4">
                        <div className="relative">
                            <LucideIcons.Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <input
                                id="agent-tenant-search-input"
                                type="text"
                                value={tenantSearchQuery}
                                onChange={(e) => setTenantSearchQuery(e.target.value)}
                                placeholder="Search tenants by tenant name, property, unit, phone or ID number..."
                                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Tenants</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">{filteredTenantRows.length}</p>
                            <p className="text-xs text-gray-500 mt-1">Filter: {tenantFilter}</p>
                        </div>
                        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">{tenantTableLabels.expected}</p>
                            <p className="text-2xl font-bold text-blue-900 mt-1">100%</p>
                            <p className="text-xs text-blue-700/80 mt-1">Rent + Carry Arrears + Deposits</p>
                        </div>
                        <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-green-700">{tenantTableLabels.paid}</p>
                            <p className="text-2xl font-bold text-green-900 mt-1">{tenantFilterSummary.expected > 0 ? Math.min(100, Math.round((tenantFilterSummary.paid / tenantFilterSummary.expected) * 100)) : 0}%</p>
                            <p className="text-xs text-green-700/80 mt-1">Collected percentage of overall</p>
                        </div>
                        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-red-700">{tenantTableLabels.balance}</p>
                            <p className="text-2xl font-bold text-red-900 mt-1">{tenantFilterSummary.expected > 0 ? Math.max(0, 100 - Math.round((tenantFilterSummary.paid / tenantFilterSummary.expected) * 100)) : 0}%</p>
                            <p className="text-xs text-red-700/80 mt-1">Outstanding percentage of overall</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-4 py-3">Name</th>
                                    <th className="px-4 py-3">Phone</th>
                                    <th className="px-4 py-3">Property</th>
                                    <th className="px-4 py-3">Unit</th>
                                    <th className="px-4 py-3">{tenantTableLabels.expected}</th>
                                    <th className="px-4 py-3">{tenantTableLabels.paid}</th>
                                    <th className="px-4 py-3">{tenantTableLabels.balance}</th>
                                    <th className="px-4 py-3">House Status</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredTenantRows.map(({ tenant: t, display, financial }) => (
                                    <tr key={t.id} className="hover:bg-gray-50 align-top">
                                        <td className="px-4 py-3 font-medium text-gray-900">
                                            <div>
                                                <p>{t.name}</p>
                                                {tenantFilter === 'Late Fee' && financial.daysLateThisMonth > 0 && <p className="text-[10px] text-orange-600 font-bold mt-1">{financial.daysLateThisMonth} day{financial.daysLateThisMonth === 1 ? '' : 's'} late</p>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">{t.phone}</td>
                                        <td className="px-4 py-3 text-gray-600">{t.propertyName}</td>
                                        <td className="px-4 py-3 text-gray-600">{t.unit}</td>
                                            {(() => {
                                             const exp = Number(display.expected ?? 0);
                                            const paid = Number(display.paid ?? 0);
                                            const paidPct = exp > 0 ? Math.min(100, Math.round((paid / exp) * 100)) : 0;
                                            const remPct = Math.max(0, 100 - paidPct);
                                            return (<>
                                                <td className="px-4 py-3">
                                                    <p className="text-gray-900 font-bold">100%</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-green-700 font-bold">{paidPct}%</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className={`font-bold ${remPct > 0 ? 'text-red-700' : 'text-gray-700'}`}>{remPct}%</p>
                                                </td>
                                            </>);
                                         })()}
                                        <td className="px-4 py-3">
                                            {t.houseStatus && t.houseStatus.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {t.houseStatus.slice(0, 2).map(status => (
                                                        <span key={status} className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded font-bold border border-red-100">
                                                            {status}
                                                        </span>
                                                    ))}
                                                    {t.houseStatus.length > 2 && <span className="text-[10px] text-gray-400">+{t.houseStatus.length - 2}</span>}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-400">None</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center"><span className={`px-2 py-0.5 rounded text-xs font-bold ${t.status === 'Active' ? 'bg-green-100 text-green-700' : t.status === 'Overdue' ? 'bg-red-100 text-red-700' : t.status === 'Notice' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{t.status}</span></td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => setSelectedHouseStatusTenant(t)}
                                                className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded text-xs font-bold hover:bg-blue-100"
                                            >
                                                Update Status
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredTenantRows.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-gray-400">No tenants found for filter "{tenantFilter}".</td></tr>}
                            </tbody>
                        </table>
                    </div>
                 </div>
            )}

            {!tabCollapsed && activeTab === 'My Landlords' && (
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                     <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800">Associated Landlords</h3>
                        <button 
                            onClick={() => setModalOpen('addLandlord')}
                            className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-sm hover:bg-purple-700 flex items-center"
                        >
                            <Icon name="plus" className="w-3 h-3 mr-1"/> Register Landlord
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {myLandlords.map(l => (
                            <div key={l.id} className="p-4 border rounded-lg flex items-center gap-4 hover:shadow-sm">
                                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold">
                                    {l.name.charAt(0)}
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-800">{l.name}</h4>
                                    <p className="text-xs text-gray-400">{myProperties.filter(p => p.landlordId === l.id).length} propert{myProperties.filter(p => p.landlordId === l.id).length === 1 ? 'y' : 'ies'}</p>
                                </div>
                            </div>
                        ))}
                        {myLandlords.length === 0 && <p className="col-span-2 text-center text-gray-400 py-4">No landlords associated.</p>}
                    </div>
                </div>
            )}
            
            {!tabCollapsed && activeTab === 'Tasks' && (
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
                    <div className="p-4 border-b flex gap-4 bg-gray-50">
                        <button 
                            onClick={() => setTaskTypeFilter('Work Orders')}
                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${taskTypeFilter === 'Work Orders' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border'}`}
                        >
                            Work Orders ({myTasks.filter(t => t.status !== 'Completed').length})
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
                            <div className="space-y-3">
                                {myTasks.length > 0 ? myTasks.map(task => (
                                    <div key={task.id} className="p-4 bg-white border rounded-xl hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedTask(task)}>
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${task.priority === 'High' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {task.priority}
                                            </span>
                                            <span className="text-xs text-gray-400 font-mono">{fmtDate(task.dueDate)}</span>
                                        </div>
                                        <h4 className="font-bold text-gray-800 text-sm">{task.title}</h4>
                                        <p className="text-xs text-gray-600 mt-1">{task.property} • {task.tenant.name}</p>
                                        <div className="mt-3 flex justify-end">
                                            <button className="text-xs font-bold text-primary hover:underline">Update Status</button>
                                        </div>
                                    </div>
                                )) : (
                                    <p className="text-center text-gray-400 py-8 text-sm">No active tasks assigned.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {taskTypeFilter === 'Collections' && (
                        <div className="flex flex-col flex-grow overflow-hidden">
                            {/* Collection Search Bar */}
                            <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white">
                                <div className="relative w-full">
                                    <LucideIcons.Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={collectionSearchQuery}
                                        onChange={e => setCollectionSearchQuery(e.target.value)}
                                        placeholder="Search collections by tenant, property, or unit..."
                                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                    />
                                </div>
                            </div>

                            <div className="p-4 overflow-y-auto flex-grow space-y-6">
                                {collectionTasks.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400 bg-green-50 rounded-lg border border-green-100">
                                        <Icon name="check" className="w-12 h-12 text-green-300 mx-auto mb-2" />
                                        <p>No collection tasks! All assigned tenants are up to date.</p>
                                    </div>
                                ) : Object.keys(collectionsGroupedByProperty).length > 0 ? (
                                    Object.entries(collectionsGroupedByProperty).map(([propertyName, propertyTenants]) => (
                                        <div key={propertyName} className="space-y-3">
                                            <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                                                <LucideIcons.Building className="w-4 h-4 text-gray-500" />
                                                <h3 className="font-extrabold text-gray-700 text-xs tracking-wider uppercase">
                                                    {propertyName} ({propertyTenants.length})
                                                </h3>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {propertyTenants.map(tenant => {
                                                    const financial = tenantFinancials.get(tenant.id);
                                                    return (
                                                        <div key={tenant.id} className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div>
                                                                    <h4 className="font-bold text-gray-800">{tenant.name}</h4>
                                                                    <p className="text-xs text-gray-500">Unit: {tenant.unit}</p>
                                                                </div>
                                                                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase">Overdue</span>
                                                            </div>
                                                            <div className="bg-red-50 p-2 rounded text-red-800 font-extrabold text-lg mb-3 text-center">
                                                                KES {Number(financial?.arrearsBalance ?? 0).toLocaleString()}
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                                                                <div className="bg-gray-50 rounded p-2">
                                                                    <p className="text-[10px] uppercase font-bold text-gray-400">Days Late</p>
                                                                    <p className="font-bold text-gray-800 mt-1">{financial?.daysLateThisMonth ? `${financial.daysLateThisMonth} day${financial.daysLateThisMonth === 1 ? '' : 's'}` : '—'}</p>
                                                                </div>
                                                                <div className="bg-gray-50 rounded p-2">
                                                                    <p className="text-[10px] uppercase font-bold text-gray-400">Late Fee Due</p>
                                                                    <p className="font-bold text-orange-700 mt-1">KES {Number(financial?.lateFeeDue ?? 0).toLocaleString()}</p>
                                                                </div>
                                                            </div>
                                                            
                                                            {/* History Snippet */}
                                                            {tenant.collectionHistory && tenant.collectionHistory.length > 0 && (
                                                                <div className="mb-3 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                                                                    <p className="font-bold text-gray-400 uppercase text-[10px]">Last Interaction:</p>
                                                                    <p className="text-[11px] text-gray-800 mt-0.5 font-medium">"{tenant.collectionHistory[0].feedback}"</p>
                                                                    <p className="text-[9px] text-gray-400 mt-1">{tenant.collectionHistory[0].date.split(',')[0]} - {tenant.collectionHistory[0].outcome}</p>
                                                                </div>
                                                            )}

                                                            <div className="grid grid-cols-2 gap-2">
                                                                <a href={`tel:${tenant.phone}`} className="flex items-center justify-center py-2 border border-gray-300 rounded hover:bg-gray-50 font-bold text-xs text-gray-700 font-sans">
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
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-lg border border-gray-200 italic text-sm">
                                        No collection tasks matched your search query.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* LEGACY */}
                 </div>
            )}

            {/* Modals for Adding Entities */}
            {isReferModalOpen && (
                <ReferTenantModal
                    referrerId={agent?.id || ''}
                    referralCode={(agent as any)?.referralCode || `${String(agent?.name ?? 'AGENT').split(' ')[0].toUpperCase().slice(0, 4)}${String(agent?.id ?? '').slice(-4).toUpperCase()}`}
                    onClose={() => setIsReferModalOpen(false)}
                />
            )}
            {modalOpen === 'addTenant' && (
                <ApplicationFormModal 
                    onClose={() => setModalOpen('none')} 
                    onSave={handleRegisterTenant} 
                    properties={myProperties} 
                    record={{ recordType: 'Application', displayStatus: 'New', source: 'Agent' }}
                />
            )}
            {modalOpen === 'addLandlord' && (
                <NewApplicationModal 
                    onClose={() => setModalOpen('none')} 
                    onSave={handleRegisterLandlord} 
                />
            )}
            {modalOpen === 'addProperty' && (
                <div className="fixed inset-0 z-[1800] flex animate-fade-in">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalOpen('none')} />
                    <div className="relative ml-auto h-full w-full sm:w-[min(96vw,960px)] bg-gray-50 shadow-2xl overflow-y-auto animate-slide-in-right border-l-4 border-secondary">
                        <div className="sticky top-0 z-10 bg-white border-b border-secondary/30 px-5 py-4 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-secondary font-bold">Agent portal</p>
                                <h3 className="text-lg font-extrabold text-gray-900">Add Property</h3>
                            </div>
                            <button onClick={() => setModalOpen('none')} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Close add property drawer">
                                <LucideIcons.X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 sm:p-6 border-r border-secondary/20">
                            <PropertyForm
                                property={{ assignedAgentId: agent.id, branch: agent.branch, floors: 1 }}
                                onCancel={() => setModalOpen('none')}
                                onSave={handleAddProperty}
                                landlords={landlords}
                                staff={staff}
                            />
                        </div>
                    </div>
                </div>
            )}
            {selectedTask && <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={handleUpdateTask} />}
            {selectedCollectionTenant && (
                <CollectionManagerModal 
                    tenant={selectedCollectionTenant} 
                    onClose={() => setSelectedCollectionTenant(null)} 
                    onUpdateTenant={updateTenant} 
                    onSendMessage={addMessage} 
                />
            )}
            {selectedHouseStatusTenant && (
                <HouseStatusModal
                    tenant={selectedHouseStatusTenant}
                    onClose={() => setSelectedHouseStatusTenant(null)}
                    onSave={handleSaveHouseStatus}
                />
            )}

            {/* Earn-with-referrals fliers */}
            <ReferralFliers />
            <ReferralCalculator />

            {/* Advert Banners */}
            <AdBanners section="listings" />
        </div>
    );
};

export default AgentPortal;
