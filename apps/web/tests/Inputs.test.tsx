import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './utils/test-utils';
import Inputs from '../components/Inputs';
import { Restaurant } from '../types';

// Mock the API module
vi.mock('../api', () => ({
    restaurantAPI: {
        updateOffers: vi.fn(),
        updateSpecials: vi.fn(),
        updateMenu: vi.fn(),
    },
}));

import { restaurantAPI } from '../api';

// Mock window.history
const mockHistoryPushState = vi.fn();
const mockHistoryBack = vi.fn();

describe('Inputs Component', () => {
    const mockOnRefresh = vi.fn();

    const mockRestaurant: Restaurant = {
        id: 'r1',
        name: 'Test Restaurant',
        cuisine: 'Italian',
        location: {
            address: 'Test Address',
            lat: 0,
            lng: 0,
            mapUrl: 'https://maps.example.com',
        },
        accountManager: {
            name: 'Manager',
            phone: '123',
            email: 'manager@test.com',
            avatar: '/avatar.jpg',
        },
        subscription: {
            tier: 'GOLD',
            renewalDate: '2024-12-31',
            status: 'ACTIVE',
        },
        integrations: {
            whatsapp: true,
            instagram: true,
            facebook: false,
        },
        activeOffers: ['Summer Special', 'Happy Hour'],
        chefSpecials: ['Truffle Pasta'],
        menuLastUpdated: '2024-01-15',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        window.history.pushState = mockHistoryPushState;
        window.history.back = mockHistoryBack;
        vi.mocked(restaurantAPI.updateOffers).mockResolvedValue(undefined as any);
        vi.mocked(restaurantAPI.updateSpecials).mockResolvedValue(undefined as any);
        vi.mocked(restaurantAPI.updateMenu).mockResolvedValue(undefined as any);
    });

    describe('Rendering', () => {
        it('should render the main heading and description', () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            expect(screen.getByText('Update Us')).toBeInTheDocument();
            expect(screen.getByText(/Keep your AI content engine smart/i)).toBeInTheDocument();
        });

        it('should render all action buttons', () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            expect(screen.getByText('Upcoming Offers')).toBeInTheDocument();
            expect(screen.getAllByText("Chef's Specials").length).toBeGreaterThan(0);
            expect(screen.getAllByText('Update Menu').length).toBeGreaterThan(0);
            expect(screen.getByText('Captured Moments')).toBeInTheDocument();
        });

        it('should show active offers in Active Context section', () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            expect(screen.getByText('Summer Special')).toBeInTheDocument();
            expect(screen.getByText('Happy Hour')).toBeInTheDocument();
            expect(screen.getByText('2/3')).toBeInTheDocument();
        });

        it('should show chef specials in Active Context section', () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            expect(screen.getByText('Truffle Pasta')).toBeInTheDocument();
            expect(screen.getByText('1/3')).toBeInTheDocument();
        });

        it('should show menu last updated date', () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            expect(screen.getByText(/Last updated:/i)).toBeInTheDocument();
            expect(screen.getByText(/1\/15\/2024/i)).toBeInTheDocument();
        });

        it('should show message when no active offers', () => {
            const emptyRestaurant = { ...mockRestaurant, activeOffers: [] };
            render(<Inputs restaurantData={emptyRestaurant} onRefresh={mockOnRefresh} />);

            expect(screen.getByText('No active offers set.')).toBeInTheDocument();
        });

        it('should show message when no chef specials', () => {
            const emptyRestaurant = { ...mockRestaurant, chefSpecials: [] };
            render(<Inputs restaurantData={emptyRestaurant} onRefresh={mockOnRefresh} />);

            expect(screen.getByText('No special highlighted.')).toBeInTheDocument();
        });

        it('should show message when no menu uploaded', () => {
            const emptyRestaurant = { ...mockRestaurant, menuLastUpdated: undefined };
            render(<Inputs restaurantData={emptyRestaurant} onRefresh={mockOnRefresh} />);

            expect(screen.getByText('No menu uploaded.')).toBeInTheDocument();
        });

        it('should show Full label when offers are at maximum', () => {
            const fullRestaurant = {
                ...mockRestaurant,
                activeOffers: ['Offer 1', 'Offer 2', 'Offer 3'],
            };
            render(<Inputs restaurantData={fullRestaurant} onRefresh={mockOnRefresh} />);

            expect(screen.getByText(/Full \(3\/3\)/i)).toBeInTheDocument();
        });

        it('should disable Captured Moments button with Coming Soon label', () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const capturedButton = screen.getByText('Captured Moments').closest('button');
            expect(capturedButton).toBeDisabled();
            expect(screen.getByText('Coming Soon')).toBeInTheDocument();
        });
    });

    describe('Modal Interactions', () => {
        it('should open offers modal when button is clicked', () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const offersButton = screen.getByText('Upcoming Offers').closest('button');
            fireEvent.click(offersButton!);

            expect(screen.getByText('Add New Offer')).toBeInTheDocument();
            expect(mockHistoryPushState).toHaveBeenCalledWith({ modal: 'offers' }, '', '#offers');
        });

        it('should open specials modal when button is clicked', () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const buttons = screen.getAllByRole('button');
            const specialsButton = buttons.find(btn =>
                btn.textContent?.includes("Chef's Specials") &&
                btn.textContent?.includes('Highlight this weekend')
            );

            if (specialsButton) {
                fireEvent.click(specialsButton);
                expect(screen.getByText("Add Chef's Special")).toBeInTheDocument();
                expect(mockHistoryPushState).toHaveBeenCalledWith({ modal: 'special' }, '', '#special');
            }
        });

        it('should open menu modal when button is clicked', () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const buttons = screen.getAllByRole('button');
            const menuButton = buttons.find(btn =>
                btn.textContent?.includes('Update Menu') &&
                btn.textContent?.includes('new menu')
            );

            if (menuButton) {
                fireEvent.click(menuButton);
                expect(mockHistoryPushState).toHaveBeenCalledWith({ modal: 'menu' }, '', '#menu');
            }
        });

        it('should not open offers modal when at maximum capacity', () => {
            const fullRestaurant = {
                ...mockRestaurant,
                activeOffers: ['Offer 1', 'Offer 2', 'Offer 3'],
            };

            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });

            render(<Inputs restaurantData={fullRestaurant} onRefresh={mockOnRefresh} />);

            const offersButton = screen.getByText('Upcoming Offers').closest('button');
            fireEvent.click(offersButton!);

            expect(alertSpy).toHaveBeenCalledWith(
                'You can only have up to 3 active offers. Please delete an old one to add a new offer.'
            );
            expect(screen.queryByText('Add New Offer')).not.toBeInTheDocument();

            alertSpy.mockRestore();
        });

        it('should not open specials modal when at maximum capacity', () => {
            const fullRestaurant = {
                ...mockRestaurant,
                chefSpecials: ['Special 1', 'Special 2', 'Special 3'],
            };

            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });

            render(<Inputs restaurantData={fullRestaurant} onRefresh={mockOnRefresh} />);

            const buttons = screen.getAllByRole('button');
            const specialsButton = buttons.find(btn =>
                btn.textContent?.includes("Chef's Specials") &&
                btn.textContent?.includes('Highlight')
            );

            if (specialsButton) {
                fireEvent.click(specialsButton);

                expect(alertSpy).toHaveBeenCalledWith(
                    "You can only have up to 3 chef's specials. Please delete an old one to add a new special."
                );
            }

            alertSpy.mockRestore();
        });
    });

    describe('Form Interactions', () => {
        it('should allow typing in offer input field', async () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const offersButton = screen.getByText('Upcoming Offers').closest('button');
            fireEvent.click(offersButton!);

            const input = screen.getByPlaceholderText('e.g. 20% Off on Pasta');
            fireEvent.change(input, { target: { value: 'New Offer' } });

            expect(input).toHaveValue('New Offer');
        });

        it('should allow typing in special input field', () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const buttons = screen.getAllByRole('button');
            const specialsButton = buttons.find(btn =>
                btn.textContent?.includes("Chef's Specials") &&
                btn.textContent?.includes('Highlight')
            );

            if (specialsButton) {
                fireEvent.click(specialsButton);

                const input = screen.getByPlaceholderText('e.g. Truffle Risotto');
                fireEvent.change(input, { target: { value: 'New Special' } });

                expect(input).toHaveValue('New Special');
            }
        });

        it('should submit offer and call API', async () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const offersButton = screen.getByText('Upcoming Offers').closest('button');
            fireEvent.click(offersButton!);

            const input = screen.getByPlaceholderText('e.g. 20% Off on Pasta');
            fireEvent.change(input, { target: { value: 'Flash Sale' } });

            const submitButton = screen.getByRole('button', { name: /Add Offer/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(restaurantAPI.updateOffers).toHaveBeenCalledWith('r1', 'ADD', 'Flash Sale');
                expect(mockOnRefresh).toHaveBeenCalled();
                expect(mockHistoryBack).toHaveBeenCalled();
            });
        });

        it('should submit special and call API', async () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const buttons = screen.getAllByRole('button');
            const specialsButton = buttons.find(btn =>
                btn.textContent?.includes("Chef's Specials") &&
                btn.textContent?.includes('Highlight')
            );

            if (specialsButton) {
                fireEvent.click(specialsButton);

                const input = screen.getByPlaceholderText('e.g. Truffle Risotto');
                fireEvent.change(input, { target: { value: 'Lobster Thermidor' } });

                const submitButton = screen.getByRole('button', { name: /Add Special/i });
                fireEvent.click(submitButton);

                await waitFor(() => {
                    expect(restaurantAPI.updateSpecials).toHaveBeenCalledWith('r1', 'ADD', 'Lobster Thermidor');
                    expect(mockOnRefresh).toHaveBeenCalled();
                    expect(mockHistoryBack).toHaveBeenCalled();
                });
            }
        });

        it('should submit menu update and call API', async () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const buttons = screen.getAllByRole('button');
            const menuButton = buttons.find(btn =>
                btn.textContent?.includes('Update Menu') &&
                btn.textContent?.includes('new menu')
            );

            if (menuButton) {
                fireEvent.click(menuButton);

                const allButtons = screen.getAllByRole('button');
                const submitButton = allButtons.find(btn => btn.textContent === 'Update Menu');

                if (submitButton) {
                    fireEvent.click(submitButton);

                    await waitFor(() => {
                        expect(restaurantAPI.updateMenu).toHaveBeenCalledWith('r1');
                        expect(mockOnRefresh).toHaveBeenCalled();
                        expect(mockHistoryBack).toHaveBeenCalled();
                    });
                }
            }
        });

        it('should use default value when input is empty', async () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const offersButton = screen.getByText('Upcoming Offers').closest('button');
            fireEvent.click(offersButton!);

            const submitButton = screen.getByRole('button', { name: /Add Offer/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(restaurantAPI.updateOffers).toHaveBeenCalledWith('r1', 'ADD', 'New Offer');
            });
        });

        it('should handle API error when adding offer', async () => {
            vi.mocked(restaurantAPI.updateOffers).mockRejectedValueOnce(new Error('API Error'));
            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const offersButton = screen.getByText('Upcoming Offers').closest('button');
            fireEvent.click(offersButton!);

            const submitButton = screen.getByRole('button', { name: /Add Offer/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith('Failed to update:', expect.any(Error));
                expect(alertSpy).toHaveBeenCalledWith('Failed to update. Please try again.');
            });

            alertSpy.mockRestore();
            consoleSpy.mockRestore();
        });
    });

    describe('Delete Functionality', () => {
        it('should delete an offer when delete button is clicked', async () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const offerDeleteButton = screen.getByRole('button', { name: 'Delete offer 1' });

            fireEvent.click(offerDeleteButton!);

            await waitFor(() => {
                expect(restaurantAPI.updateOffers).toHaveBeenCalledWith('r1', 'DELETE', 0);
                expect(mockOnRefresh).toHaveBeenCalled();
            });
        });

        it('should delete a special when delete button is clicked', async () => {
            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const specialDeleteButton = screen.getByRole('button', { name: 'Delete special 1' });

            fireEvent.click(specialDeleteButton!);

            await waitFor(() => {
                expect(restaurantAPI.updateSpecials).toHaveBeenCalledWith('r1', 'DELETE', 0);
                expect(mockOnRefresh).toHaveBeenCalled();
            });
        });

        it('should handle delete error gracefully', async () => {
            vi.mocked(restaurantAPI.updateOffers).mockRejectedValueOnce(new Error('Delete failed'));
            const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            render(<Inputs restaurantData={mockRestaurant} onRefresh={mockOnRefresh} />);

            const offerDeleteButton = screen.getByRole('button', { name: 'Delete offer 1' });

            fireEvent.click(offerDeleteButton!);

            await waitFor(() => {
                expect(alertSpy).toHaveBeenCalledWith('Failed to delete. Please try again.');
            });

            alertSpy.mockRestore();
            consoleSpy.mockRestore();
        });
    });
});
