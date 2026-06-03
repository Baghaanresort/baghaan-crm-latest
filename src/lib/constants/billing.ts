export interface BankDetails {
  name: string;
  branch: string;
  accountType: string;
  accountNo: string;
  ifsc: string;
}

export interface BillingEntity {
  name: string;
  address: string;
  corpOffice: string;
  phones: string;
  gst: string;
  payeeName: string;
  bank: BankDetails;
}

export const BILLING_ENTITIES: Record<string, BillingEntity> = {
  baghaan: {
    name: 'Baghaan Orchard Retreat',
    address: 'Bulandshahar, Siyana, Village - Kachrot, Uttar Pradesh',
    corpOffice: 'A-20, Sector-35, Noida - 201301',
    phones: '07599053402, 09410083460',
    gst: '09AADCM6620L1Z8',
    payeeName: 'Magka Imaging & Technology Company Pvt. Ltd.',
    bank: {
      name: 'HDFC BANK',
      branch: 'Shop No. 8, ATS ONE HAMLET, Sector 104, Noida-201301',
      accountType: 'Current',
      accountNo: '50200017569820',
      ifsc: 'HDFC0004394',
    },
  },
};
