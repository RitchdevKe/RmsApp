
import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';

const Profile: React.FC = () => {
    const { systemSettings, updateSystemSettings } = useData();
    const [formData, setFormData] = useState({
        companyName: systemSettings.companyName || '',
        address: systemSettings.address || '',
        phone: systemSettings.phone || ''
    });
    
    // Sync state if context changes
    useEffect(() => {
        setFormData({
            companyName: systemSettings.companyName || '',
            address: systemSettings.address || '',
            phone: systemSettings.phone || ''
        });
    }, [systemSettings]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxWidth) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width = Math.round((width * maxHeight) / height);
                            height = maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL(file.type));
                };
                img.src = event.target?.result as string;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                // Increased resolution for logo
                const resizedLogo = await resizeImage(e.target.files[0], 500, 500); 
                updateSystemSettings({ logo: resizedLogo });
            } catch (error) {
                console.error("Error processing logo", error);
            }
        }
    };

    const handleSave = () => {
        updateSystemSettings(formData);
        alert("System settings updated.");
    };

    return (
        <div className="space-y-8 max-w-3xl mx-auto">
            <button onClick={() => window.location.hash = '#/dashboard'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Dashboard
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">System Profile</h1>
                <p className="text-lg text-gray-500 mt-1">Manage company branding and global settings.</p>
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm space-y-8 border border-gray-100">
                
                {/* Logo Section */}
                <div>
                    <h2 className="text-xl font-bold text-gray-800 border-b pb-2 mb-4">Company Branding</h2>
                    <div className="flex flex-col items-center sm:items-start gap-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Logo</label>
                        <div className="flex items-center gap-6">
                            <div className="w-32 h-32 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center relative overflow-hidden group">
                                {systemSettings.logo ? (
                                    <img src={systemSettings.logo} alt="Company Logo" className="w-full h-full object-contain p-2" />
                                ) : (
                                    <Icon name="branch" className="w-12 h-12 text-gray-400" />
                                )}
                                <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                    <span className="text-white text-xs font-bold">Change</span>
                                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                </label>
                            </div>
                            <div className="text-sm text-gray-500">
                                <p>Upload your official company logo.</p>
                                <p>Recommended size: 500x500px (PNG or JPG)</p>
                                <label className="mt-2 inline-block px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md font-medium text-xs cursor-pointer hover:bg-gray-50 shadow-sm transition-colors">
                                    Upload New Logo
                                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Info Section */}
                <div>
                    <h2 className="text-xl font-bold text-gray-800 border-b pb-2 mb-4">Company Details</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                            <input 
                                name="companyName"
                                value={formData.companyName} 
                                onChange={handleInputChange} 
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none transition-shadow"
                                placeholder="e.g. TaskMe Realty"
                            />
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Official Address</label>
                                <input 
                                    name="address"
                                    value={formData.address} 
                                    onChange={handleInputChange} 
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none transition-shadow"
                                    placeholder="e.g. 123 Property Lane, Nairobi"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                                <input 
                                    name="phone"
                                    value={formData.phone} 
                                    onChange={handleInputChange} 
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none transition-shadow"
                                    placeholder="e.g. +254 700 000 000"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button 
                        onClick={handleSave} 
                        className="px-6 py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-md transition-colors"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Profile;
