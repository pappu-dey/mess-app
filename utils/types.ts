// types.ts - Type definitions for deposits
export type Member = {
    id: string;
    name: string;
    email: string;
    role: string;
};

export type Deposit = {
    id: string;
    amount: number;
    memberId: string;
    memberName: string;
    date: string;
    edited: boolean;
    createdAt: Date;
    updatedAt?: Date;
    type: string;
};

export type SnackbarType = "success" | "error";