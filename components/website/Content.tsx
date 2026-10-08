
import React from 'react';

const WebsiteContent: React.FC = () => {
    return (
        <div className="space-y-6">
            <button onClick={() => window.location.hash = '#/dashboard'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Dashboard
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Website Content</h1>
                <p className="text-lg text-gray-500 mt-1">Manage your public-facing property portfolio.</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm text-center text-gray-500">
                CMS Editor Placeholder
            </div>
        </div>
    );
};

export default WebsiteContent;
