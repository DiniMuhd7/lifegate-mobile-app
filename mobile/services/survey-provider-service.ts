/**
 * SurveyProviderService
 *
 * Abstracts integration with real sponsored-survey monetisation providers.
 * Each provider is used by major reward apps to serve brand-commissioned surveys.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * PROVIDER OVERVIEW
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * 1. Pollfish  (pollfish.com)
 *    - Largest mobile survey network; used by Fortune-500 brands.
 *    - Native SDK: react-native-pollfish (requires bare/dev-client workflow).
 *    - Payment: CPIs ranging $0.50–$3 per completion paid to developer.
 *    - To activate: sign up at pollfish.com → create app → get API Key.
 *
 * 2. InBrain Surveys  (inbrain.ai)
 *    - Built specifically for reward/loyalty apps; pays in virtual currency.
 *    - React Native SDK: `inbrain-surveys` npm package.
 *    - Payment: revenue share on each completion, wired monthly.
 *    - To activate: sign up at inbrain.ai → create placement → get clientId/secret.
 *
 * 3. BitLabs  (bitlabs.ai)
 *    - Premium survey inventory; integrates via WebView or REST API.
 *    - Works in Expo managed workflow via WebView (no native module required).
 *    - Payment: CPI model, typically $0.20–$2 per completion.
 *    - To activate: sign up at bitlabs.ai → get App Token.
 *
 * 4. Tap Research  (tapresearch.com)
 *    - Powers surveys in Swagbucks, InboxDollars, and 300+ reward apps.
 *    - SDK available; also supports WebView wall via a hosted URL.
 *    - Payment: revenue share, pays NET-30 via PayPal/wire.
 *    - To activate: partner.tapresearch.com → register app → get API Key.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * In production, replace the mock implementations below with the real SDK calls
 * shown in the comments. The store layer (survey-store.ts) remains unchanged.
 */

export interface ProviderSurveyResult {
  surveyId: string;
  completed: boolean;
  coinsEarned: number;
}

// ── Provider configs (set from your app's .env / config) ─────────────────────

export const PROVIDER_CONFIG = {
  pollfish: {
    apiKey: process.env.POLLFISH_API_KEY ?? 'REPLACE_WITH_POLLFISH_API_KEY',
    // SDK usage (bare workflow):
    // import Pollfish from 'react-native-pollfish';
    // Pollfish.init({ apiKey: PROVIDER_CONFIG.pollfish.apiKey, rewardMode: true });
    // Pollfish.setEventCallback('onSurveyCompleted', (reward) => { /* award coins */ });
  },
  inbrain: {
    clientId: process.env.INBRAIN_CLIENT_ID ?? 'REPLACE_WITH_INBRAIN_CLIENT_ID',
    clientSecret: process.env.INBRAIN_CLIENT_SECRET ?? 'REPLACE_WITH_INBRAIN_CLIENT_SECRET',
    // SDK usage:
    // import InBrain from 'inbrain-surveys';
    // await InBrain.init(clientId, clientSecret);
    // await InBrain.showSurveys();
    // InBrain.setOnSurveysClose((rewards) => { /* award coins */ });
  },
  bitlabs: {
    appToken: process.env.BITLABS_APP_TOKEN ?? 'REPLACE_WITH_BITLABS_APP_TOKEN',
    // WebView usage (Expo compatible):
    // const url = `https://web.bitlabs.ai?token=${appToken}&uid=${userId}`;
    // Open in <WebView source={{ uri: url }} onNavigationStateChange={handleNav} />
    // Detect completion via URL: url.includes('close') → award coins
  },
  tapresearch: {
    apiKey: process.env.TAPRESEARCH_API_KEY ?? 'REPLACE_WITH_TAPRESEARCH_API_KEY',
    // WebView wall usage:
    // const url = `https://offers.tapresearch.com/survey_wall?api_token=${apiKey}&user_id=${userId}`;
    // Open in <WebView /> and listen for postMessage reward callbacks
  },
};

// ── Service ──────────────────────────────────────────────────────────────────

class SurveyProviderServiceClass {
  /**
   * Called when a user submits a sponsored survey in-app.
   * In production, this is where you confirm completion with the provider's API
   * and receive the payout confirmation before awarding Lifecoins.
   */
  async confirmCompletion(
    provider: string,
    surveyId: string,
    userId: string,
    coins: number,
  ): Promise<ProviderSurveyResult> {
    // ── PRODUCTION EXAMPLES ──────────────────────────────────────────────
    //
    // Pollfish: completion is event-driven via native SDK callback.
    //   No HTTP confirmation needed; reward is triggered by onSurveyCompleted.
    //
    // InBrain: completion fires via InBrain.setOnSurveysClose callback.
    //   rewards[].amount gives the reward value.
    //
    // BitLabs: confirm via REST:
    //   GET https://api.bitlabs.ai/v1/client/actions?app_token=TOKEN&uid=UID
    //   Returns an array of completed actions with reward amounts.
    //
    // Tap Research: listen for postMessage from WebView wall:
    //   event.data === JSON.stringify({ type: 'survey_complete', reward: N })
    //
    // ── MOCK (remove in production) ───────────────────────────────────────
    console.log(`[SurveyProvider] ${provider} survey ${surveyId} completed by ${userId}`);
    return { surveyId, completed: true, coinsEarned: coins };
  }

  /**
   * Fetch live sponsored surveys from a provider's API.
   * Currently returns an empty array — wire up real endpoints in production.
   */
  async fetchLiveSurveys(_provider: string, _userId: string): Promise<[]> {
    // Example for BitLabs:
    // const res = await fetch(
    //   `https://api.bitlabs.ai/v1/client/check-surveys?app_token=${PROVIDER_CONFIG.bitlabs.appToken}&uid=${_userId}`
    // );
    // const data = await res.json();
    // return data.surveys ?? [];
    return [];
  }
}

export const SurveyProviderService = new SurveyProviderServiceClass();
