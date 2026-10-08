
import React, { useState } from 'react';
import Icon from '../Icon';

const PayRentModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [step, setStep] = useState<'input' | 'processing' | 'success'>('input');
    const [phone, setPhone] = useState('07XX XXX XXX');
    const [txCode, setTxCode] = useState('');
    const amountDue = 28000;

    const handlePay = () => {
        setStep('processing');
        setTimeout(() => {
            const randomCode = `LGR${Date.now().toString().slice(-10)}QT`;
            setTxCode(randomCode);
            setStep('success');
        }, 3000);
    };

    return (
        <div className="fixed inset-0 bg-gray-900/60 z-[1100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes bounce { 0%, 80%, 100% { transform: scale(0); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
                .mpesa-spinner { width: 60px; height: 60px; border: 5px solid rgba(31, 159, 33, 0.2); border-top: 5px solid #1F9F21; border-radius: 50%; margin: 0 auto 25px; animation: spin 1s linear infinite; }
                .loading-dot { display: inline-block; width: 8px; height: 8px; background-color: #1F9F21; border-radius: 50%; animation: bounce 1.4s ease-in-out infinite both; }
                .loading-dot:nth-child(1) { animation-delay: 0s; } .loading-dot:nth-child(2) { animation-delay: 0.2s; } .loading-dot:nth-child(3) { animation-delay: 0.4s; }
                .mpesa-btn { background: linear-gradient(to right, #1F9F21, #177D1A); box-shadow: 0 4px 15px rgba(31, 159, 33, 0.4); }
                .mpesa-btn:hover { box-shadow: 0 6px 20px rgba(31, 159, 33, 0.6); transform: translateY(-2px); }
            `}</style>
            
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[450px] overflow-hidden relative border border-[#e0f0e0]" onClick={e => e.stopPropagation()}>
                <div className="absolute top-5 right-5 font-extrabold text-2xl text-[#1F9F21] select-none">M<span className="text-[#177D1A]">p</span>esa</div>

                {step === 'input' && (
                    <div className="p-8">
                        <div className="flex items-center mb-6 pb-4 border-b-2 border-[#e8f5e9]">
                            <div className="w-[50px] h-[50px] bg-[#1F9F21] rounded-xl flex items-center justify-center mr-4 shadow-lg shadow-[#1F9F21]/30">
                                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 16V8C20.9998 6.89543 20.5611 5.8362 19.7804 5.05508C18.9997 4.27396 17.9408 3.83526 16.836 3.835H7.164C6.05925 3.83526 4.99999 4.27396 4.21922 5.05508C3.43845 5.8362 2.99975 6.89543 3 8V16C3.00026 17.1046 3.439 18.1641 4.22005 18.9453C5.00111 19.7266 6.06048 20.1654 7.165 20.166H16.836C17.9405 20.1654 19.0002 19.7266 19.7813 18.9453C20.5623 18.1641 21.001 17.1046 21 16Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M7.5 12H16.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M7.5 15H12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                            <h2 className="text-[22px] font-bold text-[#1a365d]">Pay Rent</h2>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className="block mb-2 font-semibold text-[#2d3748] text-[15px]">Mobile Number</label>
                                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3.5 border-2 border-[#c8e6c9] rounded-xl text-base focus:outline-none focus:border-[#1F9F21] focus:ring-4 focus:ring-[#1F9F21]/20 transition-all"/>
                            </div>
                            <div>
                                <label className="block mb-2 font-semibold text-[#2d3748] text-[15px]">Amount Due (KES)</label>
                                <div className="w-full p-3.5 border-2 border-[#c8e6c9] bg-gray-50 rounded-xl text-base font-bold text-[#1a365d]">{Number(amountDue ?? 0).toLocaleString()}</div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={onClose} className="flex-1 py-3.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                                <button onClick={handlePay} className="flex-[2] mpesa-btn text-white font-semibold rounded-xl transition-transform active:scale-95">Pay Now</button>
                            </div>
                        </div>
                    </div>
                )}

                {(step === 'processing' || step === 'success') && (
                    <div className="p-8">
                        <div className="flex items-center mb-6 pb-4 border-b-2 border-[#e8f5e9]">
                            <div className="w-[50px] h-[50px] bg-[#1F9F21] rounded-xl flex items-center justify-center mr-4 shadow-lg shadow-[#1F9F21]/30">
                                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 12L10.5 14.5L16 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                            <h2 className="text-[22px] font-bold text-[#1a365d]">Confirmation</h2>
                        </div>
                        <div className="text-center py-4">
                            {step === 'processing' && (
                                <div>
                                    <div className="mpesa-spinner"></div>
                                    <p className="text-xl font-semibold text-[#1a365d] mb-2">Processing Payment...</p>
                                    <p className="text-[#4a904a] font-medium text-base">Check your phone for STK prompt</p>
                                    <div className="flex justify-center gap-1.5 mt-4"><span className="loading-dot"></span><span className="loading-dot"></span><span className="loading-dot"></span></div>
                                </div>
                            )}
                            {step === 'success' && (
                                <div>
                                    <div className="bg-[#e8f5e9] border-l-4 border-[#1F9F21] p-5 rounded-r-xl mb-6 text-left border border-[#c8e6c9]">
                                        <p className="text-lg text-[#1b5e20] font-semibold">Payment of <span className="text-[#1F9F21] font-bold text-2xl ml-1">KES {Number(amountDue ?? 0).toLocaleString()}</span> confirmed!</p>
                                    </div>
                                    <div className="text-left">
                                        <p className="text-[#4caf50] font-medium mb-1">Time:</p>
                                        <p className="text-[#2d3748] font-medium mb-4">{new Date().toLocaleString()}</p>
                                        <div className="bg-[#f1fdf1] p-4 rounded-lg border border-dashed border-[#1F9F21] text-center shadow-inner">
                                            <span className="font-mono text-xl font-bold text-[#177D1A] tracking-widest">{txCode}</span>
                                        </div>
                                    </div>
                                    <button onClick={onClose} className="w-full mt-8 py-3.5 mpesa-btn text-white font-semibold rounded-xl shadow-lg transition-transform active:scale-95">Done</button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const TenantPortal: React.FC = () => {
    const [requestType, setRequestType] = useState<'Maintenance Request' | 'General Request'>('Maintenance Request');
    const [description, setDescription] = useState('');
    const [isPayRentModalOpen, setIsPayRentModalOpen] = useState(false);

    const handleSubmitRequest = () => {
        if (!description.trim()) {
            alert('Please enter a description for your request.');
            return;
        }
        const trackingId = `WRK-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
        alert(`Your ${requestType} has been submitted successfully!\n\nYour tracking ID is: ${trackingId}\n\nYou will receive updates via SMS.`);
        setDescription('');
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Tenant Portal (Simulation)</h1>
                <p className="text-lg text-gray-500 mt-1">This is how tenants view their information and interact with management.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="md:col-span-2 space-y-6">
                    {/* Quick Actions */}
                    <div className="bg-white p-6 rounded-xl shadow-sm">
                         <h3 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h3>
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <button className="p-4 bg-primary/10 rounded-lg text-primary font-semibold hover:bg-primary/20">View Lease</button>
                            <button onClick={() => setIsPayRentModalOpen(true)} className="p-4 bg-secondary/20 rounded-lg text-secondary-dark font-semibold hover:bg-secondary/30">Pay Rent</button>
                            <button onClick={() => alert("Opening due date change request form...")} className="p-4 bg-gray-100 rounded-lg text-gray-700 font-semibold hover:bg-gray-200">Request Due Date Change</button>
                         </div>
                    </div>

                    {/* New Request */}
                    <div className="bg-white p-6 rounded-xl shadow-sm">
                         <h3 className="text-xl font-semibold text-gray-800 mb-4">New Request</h3>
                         <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Request Type</label>
                                <select value={requestType} onChange={e => setRequestType(e.target.value as any)} className="w-full p-2 border rounded-md">
                                    <option>Maintenance Request</option>
                                    <option>General Request</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea 
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Describe your issue in detail..." 
                                    rows={4} 
                                    className="w-full p-2 border rounded-md"
                                ></textarea>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Upload Photos (optional)</label>
                                <input type="file" multiple className="w-full p-2 border rounded-md"/>
                            </div>
                            <button onClick={handleSubmitRequest} className="w-full px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark shadow-sm">Submit Request</button>
                         </div>
                    </div>
                </div>

                {/* Notifications */}
                <div className="md:col-span-1 bg-white p-6 rounded-xl shadow-sm">
                     <h3 className="text-xl font-semibold text-gray-800 mb-4">Notifications</h3>
                     <div className="space-y-4">
                        <div className="p-3 bg-red-50 rounded-lg">
                            <p className="font-semibold text-red-800 text-sm">Rent Overdue</p>
                            <p className="text-xs text-red-600">Your rent of KES 28,000 was due on Nov 1st.</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg">
                            <p className="font-semibold text-blue-800 text-sm">Community Notice</p>
                            <p className="text-xs text-blue-600">Water will be shut off for maintenance on Dec 5th.</p>
                        </div>
                     </div>
                </div>
            </div>
            {isPayRentModalOpen && <PayRentModal onClose={() => setIsPayRentModalOpen(false)} />}
        </div>
    );
};

export default TenantPortal;
