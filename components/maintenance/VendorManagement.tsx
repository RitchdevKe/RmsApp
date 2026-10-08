
import React, { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';

const VendorCard: React.FC<{ vendor: any; jobCount: number; earnings: number }> = ({ vendor, jobCount, earnings }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 overflow-hidden group">
        <div className="h-24 bg-gradient-to-r from-gray-800 to-gray-700 relative">
            <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm px-2 py-1 rounded text-white text-xs font-bold flex items-center">
                <span className="text-yellow-400 mr-1">★</span> {vendor.rating}
            </div>
        </div>
        <div className="px-6 relative">
            <div className="w-16 h-16 rounded-full bg-white border-4 border-white shadow-md absolute -top-8 flex items-center justify-center text-2xl font-bold text-gray-700">
                {vendor.name.charAt(0)}
            </div>
        </div>
        <div className="p-6 pt-10">
            <h3 className="font-bold text-lg text-gray-800 mb-1">{vendor.name}</h3>
            <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider mb-4">
                {vendor.specialty}
            </span>
            
            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                <div className="bg-gray-50 p-2 rounded text-center">
                    <p className="text-gray-500 text-xs uppercase font-bold">Jobs Done</p>
                    <p className="text-gray-800 font-bold text-lg">{jobCount}</p>
                </div>
                <div className="bg-gray-50 p-2 rounded text-center">
                    <p className="text-gray-500 text-xs uppercase font-bold">Earned</p>
                    <p className="text-green-600 font-bold text-lg">{(earnings/1000).toFixed(1)}k</p>
                </div>
            </div>

            <div className="flex gap-2">
                <button className="flex-1 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors">
                    View Profile
                </button>
                <button className="flex-1 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-dark rounded transition-colors">
                    Assign Task
                </button>
            </div>
        </div>
    </div>
);

const VendorManagement: React.FC = () => {
    const { vendors, tasks } = useData();

    // Calculate stats for each vendor
    const vendorStats = useMemo(() => {
        return vendors.map(v => {
            const vendorTasks = tasks.filter(t => t.assignedTo === v.name && (t.status === 'Completed' || t.status === 'Closed'));
            const earnings = vendorTasks.reduce((sum, t) => sum + ((t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0)), 0);
            return {
                ...v,
                completedJobs: vendorTasks.length,
                totalEarnings: earnings
            };
        });
    }, [vendors, tasks]);

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/field-operations/maintenance'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Maintenance
            </button>
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Vendor Directory</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage external contractors, track performance and spend.</p>
                </div>
                <button className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg shadow hover:bg-black flex items-center">
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Onboard Vendor
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {vendorStats.map(v => (
                    <VendorCard 
                        key={v.id} 
                        vendor={v} 
                        jobCount={v.completedJobs} 
                        earnings={v.totalEarnings} 
                    />
                ))}
                
                {/* Add New Card Placeholder */}
                <button
                    onClick={() => {
                        try {
                            window.location.hash = '#/registration/users?category=contractors';
                        } catch {
                            // No modal fallback defined here, keep button inert on failure.
                        }
                    }}
                    className="border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-primary hover:text-primary transition-all p-8 min-h-[300px]"
                >
                    <Icon name="plus" className="w-12 h-12 mb-4 opacity-50" />
                    <span className="font-bold">Add New Vendor</span>
                </button>
            </div>

            {vendorStats.length === 0 && (
                <div className="text-center py-12 bg-gray-50 rounded-xl">
                    <p className="text-gray-500">No vendors found. Start building your network.</p>
                </div>
            )}
        </div>
    );
};

export default VendorManagement;
