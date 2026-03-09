import React from 'react';

interface ActionNoticeProps {
    message: string;
    type?: 'error' | 'success';
    onDismiss?: () => void;
}

export function ActionNotice({ message, type = 'error', onDismiss }: ActionNoticeProps) {
    const isSuccess = type === 'success';

    return (
        <div className={`${isSuccess ? 'bg-green-50 border-green-200/60' : 'bg-red-50 border-red-200/60'} border rounded-xl p-3.5 animate-in slide-in-from-bottom duration-200`}>
            <p className={`text-xs ${isSuccess ? 'text-green-800' : 'text-red-800'} leading-relaxed font-medium`}>{message}</p>
        </div>
    );
}
