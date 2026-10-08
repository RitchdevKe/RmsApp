
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { Message, StaffProfile } from '../../types';

const CaretakerScheduleModal: React.FC<{ caretaker: StaffProfile; onClose: () => void }> = ({ caretaker, onClose }) => {
    // Mock Schedule Data
    const schedule = [
        { day: 'Monday', shift: '08:00 - 17:00', task: 'General Maintenance', property: caretaker.branch },
        { day: 'Tuesday', shift: '08:00 - 17:00', task: 'Cleaning Supervision', property: caretaker.branch },
        { day: 'Wednesday', shift: '08:00 - 17:00', task: 'Tenant Requests', property: caretaker.branch },
        { day: 'Thursday', shift: '08:00 - 17:00', task: 'Inspections', property: caretaker.branch },
        { day: 'Friday', shift: '08:00 - 16:00', task: 'Reporting', property: caretaker.branch },
        { day: 'Saturday', shift: '09:00 - 13:00', task: 'On Call', property: caretaker.branch },
        { day: 'Sunday', shift: 'Off', task: '-', property: '-' },
    ];

    return (
        <div className="fixed inset-0 bg-black/50 z-[1500] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800">{caretaker.name}'s Schedule</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                
                <div className="space-y-2">
                    {schedule.map((slot, index) => (
                        <div key={index} className="flex justify-between items-center p-3 border-b last:border-0 hover:bg-gray-50">
                            <div>
                                <p className="font-bold text-sm text-gray-800">{slot.day}</p>
                                <p className="text-xs text-gray-500">{slot.property}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-medium text-gray-700">{slot.shift}</p>
                                <p className="text-xs text-blue-600">{slot.task}</p>
                            </div>
                        </div>
                    ))}
                </div>
                
                <div className="mt-6 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold">Close</button>
                </div>
            </div>
        </div>
    );
};

const MessageCaretakerModal: React.FC<{ caretaker: StaffProfile; onClose: () => void; onSend: (msg: string) => void }> = ({ caretaker, onClose, onSend }) => {
    const [message, setMessage] = useState('');

    const handleSubmit = () => {
        if (!message.trim()) return alert("Message cannot be empty.");
        onSend(message);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1500] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-800">Message {caretaker.name}</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                <textarea 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full p-3 border rounded-lg h-32 focus:ring-2 focus:ring-primary/20 outline-none"
                    placeholder="Type your message here..."
                    autoFocus
                />
                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-bold">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded-lg font-bold hover:bg-primary-dark">Send</button>
                </div>
            </div>
        </div>
    );
};

const Caretakers: React.FC = () => {
    const { staff, tasks, properties, addMessage, deleteStaff, checkPermission } = useData();
    const canDelete = checkPermission('Users', 'delete');

    // Modal State
    const [scheduleCaretaker, setScheduleCaretaker] = useState<StaffProfile | null>(null);
    const [messageCaretaker, setMessageCaretaker] = useState<StaffProfile | null>(null);

    const handleDeleteCaretaker = (caretaker: StaffProfile) => {
        if (!window.confirm(`Permanently delete ${caretaker.name}? This cannot be undone.`)) return;
        deleteStaff(caretaker.id);
    };

    const caretakers = useMemo(() => staff.filter(s => s.role === 'Caretaker'), [staff]);

    const getAssignedProperty = (caretaker: any) => {
        const activeTask = tasks.find(t => t.assignedTo === caretaker.name);
        if (activeTask) return activeTask.property;
        const prop = properties.find(p => p.branch === caretaker.branch);
        return prop ? prop.name : 'General Assignment';
    };

    const handleSendMessage = (text: string) => {
        if (messageCaretaker) {
             const msg: Message = {
                id: `msg-${Date.now()}`,
                recipient: { name: messageCaretaker.name, contact: messageCaretaker.phone },
                content: text,
                channel: 'App', // Internal
                status: 'Sent',
                timestamp: new Date().toLocaleString(),
                priority: 'Normal',
                isIncoming: false
            };
            addMessage(msg);
            alert(`Message sent to ${messageCaretaker.name}`);
            setMessageCaretaker(null);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Caretaker Oversight</h1>
                    <p className="text-lg text-gray-500 mt-1">Monitor on-site staff and building maintenance.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {caretakers.map(caretaker => {
                    const assignedProperty = getAssignedProperty(caretaker);
                    const caretakerTasks = tasks.filter(t => t.assignedTo === caretaker.name);
                    const openTasks = caretakerTasks.filter(t => t.status !== 'Completed' && t.status !== 'Closed').length;

                    const now = new Date();
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() - now.getDay());
                    weekStart.setHours(0, 0, 0, 0);
                    const weeklyTaskCount = caretakerTasks.filter(t => {
                        const due = t.dueDate ? new Date(t.dueDate) : null;
                        return due && due >= weekStart && due <= now;
                    }).length;

                    return (
                        <div key={caretaker.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                                {/* Profile */}
                                <div className="flex items-center gap-4 min-w-[200px]">
                                    <div className="h-14 w-14 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xl">
                                        {caretaker.avatar || caretaker.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-800 text-lg">{caretaker.name}</h3>
                                        <p className="text-sm text-gray-500">{caretaker.branch}</p>
                                        <p className="text-xs text-blue-600 font-medium mt-1 flex items-center">
                                            <Icon name="branch" className="w-3 h-3 mr-1" />
                                            {assignedProperty}
                                        </p>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="flex gap-8 text-center border-l pl-8 border-gray-100">
                                    <div>
                                        <p className="text-xs text-gray-400 uppercase font-bold">Open Tasks</p>
                                        <p className="text-2xl font-bold text-gray-800">{openTasks}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 uppercase font-bold">Reports (Wk)</p>
                                        <p className="text-2xl font-bold text-gray-800">{weeklyTaskCount}</p>
                                    </div>
                                </div>

                                {/* Recent Activity */}
                                <div className="flex-grow bg-gray-50 p-3 rounded-lg text-sm border border-gray-100 max-w-md">
                                    <p className="text-xs font-bold text-gray-500 uppercase mb-2">Recent Tasks</p>
                                    <div className="space-y-1">
                                        {caretakerTasks.slice(0, 2).map(t => (
                                            <div key={t.id} className="flex justify-between items-center text-xs bg-white p-1.5 rounded border border-gray-100">
                                                <span className="truncate w-40 font-medium">{t.title}</span>
                                                <span className={`px-1.5 py-0.5 rounded ${t.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {t.status}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    {caretakerTasks.length === 0 && <p className="text-gray-400 italic text-xs">No recent activity.</p>}
                                </div>
                                
                                <div className="flex flex-col gap-2">
                                     <button
                                        onClick={() => setScheduleCaretaker(caretaker)}
                                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded hover:bg-gray-50 transition-colors"
                                    >
                                        View Schedule
                                    </button>
                                     <button
                                        onClick={() => setMessageCaretaker(caretaker)}
                                        className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 transition-colors"
                                    >
                                        Message
                                    </button>
                                    {canDelete && (
                                        <button
                                            onClick={() => handleDeleteCaretaker(caretaker)}
                                            className="px-4 py-2 bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded hover:bg-red-100 transition-colors"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {caretakers.length === 0 && <div className="p-12 text-center bg-gray-50 rounded-xl text-gray-400">No caretakers registered.</div>}
            </div>

            {/* Modals */}
            {scheduleCaretaker && (
                <CaretakerScheduleModal 
                    caretaker={scheduleCaretaker} 
                    onClose={() => setScheduleCaretaker(null)} 
                />
            )}
            
            {messageCaretaker && (
                <MessageCaretakerModal 
                    caretaker={messageCaretaker} 
                    onClose={() => setMessageCaretaker(null)} 
                    onSend={handleSendMessage}
                />
            )}
        </div>
    );
};

export default Caretakers;
