
import React from 'react';
import Icon from '../Icon';

const LeasesReporting: React.FC = () => {
    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/general-operations/leases'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Lease Management
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Lease Intelligence</h1>
                <p className="text-lg text-gray-500 mt-1">Analytics on retention, churn, and lease lifecycle.</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4">Retention Rate</h3>
                    <div className="flex items-center justify-center h-48 bg-gray-50 rounded-lg">
                        <span className="text-4xl font-bold text-green-600">94%</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4">Avg. Lease Duration</h3>
                    <div className="flex items-center justify-center h-48 bg-gray-50 rounded-lg">
                        <span className="text-4xl font-bold text-blue-600">14.2 Mo</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LeasesReporting;
