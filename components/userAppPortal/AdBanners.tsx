import React, { useState } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { generateUnitReferralCode, generateUserReferralCode } from '../../utils/referralCode';
import { websiteLinks } from '../../utils/websiteLinks';
import ReferAnyoneModal, { ReferKind } from './ReferAnyoneModal';

const AdBanners: React.FC<{ section?: 'all' | 'services' | 'listings' }> = ({ section = 'all' }) => {
    const { currentUser, marketplaceListings, funds, marketingBanners } = useData();
    const [customContact, setCustomContact] = useState(currentUser?.phone || '');
    const [search, setSearch] = useState('');
    const [referModal, setReferModal] = useState<null | ReferKind>(null);
    
    const referralCode = currentUser
        ? ((currentUser as any).referralCode || generateUserReferralCode(currentUser.name || '', currentUser.id))
        : null;
    const userId = currentUser?.id || '';

    const buildRentShareLink = (listing: any) => {
        const unitRefCode = currentUser?.id && currentUser?.name
            ? generateUnitReferralCode(currentUser.name, listing.unitNumber, currentUser.id)
            : referralCode;
        const propertyIdentifier = listing.propertyId || listing.propertyName || listing.title || '';
        return websiteLinks.property(propertyIdentifier, unitRefCode, listing.unitNumber);
    };

    const buildTemplateShareLink = (template: any) => {
        if (template.type === 'Investment') return websiteLinks.invest(referralCode);
        if (referralCode) return websiteLinks.referral(referralCode);
        return websiteLinks.base;
    };

    // TaskMe Professional Services with 10% commission.
    const services = [
        {
            id: 'svc-security',
            kind: 'security' as ReferKind,
            title: 'TaskMe Security',
            subtitle: 'Professional, highly trained home/office guards, bodyguards, bouncers, and VIP protection personnel.',
            price: 'Earn 10% commission of the security contract value',
            image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80',
            type: 'Security Services',
            shareLink: referralCode ? websiteLinks.referral(referralCode) : websiteLinks.base,
            bullets: [
                'Home & Office Guard Solutions',
                'VIP Escorts & Executive Bodyguards',
                'Crowd Management & Event Bouncers',
            ]
        },
        {
            id: 'svc-cleaning',
            kind: 'cleaning' as ReferKind,
            title: 'TaskMe Cleaning',
            subtitle: 'Sparkling house cleaning, commercial offices, corporate contracts, and post-construction sanitization.',
            price: 'Earn 10% commission of the cleaning service contract',
            image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=80',
            type: 'Cleaning Services',
            shareLink: referralCode ? websiteLinks.referral(referralCode) : websiteLinks.base,
            bullets: [
                'Residential & Deep Home Cleaning',
                'Office & Commercial Maintenance',
                'Government & Corporate Contracts',
            ]
        },
        {
            id: 'svc-maintenance',
            kind: 'maintenance' as ReferKind,
            title: 'TaskMe Interiors & Maintenance',
            subtitle: 'Comprehensive residential and commercial house maintenance, creative renovations, and beautiful interior styling.',
            price: 'Earn 10% commission of the maintenance contract value',
            image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
            type: 'Maintenance & Renovations',
            shareLink: referralCode ? websiteLinks.referral(referralCode) : websiteLinks.base,
            bullets: [
                'Plumbing, Electrical & Masonry repairs',
                'Full-Scale Interior Design & Fitouts',
                'Residential & Commercial Renovations',
            ]
        },
    ];

    const banners = (() => {
        const fallbackRentImg =
            'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80';
        const fallbackInvImg =
            'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80';

        // 1) For Rent: use live marketplace listings (auto-synced from vacant units in DataContext).
        const rent = (marketplaceListings || [])
            .filter(l => l.type === 'Rent' && l.status === 'Published')
            .map(l => {
                const unitType = (l.rentConfig as any)?.unitType;
                
                let title = l.title || `${l.propertyName} - ${l.unitNumber}`;
                if (unitType) {
                    title += ` (${unitType})`;
                }
                
                // Deposit is shown in the price line only — keep it out of the description.
                const subtitle = l.description || l.location || '';


                let priceStr = `Rent: KES ${Number(l.price ?? 0).toLocaleString()}`;
                if (l.rentConfig?.depositAmount) {
                    priceStr += ` | Deposit: KES ${Number(l.rentConfig.depositAmount).toLocaleString()}`;
                }
                const ut = l.rentConfig?.unitType;
                return {
                    id: `rent-${l.id}`,
                    title: ut ? `${title} - ${ut}` : title,
                    subtitle: subtitle,
                    price: priceStr,
                    image: (l.images && l.images.length > 0 ? l.images[0] : null) || fallbackRentImg,
                    type: 'For Rent',
                    shareLink: buildRentShareLink(l),
                };
            });

        // 2) Investment: use live active funds from R-REITs.
        const investment = (funds || [])
            .filter(f => f.status === 'Active' || f.status === 'Closing Soon')
            .map(f => ({
                id: `fund-${f.id}`,
                title: f.name,
                subtitle: f.description || `Risk: ${f.riskProfile}`,
                price: `Target APY: ${f.targetApy}`,
                image: f.projectPic || fallbackInvImg,
                type: 'Investment',
                shareLink: websiteLinks.invest(referralCode),
            }));

        // 3) Fallback: real uploaded marketing creatives (if no listings/funds yet).
        const templates = (marketingBanners || [])
            .slice(0, 2)
            .map(t => ({
                id: `tpl-${t.id}`,
                title: t.title,
                subtitle: t.description || '',
                price: t.type === 'Rent' ? 'For Rent' : t.type === 'Investment' ? 'Investment' : t.type,
                image: t.imageUrl || (t.type === 'Investment' ? fallbackInvImg : fallbackRentImg),
                type: t.type === 'Investment' ? 'Investment' : 'For Rent',
                shareLink: buildTemplateShareLink(t),
            }));

        const combined = [...rent, ...investment];
        if (combined.length > 0) return combined;
        return templates;
    })();

    const filteredBanners = banners.filter(b => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
            (b.title || '').toLowerCase().includes(q) ||
            (b.subtitle || '').toLowerCase().includes(q) ||
            (b.type || '').toLowerCase().includes(q) ||
            (b.price || '').toLowerCase().includes(q)
        );
    });

    const buildShareText = (banner: any) => {
        const contact = customContact.trim() ? customContact.trim() : 'Contact Office';
        const base = `${banner.type}: ${banner.title}\n${banner.subtitle}\n${banner.price}`;
        const linkLine = banner.shareLink ? `\n\nLink: ${banner.shareLink}` : '';
        return `${base}\n\nContact: ${contact}${linkLine}`;
    };

    const handleWhatsAppShare = (banner: any) => {
        const text = buildShareText(banner);
        const link = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(link, '_blank', 'noopener,noreferrer');
    };

    const handleCopyLink = async (url: string) => {
        const safe = String(url ?? '').trim();
        if (!safe) return alert('No link available for this opportunity.');
        try {
            await navigator.clipboard.writeText(safe);
            alert('Link copied to clipboard.');
        } catch {
            window.prompt('Copy this link:', safe);
        }
    };

    return (
        <div className={section === 'services' ? '' : 'mt-12 pt-8 border-t border-gray-200'}>
            {/* 1) Dedicated beautiful TaskMe Services Banners Section */}
            {section !== 'listings' && (
            <div className={section === 'services' ? '' : 'mb-12'}>
                <div className="mb-6">

                    <h3 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                        <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">🚀</span>
                        TaskMe Professional Services Referrals
                    </h3>
                    <p className="text-gray-500 text-sm mt-1">
                        Recommend TaskMe Professional services to your network and earn <span className="font-bold text-indigo-600">10% referral commission</span> on the value of every gig!
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {services.map((svc) => (
                        <div key={svc.id} className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100 hover:shadow-xl transition-all duration-300 group flex flex-col justify-between">
                            <div className="relative h-44 overflow-hidden">
                                <img src={svc.image} alt={svc.title} className="w-full h-full object-cover transform transition-transform duration-500 group-hover:scale-105" />
                                <div className="absolute top-4 left-4 bg-indigo-600/95 backdrop-blur-sm text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow">
                                    10% Earnings
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"></div>
                                <div className="absolute bottom-4 left-4 right-4 text-white">
                                    <h4 className="text-lg font-black tracking-tight">{svc.title}</h4>
                                    <p className="text-white/80 text-xs line-clamp-2 mt-1">{svc.subtitle}</p>
                                </div>
                            </div>

                            <div className="p-5 flex-1 flex flex-col justify-between bg-gray-50/50">
                                <div className="mb-5">
                                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest block mb-2">Service Highlights</span>
                                    <ul className="space-y-1.5">
                                        {svc.bullets.map((bullet, idx) => (
                                            <li key={idx} className="text-xs text-gray-600 flex items-start gap-1.5 leading-tight">
                                                <span className="text-indigo-500 font-bold shrink-0">✓</span>
                                                <span>{bullet}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="space-y-2">
                                    <button
                                        type="button"
                                        onClick={() => setReferModal(svc.kind)}
                                        className="w-full py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-xs font-black shadow-sm flex items-center justify-center gap-1.5"
                                    >
                                        <Icon name="add" className="w-4 h-4" /> Refer Client Now
                                    </button>
                                    
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleWhatsAppShare(svc)}
                                            className="py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-[10px] font-bold flex items-center justify-center gap-1"
                                        >
                                            <Icon name="communication" className="w-3.5 h-3.5" /> WhatsApp
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleCopyLink(svc.shareLink)}
                                            className="py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-[10px] font-bold flex items-center justify-center gap-1"
                                        >
                                            <Icon name="copy" className="w-3.5 h-3.5" /> Copy Link
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            )}

            {/* 2) Featured Properties & Investment Opportunities Section */}
            {section !== 'services' && (
            <div className={section === 'listings' ? '' : 'border-t border-gray-200 pt-8'}>

                <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">🏢</span>
                            Featured Properties & Investments
                        </h3>
                        <p className="text-gray-500 text-sm">Share these live opportunities with your network and earn commissions.</p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto">
                        <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm w-full sm:w-auto">
                            <Icon name="search" className="w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search opportunities..."
                                className="border-none outline-none text-sm font-medium text-gray-800 w-full sm:w-48 bg-transparent"
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm w-full sm:w-auto">
                            <span className="text-xs font-bold text-gray-500 uppercase">Contact Info:</span>
                            <input 
                                type="text" 
                                value={customContact}
                                onChange={(e) => setCustomContact(e.target.value)}
                                placeholder="Your phone number..."
                                className="border-none outline-none text-sm font-medium text-gray-800 w-full sm:w-32 bg-transparent"
                            />
                            <Icon name="settings" className="w-4 h-4 text-gray-400" />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredBanners.length === 0 && (
                        <div className="col-span-full text-sm text-gray-500 bg-white border border-dashed border-gray-200 rounded-xl p-6 text-center">
                            No property or investment opportunities match your search.
                        </div>
                    )}
                    {filteredBanners.map(banner => (
                        <div key={banner.id} className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 hover:shadow-lg transition-shadow group relative">
                            <div className="h-48 relative">
                                <img src={banner.image} alt={banner.title} className="w-full h-full object-cover" />
                                <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-bold uppercase">
                                    {banner.type}
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                                <div className="absolute bottom-4 left-4 right-4 text-white">
                                    <h4 className="text-xl font-bold">{banner.title}</h4>
                                    <p className="text-white/80 text-sm">{banner.subtitle}</p>
                                </div>
                            </div>
                            
                            <div className="p-4 flex flex-col gap-2 justify-between items-stretch bg-gray-50">
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-bold">Price / Return</p>
                                    <p className="text-lg font-bold text-indigo-600">{banner.price}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleWhatsAppShare(banner)}
                                        className="flex-1 flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-bold shadow-sm"
                                    >
                                        <Icon name="communication" className="w-4 h-4 mr-2" /> WhatsApp
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyLink(banner.shareLink)}
                                        className="flex items-center justify-center px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-bold shadow-sm"
                                    >
                                        <Icon name="copy" className="w-4 h-4 mr-2" /> Copy Link
                                    </button>
                                </div>
                            </div>
                            
                            {customContact && (
                                <div className="absolute bottom-20 right-4 bg-white/90 backdrop-blur text-gray-800 text-[10px] px-2 py-1 rounded shadow border border-gray-200">
                                    Contact: {customContact}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            )}



            {referModal && (
                <ReferAnyoneModal
                    referrerId={userId}
                    referralCode={referralCode || ''}
                    initialKind={referModal}
                    onClose={() => setReferModal(null)}
                />
            )}
        </div>
    );
};

export default AdBanners;
