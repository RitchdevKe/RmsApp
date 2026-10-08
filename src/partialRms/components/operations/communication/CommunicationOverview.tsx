// @ts-nocheck

import React, { useMemo, useState } from 'react';
import { useData } from '../../../context/DataContext';
import { Message } from '@/types';
import Icon from '../../Icon';
import { communicationApi } from '@/utils/communicationApi';
import { ComposeModal, ComposeSendRequest } from './Messages';
import { MessageSquareQuote, Search, MessageSquareCode } from 'lucide-react';

const NavCard: React.FC<{ title: string; icon: string; description: string; link: string; color: string }> = ({ title, icon, description, link, color }) => (
    <div 
        onClick={() => window.location.hash = link}
        className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group flex flex-col items-center text-center hover:border-primary/50"
    >
        <div className={`p-4 rounded-full bg-opacity-10 mb-4 transition-transform group-hover:scale-110`} style={{ backgroundColor: `${color}15`, color: color }}>
            <Icon name={icon} className="w-8 h-8" />
        </div>
        <h3 className="font-bold text-gray-800 mb-2">{title}</h3>
        <p className="text-xs text-gray-500">{description}</p>
    </div>
);

const StatCard: React.FC<{ title: string; value: string | number; subtext: string; color: string; icon: string }> = ({ title, value, subtext, color, icon }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4`} style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className="text-2xl font-extrabold text-gray-800 mt-1">{value}</p>
                <p className="text-xs text-gray-400 mt-1">{subtext}</p>
            </div>
            <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const CommunicationOverview: React.FC = () => {
    const { 
        messages = [], 
        addMessage, 
        templates = [], 
        automationRules = [], 
        systemSettings, 
        tenants = [], 
        updateTenant, 
        tasks = [], 
        updateTask 
    } = useData() || {};
    const [isComposeOpen, setIsComposeOpen] = useState(false);
    
    // Tasks Feedback Sync State
    const [threadSearch, setThreadSearch] = useState('');
    const [selectedThread, setSelectedThread] = useState<any | null>(null);
    const [replyText, setReplyText] = useState('');

    // Stats Calculation
    const stats = useMemo(() => {
        const total = (messages || []).length;
        const inbound = (messages || []).filter(m => m && m.isIncoming).length;
        const outbound = (messages || []).filter(m => m && !m.isIncoming).length;
        // Mock success rate
        const successRate = 98; 

        return { total, inbound, outbound, successRate };
    }, [messages]);

    const activeRules = (automationRules || []).filter(r => r && r.enabled).length;

    // Derived unified task feedback threads (from Collection logs & Maintenance comments)
    const feedbackThreads = useMemo(() => {
        const threads: any[] = [];

        // 1. Rent Collection log feedbacks (tenant.collectionHistory)
        (tenants || []).forEach(tenant => {
            if (tenant && tenant.collectionHistory && tenant.collectionHistory.length > 0) {
                tenant.collectionHistory.forEach(log => {
                    if (log) {
                        threads.push({
                            id: `collection-${tenant.id}-${log.id}`,
                            type: 'Collection',
                            subject: `Rent Collection: ${tenant.name || 'Tenant'} (${tenant.unit || 'N/A'})`,
                            date: log.date || new Date().toLocaleString(),
                            latestFeedback: log.feedback || '',
                            loggedBy: log.loggedBy || 'Agent',
                            status: log.status || 'Initiated',
                            comments: log.comments || [],
                            tenantId: tenant.id,
                            logId: log.id
                        });
                    }
                });
            }
        });

        // 2. Maintenance task comments
        (tasks || []).forEach(task => {
            if (task && task.comments && task.comments.length > 0) {
                let mappedStatus: 'Initiated' | 'In Progress' | 'Completed' = 'Initiated';
                if (task.status === 'In Progress' || task.status === 'Escalated') {
                    mappedStatus = 'In Progress';
                } else if (task.status === 'Completed' || task.status === 'Closed') {
                    mappedStatus = 'Completed';
                }

                threads.push({
                    id: `maintenance-${task.id}`,
                    type: 'Maintenance',
                    subject: `Maintenance: ${task.title || 'Task'}`,
                    date: task.comments[0]?.date || task.dueDate || new Date().toLocaleString(),
                    latestFeedback: task.description || '',
                    loggedBy: task.assignedTo || 'Unassigned',
                    status: mappedStatus,
                    comments: task.comments || [],
                    taskId: task.id
                });
            }
        });

        // Sort descending by date safely
        return threads.sort((a, b) => {
            const timeA = a.date ? new Date(a.date).getTime() : 0;
            const timeB = b.date ? new Date(b.date).getTime() : 0;
            const validA = isNaN(timeA) ? 0 : timeA;
            const validB = isNaN(timeB) ? 0 : timeB;
            return validB - validA;
        });
    }, [tenants, tasks]);

    const feedbackMetrics = useMemo(() => {
        let initiated = 0;
        let inProgress = 0;
        let completed = 0;

        (feedbackThreads || []).forEach(t => {
            if (t) {
                if (t.status === 'Completed') completed++;
                else if (t.status === 'In Progress') inProgress++;
                else initiated++;
            }
        });

        return { initiated, inProgress, completed };
    }, [feedbackThreads]);

    const filteredThreads = useMemo(() => {
        const query = (threadSearch || '').trim().toLowerCase();
        if (!query) return feedbackThreads || [];
        return (feedbackThreads || []).filter(t => 
            t && (
                (t.subject || '').toLowerCase().includes(query) || 
                (t.latestFeedback || '').toLowerCase().includes(query) ||
                (t.loggedBy || '').toLowerCase().includes(query)
            )
        );
    }, [feedbackThreads, threadSearch]);

    // Handle Super Admin sends response
    const handleSendReply = () => {
        if (!replyText.trim() || !selectedThread) return;

        const newComment = {
            user: 'Super Admin',
            text: replyText.trim(),
            date: new Date().toLocaleString()
        };

        if (selectedThread.type === 'Collection') {
            const tenant = tenants.find(t => t.id === selectedThread.tenantId);
            if (tenant) {
                const updatedHistory = (tenant.collectionHistory || []).map(h => {
                    if (h.id === selectedThread.logId) {
                        return {
                            ...h,
                            comments: [...(h.comments || []), newComment]
                        };
                    }
                    return h;
                });
                updateTenant(selectedThread.tenantId, { collectionHistory: updatedHistory });
                
                // Locally sync current pane
                setSelectedThread(prev => ({
                    ...prev,
                    comments: [...prev.comments, newComment]
                }));
            }
        } else {
            const task = tasks.find(t => t.id === selectedThread.taskId);
            if (task) {
                const updatedComments = [...(task.comments || []), newComment];
                updateTask(selectedThread.taskId, { comments: updatedComments });

                // Locally sync current pane
                setSelectedThread(prev => ({
                    ...prev,
                    comments: [...prev.comments, newComment]
                }));
            }
        }

        setReplyText('');
    };

    // Handle status metric toggled (Two-Way Sync)
    const handleUpdateStatusMetric = (thread: any, newStatus: 'Initiated' | 'In Progress' | 'Completed') => {
        if (thread.type === 'Collection') {
            const tenant = tenants.find(t => t.id === thread.tenantId);
            if (tenant) {
                const updatedHistory = (tenant.collectionHistory || []).map(h => {
                    if (h.id === thread.logId) {
                        return {
                            ...h,
                            status: newStatus
                        };
                    }
                    return h;
                });
                updateTenant(thread.tenantId, { collectionHistory: updatedHistory });
                
                // Locally sync status
                setSelectedThread(prev => ({ ...prev, status: newStatus }));
            }
        } else {
            let taskStatusMap = 'Issued';
            if (newStatus === 'In Progress') taskStatusMap = 'In Progress';
            else if (newStatus === 'Completed') taskStatusMap = 'Completed';

            updateTask(thread.taskId, { status: taskStatusMap as any });
            
            // Locally sync status
            setSelectedThread(prev => ({ ...prev, status: newStatus }));
        }
    };

    const handleSendMessage = async ({ recipients, content, channel, isGroup = false, groupLabel }: ComposeSendRequest) => {
        if (recipients.length === 0) {
            alert('No recipients selected.');
            return;
        }

        if (isGroup && channel !== 'SMS') {
            alert('Bulk broadcasts are currently supported for SMS only.');
            return;
        }

        const results = [];
        for (const recipient of recipients) {
            let apiResult;

            if (channel === 'SMS') apiResult = await communicationApi.sendSMS(recipient.contact, content, 'TASK-ME', systemSettings?.bulkSmsEnabled);
            else if (channel === 'Email') apiResult = await communicationApi.sendEmail(recipient.contact, 'New Message', content, 'noreply@taskme.re');
            else if (channel === 'WhatsApp') apiResult = await communicationApi.sendWhatsApp(recipient.contact, content);
            else apiResult = await communicationApi.sendInApp(recipient.contact, content);

            results.push({ recipient, apiResult });
        }

        const successful = results.filter(result => result.apiResult.success);
        if (successful.length === 0) {
            alert(`Failed to send: ${results[0]?.apiResult.error || 'Unknown error'}`);
            return;
        }

        const newMessage: Message = {
            id: successful[0].apiResult.messageId || `msg-${Date.now()}`,
            recipient: isGroup
                ? { name: `Group: ${groupLabel || 'Broadcast'}`, contact: `${successful.length} Recipients` }
                : { name: successful[0].recipient.name, contact: successful[0].recipient.contact },
            content,
            channel: channel as any,
            status: successful.length === results.length ? 'Sent' : 'Pending',
            timestamp: new Date().toLocaleString(),
            priority: 'Normal',
            isIncoming: false
        };
        addMessage(newMessage);
        setIsComposeOpen(false);

        if (successful.length === results.length) {
            alert(`Message sent via ${channel} to ${isGroup ? `${successful.length} recipients` : newMessage.recipient.name}`);
        } else {
            alert(`Sent ${successful.length} of ${results.length} messages via ${channel}. ${results.length - successful.length} failed.`);
        }
    };

    const modules = [
        { title: "Inbound Messages", icon: "mail", description: "View incoming inquiries and replies.", link: "#/partial-rms/operations/communications/inbound", color: "#3b82f6" },
        { title: "Outbound Messages", icon: "communication", description: "Track sent messages and broadcasts.", link: "#/partial-rms/operations/communications/outbound", color: "#10b981" },
        { title: "Templates", icon: "stack", description: "Manage reusable message templates.", link: "#/partial-rms/operations/communications/templates", color: "#f59e0b" },
        { title: "Automation", icon: "settings", description: "Configure auto-replies and triggers.", link: "#/partial-rms/operations/communications/automation", color: "#8b5cf6" },
    ];

    return (
        <div className="space-y-8 pb-12">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Communication Center</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage all interactions with tenants, landlords, and staff.</p>
                </div>
                <button 
                    onClick={() => setIsComposeOpen(true)}
                    className="bg-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-primary-dark transition-transform active:scale-95 flex items-center"
                >
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Compose New
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Messages" value={stats.total} subtext="All time history" color="#6366f1" icon="communication" />
                <StatCard title="Inbound (Inbox)" value={stats.inbound} subtext="Received messages" color="#f59e0b" icon="mail" />
                <StatCard title="Outbound (Sent)" value={stats.outbound} subtext="Sent messages" color="#10b981" icon="communication" />
                <StatCard title="Active Automations" value={activeRules} subtext={`${automationRules.length} Total Rules`} color="#8b5cf6" icon="settings" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {modules.map((mod) => (
                    <NavCard key={mod.title} {...mod} />
                ))}
            </div>

            {/* TASKS Feedback Center Section */}
            <div id="tasks-feedback-card" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="p-2 bg-red-100 text-red-800 rounded-lg flex items-center justify-center">
                                <MessageSquareQuote className="w-5 h-5" />
                            </span>
                            <h2 className="text-xl font-bold text-gray-800">TASKS Feedback Sync Center</h2>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Two-way chat log with field agents regarding rent collections &amp; maintenance task feedback.
                        </p>
                    </div>
                    {/* Metrics counters */}
                    <div className="flex gap-4 text-xs font-bold text-gray-600">
                        <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-100">
                            Initiated: {feedbackMetrics.initiated}
                        </div>
                        <div className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg border border-amber-100">
                            On Progress: {feedbackMetrics.inProgress}
                        </div>
                        <div className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg border border-green-100">
                            Completed: {feedbackMetrics.completed}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[460px]">
                    {/* Left: Threads List (4 cols) */}
                    <div className="lg:col-span-4 border-r border-gray-100 flex flex-col max-h-[550px] overflow-y-auto">
                        <div className="p-3 border-b border-gray-100 bg-gray-50/30">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                                <input 
                                    type="text" 
                                    placeholder="Search feedback threads..." 
                                    value={threadSearch}
                                    onChange={e => setThreadSearch(e.target.value)}
                                    className="w-full text-xs pl-9 pr-3 py-2 border rounded-lg bg-white outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                />
                            </div>
                        </div>
                        <div className="flex-1 divide-y divide-gray-100">
                            {filteredThreads.length > 0 ? filteredThreads.map(t => {
                                const isSelected = selectedThread?.id === t.id;
                                return (
                                    <div 
                                        key={t.id} 
                                        onClick={() => setSelectedThread(t)}
                                        className={`p-4 cursor-pointer hover:bg-gray-50 transition-all text-left relative ${isSelected ? 'bg-primary/5 hover:bg-primary/10 border-l-4 border-primary' : ''}`}
                                    >
                                        <div className="flex justify-between items-start gap-2 mb-1">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                                                t.type === 'Collection' ? 'bg-indigo-150 text-indigo-800' : 'bg-amber-150 text-amber-800'
                                            }`}>
                                                {t.type === 'Collection' ? '💰 Collection' : '🔧 Maintenance'}
                                            </span>
                                            <span className="text-[10px] text-gray-400 font-mono font-medium">{t.date.split(',')[0]}</span>
                                        </div>
                                        <h4 className="font-bold text-gray-800 text-sm truncate">{t.subject}</h4>
                                        <p className="text-xs text-gray-500 line-clamp-2 mt-1 italic">
                                            "{t.latestFeedback}"
                                        </p>
                                        <div className="flex justify-between items-center mt-3 border-t border-gray-50 pt-2">
                                            <span className="text-[9px] text-gray-400 font-bold uppercase">AGENT: {t.loggedBy || 'Unknown'}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                                                t.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                                t.status === 'In Progress' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                                            }`}>{t.status}</span>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <p className="text-center text-gray-400 py-12 text-xs italic">No task feedbacks found.</p>
                            )}
                        </div>
                    </div>

                    {/* Right: Active Chat Area (8 cols) */}
                    <div className="lg:col-span-8 flex flex-col justify-between max-h-[550px] bg-gray-50/20">
                        {selectedThread ? (
                            <>
                                {/* Active Thread Header */}
                                <div className="p-4 border-b border-gray-100 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                                    <div>
                                        <h3 className="font-bold text-gray-800 text-base">{selectedThread.subject}</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Source: {selectedThread.type} Task feedback thread
                                        </p>
                                    </div>
                                    {/* Two-Way status sync toggles */}
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Metric Status:</span>
                                        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white shadow-3xs">
                                            {(['Initiated', 'In Progress', 'Completed'] as const).map(st => {
                                                const isActive = selectedThread.status === st;
                                                return (
                                                    <button
                                                        key={st}
                                                        onClick={() => handleUpdateStatusMetric(selectedThread, st)}
                                                        className={`px-2.5 py-1.5 text-[10px] font-bold transition-all ${
                                                            isActive 
                                                                ? st === 'Completed' ? 'bg-green-600 text-white' :
                                                                  st === 'In Progress' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
                                                                : 'text-gray-505 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {st}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Active Thread Messages Body */}
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {/* Initiation feedback block */}
                                    <div className="flex justify-start">
                                        <div className="bg-white border border-gray-200 rounded-xl p-3.5 max-w-[85%] shadow-sm relative">
                                            <div className="flex justify-between items-center gap-4 mb-2 text-[9px] text-gray-400 font-extrabold border-b pb-1">
                                                <span>INITIATED FEEDBACK LOG BY {selectedThread.loggedBy?.toUpperCase()}</span>
                                                <span className="font-mono">{selectedThread.date}</span>
                                            </div>
                                            <p className="text-xs text-gray-700 italic pr-2">"{selectedThread.latestFeedback}"</p>
                                        </div>
                                    </div>

                                    {/* Comments thread list */}
                                    {selectedThread.comments.map((comment: any, idx: number) => {
                                        const isAdmin = comment.user === 'Super Admin' || comment.user === 'System Admin' || comment.user === 'Admin';
                                        return (
                                            <div key={idx} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`rounded-xl p-3 max-w-[85%] shadow-sm ${
                                                    isAdmin 
                                                        ? 'bg-blue-600 text-white border-b-2 border-blue-700' 
                                                        : 'bg-white text-gray-800 border border-indigo-100'
                                                }`}>
                                                    <div className="flex justify-between items-center gap-4 mb-1.5 text-[9px] font-extrabold uppercase opacity-80">
                                                        <span>{comment.user}</span>
                                                        <span className="font-mono font-medium">{comment.date}</span>
                                                    </div>
                                                    <p className="text-xs leading-relaxed">{comment.text}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Active Thread Reply input */}
                                <div className="p-3 bg-white border-t border-gray-100 flex gap-2">
                                    <input
                                        type="text"
                                        value={replyText}
                                        onChange={e => setReplyText(e.target.value)}
                                        placeholder="Type administrative reply log to agent..."
                                        className="flex-1 px-3 py-2 text-xs border rounded-xl outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleSendReply();
                                            }
                                        }}
                                    />
                                    <button 
                                        onClick={handleSendReply}
                                        className="bg-primary hover:bg-primary-dark text-white px-5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center justify-center shadow-md active:scale-95"
                                    >
                                        Reply
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400">
                                <MessageSquareCode className="w-12 h-12 text-gray-300 mb-3" />
                                <h3 className="font-bold text-gray-600 text-sm">No Feedback Selected</h3>
                                <p className="text-xs text-gray-400 mt-1 max-w-xs">
                                    Click any collection or maintenance log from the sidebar to view chat replies and sync task metrics with agents.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isComposeOpen && <ComposeModal onClose={() => setIsComposeOpen(false)} onSend={handleSendMessage} />}
        </div>
    );
};

export default CommunicationOverview;
