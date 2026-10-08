
import React from 'react';
import Icon from '../Icon';

// Major Cards Style
const MAJOR_CARD_CLASSES = "relative bg-white rounded-2xl border-t-[8px] border-t-primary border-b-[4px] border-b-secondary border-x-[3px] border-x-secondary shadow-[inset_0_0_60px_-15px_rgba(157,31,21,0.15)] hover:shadow-lg transition-all duration-300 overflow-hidden";

const RegistrationCard: React.FC<{ 
    title: string; 
    description: string; 
    icon: string; 
    link: string; 
    color: string;
}> = ({ title, description, icon, link, color }) => (
    <div 
        onClick={() => window.location.hash = link}
        className={`${MAJOR_CARD_CLASSES} p-6 cursor-pointer flex flex-col group h-full`}
    >
        <div className="relative z-10 flex flex-col h-full">
            <div className={`p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4 transition-colors bg-opacity-10`} style={{ backgroundColor: `${color}15` }}>
                <Icon name={icon} className="w-8 h-8" style={{ color: color }} />
            </div>
            <h3 className="text-xl font-bold text-gray-800 group-hover:text-primary transition-colors">{title}</h3>
            <p className="text-gray-500 mt-2 flex-grow">{description}</p>
            <div className="mt-4 flex items-center text-sm font-bold pt-4 border-t border-gray-100" style={{ color: color }}>
                Manage <Icon name="chevron-down" className="w-4 h-4 ml-1 -rotate-90" />
            </div>
        </div>
    </div>
);

const RegistrationOverview: React.FC = () => {
    const modules = [
        {
            title: "User Management",
            description: "Onboard new staff, landlords, tenants, and system administrators. Manage roles and access.",
            icon: "system-user",
            link: "#/registration/users",
            color: "#3b82f6" // Blue
        },
        {
            title: "Payment Setup",
            description: "Configure M-Pesa Paybills, Till Numbers, Bank Accounts, and Payment Gateways.",
            icon: "wallet",
            link: "#/registration/payment-setup",
            color: "#10b981" // Green
        },
        {
            title: "Commission Structure",
            description: "Define commission rates for agents, referrals, and property management fees.",
            icon: "revenue",
            link: "#/registration/commissions",
            color: "#f59e0b" // Orange
        },
        {
            title: "Geospatial Mapping",
            description: "Map out Counties, Sub-Counties, Locations, and Zones for your property portfolio.",
            icon: "branch",
            link: "#/registration/geospatial-mapping",
            color: "#8b5cf6" // Purple
        }
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Registration & Configuration</h1>
                <p className="text-lg text-gray-500 mt-1">Setup and manage core system entities and rules.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {modules.map((mod, index) => (
                    <RegistrationCard key={index} {...mod} />
                ))}
            </div>
        </div>
    );
};

export default RegistrationOverview;
