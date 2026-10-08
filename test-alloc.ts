import { allocateMultiOccupancyPayment } from './utils/multiOccupancyAllocation';

const main = { id: 'main', rentAmount: 0 };
const sub02 = { id: 'sub02', rentAmount: 1000, paymentHistory: [], onboardingDate: '2026-05-01' };
const sub03 = { id: 'sub03', rentAmount: 1000, paymentHistory: [], onboardingDate: '2026-05-01' };
const sub19 = { id: 'sub19', rentAmount: 1500, paymentHistory: [], onboardingDate: '2026-05-01' };

// wait, the arrears for sub02 is 300? So it means sub02 was invoiced 1000 for May, and paid 700?
