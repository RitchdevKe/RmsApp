
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';

type ViewLevel = 'County' | 'SubCounty' | 'Location' | 'Zone';

const GeospatialMapping: React.FC = () => {
    const { geospatialData, addGeospatialNode } = useData();
    
    const [activeCounty, setActiveCounty] = useState<string | null>(null);
    const [activeSubCounty, setActiveSubCounty] = useState<string | null>(null);
    const [activeLocation, setActiveLocation] = useState<string | null>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newNodeNames, setNewNodeNames] = useState('');
    const [modalLevel, setModalLevel] = useState<ViewLevel | null>(null);

    const counties = useMemo(() => Object.keys(geospatialData), [geospatialData]);
    
    const subCounties = useMemo(() => 
        activeCounty ? Object.keys(geospatialData[activeCounty] || {}) : []
    , [activeCounty, geospatialData]);

    const locations = useMemo(() => 
        activeCounty && activeSubCounty ? Object.keys(geospatialData[activeCounty][activeSubCounty] || {}) : []
    , [activeCounty, activeSubCounty, geospatialData]);

    const zones = useMemo(() => 
        activeCounty && activeSubCounty && activeLocation 
            ? Object.keys(geospatialData[activeCounty][activeSubCounty][activeLocation] || {}) 
            : []
    , [activeCounty, activeSubCounty, activeLocation, geospatialData]);

    const handleBack = () => {
        const isPartial = window.location.hash.startsWith('#/partial-rms');
        window.location.hash = isPartial ? '#/partial-rms/registration/overview' : '#/registration/overview';
    };

    const openAddModal = (level: ViewLevel) => {
        // Validation to ensure parent is selected
        if (level === 'SubCounty' && !activeCounty) return;
        if (level === 'Location' && (!activeCounty || !activeSubCounty)) return;
        if (level === 'Zone' && (!activeCounty || !activeSubCounty || !activeLocation)) return;

        setModalLevel(level);
        setNewNodeNames('');
        setIsModalOpen(true);
    };

    const handleAddRegion = () => {
        if (!modalLevel) return;

        const path = [];
        let parentLabel = 'Global Map';

        if (modalLevel === 'SubCounty') {
            path.push(activeCounty!);
            parentLabel = activeCounty!;
        }
        if (modalLevel === 'Location') {
            path.push(activeCounty!, activeSubCounty!);
            parentLabel = activeSubCounty!;
        }
        if (modalLevel === 'Zone') {
            path.push(activeCounty!, activeSubCounty!, activeLocation!);
            parentLabel = activeLocation!;
        }

        // Split input by commas or newlines to support bulk add
        const names = newNodeNames.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 0);

        names.forEach(name => {
            addGeospatialNode(modalLevel, path, name);
        });

        setNewNodeNames('');
        setIsModalOpen(false);
        setModalLevel(null);
    };

    const getParentLabelForModal = () => {
        if (modalLevel === 'SubCounty') return activeCounty;
        if (modalLevel === 'Location') return activeSubCounty;
        if (modalLevel === 'Zone') return activeLocation;
        return 'Global Map';
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Geospatial Mapping</h1>
                    <p className="text-lg text-gray-500 mt-1">Define hierarchical locations for properties and zones.</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row h-[600px] overflow-hidden">
                {/* Level 1: Counties */}
                <div className="w-full md:w-1/4 border-r border-gray-200 flex flex-col bg-gray-50">
                    <div className="p-3 border-b border-gray-200 bg-white flex justify-between items-center sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-700 text-sm">Counties</span>
                            <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded text-xs">{counties.length}</span>
                        </div>
                        <button onClick={() => openAddModal('County')} className="p-1.5 hover:bg-gray-100 rounded text-primary transition-colors" title="Add County">
                            <Icon name="plus" className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="overflow-y-auto flex-grow">
                        {counties.map(county => (
                            <button
                                key={county}
                                onClick={() => { setActiveCounty(county); setActiveSubCounty(null); setActiveLocation(null); }}
                                className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 hover:bg-white transition-colors flex justify-between items-center ${activeCounty === county ? 'bg-white text-primary font-bold border-l-4 border-l-primary' : 'text-gray-600'}`}
                            >
                                {county}
                                {activeCounty === county && <Icon name="chevron-down" className="w-4 h-4 -rotate-90" />}
                            </button>
                        ))}
                        {counties.length === 0 && <div className="p-4 text-gray-400 text-sm italic text-center">No Counties Added</div>}
                    </div>
                </div>

                {/* Level 2: Sub-Counties */}
                <div className="w-full md:w-1/4 border-r border-gray-200 flex flex-col">
                    <div className="p-3 border-b border-gray-200 bg-white flex justify-between items-center sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-700 text-sm">Sub-Counties</span>
                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{activeCounty ? subCounties.length : 0}</span>
                        </div>
                        <button 
                            onClick={() => openAddModal('SubCounty')} 
                            disabled={!activeCounty}
                            className="p-1.5 hover:bg-gray-100 rounded text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Add Sub-County"
                        >
                            <Icon name="plus" className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="overflow-y-auto flex-grow bg-white">
                        {activeCounty ? (
                            subCounties.length > 0 ? (
                                subCounties.map(sc => (
                                    <button
                                        key={sc}
                                        onClick={() => { setActiveSubCounty(sc); setActiveLocation(null); }}
                                        className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 hover:bg-gray-50 transition-colors flex justify-between items-center ${activeSubCounty === sc ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600'}`}
                                    >
                                        {sc}
                                        {activeSubCounty === sc && <Icon name="chevron-down" className="w-4 h-4 -rotate-90" />}
                                    </button>
                                ))
                            ) : (
                                <div className="p-8 text-center text-gray-400 text-sm">No Sub-Counties found.<br/>Click + to add.</div>
                            )
                        ) : (
                            <div className="p-8 text-center text-gray-400 text-sm">Select a County</div>
                        )}
                    </div>
                </div>

                {/* Level 3: Locations */}
                <div className="w-full md:w-1/4 border-r border-gray-200 flex flex-col bg-gray-50">
                    <div className="p-3 border-b border-gray-200 bg-white flex justify-between items-center sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-700 text-sm">Locations</span>
                            <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded text-xs">{activeSubCounty ? locations.length : 0}</span>
                        </div>
                        <button 
                            onClick={() => openAddModal('Location')} 
                            disabled={!activeSubCounty}
                            className="p-1.5 hover:bg-gray-100 rounded text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Add Location"
                        >
                            <Icon name="plus" className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="overflow-y-auto flex-grow">
                        {activeSubCounty ? (
                            locations.length > 0 ? (
                                locations.map(loc => (
                                    <button
                                        key={loc}
                                        onClick={() => setActiveLocation(loc)}
                                        className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 hover:bg-white transition-colors flex justify-between items-center ${activeLocation === loc ? 'bg-white text-primary font-semibold' : 'text-gray-600'}`}
                                    >
                                        {loc}
                                        {activeLocation === loc && <Icon name="chevron-down" className="w-4 h-4 -rotate-90" />}
                                    </button>
                                ))
                            ) : (
                                <div className="p-8 text-center text-gray-400 text-sm">No Locations found.<br/>Click + to add.</div>
                            )
                        ) : (
                            <div className="p-8 text-center text-gray-400 text-sm">Select a Sub-County</div>
                        )}
                    </div>
                </div>

                {/* Level 4: Zones / Villages */}
                <div className="w-full md:w-1/4 flex flex-col bg-white">
                    <div className="p-3 border-b border-gray-200 bg-white flex justify-between items-center sticky top-0 z-10">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-700 text-sm">Villages / Zones</span>
                            <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{activeLocation ? zones.length : 0}</span>
                        </div>
                        <button 
                            onClick={() => openAddModal('Zone')} 
                            disabled={!activeLocation}
                            className="p-1.5 hover:bg-gray-100 rounded text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Add Village/Zone"
                        >
                            <Icon name="plus" className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="overflow-y-auto flex-grow p-2">
                        {activeLocation ? (
                            zones.length > 0 ? (
                                <div className="space-y-2">
                                    {zones.map(zone => (
                                        <div key={zone} className="p-3 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow bg-gray-50">
                                            <p className="font-semibold text-gray-800 text-sm">{zone}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 text-center text-gray-500 text-sm italic">No zones defined.<br/>Click + to add.</div>
                            )
                        ) : (
                            <div className="p-8 text-center text-gray-400 text-sm">Select a Location</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add Region Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1300] p-4">
                    <div className="bg-white p-6 rounded-xl shadow-lg max-w-md w-full">
                        <h2 className="text-xl font-bold mb-2">Add {modalLevel === 'Zone' ? 'Village / Zone' : modalLevel}</h2>
                        <p className="text-gray-600 text-sm mb-4">
                            Adding to <span className="font-semibold text-primary"> {getParentLabelForModal()}</span>.
                        </p>
                        
                        <textarea 
                            autoFocus
                            value={newNodeNames}
                            onChange={(e) => setNewNodeNames(e.target.value)}
                            placeholder={`Enter names separated by commas or new lines\nExample:\nNorth ${modalLevel}\nSouth ${modalLevel}`}
                            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary outline-none mb-2 min-h-[150px]"
                        />
                        <p className="text-xs text-gray-500 mb-4">Tip: You can paste a list of names to add multiple items at once.</p>

                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Cancel</button>
                            <button 
                                onClick={handleAddRegion} 
                                disabled={!newNodeNames.trim()}
                                className="px-4 py-2 bg-primary text-white font-bold rounded hover:bg-primary-dark disabled:opacity-50"
                            >
                                Add Items
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GeospatialMapping;
