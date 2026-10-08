
import React from 'react';

const SEO: React.FC = () => {
    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/website/content'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Website
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">SEO Management</h1>
                <p className="text-lg text-gray-500 mt-1">Optimize search ranking and social appearance.</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm text-center text-gray-500">
                SEO Tools
            </div>
        </div>
    );
};

export default SEO;
