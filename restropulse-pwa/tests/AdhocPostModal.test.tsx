import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './utils/test-utils';
import AdhocPostModal from '../components/AdhocPostModal';

// Mock the API module
vi.mock('../api', () => ({
    postsAPI: {
        create: vi.fn(),
    },
}));

import { postsAPI } from '../api';

describe('AdhocPostModal Component', () => {
    const mockOnClose = vi.fn();
    const mockOnSuccess = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(postsAPI.create).mockResolvedValue({
            id: 'new-post-1',
            type: 'IMAGE',
            status: 'PENDING_APPROVAL',
            thumbnail: '/api/placeholder/400/400',
            caption: 'Test caption',
            platform: 'INSTAGRAM',
            isAdhoc: true,
        });
        
        // Mock URL.createObjectURL
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();
    });

    describe('Rendering', () => {
        it('should not render when isOpen is false', () => {
            render(
                <AdhocPostModal
                    isOpen={false}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            expect(screen.queryByTestId('adhoc-post-modal')).not.toBeInTheDocument();
        });

        it('should render modal when isOpen is true', () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            expect(screen.getByTestId('adhoc-post-modal')).toBeInTheDocument();
            expect(screen.getByText('Quick Post')).toBeInTheDocument();
        });

        it('should render all form elements', () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            // Concept input
            expect(screen.getByTestId('concept-input')).toBeInTheDocument();
            
            // Post type buttons
            expect(screen.getByTestId('type-image')).toBeInTheDocument();
            expect(screen.getByTestId('type-carousel')).toBeInTheDocument();
            expect(screen.getByTestId('type-reel')).toBeInTheDocument();
            expect(screen.getByTestId('type-story')).toBeInTheDocument();
            
            // Platform buttons
            expect(screen.getByTestId('platform-instagram')).toBeInTheDocument();
            expect(screen.getByTestId('platform-facebook')).toBeInTheDocument();
            expect(screen.getByTestId('platform-both')).toBeInTheDocument();
            
            // Schedule buttons
            expect(screen.getByTestId('schedule-now')).toBeInTheDocument();
            expect(screen.getByTestId('schedule-later')).toBeInTheDocument();
            
            // Submit button
            expect(screen.getByTestId('submit-button')).toBeInTheDocument();
        });
    });

    describe('User Interactions', () => {
        it('should close modal when backdrop is clicked', () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            fireEvent.click(screen.getByTestId('modal-backdrop'));
            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });

        it('should close modal when close button is clicked', () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            fireEvent.click(screen.getByTestId('close-button'));
            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });

        it('should update concept text when typing', () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            const conceptInput = screen.getByTestId('concept-input');
            fireEvent.change(conceptInput, { target: { value: 'Test post about pizza' } });
            
            expect(conceptInput).toHaveValue('Test post about pizza');
        });

        it('should select post type when clicked', () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            // Default is IMAGE
            const reelButton = screen.getByTestId('type-reel');
            fireEvent.click(reelButton);
            
            // Check the button has selected styling (border-orange-500)
            expect(reelButton).toHaveClass('border-orange-500');
        });

        it('should select platform when clicked', () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            const facebookButton = screen.getByTestId('platform-facebook');
            fireEvent.click(facebookButton);
            
            expect(facebookButton).toHaveClass('border-orange-500');
        });

        it('should show date/time inputs when schedule later is selected', async () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            // Initially date/time inputs should not be visible
            expect(screen.queryByTestId('schedule-date')).not.toBeInTheDocument();
            expect(screen.queryByTestId('schedule-time')).not.toBeInTheDocument();

            // Click schedule later
            fireEvent.click(screen.getByTestId('schedule-later'));

            // Now date/time inputs should be visible
            await waitFor(() => {
                expect(screen.getByTestId('schedule-date')).toBeInTheDocument();
                expect(screen.getByTestId('schedule-time')).toBeInTheDocument();
            });
        });

        it('should handle file upload and show preview', async () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            const fileInput = screen.getByTestId('file-input');
            const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
            
            fireEvent.change(fileInput, { target: { files: [file] } });

            await waitFor(() => {
                expect(screen.getByAltText('Preview')).toBeInTheDocument();
                expect(screen.getByTestId('remove-media')).toBeInTheDocument();
            });
        });

        it('should remove preview when remove button is clicked', async () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            const fileInput = screen.getByTestId('file-input');
            const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
            
            fireEvent.change(fileInput, { target: { files: [file] } });

            await waitFor(() => {
                expect(screen.getByAltText('Preview')).toBeInTheDocument();
            });

            fireEvent.click(screen.getByTestId('remove-media'));

            await waitFor(() => {
                expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();
                expect(screen.getByTestId('upload-button')).toBeInTheDocument();
            });
        });
    });

    describe('Form Validation', () => {
        it('should show error when submitting without concept', async () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            // Submit button should be disabled when concept is empty
            const submitButton = screen.getByTestId('submit-button');
            expect(submitButton).toBeDisabled();
        });

        it('should show error when scheduling without date/time', async () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            // Enter concept
            fireEvent.change(screen.getByTestId('concept-input'), {
                target: { value: 'Test post' }
            });

            // Select schedule later
            fireEvent.click(screen.getByTestId('schedule-later'));

            // Try to submit without date/time
            fireEvent.click(screen.getByTestId('submit-button'));

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent('Please select a date and time for scheduling');
            });
        });
    });

    describe('Form Submission', () => {
        it('should call postsAPI.create with correct data for ASAP post', async () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            // Enter concept
            fireEvent.change(screen.getByTestId('concept-input'), {
                target: { value: 'New brunch menu special' }
            });

            // Select reel type
            fireEvent.click(screen.getByTestId('type-reel'));

            // Select both platforms
            fireEvent.click(screen.getByTestId('platform-both'));

            // Submit
            fireEvent.click(screen.getByTestId('submit-button'));

            await waitFor(() => {
                expect(postsAPI.create).toHaveBeenCalledTimes(1);
                expect(postsAPI.create).toHaveBeenCalledWith(expect.objectContaining({
                    type: 'REEL',
                    status: 'PENDING_APPROVAL',
                    caption: 'New brunch menu special',
                    platform: 'BOTH',
                    scheduledFor: undefined,
                }));
            });
        });

        it('should call postsAPI.create with scheduledFor for scheduled post', async () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            // Enter concept
            fireEvent.change(screen.getByTestId('concept-input'), {
                target: { value: 'Weekend special announcement' }
            });

            // Select schedule later
            fireEvent.click(screen.getByTestId('schedule-later'));

            // Set date and time
            await waitFor(() => {
                expect(screen.getByTestId('schedule-date')).toBeInTheDocument();
            });
            
            fireEvent.change(screen.getByTestId('schedule-date'), {
                target: { value: '2026-02-15' }
            });
            fireEvent.change(screen.getByTestId('schedule-time'), {
                target: { value: '14:30' }
            });

            // Submit
            fireEvent.click(screen.getByTestId('submit-button'));

            await waitFor(() => {
                expect(postsAPI.create).toHaveBeenCalledTimes(1);
                expect(postsAPI.create).toHaveBeenCalledWith(expect.objectContaining({
                    type: 'IMAGE',
                    status: 'PENDING_APPROVAL',
                    caption: 'Weekend special announcement',
                    platform: 'INSTAGRAM',
                    scheduledFor: expect.stringContaining('2026-02-15'),
                }));
            });
        });

        it('should call onSuccess and onClose after successful submission', async () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            // Enter concept
            fireEvent.change(screen.getByTestId('concept-input'), {
                target: { value: 'Test post' }
            });

            // Submit
            fireEvent.click(screen.getByTestId('submit-button'));

            await waitFor(() => {
                expect(mockOnSuccess).toHaveBeenCalledTimes(1);
                expect(mockOnClose).toHaveBeenCalledTimes(1);
            });
        });

        it('should show error message when API call fails', async () => {
            vi.mocked(postsAPI.create).mockRejectedValueOnce(new Error('Network error'));

            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            // Enter concept
            fireEvent.change(screen.getByTestId('concept-input'), {
                target: { value: 'Test post' }
            });

            // Submit
            fireEvent.click(screen.getByTestId('submit-button'));

            await waitFor(() => {
                expect(screen.getByRole('alert')).toHaveTextContent('Network error');
            });

            // Should not call onSuccess or onClose on failure
            expect(mockOnSuccess).not.toHaveBeenCalled();
            expect(mockOnClose).not.toHaveBeenCalled();
        });

        it('should show loading state while submitting', async () => {
            // Make the API call take some time
            vi.mocked(postsAPI.create).mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve({
                    id: 'new-post-1',
                    type: 'IMAGE',
                    status: 'PENDING_APPROVAL',
                    thumbnail: '/api/placeholder/400/400',
                    caption: 'Test caption',
                    platform: 'INSTAGRAM',
                    isAdhoc: true,
                }), 100))
            );

            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            // Enter concept
            fireEvent.change(screen.getByTestId('concept-input'), {
                target: { value: 'Test post' }
            });

            // Submit
            fireEvent.click(screen.getByTestId('submit-button'));

            // Check for loading state
            expect(screen.getByText('Creating...')).toBeInTheDocument();
            expect(screen.getByTestId('submit-button')).toBeDisabled();

            // Wait for completion
            await waitFor(() => {
                expect(mockOnSuccess).toHaveBeenCalled();
            });
        });
    });

    describe('Touch Interactions', () => {
        it('should close modal when swiped down significantly', async () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            const modal = screen.getByTestId('adhoc-post-modal');

            // Simulate swipe down
            fireEvent.touchStart(modal, { touches: [{ clientY: 100 }] });
            fireEvent.touchMove(modal, { touches: [{ clientY: 250 }] }); // 150px swipe
            fireEvent.touchEnd(modal);

            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });

        it('should not close modal on small swipe', async () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            const modal = screen.getByTestId('adhoc-post-modal');

            // Simulate small swipe
            fireEvent.touchStart(modal, { touches: [{ clientY: 100 }] });
            fireEvent.touchMove(modal, { touches: [{ clientY: 130 }] }); // Only 30px
            fireEvent.touchEnd(modal);

            expect(mockOnClose).not.toHaveBeenCalled();
        });
    });

    describe('Media URL handling', () => {
        it('should set mediaUrls for carousel type when image is uploaded', async () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            // Enter concept
            fireEvent.change(screen.getByTestId('concept-input'), {
                target: { value: 'Carousel post' }
            });

            // Select carousel type
            fireEvent.click(screen.getByTestId('type-carousel'));

            // Upload file
            const fileInput = screen.getByTestId('file-input');
            const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
            fireEvent.change(fileInput, { target: { files: [file] } });

            await waitFor(() => {
                expect(screen.getByAltText('Preview')).toBeInTheDocument();
            });

            // Submit
            fireEvent.click(screen.getByTestId('submit-button'));

            await waitFor(() => {
                expect(postsAPI.create).toHaveBeenCalledWith(expect.objectContaining({
                    type: 'CAROUSEL',
                    mediaUrls: expect.arrayContaining([expect.any(String)]),
                }));
            });
        });

        it('should set videoUrl for reel type when video is uploaded', async () => {
            render(
                <AdhocPostModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onSuccess={mockOnSuccess}
                />
            );

            // Enter concept
            fireEvent.change(screen.getByTestId('concept-input'), {
                target: { value: 'Reel post' }
            });

            // Select reel type
            fireEvent.click(screen.getByTestId('type-reel'));

            // Upload file
            const fileInput = screen.getByTestId('file-input');
            const file = new File(['test'], 'test.mp4', { type: 'video/mp4' });
            fireEvent.change(fileInput, { target: { files: [file] } });

            await waitFor(() => {
                expect(screen.getByAltText('Preview')).toBeInTheDocument();
            });

            // Submit
            fireEvent.click(screen.getByTestId('submit-button'));

            await waitFor(() => {
                expect(postsAPI.create).toHaveBeenCalledWith(expect.objectContaining({
                    type: 'REEL',
                    videoUrl: expect.any(String),
                }));
            });
        });
    });
});
