
import React, { useState, useMemo } from 'react';
import { useData } from '../../../context/DataContext';
import { Task, TaskStatus } from '../../../types';
import Icon from '../../Icon';

const QCModal: React.FC<{ task: Task; onClose: () => void; onDecision: (approved: boolean, notes: string) => void }> = ({ task, onClose, onDecision }) => {
    const [checklist, setChecklist] = useState({
        scopeMet: false,
        siteClean: false,
        functionalityTested: false,
        tenantSignoff: false
    });
    const [notes, setNotes] = useState('');

    const toggleCheck = (key: keyof typeof checklist) => {
        setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const isAllChecked = Object.values(checklist).every(Boolean);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1500] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">Quality Inspection</h2>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-200">
                    <h3 className="font-bold text-gray-800">{task.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                    <p className="text-xs text-gray-500 mt-2">Assigned to: <strong>{task.assignedTo}</strong></p>
                </div>

                <div className="space-y-3 mb-6">
                    <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <input type="checkbox" checked={checklist.scopeMet} onChange={() => toggleCheck('scopeMet')} className="h-5 w-5 text-primary rounded" />
                        <span className="ml-3 font-medium text-gray-700">Scope of Work Met</span>
                    </label>
                    <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <input type="checkbox" checked={checklist.siteClean} onChange={() => toggleCheck('siteClean')} className="h-5 w-5 text-primary rounded" />
                        <span className="ml-3 font-medium text-gray-700">Site Left Clean</span>
                    </label>
                    <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <input type="checkbox" checked={checklist.functionalityTested} onChange={() => toggleCheck('functionalityTested')} className="h-5 w-5 text-primary rounded" />
                        <span className="ml-3 font-medium text-gray-700">Functionality Verified</span>
                    </label>
                    <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <input type="checkbox" checked={checklist.tenantSignoff} onChange={() => toggleCheck('tenantSignoff')} className="h-5 w-5 text-primary rounded" />
                        <span className="ml-3 font-medium text-gray-700">Tenant Sign-off</span>
                    </label>
                </div>

                <textarea 
                    value={notes} 
                    onChange={e => setNotes(e.target.value)} 
                    className="w-full p-3 border rounded-lg mb-6" 
                    placeholder="Inspector notes..." 
                    rows={3}
                />

                <div className="flex gap-3">
                    <button 
                        onClick={() => onDecision(false, notes)} 
                        className="flex-1 py-3 bg-red-100 text-red-700 font-bold rounded-lg hover:bg-red-200 transition-colors"
                    >
                        Reject & Rework
                    </button>
                    <button 
                        onClick={() => onDecision(true, notes)} 
                        disabled={!isAllChecked}
                        className="flex-1 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
                    >
                        Pass & Close
                    </button>
                </div>
            </div>
        </div>
    );
};

const QualityControl: React.FC = () => {
    const { tasks, updateTask, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canEdit = isSuperAdmin || checkPermission('Maintenance', 'edit');
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);

    // Filter tasks pending review (Status = Completed but not Closed for example, or Pending)
    // Assuming 'Pending' status is used for "Review Needed" after completion in this workflow
    const pendingReviewTasks = useMemo(() => 
        tasks.filter(t => t.status === TaskStatus.Pending), 
    [tasks]);

    const handleDecision = (approved: boolean, notes: string) => {
        if (!canEdit) return alert('You do not have permission to perform QC decisions.');
        if (!selectedTask) return;
        
        if (approved) {
            updateTask(selectedTask.id, { 
                status: TaskStatus.Closed, 
                history: [...(selectedTask.history || []), { id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: `QC Passed: ${notes}` }] 
            });
            alert("Task Closed successfully.");
        } else {
            updateTask(selectedTask.id, { 
                status: TaskStatus.InProgress, // Rework
                history: [...(selectedTask.history || []), { id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: `QC Failed: ${notes}. Rework requested.` }] 
            });
            alert("Task flagged for rework.");
        }
        setSelectedTask(null);
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/field-operations/maintenance'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Maintenance
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Quality Control</h1>
                    <p className="text-lg text-gray-500 mt-1">Verify workmanship standards before final closure.</p>
                </div>
                <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg font-bold">
                    {pendingReviewTasks.length} Pending Review
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingReviewTasks.map(task => (
                    <div key={task.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                            <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Ready for Inspection</span>
                            <span className="text-xs text-gray-400 font-mono">{task.id}</span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">{task.title}</h3>
                        <p className="text-sm text-gray-500 mb-4 line-clamp-2">{task.description}</p>
                        
                        <div className="flex items-center text-xs text-gray-500 mb-4 bg-gray-50 p-2 rounded">
                            <Icon name="user-circle" className="w-4 h-4 mr-2" /> 
                            <span>Completed by: <strong>{task.assignedTo}</strong></span>
                        </div>

                        {task.completionAttachments && task.completionAttachments.length > 0 && (
                            <div className="flex gap-2 mb-4">
                                {task.completionAttachments.slice(0, 3).map((img, i) => (
                                    <img key={i} src={img} alt="Proof" className="w-12 h-12 rounded border object-cover" />
                                ))}
                            </div>
                        )}

                        <button 
                            onClick={() => setSelectedTask(task)}
                            className="w-full py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors shadow-sm"
                        >
                            Start Inspection
                        </button>
                    </div>
                ))}

                {pendingReviewTasks.length === 0 && (
                    <div className="col-span-full text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icon name="check" className="w-8 h-8" />
                        </div>
                        <h3 className="text-gray-800 font-bold text-lg">All Caught Up!</h3>
                        <p className="text-gray-500">No tasks currently waiting for quality review.</p>
                    </div>
                )}
            </div>

            {selectedTask && (
                <QCModal 
                    task={selectedTask} 
                    onClose={() => setSelectedTask(null)} 
                    onDecision={handleDecision} 
                />
            )}
        </div>
    );
};

export default QualityControl;
