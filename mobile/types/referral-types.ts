export interface ReferralItem {
  id: string;
  referrerId: string;
  referredId: string;
  bonusGranted: boolean;
  createdAt: string;
}

export interface ReferralStats {
  referralCode: string;
  totalReferrals: number;
  bonusEarned: number;
  referrals: ReferralItem[];
}
