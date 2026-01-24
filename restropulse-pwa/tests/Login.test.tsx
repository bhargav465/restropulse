import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './utils/test-utils';
import Login from '../components/Login';

// Mock fetch for OTP API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Login Component', () => {
    const mockOnLogin = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockReset();
    });

    it('should render phone input form', () => {
        render(<Login onLogin={mockOnLogin} />);

        expect(screen.getByText(/RestroPulse/i)).toBeInTheDocument();
        expect(screen.getByText(/Enter your phone number/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/98765 43210/i)).toBeInTheDocument();
        expect(screen.getByText(/Get OTP/i)).toBeInTheDocument();
    });

    it('should validate phone number length', () => {
        render(<Login onLogin={mockOnLogin} />);

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        const submitButton = screen.getByText(/Get OTP/i).closest('button');

        // Button should be disabled with empty phone
        expect(submitButton).toBeDisabled();

        // Enter partial phone number
        fireEvent.change(phoneInput, { target: { value: '98765' } });
        expect(submitButton).toBeDisabled();

        // Enter full phone number
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });
        expect(submitButton).not.toBeDisabled();
    });

    it('should send OTP when phone is valid', async () => {
        mockFetch.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: true, devOtp: '123456' })
        });
        mockOnLogin.mockResolvedValueOnce(undefined);

        render(<Login onLogin={mockOnLogin} />);

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });

        const submitButton = screen.getByText(/Get OTP/i).closest('button');
        fireEvent.click(submitButton!);

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/auth/send-otp'),
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ phone: '+919876543210' })
                })
            );
        });
    });

    it('should show OTP input after sending OTP', async () => {
        mockFetch.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: true })
        });

        render(<Login onLogin={mockOnLogin} />);

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });

        const submitButton = screen.getByText(/Get OTP/i).closest('button');
        fireEvent.click(submitButton!);

        await waitFor(() => {
            expect(screen.getByText(/Enter the code sent to/i)).toBeInTheDocument();
            expect(screen.getByText(/Change number/i)).toBeInTheDocument();
        });
    });

    it('should show error message on failed OTP send', async () => {
        mockFetch.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: false, message: 'Failed to send OTP' })
        });

        render(<Login onLogin={mockOnLogin} />);

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });

        const submitButton = screen.getByText(/Get OTP/i).closest('button');
        fireEvent.click(submitButton!);

        await waitFor(() => {
            expect(screen.getByText(/Failed to send OTP/i)).toBeInTheDocument();
        });
    });

    it('should auto-fill and verify OTP in dev mode (silent login)', async () => {
        mockFetch.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: true, devOtp: '123456' })
        });
        mockOnLogin.mockResolvedValueOnce(undefined);

        render(<Login onLogin={mockOnLogin} />);

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });

        const submitButton = screen.getByText(/Get OTP/i).closest('button');
        fireEvent.click(submitButton!);

        // In dev mode, OTP is auto-filled and auto-verified
        await waitFor(() => {
            expect(mockOnLogin).toHaveBeenCalledWith('+919876543210', '123456');
        }, { timeout: 1000 });
    });

    it('should disable button during OTP send', async () => {
        mockFetch.mockImplementation(() =>
            new Promise(resolve => setTimeout(() => resolve({
                json: () => Promise.resolve({ success: true })
            }), 100))
        );

        render(<Login onLogin={mockOnLogin} />);

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });

        const submitButton = screen.getByText(/Get OTP/i).closest('button');
        fireEvent.click(submitButton!);

        expect(submitButton).toBeDisabled();
        expect(screen.getByText(/Sending OTP/i)).toBeInTheDocument();
    });
});
