import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './utils/test-utils';
import Onboarding from '../components/Onboarding';
import { restaurantAPI, accountManagerAPI } from '../api';

// Mock API modules
vi.mock('../api', () => ({
    restaurantAPI: {
        create: vi.fn(),
    },
    accountManagerAPI: {
        getByCityAndZone: vi.fn(),
    },
}));

// Mock @react-google-maps/api -- render children directly without real Maps
vi.mock('@react-google-maps/api', () => ({
    useLoadScript: vi.fn(() => ({ isLoaded: false })),
    GoogleMap: ({ children }: any) => <div data-testid="google-map">{children}</div>,
    Autocomplete: ({ children }: any) => <div data-testid="autocomplete">{children}</div>,
    Marker: () => <div data-testid="marker" />,
}));

const mockOnComplete = vi.fn();

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

describe('Onboarding Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (localStorage.getItem as any).mockReturnValue(null);
    });

    // --- Step 1: User Details ---

    it('should render step 1 with user name input', () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        expect(screen.getByText(/Welcome to RestroPulse/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Arjun Mehta/i)).toBeInTheDocument();
    });

    it('should disable Next button when name is too short', () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        const nextBtn = screen.getByRole('button', { name: /Next/i });
        expect(nextBtn).toBeDisabled();

        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'A' } });
        expect(nextBtn).toBeDisabled();
    });

    it('should enable Next button with valid name', () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John Doe' } });
        expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
    });

    // --- Step Navigation ---

    it('should navigate from step 1 to step 2', async () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John Doe' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));

        await waitFor(() => {
            expect(screen.getByText(/Restaurant Details/i)).toBeInTheDocument();
        });
    });

    it('should navigate back from step 2 to step 1', async () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        // Go to step 2
        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));

        await waitFor(() => {
            expect(screen.getByText(/Restaurant Details/i)).toBeInTheDocument();
        });

        // Go back
        fireEvent.click(screen.getByRole('button', { name: /Back/i }));

        await waitFor(() => {
            expect(screen.getByText(/Welcome to RestroPulse/i)).toBeInTheDocument();
        });
    });

    it('should not show Back button on step 1', () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        expect(screen.queryByRole('button', { name: /Back/i })).not.toBeInTheDocument();
    });

    // --- Step 2: Restaurant Details ---

    it('should disable Next on step 2 when fields are empty', async () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        // Navigate to step 2
        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));

        await waitFor(() => {
            expect(screen.getByText(/Restaurant Details/i)).toBeInTheDocument();
        });

        expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    });

    it('should enable Next on step 2 with valid restaurant data', async () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        // Navigate to step 2
        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));

        await waitFor(() => {
            expect(screen.getByText(/Restaurant Details/i)).toBeInTheDocument();
        });

        fireEvent.change(screen.getByPlaceholderText(/The Spice Lounge/i), { target: { value: 'My Restaurant' } });
        fireEvent.change(screen.getByPlaceholderText(/Modern Indian Fusion/i), { target: { value: 'Italian' } });

        expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
    });

    // --- Step 3: Location (fallback mode, no Maps API key) ---

    it('should show manual address input when Maps API key is not set', async () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        // Navigate to step 3
        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByText(/Restaurant Details/i)).toBeInTheDocument());

        fireEvent.change(screen.getByPlaceholderText(/The Spice Lounge/i), { target: { value: 'My Restaurant' } });
        fireEvent.change(screen.getByPlaceholderText(/Modern Indian Fusion/i), { target: { value: 'Italian' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Location/i })).toBeInTheDocument();
        });

        expect(screen.getByPlaceholderText(/Indiranagar, Bangalore/i)).toBeInTheDocument();
        expect(screen.getByText(/Google Maps API key not configured/i)).toBeInTheDocument();
    });

    // --- Step 4: Account Manager ---

    it('should render city dropdown and fetch managers on selection', async () => {
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue(mockManagersResponse);

        render(<Onboarding onComplete={mockOnComplete} />);

        // Navigate to step 4
        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByText(/Restaurant Details/i)).toBeInTheDocument());

        fireEvent.change(screen.getByPlaceholderText(/The Spice Lounge/i), { target: { value: 'My Rest' } });
        fireEvent.change(screen.getByPlaceholderText(/Modern Indian Fusion/i), { target: { value: 'Italian' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Location/i })).toBeInTheDocument());

        fireEvent.change(screen.getByPlaceholderText(/Indiranagar, Bangalore/i), { target: { value: '1 Main St' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: /Account Manager/i })).toBeInTheDocument();
        });

        // Select city
        const citySelect = screen.getAllByRole('combobox')[0];
        fireEvent.change(citySelect, { target: { value: 'Bangalore' } });

        await waitFor(() => {
            expect(accountManagerAPI.getByCityAndZone).toHaveBeenCalledWith('Bangalore', undefined);
        });
    });

    it('should show manager cards after city selection', async () => {
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue(mockManagersResponse);

        render(<Onboarding onComplete={mockOnComplete} />);

        // Fast-track to step 4
        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByText(/Restaurant Details/i)).toBeInTheDocument());

        fireEvent.change(screen.getByPlaceholderText(/The Spice Lounge/i), { target: { value: 'My Rest' } });
        fireEvent.change(screen.getByPlaceholderText(/Modern Indian Fusion/i), { target: { value: 'Italian' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Location/i })).toBeInTheDocument());

        fireEvent.change(screen.getByPlaceholderText(/Indiranagar, Bangalore/i), { target: { value: '1 Main St' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Account Manager/i })).toBeInTheDocument());

        const citySelect = screen.getAllByRole('combobox')[0];
        fireEvent.change(citySelect, { target: { value: 'Bangalore' } });

        await waitFor(() => {
            expect(screen.getByText('Manager Alpha')).toBeInTheDocument();
            expect(screen.getByText('Manager Beta')).toBeInTheDocument();
        });
    });

    it('should show "no managers" message when none found', async () => {
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue([]);

        render(<Onboarding onComplete={mockOnComplete} />);

        // Fast-track to step 4
        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByText(/Restaurant Details/i)).toBeInTheDocument());

        fireEvent.change(screen.getByPlaceholderText(/The Spice Lounge/i), { target: { value: 'My Rest' } });
        fireEvent.change(screen.getByPlaceholderText(/Modern Indian Fusion/i), { target: { value: 'Italian' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Location/i })).toBeInTheDocument());

        fireEvent.change(screen.getByPlaceholderText(/Indiranagar, Bangalore/i), { target: { value: 'addr' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Account Manager/i })).toBeInTheDocument());

        const citySelect = screen.getAllByRole('combobox')[0];
        fireEvent.change(citySelect, { target: { value: 'Bangalore' } });

        await waitFor(() => {
            expect(screen.getByText(/No account managers found/i)).toBeInTheDocument();
        });
    });

    // --- Submission ---

    it('should submit form and call onComplete on success', async () => {
        (accountManagerAPI.getByCityAndZone as any).mockResolvedValue([]);
        (restaurantAPI.create as any).mockResolvedValue(mockCreateResponse);

        render(<Onboarding onComplete={mockOnComplete} />);

        // Step 1
        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByText(/Restaurant Details/i)).toBeInTheDocument());

        // Step 2
        fireEvent.change(screen.getByPlaceholderText(/The Spice Lounge/i), { target: { value: 'Test Restaurant' } });
        fireEvent.change(screen.getByPlaceholderText(/Modern Indian Fusion/i), { target: { value: 'Italian' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Location/i })).toBeInTheDocument());

        // Step 3
        fireEvent.change(screen.getByPlaceholderText(/Indiranagar, Bangalore/i), { target: { value: '1 Main St' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Account Manager/i })).toBeInTheDocument());

        // Step 4 -- click Get Started (no manager selected is fine)
        fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));

        await waitFor(() => {
            expect(restaurantAPI.create).toHaveBeenCalledWith({
                userName: 'John',
                name: 'Test Restaurant',
                cuisine: 'Italian',
                location: { address: '1 Main St', lat: 0, lng: 0, mapUrl: '' },
                accountManager: { name: '', phone: '', email: '', avatar: '' },
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

        render(<Onboarding onComplete={mockOnComplete} />);

        // Fast-track to step 4
        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByText(/Restaurant Details/i)).toBeInTheDocument());

        fireEvent.change(screen.getByPlaceholderText(/The Spice Lounge/i), { target: { value: 'My Rest' } });
        fireEvent.change(screen.getByPlaceholderText(/Modern Indian Fusion/i), { target: { value: 'Italian' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Location/i })).toBeInTheDocument());

        fireEvent.change(screen.getByPlaceholderText(/Indiranagar, Bangalore/i), { target: { value: 'addr' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Account Manager/i })).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));

        await waitFor(() => {
            expect(screen.getByText(/Server error/i)).toBeInTheDocument();
        });

        expect(mockOnComplete).not.toHaveBeenCalled();
    });

    it('should show loading state during submission', async () => {
        // Make create hang
        (restaurantAPI.create as any).mockImplementation(() => new Promise(() => {}));

        render(<Onboarding onComplete={mockOnComplete} />);

        // Fast-track to step 4
        fireEvent.change(screen.getByPlaceholderText(/Arjun Mehta/i), { target: { value: 'John' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByText(/Restaurant Details/i)).toBeInTheDocument());

        fireEvent.change(screen.getByPlaceholderText(/The Spice Lounge/i), { target: { value: 'My Rest' } });
        fireEvent.change(screen.getByPlaceholderText(/Modern Indian Fusion/i), { target: { value: 'Italian' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Location/i })).toBeInTheDocument());

        fireEvent.change(screen.getByPlaceholderText(/Indiranagar, Bangalore/i), { target: { value: 'addr' } });
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
        await waitFor(() => expect(screen.getByRole('heading', { name: /Account Manager/i })).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));

        await waitFor(() => {
            expect(screen.getByText(/Setting up.../i)).toBeInTheDocument();
        });
    });

    // --- Step indicator ---

    it('should render step indicator with correct labels', () => {
        render(<Onboarding onComplete={mockOnComplete} />);

        expect(screen.getByText('Your Details')).toBeInTheDocument();
        expect(screen.getByText('Restaurant')).toBeInTheDocument();
        expect(screen.getByText('Location')).toBeInTheDocument();
        expect(screen.getByText('Account Manager')).toBeInTheDocument();
    });
});
