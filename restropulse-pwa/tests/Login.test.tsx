import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './utils/test-utils';
import Login from '../components/Login';

describe('Login Component', () => {
    const mockOnLogin = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render login options', () => {
        render(<Login onLogin={mockOnLogin} />);

        expect(screen.getByText(/Continue with WhatsApp/i)).toBeInTheDocument();
        expect(screen.getByText(/Continue with Instagram/i)).toBeInTheDocument();
        expect(screen.getByText(/RestroPulse/i)).toBeInTheDocument();
    });

    it('should handle WhatsApp login', async () => {
        mockOnLogin.mockResolvedValueOnce(undefined);

        render(<Login onLogin={mockOnLogin} />);

        const whatsappButton = screen.getByText(/Continue with WhatsApp/i);
        fireEvent.click(whatsappButton);

        await waitFor(() => {
            expect(mockOnLogin).toHaveBeenCalledWith('arjun@spicelounge.com', 'demo123');
        });
    });

    it('should handle Instagram login', async () => {
        mockOnLogin.mockResolvedValueOnce(undefined);

        render(<Login onLogin={mockOnLogin} />);

        const instagramButton = screen.getByText(/Continue with Instagram/i);
        fireEvent.click(instagramButton);

        await waitFor(() => {
            expect(mockOnLogin).toHaveBeenCalledWith('arjun@spicelounge.com', 'demo123');
        });
    });

    it('should show error message on failed login', async () => {
        mockOnLogin.mockRejectedValueOnce(new Error('Login failed'));

        render(<Login onLogin={mockOnLogin} />);

        const whatsappButton = screen.getByText(/Continue with WhatsApp/i);
        fireEvent.click(whatsappButton);

        await waitFor(() => {
            expect(screen.getByText(/Login failed/i)).toBeInTheDocument();
        });
    });

    it('should disable buttons during login', async () => {
        mockOnLogin.mockImplementation(() =>
            new Promise(resolve => setTimeout(resolve, 100))
        );

        render(<Login onLogin={mockOnLogin} />);

        const whatsappButton = screen.getByText(/Continue with WhatsApp/i).closest('button');
        const instagramButton = screen.getByText(/Continue with Instagram/i).closest('button');

        fireEvent.click(whatsappButton!);

        expect(whatsappButton).toBeDisabled();
        expect(instagramButton).toBeDisabled();
    });
});
