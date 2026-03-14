import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Calendar, Image as ImageIcon, Video, Sparkles, Clock, Send, AlertCircle, Loader2 } from 'lucide-react';
import { Post, Platform, PLATFORM_POST_TYPES } from '@restropulse/shared';
import { postsAPI } from '../api';
import { FacebookIcon, InstagramIcon } from './BrandIcons';

// Post type options for user selection
const POST_TYPES = [
    { id: 'IMAGE' as const, label: 'Image Post', icon: ImageIcon, desc: 'Single photo' },
    { id: 'CAROUSEL' as const, label: 'Carousel', icon: ImageIcon, desc: 'Multiple photos' },
    { id: 'REEL' as const, label: 'Reel', icon: Video, desc: 'Short video' },
    { id: 'STORY' as const, label: 'Story', icon: Clock, desc: '24hr content' },
];

// Helper to get valid post types for selected platforms
function getValidPostTypes(platforms: Platform[]): Post['type'][] {
    if (platforms.length === 0) return [];
    const sets = platforms.map(p => new Set(PLATFORM_POST_TYPES[p]));
    // Intersection of all platform post types
    const first = sets[0];
    return [...first].filter(t => sets.every(s => s.has(t))) as Post['type'][];
}

interface AdhocPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface FormData {
    concept: string;
    postType: Post['type'];
    platforms: Platform[];
    scheduleType: 'now' | 'later';
    scheduledDate: string;
    scheduledTime: string;
    mediaUrl: string;
}

/** Returns scheduledDate and scheduledTime strings for 10 minutes from now in local time. */
function getDefaultSchedule(): { scheduledDate: string; scheduledTime: string } {
    const d = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return {
        scheduledDate: `${year}-${month}-${day}`,
        scheduledTime: `${hours}:${minutes}`,
    };
}

function getDefaultFormData(): FormData {
    const { scheduledDate, scheduledTime } = getDefaultSchedule();
    return {
        concept: '',
        postType: 'IMAGE',
        platforms: ['INSTAGRAM'],
        scheduleType: 'later',
        scheduledDate,
        scheduledTime,
        mediaUrl: '',
    };
}

const AdhocPostModal: React.FC<AdhocPostModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [formData, setFormData] = useState<FormData>(getDefaultFormData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Touch handling for swipe-to-close
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState(0);

    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchStart(e.touches[0].clientY);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStart === null) return;
        const diff = e.touches[0].clientY - touchStart;
        if (diff > 0) setDragOffset(diff);
    };

    const handleTouchEnd = () => {
        if (dragOffset > 100) {
            onClose();
        }
        setDragOffset(0);
        setTouchStart(null);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Create preview URL
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
            // For MVP, we'll use a placeholder URL - in production, this would upload to storage
            setFormData(prev => ({ ...prev, mediaUrl: url }));
        }
    };

    const togglePlatform = (platform: Platform) => {
        setFormData(prev => {
            const current = prev.platforms;
            let next: Platform[];
            if (current.includes(platform)) {
                next = current.filter(p => p !== platform);
                // Must have at least one platform
                if (next.length === 0) return prev;
            } else {
                next = [...current, platform];
            }
            // If current post type is not valid for the new platform set, reset to first valid
            const validTypes = getValidPostTypes(next);
            const postType = validTypes.includes(prev.postType) ? prev.postType : (validTypes[0] || 'IMAGE');
            return { ...prev, platforms: next, postType };
        });
    };

    const handleSubmit = async () => {
        // Validation
        if (!formData.concept.trim()) {
            setError('Please describe what you want to post');
            return;
        }

        if (formData.platforms.length === 0) {
            setError('Please select at least one platform');
            return;
        }

        if (formData.scheduleType === 'later' && (!formData.scheduledDate || !formData.scheduledTime)) {
            setError('Please select a date and time for scheduling');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // Build the scheduled time -- default to 10 min from now for ASAP posts
            const scheduledFor = formData.scheduleType === 'later'
                ? new Date(`${formData.scheduledDate}T${formData.scheduledTime}`).toISOString()
                : new Date(Date.now() + 10 * 60 * 1000).toISOString();

            // Use the generate endpoint which will create the post with AI-generated content
            await postsAPI.generate({
                concept: formData.concept,
                type: formData.postType,
                platforms: formData.platforms,
                scheduledFor
            });

            // Reset form
            setFormData(getDefaultFormData());
            setPreviewUrl(null);

            onSuccess();
            onClose();
        } catch (err) {
            console.error('Failed to create post:', err);
            setError('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData(getDefaultFormData());
        setPreviewUrl(null);
        setError(null);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    // Escape key to dismiss
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    if (!isOpen) return null;

    // Get minimum date (today) for date picker
    const today = new Date().toISOString().split('T')[0];

    const validPostTypes = getValidPostTypes(formData.platforms);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={handleClose} data-testid="modal-backdrop" />

            {/* Modal Content */}
            <div
                className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col relative z-10"
                style={{
                    transform: `translateY(${dragOffset}px)`,
                    maxHeight: '90vh'
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                data-testid="adhoc-post-modal"
            >
                {/* Drag Handle */}
                <div className="w-full flex items-center justify-center pt-4 pb-2">
                    <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
                </div>

                {/* Header */}
                <div className="px-6 pb-4 flex justify-between items-center border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Sparkles size={20} className="text-orange-500" />
                        Quick Post
                    </h2>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                        aria-label="Close modal"
                        data-testid="close-button"
                    >
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="p-6 overflow-y-auto flex-1 space-y-5">
                    {/* Error Alert */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm" role="alert">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Concept/Description */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            What do you want to post?
                        </label>
                        <textarea
                            value={formData.concept}
                            onChange={(e) => setFormData(prev => ({ ...prev, concept: e.target.value }))}
                            placeholder="e.g., Announce our new weekend brunch menu with 20% off for first-time visitors..."
                            className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                            rows={3}
                            data-testid="concept-input"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                            Describe your idea - our team will craft the perfect caption.
                        </p>
                    </div>

                    {/* Platform Selection (multi-select checkboxes) */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Platforms
                        </label>
                        <div className="flex gap-2">
                            {([
                                { id: 'INSTAGRAM' as const, label: 'Instagram', icon: InstagramIcon },
                                { id: 'FACEBOOK' as const, label: 'Facebook', icon: FacebookIcon },
                            ]).map((platform) => {
                                const selected = formData.platforms.includes(platform.id);
                                return (
                                    <button
                                        key={platform.id}
                                        onClick={() => togglePlatform(platform.id)}
                                        className={`flex-1 p-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${selected
                                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                                            : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                            }`}
                                        data-testid={`platform-${platform.id.toLowerCase()}`}
                                    >
                                        <platform.icon size={16} />
                                        <span className="text-xs font-medium">{platform.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Post Type Selection */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Content Type
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {POST_TYPES.map((type) => {
                                const isValid = validPostTypes.includes(type.id);
                                return (
                                    <button
                                        key={type.id}
                                        onClick={() => isValid && setFormData(prev => ({ ...prev, postType: type.id }))}
                                        disabled={!isValid}
                                        className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1 ${!isValid
                                            ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                                            : formData.postType === type.id
                                                ? 'border-orange-500 bg-orange-50 text-orange-700'
                                                : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                            }`}
                                        data-testid={`type-${type.id.toLowerCase()}`}
                                    >
                                        <type.icon size={20} />
                                        <span className="text-[10px] font-medium">{type.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Media Upload */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Media <span className="text-slate-400 font-normal">(Optional)</span>
                        </label>
                        {(formData.postType === 'REEL' || formData.postType === 'STORY' || formData.postType === 'VIDEO') && (
                            <p className="text-xs text-orange-600 mb-2">
                                {formData.postType === 'REEL' ? 'Reels' : formData.postType === 'STORY' ? 'Stories' : 'Videos'} can include a video file if available
                            </p>
                        )}
                        {formData.postType === 'CAROUSEL' && (
                            <p className="text-xs text-orange-600 mb-2">
                                Carousels can include multiple images if available
                            </p>
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            aria-label="Upload image or video"
                            accept="image/*,video/*"
                            className="hidden"
                            data-testid="file-input"
                        />
                        {previewUrl ? (
                            <div className="relative rounded-xl overflow-hidden border border-slate-200">
                                <img
                                    src={previewUrl}
                                    alt="Preview"
                                    className="w-full h-40 object-cover"
                                />
                                <button
                                    onClick={() => {
                                        setPreviewUrl(null);
                                        setFormData(prev => ({ ...prev, mediaUrl: '' }));
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    aria-label="Remove uploaded media"
                                    title="Remove uploaded media"
                                    className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                                    data-testid="remove-media"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full p-6 border-2 border-dashed border-slate-200 rounded-xl hover:border-orange-400 hover:bg-orange-50/50 transition-all flex flex-col items-center gap-2 text-slate-500"
                                data-testid="upload-button"
                            >
                                <Upload size={24} />
                                <span className="text-sm font-medium">Upload image or video</span>
                                <span className="text-xs text-slate-400">or leave blank for team to source</span>
                            </button>
                        )}
                    </div>

                    {/* Schedule Selection */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            When to post?
                        </label>
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={() => setFormData(prev => ({ ...prev, scheduleType: 'now' }))}
                                className={`flex-1 p-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${formData.scheduleType === 'now'
                                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                    }`}
                                data-testid="schedule-now"
                            >
                                <Send size={16} />
                                <span className="text-sm font-medium">ASAP</span>
                            </button>
                            <button
                                onClick={() => setFormData(prev => ({ ...prev, scheduleType: 'later' }))}
                                className={`flex-1 p-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${formData.scheduleType === 'later'
                                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                                    }`}
                                data-testid="schedule-later"
                            >
                                <Calendar size={16} />
                                <span className="text-sm font-medium">Schedule</span>
                            </button>
                        </div>

                        {formData.scheduleType === 'later' && (
                            <div className="flex gap-2 animate-in slide-in-from-top-2 duration-200">
                                <input
                                    type="date"
                                    value={formData.scheduledDate}
                                    onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                                    aria-label="Scheduled date"
                                    min={today}
                                    className="flex-1 p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                    data-testid="schedule-date"
                                />
                                <input
                                    type="time"
                                    value={formData.scheduledTime}
                                    onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                                    aria-label="Scheduled time"
                                    className="flex-1 p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                    data-testid="schedule-time"
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 pt-4 border-t border-slate-100 bg-slate-50/50 rounded-b-3xl">
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !formData.concept.trim()}
                        className={`w-full py-3.5 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 ${isSubmitting || !formData.concept.trim()
                            ? 'bg-slate-300 cursor-not-allowed'
                            : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-[0.98] shadow-lg shadow-orange-500/25'
                            }`}
                        data-testid="submit-button"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <Sparkles size={18} />
                                Create Draft
                            </>
                        )}
                    </button>
                    <p className="text-xs text-center text-slate-400 mt-3">
                        Your post will appear in the Review tab for final approval.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AdhocPostModal;
