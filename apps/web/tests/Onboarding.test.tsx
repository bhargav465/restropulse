import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './utils/test-utils';
import Onboarding from '../components/Onboarding';
import { restaurantAPI, accountManagerAPI, citiesAPI } from '../api';

// Mock API modules
vi.mock('../api', () => ({
    restaurantAPI: {
        create: vi.fn(),
    },
    accountManagerAPI: {
        getByCityAndZone: vi.fn(),
    },
    citiesAPI: {
        getAll: vi.fn(),
    },
}));

// Mock @vis.gl/react-google-maps -- render children directly without real Maps
vi.mock('@vis.gl/react-google-maps', () => ({
    APIProvider: ({ children }: any) => <div data-testid="api-provider">{children}</div>,
    Map: ({ children }: any) => <div data-testid="google-map">{children}</div>,
    AdvancedMarker: () => <div data-testid="marker" />,
    useMapsLibrary: () => ({}),
}));

// Ensure Google Maps API key is unset so fallback manual input renders
vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');

const mockOnComplete = vi.fn();

const mockCitiesResponse = [
    { id: 'city-bangalore', name: 'Bangalore', defaultZone: 'HQ' },
    { id: 'city-delhi', name: 'Delhi', defaultZone: 'HQ' },
    { id: 'city-hyderabad', name: 'Hyderabad', defaultZone: 'HQ' },
    { id: 'city-mumbai', name: 'Mumbai', defaultZone: 'HQ' },
];

const mockManagersResponse = [
    { id: 'am1', name: 'Manager Alpha', phone: '+91 11111', email: 'a@test.com', avatar: 'https://example.com/a.jpg', city: 'Bangalore', zone: 'Indiranagar' },
    { id: 'am2', name: 'Manager Beta', phone: '+91 22222', email: 'b@test.com', avatar: 'https://example.com/b.jpg', city: 'Bangalore', zone: 'Koramangala' },
];

const mockCreateResponse = {
    restaurant: {
        id: 'r-new',
        name: 'Test Restaurant',
        cuisine: 'Italian',
        location: { address: '1 Main St', lat: 12.97, lng: 77.59, mapUrl: '' },
        accountManager: { name: '', phone: '', email: '', avatar: '' },
        subscription: { tier: 'BASIC', renewalDate: '2026-04-01', status: 'ACTIVE' },
        integrations: { instagram: false },
    },
    token: 'new-access-token',
    refreshToken: 'new-refresh-token',
};

/** Fill step 1 (About You) with valid data and click Next */
const completeStep1 = async () => {
    fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText(/arjun@example\.com/i), { target: { value: 'john@test.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Your Restaurant/i })).toBeInTheDocument());
};

/** Fill step 2 (Your Restaurant, fallback) and click Next */
const completeStep2 = async () => {
    // Wait for cities to populate from API
    await waitFor(() => {
        expect(screen.getByText('Select city')).toBeInTheDocument();
    });
    // Open city dropdown
    fireEvent.click(screen.getByText('Select city'));
    
    // Select city from options
    await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Bangalore' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Bangalore' }));
    
    // Fill restaurant name and cuisine
    fireEvent.change(screen.getByPlaceholderText(/The Spice Lounge/i), { target: { value: 'My Restaurant' } });
    fireEvent.change(screen.getByPlaceholderText(/Modern Indian Fusion/i), { target: { value: 'Italian' } });
    // Fill address (fallback mode)
    fireEvent.change(screen.getByPlaceholderText(/Indiranagar, Bangalore/i), { target: { value: '1 Main St' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Account Manager/i })).toBeInTheDocument());
};


describe('Onboarding Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (localStorage.getItem as any).mockReturnValue(null);
        (citiesAPI.getAll as any).mockResolvedValue(mockCitiesResponse);
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue([]);
    });

    afterEach(() => {
        vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    });

    // --- Step 1: About You (name + email) ---

    it('should render step 1 with name and email fields', () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        expect(screen.getByText(/Welcome to RestroPulse/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Arjun Mehta/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/arjun@example\.com/i)).toBeInTheDocument();
    });

    it('should disable Next button when fields are incomplete', () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        const nextBtn = screen.getByRole('button', { name: /Next/i });
        expect(nextBtn).toBeDisabled();

        // Only name filled
        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        expect(nextBtn).toBeDisabled();

        // Name filled but invalid email
        fireEvent.change(screen.getByPlaceholderText(/arjun@example\.com/i), { target: { value: 'notanemail' } });
        expect(nextBtn).toBeDisabled();
    });

    it('should enable Next button with valid name and email', () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John Doe' } });
        fireEvent.change(screen.getByPlaceholderText(/arjun@example\.com/i), { target: { value: 'john@test.com' } });
        expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
    });

    // --- Step Navigation ---

    it('should navigate from step 1 to step 2 (Your Restaurant)', async () => {
        render(<Onboarding onComplete={mockOnComplete} />);
        await completeStep1();

        expect(screen.getByRole('heading', { name: /Your Restaurant/i })).toBeInTheDocument();
    });

    it('should navigate back from step 2 to step 1', async () => {
        render(<Onboarding onComplete={mockOnComplete} />);
        await completeStep1();

        fireEvent.click(screen.getByRole('button', { name: /Back/i }));

        await waitFor(() => {
            expect(screen.getByText(/Welcome to RestroPulse/i)).toBeInTheDocument();
        });
    });

    it('should not show Back button on step 1', () => {
        render(<Onboarding onComplete={mockOnComplete} />);
        expect(screen.queryByRole('button', { name: /Back/i })).not.toBeInTheDocument();
    });

    // --- Step 2: Your Restaurant (city + name + cuisine + address) ---

    it('should show city dropdown, restaurant fields, and manual address input on step 2', async () => {
        render(<Onboarding onComplete={mockOnComplete} />);
        await completeStep1();

        expect(screen.getByText('Select city')).toBeInTheDocument(); // city select
        expect(screen.getByPlaceholderText(/The Spice Lounge/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Modern Indian Fusion/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Indiranagar, Bangalore/i)).toBeInTheDocument();
        expect(screen.getByText(/Google Maps API key not configured/i)).toBeInTheDocument();

        fireEvent.click(screen.getByText('Select city'));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Bangalore' })).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: 'Bangalore' }));

        await waitFor(() => {
            expect(accountManagerAPI.getByCityAndZone).toHaveBeenCalledWith('Bangalore', undefined);
        });
    });

    it('should disable Next on step 2 until all fields are filled', async () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        fireEvent.change(screen.getByPlaceholderText(/arjun@example\.com/i), { target: { value: 'john@test.com' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Your Restaurant/i })).toBeInTheDocument());

        expect(screen.getByText('Select city')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Select city'));
        const bangaloreOption = screen.getByRole('button', { name: 'Bangalore' });
        fireEvent.click(bangaloreOption);

        const nextBtn = screen.getByRole('button', { name: /Next/i });
        expect(nextBtn).toBeDisabled();

        // City + restaurant name
        fireEvent.change(screen.getByPlaceholderText(/The Spice Lounge/i), { target: { value: 'My Rest' } });
        expect(nextBtn).toBeDisabled();

        // City + restaurant name + cuisine (no address yet)
        fireEvent.change(screen.getByPlaceholderText(/Modern Indian Fusion/i), { target: { value: 'Italian' } });
        expect(nextBtn).toBeDisabled();

        // All filled
        fireEvent.change(screen.getByPlaceholderText(/Indiranagar, Bangalore/i), { target: { value: '1 Main St' } });
        await waitFor(() => expect(nextBtn).not.toBeDisabled());
    });

    // --- Step 3: Account Manager ---

    it('should show city label and fetch managers on step 3', async () => {
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue(mockManagersResponse);

        render(<Onboarding onComplete={mockOnComplete} />);
        await completeStep1();
        await completeStep2();

        // City label should be visible (read-only)
        expect(screen.getByText(/Showing managers in/i)).toBeInTheDocument();
        expect(screen.getByText('Bangalore')).toBeInTheDocument();

        await waitFor(() => {
            expect(accountManagerAPI.getByCityAndZone).toHaveBeenCalledWith('Bangalore', undefined);
        });
    });

    it('should show manager cards on step 3', async () => {
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue(mockManagersResponse);

        render(<Onboarding onComplete={mockOnComplete} />);
        await completeStep1();
        await completeStep2();

        await waitFor(() => {
            expect(screen.getByText('Manager Alpha')).toBeInTheDocument();
            expect(screen.getByText('Manager Beta')).toBeInTheDocument();
        });
    });

    it('should show "no managers" message when none found', async () => {
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue([]);

        render(<Onboarding onComplete={mockOnComplete} />);
        await completeStep1();
        await completeStep2();

        await waitFor(() => {
            expect(screen.getByText(/No account managers available/i)).toBeInTheDocument();
        });
    });

    it('should disable Get Started when no manager is selected', async () => {
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue(mockManagersResponse);

        render(<Onboarding onComplete={mockOnComplete} />);
        await completeStep1();
        await completeStep2();

        await waitFor(() => expect(screen.getByText('Manager Alpha')).toBeInTheDocument());

        // Get Started should be disabled since no manager is selected
        expect(screen.getByRole('button', { name: /Get Started/i })).toBeDisabled();
    });

    it('should auto-select when only one manager is returned', async () => {
        const singleManager = [mockManagersResponse[0]];
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue(singleManager);

        render(<Onboarding onComplete={mockOnComplete} />);
        await completeStep1();
        await completeStep2();

        // Manager should be auto-selected, so Get Started should be enabled
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Get Started/i })).not.toBeDisabled();
        });
    });

    // --- Submission ---

    it('should submit form with email and selected manager, then call onComplete', async () => {
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue(mockManagersResponse);
        (restaurantAPI.create as any).mockResolvedValue(mockCreateResponse);

        render(<Onboarding onComplete={mockOnComplete} />);

        // Step 1 - About You
        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        fireEvent.change(screen.getByPlaceholderText(/arjun@example\.com/i), { target: { value: 'john@test.com' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Your Restaurant/i })).toBeInTheDocument());

        // Step 2 - Your Restaurant
        await waitFor(() => expect(screen.getByText('Select city')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Select city'));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Bangalore' })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Bangalore' }));
        fireEvent.change(screen.getByPlaceholderText(/The Spice Lounge/i), { target: { value: 'Test Restaurant' } });
        fireEvent.change(screen.getByPlaceholderText(/Modern Indian Fusion/i), { target: { value: 'Italian' } });
        fireEvent.change(screen.getByPlaceholderText(/Indiranagar, Bangalore/i), { target: { value: '1 Main St' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Account Manager/i })).toBeInTheDocument());

        // Step 3 -- select a manager (mandatory now)
        await waitFor(() => expect(screen.getByText('Manager Alpha')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Manager Alpha'));

        fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));

        await waitFor(() => {
            expect(restaurantAPI.create).toHaveBeenCalledWith({
                userName: 'John',
                email: 'john@test.com',
                name: 'Test Restaurant',
                cuisine: 'Italian',
                location: { address: '1 Main St', lat: 0, lng: 0, mapUrl: '' },
                accountManager: {
                    name: 'Manager Alpha',
                    phone: '+91 11111',
                    email: 'a@test.com',
                    avatar: 'https://example.com/a.jpg',
                },
            });
        });

        await waitFor(() => {
            expect(localStorage.setItem).toHaveBeenCalledWith('rp_token', 'new-access-token');
            expect(localStorage.setItem).toHaveBeenCalledWith('rp_refresh_token', 'new-refresh-token');
            expect(localStorage.setItem).toHaveBeenCalledWith('rp_restaurant_id', 'r-new');
            expect(mockOnComplete).toHaveBeenCalledWith(mockCreateResponse.restaurant);
        });
    });

    it('should show error message on submission failure', async () => {
        (restaurantAPI.create as any).mockRejectedValue(new Error('Server error'));
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue(mockManagersResponse);

        render(<Onboarding onComplete={mockOnComplete} />);
        await completeStep1();
        await completeStep2();

        // Select a manager (mandatory)
        await waitFor(() => expect(screen.getByText('Manager Alpha')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Manager Alpha'));

        fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));

        await waitFor(() => {
            expect(screen.getByText(/Server error/i)).toBeInTheDocument();
        });

        expect(mockOnComplete).not.toHaveBeenCalled();
    });

    it('should show loading state during submission', async () => {
        // Make create hang
        (restaurantAPI.create as any).mockImplementation(() => new Promise(() => {}));
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue(mockManagersResponse);

        render(<Onboarding onComplete={mockOnComplete} />);
        await completeStep1();
        await completeStep2();

        // Select a manager (mandatory)
        await waitFor(() => expect(screen.getByText('Manager Alpha')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Manager Alpha'));

        fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));

        await waitFor(() => {
            expect(screen.getByText(/Setting up.../i)).toBeInTheDocument();
        });
    });

    // --- Step indicator ---

    it('should render step indicator with correct labels', () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        expect(screen.getByText('About You')).toBeInTheDocument();
        expect(screen.getByText('Your Restaurant')).toBeInTheDocument();
        expect(screen.getByText('Account Manager')).toBeInTheDocument();
    });

});
