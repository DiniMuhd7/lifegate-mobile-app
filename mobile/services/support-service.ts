import api from './api';
import { extractErrorMessage } from '../utils/error-utils';

export type ContactSupportPayload = {
	contactName?: string;
	contactEmail: string;
	lifeGateId?: string;
	issueType: string;
	description: string;
};

export type ContactSupportResponse = {
	success: boolean;
	message: string;
	data?: {
		referenceId: string;
	};
};

export const SupportService = {
	async contactSupport(payload: ContactSupportPayload): Promise<ContactSupportResponse> {
		try {
			const response = await api.post<ContactSupportResponse>('/support/contact', payload);
			return response.data;
		} catch (error: unknown) {
			return {
				success: false,
				message: extractErrorMessage(error),
			};
		}
	},
};