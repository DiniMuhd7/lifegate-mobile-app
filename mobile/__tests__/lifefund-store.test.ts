import { LifeFundService } from '../services/lifefund-service';
import { useLifeFundStore } from '../stores/lifefund-store';

jest.mock('../services/lifefund-service', () => ({
  LifeFundService: {
    submitRequest: jest.fn(),
  },
}));

const mockSubmitRequest = LifeFundService.submitRequest as jest.Mock;

describe('LifeFund request submission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLifeFundStore.setState({ error: null, submitting: false, requests: [], activeRequest: null });
  });

  it('shows the LifeFund validation message returned with a 422 response', async () => {
    mockSubmitRequest.mockRejectedValue({
      response: {
        status: 422,
        data: { message: 'Requested amount exceeds your current available limit of 10000.00.' },
      },
    });

    const result = await useLifeFundStore.getState().submitRequest({
      expenseCategory: 'HOSPITAL_BILL',
      healthcareProviderName: 'LifeGate Hospital',
      requestedAmount: 12000,
    });

    expect(result).toBeNull();
    expect(useLifeFundStore.getState().error).toBe(
      'Requested amount exceeds your current available limit of 10000.00.'
    );
    expect(useLifeFundStore.getState().submitting).toBe(false);
  });

  it('shows helpful guidance when a 422 response has no backend message', async () => {
    mockSubmitRequest.mockRejectedValue({
      message: 'Request failed with status code 422',
      response: { status: 422, data: {} },
    });

    await useLifeFundStore.getState().submitRequest({
      expenseCategory: 'HOSPITAL_BILL',
      healthcareProviderName: 'LifeGate Hospital',
      requestedAmount: 12000,
    });

    expect(useLifeFundStore.getState().error).toBe(
      'We could not submit your LifeFund request. Check that your phone number is saved, the amount is within your available limit, and you do not already have a request in progress.'
    );
  });
});
