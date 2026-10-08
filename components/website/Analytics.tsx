
import React from 'react';

const WebsiteAnalytics: React.FC = () => {
    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/website/content'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Website
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Website Analytics</h1>
                <p className="text-lg text-gray-500 mt-1">Traffic, engagement, and conversion insights.</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm text-center text-gray-500">
                Traffic Charts
            </div>
        </div>
    );
};

export default WebsiteAnalytics;
