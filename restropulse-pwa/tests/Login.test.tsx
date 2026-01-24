import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from './utils/test-utils';
import Login from '../components/Login';
import * as firebase from '../firebase';

// Mock fetch for OTP API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Firebase module
vi.mock('../firebase', () => ({
    initRecaptcha: vi.fn(),
    sendOTP: vi.fn(),
    verifyOTP: vi.fn(),
    auth: {
        currentUser: null,
    },
}));

describe('Login Component', () => {
    const mockOnLogin = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockFetch.mockReset();
        // Ensure recaptcha verifier is truthy for Firebase tests
        (firebase.initRecaptcha as any).mockReturnValue('mock-verifier');
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

        const mockFallbackLogin = vi.fn().mockResolvedValueOnce(undefined);

        render(<Login onLogin={mockOnLogin} onFallbackLogin={mockFallbackLogin} />);

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });

        const submitButton = screen.getByText(/Get OTP/i).closest('button');
        fireEvent.click(submitButton!);

        // In dev mode, OTP is auto-filled and auto-verified using fallback login
        await waitFor(() => {
            expect(mockFallbackLogin).toHaveBeenCalledWith('+919876543210', '123456');
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

    it('should handle OTP input changes and auto-focus', async () => {
        mockFetch.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: true })
        });

        render(<Login onLogin={mockOnLogin} />);

        // Go to OTP step
        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });
        fireEvent.click(screen.getByText(/Get OTP/i).closest('button')!);

        await waitFor(() => {
            expect(screen.getByText(/Enter the code sent to/i)).toBeInTheDocument();
        });

        const input0 = screen.getByLabelText('OTP digit 1');
        const input1 = screen.getByLabelText('OTP digit 2');

        fireEvent.change(input0, { target: { value: '1' } });
        expect(input0).toHaveValue('1');
        expect(input1).toHaveFocus();
    });

    it('should handle backspace in OTP input', async () => {
        mockFetch.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: true })
        });

        render(<Login onLogin={mockOnLogin} />);

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });
        fireEvent.click(screen.getByText(/Get OTP/i).closest('button')!);
        await waitFor(() => screen.getByLabelText('OTP digit 1'));

        const input0 = screen.getByLabelText('OTP digit 1');
        const input1 = screen.getByLabelText('OTP digit 2');

        // Type in first two
        fireEvent.change(input0, { target: { value: '1' } });
        fireEvent.change(input1, { target: { value: '2' } });

        // Focus moves to next input (digit 3)
        const input2 = screen.getByLabelText('OTP digit 3');
        expect(input2).toHaveFocus();

        // User focuses input 2 (index 1) manually to edit
        input1.focus();

        // Clear and wait for update
        fireEvent.change(input1, { target: { value: '' } });
        await waitFor(() => expect(input1).toHaveValue(''));

        // Now backspace
        fireEvent.keyDown(input1, { key: 'Backspace' });

        expect(input0).toHaveFocus();
    });

    it('should verify OTP when all digits entered', async () => {
        mockFetch.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) });
        const mockFallbackLogin = vi.fn().mockResolvedValue(undefined);

        render(<Login onLogin={mockOnLogin} onFallbackLogin={mockFallbackLogin} />);

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });
        fireEvent.click(screen.getByText(/Get OTP/i).closest('button')!);
        await waitFor(() => screen.getByLabelText('OTP digit 1'));

        const inputs = screen.getAllByRole('textbox', { name: /OTP digit/i });

        // Fill 1-5
        for (let i = 0; i < 5; i++) {
            fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
        }

        // Fill 6th - should trigger verify
        fireEvent.change(inputs[5], { target: { value: '6' } });

        await waitFor(() => {
            expect(mockFallbackLogin).toHaveBeenCalledWith('+919876543210', '123456');
        });
    });

    it('should allow changing number', async () => {
        mockFetch.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) });
        render(<Login onLogin={mockOnLogin} />);

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });
        fireEvent.click(screen.getByText(/Get OTP/i).closest('button')!);
        await waitFor(() => screen.getByText(/Change number/i));

        fireEvent.click(screen.getByText(/Change number/i));

        expect(screen.getByText(/Enter your phone number/i)).toBeInTheDocument();
    });

    it('should handle paste of OTP', async () => {
        mockFetch.mockResolvedValueOnce({ json: () => Promise.resolve({ success: true }) });
        const mockFallbackLogin = vi.fn().mockResolvedValue(undefined);

        render(<Login onLogin={mockOnLogin} onFallbackLogin={mockFallbackLogin} />);

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });
        fireEvent.click(screen.getByText(/Get OTP/i).closest('button')!);
        await waitFor(() => screen.getByLabelText('OTP digit 1'));

        const digitsDiv = screen.getByLabelText('OTP digit 1').closest('div');

        // Simulate paste
        const clipboardEvent = createClipboardEvent('123456');
        fireEvent.paste(digitsDiv!, clipboardEvent);

        await waitFor(() => {
            expect(mockFallbackLogin).toHaveBeenCalledWith('+919876543210', '123456');
        });
    });

    it('should handle Firebase quota error and fallback to dev OTP', async () => {
        // Force Firebase mode
        vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key');

        // Setup Firebase sendOTP failure
        const error = new Error('Quota exceeded');
        (error as any).code = 'auth/quota-exceeded';
        (firebase.sendOTP as any).mockRejectedValueOnce(error);

        // Fallback fetch setup
        mockFetch.mockResolvedValueOnce({
            json: () => Promise.resolve({ success: true })
        });

        render(<Login onLogin={mockOnLogin} />);

        // Wait for reCAPTCHA init (100ms delay in component)
        await new Promise(resolve => setTimeout(resolve, 200));

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });
        fireEvent.click(screen.getByText(/Get OTP/i).closest('button')!);

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/auth/send-otp'),
                expect.anything()
            );
            expect(screen.getByText(/Enter the code sent to/i)).toBeInTheDocument();
        });

        vi.unstubAllEnvs();
    });

    it('should handle verify OTP error (invalid code)', async () => {
        vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key');

        (firebase.sendOTP as any).mockResolvedValueOnce(undefined);

        const error = new Error('Invalid code');
        (error as any).code = 'auth/invalid-verification-code';
        (firebase.verifyOTP as any).mockRejectedValueOnce(error);

        render(<Login onLogin={mockOnLogin} />);

        // Wait for reCAPTCHA init (100ms delay in component)
        await new Promise(resolve => setTimeout(resolve, 200));

        const phoneInput = screen.getByPlaceholderText(/98765 43210/i);
        fireEvent.change(phoneInput, { target: { value: '9876543210' } });
        fireEvent.click(screen.getByText(/Get OTP/i).closest('button')!);

        await waitFor(() => screen.getByLabelText('OTP digit 1'));

        const inputs = screen.getAllByRole('textbox', { name: /OTP digit/i });
        for (let i = 0; i < 6; i++) {
            fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
        }

        await waitFor(() => {
            expect(screen.getByText('Invalid OTP. Please check and try again.')).toBeInTheDocument();
        });

        vi.unstubAllEnvs();
    });
});

// Helper for paste event
function createClipboardEvent(text: string) {
    return {
        clipboardData: {
            getData: () => text
        },
        preventDefault: vi.fn()
    };
}
