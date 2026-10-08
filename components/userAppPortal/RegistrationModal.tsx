import React, { useState } from 'react';
import Icon from '../Icon';
import { useRegistration } from '../../hooks/useRegistration';

type RegistrationType = 'Landlord' | 'Investor' | 'Affiliate' | 'Contractor' | 'Fundi';

interface RegistrationModalProps {
    type: RegistrationType;
    onClose: () => void;
}

const RegistrationModal: React.FC<RegistrationModalProps> = ({ type, onClose }) => {
    const { registerLandlord, registerInvestor, registerContractor, registerFundi, registerAffiliate } = useRegistration();
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        idNumber: '',
        specialty: '', // For Contractor
        location: '',
        password: '' // In a real app
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            switch (type) {
                case 'Landlord':
                    registerLandlord({
                        name: formData.name,
                        email: formData.email,
                        phone: formData.phone,
                        location: formData.location
                    });
                    break;
                case 'Investor':
                    registerInvestor({
                        name: formData.name,
                        email: formData.email,
                        phone: formData.phone,
                        idNumber: formData.idNumber
                    });
                    break;
                case 'Affiliate':
                    registerAffiliate({
                        name: formData.name,
                        email: formData.email,
                        phone: formData.phone,
                        idNumber: formData.idNumber
                    });
                    break;
                case 'Contractor':
                    registerContractor({
                        name: formData.name,
                        email: formData.email,
                        phone: formData.phone,
                        specialty: formData.specialty,
                        location: formData.location
                    });
                    break;
                case 'Fundi':
                    registerFundi({
                        name: formData.name,
                        email: formData.email,
                        phone: formData.phone,
                        specialty: formData.specialty,
                        location: formData.location,
                    });
                    break;
            }
            setStep('success');
        } catch (error) {
            console.error("Registration failed", error);
            alert("Registration failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-gray-800">Join as {type}</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {step === 'form' ? (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
                                <input 
                                    required 
                                    value={formData.name} 
                                    onChange={e => setFormData({...formData, name: e.target.value})} 
                                    className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-primary/20" 
                                    placeholder="e.g. John Doe" 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Address</label>
                                <input 
                                    type="email" 
                                    required 
                                    value={formData.email} 
                                    onChange={e => setFormData({...formData, email: e.target.value})} 
                                    className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-primary/20" 
                                    placeholder="john@example.com" 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number</label>
                                <input 
                                    type="tel" 
                                    required 
                                    value={formData.phone} 
                                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                                    className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-primary/20" 
                                    placeholder="07..." 
                                />
                            </div>

                            {(type === 'Investor' || type === 'Affiliate') && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ID Number</label>
                                    <input 
                                        required 
                                        value={formData.idNumber} 
                                        onChange={e => setFormData({...formData, idNumber: e.target.value})} 
                                        className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-primary/20" 
                                        placeholder="ID Number" 
                                    />
                                </div>
                            )}

                            {(type === 'Contractor' || type === 'Fundi' || type === 'Landlord') && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Location / Base</label>
                                    <input 
                                        required 
                                        value={formData.location} 
                                        onChange={e => setFormData({...formData, location: e.target.value})} 
                                        className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-primary/20" 
                                        placeholder="e.g. Nairobi, Westlands" 
                                    />
                                </div>
                            )}

                            {(type === 'Contractor' || type === 'Fundi') && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Specialty</label>
                                    <select 
                                        value={formData.specialty} 
                                        onChange={e => setFormData({...formData, specialty: e.target.value})} 
                                        className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                                    >
                                        <option value="">Select Specialty</option>
                                        <option value="Plumbing">Plumbing</option>
                                        <option value="Electrical">Electrical</option>
                                        <option value="Painting">Painting</option>
                                        <option value="Carpentry">Carpentry</option>
                                        <option value="General">General Maintenance</option>
                                    </select>
                                </div>
                            )}

                            <div className="pt-4">
                                <button 
                                    type="submit" 
                                    disabled={loading}
                                    className="w-full py-3 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-primary-dark transition-transform active:scale-95 disabled:opacity-50"
                                >
                                    {loading ? 'Registering...' : `Register as ${type}`}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Icon name="check" className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Registration Successful!</h3>
                            <p className="text-gray-600 mb-6">
                                Welcome to TaskMe Realty. 
                                {type === 'Landlord' && " Our team will review your property details and contact you shortly."}
                                {type === 'Investor' && " You can now access the investor dashboard."}
                                {type === 'Affiliate' && " Start referring and earning today!"}
                                {type === 'Contractor' && " We will verify your details and notify you when approved."}
                                {type === 'Fundi' && " We will verify your details and add you to the Fundi Hub."}
                            </p>
                            <button onClick={onClose} className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-colors">
                                Close
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RegistrationModal;
