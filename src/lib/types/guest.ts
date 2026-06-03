export interface Guest {
  id: string;
  name: string;
  phone: string;
  email: string;
  companyName: string;
  gstNumber: string;
  preferences: string;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
  totalStays?: number;
  totalSpend?: number;
  lastStayDate?: string;
}
