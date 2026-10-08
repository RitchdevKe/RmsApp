
import React, { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { fmtDate } from '../../utils/date';
import Icon from '../Icon';

const Esignature: React.FC = () => {
    const { applications, tenants } = useData();

    // Mock e-signature data based on applications status
    const documents = useMemo(() => {
        const docs = [];
        
        // Approved applications usually need signatures
        applications.filter(a => a.status === 'Approved').forEach(a => {
            docs.push({
                id: `sign-${a.id}`,
                name: a.name,
                docName: 'Residential Lease Agreement',
                status: 'Sent',
                date: fmtDate(new Date()),
                email: a.email
            });
        });

        // New tenants might have pending signatures
        tenants.filter(t => new Date(t.onboardingDate) > new Date(new Date().setDate(new Date().getDate() - 7))).forEach(t => {
            docs.push({
                id: `sign-t-${t.id}`,
                name: t.name,
                docName: 'Move-in Inspection',
                status: 'Signed',
                date: t.onboardingDate,
                email: t.email
            });
        });

        return docs;
    }, [applications, tenants]);

    const getStatusStyle = (status: string) => {
        if (status === 'Signed') return 'bg-green-100 text-green-800';
        if (status === 'Viewed') return 'bg-blue-100 text-blue-800';
        return 'bg-yellow-100 text-yellow-800';
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/general-operations/leases'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Lease Management
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">E-Signature Tracking</h1>
                <p className="text-lg text-gray-500 mt-1">Monitor the status of sent lease agreements and addendums.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-yellow-500">
                    <p className="text-gray-500 text-xs font-bold uppercase">Pending Signature</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{documents.filter(d => d.status === 'Sent').length}</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500">
                    <p className="text-gray-500 text-xs font-bold uppercase">Completed (This Month)</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{documents.filter(d => d.status === 'Signed').length}</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <p className="text-gray-500 text-xs font-bold uppercase">Completion Rate</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">85%</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <h3 className="font-bold text-gray-800 mb-4">Document Pipeline</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3">Recipient</th>
                                <th className="px-6 py-3">Document</th>
                                <th className="px-6 py-3">Sent Date</th>
                                <th className="px-6 py-3 text-center">Status</th>
                                <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {documents.map(doc => (
                                <tr key={doc.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium">
                                        {doc.name}
                                        <div className="text-xs text-gray-400">{doc.email}</div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{doc.docName}</td>
                                    <td className="px-6 py-4 text-gray-600">{doc.date}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${getStatusStyle(doc.status)}`}>
                                            {doc.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {doc.status === 'Sent' && (
                                            <button className="text-blue-600 hover:underline font-bold text-xs">Remind</button>
                                        )}
                                        {doc.status === 'Signed' && (
                                            <button className="text-green-600 hover:underline font-bold text-xs flex items-center justify-end ml-auto">
                                                <Icon name="download" className="w-3 h-3 mr-1" /> Download
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {documents.length === 0 && (
                                <tr><td colSpan={5} className="p-8 text-center text-gray-400">No documents in pipeline.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Esignature;
