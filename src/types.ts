export interface Wallet {
    address: string;
    riskScore?: number;
    blocked?: boolean;
    isExternal: boolean;
}

export interface Transcation {
    sender: string;
    receiver: string;
    amount: number;
    rejected?: boolean;
    approved?: boolean;
    rejectionReason?: string;
}

export interface Context {
    receiver: Wallet;
    sender: Wallet;
    transcation?: Transcation;
    totalRisk?: number;
}