import React, { useEffect, useRef, useState, useCallback } from 'react';
import Icon from '../Icon';

interface LiveCameraCaptureProps {
    title: string;
    onCapture: (file: File) => void | Promise<void>;
    onClose: () => void;
    /** 'environment' (rear) or 'user' (front). Defaults to environment for ID/document capture. */
    facingMode?: 'environment' | 'user';
}

/**
 * Modal that opens the device camera (via getUserMedia) and lets the user snap a live photo.
 * Works on desktop webcams and mobile (rear/front camera). Emits a JPEG File via onCapture.
 */
const LiveCameraCapture: React.FC<LiveCameraCaptureProps> = ({ title, onCapture, onClose, facingMode = 'environment' }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [currentFacing, setCurrentFacing] = useState<'environment' | 'user'>(facingMode);
    const [busy, setBusy] = useState(false);

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    }, []);

    const startStream = useCallback(async (facing: 'environment' | 'user') => {
        setError(null);
        setReady(false);
        stopStream();
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('Camera API is not available in this browser.');
            }
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => {});
                setReady(true);
            }
        } catch (err: any) {
            console.warn('Camera error', err);
            setError(err?.message || 'Could not access camera. Please allow camera permission and try again.');
        }
    }, [stopStream]);

    useEffect(() => {
        startStream(currentFacing);
        return () => stopStream();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentFacing]);

    const handleCapture = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        setPreview(dataUrl);
    };

    const handleRetake = () => {
        setPreview(null);
    };

    const handleConfirm = async () => {
        if (!canvasRef.current || !preview) return;
        setBusy(true);
        try {
            const blob: Blob | null = await new Promise(resolve =>
                canvasRef.current!.toBlob(b => resolve(b), 'image/jpeg', 0.92)
            );
            if (!blob) throw new Error('Failed to create image.');
            const fileName = `live-${Date.now()}.jpg`;
            const file = new File([blob], fileName, { type: 'image/jpeg' });
            await onCapture(file);
            stopStream();
            onClose();
        } catch (err: any) {
            console.warn('Capture confirm failed', err);
            setError(err?.message || 'Failed to use captured photo.');
            setBusy(false);
        }
    };

    const handleFlip = () => {
        setCurrentFacing(prev => (prev === 'environment' ? 'user' : 'environment'));
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => { if (!busy) { stopStream(); onClose(); } }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center px-4 py-3 border-b">
                    <div className="flex items-center gap-2">
                        <Icon name="task-request" className="w-5 h-5 text-primary" />
                        <h3 className="font-bold text-gray-800 text-sm">Live Capture — {title}</h3>
                    </div>
                    <button
                        type="button"
                        onClick={() => { if (!busy) { stopStream(); onClose(); } }}
                        className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                        aria-label="Close"
                    >
                        &times;
                    </button>
                </div>

                <div className="bg-black relative" style={{ aspectRatio: '4 / 3' }}>
                    {!preview && (
                        <video
                            ref={videoRef}
                            playsInline
                            muted
                            className="w-full h-full object-contain"
                        />
                    )}
                    {preview && (
                        <img src={preview} alt="Captured" className="w-full h-full object-contain" />
                    )}
                    <canvas ref={canvasRef} className="hidden" />

                    {!ready && !preview && !error && (
                        <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
                            Starting camera…
                        </div>
                    )}
                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-white text-sm bg-black/70">
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap justify-between items-center gap-2 px-4 py-3 bg-gray-50 border-t">
                    <div className="flex gap-2">
                        {!preview && (
                            <button
                                type="button"
                                onClick={handleFlip}
                                disabled={!ready}
                                className="px-3 py-2 text-xs font-semibold border border-gray-300 rounded bg-white hover:bg-gray-100 disabled:opacity-50"
                            >
                                Flip Camera ({currentFacing === 'environment' ? 'Rear' : 'Front'})
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2 ml-auto">
                        {!preview && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => { stopStream(); onClose(); }}
                                    className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCapture}
                                    disabled={!ready}
                                    className="px-5 py-2 text-sm font-bold bg-primary text-white rounded hover:bg-primary-dark shadow-sm disabled:opacity-50"
                                >
                                    Capture
                                </button>
                            </>
                        )}
                        {preview && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleRetake}
                                    disabled={busy}
                                    className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
                                >
                                    Retake
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirm}
                                    disabled={busy}
                                    className="px-5 py-2 text-sm font-bold bg-green-600 text-white rounded hover:bg-green-700 shadow-sm disabled:opacity-50"
                                >
                                    {busy ? 'Saving…' : 'Use Photo'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LiveCameraCapture;
