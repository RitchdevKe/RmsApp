import React from 'react';
import { createRoot } from 'react-dom/client';

const GlobalDialogModal = ({ type, title, message, onResolve }: any) => {
    return (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => onResolve(false)}>
            <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 mb-6">{message}</p>
                <div className="flex justify-end gap-3">
                    {type === 'confirm' && (
                        <button onClick={() => onResolve(false)} className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors">
                            Cancel
                        </button>
                    )}
                    <button onClick={() => onResolve(true)} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">
                        {type === 'confirm' ? 'Confirm' : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const safeAlert = (message: string, title = 'Notification'): Promise<boolean> => {
    return new Promise(resolve => {
        const div = document.createElement('div');
        document.body.appendChild(div);
        const root = createRoot(div);
        const handleResolve = (val: boolean) => {
            root.unmount();
            div.remove();
            resolve(val);
        };
        root.render(<GlobalDialogModal type="alert" title={title} message={message} onResolve={handleResolve} />);
    });
};

export const safeConfirm = (message: string, title = 'Please Confirm'): Promise<boolean> => {
    return new Promise(resolve => {
        const div = document.createElement('div');
        document.body.appendChild(div);
        const root = createRoot(div);
        const handleResolve = (val: boolean) => {
            root.unmount();
            div.remove();
            resolve(val);
        };
        root.render(<GlobalDialogModal type="confirm" title={title} message={message} onResolve={handleResolve} />);
    });
};
