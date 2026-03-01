import React from 'react';
import { siFacebook, siInstagram } from 'simple-icons';

interface BrandIconProps {
    size?: number;
    className?: string;
}

const BrandIcon: React.FC<BrandIconProps & { path: string }> = ({ path, size = 24, className = '' }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        aria-hidden="true"
    >
        <path d={path} />
    </svg>
);

export const InstagramIcon: React.FC<BrandIconProps> = ({ size = 24, className = '' }) => (
    <BrandIcon path={siInstagram.path} size={size} className={className} />
);

export const FacebookIcon: React.FC<BrandIconProps> = ({ size = 24, className = '' }) => (
    <BrandIcon path={siFacebook.path} size={size} className={className} />
);
