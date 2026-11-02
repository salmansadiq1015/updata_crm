import { CompanyPage } from '@/components/company/company-page';
import { companyMetadata } from '@/components/company/company-metadata';

export async function generateMetadata() { return companyMetadata('privacy'); }

export default function Page() { return <CompanyPage page="privacy" />; }
