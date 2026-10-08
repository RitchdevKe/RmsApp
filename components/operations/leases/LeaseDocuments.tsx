
import React, { useMemo } from 'react';
import { useData } from '../../../context/DataContext';
import Icon from '../../Icon';

const LeaseDocuments: React.FC = () => {
    const { tenants } = useData();

    // Mock document structure based on tenants
    const documents = useMemo(() => {
        return tenants.map(t => ({
            id: `doc-${t.id}`,
            name: `Lease_${t.name.replace(/\s/g,'_')}_2025.pdf`,
            size: '2.4 MB',
            date: t.onboardingDate,
            tenant: t.name,
            unit: `${t.propertyName} - ${t.unit}`
        }));
    }, [tenants]);

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/general-operations/leases'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Lease Management
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Lease Documents</h1>
                <p className="text-lg text-gray-500 mt-1">Secure digital vault for tenancy contracts and addendums.</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {documents.map(doc => (
                        <div key={doc.id} className="p-4 border rounded-lg hover:shadow-md transition-all group cursor-pointer bg-gray-50 hover:bg-white border-gray-200">
                            <div className="flex justify-between items-start mb-3">
                                <Icon name="stack" className="w-8 h-8 text-red-500" />
                                <button className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600">
                                    <Icon name="download" className="w-4 h-4" />
                                </button>
                            </div>
                            <h4 className="font-bold text-sm text-gray-800 truncate" title={doc.name}>{doc.name}</h4>
                            <p className="text-xs text-gray-500 mt-1">{doc.tenant}</p>
                            <div className="flex justify-between items-center mt-3 text-[10px] text-gray-400">
                                <span>{doc.date}</span>
                                <span>{doc.size}</span>
                            </div>
                        </div>
                    ))}
                    {documents.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-400">No documents found.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LeaseDocuments;
