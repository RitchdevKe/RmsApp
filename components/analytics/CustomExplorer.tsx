
import React, { useState } from 'react';
import Icon from '../Icon';

const CustomExplorer: React.FC = () => {
    const [metric, setMetric] = useState('Revenue');
    const [dimension, setDimension] = useState('Time');

    return (
        <div className="space-y-8 pb-10">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Custom Explorer</h1>
                <p className="text-lg text-gray-500 mt-1">Slice and dice data to build your own views.</p>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-6">
                    <Icon name="analytics" className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Build Your Report</h2>
                <p className="text-gray-500 text-center max-w-md mb-8">
                    Select metrics and dimensions below to generate a custom visualization.
                </p>
                
                <div className="flex gap-4 mb-6">
                    <select value={metric} onChange={e => setMetric(e.target.value)} className="p-3 border rounded-lg bg-gray-50 font-bold text-gray-700">
                        <option>Revenue</option>
                        <option>Expenses</option>
                        <option>Occupancy</option>
                        <option>Arrears</option>
                    </select>
                    <span className="self-center text-gray-400">BY</span>
                    <select value={dimension} onChange={e => setDimension(e.target.value)} className="p-3 border rounded-lg bg-gray-50 font-bold text-gray-700">
                        <option>Time (Monthly)</option>
                        <option>Property</option>
                        <option>Staff Member</option>
                        <option>Branch</option>
                    </select>
                </div>

                <button className="px-8 py-3 bg-primary text-white font-bold rounded-xl shadow-lg hover:bg-primary-dark transition-transform active:scale-95">
                    Generate Chart
                </button>
            </div>
        </div>
    );
};

export default CustomExplorer;
