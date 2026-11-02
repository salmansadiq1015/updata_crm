import { CompanyPage } from '@/components/company/company-page';
import { companyMetadata } from '@/components/company/company-metadata';

export async function generateMetadata() { return companyMetadata('terms'); }

export default function Page() { return <CompanyPage page="terms" />; }
